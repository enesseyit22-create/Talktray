import { describe, expect, it } from 'vitest';

import { offersFromPackages, pickPlanPackage, resolveRevenueCatPublicKey, type StorePackageLike } from '@/services/billing-offers';

const monthly: StorePackageLike = {
  identifier: '$rc_monthly',
  packageType: 'MONTHLY',
  product: { identifier: 'talktray_pro_monthly', priceString: '₺249,99', price: 249.99, currencyCode: 'TRY', pricePerMonthString: null },
};

const yearly: StorePackageLike = {
  identifier: '$rc_annual',
  packageType: 'ANNUAL',
  product: {
    identifier: 'talktray_pro_annual',
    priceString: '₺1.499,99',
    price: 1499.99,
    currencyCode: 'TRY',
    pricePerMonthString: '₺124,99',
  },
};

describe('store offer prices', () => {
  it('keeps a public key and rejects an empty production env', () => {
    const ios = 'appl_testkeyvalue0001';
    const android = 'goog_testkeyvalue0001';
    expect(resolveRevenueCatPublicKey('ios', '', ios)).toBe(ios);
    expect(resolveRevenueCatPublicKey('ios', 'undefined', ios)).toBe(ios);
    expect(resolveRevenueCatPublicKey('android', 'goog_x', android)).toBe(android);
    expect(resolveRevenueCatPublicKey('ios', android, ios)).toBe(ios);
    expect(resolveRevenueCatPublicKey('ios', 'appl_rotatedKeyValue123', ios)).toBe('appl_rotatedKeyValue123');
  });

  it('uses the store price string and never a hardcoded dollar fallback', () => {
    const offers = offersFromPackages([monthly, yearly]);
    expect(offers.map((offer) => offer.price)).toEqual(['₺249,99', '₺1.499,99']);
    expect(offers[1]?.perMonth).toBe('₺124,99');
  });

  it('leaves a missing package unpriced', () => {
    const offers = offersFromPackages([monthly]);
    expect(offers[0]?.price).toBe('₺249,99');
    expect(offers[1]?.price).toBeNull();
  });

  it('matches Play base plans when the package id is custom', () => {
    const packages: StorePackageLike[] = [
      {
        identifier: 'custom_month',
        packageType: 'CUSTOM',
        product: { identifier: 'talktray_pro:monthly', priceString: '₺249,99', price: 249.99, currencyCode: 'TRY', subscriptionPeriod: 'P1M' },
      },
      {
        identifier: 'custom_year',
        packageType: 'CUSTOM',
        product: { identifier: 'talktray_pro:annual', priceString: '₺1.499,99', price: 1499.99, currencyCode: 'TRY', subscriptionPeriod: 'P1Y' },
      },
    ];
    expect(pickPlanPackage(packages, 'monthly')?.identifier).toBe('custom_month');
    expect(pickPlanPackage(packages, 'yearly')?.product?.identifier).toBe('talktray_pro:annual');
    expect(offersFromPackages(packages).every((offer) => offer.price?.includes('₺'))).toBe(true);
  });
});
