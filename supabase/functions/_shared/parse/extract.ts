import { fold, resolveRelativeDate } from './dates.ts';
import { parseReminderOffsets } from './reminders.ts';
import type { ExtractContext, ItemType, ParsedItem } from './types.ts';

export const SAMPLE_TRANSCRIPTS = {
  tr: "Yarın saat 9'da annemi ara. Cuma 14:00 diş hekimi randevusu. Marketten süt, ekmek ve yumurta al. Fikir: açılış ekranında yumuşak bir dalga olsun.",
  en: 'Remind me to call Alex tomorrow at 9am. Dentist appointment Friday at 2pm. Add milk, bread and eggs to the shopping list. Idea: the launch screen should feel like soft glass.',
} as const;

function splitSegments(text: string): string[] {
  const out: string[] = [];
  let buf = '';
  for (const ch of text) {
    if (ch === '\n') {
      const trimmed = buf.trim();
      if (trimmed) out.push(trimmed);
      buf = '';
      continue;
    }
    buf += ch;
    if (ch === '.' || ch === '!' || ch === '?') {
      const trimmed = buf.trim().replace(/[.!?]+$/, '').trim();
      if (trimmed) out.push(trimmed);
      buf = '';
    }
  }
  const rest = buf.trim().replace(/[.!?]+$/, '').trim();
  if (rest) out.push(rest);
  return out;
}

function looksTurkish(original: string): boolean {
  return /[çğıöşüÇĞİÖŞÜ]/.test(original) || /\b(marketten|yarin|randevu|saat|fikir|annemi)\b/.test(fold(original));
}

function capitalize(input: string): string {
  const trimmed = input.replace(/\s+/g, ' ').replace(/^[\s,;:.-]+|[\s,;:.-]+$/g, '').trim();
  if (!trimmed) return '';
  const locale = looksTurkish(trimmed) ? 'tr-TR' : 'en-US';
  return trimmed.charAt(0).toLocaleUpperCase(locale) + trimmed.slice(1);
}

function isShopping(folded: string): boolean {
  if (/\b(marketten|market listesi|alisveris|shopping list|grocery|groceries|satin al|alinacak|almam lazim)\b/.test(folded)) {
    return true;
  }
  const buy = /\b(al|alin|alalim|buy|get|pick up)\b/.test(folded);
  return buy && (folded.includes(',') || /\b(ve|and)\b/.test(folded));
}

function classify(folded: string, ctx: ExtractContext): ItemType {
  if (isShopping(folded)) return 'shopping';
  if (/^(fikir|not|note|idea|dusunce)\b/.test(folded)) return 'note';
  const taskVerb = /\b(hazirla|gonder|yap|bitir|yaz|tamamla|prepare|send|finish|paylas|review)\b/.test(folded);
  const strongEvent = /\b(randevu|appointment|dentist|dis hekimi|hekim|doktor|doctor)\b/.test(folded);
  const softEvent = /\b(toplanti|meeting|etkinlik)\b/.test(folded);
  if (strongEvent || (softEvent && !taskVerb)) return 'event';
  if (/\b(hatirlat|remind|reminder|unutma|alarm|ara|cagir|call)\b/.test(folded)) return 'reminder';
  if (taskVerb || /\b(gorev|todo|task)\b/.test(folded)) return 'task';
  if (resolveRelativeDate(folded, ctx)) return 'reminder';
  return 'note';
}

