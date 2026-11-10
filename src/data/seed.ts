import { evaluateQuota, recordingLimit } from '../../shared/parse/quota';
import { addCalendarDays, zonedParts, zonedTimeToUtc } from '../../shared/parse/time';
import type { InboxItem, Recording } from '@/domain/types';
import { createId } from '@/lib/id';

function at(now: Date, timeZone: string, dayOffset: number, hour: number, minute: number) {
  const parts = zonedParts(now, timeZone);
  const day = addCalendarDays(parts, dayOffset);
  return zonedTimeToUtc({ ...day, hour, minute }, timeZone).toISOString();
}

export function buildSeed(now: Date, timeZone: string, locale: 'en' | 'tr') {
  const tr = locale === 'tr';
  const created = at(now, timeZone, 0, 9, 15);
  const items: InboxItem[] = [
    item('task', tr ? 'Ahmet’i ara' : 'Call Ahmet', at(now, timeZone, 0, 15, 0), false, null, created),
    item('shopping', tr ? 'Süt, ekmek' : 'Milk, bread', at(now, timeZone, 0, 10, 30), false, 'Market', created),
    item('note', tr ? 'Proje fikri' : 'Project idea', null, false, null, created),
    item('task', tr ? 'Sunumu gözden geçir' : 'Review the deck', at(now, timeZone, 1, 11, 0), false, null, created),
    item('task', tr ? 'Faturayı öde' : 'Pay the invoice', at(now, timeZone, 2, 18, 0), false, null, created),
    item('task', tr ? 'Spor çantasını hazırla' : 'Pack the gym bag', null, false, null, created),
    item('task', tr ? 'E-postaları yanıtla' : 'Reply to email', at(now, timeZone, 1, 16, 30), false, null, created),
    item('note', tr ? 'Lavanta paletini kaydet' : 'Keep the lavender palette', null, false, null, created),
    item('note', tr ? 'Toplantıdan kalan soru' : 'Question left from the meeting', null, false, null, created),
    item('reminder', tr ? 'İlacı al' : 'Take the medicine', at(now, timeZone, 1, 8, 30), false, null, created),
    item('event', tr ? 'Diş hekimi' : 'Dentist', at(now, timeZone, 2, 14, 0), false, null, created),
    item('shopping', tr ? 'Yumurta' : 'Eggs', null, false, 'Market', created),
  ];

  const recordings: Recording[] = Array.from({ length: 12 }, (_, index) => {
    const dayOffset = index < 3 ? 0 : -index;
    return {
      id: createId(),
      transcript:
        index === 0
          ? tr
            ? 'Yarın saat 9’da annemi ara. Marketten süt ve ekmek al.'
            : 'Remind me to call mom tomorrow at 9. Add milk and bread.'
          : tr
            ? 'Kısa bir sesli not.'
            : 'A short voice note.',
      language: locale,
      durationMs: 8000 + index * 1300,
      status: 'ready',
      createdAt: at(now, timeZone, dayOffset, 9, Math.max(0, 50 - index)),
    };
  });

  const isPro = false;
  return {
    items,
    recordings,
    usageCount: recordings.length,
    usageLimit: recordingLimit(isPro),
    isPro,
    period: `${zonedParts(now, timeZone).year}-${String(zonedParts(now, timeZone).month).padStart(2, '0')}`,
    quota: evaluateQuota(recordings.length, isPro),
  };
}

function item(
  type: InboxItem['type'],
  title: string,
  dueAt: string | null,
  allDay: boolean,
  listName: string | null,
  createdAt: string,
): InboxItem {
  return {
    id: createId(),
    recordingId: null,
    type,
    title,
    notes: null,
    dueAt,
    allDay,
    listName,
    reminderOffsets: null,
    completedAt: null,
    calendarEventId: null,
    notificationId: null,
    createdAt,
    updatedAt: createdAt,
  };
}
