import { createClient } from 'npm:@supabase/supabase-js@2';

/**
 * Daily audio retention, run by pg_cron (see migration 20261116100000_audio_retention.sql).
 * Free accounts keep a take's audio for 7 days, Pro for 30. Only the audio file goes:
 * the transcript, the recording row, and every saved item stay. The row's storage_path is
 * cleared, so the app hides the play button.
 *
 * Called with the x-purge-secret header; anything else gets 401.
 */
const FREE_DAYS = 7;
const PRO_DAYS = 30;
const BATCH = 100;
const MAX_ROWS = 5000;

type Row = { id: string; user_id: string; storage_path: string; created_at: string };

Deno.serve(async (req) => {
  const expected = Deno.env.get('PURGE_SECRET') ?? '';
  const given = req.headers.get('x-purge-secret') ?? '';
  if (!expected || !safeEqual(given, expected)) return json({ error: 'UNAUTHORIZED' }, 401);

  const admin = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? secretKey());
  const freeCutoff = new Date(Date.now() - FREE_DAYS * 86_400_000).toISOString();
  const proCutoff = new Date(Date.now() - PRO_DAYS * 86_400_000).toISOString();

  // Two passes. Past 30 days every file goes. Between 7 and 30 days only free users' files go;
  // that window is walked in pages so kept Pro files cannot crowd free files out of one big read.
  const select = 'id, user_id, storage_path, created_at';
  const old = await admin
    .from('recordings')
    .select(select)
    .not('storage_path', 'is', null)
    .lt('created_at', proCutoff)
    .order('created_at', { ascending: true })
    .limit(MAX_ROWS);
  if (old.error) return json({ error: old.error.message }, 500);

  const expired: Row[] = [...((old.data ?? []) as Row[])];
  const proCache = new Map<string, boolean>();
  let checked = expired.length;
  let after = proCutoff;
  while (checked < MAX_ROWS) {
    const page = await admin
      .from('recordings')
      .select(select)
      .not('storage_path', 'is', null)
      .gte('created_at', after)
      .lt('created_at', freeCutoff)
      .order('created_at', { ascending: true })
      .limit(1000);
    if (page.error) return json({ error: page.error.message }, 500);
    const rows = (page.data ?? []) as Row[];
    for (const row of rows) {
      if (!proCache.has(row.user_id)) proCache.set(row.user_id, await keepsLonger(admin, row.user_id));
      if (!proCache.get(row.user_id)) expired.push(row);
    }
    checked += rows.length;
    if (rows.length < 1000) break;
    const last = rows[rows.length - 1].created_at;
    // Rows sharing the last timestamp are read again next page; storage removal is idempotent.
    if (last === after) break;
    after = last;
  }

  const unique = [...new Map(expired.map((row) => [row.id, row])).values()];
  expired.length = 0;
  expired.push(...unique);

  let removed = 0;
  for (let index = 0; index < expired.length; index += BATCH) {
    const batch = expired.slice(index, index + BATCH);
    const files = await admin.storage.from('recordings').remove(batch.map((row) => row.storage_path));
    if (files.error) {
      console.warn('[purge-audio] storage', files.error.message);
      continue;
    }
    const { error: updateError } = await admin
      .from('recordings')
      .update({ storage_path: null })
      .in('id', batch.map((row) => row.id));
    if (updateError) console.warn('[purge-audio] rows', updateError.message);
    else removed += batch.length;
  }

  console.log('[purge-audio]', JSON.stringify({ checked, removed, users: proCache.size }));
  return json({ checked, removed });
});

/** Pro (store or admin gift) keeps audio 30 days. If RevenueCat cannot answer, keep it: never cut a paying user short. */
async function keepsLonger(admin: ReturnType<typeof createClient>, userId: string): Promise<boolean> {
  const { data } = await admin.from('profiles').select('pro_override_until').eq('id', userId).maybeSingle();
  const until = (data as { pro_override_until?: string | null } | null)?.pro_override_until;
  if (until && (until === 'infinity' || Date.parse(until) > Date.now())) return true;

  const secret = Deno.env.get('REVENUECAT_SECRET_API_KEY');
  if (!secret) return false;
  const entitlement = Deno.env.get('REVENUECAT_ENTITLEMENT_ID') ?? 'pro';
  try {
    const response = await fetch(`https://api.revenuecat.com/v1/subscribers/${encodeURIComponent(userId)}`, {
      headers: { Authorization: `Bearer ${secret}` },
      signal: AbortSignal.timeout(5000),
    });
    if (response.status === 404) return false;
    if (!response.ok) return true;
    const payload = await response.json();
    const entry = payload?.subscriber?.entitlements?.[entitlement];
    if (!entry) return false;
    return !entry.expires_date || new Date(entry.expires_date).getTime() > Date.now();
  } catch {
    return true;
  }
}

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function secretKey() {
  const raw = Deno.env.get('SUPABASE_SECRET_KEYS');
  if (!raw) return '';
  const parsed = JSON.parse(raw) as Record<string, string>;
  return parsed.default ?? Object.values(parsed)[0] ?? '';
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}
