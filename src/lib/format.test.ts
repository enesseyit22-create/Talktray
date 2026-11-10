import { describe, expect, it } from 'vitest';

import { formatDueLabel, timeZoneForRequest } from './format';

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

describe('timeZoneForRequest', () => {
  it('replaces the UTC database default with the device zone', () => {
    expect(timeZoneForRequest('UTC', 'Europe/Istanbul')).toBe('Europe/Istanbul');
    expect(timeZoneForRequest('UTC', 'UTC')).toBe('UTC');
    expect(timeZoneForRequest('America/New_York', 'Europe/Istanbul')).toBe('America/New_York');
  });
});
