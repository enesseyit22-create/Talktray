import { describe, expect, it } from 'vitest';

import { localWeekKey, summarizeWeek } from '@/lib/week-summary';
import { streakCount, streakMilestone } from '@/lib/streak';
import type { InboxItem, Recording } from '@/domain/types';

const zone = 'Europe/Istanbul';
const now = new Date('2026-11-22T12:00:00.000Z');

function item(completedAt: string | null): InboxItem {
  return {
    id: completedAt ?? 'open',
    recordingId: null,
    type: 'task',
    title: 'İş',
    notes: null,
    dueAt: null,
    allDay: false,
    listName: null,
    reminderOffsets: null,
    repeat: null,
    completedAt,
    calendarEventId: null,
    notificationId: null,
    createdAt: completedAt ?? now.toISOString(),
    updatedAt: completedAt ?? now.toISOString(),
  };
}

describe('week and streak', () => {
  it('counts the week and names a stable week key', () => {
    const recordings: Recording[] = [
      { id: 'r', transcript: '', language: 'tr', durationMs: 1, status: 'ready', storagePath: null, createdAt: now.toISOString() },
    ];
    const summary = summarizeWeek([item(now.toISOString()), item(null)], recordings, now, zone);
    expect(summary.done).toBe(1);
    expect(summary.recordings).toBe(1);
    expect(summary.bestDay).toBeTruthy();
    expect(localWeekKey(now, zone)).toMatch(/^2026-W/);
  });

  it('counts a streak through today and marks 3, 7, and 30', () => {
    const stamps = [0, 1, 2].map((days) => new Date(now.getTime() - days * 24 * 60 * 60 * 1000).toISOString());
    expect(streakCount(stamps, now, zone)).toBeGreaterThanOrEqual(3);
    expect(streakMilestone(3)).toBe(3);
    expect(streakMilestone(7)).toBe(7);
    expect(streakMilestone(30)).toBe(30);
    expect(streakMilestone(4)).toBeNull();
    expect(streakCount([null], now, zone)).toBe(0);
  });
});
