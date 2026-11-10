import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';

import type { InboxItem } from '@/domain/types';
import { translate } from '@/i18n/translate';

if (Platform.OS === 'ios' || Platform.OS === 'android') {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  });
}

export async function scheduleItemNotification(item: InboxItem, locale: string): Promise<string | null> {
  if (Platform.OS === 'web' || !item.dueAt) return null;
  const when = new Date(item.dueAt);
  if (when.getTime() <= Date.now() + 5000) return null;
  const current = await Notifications.getPermissionsAsync();
  let granted = current.granted;
  if (!granted) {
    const next = await Notifications.requestPermissionsAsync();
    granted = next.granted;
  }
  if (!granted) return null;
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('reminders', {
      name: translate(locale, 'notifications.channel'),
      importance: Notifications.AndroidImportance.HIGH,
    });
  }
  return Notifications.scheduleNotificationAsync({
    content: {
      title: item.title,
      body: translate(locale, 'notifications.reminder'),
      data: { itemId: item.id },
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DATE,
      date: when,
      channelId: 'reminders',
    },
  });
}

export async function cancelItemNotification(id: string | null) {
  if (Platform.OS === 'web' || !id) return;
  await Notifications.cancelScheduledNotificationAsync(id).catch(() => undefined);
}
