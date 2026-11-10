import { createClient } from 'npm:@supabase/supabase-js@2';
import {
  buildExtractionMessages,
  extractItems,
  monthPeriod,
  normalizeExtraction,
  safeTimeZone,
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
      .select('id, user_id, storage_path, transcript')
      .eq('id', recordingId)
      .maybeSingle();
    if (recordingError || !recording || recording.user_id !== userId) {
      return json({ error: 'RECORDING_NOT_FOUND' }, 404);
    }

    const { data: profile } = await admin.from('profiles').select('timezone, locale').eq('id', userId).maybeSingle();
    const timeZone = safeTimeZone(profile?.timezone || body.timezone || 'UTC');
    const locale = resolveLocale(profile?.locale, body.locale);
    const now = body.now ? new Date(body.now) : new Date();
    const period = monthPeriod(now, timeZone);
    const isPro = await subscriberIsPro(userId);

    let transcript = '';
    let language: string | null = locale;
    if (body.useStoredTranscript && recording.transcript) {
      transcript = recording.transcript;
    } else {
      if (!recording.storage_path) return json({ error: 'AUDIO_NOT_FOUND' }, 400);
      const sttKey = Deno.env.get('GROQ_API_KEY') || Deno.env.get('OPENAI_API_KEY');
      if (!sttKey) {
        await admin.from('recordings').update({ status: 'failed' }).eq('id', recordingId);
        return json({ error: 'MISSING_PROVIDER_KEY' }, 501);
      }
      const audio = await admin.storage.from('recordings').download(recording.storage_path);
      if (audio.error || !audio.data) return json({ error: 'AUDIO_NOT_FOUND' }, 404);
      const spoken = await transcribe(new Uint8Array(await audio.data.arrayBuffer()));
      transcript = spoken.text;
      language = spoken.language ?? language;
    }

    const quota = await admin.rpc('consume_recording_quota', {
      p_user_id: userId,
      p_is_pro: isPro,
      p_period: period,
    });
    if (quota.error) return json({ error: 'QUOTA_FAILED', detail: quota.error.message }, 500);
    const usage = quota.data as { allowed: boolean; count: number; limit: number; is_pro: boolean };
    if (!usage?.allowed) return json({ error: 'QUOTA_EXCEEDED', usage: mapUsage(usage) }, 402);

    let items;
    try {
      items = await extractWithModel(transcript, now, timeZone, locale);
    } catch (error) {
      if (error instanceof Error && error.message === 'MISSING_LLM_KEY') {
        items = extractItems(transcript, { now, timeZone, locale });
      } else {
        await admin.rpc('refund_recording_quota', { p_user_id: userId, p_period: period });
        await admin.from('recordings').update({ status: 'failed', transcript }).eq('id', recordingId);
        throw error;
      }
    }

    await admin.from('recordings').update({ status: 'ready', transcript, language }).eq('id', recordingId);
    return json({ transcript, language, items, usage: mapUsage(usage) });
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

function mapUsage(usage: { count: number; limit: number; is_pro: boolean } | null) {
  return {
    count: usage?.count ?? 0,
    limit: usage?.limit ?? 25,
    isPro: Boolean(usage?.is_pro),
  };
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
    : Deno.env.get('LLM_MODEL') ?? 'llama-3.3-70b-versatile';
  const messages = buildExtractionMessages({
    transcript,
    nowIso: now.toISOString(),
    timeZone,
    locale,
  });
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      temperature: 0.1,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: messages.system },
        { role: 'user', content: messages.user },
      ],
    }),
  });
  if (!response.ok) throw new Error(`LLM_${response.status}`);
  const payload = await response.json();
  const content = payload.choices?.[0]?.message?.content ?? '{}';
  const parsed = JSON.parse(content.replace(/^```(?:json)?/i, '').replace(/```$/, ''));
  const normalized = normalizeExtraction(parsed, { now, timeZone, locale });
  return normalized.length > 0 ? normalized : extractItems(transcript, { now, timeZone, locale });
}
