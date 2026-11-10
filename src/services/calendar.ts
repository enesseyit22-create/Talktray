import { Platform } from 'react-native';
import * as Calendar from 'expo-calendar';

import type { InboxItem } from '@/domain/types';

export async function exportItemToDevice(item: InboxItem, timeZone: string): Promise<string | null> {
  if (Platform.OS === 'web' || !item.dueAt) return null;
  if (item.type !== 'event' && item.type !== 'reminder' && item.type !== 'task') return null;

  if (Platform.OS === 'ios' && item.type === 'reminder') {
    const reminders = await Calendar.requestRemindersPermissions();
    if (reminders.granted) {
      const lists = await Calendar.getCalendars(Calendar.EntityTypes.REMINDER);
      const list = lists.find((entry) => entry.allowsModifications) ?? lists[0];
      if (list) {
        const reminder = await list.createReminder({
          title: item.title,
          notes: item.notes ?? '',
          dueDate: new Date(item.dueAt),
          timeZone,
        });
        return reminder.id ?? null;
      }
    }
  }

  const permission = await Calendar.requestCalendarPermissions(Platform.OS === 'ios');
  if (!permission.granted) return null;

  let calendarId: string | null = null;
  if (Platform.OS === 'ios') {
    try {
      calendarId = Calendar.getDefaultCalendarSync().id;
    } catch {
      calendarId = null;
    }
  }
  if (!calendarId) {
    const calendars = await Calendar.getCalendars(Calendar.EntityTypes.EVENT);
    const writable = calendars.find((entry) => entry.allowsModifications) ?? calendars[0];
    calendarId = writable?.id ?? null;
  }
  if (!calendarId) return null;

  const calendar = await Calendar.ExpoCalendar.get(calendarId);
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
  return event.id ?? null;
}
