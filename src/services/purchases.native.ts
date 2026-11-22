import { Platform } from 'react-native';
import Purchases, {
  INTRO_ELIGIBILITY_STATUS,
  LOG_LEVEL,
  PURCHASES_ERROR_CODE,
  type PurchasesPackage,
} from 'react-native-purchases';

import { freeTrialDays } from '@/lib/store-price';

import { ENTITLEMENT_ID } from '../../shared/parse/quota';
import {
  offersFromPackages,
  offersHaveStorePrice,
  packageSummary,
  pickPlanPackage,
  resolveRevenueCatPublicKey,
  unpricedOffers,
} from '@/services/billing-offers';
import {
  REVENUECAT_ANDROID_SDK_KEY,
  REVENUECAT_IOS_SDK_KEY,
  REVENUECAT_OFFERING_ID,
  fallbackOffers,
  type OfferLoad,
  type PlanId,
  type PurchaseResult,
  type RestoreResult,
  type StoreOffer,
} from '@/services/billing-shared';
import { billingErrorParts, classifyStoreError } from '@/services/purchase-errors';

let configured = false;

/**
 * Adds trial days to offers whose product has a free intro phase this account can still use.
 * iOS asks the store; unknown eligibility shows no trial, so nobody is promised one they won't get.
 * Google Play lists the free phase only to eligible accounts.
 */
async function withTrials(offers: StoreOffer[], packages: PurchasesPackage[]): Promise<StoreOffer[]> {
  const picked = offers.map((offer) => pickPlanPackage(packages, offer.id)?.product ?? null);
  const days = picked.map((product) => (product ? freeTrialDays(product.introPrice) : null));
  if (!days.some(Boolean)) return offers;
  try {
    let eligible = picked.map(() => true);
    if (Platform.OS === 'ios') {
      const ids = picked.filter((product, index) => product && days[index]).map((product) => product!.identifier);
      const status = await Purchases.checkTrialOrIntroductoryPriceEligibility(ids);
      eligible = picked.map(
        (product) =>
          Boolean(product) &&
          status[product!.identifier]?.status === INTRO_ELIGIBILITY_STATUS.INTRO_ELIGIBILITY_STATUS_ELIGIBLE,
      );
    }
    return offers.map((offer, index) => ({ ...offer, trialDays: eligible[index] ? days[index] : null }));
  } catch (error) {
    logProblem('trial', error);
    return offers;
  }
}

/** Calls back whenever the store reports a renewal, expiry, or new purchase. */
export function onProChange(listener: (isPro: boolean) => void): () => void {
  if (!configured) return () => undefined;
  const handler = (info: { entitlements: { active: Record<string, unknown> } }) =>
    listener(Boolean(info.entitlements.active[ENTITLEMENT_ID]));
  Purchases.addCustomerInfoUpdateListener(handler);
  return () => {
    Purchases.removeCustomerInfoUpdateListener(handler);
  };
}
let cachedPackages: PurchasesPackage[] = [];

function publicKey(): string | undefined {
  const fromEnv =
    Platform.OS === 'ios'
      ? process.env.EXPO_PUBLIC_REVENUECAT_IOS_API_KEY
      : process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY;
  const fallback = Platform.OS === 'ios' ? REVENUECAT_IOS_SDK_KEY : REVENUECAT_ANDROID_SDK_KEY;
  if (Platform.OS !== 'ios' && Platform.OS !== 'android') return undefined;
  return resolveRevenueCatPublicKey(Platform.OS, fromEnv, fallback);
}

function logProblem(stage: string, error: unknown) {
  const parts = billingErrorParts(error);
  console.warn('[purchases]', stage, parts.code ?? 'none', parts.readable ?? '', parts.message);
}

export async function configurePurchases(userId?: string): Promise<boolean> {
  const key = publicKey();
  if (!key) {
    console.warn('[purchases] no public sdk key');
    return false;
  }
  try {
    if (!configured) {
      Purchases.setLogLevel(__DEV__ ? LOG_LEVEL.DEBUG : LOG_LEVEL.INFO);
      Purchases.configure({ apiKey: key });
      configured = true;
    }
  } catch (error) {
    logProblem('configure', error);
    return false;
  }
  if (!userId) return true;
  try {
    await Purchases.logIn(userId);
  } catch (error) {
    // Offerings still come from the store account. A login failure must not hide local prices.
    logProblem('logIn', error);
  }
  return true;
}

async function readPro(): Promise<boolean> {
  const info = await Purchases.getCustomerInfo();
  return Boolean(info.entitlements.active[ENTITLEMENT_ID]);
}

async function safePro(): Promise<boolean> {
  try {
    return await readPro();
  } catch (error) {
    logProblem('customer', error);
    return false;
  }
}

