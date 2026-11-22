import { describe, expect, it } from 'vitest';

import { RATING_GAP_MS, RATING_MIN_AGE_MS, shouldAskForRating } from './rating';

const day = RATING_MIN_AGE_MS;

describe('rating prompt', () => {
  const now = Date.parse('2026-11-22T12:00:00.000Z');

  it('stays quiet on the first day and before five saves', () => {
    expect(
      shouldAskForRating({ savedRecordings: 5, firstSeenAt: now - day + 1000, lastAskedAt: null, now }),
    ).toBe(false);
    expect(
      shouldAskForRating({ savedRecordings: 4, firstSeenAt: now - 3 * day, lastAskedAt: null, now }),
    ).toBe(false);
  });

  it('asks once the account is a day old with five saves, then waits 90 days', () => {
    expect(
      shouldAskForRating({ savedRecordings: 5, firstSeenAt: now - day - 1, lastAskedAt: null, now }),
    ).toBe(true);
    expect(
      shouldAskForRating({ savedRecordings: 8, firstSeenAt: now - 10 * day, lastAskedAt: now - day, now }),
    ).toBe(false);
    expect(
      shouldAskForRating({
        savedRecordings: 8,
        firstSeenAt: now - 100 * day,
        lastAskedAt: now - RATING_GAP_MS - 1,
        now,
      }),
    ).toBe(true);
  });
});
