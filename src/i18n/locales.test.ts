import { describe, expect, it } from 'vitest';

import { en } from '@/i18n/en';
import { localeFromTag, LOCALES } from '@/i18n/locale';
import { dictionaries } from '@/i18n/translate';

function keys(value: unknown, prefix = ''): string[] {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return Object.entries(value as Record<string, unknown>).flatMap(([key, child]) =>
      keys(child, prefix ? `${prefix}.${key}` : key),
    );
  }
  return [prefix];
}

describe('locales', () => {
  it('gives every locale exactly the same keys as English', () => {
    const expected = keys(en).sort();
    expect(LOCALES).toHaveLength(10);
    for (const locale of LOCALES) {
      expect(keys(dictionaries[locale]).sort(), locale).toEqual(expected);
    }
  });

  it('maps Portuguese tags to pt-BR and unknown languages to English', () => {
    expect(localeFromTag('pt', 'pt-BR')).toBe('pt-BR');
    expect(localeFromTag('pt', 'pt-PT')).toBe('pt-BR');
    expect(localeFromTag('ja', 'ja-JP')).toBe('ja');
    expect(localeFromTag('tr', 'tr-TR')).toBe('tr');
    expect(localeFromTag('zh', 'zh-Hans')).toBe('en');
    expect(localeFromTag(null, null)).toBe('en');
  });
});
