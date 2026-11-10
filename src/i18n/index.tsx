import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';
import { getLocales } from 'expo-localization';

import { en, type Dictionary } from '@/i18n/en';
import { tr } from '@/i18n/tr';

export type Locale = 'en' | 'tr';

const dictionaries: Record<Locale, Dictionary> = { en, tr };

export function deviceLocale(): Locale {
  const code = getLocales()[0]?.languageCode?.toLowerCase() ?? 'en';
  return code.startsWith('tr') ? 'tr' : 'en';
}

function lookup(dict: Dictionary, path: string): string {
  const value = path.split('.').reduce<unknown>((acc, key) => {
    if (acc && typeof acc === 'object' && key in acc) {
      return (acc as Record<string, unknown>)[key];
    }
    return undefined;
  }, dict);
  return typeof value === 'string' ? value : path;
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
    const dict = dictionaries[locale];
    return {
      locale,
      setLocale,
      t: (path, vars) => {
        let text = lookup(dict, path);
        if (vars) {
          for (const [key, replacement] of Object.entries(vars)) {
            text = text.replaceAll(`{${key}}`, String(replacement));
          }
        }
        return text;
      },
    };
  }, [locale]);
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  const value = useContext(I18nContext);
  if (!value) throw new Error('useI18n must be used within I18nProvider');
  return value;
}
