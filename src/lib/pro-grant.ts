export type ProOverrideSnapshot =
  | { status: 'active'; until: string }
  | { status: 'inactive' }
  | { status: 'unknown' };

/** Postgres sends lifetime as `infinity` or `+infinity`. A non-finite number is the same grant. */
export function normalizeOverrideUntil(value: unknown): string | null {
  if (value == null) return null;
  if (typeof value === 'number') return value === Number.POSITIVE_INFINITY ? 'infinity' : null;
  if (value instanceof Date) return Number.isFinite(value.getTime()) ? value.toISOString() : null;
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed || null;
}

export function isLifetimeGrant(until: string | null | undefined): boolean {
  if (!until) return false;
  const value = until.trim().toLowerCase();
  return value === 'infinity' || value === '+infinity';
}

/** True when a manual grant is still in force. Postgres infinity stays active. */
export function overrideIsActive(until: string | null | undefined, nowMs = Date.now()): boolean {
  if (!until) return false;
  if (isLifetimeGrant(until)) return true;
  const time = Date.parse(until);
  return Number.isFinite(time) && time > nowMs;
}

export function formatGrantDate(until: string, locale: string, timeZone: string): string {
  const time = Date.parse(until);
  if (!Number.isFinite(time)) return until;
  try {
    return new Intl.DateTimeFormat(locale, { timeZone, month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(time));
  } catch {
    return new Intl.DateTimeFormat(locale, { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(time));
  }
}
