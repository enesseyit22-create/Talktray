import { Platform } from 'react-native';

import { supabase } from '@/lib/supabase';

function missingFunction(error: { code?: string; message?: string }) {
  if (error.code === 'PGRST202') return true;
  const message = error.message ?? '';
  return /touch_presence/i.test(message) && /could not find|schema cache|not found/i.test(message);
}

/** Tells the server this device is in the foreground. The clock is set on the server. */
export async function touchPresence(): Promise<void> {
  const platform = Platform.OS === 'ios' || Platform.OS === 'android' ? Platform.OS : 'web';
  const { error } = await supabase.rpc('touch_presence', { p_platform: platform });
  if (error && !missingFunction(error)) console.warn('[presence] heartbeat failed', error.message);
}
