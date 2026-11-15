import type { InboxItem } from '@/domain/types';

/**
 * iOS keeps at most 64 pending local notifications and silently drops the rest.
 * We stay below that and leave room for the test notification.
 */
export const MAX_SCHEDULED_REMINDERS = 60;

export type PlannedReminder = {
  item: InboxItem;
  offset: number;
  fireAt: Date;
};

/** The soonest future reminders across all items, capped so none are dropped by the OS. */
export function planReminders(
  items: InboxItem[],
  defaultOffsets: number[],
  now: Date,
  max = MAX_SCHEDULED_REMINDERS,
): PlannedReminder[] {
  const earliest = now.getTime() + 5000;
  const planned: PlannedReminder[] = [];
  for (const item of items) {
    if (!item.dueAt || item.completedAt) continue;
    const due = new Date(item.dueAt).getTime();
    if (!Number.isFinite(due)) continue;
    const offsets = item.reminderOffsets?.length ? item.reminderOffsets : defaultOffsets;
    for (const offset of new Set(offsets)) {
      const fireAt = due - offset * 60_000;
      if (fireAt > earliest) planned.push({ item, offset, fireAt: new Date(fireAt) });
    }
  }
  return planned.sort((a, b) => a.fireAt.getTime() - b.fireAt.getTime()).slice(0, Math.max(0, max));
}
