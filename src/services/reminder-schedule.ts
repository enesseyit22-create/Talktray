export type ReminderSource = {
  id: string;
  title: string;
  dueAt: string | null;
  completedAt: string | null;
  reminderOffsets: number[] | null;
};

export type PlannedReminder = {
  id: string;
  itemId: string;
  offset: number;
  fireAt: number;
  title: string;
};

/** Stable id so a later sync can update one alarm instead of cancelling every alarm. */
export function reminderId(itemId: string, offset: number): string {
  return `tt:${itemId}:${offset}`;
}

/** Absolute fire time in milliseconds. Null when the due instant is missing or already past. */
export function fireAtMs(dueAt: string, offsetMinutes: number, nowMs: number): number | null {
  const due = Date.parse(dueAt);
  if (!Number.isFinite(due)) return null;
  const when = due - offsetMinutes * 60_000;
  if (when <= nowMs) return null;
  return when;
}

/** iOS allows 64 pending notifications. Leave a few slots for the weekly digest and a test. */
export const REMINDER_CAP = 60;

/** Personal items win on an id clash. Shared rows fill in behind them, then the cap keeps the soonest. */
export function mergeReminderSources(personal: ReminderSource[], shared: ReminderSource[]): ReminderSource[] {
  const seen = new Set<string>();
  const merged: ReminderSource[] = [];
  for (const item of personal) {
    if (seen.has(item.id)) continue;
    seen.add(item.id);
    merged.push(item);
  }
  for (const item of shared) {
    if (seen.has(item.id)) continue;
    seen.add(item.id);
    merged.push(item);
  }
  return merged;
}

export function planReminders(items: ReminderSource[], defaultOffsets: number[], nowMs: number): PlannedReminder[] {
  const planned: PlannedReminder[] = [];
  for (const item of items) {
    if (!item.dueAt || item.completedAt) continue;
    const offsets = item.reminderOffsets?.length ? item.reminderOffsets : defaultOffsets;
    for (const offset of offsets) {
      const fireAt = fireAtMs(item.dueAt, offset, nowMs);
      if (fireAt == null) continue;
      planned.push({ id: reminderId(item.id, offset), itemId: item.id, offset, fireAt, title: item.title });
    }
  }
  planned.sort((a, b) => a.fireAt - b.fireAt || a.id.localeCompare(b.id));
  return planned.slice(0, REMINDER_CAP);
}

/** Absolute date trigger. A raw millisecond number is already what expo stores; a Date makes that explicit. */
export function exactDateTrigger(fireAt: number, channelId?: string): { type: 'date'; date: Date; channelId?: string } {
  return {
    type: 'date',
    date: new Date(fireAt),
    ...(channelId ? { channelId } : {}),
  };
}

/** Read the fire time expo-notifications reports for an already scheduled request. */
export function scheduledFireAt(trigger: unknown): number | null {
  if (!trigger || typeof trigger !== 'object') return null;
  const record = trigger as Record<string, unknown>;
  if (typeof record.timestamp === 'number' && Number.isFinite(record.timestamp)) return record.timestamp;
  if (typeof record.value === 'number' && Number.isFinite(record.value)) return record.value;
  if (record.date instanceof Date) return record.date.getTime();
  if (typeof record.date === 'number' && Number.isFinite(record.date)) return record.date;
  return null;
}
