import { fold } from './dates';
import type { ParsedItem } from './types';

/** Minutes before a due time. 0 means at the time of the event. */
export function parseReminderOffsets(text: string): number[] {
  const folded = fold(text);
  if (!folded) return [];
  const found = new Set<number>();
  const add = (minutes: number) => {
    if (Number.isFinite(minutes) && minutes >= 0 && minutes <= 10080) found.add(Math.round(minutes));
  };
  for (const match of folded.matchAll(/(\d+)\s*(?:dakika|dk|minutes?|mins?)\s*(?:kala|once|before)\b/g)) {
    add(Number(match[1]));
  }
  for (const match of folded.matchAll(/(\d+)\s*(?:saat|hours?|hrs?)\s*(?:kala|once|before)\b/g)) {
    add(Number(match[1]) * 60);
  }
  for (const match of folded.matchAll(/(\d+)\s*(?:gun|days?)\s*(?:kala|once|before)\b/g)) {
    add(Number(match[1]) * 1440);
  }
  if (/\b(?:bir|one|an)\s+(?:saat|hour)\s+(?:kala|once|before)\b/.test(folded)) add(60);
  if (/\byarim saat\s+(?:kala|once|before)\b/.test(folded)) add(30);
  if (/\b(?:tam zamaninda|at the time|at time)\b/.test(folded)) add(0);
  return [...found].sort((a, b) => a - b);
}

export function mergeSpokenOffsets(items: ParsedItem[], transcript: string): ParsedItem[] {
  const segments = transcript.split(/[.!?\n]+/);
  return items.map((item) => {
    if (item.reminderOffsets?.length) return item;
    const title = fold(item.title);
    const segment = segments.find((part) => {
      const folded = fold(part);
      return folded.includes(title.slice(0, Math.min(12, title.length))) && parseReminderOffsets(part).length > 0;
    });
    const offsets = segment ? parseReminderOffsets(segment) : [];
    return offsets.length > 0 ? { ...item, reminderOffsets: offsets } : item;
  });
}