export async function readStorePro(): Promise<boolean | null> {
  const ready = await configurePurchases();
  if (!ready) return null;
  try {
    return await readPro();
  } catch (error) {
    logProblem('customer', error);
    return null;
  }
}

async function currentPackages(): Promise<{ packages: PurchasesPackage[]; offeringId: string | null; failed: unknown | null }> {
  try {
    const offerings = await Purchases.getOfferings();
    const offering = offerings.all[REVENUECAT_OFFERING_ID] ?? offerings.current;
    const packages = offering?.availablePackages ?? [];
    if (packages.length) cachedPackages = packages;
    if (!offering) {
      console.warn('[purchases] no offering', Object.keys(offerings.all ?? {}).join(',') || 'none');
    }
    return { packages, offeringId: offering?.identifier ?? null, failed: null };
  } catch (error) {
    logProblem('offerings', error);
    return { packages: cachedPackages, offeringId: cachedPackages.length ? 'cache' : null, failed: error };
  }
}

export async function loadStoreOffers(): Promise<OfferLoad> {
  const ready = await configurePurchases();
  if (!ready) return { available: false, offers: unpricedOffers(), isPro: false, reason: 'not_configured' };
  const loaded = await currentPackages();
  if (loaded.failed && loaded.packages.length === 0) {
    const reason = classifyStoreError(billingErrorParts(loaded.failed).code, billingErrorParts(loaded.failed).readable);
    return {
      available: false,
      offers: fallbackOffers,
      isPro: await safePro(),
      reason: reason === 'network' ? 'network' : reason === 'not_configured' ? 'not_configured' : 'store',
    };
  }
  const offers = await withTrials(offersFromPackages(loaded.packages), loaded.packages);
  const isPro = await safePro();
  if (!loaded.offeringId) return { available: false, offers, isPro, reason: 'no_offering' };
  if (!offersHaveStorePrice(offers)) {
    console.warn('[purchases] no localized price', JSON.stringify(packageSummary(loaded.packages)));
    return { available: false, offers, isPro, reason: 'plans_missing' };
  }
  if (offers.some((offer) => !offer.price)) {
    console.warn('[purchases] partial prices', JSON.stringify(packageSummary(loaded.packages)));
  }
  return { available: true, offers, isPro, reason: 'ok' };
}

export async function purchaseOffer(plan: PlanId): Promise<PurchaseResult> {
  const ready = await configurePurchases();
  if (!ready) return { isPro: false, reason: 'not_configured' };
  const loaded = await currentPackages();
  if (loaded.failed && loaded.packages.length === 0) {
    const parts = billingErrorParts(loaded.failed);
    const reason = classifyStoreError(parts.code, parts.readable);
    return { isPro: false, reason: reason === 'cancelled' ? 'store' : reason };
  }
  const selected = pickPlanPackage(loaded.packages, plan);
  if (!selected) {
    console.warn('[purchases] package missing', plan, JSON.stringify(packageSummary(loaded.packages)));
    return { isPro: false, reason: 'plans_missing' };
  }
  try {
    const result = await Purchases.purchasePackage(selected);
    const isPro = Boolean(result.customerInfo.entitlements.active[ENTITLEMENT_ID]);
    if (!isPro) {
      console.warn('[purchases] entitlement inactive after purchase', ENTITLEMENT_ID);
      return { isPro: false, reason: 'entitlement_pending' };
    }
    return { isPro: true, reason: 'ok' };
  } catch (error) {
    const parts = billingErrorParts(error);
    const reason = classifyStoreError(parts.code, parts.readable);
    if (reason !== 'cancelled') logProblem('purchase', error);
    if (parts.code === PURCHASES_ERROR_CODE.PURCHASE_CANCELLED_ERROR) return { isPro: false, reason: 'cancelled' };
    return { isPro: false, reason };
  }
}

export async function restorePurchases(): Promise<RestoreResult> {
  const ready = await configurePurchases();
  if (!ready) return { isPro: false, reason: 'not_configured' };
  try {
    const info = await Purchases.restorePurchases();
    const isPro = Boolean(info.entitlements.active[ENTITLEMENT_ID]);
    return { isPro, reason: isPro ? 'ok' : 'restore_empty' };
  } catch (error) {
    logProblem('restore', error);
    const parts = billingErrorParts(error);
    const reason = classifyStoreError(parts.code, parts.readable);
    return { isPro: false, reason: reason === 'network' ? 'network' : 'store' };
  }
}

export async function logOutPurchases(): Promise<void> {
  cachedPackages = [];
  if (!configured) return;
  await Purchases.logOut().catch((error) => logProblem('logOut', error));
}
