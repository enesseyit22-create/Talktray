import type { InboxItem, Recording } from '@/domain/types';
import { addCalendarDays, isSameZonedDay, zonedParts, zonedTimeToUtc } from '../../shared/parse/time';

export function localWeekKey(now: Date, timeZone: string): string {
  const parts = zonedParts(now, timeZone);
  const utc = new Date(Date.UTC(parts.year, parts.month - 1, parts.day));
  const weekday = utc.getUTCDay() || 7;
  utc.setUTCDate(utc.getUTCDate() + 4 - weekday);
  const yearStart = new Date(Date.UTC(utc.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((utc.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${utc.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

export type WeekSummary = { done: number; recordings: number; bestDay: string | null };

/** The seven days ending today: finished items, recordings, and the busiest weekday. */
export function summarizeWeek(items: InboxItem[], recordings: Recording[], now: Date, timeZone: string): WeekSummary {
  const start = zonedTimeToUtc(
    { ...addCalendarDays(zonedParts(now, timeZone), -6), hour: 0, minute: 0 },
    timeZone,
  ).getTime();
  const end = now.getTime();
  let done = 0;
  const byDay = new Map<string, number>();
  for (const item of items) {
    if (!item.completedAt) continue;
    const at = new Date(item.completedAt).getTime();
    if (at < start || at > end) continue;
    done += 1;
    const parts = zonedParts(new Date(item.completedAt), timeZone);
    const key = `${parts.year}-${parts.month}-${parts.day}`;
    byDay.set(key, (byDay.get(key) ?? 0) + 1);
  }
  let best: string | null = null;
  let bestCount = 0;
  for (const [key, count] of byDay) {
    if (count > bestCount) {
      best = key;
      bestCount = count;
    }
  }
  const recordingsMade = recordings.filter((recording) => {
    const at = new Date(recording.createdAt).getTime();
    return recording.status !== 'failed' && at >= start && at <= end;
  }).length;
  return { done, recordings: recordingsMade, bestDay: best };
}

export function bestDayLabel(key: string | null, timeZone: string, locale: string): string | null {
  if (!key) return null;
  const [year, month, day] = key.split('-').map(Number);
  if (!year || !month || !day) return null;
  const date = zonedTimeToUtc({ year, month, day, hour: 12, minute: 0 }, timeZone);
  return new Intl.DateTimeFormat(locale, { weekday: 'long', timeZone }).format(date);
}

export function isSameLocalDay(a: Date, b: Date, timeZone: string): boolean {
  return isSameZonedDay(a, b, timeZone);
}
