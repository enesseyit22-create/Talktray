import type { ParsedItem } from './types.ts';

/** A take this long, or this wordy, is worth a summary note (Pro). */
export const SUMMARY_MIN_SECONDS = 60;
export const SUMMARY_MIN_WORDS = 120;
const MAX_POINTS = 8;

export type RecordingSummary = {
  title: string;
  points: string[];
};

export function shouldSummarize(durationMs: number, transcript: string): boolean {
  const words = transcript.trim().split(/\s+/).filter(Boolean).length;
  if (words < 25) return false;
  return durationMs >= SUMMARY_MIN_SECONDS * 1000 || words >= SUMMARY_MIN_WORDS;
}

export function buildSummaryMessages(input: { transcript: string; locale: string }): { system: string; user: string } {
  const system = `You summarize a long voice recording, such as a meeting, a lecture, or someone thinking out loud.
Write in the language of the transcript (the user's language is ${input.locale || 'en'}). Never translate. Keep names as spoken.

Return ONLY JSON with this shape:
{"title":"string","points":["string"]}

Rules:
- title: what the recording was about, at most 8 words, no trailing period.
- points: 3 to ${MAX_POINTS} short bullet points, most important first. Include decisions, numbers, dates, and who does what.
- One idea per point. No filler such as "The speaker said".
- Do not invent anything that is not in the transcript.`;
  return { system, user: input.transcript };
}

function clean(value: unknown, max: number): string {
  return String(value ?? '')
    .replace(/^\s*(?:[•\-*]+|\d+[.)])\s*/, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}

export function normalizeSummary(payload: unknown): RecordingSummary | null {
  if (!payload || typeof payload !== 'object') return null;
  const record = payload as Record<string, unknown>;
  const title = clean(record.title, 120).replace(/[.。]$/, '');
  const raw = Array.isArray(record.points) ? record.points : [];
  const points = raw.map((point) => clean(point, 280)).filter(Boolean).slice(0, MAX_POINTS);
  if (!title || points.length === 0) return null;
  return { title, points };
}

/** The summary is saved as a note, so it lives with everything else and can be edited or deleted. */
export function summaryToNote(summary: RecordingSummary): ParsedItem {
  return {
    type: 'note',
    title: summary.title,
    notes: summary.points.map((point) => `• ${point}`).join('\n'),
    dueAt: null,
    allDay: false,
    listName: null,
    reminderOffsets: null,
  };
}
