import { intlLocale } from '@/i18n/locale';
import { isSameZonedDay, zonedParts } from '../../shared/parse/time';

export function formatClock(iso: string, timeZone: string, locale: string): string {
  return new Intl.DateTimeFormat(intlLocale(locale), {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(iso));
}

export function formatDayLabel(
  iso: string,
  now: Date,
  timeZone: string,
  locale: string,
  today: string,
  tomorrow: string,
): string {
  const date = new Date(iso);
  if (isSameZonedDay(date, now, timeZone)) return today;
  const next = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  if (isSameZonedDay(date, next, timeZone)) return tomorrow;
  return new Intl.DateTimeFormat(intlLocale(locale), {
    timeZone,
    day: 'numeric',
    month: 'short',
  }).format(date);
}

export function isOverdue(
  item: { dueAt: string | null; completedAt?: string | null; allDay?: boolean },
  now: Date,
  timeZone: string,
): boolean {
  if (!item.dueAt || item.completedAt) return false;
  const due = new Date(item.dueAt);
  if (Number.isNaN(due.getTime()) || due.getTime() >= now.getTime()) return false;
  if (item.allDay && isSameZonedDay(due, now, timeZone)) return false;
  return true;
}

export type PastDuePhrase =
  | { kind: 'ago'; unit: 'minute' | 'minutes' | 'hour' | 'hours'; count: number }
  | { kind: 'yesterday'; time: string | null }
  | { kind: 'days'; unit: 'day' | 'days'; count: number };

function zonedDayStamp(date: Date, timeZone: string): number {
  const parts = zonedParts(date, timeZone);
  return Date.UTC(parts.year, parts.month - 1, parts.day);
}

export function pastDuePhrase(iso: string, now: Date, timeZone: string, locale: string, allDay: boolean): PastDuePhrase {
  const due = new Date(iso);
  const dayDiff = Math.round((zonedDayStamp(now, timeZone) - zonedDayStamp(due, timeZone)) / 86_400_000);
  if (dayDiff <= 0) {
    const minutes = Math.max(1, Math.floor((now.getTime() - due.getTime()) / 60_000));
    if (minutes < 60) return { kind: 'ago', unit: minutes === 1 ? 'minute' : 'minutes', count: minutes };
    const hours = Math.max(1, Math.floor(minutes / 60));
    return { kind: 'ago', unit: hours === 1 ? 'hour' : 'hours', count: hours };
  }
  if (dayDiff === 1) return { kind: 'yesterday', time: allDay ? null : formatClock(iso, timeZone, locale) };
  return { kind: 'days', unit: dayDiff === 1 ? 'day' : 'days', count: dayDiff };
}

export function formatDueLabel(
  iso: string,
  now: Date,
  timeZone: string,
  locale: string,
  today: string,
  tomorrow: string,
  allDay: boolean,
): string {
  const day = formatDayLabel(iso, now, timeZone, locale, today, tomorrow);
  if (allDay) return day;
  return `${day} ${formatClock(iso, timeZone, locale)}`;
}

/** A stored UTC zone is the database default, so requests use the device zone instead. */
export function timeZoneForRequest(profileZone: string, deviceZone: string): string {
  return profileZone === 'UTC' ? deviceZone : profileZone;
}

export function greetingKey(now: Date, timeZone: string): 'morning' | 'afternoon' | 'evening' {
  const hour = zonedParts(now, timeZone).hour;
  if (hour < 12) return 'morning';
  if (hour < 18) return 'afternoon';
  return 'evening';
}

export function formatDuration(ms: number): string {
  const total = Math.max(1, Math.round(ms / 1000));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}
