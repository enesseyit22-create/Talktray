import { overrideIsActive, type ProOverrideSnapshot } from '@/lib/pro-grant';

/** Keep a known gift when the profile read fails. An explicit inactive result clears it. */
export function nextGiftUntil(previous: string | null, snap: ProOverrideSnapshot): string | null {
  if (snap.status === 'unknown') return previous;
  if (snap.status === 'active') return snap.until;
  return null;
}

/**
 * Recording counts still move, but a gift or store subscription is Pro fair use.
 * A server payload that says "free" must not replace an active gift with the free cap.
 */
export function mergeUsageState(input: {
  count: number;
  serverIsPro: boolean;
  serverLimit: number | null;
  storeIsPro: boolean;
  giftUntil: string | null;
  proLimit: number;
}): { count: number; isPro: boolean; limit: number } {
  const isPro = input.serverIsPro || input.storeIsPro || overrideIsActive(input.giftUntil);
  const limit = isPro ? input.proLimit : input.serverLimit == null ? Number.MAX_SAFE_INTEGER : input.serverLimit;
  return { count: Math.max(0, input.count), isPro, limit };
}
