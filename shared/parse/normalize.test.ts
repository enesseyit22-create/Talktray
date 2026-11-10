import { describe, expect, it } from 'vitest';
import { isRecordLink } from './links';
import { normalizeExtraction, parseModelJson } from './normalize';
import { buildExtractionMessages } from './prompt';
import { evaluateQuota } from './quota';
import { zonedParts } from './time';

const ctx = { now: new Date('2026-11-11T07:00:00.000Z'), timeZone: 'Europe/Istanbul' };

describe('normalizeExtraction', () => {
  it('strips markdown fences, resolves relative due dates, and drops invalid rows', () => {
    const payload = parseModelJson(`\`\`\`json
{"items":[
  {"type":"reminder","title":"Ara","due_at":"yarın saat 9","notes":null,"list_name":null},
  {"type":"idea","title":"Nope"},
  {"type":"task","title":"  "},
  {"type":"note","title":"Logo","due_at":null,"all_day":false}
]}
\`\`\``);
    const items = normalizeExtraction(payload, ctx);
    expect(items).toHaveLength(2);
    expect(items[0]?.type).toBe('reminder');
    const due = zonedParts(new Date(items[0]?.dueAt ?? ''), 'Europe/Istanbul');
    expect(due).toMatchObject({ day: 12, hour: 9 });
    expect(items[1]).toMatchObject({ type: 'note', title: 'Logo', dueAt: null, allDay: false });
  });
});

describe('quota', () => {
  it('enforces 25 free recordings and a 300 pro fair-use cap', () => {
    expect(evaluateQuota(24, false).allowed).toBe(true);
    expect(evaluateQuota(25, false)).toMatchObject({ allowed: false, limit: 25, remaining: 0 });
    expect(evaluateQuota(25, true).allowed).toBe(true);
    expect(evaluateQuota(300, true)).toMatchObject({ allowed: false, limit: 300, remaining: 0 });
  });
});

describe('prompt and links', () => {
  it('tells the model the timezone and to keep Turkish', () => {
    const { system } = buildExtractionMessages({
      transcript: 'yarın ara',
      nowIso: '2026-11-11T10:00:00+03:00',
      utcOffset: '+03:00',
      timeZone: 'Europe/Istanbul',
      locale: 'tr',
    });
    expect(system).toContain('Europe/Istanbul');
    expect(system).toContain('UTC offset');
    expect(system).toContain('+03:00');
    expect(system).not.toContain('Z');
    expect(system).toContain('yarın');
    expect(system).toContain('Turkish');
    expect(system).toContain('Never translate');
    expect(system).toContain('"type"');
  });

  it('asks other locales to phrase inbox text in the user language', () => {
    const { system } = buildExtractionMessages({
      transcript: '明日の9時に電話',
      nowIso: '2026-11-11T10:00:00+09:00',
      utcOffset: '+09:00',
      timeZone: 'Asia/Tokyo',
      locale: 'ja',
    });
    expect(system).toContain("user's language (ja)");
    expect(system).not.toContain('Never translate');
  });

  it('recognizes record deep links', () => {
    expect(isRecordLink('talktray://record')).toBe(true);
    expect(isRecordLink('talktray://record?autostart=1')).toBe(true);
    expect(isRecordLink('https://talktray.app/record')).toBe(true);
    expect(isRecordLink('talktray://inbox')).toBe(false);
  });
});
