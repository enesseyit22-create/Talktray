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
