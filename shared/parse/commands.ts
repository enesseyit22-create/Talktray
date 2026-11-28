import { fold, resolveRelativeDate } from './dates';
import { zonedTimeToUtc, zonedParts } from './time';

export type OpenItemRef = { id: string; title: string; dueAt?: string | null };

export type VoiceAction =
  | { kind: 'delete'; itemId: string; title: string }
  | { kind: 'reschedule'; itemId: string; title: string; dueAt: string }
  | { kind: 'ambiguous'; query: string; intent: 'delete' | 'reschedule'; dueAt: string | null; matches: Array<{ id: string; title: string }> };

const COMMAND = /\b(sil|delete|kaldir|yarina|tomorrow|erte|reschedule|move)\b|\d{1,2}\s*['’]?e\b/;

function isAccusative(word: string): boolean {
  return word.length > 3 && /(yi|yu|i|u)$/.test(word);
}

function stem(title: string): string {
  return fold(title).replace(/(yi|yı|yu|yü|i|ı|u|ü)$/u, '');
}

function root(value: string): string {
  return stem(value).replace(/[kg]$/, '');
}

function matches(query: string, title: string): boolean {
  const needle = root(query);
  const hay = root(title);
  if (needle.length < 3) return false;
  return hay.includes(needle) || needle.includes(hay);
}

function clockHour(text: string): number | null {
  const tick = text.match(/(\d{1,2})\s*['’]?\s*e\b/);
  if (tick) {
    let hour = Number(tick[1]);
    if (hour >= 1 && hour <= 7) hour += 12;
    if (hour >= 0 && hour <= 23) return hour;
  }
  const saat = text.match(/saat\s*(\d{1,2})/);
  if (saat) {
    const hour = Number(saat[1]);
    if (hour >= 0 && hour <= 23) return hour;
  }
  return null;
}

function nextDue(text: string, current: string | null | undefined, now: Date, timeZone: string): string | null {
  const folded = fold(text);
  const hour = clockHour(folded);
  if (/\byarina\b|\btomorrow\b/.test(folded) || hour != null) {
    const base = resolveRelativeDate(folded.includes('tomorrow') || folded.includes('yarina') ? 'tomorrow' : 'today', {
      now,
      timeZone,
    });
    const parts = zonedParts(base?.date ?? now, timeZone);
    const when = zonedTimeToUtc(
      { year: parts.year, month: parts.month, day: parts.day, hour: hour ?? (current ? zonedParts(new Date(current), timeZone).hour : 9), minute: 0 },
      timeZone,
    );
    return when.toISOString();
  }
  return null;
}

/**
 * Edit an existing item when the sentence is a command. Several matches stay unapplied
 * so the person can confirm. Ordinary sentences return nothing.
 */
export function parseVoiceCommands(
  transcript: string,
  openItems: OpenItemRef[],
  input: { now: Date; timeZone: string },
): VoiceAction[] {
  const text = fold(transcript);
  if (!COMMAND.test(text)) return [];
  const words = text.split(' ').filter((word) => isAccusative(word));
  const actions: VoiceAction[] = [];
  const used = new Set<string>();
  for (const word of words) {
    const hits = openItems.filter((item) => !used.has(item.id) && matches(word, item.title));
    if (!hits.length) continue;
    if (hits.length > 1) {
      const deleting = /\bsil\b|\bdelete\b|\bkaldir\b/.test(text);
      actions.push({
        kind: 'ambiguous',
        query: word,
        intent: deleting ? 'delete' : 'reschedule',
        dueAt: deleting ? null : nextDue(text, hits[0]?.dueAt, input.now, input.timeZone),
        matches: hits.map((item) => ({ id: item.id, title: item.title })),
      });
      continue;
    }
    const hit = hits[0]!;
    used.add(hit.id);
    if (/\bsil\b|\bdelete\b|\bkaldir\b/.test(text)) {
      actions.push({ kind: 'delete', itemId: hit.id, title: hit.title });
      continue;
    }
    const dueAt = nextDue(text, hit.dueAt, input.now, input.timeZone);
    if (!dueAt) continue;
    actions.push({ kind: 'reschedule', itemId: hit.id, title: hit.title, dueAt });
  }
  return actions;
}
