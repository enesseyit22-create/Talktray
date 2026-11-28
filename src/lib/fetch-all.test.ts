import { describe, expect, it } from 'vitest';

import { fetchAllPages } from '@/lib/fetch-all';

describe('fetchAllPages', () => {
  const source = Array.from({ length: 2500 }, (_, index) => index);
  const pager = (from: number, to: number) => Promise.resolve({ data: source.slice(from, to + 1), error: null });

  it('reads past the first 1000 rows', async () => {
    const result = await fetchAllPages(pager);
    expect(result.data).toHaveLength(2500);
    expect(result.data?.[2499]).toBe(2499);
  });

  it('stops after one short page', async () => {
    let calls = 0;
    await fetchAllPages((from, to) => {
      calls += 1;
      return Promise.resolve({ data: source.slice(from, Math.min(to + 1, 10)), error: null });
    });
    expect(calls).toBe(1);
  });

  it('returns the first error', async () => {
    const result = await fetchAllPages(() => Promise.resolve({ data: null, error: new Error('x') }));
    expect(result.data).toBeNull();
    expect(result.error).toBeInstanceOf(Error);
  });
});
