import { describe, expect, it, vi } from 'vitest';

import {
  formatInviteCode,
  inviteLink,
  normalizeInviteCode,
  sharedListError,
  sortSharedItems,
  type SharedItem,
} from '@/services/shared-lists';

// Hoisted by vitest, so the module above never loads the real client.
vi.mock('@/lib/supabase', () => ({ supabase: {} }));


describe('shared lists', () => {
  it('cleans and formats invite codes', () => {
    expect(normalizeInviteCode(' abcd-2345 ')).toBe('ABCD2345');
    expect(formatInviteCode('abcd2345')).toBe('ABCD-2345');
    expect(inviteLink('abcd-2345')).toBe('talktray://join?code=ABCD2345');
  });

  it('puts open items first, oldest first, then done items, latest first', () => {
    const item = (id: string, createdAt: string, doneAt: string | null): SharedItem => ({
      id, listId: 'l', title: id, addedBy: null, doneAt, doneBy: null, dueAt: null, createdAt,
    });
    const sorted = sortSharedItems([
      item('done-old', '2026-01-01', '2026-01-02'),
      item('open-new', '2026-01-03', null),
      item('open-old', '2026-01-01', null),
      item('done-new', '2026-01-01', '2026-01-05'),
    ]);
    expect(sorted.map((entry) => entry.id)).toEqual(['open-old', 'open-new', 'done-new', 'done-old']);
  });

  it('explains database errors', () => {
    expect(sharedListError({ code: 'P0002', message: 'invite not found' })).toBe('not_found');
    expect(sharedListError({ message: 'list has too many members' })).toBe('full');
    expect(sharedListError({ message: 'too many lists' })).toBe('too_many');
    expect(sharedListError(null)).toBe('network');
  });
});
