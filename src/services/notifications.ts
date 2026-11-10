import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';

import type { InboxItem } from '@/domain/types';
import { translate } from '@/i18n/translate';

const STORE = 'talktray.notificationIds';
const CHANNEL = 'reminders';

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

export async function ensureReminderChannel(locale: string) {
  if (Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync(CHANNEL, {
    name: translate(locale, 'notifications.channel'),
    importance: Notifications.AndroidImportance.HIGH,
    sound: 'default',
    vibrationPattern: [0, 250, 250, 250],
    enableVibrate: true,
  });
}

export async function requestReminderPermission(): Promise<boolean> {
  if (Platform.OS === 'web') return false;
  const current = await Notifications.getPermissionsAsync();
  if (current.granted) return true;
  const next = await Notifications.requestPermissionsAsync();
  return next.granted;
}

function bodyFor(offset: number, title: string, locale: string) {
  if (offset <= 0) return translate(locale, 'notifications.now', { title });
  if (offset === 60) return translate(locale, 'notifications.inHour', { title });
  if (offset === 1440) return translate(locale, 'notifications.inDay', { title });
  return translate(locale, 'notifications.inMinutes', { minutes: offset, title });
}

async function loadMap(): Promise<Record<string, string[]>> {
  const raw = await AsyncStorage.getItem(STORE);
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as Record<string, string[]>;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

async function saveMap(map: Record<string, string[]>) {
  await AsyncStorage.setItem(STORE, JSON.stringify(map));
}

async function scheduleOne(item: InboxItem, offset: number, locale: string): Promise<string | null> {
  if (!item.dueAt) return null;
  const when = new Date(new Date(item.dueAt).getTime() - offset * 60_000);
  if (when.getTime() <= Date.now() + 5000) return null;
  try {
    return await Notifications.scheduleNotificationAsync({
      content: {
        title: item.title,
        body: bodyFor(offset, item.title, locale),
        data: { itemId: item.id, url: `talktray://item/${item.id}` },
        sound: 'default',
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: when,
        channelId: CHANNEL,
      },
    });
  } catch (error) {
    console.warn('[notifications] schedule failed', item.id, offset, error);
    return null;
  }
}

let syncing = false;
let pending: { items: InboxItem[]; locale: string; defaultOffsets: number[] } | null = null;

export async function syncItemNotifications(items: InboxItem[], locale: string, defaultOffsets: number[]) {
  if (Platform.OS === 'web') return;
  if (syncing) {
    pending = { items, locale, defaultOffsets };
    return;
  }
  syncing = true;
  try {
    await ensureReminderChannel(locale);
    const granted = (await Notifications.getPermissionsAsync()).granted;
    const previous = await loadMap();
    for (const ids of Object.values(previous)) {
      for (const id of ids) await Notifications.cancelScheduledNotificationAsync(id).catch(() => undefined);
    }
    const next: Record<string, string[]> = {};
    if (granted) {
      for (const item of items) {
        if (!item.dueAt || item.completedAt) continue;
        const offsets = item.reminderOffsets?.length ? item.reminderOffsets : defaultOffsets;
        const ids: string[] = [];
        for (const offset of offsets) {
          const id = await scheduleOne(item, offset, locale);
          if (id) ids.push(id);
        }
        if (ids.length) next[item.id] = ids;
      }
    }
    await saveMap(next);
  } catch (error) {
    console.warn('[notifications] sync failed', error);
  } finally {
    syncing = false;
    const again = pending;
    pending = null;
    if (again) await syncItemNotifications(again.items, again.locale, again.defaultOffsets);
  }
}

export async function sendTestNotification(locale: string) {
  if (Platform.OS === 'web') return false;
  await ensureReminderChannel(locale);
  const granted = await requestReminderPermission();
  if (!granted) return false;
  try {
    await Notifications.scheduleNotificationAsync({
      content: {
        title: translate(locale, 'notifications.testTitle'),
        body: translate(locale, 'notifications.testBody'),
        sound: 'default',
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
        seconds: 2,
        channelId: CHANNEL,
      },
    });
    return true;
  } catch (error) {
    console.warn('[notifications] test failed', error);
    return false;
  }
}

export function openNotificationTarget(open: (itemId: string) => void) {
  if (Platform.OS === 'web') return;
  const response = Notifications.getLastNotificationResponse();
  const itemId = response?.notification.request.content.data?.itemId;
  if (typeof itemId === 'string' && itemId) open(itemId);
}

export function listenForNotificationTaps(open: (itemId: string) => void) {
  if (Platform.OS === 'web') return () => undefined;
  const sub = Notifications.addNotificationResponseReceivedListener((response) => {
    const itemId = response.notification.request.content.data?.itemId;
    if (typeof itemId === 'string' && itemId) open(itemId);
  });
  return () => sub.remove();
}

export async function cancelItemNotification(id: string | null) {
  if (Platform.OS === 'web' || !id) return;
  await Notifications.cancelScheduledNotificationAsync(id).catch((error) => {
    console.warn('[notifications] cancel failed', id, error);
  });
}
