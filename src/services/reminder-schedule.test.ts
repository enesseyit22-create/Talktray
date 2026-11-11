import { describe, expect, it } from 'vitest';

import { fireAtMs, planReminders, reminderId, scheduledFireAt } from './reminder-schedule';

describe('reminder schedule', () => {
  const now = Date.parse('2026-11-11T12:00:00.000Z');

  it('fires at the due instant minus the offset', () => {
    expect(fireAtMs('2026-11-11T15:00:00.000Z', 0, now)).toBe(Date.parse('2026-11-11T15:00:00.000Z'));
    expect(fireAtMs('2026-11-11T15:00:00.000Z', 30, now)).toBe(Date.parse('2026-11-11T14:30:00.000Z'));
  });

  it('skips a due time that has already passed', () => {
    expect(fireAtMs('2026-11-11T11:00:00.000Z', 0, now)).toBeNull();
    expect(fireAtMs('not-a-date', 0, now)).toBeNull();
  });

  it('keeps a stable id and drops completed items', () => {
    const planned = planReminders(
      [
        { id: 'a', title: 'Call', dueAt: '2026-11-11T15:00:00.000Z', completedAt: null, reminderOffsets: [0, 10] },
        { id: 'b', title: 'Done', dueAt: '2026-11-11T16:00:00.000Z', completedAt: '2026-11-11T12:00:00.000Z', reminderOffsets: [0] },
      ],
      [0],
      now,
    );
    expect(planned.map((item) => item.id)).toEqual([reminderId('a', 10), reminderId('a', 0)]);
  });

  it('reads a date trigger timestamp from either shape expo returns', () => {
    expect(scheduledFireAt({ type: 'date', timestamp: 1000 })).toBe(1000);
    expect(scheduledFireAt({ type: 'date', value: 2000 })).toBe(2000);
    expect(scheduledFireAt({ type: 'date', date: new Date(3000) })).toBe(3000);
    expect(scheduledFireAt(null)).toBeNull();
  });
});
