import { normalizeOverrideUntil } from '@/lib/pro-grant';
import { PRO_FAIR_USE_RECORDINGS, RECORDINGS_BEFORE_PAYWALL } from '../../shared/parse/quota';
import { zonedParts, zonedTimeToUtc } from '../../shared/parse/time';

type LimitValue = { free_recordings_per_month: number | null } | null;

function monthStart(now: Date, timeZone: string): number {
  const parts = zonedParts(now, timeZone);
  return zonedTimeToUtc({ year: parts.year, month: parts.month, day: 1, hour: 0, minute: 0 }, timeZone).getTime();
}

export type UsageFacts = {
  completedEver: number;
  completedMonth: number;
  trialLimit: number;
  freeMonthLimit: number | null;
  proMonthLimit: number;
};

export type UsageMeter =
  | { kind: 'trial'; count: number; limit: number }
  | { kind: 'month'; count: number; limit: number }
  | { kind: 'open'; count: number; limit: null };

/**
 * What the profile card and paywall count. Free accounts show the monthly free
 * cap from settings (25 unless an admin changed it, or open when that cap is
 * unset). Pro, including an admin gift, shows the fair-use cap. The first few
 * recordings still skip enforcement; that gate is not a separate displayed quota.
 */
export function usageMeter(isPro: boolean, facts: UsageFacts): UsageMeter {
  if (isPro) return { kind: 'month', count: facts.completedMonth, limit: facts.proMonthLimit };
  if (facts.freeMonthLimit == null) return { kind: 'open', count: facts.completedMonth, limit: null };
  return { kind: 'month', count: facts.completedMonth, limit: facts.freeMonthLimit };
}

export function usageProgress(meter: UsageMeter): number {
  if (meter.limit == null || meter.limit <= 0) return 0;
  return Math.min(1, Math.max(0, meter.count) / meter.limit);
}

export function nextMonthReset(now: Date, timeZone: string): Date {
  const parts = zonedParts(now, timeZone);
  const year = parts.month === 12 ? parts.year + 1 : parts.year;
  const month = parts.month === 12 ? 1 : parts.month + 1;
  return zonedTimeToUtc({ year, month, day: 1, hour: 0, minute: 0 }, timeZone);
}

export function factsFromRecordings(
  recordings: { status: string; createdAt: string }[],
  timeZone: string,
  limits: LimitValue,
  now = new Date(),
): UsageFacts {
  const active = recordings.filter((recording) => recording.status !== 'failed');
  const start = monthStart(now, timeZone);
  return {
    completedEver: active.length,
    completedMonth: active.filter((recording) => new Date(recording.createdAt).getTime() >= start).length,
    trialLimit: RECORDINGS_BEFORE_PAYWALL,
    freeMonthLimit: limits == null ? 25 : limits.free_recordings_per_month,
    proMonthLimit: PRO_FAIR_USE_RECORDINGS,
  };
}

export function factsFromRpc(value: unknown, fallback: UsageFacts): UsageFacts {
  const row = value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
  const number = (key: string, fallbackNumber: number) => {
    const raw = row[key];
    const parsed = typeof raw === 'number' ? raw : Number(raw);
    return Number.isInteger(parsed) && parsed >= 0 ? parsed : fallbackNumber;
  };
  const freeMonthLimit = !('free_month_limit' in row)
    ? fallback.freeMonthLimit
    : row.free_month_limit == null
      ? null
      : number('free_month_limit', fallback.freeMonthLimit ?? 25);
  return {
    completedEver: number('completed_ever', fallback.completedEver),
    completedMonth: number('completed_month', fallback.completedMonth),
    trialLimit: number('trial_limit', RECORDINGS_BEFORE_PAYWALL),
    freeMonthLimit,
    proMonthLimit: number('pro_month_limit', PRO_FAIR_USE_RECORDINGS),
  };
}

/** Undefined when this server build does not report gifts. Null means no active grant. */
export function giftUntilFromRpc(value: unknown): string | null | undefined {
  if (!value || typeof value !== 'object' || !('gift_until' in value)) return undefined;
  return normalizeOverrideUntil((value as Record<string, unknown>).gift_until);
}
