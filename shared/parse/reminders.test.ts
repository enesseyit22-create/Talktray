import { describe, expect, it } from 'vitest';

import { parseReminderOffsets } from './reminders';

describe('parseReminderOffsets', () => {
  it('reads Turkish and English lead times', () => {
    expect(parseReminderOffsets('10 dakika kala hatırlat')).toEqual([10]);
    expect(parseReminderOffsets('Remind me 15 minutes before the meeting')).toEqual([15]);
    expect(parseReminderOffsets('1 saat önce ve tam zamanında hatırlat')).toEqual([0, 60]);
    expect(parseReminderOffsets('Yarın saat 9’da annemi ara')).toEqual([]);
  });
});
