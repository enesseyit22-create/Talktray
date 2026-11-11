import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2';

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

type SignupBody = {
  kind?: string;
  userId?: string;
  email?: string | null;
  username?: string | null;
  displayName?: string | null;
};

type RevenueCatEvent = {
  id?: string;
  type?: string;
  app_user_id?: string;
  product_id?: string;
};

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ error: 'METHOD' }, 405);

  let payload: unknown;
  try {
    payload = await req.json();
  } catch {
    return json({ error: 'INVALID_JSON' }, 400);
  }

  const internalSecret = Deno.env.get('ADMIN_PUSH_SECRET') ?? '';
  const revenueAuth = Deno.env.get('REVENUECAT_WEBHOOK_AUTHORIZATION') ?? '';
  const isInternal = internalSecret.length > 0 && req.headers.get('x-admin-push-secret') === internalSecret;
  const isRevenueCat = revenueAuth.length > 0 && (req.headers.get('Authorization') ?? '') === revenueAuth;
  if (!isInternal && !isRevenueCat) return json({ error: 'UNAUTHORIZED' }, 401);

  const url = Deno.env.get('SUPABASE_URL') ?? '';
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? secretKey();
  if (!url || !serviceKey) return json({ error: 'MISSING_SERVICE_KEY' }, 500);
  const admin = createClient(url, serviceKey);

  try {
    if (isInternal && isSignup(payload)) {
      const who = label(payload.username, payload.email, payload.displayName, payload.userId);
      const sent = await deliver(admin, `signup:${payload.userId}`, `Yeni üye: ${who}`);
      return json({ ok: true, sent });
    }

    if (!isRevenueCat) return json({ error: 'IGNORED' }, 400);
    const event = (payload as { event?: RevenueCatEvent }).event;
    if (!event?.type) return json({ error: 'EVENT_REQUIRED' }, 400);
    if (event.type === 'TEST') {
      const sent = await deliver(admin, `rc:${event.id ?? 'test'}`, 'RevenueCat test bildirimi');
      return json({ ok: true, sent });
    }

    const purchase = event.type === 'INITIAL_PURCHASE' || event.type === 'NON_RENEWING_PURCHASE';
    const renewal = event.type === 'RENEWAL';
    if (!purchase && !renewal) return json({ ok: true, ignored: event.type });

    const userId = event.app_user_id ?? '';
    const who = await purchaserLabel(admin, userId);
    const product = event.product_id || 'premium';
    const text = purchase ? `Yeni premium: ${who} — ${product}` : `Premium yenileme: ${who} — ${product}`;
    const sent = await deliver(admin, `rc:${event.id ?? `${event.type}:${userId}:${product}`}`, text);
    return json({ ok: true, sent });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'PUSH_FAILED';
    return json({ error: message }, 500);
  }
});

function isSignup(value: unknown): value is SignupBody & { userId: string } {
  if (!value || typeof value !== 'object') return false;
  const body = value as SignupBody;
  return body.kind === 'signup' && typeof body.userId === 'string' && body.userId.length > 0;
}

function label(...parts: Array<string | null | undefined>): string {
  for (const part of parts) {
    const text = part?.trim();
    if (text) return text;
  }
  return 'bilinmiyor';
}

async function purchaserLabel(admin: SupabaseClient, userId: string): Promise<string> {
  if (!userId || userId.startsWith('$RCAnonymous')) return label(userId);
  const profile = await admin.from('profiles').select('username, display_name').eq('id', userId).maybeSingle();
  const user = await admin.auth.admin.getUserById(userId).catch(() => null);
  return label(profile.data?.username, user?.data?.user?.email, profile.data?.display_name, userId);
}

async function deliver(admin: SupabaseClient, id: string, body: string): Promise<boolean> {
  const claimed = await admin.from('admin_push_deliveries').insert({ id });
  if (claimed.error) {
    if (claimed.error.code === '23505') return false;
    throw new Error(claimed.error.message);
  }

  try {
    const tokens = await admin.from('admin_push_tokens').select('token');
    if (tokens.error) throw new Error(tokens.error.message);
    const to = (tokens.data ?? []).map((row) => row.token).filter((token): token is string => Boolean(token));
    if (!to.length) return false;

    const response = await fetch(EXPO_PUSH_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(
        to.map((token) => ({
          to: token,
          title: 'Talktray',
          body,
          sound: 'default',
          channelId: 'reminders',
        })),
      ),
    });
    if (!response.ok) throw new Error(`EXPO_${response.status}`);
    return true;
  } catch (error) {
    await admin.from('admin_push_deliveries').delete().eq('id', id);
    throw error;
  }
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function secretKey() {
  const raw = Deno.env.get('SUPABASE_SECRET_KEYS');
  if (!raw) return '';
  const parsed = JSON.parse(raw) as Record<string, string>;
  return parsed.default ?? Object.values(parsed)[0] ?? '';
}
