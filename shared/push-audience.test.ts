import { describe, expect, it } from 'vitest';

import { grantIsActive, matchesAudience } from './push-audience';

describe('push audience', () => {
  const now = Date.parse('2026-11-22T12:00:00.000Z');
  const free = { userId: 'a', locale: 'tr', pro: false };
  const pro = { userId: 'b', locale: 'en', pro: true };

  it('treats an open-ended gift as Pro', () => {
    expect(grantIsActive('infinity', now)).toBe(true);
    expect(grantIsActive('2026-12-01T00:00:00.000Z', now)).toBe(true);
    expect(grantIsActive('2026-01-01T00:00:00.000Z', now)).toBe(false);
    expect(grantIsActive(null, now)).toBe(false);
  });

  it('filters all, one person, plan, and language', () => {
    expect(matchesAudience(free, { kind: 'all' })).toBe(true);
    expect(matchesAudience(free, { kind: 'user', userId: 'a' })).toBe(true);
    expect(matchesAudience(pro, { kind: 'user', userId: 'a' })).toBe(false);
    expect(matchesAudience(free, { kind: 'free' })).toBe(true);
    expect(matchesAudience(pro, { kind: 'pro' })).toBe(true);
    expect(matchesAudience(free, { kind: 'language', locale: 'TR' })).toBe(true);
    expect(matchesAudience(pro, { kind: 'language', locale: 'tr' })).toBe(false);
  });
});
