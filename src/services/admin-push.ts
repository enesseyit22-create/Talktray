import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import { supabase } from '@/lib/supabase';
import { ensureReminderChannel, requestReminderPermission } from '@/services/notifications';

const PROJECT_ID = '02e5d8f6-f11d-421c-92c9-2d4f699eed65';

function projectId(): string | null {
  const configured =
    Constants.expoConfig?.extra?.eas?.projectId ??
    Constants.easConfig?.projectId ??
    PROJECT_ID;
  return typeof configured === 'string' && configured ? configured : null;
}

function missingFunction(error: { code?: string; message?: string }) {
  if (error.code === 'PGRST202') return true;
  const message = error.message ?? '';
  return /save_admin_push_token/i.test(message) && /could not find|schema cache|not found/i.test(message);
}

/** Saves this device's Expo push token when the signed-in user is an admin. */
export async function registerAdminPushToken(): Promise<void> {
  if (Platform.OS === 'web') return;
  const gate = await supabase.rpc('is_admin');
  if (gate.error || gate.data !== true) return;

  await ensureReminderChannel('tr');
  const granted = await requestReminderPermission();
  if (!granted) return;

  const id = projectId();
  if (!id) return;
  try {
    const token = await Notifications.getExpoPushTokenAsync({ projectId: id });
    const saved = await supabase.rpc('save_admin_push_token', { p_token: token.data });
    if (saved.error && !missingFunction(saved.error)) {
      console.warn('[admin-push] token not saved', saved.error.message);
    }
  } catch (error) {
    console.warn('[admin-push] token unavailable', error);
  }
}
