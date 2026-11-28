import { describe, expect, it } from 'vitest';

import { nextOccurrence } from './repeat';
import { zonedParts } from './time';

const IST = 'Europe/Istanbul';
const NY = 'America/New_York';

function local(iso: string, zone: string) {
  const p = zonedParts(new Date(iso), zone);
  return `${p.year}-${String(p.month).padStart(2, '0')}-${String(p.day).padStart(2, '0')} ${String(p.hour).padStart(2, '0')}:${String(p.minute).padStart(2, '0')}`;
}

describe('nextOccurrence', () => {
  const before = new Date('2026-11-16T00:00:00Z');

  it('moves daily and weekly items forward', () => {
    // Mon 16 Nov 2026 09:00 Istanbul
    const due = '2026-11-16T06:00:00Z';
    expect(local(nextOccurrence(due, 'daily', IST, before), IST)).toBe('2026-11-17 09:00');
    expect(local(nextOccurrence(due, 'weekly', IST, before), IST)).toBe('2026-11-23 09:00');
  });

  it('skips the weekend for weekdays', () => {
    // Fri 20 Nov 2026 09:00 Istanbul
    expect(local(nextOccurrence('2026-11-20T06:00:00Z', 'weekdays', IST, before), IST)).toBe('2026-11-23 09:00');
  });

  it('keeps the 31st across short months', () => {
    const jan31 = '2027-01-31T06:00:00Z';
    const feb = nextOccurrence(jan31, 'monthly', IST, new Date('2027-01-01T00:00:00Z'));
    expect(local(feb, IST)).toBe('2027-02-28 09:00');
  });

  it('keeps local time across a DST change', () => {
    // Sat 31 Oct 2026 09:00 New York (EDT). DST ends 1 Nov.
    const due = '2026-10-31T13:00:00Z';
    expect(local(nextOccurrence(due, 'weekly', NY, new Date('2026-10-01T00:00:00Z')), NY)).toBe('2026-11-07 09:00');
  });

  it('jumps past now when finished late', () => {
    // Daily at 09:00 from 1 Nov, finished on 15 Nov at noon → 16 Nov 09:00
    const next = nextOccurrence('2026-11-01T06:00:00Z', 'daily', IST, new Date('2026-11-15T09:00:00Z'));
    expect(local(next, IST)).toBe('2026-11-16 09:00');
  });
});
