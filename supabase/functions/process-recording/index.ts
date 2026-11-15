import { createClient } from 'npm:@supabase/supabase-js@2';
import {
  buildExtractionMessages,
  decideFreeRecording,
  extractItems,
  localTimestamp,
  mergeSpokenOffsets,
  normalizeExtraction,
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
      .select('id, user_id, storage_path, transcript, duration_ms')
      .eq('id', recordingId)
      .maybeSingle();
    if (recordingError || !recording || recording.user_id !== userId) {
      return json({ error: 'RECORDING_NOT_FOUND' }, 404);
    }

    const { data: profile } = await admin.from('profiles').select('timezone, locale').eq('id', userId).maybeSingle();
    const timeZone = safeTimeZone(profile?.timezone || body.timezone || 'UTC');
    const locale = resolveLocale(profile?.locale, body.locale);
    // The phone's clock is used only to read "tomorrow at 9" and the like.
    // Limits always use the server clock, so a changed date cannot open a new month.
    const now = body.now ? new Date(body.now) : new Date();
    const serverNow = new Date();
    const isPro = await subscriberIsPro(userId);

    if (!isPro) {
      const limits = await readFreeLimits(admin);
      const reason = await freeLimitReason(admin, userId, Number(recording.duration_ms ?? 0), serverNow, timeZone, limits);
      if (reason) return await refuse(admin, recordingId, reason);
    }
    const credit = await reserveCredit(admin, userId, recordingId, isPro, timeZone);
    if (credit.state === 'blocked') {
      if (credit.reason === 'repeat') return json({ error: 'ALREADY_PROCESSED' }, 409);
      return await refuse(admin, recordingId, credit.reason);
    }
    if (credit.state === 'unavailable') {
      await markFailed(admin, recordingId, 'CREDITS_UNAVAILABLE');
      return json({ error: 'CREDITS_UNAVAILABLE' }, 503);
    }

    let transcript = '';
    let language: string | null = locale;
    let items;
    try {
      if (body.useStoredTranscript && recording.transcript) {
        transcript = recording.transcript;
      } else {
        if (!recording.storage_path) throw new Error('AUDIO_NOT_FOUND');
        const sttKey = Deno.env.get('GROQ_API_KEY') || Deno.env.get('OPENAI_API_KEY');
        if (!sttKey) throw new Error('MISSING_PROVIDER_KEY');
        const audio = await admin.storage.from('recordings').download(recording.storage_path);
        if (audio.error || !audio.data) throw new Error('AUDIO_NOT_FOUND');
        const spoken = await transcribe(new Uint8Array(await audio.data.arrayBuffer()));
        transcript = spoken.text;
        language = spoken.language ?? language;
      }
      try {
        items = await extractWithModel(transcript, now, timeZone, locale);
      } catch (error) {
        if (!(error instanceof Error && error.message === 'MISSING_LLM_KEY')) throw error;
        items = extractItems(transcript, { now, timeZone, locale });
      }
    } catch (error) {
      // Nothing usable came back, so the user gets the credit back.
      const message = error instanceof Error ? error.message : 'UNKNOWN';
      await admin.from('recording_credits').delete().eq('recording_id', recordingId);
      await markFailed(admin, recordingId, message, transcript || null);
      const status = message === 'AUDIO_NOT_FOUND' ? 404 : message === 'MISSING_PROVIDER_KEY' ? 501 : 500;
      return json({ error: message }, status);
    }

    await admin.from('recordings').update({ status: 'ready', transcript, language }).eq('id', recordingId);
    const monthCount = await countCreditsSince(admin, userId, windowStart(serverNow, timeZone, 'month'));
    return json({
      transcript,
      language,
      items,
      usage: {
        count: monthCount,
        limit: credit.limit,
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

async function markFailed(
  admin: ReturnType<typeof createClient>,
  recordingId: string,
  error: string,
  transcript: string | null = null,
) {
  const patch: Record<string, unknown> = { status: 'failed', error: error.slice(0, 500) };
  if (transcript) patch.transcript = transcript;
  await admin.from('recordings').update(patch).eq('id', recordingId);
}

async function refuse(admin: ReturnType<typeof createClient>, recordingId: string, reason: string | null) {
  await markFailed(admin, recordingId, 'quota_exceeded');
  return json({ error: 'quota_exceeded', reason }, 402);
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

async function subscriberIsPro(userId: string): Promise<boolean> {
  const secret = Deno.env.get('REVENUECAT_SECRET_API_KEY');
  const entitlement = Deno.env.get('REVENUECAT_ENTITLEMENT_ID') ?? 'pro';
  if (!secret) return false;
  const response = await fetch(`https://api.revenuecat.com/v1/subscribers/${encodeURIComponent(userId)}`, {
    headers: { Authorization: `Bearer ${secret}` },
  });
  if (!response.ok) return false;
  const payload = await response.json();
  const entry = payload?.subscriber?.entitlements?.[entitlement];
  if (!entry) return false;
  if (!entry.expires_date) return true;
  return new Date(entry.expires_date).getTime() > Date.now();
}

async function transcribe(bytes: Uint8Array): Promise<{ text: string; language: string | null }> {
  const provider = (Deno.env.get('STT_PROVIDER') ?? 'groq').toLowerCase();
  const groq = Deno.env.get('GROQ_API_KEY');
  const openai = Deno.env.get('OPENAI_API_KEY');
  const useOpenAI = provider === 'openai';
  const key = useOpenAI ? openai : groq;
  if (!key) throw new Error('MISSING_PROVIDER_KEY');
  const endpoint = useOpenAI
    ? 'https://api.openai.com/v1/audio/transcriptions'
    : 'https://api.groq.com/openai/v1/audio/transcriptions';
  const model = useOpenAI
    ? Deno.env.get('OPENAI_STT_MODEL') ?? 'whisper-1'
    : Deno.env.get('STT_MODEL') ?? 'whisper-large-v3';
  const form = new FormData();
  form.append('file', new Blob([bytes], { type: 'audio/mp4' }), 'audio.m4a');
  form.append('model', model);
  form.append('response_format', 'verbose_json');
  form.append('temperature', '0');
  const response = await fetch(endpoint, { method: 'POST', headers: { Authorization: `Bearer ${key}` }, body: form });
  if (!response.ok) throw new Error(`STT_${response.status}`);
  const payload = await response.json();
  return { text: String(payload.text ?? ''), language: payload.language ?? null };
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
  const model = useOpenAI
    ? Deno.env.get('OPENAI_LLM_MODEL') ?? 'gpt-4o-mini'
    : Deno.env.get('LLM_MODEL') ?? 'openai/gpt-oss-120b';
  const fallbackModel = useOpenAI ? null : Deno.env.get('LLM_MODEL_FALLBACK') ?? 'openai/gpt-oss-20b';
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
      body: JSON.stringify({
        model: chosen,
        temperature: 0.1,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: messages.system },
          { role: 'user', content: messages.user },
        ],
      }),
    });
  let response = await ask(model);
  if (!response.ok && fallbackModel && fallbackModel !== model) response = await ask(fallbackModel);
  if (!response.ok) throw new Error(`LLM_${response.status}`);
  const payload = await response.json();
  const content = payload.choices?.[0]?.message?.content ?? '{}';
  const parsed = JSON.parse(content.replace(/^```(?:json)?/i, '').replace(/```$/, ''));
  const normalized = normalizeExtraction(parsed, { now, timeZone, locale });
  const items = normalized.length > 0 ? normalized : extractItems(transcript, { now, timeZone, locale });
  return mergeSpokenOffsets(items, transcript);
}