const DATE_STRIPS: RegExp[] = [
  /\b(day after tomorrow|gelecek hafta|next week|haftaya|öbür gün|obur gun|bu akşam|bu aksam|bu sabah|this evening|this morning|this afternoon)\b/gi,
  /\b(yarın|bugün|dün|tomorrow|today|tonight|yesterday)\b/gi,
  /\b(pazartesi|salı|çarşamba|perşembe|cuma|cumartesi|pazar|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/gi,
  /\b\d+\s+(gün|gun)\s+sonra\b/gi,
  /\b\d+\s+hafta\s+sonra\b/gi,
  /\bin\s+\d+\s+(days?|weeks?)\b/gi,
  /\bsaat\s*\d{1,2}(?:[:.]\d{2})?(?:\s*'?\s*(?:da|de|ta|te))?\b/gi,
  /\bat\s+\d{1,2}(?::\d{2})?\s*(am|pm)?\b/gi,
  /\b\d{1,2}[:.]\d{2}\b/g,
  /\b\d{1,2}\s*(am|pm)\b/gi,
  /\b(sabah|akşam|aksam|öğlen|öğle|morning|evening|afternoon|günü|gunu|gelecek)\b/gi,
];

function cleanTitle(original: string): string {
  let body = original.trim();
  body = body.replace(/^(please\s+)?(remind me to|remember to|don't forget to|hatırlat(?:mayı)?|hatirlat|unutma)\s+/i, '');
  for (const pattern of DATE_STRIPS) body = body.replace(pattern, ' ');
  return capitalize(body);
}

function shoppingItems(original: string): { titles: string[]; listName: string } {
  const folded = fold(original);
  const turkish = looksTurkish(original);
  const listName = /market/.test(folded) ? 'Market' : turkish ? 'Alışveriş' : 'Shopping';
  let body = original;
  const strips = [
    /marketten/gi,
    /market listesine/gi,
    /alışveriş listesine/gi,
    /alisveris listesine/gi,
    /alışveriş/gi,
    /shopping list/gi,
    /grocery list/gi,
    /\b(add|buy|get|pick up|to the|onto the|from the)\b/gi,
    /\b(al|alın|alalım)\b/gi,
    /\blazım\b/gi,
  ];
  for (const pattern of strips) body = body.replace(pattern, ' ');
  const titles = body
    .split(/\s*,\s*|\s+ve\s+|\s+and\s+/i)
    .map((part) => capitalize(part))
    .filter((part) => part.length >= 2 && !/^(the|list|please|and|ve)$/i.test(part));
  return { titles, listName };
}

function offsetsFor(segment: string): number[] | null {
  const offsets = parseReminderOffsets(segment);
  return offsets.length > 0 ? offsets : null;
}

function dueFor(segment: string, ctx: ExtractContext): { dueAt: string | null; allDay: boolean } {
  const resolved = resolveRelativeDate(segment, ctx);
  if (!resolved) return { dueAt: null, allDay: false };
  return { dueAt: resolved.date.toISOString(), allDay: resolved.allDay };
}

export function extractItems(transcript: string, ctx: ExtractContext): ParsedItem[] {
  const items: ParsedItem[] = [];
  for (const segment of splitSegments(transcript)) {
    const folded = fold(segment);
    if (!folded) continue;
    const type = classify(folded, ctx);
    const due = dueFor(segment, ctx);
    if (type === 'shopping') {
      const { titles, listName } = shoppingItems(segment);
      const names = titles.length > 0 ? titles : [cleanTitle(segment) || 'Item'];
      for (const title of names) {
        items.push({
          type,
          title,
          notes: null,
          dueAt: due.dueAt,
          allDay: due.dueAt ? due.allDay : false,
          listName,
          reminderOffsets: offsetsFor(segment),
        });
      }
      continue;
    }
    let title = cleanTitle(segment);
    let notes: string | null = null;
    const noteBody = segment.match(/^\s*(?:fikir|not|note|idea|düşünce|dusunce)\s*[:\-–]\s*(.+)$/i);
    if (noteBody) title = capitalize(noteBody[1] ?? '');
    if (!title) title = type === 'note' ? 'Not' : 'Item';
    if (title.length > 140) {
      notes = title;
      title = `${title.slice(0, 120).trim()}…`;
    }
    items.push({
      type,
      title,
      notes,
      dueAt: due.dueAt,
      allDay: due.dueAt ? due.allDay : false,
      listName: null,
      reminderOffsets: offsetsFor(segment),
    });
  }
  return items;
}
