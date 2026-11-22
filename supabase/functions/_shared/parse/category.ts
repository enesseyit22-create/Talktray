import { fold } from './dates.ts';
import type { ItemType } from './types.ts';

export const CATEGORIES = ['shopping', 'work', 'home', 'health', 'personal', 'other'] as const;
export type Category = (typeof CATEGORIES)[number];

export function asCategory(value: unknown): Category | null {
  return typeof value === 'string' && (CATEGORIES as readonly string[]).includes(value) ? (value as Category) : null;
}

const HINTS: Array<[Category, string[]]> = [
  ['shopping', ['sut', 'ekmek', 'market', 'alisveris', 'grocery', 'buy', 'milk', 'bread', 'shopping']],
  ['work', ['toplanti', 'ofis', 'is', 'meeting', 'office', 'mail', 'slack', 'proje']],
  ['home', ['ev', 'fatura', 'temizlik', 'kira', 'home', 'rent', 'bill', 'clean']],
  ['health', ['doktor', 'ilac', 'saglik', 'hastane', 'doctor', 'medicine', 'health', 'dentist']],
  ['personal', ['spor', 'aile', 'arkadas', 'kisisel', 'gym', 'personal', 'friend']],
];

/** Stable category key. Shopping items stay in Alışveriş even without a keyword. */
export function inferCategory(input: { type?: ItemType | null; title?: string | null; listName?: string | null }): Category {
  if (input.type === 'shopping') return 'shopping';
  const text = fold(`${input.title ?? ''} ${input.listName ?? ''}`);
  for (const [category, words] of HINTS) {
    if (words.some((word) => text.includes(word))) return category;
  }
  return 'other';
}
