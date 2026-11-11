import { yearlyPerMonthLabel, type StorePrice } from '@/lib/store-price';
import {
  REVENUECAT_ANNUAL_PACKAGE,
  REVENUECAT_MONTHLY_PACKAGE,
  fallbackOffers,
  type PlanId,
  type StoreOffer,
} from '@/services/billing-shared';

export type StorePackageLike = {
  identifier: string;
  packageType: string;
  product?: {
    identifier?: string;
    priceString?: string | null;
    price?: number;
    currencyCode?: string;
    pricePerMonthString?: string | null;
    subscriptionPeriod?: string | null;
  } | null;
};

/** A public SDK key the app can send to RevenueCat. Empty and placeholder values are rejected. */
export function resolveRevenueCatPublicKey(
  platform: 'ios' | 'android',
  envValue: string | undefined,
  fallback: string,
): string | undefined {
  const prefix = platform === 'ios' ? 'appl_' : 'goog_';
  const usable = (value: string | undefined) => {
    const key = value?.trim() ?? '';
    if (key.length <= 8 || key.includes('YOUR_') || /^(undefined|null|false|true)$/i.test(key)) return undefined;
    if (!key.startsWith(prefix)) return undefined;
    return key;
  };
  return usable(envValue) ?? usable(fallback);
}

export function localizedStorePrice(product: { priceString?: string | null } | null | undefined): string | null {
  const label = product?.priceString?.trim();
  return label || null;
}

function productId(pkg: StorePackageLike): string {
  return (pkg.product?.identifier ?? '').trim().toLowerCase();
}

function period(pkg: StorePackageLike): string {
  return (pkg.product?.subscriptionPeriod ?? '').trim().toUpperCase();
}

/** Lower is a better match. -1 means this package is not the plan. */
function matchRank(pkg: StorePackageLike, plan: PlanId): number {
  const product = productId(pkg);
  if (plan === 'monthly') {
    if (pkg.identifier === REVENUECAT_MONTHLY_PACKAGE) return 0;
    if (product === 'talktray_pro_monthly' || product === 'talktray_pro:monthly') return 1;
    if (pkg.packageType === 'MONTHLY') return 2;
    if (product.startsWith('talktray_pro') && period(pkg) === 'P1M') return 3;
    return -1;
  }
  if (pkg.identifier === REVENUECAT_ANNUAL_PACKAGE) return 0;
  if (product === 'talktray_pro_annual' || product === 'talktray_pro:annual') return 1;
  if (pkg.packageType === 'ANNUAL') return 2;
  if (product.startsWith('talktray_pro') && period(pkg) === 'P1Y') return 3;
  return -1;
}

export function pickPlanPackage<T extends StorePackageLike>(packages: T[], plan: PlanId): T | null {
  let best: T | null = null;
  let bestRank = Number.POSITIVE_INFINITY;
  for (const pkg of packages) {
    const rank = matchRank(pkg, plan);
    if (rank >= 0 && rank < bestRank) {
      best = pkg;
      bestRank = rank;
    }
  }
  return best;
}

function asStorePrice(product: StorePackageLike['product']): StorePrice | null {
  if (!product) return null;
  return {
    priceString: product.priceString ?? '',
    price: typeof product.price === 'number' ? product.price : Number.NaN,
    currencyCode: product.currencyCode ?? '',
    pricePerMonthString: product.pricePerMonthString ?? null,
  };
}

/** Store offers. A missing package stays unpriced — never a hardcoded currency. */
export function offersFromPackages(packages: StorePackageLike[]): StoreOffer[] {
  const monthly = pickPlanPackage(packages, 'monthly');
  const yearly = pickPlanPackage(packages, 'yearly');
  return [
    { id: 'monthly', price: localizedStorePrice(monthly?.product), title: 'Monthly', perMonth: null },
    {
      id: 'yearly',
      price: localizedStorePrice(yearly?.product),
      title: 'Yearly',
      perMonth: yearlyPerMonthLabel(asStorePrice(yearly?.product)),
    },
  ];
}

export function offersHaveStorePrice(offers: StoreOffer[]): boolean {
  return offers.some((offer) => Boolean(offer.price));
}

export function unpricedOffers(): StoreOffer[] {
  return fallbackOffers.map((offer) => ({ ...offer, price: null, perMonth: null }));
}

/** Safe to log. Package ids and currency, not prices that could be confused with secrets, and no API keys. */
export function packageSummary(packages: StorePackageLike[]) {
  return packages.map((pkg) => ({
    id: pkg.identifier,
    type: pkg.packageType,
    product: pkg.product?.identifier ?? null,
    currency: pkg.product?.currencyCode ?? null,
    priced: Boolean(pkg.product?.priceString?.trim()),
  }));
}
