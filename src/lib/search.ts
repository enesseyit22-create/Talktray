import type { InboxItem, Recording } from '@/domain/types';

const FOLD: Record<string, string> = { ı: 'i', ß: 'ss', ø: 'o', æ: 'ae', œ: 'oe', ł: 'l', đ: 'd' };

/**
 * Lowercases and strips accents so "Ahmet'i ara", "AHMETİ", "ışık" and "isik" all meet.
 * Turkish İ/ı and the usual Latin accents fold to plain ASCII letters. Other scripts pass through.
 */
export function foldText(text: string): string {
  return text
    .replace(/İ/g, 'i')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[ıßøæœłđ]/g, (char) => FOLD[char] ?? char)
    .replace(/[’'`´]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** True when every word of the query appears in one of the fields. */
export function matchesQuery(fields: (string | null | undefined)[], query: string): boolean {
  const words = foldText(query).split(' ').filter(Boolean);
  if (words.length === 0) return true;
  const haystack = foldText(fields.filter(Boolean).join(' '));
  return words.every((word) => haystack.includes(word));
}

export function searchItems(items: InboxItem[], query: string): InboxItem[] {
  return items.filter((item) => matchesQuery([item.title, item.notes, item.listName], query));
}

export function searchRecordings(recordings: Recording[], query: string): Recording[] {
  return recordings.filter((recording) => matchesQuery([recording.transcript], query));
}
