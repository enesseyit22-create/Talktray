import type { PurchaseReason } from '@/services/billing-shared';

/** Map a StoreKit / Play / RevenueCat error onto a user-facing reason. Codes are the numeric strings from the SDK. */
export function classifyStoreError(code: string | number | undefined, readable?: string | null): PurchaseReason {
  const values = new Set([String(code ?? ''), readable?.trim() ?? ''].filter(Boolean));
  const has = (...names: string[]) => names.some((name) => values.has(name));
  if (has('1', 'PURCHASE_CANCELLED_ERROR')) return 'cancelled';
  if (has('20', 'PAYMENT_PENDING_ERROR')) return 'pending';
  if (has('6', 'PRODUCT_ALREADY_PURCHASED_ERROR')) return 'already_owned';
  if (has('3', 'PURCHASE_NOT_ALLOWED_ERROR', '19', 'INSUFFICIENT_PERMISSIONS_ERROR')) return 'not_allowed';
  if (has('10', 'NETWORK_ERROR', '35', 'OFFLINE_CONNECTION_ERROR', '33', 'API_ENDPOINT_BLOCKED')) return 'network';
  if (has('5', 'PRODUCT_NOT_AVAILABLE_FOR_PURCHASE_ERROR', '32', 'PRODUCT_REQUEST_TIMED_OUT_ERROR')) return 'plans_missing';
  if (has('11', 'INVALID_CREDENTIALS_ERROR', '23', 'CONFIGURATION_ERROR')) return 'not_configured';
  return 'store';
}

/** Drop SDK keys and bearer tokens before a purchase failure is written to the log. */
export function scrubBillingText(value: string): string {
  return value
    .replace(/appl_[A-Za-z0-9]+/g, 'appl_[redacted]')
    .replace(/goog_[A-Za-z0-9]+/g, 'goog_[redacted]')
    .replace(/\bsk_[A-Za-z0-9]+/g, 'sk_[redacted]')
    .replace(/Bearer\s+\S+/gi, 'Bearer [redacted]')
    .slice(0, 300);
}

export function billingErrorParts(error: unknown): { code?: string; readable?: string; message: string } {
  const record = error && typeof error === 'object' ? (error as Record<string, unknown>) : {};
  const code = record.code == null ? undefined : String(record.code);
  const info = record.userInfo && typeof record.userInfo === 'object' ? (record.userInfo as Record<string, unknown>) : {};
  const readable =
    typeof info.readableErrorCode === 'string'
      ? info.readableErrorCode
      : typeof record.readableErrorCode === 'string'
        ? record.readableErrorCode
        : undefined;
  const message = [record.message, record.underlyingErrorMessage]
    .filter((part): part is string => typeof part === 'string' && part.trim().length > 0)
    .join(' | ');
  return { code, readable, message: scrubBillingText(message) };
}
