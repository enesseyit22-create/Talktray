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
    const now = body.now ? new Date(body.now) : new Date();
    const isPro = await subscriberIsPro(userId);
    const limits = isPro ? null : await readFreeLimits(admin);
    if (limits) {
      const reason = await freeLimitReason(admin, userId, recordingId, Number(recording.duration_ms ?? 0), now, timeZone, limits);
      if (reason) {
        await admin.from('recordings').update({ status: 'failed', error: 'quota_exceeded' }).eq('id', recordingId);
        return json({ error: 'quota_exceeded', reason }, 402);
      }
    }

    let transcript = '';
    let language: string | null = locale;
    if (body.useStoredTranscript && recording.transcript) {
      transcript = recording.transcript;
    } else {
      if (!recording.storage_path) return json({ error: 'AUDIO_NOT_FOUND' }, 400);
      const sttKey = Deno.env.get('GROQ_API_KEY') || Deno.env.get('OPENAI_API_KEY');
      if (!sttKey) {
        await admin.from('recordings').update({ status: 'failed', error: 'MISSING_PROVIDER_KEY' }).eq('id', recordingId);
        return json({ error: 'MISSING_PROVIDER_KEY' }, 501);
      }
      const audio = await admin.storage.from('recordings').download(recording.storage_path);
      if (audio.error || !audio.data) return json({ error: 'AUDIO_NOT_FOUND' }, 404);
      const spoken = await transcribe(new Uint8Array(await audio.data.arrayBuffer()));
      transcript = spoken.text;
      language = spoken.language ?? language;
    }

    let items;
    try {
      items = await extractWithModel(transcript, now, timeZone, locale);
    } catch (error) {
      if (error instanceof Error && error.message === 'MISSING_LLM_KEY') {
        items = extractItems(transcript, { now, timeZone, locale });
      } else {
        const message = error instanceof Error ? error.message : 'UNKNOWN';
        await admin.from('recordings').update({ status: 'failed', transcript, error: message.slice(0, 500) }).eq('id', recordingId);
        throw error;
      }
    }

    await admin.from('recordings').update({ status: 'ready', transcript, language }).eq('id', recordingId);
    const monthCount = await countRecordingsSince(admin, userId, windowStart(now, timeZone, 'month'));
    return json({
      transcript,
      language,
      items,
      usage: {
        count: monthCount,
        limit: isPro ? null : limits?.free_recordings_per_month ?? null,
        isPro,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'UNKNOWN';
    return json({ error: message }, 500);
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

async function countRecordingsSince(
  admin: ReturnType<typeof createClient>,
  userId: string,
  start: string,
  exceptId?: string,
): Promise<number> {
  let query = admin
    .from('recordings')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .gte('created_at', start)
    .neq('status', 'failed');
  if (exceptId) query = query.neq('id', exceptId);
  const { count } = await query;
  return count ?? 0;
}

async function freeLimitReason(
  admin: ReturnType<typeof createClient>,
  userId: string,
  recordingId: string,
  durationMs: number,
  now: Date,
  timeZone: string,
  limits: FreeLimits,
): Promise<string | null> {
  const ever = await countRecordingsSince(admin, userId, '1970-01-01T00:00:00.000Z', recordingId);
  const durationSeconds = Math.floor(durationMs / 1000);
  if (ever < RECORDINGS_BEFORE_PAYWALL) {
    return decideFreeRecording({
      isPro: false,
      completedEver: ever,
      completedToday: 0,
      completedMonth: 0,
      durationSeconds,
      itemCount: 0,
      limits,
    }).reason;
  }
  const today = await countRecordingsSince(admin, userId, windowStart(now, timeZone, 'day'), recordingId);
  const monthStart = windowStart(now, timeZone, 'month');
  const month = await countRecordingsSince(admin, userId, monthStart, recordingId);
  let itemCount = 0;
  if (limits.free_max_items != null) {
    const { count } = await admin.from('items').select('id', { count: 'exact', head: true }).eq('user_id', userId);
    itemCount = count ?? 0;
  }
  let decision: FreeLimitDecision = decideFreeRecording({
    isPro: false,
    completedEver: ever,
    completedToday: today,
    completedMonth: month,
    durationSeconds,
    itemCount,
    limits,
  });
  if (decision.allowed || decision.reason === 'month') {
    const reserved = await reserveMonthlyCredit(admin, userId, recordingId, monthStart);
    if (reserved === 'blocked') decision = { allowed: false, reason: 'month', enforceDurationCap: true };
  }
  return decision.allowed ? null : decision.reason;
}

/** Optional lock. Missing function falls back to the same TypeScript decision, so 1.0 clients keep working. */
async function reserveMonthlyCredit(
  admin: ReturnType<typeof createClient>,
  userId: string,
  recordingId: string,
  periodStart: string,
): Promise<'ok' | 'blocked' | 'unavailable'> {
  const { data, error } = await admin.rpc('reserve_monthly_credit', {
    p_user_id: userId,
    p_recording_id: recordingId,
    p_is_pro: false,
    p_period_start: periodStart,
  });
  if (error) return 'unavailable';
  const row = data as { allowed?: boolean } | null;
  return row?.allowed === false ? 'blocked' : 'ok';
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
