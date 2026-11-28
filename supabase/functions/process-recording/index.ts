import { createClient } from 'npm:@supabase/supabase-js@2';
import { parseVoiceCommands } from '../_shared/parse/commands.ts';
import { cleanLongText } from '../_shared/parse/long-text.ts';
import {
  buildExtractionMessages,
  buildSummaryMessages,
  normalizeSummary,
  shouldSummarize,
  summaryToNote,
  decideFreeRecording,
  extractItems,
  localTimestamp,
  mergeSpokenOffsets,
  normalizeExtraction,
  PRO_MAX_SECONDS_PER_RECORDING,
  RECORDINGS_BEFORE_PAYWALL,
  safeTimeZone,
  zonedParts,
  zonedTimeToUtc,
  type FreeLimitDecision,
} from '../_shared/parse/index.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

type Body = {
  recordingId?: string;
  timezone?: string;
  locale?: string;
  now?: string;
  useStoredTranscript?: boolean;
  /** "long" keeps one cleaned note. Older servers ignore this field. */
  mode?: string;
  openItems?: Array<{ id?: string; title?: string; dueAt?: string | null }>;
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const body = (await req.json()) as Body;
    const recordingId = body.recordingId;
    if (!recordingId) return json({ error: 'RECORDING_REQUIRED' }, 400);

    const url = Deno.env.get('SUPABASE_URL') ?? '';
    const anon = Deno.env.get('SUPABASE_ANON_KEY') ?? publishableKey();
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? secretKey();
    const authHeader = req.headers.get('Authorization') ?? '';
    const userClient = createClient(url, anon, { global: { headers: { Authorization: authHeader } } });
    const token = authHeader.replace(/^Bearer\s+/i, '');
    const { data: userData, error: userError } = await userClient.auth.getUser(token);
    if (userError || !userData.user) return json({ error: 'UNAUTHENTICATED' }, 401);
    const userId = userData.user.id;

    const admin = createClient(url, serviceKey);
    const { data: recording, error: recordingError } = await admin
      .from('recordings')
      .select('id, user_id, status, storage_path, transcript, duration_ms')
      .eq('id', recordingId)
      .maybeSingle();
    if (recordingError || !recording || recording.user_id !== userId) {
      return json({ error: 'RECORDING_NOT_FOUND' }, 404);
    }

    await sweepStuck(admin, userId, recordingId).catch(() => undefined);

    const { data: profile } = await admin.from('profiles').select('timezone, locale').eq('id', userId).maybeSingle();
    const blocked = await admin.from('profiles').select('blocked_at').eq('id', userId).maybeSingle();
    if (!blocked.error && blocked.data?.blocked_at) return json({ error: 'BLOCKED' }, 403);
    const timeZone = safeTimeZone(profile?.timezone || body.timezone || 'UTC');
    const locale = resolveLocale(profile?.locale, body.locale);
    // The phone's clock is used only to read "tomorrow at 9" and the like.
    // Limits always use the server clock, so a changed date cannot open a new month.
    const now = body.now ? new Date(body.now) : new Date();
    const serverNow = new Date();
    const isPro = await subscriberIsPro(admin, userId);

    // A little slack over the app's own auto-stop for timer drift.
    if (isPro && Number(recording.duration_ms ?? 0) > (PRO_MAX_SECONDS_PER_RECORDING + 15) * 1000) {
      return await refuse(admin, recordingId, recording.storage_path ?? null, 'seconds');
    }
    if (!isPro) {
      const limits = await readFreeLimits(admin);
      const reason = await freeLimitReason(admin, userId, Number(recording.duration_ms ?? 0), serverNow, timeZone, limits);
      if (reason) return await refuse(admin, recordingId, recording.storage_path ?? null, reason);
    }
    let credit = await reserveCredit(admin, userId, recordingId, isPro, timeZone);
    const replay = credit.state === 'blocked' && credit.reason === 'repeat' && Boolean(recording.transcript);
    if (credit.state === 'blocked' && !replay) {
      if (credit.reason === 'repeat' && recording.status === 'failed') {
        await admin.from('recording_credits').delete().eq('recording_id', recordingId);
        credit = await reserveCredit(admin, userId, recordingId, isPro, timeZone);
      } else if (credit.reason === 'repeat') {
        return json({ error: 'ALREADY_PROCESSED' }, 409);
      } else {
        return await refuse(admin, recordingId, recording.storage_path ?? null, credit.reason);
      }
    }
    // The retry above can still come back blocked. A replay of a stored transcript is allowed.
    if (credit.state === 'blocked' && !replay) {
      if (credit.reason === 'repeat') return json({ error: 'ALREADY_PROCESSED' }, 409);
      return await refuse(admin, recordingId, recording.storage_path ?? null, credit.reason);
    }
    if (credit.state === 'unavailable') {
      await markFailed(admin, recordingId, 'CREDITS_UNAVAILABLE');
      return json({ error: 'CREDITS_UNAVAILABLE', retryable: true, recordingId }, 503);
    }
    const usageLimit = credit.state === 'ok' ? credit.limit : isPro ? 1000 : 25;

    let transcript = '';
    let language: string | null = locale;
    let items;
    let actions: unknown[] = [];
    try {
      if ((body.useStoredTranscript || replay) && recording.transcript) {
        transcript = recording.transcript;
      } else {
        if (!recording.storage_path) throw new Error('AUDIO_NOT_FOUND');
        const sttKey = Deno.env.get('GROQ_API_KEY') || Deno.env.get('OPENAI_API_KEY');
        if (!sttKey) throw new Error('MISSING_PROVIDER_KEY');
        const audio = await admin.storage.from('recordings').download(recording.storage_path);
        if (audio.error || !audio.data) throw new Error('AUDIO_NOT_FOUND');
        const spoken = await transcribe(new Uint8Array(await audio.data.arrayBuffer()));
        // duration_ms is written by the phone. The transcriber's own length is the real one.
        // Same rule as freeLimitReason: a free account's first recordings are never cut short.
        if (spoken.durationSeconds != null) {
          let maxSeconds: number | null = PRO_MAX_SECONDS_PER_RECORDING;
          if (!isPro) {
            // This recording's credit is already reserved, so it is counted once too many.
            const earlier = (await countCreditsSince(admin, userId, null)) - 1;
            maxSeconds = earlier < RECORDINGS_BEFORE_PAYWALL ? null : (await readFreeLimits(admin)).free_max_seconds_per_recording;
          }
          if (maxSeconds != null && spoken.durationSeconds > maxSeconds + 15) {
            await admin.from('recording_credits').delete().eq('recording_id', recordingId);
            return await refuse(admin, recordingId, recording.storage_path ?? null, 'seconds');
          }
        }
        transcript = spoken.text;
        language = spoken.language ?? language;
      }
      if (body.mode !== 'long') {
        const openItems = (body.openItems ?? [])
          .filter((item) => item && typeof item.id === 'string' && typeof item.title === 'string' && item.title.trim())
          .slice(0, 40)
          .map((item) => ({ id: String(item.id), title: String(item.title), dueAt: item.dueAt ?? null }));
        actions = parseVoiceCommands(transcript, openItems, { now, timeZone });
      }
      if (actions.length) {
        items = [];
      } else if (body.mode === 'long') {
        const cleaned = cleanLongText(transcript);
        items = [
          {
            type: 'note' as const,
            title: cleaned.title || transcript.slice(0, 72),
            notes: cleaned.body || transcript,
            dueAt: null,
            allDay: false,
            listName: null,
            reminderOffsets: null,
            repeat: null,
          },
        ];
      } else {
      const summaryPromise =
        isPro && shouldSummarize(Number(recording.duration_ms ?? 0), transcript)
          ? summarizeWithModel(transcript, locale).catch((error) => {
              console.warn('[process-recording] summary failed', error instanceof Error ? error.message : error);
              return null;
            })
          : null;
      try {
        items = await extractWithModel(transcript, now, timeZone, locale);
      } catch (error) {
        if (!(error instanceof Error && error.message === 'MISSING_LLM_KEY')) throw error;
        items = extractItems(transcript, { now, timeZone, locale });
      }
      if (summaryPromise) {
        const summary = await summaryPromise;
        if (summary) items = [summaryToNote(summary), ...items];
      }
      }
    } catch (error) {
      if (replay && recording.transcript) {
        transcript = recording.transcript;
        if (body.mode === 'long') {
          const cleaned = cleanLongText(transcript);
          items = [{ type: 'note' as const, title: cleaned.title || transcript.slice(0, 72), notes: cleaned.body || transcript, dueAt: null, allDay: false, listName: null, reminderOffsets: null, repeat: null }];
        } else {
          items = extractItems(transcript, { now, timeZone, locale });
        }
      } else {
        // The credit comes back. The audio stays so the phone can retry the same take.
        const message = error instanceof Error ? error.message : 'UNKNOWN';
        await admin.from('recording_credits').delete().eq('recording_id', recordingId);
        await markFailed(admin, recordingId, message);
        const status = message === 'AUDIO_NOT_FOUND' ? 404 : message === 'MISSING_PROVIDER_KEY' ? 501 : 500;
        return json({ error: message, retryable: true, recordingId }, status);
      }
    }

    // Repeating items are a Pro feature.
    if (!isPro) items = items.map((item) => ({ ...item, repeat: null }));

    await admin.from('recordings').update({ status: 'ready', transcript, language }).eq('id', recordingId);
    const monthCount = await countCreditsSince(admin, userId, windowStart(serverNow, timeZone, 'month'));
    return json({
      transcript,
      language,
      items,
      actions,
      usage: {
        count: monthCount,
        limit: usageLimit,
        isPro,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'UNKNOWN';
    return json({ error: message }, message === 'CREDITS_UNAVAILABLE' ? 503 : 500);
  }
});

const APP_LOCALES = new Set(['en', 'tr', 'es', 'pt-BR', 'de', 'fr', 'it', 'ja', 'ko', 'id']);

function resolveLocale(profileLocale?: string | null, bodyLocale?: string | null): string {
  return normalizeLocale(bodyLocale) ?? normalizeLocale(profileLocale) ?? 'en';
}

function normalizeLocale(value?: string | null): string | null {
  if (!value) return null;
  const raw = value.trim();
  if (/^pt([-_]|$)/i.test(raw)) return 'pt-BR';
  const key = raw.toLowerCase() === 'pt-br' ? 'pt-BR' : raw.toLowerCase();
  return APP_LOCALES.has(key) ? key : null;
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

type FreeLimits = {
  free_recordings_per_day: number | null;
  free_recordings_per_month: number | null;
  free_max_seconds_per_recording: number | null;
  free_max_items: number | null;
};

const DEFAULT_FREE_LIMITS: FreeLimits = {
  free_recordings_per_day: null,
  free_recordings_per_month: 25,
  free_max_seconds_per_recording: null,
  free_max_items: null,
};

function numberOrNull(value: unknown): number | null {
  if (value == null) return null;
  const number = typeof value === 'number' ? value : Number(value);
  return Number.isInteger(number) && number >= 0 ? number : null;
}

function parseFreeLimits(value: unknown): FreeLimits {
  const record = value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
  return {
    free_recordings_per_day: numberOrNull(record.free_recordings_per_day),
    free_recordings_per_month: 'free_recordings_per_month' in record
      ? numberOrNull(record.free_recordings_per_month)
      : DEFAULT_FREE_LIMITS.free_recordings_per_month,
    free_max_seconds_per_recording: numberOrNull(record.free_max_seconds_per_recording),
    free_max_items: numberOrNull(record.free_max_items),
  };
}

async function readFreeLimits(admin: ReturnType<typeof createClient>): Promise<FreeLimits> {
  const { data, error } = await admin.from('app_settings').select('value').eq('key', 'free_limits').maybeSingle();
  if (error || !data?.value) return DEFAULT_FREE_LIMITS;
  return parseFreeLimits(data.value);
}

function windowStart(now: Date, timeZone: string, kind: 'day' | 'month'): string {
  const parts = zonedParts(now, timeZone);
  return zonedTimeToUtc(
    { year: parts.year, month: parts.month, day: kind === 'month' ? 1 : parts.day, hour: 0, minute: 0 },
    timeZone,
  ).toISOString();
}

/**
 * A recording that produced nothing is removed with its audio, so failed takes never take space.
 * Its credit, if any, is refunded by the caller.
 */
/** Keeps the audio. The phone retries the same recording id. */
async function markFailed(
  admin: ReturnType<typeof createClient>,
  recordingId: string,
  reason: string,
) {
  console.warn('[process-recording] failed', recordingId, reason.slice(0, 120));
  await admin.from('recordings').update({ status: 'failed' }).eq('id', recordingId);
}

async function discardRecording(
  admin: ReturnType<typeof createClient>,
  recordingId: string,
  storagePath: string | null,
  reason: string,
) {
  console.warn('[process-recording] discarded', recordingId, reason.slice(0, 120));
  if (storagePath) await admin.storage.from('recordings').remove([storagePath]).catch(() => undefined);
  await admin.from('recordings').delete().eq('id', recordingId);
}

async function refuse(
  admin: ReturnType<typeof createClient>,
  recordingId: string,
  storagePath: string | null,
  reason: string | null,
) {
  await discardRecording(admin, recordingId, storagePath, 'quota_exceeded');
  return json({ error: 'quota_exceeded', reason }, 402);
}

/**
 * Takes this user left in "processing" for over an hour (the app closed or lost connection
 * mid-request) are cleared: audio, row, and credit.
 */
async function sweepStuck(admin: ReturnType<typeof createClient>, userId: string, currentId: string) {
  const cutoff = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const { data } = await admin
    .from('recordings')
    .select('id, storage_path')
    .eq('user_id', userId)
    .eq('status', 'processing')
    .lt('created_at', cutoff)
    .neq('id', currentId)
    .limit(50);
  for (const row of data ?? []) {
    await admin.from('recording_credits').delete().eq('recording_id', row.id);
    await discardRecording(admin, String(row.id), (row.storage_path as string | null) ?? null, 'stuck');
  }
}

/** Counts from recording_credits, which users cannot delete or edit. */
async function countCreditsSince(
  admin: ReturnType<typeof createClient>,
  userId: string,
  start: string | null,
): Promise<number> {
  let query = admin.from('recording_credits').select('recording_id', { count: 'exact', head: true }).eq('user_id', userId);
  if (start) query = query.gte('created_at', start);
  const { count, error } = await query;
  if (error) throw new Error('CREDITS_UNAVAILABLE');
  return count ?? 0;
}

/** Day, length, and item limits. The monthly cap is checked atomically in reserveCredit. */
async function freeLimitReason(
  admin: ReturnType<typeof createClient>,
  userId: string,
  durationMs: number,
  now: Date,
  timeZone: string,
  limits: FreeLimits,
): Promise<string | null> {
  const ever = await countCreditsSince(admin, userId, null);
  const durationSeconds = Math.floor(durationMs / 1000);
  if (ever < RECORDINGS_BEFORE_PAYWALL) return null;
  const today =
    limits.free_recordings_per_day == null
      ? 0
      : await countCreditsSince(admin, userId, windowStart(now, timeZone, 'day'));
  let itemCount = 0;
  if (limits.free_max_items != null) {
    const { count } = await admin.from('items').select('id', { count: 'exact', head: true }).eq('user_id', userId);
    itemCount = count ?? 0;
  }
  const decision: FreeLimitDecision = decideFreeRecording({
    isPro: false,
    completedEver: ever,
    completedToday: today,
    // Month is enforced by reserve_recording_credit under a row lock.
    completedMonth: 0,
    durationSeconds,
    itemCount,
    limits,
  });
  return decision.allowed ? null : decision.reason;
}

async function reserveCredit(
  admin: ReturnType<typeof createClient>,
  userId: string,
  recordingId: string,
  isPro: boolean,
  timeZone: string,
): Promise<
  | { state: 'ok'; limit: number | null }
  | { state: 'blocked'; reason: string }
  | { state: 'unavailable' }
> {
  const { data, error } = await admin.rpc('reserve_recording_credit', {
    p_user_id: userId,
    p_recording_id: recordingId,
    p_is_pro: isPro,
    p_time_zone: timeZone,
  });
  if (error) return { state: 'unavailable' };
  const row = (data ?? {}) as { allowed?: boolean; reason?: string | null; limit?: number | null };
  if (row.allowed === false) return { state: 'blocked', reason: row.reason ?? 'month' };
  return { state: 'ok', limit: typeof row.limit === 'number' ? row.limit : null };
}

function publishableKey() {
  const raw = Deno.env.get('SUPABASE_PUBLISHABLE_KEYS');
  if (!raw) return '';
  const parsed = JSON.parse(raw) as Record<string, string>;
  return parsed.default ?? Object.values(parsed)[0] ?? '';
}

function secretKey() {
  const raw = Deno.env.get('SUPABASE_SECRET_KEYS');
  if (!raw) return '';
  const parsed = JSON.parse(raw) as Record<string, string>;
  return parsed.default ?? Object.values(parsed)[0] ?? '';
}

function normalizeUntil(value: unknown): string | null {
  if (value == null) return null;
  if (typeof value === 'number') return value === Number.POSITIVE_INFINITY ? 'infinity' : null;
  if (value instanceof Date) return Number.isFinite(value.getTime()) ? value.toISOString() : null;
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed || null;
}

function overrideActive(until: string | null): boolean {
  if (!until) return false;
  const value = until.trim().toLowerCase();
  if (value === 'infinity' || value === '+infinity') return true;
  const time = Date.parse(until);
  return Number.isFinite(time) && time > Date.now();
}

function missingOverrideColumn(error: { code?: string; message?: string }): boolean {
  if (error.code === 'PGRST204' || error.code === '42703') return true;
  const message = error.message ?? '';
  return /pro_override_until/i.test(message) && /schema cache|could not find|does not exist/i.test(message);
}

/** Pro granted by an admin (profiles.pro_override_until), independent of the store. */
async function readGiftUntil(admin: ReturnType<typeof createClient>, userId: string): Promise<string | null> {
  const override = await admin.from('profiles').select('pro_override_until').eq('id', userId).maybeSingle();
  if (override.error) {
    if (!missingOverrideColumn(override.error)) {
      console.warn('[pro] override unread', override.error.code ?? '', (override.error.message ?? '').slice(0, 200));
    }
    return null;
  }
  const raw = override.data ? (override.data as { pro_override_until?: unknown }).pro_override_until : null;
  if (raw != null && typeof raw !== 'string' && typeof raw !== 'number' && !(raw instanceof Date)) {
    console.warn('[pro] override type', typeof raw);
  }
  return normalizeUntil(raw);
}

/**
 * True when the RevenueCat entitlement is active. If RevenueCat cannot be reached
 * after a retry, a paying user must not be locked out, so the request is treated as
 * Pro. The 300-a-month fair-use cap still applies in that case.
 */
async function subscriberIsPro(admin: ReturnType<typeof createClient>, userId: string): Promise<boolean> {
  if (overrideActive(await readGiftUntil(admin, userId))) return true;
  const secret = Deno.env.get('REVENUECAT_SECRET_API_KEY');
  const entitlement = Deno.env.get('REVENUECAT_ENTITLEMENT_ID') ?? 'pro';
  if (!secret) return false;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const response = await fetch(`https://api.revenuecat.com/v1/subscribers/${encodeURIComponent(userId)}`, {
        headers: { Authorization: `Bearer ${secret}` },
        signal: AbortSignal.timeout(4000),
      });
      if (response.status === 404) return false;
      if (!response.ok) continue;
      const payload = await response.json();
      const entry = payload?.subscriber?.entitlements?.[entitlement];
      if (!entry) return false;
      if (!entry.expires_date) return true;
      return new Date(entry.expires_date).getTime() > Date.now();
    } catch {
      // Timeout or network error. Try once more.
    }
  }
  console.warn('[process-recording] RevenueCat unreachable, treating as Pro for this request', userId);
  return true;
}

