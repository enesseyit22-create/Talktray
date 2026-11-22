import type { ReminderSource } from '@/services/reminder-schedule';

export type SharedReminderRow = {
  id: string;
  title: string;
  due_at: string | null;
  done_at: string | null;
};

/** Open shared items fire once, at the due instant, on every member's phone. */
export function sharedRowsToSources(rows: SharedReminderRow[]): ReminderSource[] {
  const sources: ReminderSource[] = [];
  for (const row of rows) {
    if (!row.due_at || row.done_at) continue;
    const title = row.title.trim();
    if (!title) continue;
    sources.push({
      id: row.id,
      title,
      dueAt: row.due_at,
      completedAt: null,
      reminderOffsets: [0],
    });
  }
  return sources;
}
