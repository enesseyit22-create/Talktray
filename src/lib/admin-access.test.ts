import { describe, expect, it } from 'vitest';

import { accessView } from '@/lib/admin-access';

const now = Date.parse('2026-11-11T12:00:00.000Z');

describe('admin access view', () => {
  it('shows a gifted month as the 1000 fair-use cap, even when the payload still says 300', () => {
    const view = accessView(
      {
        pro_override_until: '2026-12-11T12:00:00.000Z',
        pro_override_plan: 'month',
        store_is_pro: false,
        completed_ever: 12,
        completed_month: 4,
        free_month_limit: 25,
        pro_month_limit: 300,
        trial_limit: 3,
      },
      now,
    );
    expect(view.gift).toBe('month');
    expect(view.usage).toEqual({ kind: 'fair', count: 4, limit: 1000, remaining: 996 });
  });

  it('treats lifetime and +infinity as a gift that does not use the free quota', () => {
    const view = accessView(
      {
        pro_override_until: '+infinity',
        completed_ever: '9',
        completed_month: 9,
        free_month_limit: 25,
      },
      now,
    );
    expect(view.gift).toBe('lifetime');
    expect(view.usage?.kind).toBe('fair');
    expect(view.usage?.limit).toBe(1000);
  });

  it('keeps store Pro on the fair-use meter', () => {
    const view = accessView(
      { pro_override_until: null, store_is_pro: true, completed_ever: 4, completed_month: 4, free_month_limit: 25 },
      now,
    );
    expect(view.gift).toBe('none');
    expect(view.store).toBe(true);
    expect(view.usage?.kind).toBe('fair');
  });

  it('shows the free monthly cap, not the paywall gate of 3', () => {
    const view = accessView(
      { pro_override_until: null, store_is_pro: false, completed_ever: 1, completed_month: 1, free_month_limit: 25, trial_limit: 3 },
      now,
    );
    expect(view.usage).toEqual({ kind: 'month', count: 1, limit: 25, remaining: 24 });
  });

  it('uses an admin-changed free cap for a new account', () => {
    const view = accessView(
      { pro_override_until: null, store_is_pro: false, completed_ever: 1, completed_month: 1, free_month_limit: 10, trial_limit: 3 },
      now,
    );
    expect(view.usage).toEqual({ kind: 'month', count: 1, limit: 10, remaining: 9 });
  });

  it('does not invent Free when the live list is still the old shape', () => {
    const view = accessView({}, now);
    expect(view.giftKnown).toBe(false);
    expect(view.usage).toBeNull();
    expect(view.storeKnown).toBe(false);
  });
});
