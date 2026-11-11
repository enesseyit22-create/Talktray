import { overrideIsActive } from '@/lib/pro-grant';
import { supabase } from '@/lib/supabase';

export type ProPlan = 'month' | 'year' | 'lifetime' | 'revoke';

export { overrideIsActive };

function missingOverrideColumn(error: { code?: string; message?: string }) {
  if (error.code === 'PGRST204' || error.code === '42703') return true;
  const message = error.message ?? '';
  return /pro_override_until/i.test(message) && /schema cache|could not find|does not exist/i.test(message);
}

/** The signed-in user's own grant. Missing column means the migration is not applied yet. */
export async function readOwnProOverride(userId: string): Promise<boolean> {
  const { data, error } = await supabase.from('profiles').select('pro_override_until').eq('id', userId).maybeSingle();
  if (error) {
    if (!missingOverrideColumn(error)) console.warn('[pro] override unread', error.message);
    return false;
  }
  const until = data && typeof data.pro_override_until === 'string' ? data.pro_override_until : null;
  return overrideIsActive(until);
}