const STT_ATTEMPTS = 2;
const STT_TIMEOUT_MS = 28_000;

async function transcribe(
  bytes: Uint8Array,
): Promise<{ text: string; language: string | null; durationSeconds: number | null }> {
  const provider = (Deno.env.get('STT_PROVIDER') ?? 'groq').toLowerCase();
  const groq = Deno.env.get('GROQ_API_KEY');
  const openai = Deno.env.get('OPENAI_API_KEY');
  const useOpenAI = provider === 'openai';
  const key = useOpenAI ? openai : groq;
  if (!key) throw new Error('MISSING_PROVIDER_KEY');
  const endpoint = useOpenAI
    ? 'https://api.openai.com/v1/audio/transcriptions'
    : 'https://api.groq.com/openai/v1/audio/transcriptions';
  // Turbo is the fast Groq Whisper. STT_MODEL still overrides it.
  const model = useOpenAI
    ? Deno.env.get('OPENAI_STT_MODEL') ?? 'whisper-1'
    : Deno.env.get('STT_MODEL') ?? 'whisper-large-v3-turbo';
  let lastStatus = 0;
  for (let attempt = 0; attempt < STT_ATTEMPTS; attempt += 1) {
    const form = new FormData();
    form.append('file', new Blob([bytes], { type: 'audio/mp4' }), 'audio.m4a');
    form.append('model', model);
    form.append('response_format', 'verbose_json');
    form.append('temperature', '0');
    // Bias toward mixed Turkish and English without locking the language.
    form.append('prompt', 'Türkçe ve English. Görev, hatırlatma, etkinlik, alışveriş, not.');
    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { Authorization: `Bearer ${key}` },
        body: form,
        signal: AbortSignal.timeout(STT_TIMEOUT_MS),
      });
      if (response.ok) {
        const payload = await response.json();
        const text = String(payload.text ?? '').trim();
        if (!text) throw new Error('STT_EMPTY');
        const seconds = Number(payload.duration);
        return { text, language: payload.language ?? null, durationSeconds: Number.isFinite(seconds) ? seconds : null };
      }
      lastStatus = response.status;
      if (response.status !== 429 && response.status < 500) throw new Error(`STT_${response.status}`);
    } catch (error) {
      if (error instanceof Error && error.message.startsWith('STT_') && !error.message.startsWith('STT_EMPTY')) {
        const status = Number(error.message.slice(4));
        if (Number.isFinite(status) && status !== 429 && status < 500) throw error;
      }
      if (attempt === STT_ATTEMPTS - 1) {
        if (error instanceof Error && error.message.startsWith('STT_')) throw error;
        throw new Error(lastStatus ? `STT_${lastStatus}` : 'STT_TIMEOUT');
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 400 * (attempt + 1)));
  }
  throw new Error(lastStatus ? `STT_${lastStatus}` : 'STT_TIMEOUT');
}

