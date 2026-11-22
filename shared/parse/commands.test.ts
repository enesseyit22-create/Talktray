import { describe, expect, it } from 'vitest';

import { parseVoiceCommands } from './commands';

const now = new Date('2026-11-22T09:00:00.000Z');
const zone = 'Europe/Istanbul';

describe('voice commands', () => {
  const open = [
    { id: 'milk', title: 'Süt', dueAt: '2026-11-22T12:00:00.000Z' },
    { id: 'bread', title: 'Ekmek', dueAt: null },
    { id: 'meet', title: 'Toplantı', dueAt: '2026-11-23T10:00:00.000Z' },
    { id: 'meet2', title: 'Toplantı notu', dueAt: null },
  ];

  it('moves milk to tomorrow and deletes bread', () => {
    const moved = parseVoiceCommands('sütü yarına al', open, { now, timeZone: zone });
    expect(moved).toEqual([expect.objectContaining({ kind: 'reschedule', itemId: 'milk' })]);
    const removed = parseVoiceCommands('ekmeği sil', open, { now, timeZone: zone });
    expect(removed).toEqual([{ kind: 'delete', itemId: 'bread', title: 'Ekmek' }]);
  });

  it('moves the meeting to 15:00 and asks when two titles match', () => {
    const shifted = parseVoiceCommands("toplantıyı 3'e al", [open[2]!], { now, timeZone: zone });
    expect(shifted[0]?.kind).toBe('reschedule');
    if (shifted[0]?.kind === 'reschedule') {
      expect(new Date(shifted[0].dueAt).getUTCHours()).toBe(12);
    }
    const both = parseVoiceCommands('toplantıyı sil', open, { now, timeZone: zone });
    expect(both[0]?.kind).toBe('ambiguous');
  });

  it('ignores a normal sentence', () => {
    expect(parseVoiceCommands('yarın süt al', open, { now, timeZone: zone })).toEqual([]);
  });
});
