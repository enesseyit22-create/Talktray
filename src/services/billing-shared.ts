import { MONTHLY_PRICE, YEARLY_PRICE } from '../../shared/parse/quota';

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
