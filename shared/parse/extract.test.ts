import { describe, expect, it } from 'vitest';
import { extractItems, SAMPLE_TRANSCRIPTS } from './extract';
import { zonedParts } from './time';

const TZ = 'Europe/Istanbul';
const NOW = new Date('2026-11-11T07:00:00.000Z');
const ctx = { now: NOW, timeZone: TZ, locale: 'tr' };

function dayOf(iso: string | null) {
  if (!iso) return null;
  const parts = zonedParts(new Date(iso), TZ);
  return { day: parts.day, hour: parts.hour };
}

describe('extractItems', () => {
  it('splits a Turkish mixed thought into reminder, shopping, and note', () => {
    const items = extractItems(
      "Yarın saat 9'da annemi ara. Marketten süt, ekmek ve yumurta al. Fikir: karanlık temayı indigo yap.",
      ctx,
    );
    expect(items.map((item) => item.type)).toEqual(['reminder', 'shopping', 'shopping', 'shopping', 'note']);
    expect(items[0]).toMatchObject({ title: 'Annemi ara', allDay: false });
    expect(dayOf(items[0]?.dueAt ?? null)).toEqual({ day: 12, hour: 9 });
    expect(items.slice(1, 4).map((item) => item.title)).toEqual(['Süt', 'Ekmek', 'Yumurta']);
    expect(items[1]?.listName).toBe('Market');
    expect(items[4]?.title).toBe('Karanlık temayı indigo yap');
  });

  it('classifies English reminders, events, tasks, and shopping', () => {
    expect(extractItems('Remind me to call Alex tomorrow at 9am.', ctx)[0]).toMatchObject({
      type: 'reminder',
      title: 'Call Alex',
    });
    expect(dayOf(extractItems('Remind me to call Alex tomorrow at 9am.', ctx)[0]?.dueAt ?? null)).toEqual({
      day: 12,
      hour: 9,
    });
    expect(extractItems('Cuma 14:00 diş hekimi randevusu', ctx)[0]).toMatchObject({
      type: 'event',
      title: 'Diş hekimi randevusu',
    });
    expect(dayOf(extractItems('Cuma 14:00 diş hekimi randevusu', ctx)[0]?.dueAt ?? null)).toEqual({
      day: 13,
      hour: 14,
    });
    expect(extractItems('Toplantı notlarını hazırla', ctx)[0]).toMatchObject({
      type: 'task',
      title: 'Toplantı notlarını hazırla',
    });
    const shopping = extractItems('Add milk and oats to the shopping list', ctx);
    expect(shopping.map((item) => item.title)).toEqual(['Milk', 'Oats']);
    expect(shopping[0]).toMatchObject({ type: 'shopping', listName: 'Shopping' });
  });

  it('parses the bundled Turkish and English samples into a full inbox', () => {
    const turkish = extractItems(SAMPLE_TRANSCRIPTS.tr, ctx);
    const english = extractItems(SAMPLE_TRANSCRIPTS.en, ctx);
    expect(turkish.some((item) => item.type === 'shopping')).toBe(true);
    expect(turkish.some((item) => item.dueAt)).toBe(true);
    expect(english.some((item) => item.type === 'event')).toBe(true);
    expect(english.some((item) => item.type === 'note')).toBe(true);
    expect(turkish.length).toBeGreaterThanOrEqual(4);
    expect(english.length).toBeGreaterThanOrEqual(4);
  });
});
