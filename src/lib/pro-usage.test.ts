import { describe, expect, it } from 'vitest';

import { mergeUsageState, nextGiftUntil, nextPlanLimit } from '@/lib/pro-usage';

describe('gifted usage', () => {
  it('keeps a gift when the profile read fails', () => {
    expect(nextGiftUntil('infinity', { status: 'unknown' })).toBe('infinity');
    expect(nextGiftUntil('infinity', { status: 'inactive' })).toBeNull();
    expect(nextGiftUntil(null, { status: 'active', until: '+infinity' })).toBe('+infinity');
  });

  it('does not turn a gift into the free cap when the server says free', () => {
    expect(
      mergeUsageState({
        count: 8,
        serverIsPro: false,
        serverLimit: 25,
        storeIsPro: false,
        giftUntil: 'infinity',
        proLimit: 1000,
      }),
    ).toEqual({ count: 8, isPro: true, limit: 1000 });
  });

  it('keeps an admin free cap when the limits read fails', () => {
    expect(
      nextPlanLimit({ isPro: false, wasPro: false, currentLimit: 10, freeMonthLimit: undefined }),
    ).toBe(10);
  });

  it('shows an admin free cap, an open cap, and Pro fair use', () => {
    expect(nextPlanLimit({ isPro: false, wasPro: false, currentLimit: 25, freeMonthLimit: 40 })).toBe(40);
    expect(nextPlanLimit({ isPro: false, wasPro: false, currentLimit: 25, freeMonthLimit: null })).toBe(
      Number.MAX_SAFE_INTEGER,
    );
    expect(nextPlanLimit({ isPro: true, wasPro: false, currentLimit: 25, freeMonthLimit: 40 })).toBe(1000);
  });

  it('does not keep the Pro cap after a gift ends without a fresh free read', () => {
    expect(nextPlanLimit({ isPro: false, wasPro: true, currentLimit: 1000, freeMonthLimit: undefined })).toBe(25);
  });

  it('uses the free cap only when the gift has ended and the store is not Pro', () => {
    expect(
      mergeUsageState({
        count: 8,
        serverIsPro: false,
        serverLimit: 25,
        storeIsPro: false,
        giftUntil: '2020-01-01T00:00:00.000Z',
        proLimit: 1000,
      }),
    ).toEqual({ count: 8, isPro: false, limit: 25 });
  });
});
