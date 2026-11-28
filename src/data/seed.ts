import { evaluateQuota, recordingLimit } from '../../shared/parse/quota';
import { addCalendarDays, zonedParts, zonedTimeToUtc } from '../../shared/parse/time';
import { SEED_COPY } from '@/data/seed-copy';
import type { Locale } from '@/i18n/locale';
import { createId } from '@/lib/id';
import type { DraftItem, InboxItem, Recording } from '@/domain/types';

function at(now: Date, timeZone: string, dayOffset: number, hour: number, minute: number) {
  const parts = zonedParts(now, timeZone);
  const day = addCalendarDays(parts, dayOffset);
  return zonedTimeToUtc({ ...day, hour, minute }, timeZone).toISOString();
}

export function buildSeed(now: Date, timeZone: string, locale: Locale) {
  const copy = SEED_COPY[locale] ?? SEED_COPY.en;
  const t = copy.items;
  const created = at(now, timeZone, 0, 9, 15);
  const items: InboxItem[] = [
    item('task', t[0], at(now, timeZone, 0, 15, 0), false, null, created),
    item('shopping', t[1], at(now, timeZone, 0, 10, 30), false, copy.market, created),
    item('note', t[2], null, false, null, created),
    item('task', t[3], at(now, timeZone, 1, 11, 0), false, null, created),
    item('task', t[4], at(now, timeZone, 2, 18, 0), false, null, created),
    item('task', t[5], null, false, null, created),
    item('task', t[6], at(now, timeZone, 1, 16, 30), false, null, created),
    item('note', t[7], null, false, null, created),
    item('note', t[8], null, false, null, created),
    item('reminder', t[9], at(now, timeZone, 1, 8, 30), false, null, created),
    item('event', t[10], at(now, timeZone, 2, 14, 0), false, null, created),
    item('shopping', t[11], null, false, copy.market, created),
  ];
  // A repeating task shows the repeat label in screenshots.
  items[4] = { ...items[4]!, repeat: 'monthly' };

  const recordings: Recording[] = Array.from({ length: 12 }, (_, index) => {
    const dayOffset = index < 3 ? 0 : -index;
    return {
      id: createId(),
      transcript:
        index === 0 ? copy.firstTranscript : copy.shortTranscript,
      language: locale,
      durationMs: 8000 + index * 1300,
      status: 'ready',
      storagePath: null,
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

/** The review screen sample used in preview mode: one take split into five kinds of items. */
export function buildPreviewDraft(now: Date, timeZone: string, locale: Locale): { transcript: string; items: DraftItem[] } {
  const copy = SEED_COPY[locale] ?? SEED_COPY.en;
  const weekday = zonedParts(now, timeZone).weekday;
  const toFriday = ((5 - weekday + 7) % 7) || 7;
  const draft = (type: DraftItem['type'], title: string, dueAt: string | null, listName: string | null = null): DraftItem => ({
    localId: createId(),
    type,
    title,
    notes: null,
    dueAt,
    allDay: false,
    listName,
    reminderOffsets: null,
    repeat: null,
  });
  return {
    transcript: copy.review.transcript,
    items: [
      draft('task', copy.review.task, at(now, timeZone, 1, 10, 0)),
      draft('reminder', copy.review.reminder, at(now, timeZone, 0, 20, 0)),
      draft('event', copy.review.event, at(now, timeZone, toFriday, 15, 0)),
      draft('shopping', copy.review.shopping, null, copy.market),
      draft('note', copy.review.note, null),
    ],
  };
}
