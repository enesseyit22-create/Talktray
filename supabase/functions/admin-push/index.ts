import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2';

import {
  memberLabel,
  premiumBody,
  premiumDeliveryId,
  premiumWord,
  signupBody,
  signupDeliveryId,
  type PremiumWord,
} from '../_shared/admin-push.ts';
import { grantIsActive, matchesAudience, type PushAudience } from '../_shared/push-audience.ts';

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

type SignupBody = {
  kind?: string;
  userId?: string;
  email?: string | null;
  username?: string | null;
  displayName?: string | null;
};

type PremiumBody = SignupBody & {
  source?: string;
  plan?: string | null;
  until?: string | null;
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

  const url = Deno.env.get('SUPABASE_URL') ?? '';
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? secretKey();
  if (!url || !serviceKey) return json({ error: 'MISSING_SERVICE_KEY' }, 500);
  const admin = createClient(url, serviceKey);

  if (isBroadcast(payload)) {
    const caller = await adminCaller(req, url);
    if (!caller) return json({ error: 'UNAUTHORIZED' }, 401);
    try {
      const sent = await broadcast(admin, payload);
      return json({ ok: true, sent });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'PUSH_FAILED';
      return json({ error: message }, 500);
    }
  }

  if (isDeleteUser(payload)) {
    const caller = await adminCaller(req, url);
    if (!caller) return json({ error: 'UNAUTHORIZED' }, 401);
    if (payload.userId === caller) return json({ error: 'USER_INVALID' }, 400);
    try {
      await deleteUserEverywhere(admin, payload.userId);
      return json({ ok: true });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'DELETE_FAILED';
      return json({ error: message }, 500);
    }
  }

  const internalSecret = Deno.env.get('ADMIN_PUSH_SECRET') ?? '';
  const revenueAuth = Deno.env.get('REVENUECAT_WEBHOOK_AUTHORIZATION') ?? '';
  const isInternal = internalSecret.length > 0 && req.headers.get('x-admin-push-secret') === internalSecret;
  const isRevenueCat = revenueAuth.length > 0 && (req.headers.get('Authorization') ?? '') === revenueAuth;
  if (!isInternal && !isRevenueCat) return json({ error: 'UNAUTHORIZED' }, 401);

  try {
    if (isInternal && isSignup(payload)) {
      const who = memberLabel(payload.username, payload.email, payload.displayName, payload.userId);
      const sent = await deliver(admin, signupDeliveryId(payload.userId), signupBody(who));
      return json({ ok: true, sent });
    }

    if (isInternal && isPremium(payload)) {
      const source = payload.source === 'gift' ? 'gift' : 'store';
      const word = premiumWord(source, payload.plan);
      const who = memberLabel(payload.username, payload.email, payload.displayName, payload.userId);
      const sent = await deliver(
        admin,
        premiumDeliveryId({
          source,
          userId: payload.userId,
          word,
          until: payload.until,
        }),
        premiumBody(who, word),
      );
      return json({ ok: true, sent });
    }

    if (!isRevenueCat) return json({ error: 'IGNORED' }, 400);
    const event = (payload as { event?: RevenueCatEvent }).event;
    if (!event?.type) return json({ error: 'EVENT_REQUIRED' }, 400);
    if (event.type === 'TEST') {
      const sent = await deliver(admin, `rc:${event.id ?? 'test'}`, 'RevenueCat test bildirimi');
      return json({ ok: true, sent });
    }

    const purchase =
      event.type === 'INITIAL_PURCHASE' ||
      event.type === 'NON_RENEWING_PURCHASE' ||
      event.type === 'PRODUCT_CHANGE';
    if (!purchase) return json({ ok: true, ignored: event.type });

    const userId = event.app_user_id ?? '';
    if (!userId || userId.startsWith('$RCAnonymous')) return json({ ok: true, ignored: 'anonymous' });
    const word: PremiumWord = premiumWord('store', event.product_id);
    const who = await purchaserLabel(admin, userId);
    const sent = await deliver(
      admin,
      premiumDeliveryId({ source: 'store', userId, word }),
      premiumBody(who, word),
    );
    return json({ ok: true, sent });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'PUSH_FAILED';
    return json({ error: message }, 500);
  }
});

type BroadcastBody = {
  kind?: string;
  title?: string;
  body?: string;
  audience?: string;
  userId?: string | null;
  locale?: string | null;
};

function isBroadcast(value: unknown): value is BroadcastBody & { title: string; body: string; audience: PushAudience } {
  if (!value || typeof value !== 'object') return false;
  const body = value as BroadcastBody;
  const audience = body.audience;
  const known = audience === 'all' || audience === 'user' || audience === 'free' || audience === 'pro' || audience === 'language';
  return body.kind === 'broadcast' && known && typeof body.title === 'string' && typeof body.body === 'string' && body.title.trim().length > 0 && body.body.trim().length > 0;
}

async function adminCaller(req: Request, url: string): Promise<string | null> {
  const authHeader = req.headers.get('Authorization') ?? '';
  const anon = Deno.env.get('SUPABASE_ANON_KEY') ?? publishableKey();
  if (!anon) return null;
  const userClient = createClient(url, anon, { global: { headers: { Authorization: authHeader } } });
  const token = authHeader.replace(/^Bearer\s+/i, '');
  const { data, error } = await userClient.auth.getUser(token);
  if (error || !data.user) return null;
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? secretKey();
  const admin = createClient(url, serviceKey);
  const member = await admin.from('app_admins').select('user_id').eq('user_id', data.user.id).maybeSingle();
  return member.data ? data.user.id : null;
}

