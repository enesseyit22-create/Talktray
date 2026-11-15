export type StorePrice = {
  priceString: string;
  price: number;
  currencyCode: string;
  pricePerMonthString: string | null;
};

/** Localized store price. Falls back only when the package has no price string. */
export function priceLabel(product: StorePrice | null | undefined, fallback: string): string {
  const label = product?.priceString?.trim();
  return label || fallback;
}

/** Monthly equivalent of a yearly package, already formatted for the store locale. */
export function yearlyPerMonthLabel(product: StorePrice | null | undefined): string | null {
  const direct = product?.pricePerMonthString?.trim();
  if (direct) return direct;
  if (!product || !Number.isFinite(product.price) || product.price <= 0 || !product.currencyCode) return null;
  try {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency: product.currencyCode }).format(product.price / 12);
  } catch {
    return null;
  }
}

export type IntroPrice = {
  price: number;
  cycles: number;
  periodUnit: string;
  periodNumberOfUnits: number;
};

const UNIT_DAYS: Record<string, number> = { DAY: 1, WEEK: 7, MONTH: 30, YEAR: 365 };

/** Length of a free trial in days, or null when the intro offer is missing or not free. */
export function freeTrialDays(intro: IntroPrice | null | undefined): number | null {
  if (!intro || intro.price !== 0) return null;
  const unit = UNIT_DAYS[intro.periodUnit?.toUpperCase()];
  const units = intro.periodNumberOfUnits * Math.max(1, intro.cycles || 1);
  if (!unit || !Number.isFinite(units) || units <= 0) return null;
  return unit * units;
}
