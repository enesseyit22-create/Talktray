import { describe, expect, it } from 'vitest';

import { factsFromRpc, nextMonthReset, usageMeter, usageProgress } from './usage-meter';

const base = {
  completedEver: 1,
  completedMonth: 1,
  trialLimit: 3,
  freeMonthLimit: 25 as number | null,
  proMonthLimit: 300,
};

describe('usageMeter', () => {
  it('shows the free trial until three recordings are used', () => {
    expect(usageMeter(false, base)).toEqual({ kind: 'trial', count: 1, limit: 3 });
    expect(usageMeter(false, { ...base, completedEver: 3, completedMonth: 3 })).toEqual({
      kind: 'month',
      count: 3,
      limit: 25,
    });
  });

  it('shows the Pro fair-use cap for the month', () => {
    expect(usageMeter(true, { ...base, completedEver: 10, completedMonth: 4 })).toEqual({
      kind: 'month',
      count: 4,
      limit: 300,
    });
  });

  it('drops the bar when the free month is unlimited', () => {
    const meter = usageMeter(false, { ...base, completedEver: 4, freeMonthLimit: null });
    expect(meter).toEqual({ kind: 'open', count: 1, limit: null });
    expect(usageProgress(meter)).toBe(0);
    expect(usageProgress({ kind: 'trial', count: 2, limit: 3 })).toBeCloseTo(2 / 3);
  });

  it('reads the caller usage payload and falls back on junk', () => {
    expect(
      factsFromRpc(
        { completed_ever: 2, completed_month: 2, trial_limit: 3, free_month_limit: 25, pro_month_limit: 300 },
        base,
      ).completedEver,
    ).toBe(2);
    expect(factsFromRpc({ completed_ever: 'nope', free_month_limit: null }, base).freeMonthLimit).toBeNull();
  });

  it('resets at the next month in the user zone', () => {
    const reset = nextMonthReset(new Date('2026-11-11T12:00:00.000Z'), 'Europe/Istanbul');
    expect(reset.toISOString()).toBe('2026-11-30T21:00:00.000Z');
  });
});
