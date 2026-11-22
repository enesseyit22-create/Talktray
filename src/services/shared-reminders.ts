import { supabase } from '@/lib/supabase';
import type { ReminderSource } from '@/services/reminder-schedule';
import { sharedRowsToSources, type SharedReminderRow } from '@/services/shared-reminder-sources';

export { sharedRowsToSources, type SharedReminderRow };

const listeners = new Set<() => void>();

/** Screens call this after a shared due time or a tick changes, so every open phone reschedules. */
export function notifySharedRemindersChanged(): void {
  for (const listener of listeners) listener();
}

export function onSharedRemindersChanged(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function missingDueColumn(error: { code?: string; message?: string }): boolean {
  if (error.code === 'PGRST204' || error.code === '42703') return true;
  const message = error.message ?? '';
  return /due_at/i.test(message) && /schema cache|could not find|does not exist/i.test(message);
}

/** Open shared items that have a time. Empty when the column is not migrated yet. */
export async function loadSharedReminderSources(): Promise<ReminderSource[]> {
  const { data, error } = await supabase
    .from('shared_list_items')
    .select('id, title, due_at, done_at')
    .not('due_at', 'is', null)
    .is('done_at', null);
  if (error) {
    if (!missingDueColumn(error)) console.warn('[shared-reminders]', error.message);
    return [];
  }
  return sharedRowsToSources((data ?? []) as SharedReminderRow[]);
}
