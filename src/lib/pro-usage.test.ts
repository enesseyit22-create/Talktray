import { describe, expect, it } from 'vitest';

import { mergeUsageState, nextGiftUntil } from '@/lib/pro-usage';

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
        proLimit: 300,
      }),
    ).toEqual({ count: 8, isPro: true, limit: 300 });
  });

  it('uses the free cap only when the gift has ended and the store is not Pro', () => {
    expect(
      mergeUsageState({
        count: 8,
        serverIsPro: false,
        serverLimit: 25,
        storeIsPro: false,
        giftUntil: '2020-01-01T00:00:00.000Z',
        proLimit: 300,
      }),
    ).toEqual({ count: 8, isPro: false, limit: 25 });
  });
});
