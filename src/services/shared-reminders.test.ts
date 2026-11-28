import { describe, expect, it } from 'vitest';

import { mergeReminderSources } from '@/services/reminder-schedule';
import { sharedRowsToSources } from '@/services/shared-reminder-sources';

describe('shared reminders', () => {
  it('schedules open shared items at their due time and drops ticked ones', () => {
    const sources = sharedRowsToSources([
      { id: 'a', title: ' Süt ', due_at: '2026-11-22T06:00:00.000Z', done_at: null },
      { id: 'b', title: 'Ekmek', due_at: '2026-11-22T07:00:00.000Z', done_at: '2026-11-22T06:30:00.000Z' },
      { id: 'c', title: '  ', due_at: '2026-11-22T08:00:00.000Z', done_at: null },
      { id: 'd', title: 'Not', due_at: null, done_at: null },
    ]);
    expect(sources).toEqual([
      {
        id: 'a',
        title: 'Süt',
        dueAt: '2026-11-22T06:00:00.000Z',
        completedAt: null,
        reminderOffsets: [0],
      },
    ]);
  });

  it('keeps a personal item when a shared row reuses its id', () => {
    const merged = mergeReminderSources(
      [{ id: 'a', title: 'Mine', dueAt: '2026-11-22T06:00:00.000Z', completedAt: null, reminderOffsets: [0] }],
      [{ id: 'a', title: 'Theirs', dueAt: '2026-11-22T07:00:00.000Z', completedAt: null, reminderOffsets: [0] }],
    );
    expect(merged.map((item) => item.title)).toEqual(['Mine']);
  });
});
