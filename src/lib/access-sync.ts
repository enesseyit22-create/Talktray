import { supabase } from '@/lib/supabase';

/**
 * Fallback re-read of gifts and free limits while the app is open, in case realtime is quiet.
 * Realtime delivers changes instantly, so this only needs to be slow. At 5 s every open phone
 * sent two queries every five seconds, which does not scale.
 */
export const ACCESS_REFRESH_MS = 120_000;

/**
 * Push updates for this user's Pro gift and the shared free-plan limits.
 * The tables have to be in the `supabase_realtime` publication. Until that
 * migration is applied, the subscription stays quiet and the poll still runs.
 */
export function subscribeAccessChanges(userId: string, onChange: () => void): () => void {
  const channel = supabase
    .channel(`access-${userId}`)
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'profiles', filter: `id=eq.${userId}` },
      () => onChange(),
    )
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'app_settings', filter: 'key=eq.free_limits' },
      () => onChange(),
    )
    .subscribe();
  return () => {
    void supabase.removeChannel(channel);
  };
}
