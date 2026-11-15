import { describe, expect, it } from 'vitest';

import { normalizeSummary, shouldSummarize, summaryToNote } from './summary';

describe('summary', () => {
  it('summarizes only long or wordy takes', () => {
    const words = (count: number) => Array.from({ length: count }, () => 'kelime').join(' ');
    expect(shouldSummarize(90_000, words(60))).toBe(true);
    expect(shouldSummarize(20_000, words(150))).toBe(true);
    expect(shouldSummarize(20_000, words(40))).toBe(false);
    expect(shouldSummarize(300_000, words(10))).toBe(false);
  });

  it('cleans model output', () => {
    expect(
      normalizeSummary({ title: ' Haftalık plan toplantısı. ', points: ['- Bütçe onaylandı', '2) Ayşe teklifi cuma gönderir', '', 5] }),
    ).toEqual({ title: 'Haftalık plan toplantısı', points: ['Bütçe onaylandı', 'Ayşe teklifi cuma gönderir', '5'] });
  });

  it('rejects empty summaries', () => {
    expect(normalizeSummary({ title: 'X', points: [] })).toBeNull();
    expect(normalizeSummary({ points: ['a'] })).toBeNull();
    expect(normalizeSummary('nope')).toBeNull();
  });

  it('becomes a bulleted note', () => {
    const note = summaryToNote({ title: 'Plan', points: ['Bir', 'İki'] });
    expect(note.type).toBe('note');
    expect(note.notes).toBe('• Bir\n• İki');
  });
});
