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
