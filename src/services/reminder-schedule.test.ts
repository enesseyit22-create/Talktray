import { describe, expect, it } from 'vitest';

import { exactDateTrigger, fireAtMs, mergeReminderSources, planReminders, reminderId, scheduledFireAt } from './reminder-schedule';

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

  it('keeps the 60 soonest and lets a nearer shared item replace a far personal one', () => {
    const personal = Array.from({ length: 60 }, (_, index) => ({
      id: `p${index}`,
      title: `P${index}`,
      dueAt: new Date(now + (index + 10) * 60_000).toISOString(),
      completedAt: null,
      reminderOffsets: [0],
    }));
    const shared = [
      {
        id: 'shared-milk',
        title: 'Süt',
        dueAt: new Date(now + 60_000).toISOString(),
        completedAt: null,
        reminderOffsets: [0],
      },
    ];
    const planned = planReminders(mergeReminderSources(personal, shared), [0], now);
    expect(planned).toHaveLength(60);
    expect(planned[0]?.itemId).toBe('shared-milk');
    expect(planned.some((item) => item.itemId === 'p59')).toBe(false);
    expect(exactDateTrigger(planned[0]!.fireAt, 'reminders').date.getTime()).toBe(planned[0]!.fireAt);
  });

  it('reads a date trigger timestamp from either shape expo returns', () => {
    expect(scheduledFireAt({ type: 'date', timestamp: 1000 })).toBe(1000);
    expect(scheduledFireAt({ type: 'date', value: 2000 })).toBe(2000);
    expect(scheduledFireAt({ type: 'date', date: new Date(3000) })).toBe(3000);
    expect(scheduledFireAt(null)).toBeNull();
  });
});
