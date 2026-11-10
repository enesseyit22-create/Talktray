import { fallbackOffers, type PlanId, type StoreOffer } from '@/services/billing-shared';

export type { PlanId, StoreOffer } from '@/services/billing-shared';
export { fallbackOffers } from '@/services/billing-shared';

export async function configurePurchases(_userId?: string): Promise<boolean> {
  return false;
}

export async function loadStoreOffers(): Promise<{
  available: boolean;
  offers: StoreOffer[];
  isPro: boolean;
}> {
  return { available: false, offers: fallbackOffers, isPro: false };
}

export async function purchaseOffer(
  _plan: PlanId,
): Promise<{ isPro: boolean; cancelled: boolean; unavailable: boolean }> {
  return { isPro: false, cancelled: false, unavailable: true };
}

export async function restorePurchases(): Promise<boolean> {
  return false;
}

export async function logOutPurchases(): Promise<void> {}
