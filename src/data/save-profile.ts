import { supabase } from '@/lib/supabase';

export class ProfileNotSavedError extends Error {
  readonly code = 'PROFILE_NOT_SAVED';

  constructor() {
    super('PROFILE_NOT_SAVED');
    this.name = 'ProfileNotSavedError';
  }
}

export type ProfileWrite = {
  displayName: string;
  username: string | null;
  timezone: string;
  locale: string;
  theme: string;
  exportToCalendar: boolean;
  notificationsEnabled: boolean;
  reminderOffsets: number[];
};

type Row = { id?: unknown; display_name?: unknown; username?: unknown };

/** A PostgREST update that matches nothing still comes back without an error. */
export function savedFromRow(data: unknown): { displayName: string; username: string | null } {
  const row = (Array.isArray(data) ? data[0] : data) as Row | null | undefined;
  if (!row || typeof row !== 'object' || !row.id) throw new ProfileNotSavedError();
  return {
    displayName: typeof row.display_name === 'string' ? row.display_name : '',
    username: typeof row.username === 'string' && row.username ? row.username : null,
  };
}

function isMissingFunction(error: { code?: string; message?: string }) {
  if (error.code === 'PGRST202') return true;
  const message = error.message ?? '';
  return /save_own_profile/i.test(message) && /could not find|schema cache|not found/i.test(message);
}

function isPrimaryKeyConflict(error: { message?: string; details?: string | null }) {
  const text = `${error.message ?? ''} ${error.details ?? ''}`;
  return text.includes('profiles_pkey') || /\(id\)=/i.test(text);
}

/**
 * Writes the signed-in profile and returns the stored display name and username.
 * Prefers save_own_profile when that migration is applied. Otherwise updates the
 * row and, if that matches nothing, inserts it. Zero rows is an error.
 */
export async function persistRemoteProfile(
  userId: string,
  profile: ProfileWrite,
): Promise<{ displayName: string; username: string | null }> {
  const rpc = await supabase.rpc('save_own_profile', {
    p_display_name: profile.displayName,
    p_username: profile.username,
    p_timezone: profile.timezone,
    p_locale: profile.locale,
    p_theme: profile.theme,
    p_export_to_calendar: profile.exportToCalendar,
    p_notifications_enabled: profile.notificationsEnabled,
    p_reminder_offsets: profile.reminderOffsets,
  });
  if (!rpc.error) return savedFromRow(rpc.data);
  if (!isMissingFunction(rpc.error)) throw rpc.error;

  const columns = {
    display_name: profile.displayName,
    username: profile.username,
    timezone: profile.timezone,
    locale: profile.locale,
    theme: profile.theme,
    export_to_calendar: profile.exportToCalendar,
    notifications_enabled: profile.notificationsEnabled,
    reminder_offsets: profile.reminderOffsets,
  };
  const updated = await supabase.from('profiles').update(columns).eq('id', userId).select('id, display_name, username');
  if (updated.error) throw updated.error;
  if (updated.data && updated.data.length > 0) return savedFromRow(updated.data[0]);

  const inserted = await supabase.from('profiles').insert({ id: userId, ...columns }).select('id, display_name, username');
  if (inserted.error) {
    if (inserted.error.code === '23505' && isPrimaryKeyConflict(inserted.error)) throw new ProfileNotSavedError();
    throw inserted.error;
  }
  if (!inserted.data?.length) throw new ProfileNotSavedError();
  return savedFromRow(inserted.data[0]);
}
