import { fallbackOffers, type OfferLoad, type PlanId, type PurchaseResult, type RestoreResult } from '@/services/billing-shared';

export type { PlanId, StoreOffer } from '@/services/billing-shared';
export type { OfferLoad, PurchaseResult, RestoreResult } from '@/services/billing-shared';
export { fallbackOffers } from '@/services/billing-shared';

export async function configurePurchases(_userId?: string): Promise<boolean> {
  return false;
}

export async function readStorePro(): Promise<boolean | null> {
  return null;
}

export async function loadStoreOffers(): Promise<OfferLoad> {
  return { available: false, offers: fallbackOffers, isPro: false, reason: 'not_configured' };
}

export async function purchaseOffer(_plan: PlanId): Promise<PurchaseResult> {
  return { isPro: false, reason: 'not_configured' };
}

export async function restorePurchases(): Promise<RestoreResult> {
  return { isPro: false, reason: 'not_configured' };
}

export async function logOutPurchases(): Promise<void> {}
