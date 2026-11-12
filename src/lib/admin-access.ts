import { isLifetimeGrant, overrideIsActive } from '@/lib/pro-grant';

export type AccessFacts = {
  pro_override_until?: string | null;
  pro_override_plan?: string | null;
  store_is_pro?: boolean | null;
  completed_ever?: number | string | null;
  completed_month?: number | string | null;
  free_month_limit?: number | null;
  pro_month_limit?: number | null;
  trial_limit?: number | null;
};

export type AccessUsage = {
  kind: 'trial' | 'fair' | 'month' | 'open';
  count: number;
  limit: number | null;
  remaining: number | null;
};

export type AccessView = {
  giftKnown: boolean;
  gift: 'none' | 'month' | 'year' | 'lifetime' | 'dated';
  giftUntil: string | null;
  storeKnown: boolean;
  store: boolean;
  usage: AccessUsage | null;
};

function count(value: number | string | null | undefined): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return Math.max(0, Math.floor(value));
  if (typeof value === 'string' && /^\d+$/.test(value)) return Number(value);
  return null;
}

function planOf(value: string | null | undefined): 'month' | 'year' | 'lifetime' | null {
  if (value === 'month' || value === 'year' || value === 'lifetime') return value;
  return null;
}

/** What an admin should see for one person. Missing RPC columns stay unknown instead of looking like Free. */
export function accessView(row: AccessFacts, nowMs = Date.now()): AccessView {
  const giftKnown = 'pro_override_until' in row || 'pro_override_plan' in row;
  const until = typeof row.pro_override_until === 'string' ? row.pro_override_until : null;
  const plan = planOf(row.pro_override_plan);
  const active = overrideIsActive(until, nowMs) || plan === 'lifetime';
  let gift: AccessView['gift'] = 'none';
  if (active) {
    if (plan === 'lifetime' || isLifetimeGrant(until)) gift = 'lifetime';
    else if (plan === 'month' || plan === 'year') gift = plan;
    else gift = 'dated';
  }
  const storeKnown = 'store_is_pro' in row && typeof row.store_is_pro === 'boolean';
  const store = storeKnown && row.store_is_pro === true;
  const ever = count(row.completed_ever);
  const month = count(row.completed_month);
  let usage: AccessUsage | null = null;
  if (ever != null && month != null) {
    const proLimit = count(row.pro_month_limit) ?? 300;
    const pro = active || store;
    if (pro) {
      usage = { kind: 'fair', count: month, limit: proLimit, remaining: Math.max(0, proLimit - month) };
    } else if ('free_month_limit' in row && row.free_month_limit == null) {
      usage = { kind: 'open', count: month, limit: null, remaining: null };
    } else {
      const freeLimit = count(row.free_month_limit) ?? 25;
      usage = { kind: 'month', count: month, limit: freeLimit, remaining: Math.max(0, freeLimit - month) };
    }
  }
  return {
    giftKnown,
    gift: giftKnown ? gift : 'none',
    giftUntil: until,
    storeKnown,
    store,
    usage,
  };
}
