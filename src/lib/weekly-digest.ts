import type { InboxItem } from '@/domain/types';
import { addCalendarDays, zonedParts, zonedTimeToUtc } from '../../shared/parse/time';

/** Sunday evening, local time. */
const DIGEST_WEEKDAY = 0;
const DIGEST_HOUR = 19;

/** The next Sunday 19:00 in the zone that is still ahead of now. */
export function nextDigestAt(now: Date, timeZone: string): Date {
  const parts = zonedParts(now, timeZone);
  let days = (DIGEST_WEEKDAY - parts.weekday + 7) % 7;
  for (let attempt = 0; attempt < 2; attempt++) {
    const day = addCalendarDays(parts, days);
    const at = zonedTimeToUtc({ ...day, hour: DIGEST_HOUR, minute: 0 }, timeZone);
    if (at.getTime() > now.getTime() + 60_000) return at;
    days += 7;
  }
  return zonedTimeToUtc({ ...addCalendarDays(parts, 7), hour: DIGEST_HOUR, minute: 0 }, timeZone);
}

export type DigestStats = { done: number; upcoming: number };

/** Items finished in the 7 days before the digest, and dated items due in the 7 days after it. */
export function digestStats(items: InboxItem[], at: Date): DigestStats {
  const week = 7 * 24 * 60 * 60 * 1000;
  const from = at.getTime() - week;
  const until = at.getTime() + week;
  let done = 0;
  let upcoming = 0;
  for (const item of items) {
    if (item.completedAt) {
      const finished = new Date(item.completedAt).getTime();
      if (finished >= from && finished <= at.getTime()) done += 1;
    } else if (item.dueAt && item.type !== 'note') {
      const due = new Date(item.dueAt).getTime();
      if (due > at.getTime() && due <= until) upcoming += 1;
    }
  }
  return { done, upcoming };
}
