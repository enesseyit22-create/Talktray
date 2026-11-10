import { describe, expect, it } from 'vitest';

import { formatDueLabel, isOverdue, pastDuePhrase, timeZoneForRequest } from './format';

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

describe('timeZoneForRequest', () => {
  it('replaces the UTC database default with the device zone', () => {
    expect(timeZoneForRequest('UTC', 'Europe/Istanbul')).toBe('Europe/Istanbul');
    expect(timeZoneForRequest('UTC', 'UTC')).toBe('UTC');
    expect(timeZoneForRequest('America/New_York', 'Europe/Istanbul')).toBe('America/New_York');
  });
});