async function broadcast(admin: SupabaseClient, body: BroadcastBody & { title: string; body: string; audience: PushAudience }): Promise<number> {
  // PostgREST returns at most 1000 rows per request, so every table is read in pages.
  const tokens = await readAll(admin, 'user_push_tokens', 'user_id, token', 'user_id');
  if (tokens.error) throw new Error(tokens.error.message);
  const profiles = await readAll(admin, 'profiles', 'id, locale, pro_override_until', 'id');
  const presence = await readAll(admin, 'user_presence', 'user_id, store_is_pro', 'user_id');
  const now = Date.now();
  const localeOf = new Map((profiles.data ?? []).map((row) => [String(row.id), (row.locale as string | null) ?? null]));
  const proOf = new Map<string, boolean>();
  for (const row of profiles.data ?? []) {
    proOf.set(String(row.id), grantIsActive(row.pro_override_until as string | null, now));
  }
  for (const row of presence.data ?? []) {
    if (row.store_is_pro === true) proOf.set(String(row.user_id), true);
  }
  const to = (tokens.data ?? [])
    .filter((row) =>
      matchesAudience(
        {
          userId: String(row.user_id),
          locale: localeOf.get(String(row.user_id)) ?? null,
          pro: proOf.get(String(row.user_id)) === true,
        },
        { kind: body.audience, userId: body.userId, locale: body.locale },
      ),
    )
    .map((row) => row.token)
    .filter((token): token is string => Boolean(token));
  if (!to.length) return 0;
  for (let index = 0; index < to.length; index += 100) {
    const slice = to.slice(index, index + 100);
    const response = await fetch(EXPO_PUSH_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(
        slice.map((token) => ({
          to: token,
          title: body.title.trim(),
          body: body.body.trim(),
          sound: 'default',
          channelId: 'reminders',
          priority: 'high',
        })),
      ),
    });
    if (!response.ok) throw new Error(`EXPO_${response.status}`);
    await dropDeadTokens(admin, slice, response);
  }
  return to.length;
}

type DeleteUserBody = { kind: 'delete-user'; userId: string };

function isDeleteUser(value: unknown): value is DeleteUserBody {
  if (!value || typeof value !== 'object') return false;
  const body = value as { kind?: unknown; userId?: unknown };
  return body.kind === 'delete-user' && typeof body.userId === 'string' && body.userId.length > 0;
}

/**
 * Deletes the user's audio through the Storage API first (SQL cannot remove storage files),
 * then the auth user. Tables that reference auth.users cascade.
 */
async function deleteUserEverywhere(admin: SupabaseClient, userId: string): Promise<void> {
  for (let round = 0; round < 200; round++) {
    const { data, error } = await admin.storage.from('recordings').list(userId, { limit: 100 });
    if (error) throw new Error(error.message);
    const paths = (data ?? []).filter((file) => file.name && file.id !== null).map((file) => `${userId}/${file.name}`);
    if (!paths.length) break;
    const removed = await admin.storage.from('recordings').remove(paths);
    if (removed.error) throw new Error(removed.error.message);
  }
  const { error } = await admin.auth.admin.deleteUser(userId);
  if (error) throw new Error(error.message);
}

/** Expo answers each message with a ticket. Tokens of uninstalled apps are removed so later sends stay small. */
async function dropDeadTokens(admin: SupabaseClient, tokens: string[], response: Response): Promise<void> {
  try {
    const payload = (await response.json()) as { data?: Array<{ status?: string; details?: { error?: string } }> };
    const dead = (payload.data ?? [])
      .map((ticket, index) => (ticket?.status === 'error' && ticket.details?.error === 'DeviceNotRegistered' ? tokens[index] : null))
      .filter((token): token is string => Boolean(token));
    if (dead.length) await admin.from('user_push_tokens').delete().in('token', dead);
  } catch (error) {
    console.warn('[admin-push] receipts', error instanceof Error ? error.message : error);
  }
}

async function readAll(
  admin: SupabaseClient,
  table: string,
  columns: string,
  orderBy: string,
): Promise<{ data: Record<string, unknown>[]; error: { message: string } | null }> {
  const page = 1000;
  const rows: Record<string, unknown>[] = [];
  for (let from = 0; ; from += page) {
    const { data, error } = await admin.from(table).select(columns).order(orderBy).range(from, from + page - 1);
    if (error) return { data: rows, error };
    const chunk = (data ?? []) as unknown as Record<string, unknown>[];
    rows.push(...chunk);
    if (chunk.length < page) return { data: rows, error: null };
  }
}

function publishableKey() {
  const raw = Deno.env.get('SUPABASE_PUBLISHABLE_KEYS');
  if (!raw) return '';
  const parsed = JSON.parse(raw) as Record<string, string>;
  return parsed.default ?? Object.values(parsed)[0] ?? '';
}

function isSignup(value: unknown): value is SignupBody & { userId: string } {
  if (!value || typeof value !== 'object') return false;
  const body = value as SignupBody;
  return body.kind === 'signup' && typeof body.userId === 'string' && body.userId.length > 0;
}

function isPremium(value: unknown): value is PremiumBody & { userId: string } {
  if (!value || typeof value !== 'object') return false;
  const body = value as PremiumBody;
  return body.kind === 'premium' && typeof body.userId === 'string' && body.userId.length > 0;
}

async function purchaserLabel(admin: SupabaseClient, userId: string): Promise<string> {
  const profile = await admin.from('profiles').select('username, display_name').eq('id', userId).maybeSingle();
  const user = await admin.auth.admin.getUserById(userId).catch(() => null);
  return memberLabel(profile.data?.username, user?.data?.user?.email, profile.data?.display_name, userId);
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
          title: 'TalkTray',
          body,
          sound: 'default',
          channelId: 'reminders',
          priority: 'high',
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
