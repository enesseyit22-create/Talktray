import { normalizeOverrideUntil, overrideIsActive, type ProOverrideSnapshot } from '@/lib/pro-grant';
import { supabase } from '@/lib/supabase';

export type ProPlan = 'month' | 'year' | 'lifetime' | 'revoke';

export type { ProOverrideSnapshot };
export { overrideIsActive };

function missingOverrideColumn(error: { code?: string; message?: string }) {
  if (error.code === 'PGRST204' || error.code === '42703') return true;
  const message = error.message ?? '';
  return /pro_override_until/i.test(message) && /schema cache|could not find|does not exist/i.test(message);
}

/**
 * The signed-in user's own grant.
 * A missing column means the migration is not applied yet (no gifts).
 * Any other read error is unknown so a gift already on screen is not cleared.
 */
export async function readOwnProOverride(userId: string): Promise<ProOverrideSnapshot> {
  const { data, error } = await supabase.from('profiles').select('pro_override_until').eq('id', userId).maybeSingle();
  if (error) {
    if (missingOverrideColumn(error)) return { status: 'inactive' };
    console.warn('[pro] override unread', error.code ?? '', (error.message ?? '').slice(0, 200));
    return { status: 'unknown' };
  }
  const until = normalizeOverrideUntil(data?.pro_override_until);
  if (until && overrideIsActive(until)) return { status: 'active', until };
  return { status: 'inactive' };
}
