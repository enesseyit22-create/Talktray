/**
 * Display prices for when the App Store / Google Play price is not available
 * (web, demo mode, offline, or before RevenueCat answers).
 *
 * The store price always wins. Keep these numbers equal to the prices set in
 * App Store Connect and Google Play for each region, or the paywall will show
 * one price and the store sheet another.
 */
export type RegionalPrice = {
  currency: string;
  monthly: number;
  yearly: number;
};

const USD: RegionalPrice = { currency: 'USD', monthly: 7.99, yearly: 49.99 };
const EUR: RegionalPrice = { currency: 'EUR', monthly: 7.99, yearly: 49.99 };

const EURO_REGIONS = [
  'AT', 'BE', 'CY', 'DE', 'EE', 'ES', 'FI', 'FR', 'GR', 'HR', 'IE', 'IT',
  'LT', 'LU', 'LV', 'MT', 'NL', 'PT', 'SI', 'SK',
];

/** Region (ISO 3166-1 alpha-2) → local price. Unlisted regions use USD. */
export const REGIONAL_PRICES: Record<string, RegionalPrice> = {
  US: USD,
  TR: { currency: 'TRY', monthly: 199.99, yearly: 1299.99 },
  GB: { currency: 'GBP', monthly: 6.99, yearly: 44.99 },
  JP: { currency: 'JPY', monthly: 1200, yearly: 7800 },
  KR: { currency: 'KRW', monthly: 11000, yearly: 69000 },
  BR: { currency: 'BRL', monthly: 24.9, yearly: 159.9 },
  ID: { currency: 'IDR', monthly: 79000, yearly: 499000 },
  CA: { currency: 'CAD', monthly: 10.99, yearly: 69.99 },
  AU: { currency: 'AUD', monthly: 11.99, yearly: 74.99 },
  CH: { currency: 'CHF', monthly: 7.99, yearly: 49.99 },
  MX: { currency: 'MXN', monthly: 99, yearly: 649 },
  ...Object.fromEntries(EURO_REGIONS.map((code) => [code, EUR])),
};

export function regionalPrice(regionCode: string | null | undefined): RegionalPrice {
  const code = regionCode?.trim().toUpperCase();
  return (code && REGIONAL_PRICES[code]) || USD;
}

/** Formats an amount in the given currency for the device language. */
export function formatMoney(amount: number, currency: string, languageTag?: string | null): string {
  const minor = amount % 1 === 0 ? 0 : 2;
  try {
    return new Intl.NumberFormat(languageTag || undefined, {
      style: 'currency',
      currency,
      minimumFractionDigits: minor,
      maximumFractionDigits: minor,
    }).format(amount);
  } catch {
    return `${amount.toFixed(minor)} ${currency}`;
  }
}

/** Whole-percent saving of the yearly plan against twelve monthly payments. Null when not a saving. */
export function yearlySavingsPercent(monthly: number | null | undefined, yearly: number | null | undefined): number | null {
  if (!monthly || !yearly || !Number.isFinite(monthly) || !Number.isFinite(yearly)) return null;
  if (monthly <= 0 || yearly <= 0) return null;
  const pct = Math.floor((1 - yearly / (monthly * 12)) * 100);
  return pct >= 5 ? pct : null;
}
