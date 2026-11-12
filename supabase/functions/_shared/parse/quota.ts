export const FREE_MONTHLY_RECORDINGS = 25;
export const PRO_FAIR_USE_RECORDINGS = 1000;
/** Catalog list prices in USD. The paywall must not show these as the user's store price. */
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

/** Full recordings a new free account finishes before any paywall. The monthly cap stays 25. */
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
  enforceDurationCap: boolean;
};

/** Free-tier gate. Pro is not blocked here. The first few recordings are never cut short. */
export function decideFreeRecording(input: {
  isPro: boolean;
  completedEver: number;
  completedToday: number;
  completedMonth: number;
  durationSeconds: number;
  itemCount: number;
  limits: FreeLimitInput | null;
}): FreeLimitDecision {
  if (input.isPro) return { allowed: true, reason: null, enforceDurationCap: false };
  if (Math.max(0, input.completedEver) < RECORDINGS_BEFORE_PAYWALL) {
    return { allowed: true, reason: null, enforceDurationCap: false };
  }
  const limits = input.limits ?? {
    free_recordings_per_day: null,
    free_recordings_per_month: FREE_MONTHLY_RECORDINGS,
    free_max_seconds_per_recording: null,
    free_max_items: null,
  };
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

/** Show the paywall only after the account has already seen tasks from a few recordings. */
export function shouldPresentPaywall(completedEver: number, isPro: boolean): boolean {
  return !isPro && completedEver >= RECORDINGS_BEFORE_PAYWALL;
}
