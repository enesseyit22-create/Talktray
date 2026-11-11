import { ENTITLEMENT_ID } from '../../shared/parse/quota';

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
  /** Localized store price. Null until StoreKit or Play returns one. */
  price: string | null;
  title: string;
  /** Localized monthly equivalent for a yearly plan. Null when the store did not provide one. */
  perMonth: string | null;
};

/** Empty prices. The paywall must not invent a currency while the store is loading or unavailable. */
export const fallbackOffers: StoreOffer[] = [
  { id: 'monthly', price: null, title: 'Monthly', perMonth: null },
  { id: 'yearly', price: null, title: 'Yearly', perMonth: null },
];

export type OfferLoadReason = 'ok' | 'not_configured' | 'network' | 'no_offering' | 'plans_missing' | 'store';

export type OfferLoad = {
  available: boolean;
  offers: StoreOffer[];
  isPro: boolean;
  reason: OfferLoadReason;
};

export type PurchaseReason =
  | 'ok'
  | 'cancelled'
  | 'not_configured'
  | 'plans_missing'
  | 'network'
  | 'pending'
  | 'already_owned'
  | 'not_allowed'
  | 'store'
  | 'entitlement_pending';

export type PurchaseResult = {
  isPro: boolean;
  reason: PurchaseReason;
};

export type RestoreResult = {
  isPro: boolean;
  reason: 'ok' | 'restore_empty' | 'not_configured' | 'network' | 'store';
};
