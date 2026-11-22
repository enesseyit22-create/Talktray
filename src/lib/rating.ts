/** Ask after several saved recordings, not on day one, and at most every 90 days. */

export const RATING_AFTER_SAVES = 5;
export const RATING_MIN_AGE_MS = 24 * 60 * 60 * 1000;
export const RATING_GAP_MS = 90 * 24 * 60 * 60 * 1000;

export const IOS_REVIEW_URL = 'https://apps.apple.com/app/id6833066274?action=write-review';
export const ANDROID_MARKET_URL = 'market://details?id=com.talktray.app';
export const ANDROID_REVIEW_WEB = 'https://play.google.com/store/apps/details?id=com.talktray.app';

export function shouldAskForRating(input: {
  savedRecordings: number;
  firstSeenAt: number | null;
  lastAskedAt: number | null;
  now: number;
}): boolean {
  if (input.savedRecordings < RATING_AFTER_SAVES) return false;
  if (input.firstSeenAt == null || !Number.isFinite(input.firstSeenAt)) return false;
  if (input.now - input.firstSeenAt < RATING_MIN_AGE_MS) return false;
  if (input.lastAskedAt != null && input.now - input.lastAskedAt < RATING_GAP_MS) return false;
  return true;
}