async function extractWithModel(transcript: string, now: Date, timeZone: string, locale: string) {
  const provider = (Deno.env.get('LLM_PROVIDER') ?? 'groq').toLowerCase();
  const groq = Deno.env.get('GROQ_API_KEY');
  const openai = Deno.env.get('OPENAI_API_KEY');
  const useOpenAI = provider === 'openai';
  const key = useOpenAI ? openai : groq;
  if (!key) throw new Error('MISSING_LLM_KEY');
  const endpoint = useOpenAI
    ? 'https://api.openai.com/v1/chat/completions'
    : 'https://api.groq.com/openai/v1/chat/completions';
  // Fast model first. LLM_MODEL overrides. A failed call or an empty split retries the heavier model.
  const model = useOpenAI
    ? Deno.env.get('OPENAI_LLM_MODEL') ?? 'gpt-4o-mini'
    : Deno.env.get('LLM_MODEL') ?? 'openai/gpt-oss-20b';
  const fallbackModel = useOpenAI ? null : Deno.env.get('LLM_MODEL_FALLBACK') ?? 'openai/gpt-oss-120b';
  const stamp = localTimestamp(now, timeZone);
  const messages = buildExtractionMessages({
    transcript,
    nowIso: stamp.local,
    utcOffset: stamp.offset,
    timeZone,
    locale,
  });
  const ask = (chosen: string) =>
    fetch(endpoint, {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(18_000),
      body: JSON.stringify({
        model: chosen,
        temperature: 0,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: messages.system },
          { role: 'user', content: messages.user },
        ],
      }),
    });
  const readItems = async (response: Response) => {
    if (!response.ok) return null;
    const payload = await response.json();
    const content = payload.choices?.[0]?.message?.content ?? '{}';
    const parsed = JSON.parse(content.replace(/^```(?:json)?/i, '').replace(/```$/, ''));
    return normalizeExtraction(parsed, { now, timeZone, locale });
  };
  let response = await ask(model);
  if (!response.ok && fallbackModel && fallbackModel !== model) response = await ask(fallbackModel);
  if (!response.ok) throw new Error(`LLM_${response.status}`);
  let normalized = await readItems(response);
  if (
    normalized &&
    normalized.length === 0 &&
    transcript.trim().length > 12 &&
    fallbackModel &&
    fallbackModel !== model
  ) {
    const heavier = await ask(fallbackModel);
    const again = await readItems(heavier);
    if (again && again.length > 0) normalized = again;
  }
  const items = normalized && normalized.length > 0 ? normalized : extractItems(transcript, { now, timeZone, locale });
  return mergeSpokenOffsets(items, transcript);
}

