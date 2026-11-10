import { describe, expect, it } from 'vitest';

import { priceLabel, yearlyPerMonthLabel } from '@/lib/store-price';

describe('store prices', () => {
  it('uses the store price string', () => {
    expect(
      priceLabel(
        { priceString: '₺249,99', price: 249.99, currencyCode: 'TRY', pricePerMonthString: null },
        '$7.99',
      ),
    ).toBe('₺249,99');
  });

  it('prefers the store monthly equivalent for a yearly plan', () => {
    expect(
      yearlyPerMonthLabel({
        priceString: '49,99 €',
        price: 49.99,
        currencyCode: 'EUR',
        pricePerMonthString: '4,17 €',
      }),
    ).toBe('4,17 €');
  });

  it('formats a monthly equivalent in the product currency when the store omits one', () => {
    const label = yearlyPerMonthLabel({
      priceString: '€49.99',
      price: 49.99,
      currencyCode: 'EUR',
      pricePerMonthString: null,
    });
    expect(label?.replace(/\s/g, '')).toMatch(/4[,.]17/);
    expect(label).toMatch(/€|EUR/);
  });
});
