import { describe, expect, it } from 'vitest';

import { formatMoney, regionalPrice, yearlySavingsPercent } from '@/lib/regional-price';

describe('regional prices', () => {
  it('uses Turkish lira in Turkey', () => {
    const price = regionalPrice('TR');
    expect(price.currency).toBe('TRY');
    expect(formatMoney(price.monthly, price.currency, 'tr-TR')).toContain('₺');
  });

  it('uses euro across the euro area and dollars elsewhere', () => {
    expect(regionalPrice('de').currency).toBe('EUR');
    expect(regionalPrice('FR').currency).toBe('EUR');
    expect(regionalPrice('ZZ').currency).toBe('USD');
    expect(regionalPrice(null).currency).toBe('USD');
  });

  it('drops decimals for whole amounts', () => {
    expect(formatMoney(1200, 'JPY', 'en-US')).toBe('¥1,200');
  });

  it('computes the yearly saving', () => {
    expect(yearlySavingsPercent(7.99, 49.99)).toBe(47);
    expect(yearlySavingsPercent(199.99, 1299.99)).toBe(45);
    expect(yearlySavingsPercent(10, 120)).toBeNull();
    expect(yearlySavingsPercent(null, 49.99)).toBeNull();
  });
});
