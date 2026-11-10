const USERNAME = /^[a-z0-9_.]{3,20}$/;

export function normalizeUsername(value: string): string {
  return value.trim().toLowerCase();
}

export function usernameProblem(value: string): 'empty' | 'invalid' | null {
  const name = normalizeUsername(value);
  if (!name) return 'empty';
  if (!USERNAME.test(name)) return 'invalid';
  return null;
}
