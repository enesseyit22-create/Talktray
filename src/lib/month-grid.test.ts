import { describe, expect, it } from 'vitest';

import { composeDueAt, daysInMonth, monthCells, shiftMonth } from './month-grid';

describe('monthCells', () => {
  it('builds November 2026 with Sunday the 1st', () => {
    const cells = monthCells(2026, 11);
    expect(cells[0]).toBe(1);
    expect(cells.filter((day) => day != null)).toHaveLength(30);
    expect(daysInMonth(2026, 2)).toBe(28);
    expect(daysInMonth(2024, 2)).toBe(29);
  });

  it('steps across the year boundary', () => {
    expect(shiftMonth(2026, 12, 1)).toEqual({ year: 2027, month: 1 });
    expect(shiftMonth(2026, 1, -1)).toEqual({ year: 2025, month: 12 });
  });

  it('stores a chosen civil date in the given time zone', () => {
    const iso = composeDueAt('Europe/Istanbul', { year: 2026, month: 11, day: 11, hour: 15, minute: 30 }, false);
    expect(iso).toBe('2026-11-11T12:30:00.000Z');
    const allDay = composeDueAt('UTC', { year: 2026, month: 3, day: 5, hour: 22, minute: 10 }, true);
    expect(allDay).toBe('2026-03-05T09:00:00.000Z');
  });
});
