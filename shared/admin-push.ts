/** Turkish copy and dedupe ids for the admin push edge function. */

export type PremiumWord = 'aylık' | 'yıllık' | 'hediye';

export function signupBody(who: string): string {
  return `Yeni üye: ${who}`;
}

export function premiumBody(who: string, word: PremiumWord): string {
  return `Yeni Premium: ${who} (${word})`;
}

/** Prefer a username, then an email. Display name is only a last resort. */
export function memberLabel(...parts: Array<string | null | undefined>): string {
  for (const part of parts) {
    const text = part?.trim();
    if (text) return text;
  }
  return 'bilinmiyor';
}

/**
 * Store purchases are aylık or yıllık. An admin grant is always hediye,
 * including a gifted month or year.
 */
export function premiumWord(source: 'gift' | 'store', plan: string | null | undefined): PremiumWord {
  if (source === 'gift') return 'hediye';
  const value = (plan ?? '').toLowerCase();
  if (/year|annual|yillik|yıllık|p1y/.test(value)) return 'yıllık';
  if (/month|aylik|aylık|p1m/.test(value)) return 'aylık';
  return 'aylık';
}

/**
 * One store notification per user per plan, so the webhook and the app
 * cannot both deliver. A new gift (different end time) notifies once.
 */
export function premiumDeliveryId(input: {
  source: 'gift' | 'store';
  userId: string;
  word: PremiumWord;
  until?: string | null;
}): string {
  if (input.source === 'gift') {
    const until = (input.until ?? 'open').replace(/\s+/g, '').slice(0, 40);
    return `premium:gift:${input.userId}:${until}`;
  }
  return `premium:store:${input.userId}:${input.word}`;
}

export function signupDeliveryId(userId: string): string {
  return `signup:${userId}`;
}
