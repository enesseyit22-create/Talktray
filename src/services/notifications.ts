import AsyncStorage from '@react-native-async-storage/async-storage';
import { Linking, Platform } from 'react-native';
import * as Notifications from 'expo-notifications';

import type { InboxItem } from '@/domain/types';
import { translate } from '@/i18n/translate';
import { planReminders, scheduledFireAt, type PlannedReminder } from '@/services/reminder-schedule';

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

const EXACT_PROMPT = 'talktray.exactAlarmPrompted';

function notificationsAllowed(status: Notifications.NotificationPermissionsStatus): boolean {
  if (status.granted) return true;
  const ios = status.ios?.status;
  return (
    ios === Notifications.IosAuthorizationStatus.AUTHORIZED ||
    ios === Notifications.IosAuthorizationStatus.PROVISIONAL ||
    ios === Notifications.IosAuthorizationStatus.EPHEMERAL
  );
}

/** Opens the Android screen where the user allows exact alarms. The manifest permission is already in the installed build. */
export async function openExactAlarmSettings(): Promise<void> {
  if (Platform.OS !== 'android') return;
  try {
    await Linking.sendIntent('android.settings.REQUEST_SCHEDULE_EXACT_ALARM');
  } catch {
    await Linking.openSettings();
  }
}

export async function promptExactAlarmOnce(): Promise<void> {
  if (Platform.OS !== 'android') return;
  const seen = await AsyncStorage.getItem(EXACT_PROMPT);
  if (seen) return;
  await AsyncStorage.setItem(EXACT_PROMPT, '1');
  await openExactAlarmSettings();
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

async function scheduleOne(plan: PlannedReminder, locale: string): Promise<boolean> {
  const channelId = Platform.OS === 'android' ? CHANNEL : undefined;
  const content = {
    title: plan.title,
    body: bodyFor(plan.offset, plan.title, locale),
    data: { itemId: plan.itemId, url: `talktray://item/${plan.itemId}` },
    sound: 'default' as const,
  };
  try {
    await Notifications.scheduleNotificationAsync({
      identifier: plan.id,
      content,
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: plan.fireAt,
        ...(channelId ? { channelId } : {}),
      },
    });
    return true;
  } catch (error) {
    const seconds = Math.max(1, Math.round((plan.fireAt - Date.now()) / 1000));
    try {
      await Notifications.scheduleNotificationAsync({
        identifier: plan.id,
        content,
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
          seconds,
          ...(channelId ? { channelId } : {}),
        },
      });
      return true;
    } catch (again) {
      console.warn('[notifications] schedule failed', plan.id, error, again);
      return false;
    }
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
    const allowed = notificationsAllowed(await Notifications.getPermissionsAsync());
    const previous = await loadMap();
    for (const ids of Object.values(previous)) {
      for (const id of ids) {
        if (!id.startsWith('tt:')) await Notifications.cancelScheduledNotificationAsync(id).catch(() => undefined);
      }
    }
    if (Object.keys(previous).length) await saveMap({});

    const planned = allowed ? planReminders(items, defaultOffsets, Date.now()) : [];
    const existing = await Notifications.getAllScheduledNotificationsAsync();
    const plannedIds = new Set(planned.map((item) => item.id));
    for (const request of existing) {
      if (!request.identifier.startsWith('tt:')) continue;
      if (!plannedIds.has(request.identifier)) {
        await Notifications.cancelScheduledNotificationAsync(request.identifier).catch(() => undefined);
      }
    }
    const existingById = new Map(existing.map((request) => [request.identifier, request]));
    for (const item of planned) {
      const current = existingById.get(item.id);
      const when = current ? scheduledFireAt(current.trigger) : null;
      const sameTime = when != null && Math.abs(when - item.fireAt) < 1500;
      if (sameTime && current?.content.title === item.title) continue;
      if (current) await Notifications.cancelScheduledNotificationAsync(item.id).catch(() => undefined);
      await scheduleOne(item, locale);
    }
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
