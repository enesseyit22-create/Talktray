import { resolveRelativeDate } from './dates.ts';
import { parseReminderOffsets } from './reminders.ts';
import { ITEM_TYPES, type ExtractContext, type ItemType, type ParsedItem } from './types.ts';

function readOffsets(record: Record<string, unknown>, text: string): number[] | null {
  const raw = record.reminder_offsets ?? record.reminderOffsets;
  const fromModel = Array.isArray(raw)
    ? raw.map((value) => Number(value)).filter((value) => Number.isInteger(value) && value >= 0 && value <= 10080)
    : [];
  const spoken = parseReminderOffsets(text);
  const merged = [...new Set([...fromModel, ...spoken])].sort((a, b) => a - b);
  return merged.length > 0 ? merged : null;
}

function stringOrNull(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function parseModelJson(raw: string): unknown {
  let text = raw.trim();
  if (!text) throw new Error('EMPTY_MODEL_OUTPUT');
  text = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start >= 0 && end > start) text = text.slice(start, end + 1);
  return JSON.parse(text);
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function readItems(payload: unknown): unknown[] {
  if (Array.isArray(payload)) return payload;
  const record = asRecord(payload);
  if (!record) return [];
  if (Array.isArray(record.items)) return record.items;
  return [];
}

export function normalizeExtraction(payload: unknown, ctx: ExtractContext): ParsedItem[] {
  const out: ParsedItem[] = [];
  for (const entry of readItems(payload)) {
    const record = asRecord(entry);
    if (!record) continue;
    const type = String(record.type ?? '').toLowerCase();
    if (!ITEM_TYPES.includes(type as ItemType)) continue;
    const title = String(record.title ?? '').trim();
    if (!title) continue;
    const dueRaw = record.due_at ?? record.dueAt;
    let dueAt: string | null = null;
    let allDay = Boolean(record.all_day ?? record.allDay ?? false);
    if (typeof dueRaw === 'string' && dueRaw.trim()) {
      const candidate = dueRaw.trim();
      const parsed = Date.parse(candidate);
      if (!Number.isNaN(parsed) && /^\d{4}-\d{2}-\d{2}/.test(candidate)) {
        dueAt = new Date(parsed).toISOString();
      } else {
        const resolved = resolveRelativeDate(candidate, ctx);
        if (resolved) {
          dueAt = resolved.date.toISOString();
          allDay = resolved.allDay;
        }
      }
    }
    const notes = stringOrNull(record.notes);
    out.push({
      type: type as ItemType,
      title,
      notes,
      dueAt,
      allDay: dueAt ? allDay : false,
      listName: stringOrNull(record.list_name ?? record.listName),
      reminderOffsets: readOffsets(record, `${title} ${notes ?? ''}`),
    });
  }
  return out;
}
