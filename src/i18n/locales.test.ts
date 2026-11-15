import { describe, expect, it } from 'vitest';

import { en } from '@/i18n/en';
import { localeFromTag, LOCALES } from '@/i18n/locale';
import { dictionaries } from '@/i18n/translate';

function strings(value: unknown): string[] {
  if (typeof value === 'string') return [value];
  if (value && typeof value === 'object') return Object.values(value).flatMap(strings);
  return [];
}

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

  it('spells the brand TalkTray in every locale', () => {
    for (const locale of LOCALES) {
      const copy = strings(dictionaries[locale]);
      expect(copy.join('\n'), locale).not.toContain('Talktray');
      expect(dictionaries[locale].appName, locale).toBe('TalkTray');
    }
  });

  it('keeps the sign-in hint generic and the free quota parameterized', () => {
    for (const locale of LOCALES) {
      const auth = dictionaries[locale].auth;
      expect(auth.emailPlaceholder.toLowerCase(), locale).not.toContain('enes');
      expect(auth.emailPlaceholder.toLowerCase(), locale).not.toContain('talktray.app');
      expect(auth.namePlaceholder.toLowerCase(), locale).not.toContain('enes');
      expect(dictionaries[locale].paywall.subtitle, locale).toContain('{limit}');
      expect(dictionaries[locale].paywall.subtitle, locale).not.toMatch(/25/);
      expect(dictionaries[locale].paywall.subtitleOpen.length, locale).toBeGreaterThan(0);
    }
  });

  it('maps Portuguese tags to pt-BR and unknown languages to English', () => {
    expect(localeFromTag('pt', 'pt-BR')).toBe('pt-BR');
    expect(localeFromTag('pt', 'pt-PT')).toBe('pt-BR');
    expect(localeFromTag('ja', 'ja-JP')).toBe('ja');
    expect(localeFromTag('tr', 'tr-TR')).toBe('tr');
    expect(localeFromTag(null, 'tr-TR')).toBe('tr');
    expect(localeFromTag('in', 'in-ID')).toBe('id');
    expect(localeFromTag('id', 'id-ID')).toBe('id');
    expect(localeFromTag('zh', 'zh-Hans')).toBe('en');
    expect(localeFromTag(null, null)).toBe('en');
  });
});
