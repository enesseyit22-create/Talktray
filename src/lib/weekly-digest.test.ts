import { describe, expect, it } from 'vitest';

import type { InboxItem } from '@/domain/types';
import { digestStats, nextDigestAt } from '@/lib/weekly-digest';
import { zonedParts } from '../../shared/parse/time';

const IST = 'Europe/Istanbul';

describe('weekly digest', () => {
  it('lands on the coming Sunday at 19:00 local', () => {
    // Wed 18 Nov 2026, noon Istanbul
    const at = nextDigestAt(new Date('2026-11-18T09:00:00Z'), IST);
    const p = zonedParts(at, IST);
    expect([p.weekday, p.day, p.hour, p.minute]).toEqual([0, 22, 19, 0]);
  });

  it('moves to next week once Sunday evening has passed', () => {
    // Sun 22 Nov 2026, 20:00 Istanbul
    const at = nextDigestAt(new Date('2026-11-22T17:00:00Z'), IST);
    expect(zonedParts(at, IST).day).toBe(29);
  });

  it('counts the past week and the next one', () => {
    const at = new Date('2026-11-22T16:00:00Z');
    const base = {
      recordingId: null, notes: null, allDay: false, listName: null, reminderOffsets: null,
      calendarEventId: null, notificationId: null, createdAt: '', updatedAt: '', title: 'x', type: 'task',
    } as const;
    const items: InboxItem[] = [
      { ...base, id: 'a', dueAt: null, completedAt: '2026-11-20T10:00:00Z' },
      { ...base, id: 'b', dueAt: null, completedAt: '2026-11-01T10:00:00Z' },
      { ...base, id: 'c', dueAt: '2026-11-24T10:00:00Z', completedAt: null },
      { ...base, id: 'd', dueAt: '2026-12-24T10:00:00Z', completedAt: null },
      { ...base, id: 'e', type: 'note', dueAt: '2026-11-24T10:00:00Z', completedAt: null },
    ];
    expect(digestStats(items, at)).toEqual({ done: 1, upcoming: 1 });
  });
});
