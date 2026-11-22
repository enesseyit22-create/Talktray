import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';
import { getLocales } from 'expo-localization';

import {
  asLocale,
  localeFromTag,
  LOCALES,
  LOCALE_LABELS,
  isLocalePreference,
  resolveLocalePreference,
  type Locale,
  type LocalePreference,
} from '@/i18n/locale';
import { dictionaries, translate } from '@/i18n/translate';

export {
  asLocale,
  isLocalePreference,
  localeFromTag,
  LOCALES,
  LOCALE_LABELS,
  resolveLocalePreference,
  type Locale,
  type LocalePreference,
};
export { translate };

export function deviceLocale(): Locale {
  const first = getLocales()[0];
  return localeFromTag(first?.languageCode, first?.languageTag);
}

type I18nValue = {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: (path: string, vars?: Record<string, string | number>) => string;
};

const I18nContext = createContext<I18nValue | null>(null);

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocale] = useState<Locale>(deviceLocale);
  const value = useMemo<I18nValue>(() => {
    const active = dictionaries[locale] ? locale : 'en';
    return {
      locale: active,
      setLocale: (next) => setLocale(asLocale(next)),
      t: (path, vars) => translate(active, path, vars),
    };
  }, [locale]);
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  const value = useContext(I18nContext);
  if (!value) throw new Error('useI18n must be used within I18nProvider');
  return value;
}
