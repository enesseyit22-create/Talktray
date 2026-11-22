import { describe, expect, it } from 'vitest';

import { cleanLongText, wordCount } from './long-text';

describe('long text', () => {
  it('keeps a story as one cleaned note and does not invent tasks', () => {
    const raw = 'ııı Bir varmış bir yokmuş. Küçük bir köyde Ayşe her sabah denize bakarmış. Sonra English sentence about the harbour. Ve gün biter.';
    const note = cleanLongText(raw);
    expect(note.body).not.toMatch(/"type"/);
    expect(note.body).toContain('Ayşe');
    expect(note.body).toContain('English sentence');
    expect(note.title.length).toBeGreaterThan(0);
    expect(note.title.length).toBeLessThanOrEqual(72);
    expect(wordCount(note.body)).toBeGreaterThan(5);
  });

  it('counts words and drops empty input', () => {
    expect(wordCount('  bir iki  üç ')).toBe(3);
    expect(cleanLongText('   ')).toEqual({ title: '', body: '' });
  });
});
