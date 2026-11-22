import AsyncStorage from '@react-native-async-storage/async-storage';

import { shouldAskForRating } from '@/lib/rating';

const FIRST = 'talktray.rating.firstSeen';
const LAST = 'talktray.rating.lastAsked';
const COUNT = 'talktray.rating.savedRecordings';

export async function rememberFirstOpen(now = Date.now()): Promise<void> {
  const existing = await AsyncStorage.getItem(FIRST);
  if (!existing) await AsyncStorage.setItem(FIRST, String(now));
}

/** True when this save should open the rating sheet. */
export async function noteSavedRecording(now = Date.now()): Promise<boolean> {
  await rememberFirstOpen(now);
  const count = Number((await AsyncStorage.getItem(COUNT)) ?? '0') + 1;
  await AsyncStorage.setItem(COUNT, String(Number.isFinite(count) ? count : 1));
  const first = Number(await AsyncStorage.getItem(FIRST));
  const lastRaw = await AsyncStorage.getItem(LAST);
  const last = lastRaw ? Number(lastRaw) : null;
  return shouldAskForRating({
    savedRecordings: count,
    firstSeenAt: Number.isFinite(first) ? first : null,
    lastAskedAt: last != null && Number.isFinite(last) ? last : null,
    now,
  });
}

export async function markRatingAsked(now = Date.now()): Promise<void> {
  await AsyncStorage.setItem(LAST, String(now));
}
