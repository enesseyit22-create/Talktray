import { describe, expect, it } from 'vitest';

import { overrideIsActive } from './pro-grant';

describe('pro override', () => {
  const now = Date.parse('2026-11-11T12:00:00.000Z');

  it('treats a future timestamp and infinity as active', () => {
    expect(overrideIsActive('2026-12-11T12:00:00.000Z', now)).toBe(true);
    expect(overrideIsActive('infinity', now)).toBe(true);
    expect(overrideIsActive('Infinity', now)).toBe(true);
  });

  it('treats a past timestamp, null, and junk as inactive', () => {
    expect(overrideIsActive('2026-11-01T12:00:00.000Z', now)).toBe(false);
    expect(overrideIsActive(null, now)).toBe(false);
    expect(overrideIsActive(undefined, now)).toBe(false);
    expect(overrideIsActive('not-a-date', now)).toBe(false);
  });
});
