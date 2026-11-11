import { zonedParts, zonedTimeToUtc } from '../../shared/parse/time';

export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/** Sunday-first blank cells, then the days of the month. */
export function monthCells(year: number, month: number): (number | null)[] {
  const first = new Date(Date.UTC(year, month - 1, 1)).getUTCDay();
  const count = daysInMonth(year, month);
  const cells: (number | null)[] = Array.from({ length: first }, () => null);
  for (let day = 1; day <= count; day += 1) cells.push(day);
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

export function shiftMonth(year: number, month: number, delta: number): { year: number; month: number } {
  const utc = new Date(Date.UTC(year, month - 1 + delta, 1));
  return { year: utc.getUTCFullYear(), month: utc.getUTCMonth() + 1 };
}

export function composeDueAt(
  timeZone: string,
  parts: { year: number; month: number; day: number; hour: number; minute: number },
  allDay: boolean,
): string {
  return zonedTimeToUtc(
    {
      year: parts.year,
      month: parts.month,
      day: parts.day,
      hour: allDay ? 9 : parts.hour,
      minute: allDay ? 0 : parts.minute,
    },
    timeZone,
  ).toISOString();
}

export function dueParts(iso: string | null, timeZone: string, now = new Date()) {
  return zonedParts(iso ? new Date(iso) : now, timeZone);
}
