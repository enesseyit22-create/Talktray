import { addCalendarDays, zonedParts, zonedTimeToUtc } from './time';

export const REPEATS = ['daily', 'weekdays', 'weekly', 'monthly', 'yearly'] as const;
export type Repeat = (typeof REPEATS)[number];

export function asRepeat(value: unknown): Repeat | null {
  return typeof value === 'string' && (REPEATS as readonly string[]).includes(value) ? (value as Repeat) : null;
}

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/** One step forward in the item's own time zone, keeping its local time of day across DST. */
function step(dueAt: Date, repeat: Repeat, timeZone: string, anchorDay: number): Date {
  const parts = zonedParts(dueAt, timeZone);
  let date: { year: number; month: number; day: number };
  switch (repeat) {
    case 'daily':
      date = addCalendarDays(parts, 1);
      break;
    case 'weekdays': {
      // Fri → Mon, Sat → Mon, otherwise the next day.
      const skip = parts.weekday === 5 ? 3 : parts.weekday === 6 ? 2 : 1;
      date = addCalendarDays(parts, skip);
      break;
    }
    case 'weekly':
      date = addCalendarDays(parts, 7);
      break;
    case 'monthly': {
      const month = parts.month === 12 ? 1 : parts.month + 1;
      const year = parts.month === 12 ? parts.year + 1 : parts.year;
      // The 31st falls back to the month's last day, then returns to the 31st when it can.
      date = { year, month, day: Math.min(anchorDay, daysInMonth(year, month)) };
      break;
    }
    case 'yearly':
      date = {
        year: parts.year + 1,
        month: parts.month,
        day: Math.min(anchorDay, daysInMonth(parts.year + 1, parts.month)),
      };
      break;
  }
  return zonedTimeToUtc({ ...date, hour: parts.hour, minute: parts.minute }, timeZone);
}

/**
 * The next due date after finishing a repeating item: the first occurrence after now,
 * so an item done late does not leave a trail of past copies.
 */
export function nextOccurrence(dueAtIso: string, repeat: Repeat, timeZone: string, now: Date): string {
  const start = new Date(dueAtIso);
  const anchorDay = zonedParts(start, timeZone).day;
  let next = step(start, repeat, timeZone, anchorDay);
  for (let guard = 0; guard < 4000 && next.getTime() <= now.getTime(); guard++) {
    next = step(next, repeat, timeZone, anchorDay);
  }
  return next.toISOString();
}
