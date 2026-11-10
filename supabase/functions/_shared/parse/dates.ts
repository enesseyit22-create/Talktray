import type { ExtractContext, ResolvedWhen } from './types.ts';
import { addCalendarDays, zonedParts, zonedTimeToUtc } from './time.ts';

const WEEKDAYS: Array<[string, number]> = [
  ['pazartesi', 1],
  ['monday', 1],
  ['sali', 2],
  ['tuesday', 2],
  ['carsamba', 3],
  ['wednesday', 3],
  ['persembe', 4],
  ['thursday', 4],
  ['cumartesi', 6],
  ['saturday', 6],
  ['cuma', 5],
  ['friday', 5],
  ['pazar', 0],
  ['sunday', 0],
];

export function fold(input: string): string {
  return input
    .toLocaleLowerCase('tr-TR')
    .replace(/ı/g, 'i')
    .replace(/ş/g, 's')
    .replace(/ğ/g, 'g')
    .replace(/ü/g, 'u')
    .replace(/ö/g, 'o')
    .replace(/ç/g, 'c')
    .replace(/[’‘]/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

type Clock = { hour: number; minute: number; ampm: boolean };

function parseClock(text: string): Clock | null {
  const ampm = text.match(/\b(?:at\s+)?(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/);
  if (ampm) {
    let hour = Number(ampm[1]);
    const minute = ampm[2] ? Number(ampm[2]) : 0;
    if (ampm[3] === 'pm' && hour < 12) hour += 12;
    if (ampm[3] === 'am' && hour === 12) hour = 0;
    if (hour > 23 || minute > 59) return null;
    return { hour, minute, ampm: true };
  }
  const saat = text.match(/\bsaat\s*(\d{1,2})(?:[:.](\d{2}))?\b/);
  if (saat) {
    const hour = Number(saat[1]);
    const minute = saat[2] ? Number(saat[2]) : 0;
    if (hour > 23 || minute > 59) return null;
    return { hour, minute, ampm: false };
  }
  const hm = text.match(/\b(\d{1,2})[:.](\d{2})\b/);
  if (hm) {
    const hour = Number(hm[1]);
    const minute = Number(hm[2]);
    if (hour > 23 || minute > 59) return null;
    return { hour, minute, ampm: false };
  }
  const at = text.match(/\bat\s+(\d{1,2})\b/);
  if (at) {
    const hour = Number(at[1]);
    if (hour > 23) return null;
    return { hour, minute: 0, ampm: false };
  }
  return null;
}

type PartOfDay = 'morning' | 'noon' | 'afternoon' | 'evening' | 'night';

function parsePartOfDay(text: string): PartOfDay | null {
  if (/\b(tonight|gece)\b/.test(text)) return 'night';
  if (/\b(aksam|evening)\b/.test(text)) return 'evening';
  if (/\bafternoon\b/.test(text)) return 'afternoon';
  if (/\b(oglen|ogle|noon)\b/.test(text)) return 'noon';
  if (/\b(sabah|morning)\b/.test(text)) return 'morning';
  if (/\bnight\b/.test(text)) return 'night';
  return null;
}

type DayMatch = {
  matched: boolean;
  offset: number | null;
  weekday: number | null;
  nextWeek: boolean;
};

function parseDay(text: string): DayMatch {
  const result: DayMatch = { matched: false, offset: null, weekday: null, nextWeek: false };
  if (/\bobur gun\b|\bday after tomorrow\b/.test(text)) result.offset = 2;
  else if (/\byarin\b|\btomorrow\b/.test(text)) result.offset = 1;
  else if (/\bbugun\b|\btoday\b/.test(text)) result.offset = 0;
  else if (/\bdun\b|\byesterday\b/.test(text)) result.offset = -1;

  const inDays = text.match(/\b(\d+)\s+gun sonra\b/) ?? text.match(/\bin\s+(\d+)\s+days?\b/);
  if (inDays) result.offset = Number(inDays[1]);
  const inWeeks = text.match(/\b(\d+)\s+hafta sonra\b/) ?? text.match(/\bin\s+(\d+)\s+weeks?\b/);
  if (inWeeks) result.offset = Number(inWeeks[1]) * 7;

  if (/\bgelecek hafta\b|\bhaftaya\b|\bnext week\b/.test(text)) result.nextWeek = true;

  for (const [name, index] of WEEKDAYS) {
    if (new RegExp(`\\b${name}\\b`).test(text)) {
      result.weekday = index;
      break;
    }
  }

  result.matched = result.offset !== null || result.weekday !== null || result.nextWeek;
  return result;
}

function resolveDay(
  now: { year: number; month: number; day: number; weekday: number },
  day: DayMatch,
): { year: number; month: number; day: number } | null {
  if (!day.matched) return null;
  if (day.weekday !== null && day.nextWeek) {
    let untilMonday = (1 - now.weekday + 7) % 7;
    if (untilMonday === 0) untilMonday = 7;
    const add = untilMonday + ((day.weekday - 1 + 7) % 7);
    return addCalendarDays(now, add);
  }
  if (day.weekday !== null) {
    let delta = (day.weekday - now.weekday + 7) % 7;
    if (delta === 0) delta = 7;
    return addCalendarDays(now, delta);
  }
  if (day.nextWeek) {
    let untilMonday = (1 - now.weekday + 7) % 7;
    if (untilMonday === 0) untilMonday = 7;
    return addCalendarDays(now, untilMonday);
  }
  if (day.offset !== null) return addCalendarDays(now, day.offset);
  return null;
}

const PART_HOUR: Record<PartOfDay, number> = {
  morning: 9,
  noon: 13,
  afternoon: 15,
  evening: 19,
  night: 21,
};

export function resolveRelativeDate(input: string, ctx: ExtractContext): ResolvedWhen | null {
  const text = fold(input);
  if (!text) return null;
  const nowParts = zonedParts(ctx.now, ctx.timeZone);
  const clock = parseClock(text);
  const part = parsePartOfDay(text);
  const day = parseDay(text);
  if (!clock && !part && !day.matched) return null;

  let hour = clock?.hour ?? null;
  let minute = clock?.minute ?? 0;
  if (
    hour !== null &&
    !clock?.ampm &&
    hour <= 11 &&
    (part === 'evening' || part === 'night' || part === 'afternoon')
  ) {
    hour += 12;
  }
  if (hour === null && part) {
    hour = PART_HOUR[part];
    minute = 0;
  }

  let date = resolveDay(nowParts, day);
  if (!date) {
    date = { year: nowParts.year, month: nowParts.month, day: nowParts.day };
    if (hour !== null) {
      const candidate = zonedTimeToUtc({ ...date, hour, minute }, ctx.timeZone);
      if (candidate.getTime() <= ctx.now.getTime()) {
        date = addCalendarDays(nowParts, 1);
      }
    }
  }

  const allDay = hour === null;
  const finalHour = hour ?? 9;
  return {
    date: zonedTimeToUtc(
      { ...date, hour: finalHour, minute: allDay ? 0 : minute },
      ctx.timeZone,
    ),
    allDay,
  };
}
