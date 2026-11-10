import { ENTITLEMENT_ID, MONTHLY_PRICE, YEARLY_PRICE } from '../../shared/parse/quota';

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
};

export const fallbackOffers: StoreOffer[] = [
  { id: 'monthly', price: MONTHLY_PRICE, title: 'Monthly' },
  { id: 'yearly', price: YEARLY_PRICE, title: 'Yearly' },
];
