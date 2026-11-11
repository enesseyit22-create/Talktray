/** True when a manual grant is still in force. Postgres infinity stays active. */
export function overrideIsActive(until: string | null | undefined, nowMs = Date.now()): boolean {
  if (!until) return false;
  if (until.toLowerCase() === 'infinity') return true;
  const time = Date.parse(until);
  return Number.isFinite(time) && time > nowMs;
}
