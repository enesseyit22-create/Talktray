import { describe, expect, it } from 'vitest';

import { atEnd } from '@/lib/playback-end';

describe('atEnd', () => {
  it('treats a finished or nearly finished take as ended', () => {
    expect(atEnd({ didJustFinish: true, currentTime: 0, duration: 0 })).toBe(true);
    expect(atEnd({ didJustFinish: false, currentTime: 9.9, duration: 10 })).toBe(true);
    expect(atEnd({ didJustFinish: false, currentTime: 4, duration: 10 })).toBe(false);
    expect(atEnd({ didJustFinish: false, currentTime: 0, duration: 0 })).toBe(false);
  });
});
