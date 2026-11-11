import { Platform } from 'react-native';
import * as Calendar from 'expo-calendar';

import type { InboxItem } from '@/domain/types';
import { deviceTarget, type DeviceTarget } from '@/lib/device-target';

type DatedItem = Pick<InboxItem, 'type' | 'title' | 'notes' | 'dueAt' | 'allDay'>;

export type DeviceAddResult =
  | { ok: true; id: string | null; destination: DeviceTarget }
  | { ok: false; reason: 'denied' | 'unavailable' | 'unsupported' };

/** Asks for calendar or Reminders permission only when this is called. */
export async function addItemToDevice(item: DatedItem, timeZone: string): Promise<DeviceAddResult> {
  const destination = deviceTarget(item.type, Platform.OS);
  if (!item.dueAt || !destination) return { ok: false, reason: 'unsupported' };

  try {
    if (destination === 'reminders') {
      const reminders = await Calendar.requestRemindersPermissions();
      if (!reminders.granted) return { ok: false, reason: 'denied' };
      const lists = await Calendar.getCalendars(Calendar.EntityTypes.REMINDER);
      const list = lists.find((entry) => entry.allowsModifications) ?? lists[0];
      if (!list) return { ok: false, reason: 'unavailable' };
      const reminder = await list.createReminder({
        title: item.title,
        notes: item.notes ?? '',
        dueDate: new Date(item.dueAt),
        timeZone,
      });
      return { ok: true, id: reminder.id ?? null, destination };
    }

    const permission = await Calendar.requestCalendarPermissions(Platform.OS === 'ios');
    if (!permission.granted) return { ok: false, reason: 'denied' };
    const calendar = await writableCalendar();
    if (!calendar) return { ok: false, reason: 'unavailable' };
    const start = new Date(item.dueAt);
    const end = new Date(start.getTime() + (item.allDay ? 24 : 1) * 60 * 60 * 1000);
    const event = await calendar.createEvent({
      title: item.title,
      notes: item.notes ?? '',
      startDate: start,
      endDate: end,
      allDay: item.allDay,
      timeZone,
      alarms: [{ relativeOffset: -30, method: Calendar.AlarmMethod.ALERT }],
    });
    return { ok: true, id: event.id ?? null, destination };
  } catch {
    return { ok: false, reason: 'unavailable' };
  }
}

export async function exportItemToDevice(item: InboxItem, timeZone: string): Promise<string | null> {
  const result = await addItemToDevice(item, timeZone);
  return result.ok ? result.id : null;
}

async function writableCalendar() {
  if (Platform.OS === 'ios') {
    try {
      return Calendar.getDefaultCalendarSync();
    } catch {
      // Fall through to the first writable calendar.
    }
  }
  const calendars = await Calendar.getCalendars(Calendar.EntityTypes.EVENT);
  const writable = calendars.find((entry) => entry.allowsModifications) ?? calendars[0];
  if (!writable) return null;
  return Calendar.ExpoCalendar.get(writable.id);
}
