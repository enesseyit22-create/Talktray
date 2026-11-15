import { getLocales } from 'expo-localization';

import { ENTITLEMENT_ID } from '../../shared/parse/quota';
import { formatMoney, regionalPrice } from '@/lib/regional-price';

/** Public SDK keys. Used when EXPO_PUBLIC_REVENUECAT_* is unset. */
export const REVENUECAT_IOS_SDK_KEY = 'appl_RgzWQMZehRfiafWyReOAOBMlTgD';
export const REVENUECAT_ANDROID_SDK_KEY = 'goog_PBSMDAoJJABsIyxqmhhcXSCorNT';

export const REVENUECAT_OFFERING_ID = 'default';
export const REVENUECAT_MONTHLY_PACKAGE = '$rc_monthly';
export const REVENUECAT_ANNUAL_PACKAGE = '$rc_annual';

export const STORE_PRODUCTS = {
  entitlement: ENTITLEMENT_ID,
  offering: REVENUECAT_OFFERING_ID,
  packages: {
    monthly: REVENUECAT_MONTHLY_PACKAGE,
    annual: REVENUECAT_ANNUAL_PACKAGE,
  },
  ios: {
    monthly: 'talktray_pro_monthly',
    annual: 'talktray_pro_annual',
  },
  android: {
    subscription: 'talktray_pro',
    monthlyBasePlan: 'monthly',
    annualBasePlan: 'annual',
  },
} as const;

export type PlanId = 'monthly' | 'yearly';

export type StoreOffer = {
  id: PlanId;
  price: string;
  title: string;
  /** Localized monthly equivalent for a yearly plan. Null when the store did not provide one. */
  perMonth: string | null;
  /** Numeric price in the offer's currency, used for the yearly saving badge. */
  amount: number | null;
  /** Free trial length for this account. Only set when the store confirmed eligibility. */
  trialDays?: number | null;
};

/** The device region and language, e.g. TR / tr-TR. */
export function deviceRegion(): { regionCode: string | null; languageTag: string | null } {
  try {
    const first = getLocales()[0];
    return { regionCode: first?.regionCode ?? null, languageTag: first?.languageTag ?? null };
  } catch {
    return { regionCode: null, languageTag: null };
  }
}

/** Offers in the device region's currency, shown until the store answers with its own prices. */
export function fallbackOffers(region = deviceRegion()): StoreOffer[] {
  const local = regionalPrice(region.regionCode);
  const money = (amount: number) => formatMoney(amount, local.currency, region.languageTag);
  return [
    { id: 'monthly', price: money(local.monthly), title: 'Monthly', perMonth: null, amount: local.monthly },
    {
      id: 'yearly',
      price: money(local.yearly),
      title: 'Yearly',
      perMonth: money(Math.round((local.yearly / 12) * 100) / 100),
      amount: local.yearly,
    },
  ];
}