async function summarizeWithModel(transcript: string, locale: string) {
  const provider = (Deno.env.get('LLM_PROVIDER') ?? 'groq').toLowerCase();
  const useOpenAI = provider === 'openai';
  const key = useOpenAI ? Deno.env.get('OPENAI_API_KEY') : Deno.env.get('GROQ_API_KEY');
  if (!key) return null;
  const endpoint = useOpenAI
    ? 'https://api.openai.com/v1/chat/completions'
    : 'https://api.groq.com/openai/v1/chat/completions';
  const model = useOpenAI
    ? Deno.env.get('OPENAI_LLM_MODEL') ?? 'gpt-4o-mini'
    : Deno.env.get('LLM_MODEL') ?? 'openai/gpt-oss-20b';
  const messages = buildSummaryMessages({ transcript, locale });
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    signal: AbortSignal.timeout(25_000),
    body: JSON.stringify({
      model,
      temperature: 0.2,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: messages.system },
        { role: 'user', content: messages.user },
      ],
    }),
  });
  if (!response.ok) throw new Error(`SUMMARY_${response.status}`);
  const payload = await response.json();
  const content = payload.choices?.[0]?.message?.content ?? '{}';
  return normalizeSummary(JSON.parse(content.replace(/^```(?:json)?/i, '').replace(/```$/, '')));
}
