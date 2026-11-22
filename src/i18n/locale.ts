export const LOCALES = ['en', 'tr', 'es', 'pt-BR', 'de', 'fr', 'it', 'ja', 'ko', 'id'] as const;

export type Locale = (typeof LOCALES)[number];

export const LOCALE_LABELS: Record<Locale, string> = {
  en: 'English',
  tr: 'Türkçe',
  es: 'Español',
  'pt-BR': 'Português',
  de: 'Deutsch',
  fr: 'Français',
  it: 'Italiano',
  ja: '日本語',
  ko: '한국어',
  id: 'Bahasa Indonesia',
};

const INTL_LOCALE: Record<Locale, string> = {
  en: 'en-US',
  tr: 'tr-TR',
  es: 'es-ES',
  'pt-BR': 'pt-BR',
  de: 'de-DE',
  fr: 'fr-FR',
  it: 'it-IT',
  ja: 'ja-JP',
  ko: 'ko-KR',
  id: 'id-ID',
};

export function isLocale(value: unknown): value is Locale {
  return typeof value === 'string' && (LOCALES as readonly string[]).includes(value);
}

export function asLocale(value: unknown): Locale {
  return isLocale(value) ? value : 'en';
}

/** Explicit in-app choice, or follow the device language. */
export type LocalePreference = 'system' | Locale;

export function isLocalePreference(value: unknown): value is LocalePreference {
  return value === 'system' || isLocale(value);
}

export function resolveLocalePreference(preference: LocalePreference, device: Locale): Locale {
  return preference === 'system' ? device : preference;
}

/** Map a device language to a shipped locale. Any Portuguese tag becomes pt-BR. */
export function localeFromTag(languageCode?: string | null, languageTag?: string | null): Locale {
  const code = (languageCode ?? '').trim().toLowerCase();
  const tag = (languageTag ?? '').trim().toLowerCase();
  const primary = (code || tag.split(/[-_]/)[0] || '').trim();
  if (primary === 'pt' || tag.startsWith('pt')) return 'pt-BR';
  // Android's legacy code for Indonesian is "in".
  if (primary === 'in' || primary === 'id') return 'id';
  const known = LOCALES.find((locale) => locale.toLowerCase() === primary || locale.toLowerCase() === tag);
  return known ?? 'en';
}

export function intlLocale(locale: string): string {
  return isLocale(locale) ? INTL_LOCALE[locale] : 'en-US';
}
