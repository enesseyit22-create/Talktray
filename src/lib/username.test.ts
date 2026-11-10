import { describe, expect, it } from 'vitest';

import { normalizeUsername, usernameProblem } from './username';

describe('username', () => {
  it('accepts a lower-case handle and rejects the rest', () => {
    expect(normalizeUsername('  Enes.Map ')).toBe('enes.map');
    expect(usernameProblem('enes_1')).toBeNull();
    expect(usernameProblem('ab')).toBe('invalid');
    expect(usernameProblem('has space')).toBe('invalid');
    expect(usernameProblem('')).toBe('empty');
  });
});
