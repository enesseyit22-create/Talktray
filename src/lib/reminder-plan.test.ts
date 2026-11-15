import { describe, expect, it } from 'vitest';

import type { InboxItem } from '@/domain/types';
import { planReminders } from '@/lib/reminder-plan';

const now = new Date('2026-11-15T12:00:00Z');

function item(id: string, minutesFromNow: number | null, extra: Partial<InboxItem> = {}): InboxItem {
  return {
    id,
    recordingId: null,
    type: 'reminder',
    title: id,
    notes: null,
    dueAt: minutesFromNow == null ? null : new Date(now.getTime() + minutesFromNow * 60_000).toISOString(),
    allDay: false,
    listName: null,
    reminderOffsets: null,
    completedAt: null,
    calendarEventId: null,
    notificationId: null,
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
    ...extra,
  };
}

describe('planReminders', () => {
  it('keeps the soonest reminders when there are more than the cap', () => {
    // Listed latest first, as the inbox stores them.
    const items = Array.from({ length: 100 }, (_, index) => item(`i${100 - index}`, (100 - index) * 60));
    const plan = planReminders(items, [0], now, 60);
    expect(plan).toHaveLength(60);
    expect(plan[0]?.item.id).toBe('i1');
    expect(plan[59]?.item.id).toBe('i60');
  });

  it('skips past, undated, and completed items', () => {
    const plan = planReminders(
      [item('past', -10), item('none', null), item('done', 30, { completedAt: now.toISOString() }), item('ok', 30)],
      [0],
      now,
    );
    expect(plan.map((entry) => entry.item.id)).toEqual(['ok']);
  });

  it('drops offsets that already passed and uses item offsets over defaults', () => {
    const plan = planReminders([item('soon', 20, { reminderOffsets: [0, 15, 60] })], [5], now);
    expect(plan.map((entry) => entry.offset)).toEqual([15, 0]);
  });
});
