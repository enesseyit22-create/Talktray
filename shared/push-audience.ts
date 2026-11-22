export type PushAudience = 'all' | 'user' | 'free' | 'pro' | 'language';

export type PushPerson = {
  userId: string;
  locale: string | null;
  pro: boolean;
};

export function grantIsActive(until: string | null | undefined, nowMs: number): boolean {
  if (!until) return false;
  const value = until.trim().toLowerCase();
  if (value === 'infinity' || value === '+infinity') return true;
  const time = Date.parse(until);
  return Number.isFinite(time) && time > nowMs;
}

export function matchesAudience(
  person: PushPerson,
  audience: { kind: PushAudience; userId?: string | null; locale?: string | null },
): boolean {
  if (audience.kind === 'all') return true;
  if (audience.kind === 'user') return Boolean(audience.userId) && person.userId === audience.userId;
  if (audience.kind === 'pro') return person.pro;
  if (audience.kind === 'free') return !person.pro;
  const wanted = (audience.locale ?? '').trim().toLowerCase();
  return wanted.length > 0 && (person.locale ?? '').trim().toLowerCase() === wanted;
}
