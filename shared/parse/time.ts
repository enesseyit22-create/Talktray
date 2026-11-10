export type ZonedParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
  weekday: number;
};

const WEEKDAY_INDEX: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
};

export function zonedParts(date: Date, timeZone: string): ZonedParts {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    weekday: 'short',
  });
  const bag: Record<string, string> = {};
  for (const part of fmt.formatToParts(date)) {
    if (part.type !== 'literal') bag[part.type] = part.value;
  }
  let hour = Number(bag.hour);
  if (hour === 24) hour = 0;
  return {
    year: Number(bag.year),
    month: Number(bag.month),
    day: Number(bag.day),
    hour,
    minute: Number(bag.minute),
    second: Number(bag.second),
    weekday: WEEKDAY_INDEX[bag.weekday] ?? 0,
  };
}

export function addCalendarDays(
  parts: Pick<ZonedParts, 'year' | 'month' | 'day'>,
  days: number,
): { year: number; month: number; day: number } {
  const utc = new Date(Date.UTC(parts.year, parts.month - 1, parts.day + days));
  return {
    year: utc.getUTCFullYear(),
    month: utc.getUTCMonth() + 1,
    day: utc.getUTCDate(),
  };
}

export function zonedTimeToUtc(
  parts: { year: number; month: number; day: number; hour: number; minute: number },
  timeZone: string,
): Date {
  const desired = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, 0);
  let utc = desired;
  for (let i = 0; i < 3; i += 1) {
    const got = zonedParts(new Date(utc), timeZone);
    const gotUtc = Date.UTC(got.year, got.month - 1, got.day, got.hour, got.minute, 0);
    const diff = desired - gotUtc;
    if (diff === 0) break;
    utc += diff;
  }
  return new Date(utc);
}

export function monthPeriod(date: Date, timeZone: string): string {
  const parts = zonedParts(date, timeZone);
  return `${parts.year}-${String(parts.month).padStart(2, '0')}`;
}

export function isSameZonedDay(a: Date, b: Date, timeZone: string): boolean {
  const left = zonedParts(a, timeZone);
  const right = zonedParts(b, timeZone);
  return left.year === right.year && left.month === right.month && left.day === right.day;
}

export function deviceTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
}

export function safeTimeZone(timeZone: string | null | undefined): string {
  if (!timeZone) return 'UTC';
  try {
    Intl.DateTimeFormat('en-US', { timeZone });
    return timeZone;
  } catch {
    return 'UTC';
  }
}
