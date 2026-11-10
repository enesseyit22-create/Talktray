import { describe, expect, it } from 'vitest';

import { formatDueLabel, greetingKey, isOverdue, pastDuePhrase, timeZoneForRequest } from './format';

describe('formatDueLabel', () => {
  const now = new Date('2026-11-11T07:00:00.000Z');

  it('shows the zoned day and clock without seconds', () => {
    const label = formatDueLabel('2026-11-11T07:30:45.000Z', now, 'Europe/Istanbul', 'en', 'Today', 'Tomorrow', false);
    expect(label).toBe('Today 10:30 AM');
    expect(label).not.toMatch(/:45/);
  });

  it('drops the clock for an all-day item', () => {
    expect(formatDueLabel('2026-11-12T06:00:00.000Z', now, 'Europe/Istanbul', 'en', 'Today', 'Tomorrow', true)).toBe('Tomorrow');
  });
});

describe('past due', () => {
  const now = new Date('2026-11-11T09:00:00.000Z');
  const zone = 'Europe/Istanbul';

  it('describes same-day lateness in hours and yesterday with a clock', () => {
    expect(pastDuePhrase('2026-11-11T07:00:00.000Z', now, zone, 'en', false)).toEqual({
      kind: 'ago',
      unit: 'hours',
      count: 2,
    });
    expect(pastDuePhrase('2026-11-11T08:15:00.000Z', now, zone, 'en', false)).toEqual({
      kind: 'ago',
      unit: 'minutes',
      count: 45,
    });
    expect(pastDuePhrase('2026-11-10T09:00:00.000Z', now, zone, 'en', false)).toEqual({
      kind: 'yesterday',
      time: '12:00 PM',
    });
    expect(pastDuePhrase('2026-11-08T09:00:00.000Z', now, zone, 'en', false)).toEqual({
      kind: 'days',
      unit: 'days',
      count: 3,
    });
  });

  it('skips completed items and an all-day item that is still today', () => {
    const timed = { dueAt: '2026-11-11T07:00:00.000Z', completedAt: null, allDay: false };
    expect(isOverdue(timed, now, zone)).toBe(true);
    expect(isOverdue({ ...timed, completedAt: now.toISOString() }, now, zone)).toBe(false);
    expect(isOverdue({ dueAt: '2026-11-11T06:00:00.000Z', completedAt: null, allDay: true }, now, zone)).toBe(false);
    expect(isOverdue({ dueAt: '2026-11-10T06:00:00.000Z', completedAt: null, allDay: true }, now, zone)).toBe(true);
  });
});

describe('greetingKey', () => {
  const atUtc = (hour: number, minute: number) => new Date(Date.UTC(2026, 10, 10, hour, minute, 0));

  it('follows the zoned hour, including night after midnight', () => {
    expect(greetingKey(atUtc(4, 59), 'UTC')).toBe('night');
    expect(greetingKey(atUtc(5, 0), 'UTC')).toBe('morning');
    expect(greetingKey(atUtc(11, 59), 'UTC')).toBe('morning');
    expect(greetingKey(atUtc(12, 0), 'UTC')).toBe('afternoon');
    expect(greetingKey(atUtc(17, 59), 'UTC')).toBe('afternoon');
    expect(greetingKey(atUtc(18, 0), 'UTC')).toBe('evening');
    expect(greetingKey(atUtc(21, 59), 'UTC')).toBe('evening');
    expect(greetingKey(atUtc(22, 0), 'UTC')).toBe('night');
    expect(greetingKey(atUtc(0, 30), 'UTC')).toBe('night');
  });

  it('uses the given time zone instead of UTC', () => {
    const instant = new Date('2026-11-10T19:30:00.000Z');
    expect(greetingKey(instant, 'UTC')).toBe('evening');
    expect(greetingKey(instant, 'Europe/Istanbul')).toBe('night');
  });
});

describe('timeZoneForRequest', () => {
  it('replaces the UTC database default with the device zone', () => {
    expect(timeZoneForRequest('UTC', 'Europe/Istanbul')).toBe('Europe/Istanbul');
    expect(timeZoneForRequest('UTC', 'UTC')).toBe('UTC');
    expect(timeZoneForRequest('America/New_York', 'Europe/Istanbul')).toBe('America/New_York');
  });
});
