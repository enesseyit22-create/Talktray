import { describe, expect, it } from 'vitest';
import { resolveRelativeDate } from './dates';
import { zonedParts } from './time';

const TZ = 'Europe/Istanbul';
const NOW = new Date('2026-11-11T07:00:00.000Z');
const ctx = { now: NOW, timeZone: TZ };

function wall(phrase: string) {
  const resolved = resolveRelativeDate(phrase, ctx);
  if (!resolved) return null;
  const parts = zonedParts(resolved.date, TZ);
  return {
    year: parts.year,
    month: parts.month,
    day: parts.day,
    hour: parts.hour,
    minute: parts.minute,
    allDay: resolved.allDay,
  };
}

describe('resolveRelativeDate', () => {
  it('anchors the fixture on Wednesday 11 November 2026 at 10:00 in Istanbul', () => {
    const parts = zonedParts(NOW, TZ);
    expect(parts).toMatchObject({ year: 2026, month: 11, day: 11, hour: 10, weekday: 3 });
  });

  it('resolves Turkish relative dates', () => {
    expect(wall("yarın saat 9'da")).toMatchObject({ year: 2026, month: 11, day: 12, hour: 9, minute: 0, allDay: false });
    expect(wall('bugün akşam')).toMatchObject({ year: 2026, month: 11, day: 11, hour: 19, allDay: false });
    expect(wall('öbür gün')).toMatchObject({ year: 2026, month: 11, day: 13, allDay: true });
    expect(wall('3 gün sonra')).toMatchObject({ year: 2026, month: 11, day: 14, allDay: true });
    expect(wall('gelecek pazartesi')).toMatchObject({ year: 2026, month: 11, day: 16, allDay: true });
    expect(wall('haftaya salı')).toMatchObject({ year: 2026, month: 11, day: 17, allDay: true });
    expect(wall('bu akşam saat 7')).toMatchObject({ year: 2026, month: 11, day: 11, hour: 19, minute: 0, allDay: false });
    expect(wall('cuma günü 14:00')).toMatchObject({ year: 2026, month: 11, day: 13, hour: 14, minute: 0, allDay: false });
    expect(wall("saat 9'da")).toMatchObject({ year: 2026, month: 11, day: 12, hour: 9, allDay: false });
  });

  it('resolves English relative dates', () => {
    expect(wall('tomorrow at 9am')).toMatchObject({ year: 2026, month: 11, day: 12, hour: 9, allDay: false });
    expect(wall('today at 3pm')).toMatchObject({ year: 2026, month: 11, day: 11, hour: 15, allDay: false });
    expect(wall('next monday')).toMatchObject({ year: 2026, month: 11, day: 16, allDay: true });
    expect(wall('in 3 days')).toMatchObject({ year: 2026, month: 11, day: 14, allDay: true });
    expect(wall('next week')).toMatchObject({ year: 2026, month: 11, day: 16, allDay: true });
    expect(wall('this evening')).toMatchObject({ year: 2026, month: 11, day: 11, hour: 19, allDay: false });
    expect(wall('friday at 2pm')).toMatchObject({ year: 2026, month: 11, day: 13, hour: 14, allDay: false });
    expect(wall('in 2 weeks')).toMatchObject({ year: 2026, month: 11, day: 25, allDay: true });
  });

  it('returns null when the phrase has no time signal', () => {
    expect(resolveRelativeDate('sadece bir not', ctx)).toBeNull();
    expect(resolveRelativeDate('just a thought about the logo', ctx)).toBeNull();
  });
});
