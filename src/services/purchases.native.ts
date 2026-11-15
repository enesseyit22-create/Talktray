import { Platform } from 'react-native';
import Purchases, {
  INTRO_ELIGIBILITY_STATUS,
  LOG_LEVEL,
  PACKAGE_TYPE,
  PURCHASES_ERROR_CODE,
  type PurchasesStoreProduct,
} from 'react-native-purchases';

import { ENTITLEMENT_ID } from '../../shared/parse/quota';
import { freeTrialDays, priceLabel, yearlyPerMonthLabel } from '@/lib/store-price';
import {
  fallbackOffers,
  REVENUECAT_ANDROID_SDK_KEY,
  REVENUECAT_ANNUAL_PACKAGE,
  REVENUECAT_IOS_SDK_KEY,
  REVENUECAT_MONTHLY_PACKAGE,
  REVENUECAT_OFFERING_ID,
  type PlanId,
  type StoreOffer,
} from '@/services/billing-shared';

let configured = false;

/**
 * Trial days per product, only where the store says this account can still take the trial.
 * Unknown eligibility shows no trial, so nobody is promised a free week they will be charged for.
 */
async function eligibleTrials(products: (PurchasesStoreProduct | undefined)[]): Promise<Record<string, number>> {
  const withTrial = products.filter(
    (product): product is PurchasesStoreProduct => Boolean(product && freeTrialDays(product.introPrice)),
  );
  if (!withTrial.length) return {};
  const result: Record<string, number> = {};
  try {
    if (Platform.OS === 'ios') {
      const eligibility = await Purchases.checkTrialOrIntroductoryPriceEligibility(
        withTrial.map((product) => product.identifier),
      );
      for (const product of withTrial) {
        if (eligibility[product.identifier]?.status === INTRO_ELIGIBILITY_STATUS.INTRO_ELIGIBILITY_STATUS_ELIGIBLE) {
          result[product.identifier] = freeTrialDays(product.introPrice) ?? 0;
        }
      }
    } else {
      // Google Play only lists the free phase to accounts that can still use it.
      for (const product of withTrial) result[product.identifier] = freeTrialDays(product.introPrice) ?? 0;
    }
  } catch {
    return {};
  }
  return result;
}

function publicKey(): string | undefined {
  const fromEnv =
    Platform.OS === 'ios'
      ? process.env.EXPO_PUBLIC_REVENUECAT_IOS_API_KEY
      : process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY;
  const fallback = Platform.OS === 'ios' ? REVENUECAT_IOS_SDK_KEY : REVENUECAT_ANDROID_SDK_KEY;
  const key = fromEnv && !fromEnv.includes('YOUR_') && fromEnv.length > 8 ? fromEnv : fallback;
  return key.length > 8 ? key : undefined;
}

export async function configurePurchases(userId?: string): Promise<boolean> {
  const key = publicKey();
  if (!key) return false;
  try {
    if (!configured) {
      Purchases.setLogLevel(__DEV__ ? LOG_LEVEL.DEBUG : LOG_LEVEL.INFO);
      Purchases.configure({ apiKey: key });
      configured = true;
    }
    if (userId) await Purchases.logIn(userId);
    return true;
  } catch {
    return false;
  }
}

async function readPro(): Promise<boolean> {
  const info = await Purchases.getCustomerInfo();
  return Boolean(info.entitlements.active[ENTITLEMENT_ID]);
}

export async function loadStoreOffers(): Promise<{
  available: boolean;
  offers: StoreOffer[];
  isPro: boolean;
}> {
  const ready = await configurePurchases();
  if (!ready) return { available: false, offers: fallbackOffers(), isPro: false };
  try {
    const offerings = await Purchases.getOfferings();
    const offering = offerings.all[REVENUECAT_OFFERING_ID] ?? offerings.current;
    const packages = offering?.availablePackages ?? [];
    const monthly =
      packages.find((pkg) => pkg.identifier === REVENUECAT_MONTHLY_PACKAGE) ??
      packages.find((pkg) => pkg.packageType === PACKAGE_TYPE.MONTHLY);
    const yearly =
      packages.find((pkg) => pkg.identifier === REVENUECAT_ANNUAL_PACKAGE) ??
      packages.find((pkg) => pkg.packageType === PACKAGE_TYPE.ANNUAL);
    const trials = await eligibleTrials([monthly?.product, yearly?.product]);
    const local = fallbackOffers();
    const [localMonthly, localYearly] = [local[0]!, local[1]!];
    // Mixing a store price with a local fallback would compare two currencies, so the
    // fallback amount is only used when the store returned neither product.
    const storeAmounts = Boolean(monthly?.product || yearly?.product);
    const offers: StoreOffer[] = [
      {
        id: 'monthly',
        price: priceLabel(monthly?.product, localMonthly.price),
        title: 'Monthly',
        perMonth: null,
        amount: storeAmounts ? (monthly?.product.price ?? null) : localMonthly.amount,
        trialDays: monthly ? trials[monthly.product.identifier] ?? null : null,
      },
      {
        id: 'yearly',
        price: priceLabel(yearly?.product, localYearly.price),
        title: 'Yearly',
        perMonth: yearly?.product ? yearlyPerMonthLabel(yearly.product) : localYearly.perMonth,
        amount: storeAmounts ? (yearly?.product.price ?? null) : localYearly.amount,
        trialDays: yearly ? trials[yearly.product.identifier] ?? null : null,
      },
    ];
    return { available: true, offers, isPro: await readPro() };
  } catch {
    return { available: false, offers: fallbackOffers(), isPro: false };
  }
}

export async function purchaseOffer(
  plan: PlanId,
): Promise<{ isPro: boolean; cancelled: boolean; unavailable: boolean }> {
  const ready = await configurePurchases();
  if (!ready) return { isPro: false, cancelled: false, unavailable: true };
  try {
    const offerings = await Purchases.getOfferings();
    const offering = offerings.all[REVENUECAT_OFFERING_ID] ?? offerings.current;
    const packages = offering?.availablePackages ?? [];
    const wantedId = plan === 'yearly' ? REVENUECAT_ANNUAL_PACKAGE : REVENUECAT_MONTHLY_PACKAGE;
    const wantedType = plan === 'yearly' ? PACKAGE_TYPE.ANNUAL : PACKAGE_TYPE.MONTHLY;
    const selected =
      packages.find((pkg) => pkg.identifier === wantedId) ??
      packages.find((pkg) => pkg.packageType === wantedType);
    if (!selected) return { isPro: false, cancelled: false, unavailable: true };
    const result = await Purchases.purchasePackage(selected);
    return {
      isPro: Boolean(result.customerInfo.entitlements.active[ENTITLEMENT_ID]),
      cancelled: false,
      unavailable: false,
    };
  } catch (error) {
    const code = (error as { code?: string }).code;
    if (code === PURCHASES_ERROR_CODE.PURCHASE_CANCELLED_ERROR) {
      return { isPro: false, cancelled: true, unavailable: false };
    }
    return { isPro: false, cancelled: false, unavailable: true };
  }
}

export async function restorePurchases(): Promise<boolean> {
  const ready = await configurePurchases();
  if (!ready) return false;
  const info = await Purchases.restorePurchases();
  return Boolean(info.entitlements.active[ENTITLEMENT_ID]);
}

export async function logOutPurchases(): Promise<void> {
  if (!configured) return;
  await Purchases.logOut().catch(() => undefined);
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
