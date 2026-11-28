import { addCalendarDays, isSameZonedDay, zonedParts, zonedTimeToUtc } from '../../shared/parse/time';

/** Consecutive local days, ending today or yesterday, with at least one completion. */
export function streakCount(completedAt: (string | null)[], now: Date, timeZone: string): number {
  const days = new Set<string>();
  for (const stamp of completedAt) {
    if (!stamp) continue;
    const parts = zonedParts(new Date(stamp), timeZone);
    days.add(`${parts.year}-${parts.month}-${parts.day}`);
  }
  const today = zonedParts(now, timeZone);
  const cursor = days.has(`${today.year}-${today.month}-${today.day}`)
    ? today
    : zonedParts(zonedTimeToUtc({ ...addCalendarDays(today, -1), hour: 12, minute: 0 }, timeZone), timeZone);
  if (!days.has(`${cursor.year}-${cursor.month}-${cursor.day}`)) return 0;
  let count = 0;
  let point = zonedTimeToUtc({ ...cursor, hour: 12, minute: 0 }, timeZone);
  while (days.has(keyOf(point, timeZone))) {
    count += 1;
    point = zonedTimeToUtc({ ...addCalendarDays(zonedParts(point, timeZone), -1), hour: 12, minute: 0 }, timeZone);
    if (count > 4000) break;
  }
  return count;
}

function keyOf(date: Date, timeZone: string): string {
  const parts = zonedParts(date, timeZone);
  return `${parts.year}-${parts.month}-${parts.day}`;
}

export function streakMilestone(count: number): 3 | 7 | 30 | null {
  if (count === 30) return 30;
  if (count === 7) return 7;
  if (count === 3) return 3;
  return null;
}

export function completedToday(completedAt: (string | null)[], now: Date, timeZone: string): boolean {
  return completedAt.some((stamp) => stamp && isSameZonedDay(new Date(stamp), now, timeZone));
}
