export const FREE_MONTHLY_RECORDINGS = 25;
export const PRO_FAIR_USE_RECORDINGS = 300;
export const MONTHLY_PRICE = '$7.99';
export const YEARLY_PRICE = '$49.99';
export const ENTITLEMENT_ID = 'pro';

export function recordingLimit(isPro: boolean): number {
  return isPro ? PRO_FAIR_USE_RECORDINGS : FREE_MONTHLY_RECORDINGS;
}

export function evaluateQuota(count: number, isPro: boolean): {
  allowed: boolean;
  limit: number;
  remaining: number;
} {
  const limit = recordingLimit(isPro);
  const safeCount = Math.max(0, count);
  return {
    allowed: safeCount < limit,
    limit,
    remaining: Math.max(0, limit - safeCount),
  };
}

/**
 * Successful recordings a free account finishes before any paywall.
 * The monthly cap stays FREE_MONTHLY_RECORDINGS. This floor only stops a
 * tighter limit from blocking the first recordings, which are never cut short.
 * Keep in sync with public.reserve_monthly_credit.
 */
export const RECORDINGS_BEFORE_PAYWALL = 3;

export type FreeLimitInput = {
  free_recordings_per_day: number | null;
  free_recordings_per_month: number | null;
  free_max_seconds_per_recording: number | null;
  free_max_items: number | null;
};

export type FreeLimitReason = 'day' | 'month' | 'seconds' | 'items';

export type FreeLimitDecision = {
  allowed: boolean;
  reason: FreeLimitReason | null;
  /** When false, do not stop a recording early for the seconds cap. */
  enforceDurationCap: boolean;
};

const OPEN_LIMITS: FreeLimitInput = {
  free_recordings_per_day: null,
  free_recordings_per_month: FREE_MONTHLY_RECORDINGS,
  free_max_seconds_per_recording: null,
  free_max_items: null,
};

/** Free-tier gate shared by the app and process-recording. Pro is not blocked here. */
export function decideFreeRecording(input: {
  isPro: boolean;
  /** Non-failed recordings, excluding the one being processed. */
  completedEver: number;
  completedToday: number;
  completedMonth: number;
  durationSeconds: number;
  itemCount: number;
  limits: FreeLimitInput | null;
}): FreeLimitDecision {
  if (input.isPro) return { allowed: true, reason: null, enforceDurationCap: false };
  const completedEver = Math.max(0, input.completedEver);
  if (completedEver < RECORDINGS_BEFORE_PAYWALL) {
    return { allowed: true, reason: null, enforceDurationCap: false };
  }
  const limits = input.limits ?? OPEN_LIMITS;
  if (
    limits.free_max_seconds_per_recording != null &&
    input.durationSeconds > limits.free_max_seconds_per_recording
  ) {
    return { allowed: false, reason: 'seconds', enforceDurationCap: true };
  }
  if (limits.free_recordings_per_day != null && input.completedToday >= limits.free_recordings_per_day) {
    return { allowed: false, reason: 'day', enforceDurationCap: true };
  }
  if (limits.free_recordings_per_month != null && input.completedMonth >= limits.free_recordings_per_month) {
    return { allowed: false, reason: 'month', enforceDurationCap: true };
  }
  if (limits.free_max_items != null && input.itemCount >= limits.free_max_items) {
    return { allowed: false, reason: 'items', enforceDurationCap: true };
  }
  return {
    allowed: true,
    reason: null,
    enforceDurationCap: limits.free_max_seconds_per_recording != null,
  };
}

/** The paywall opens only after the free account has already seen tasks from a few recordings. */
export function shouldPresentPaywall(completedEver: number, isPro: boolean): boolean {
  return !isPro && completedEver >= RECORDINGS_BEFORE_PAYWALL;
}
