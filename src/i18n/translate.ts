import { de } from '@/i18n/de';
import { en, type Dictionary } from '@/i18n/en';
import { es } from '@/i18n/es';
import { fr } from '@/i18n/fr';
import { id } from '@/i18n/id';
import { it } from '@/i18n/it';
import { ja } from '@/i18n/ja';
import { ko } from '@/i18n/ko';
import { asLocale, type Locale } from '@/i18n/locale';
import { ptBR } from '@/i18n/pt-BR';
import { tr } from '@/i18n/tr';

export const dictionaries: Record<Locale, Dictionary> = {
  en,
  tr,
  es,
  'pt-BR': ptBR,
  de,
  fr,
  it,
  ja,
  ko,
  id,
};

function lookup(dict: Dictionary, path: string): string {
  const value = path.split('.').reduce<unknown>((acc, key) => {
    if (acc && typeof acc === 'object' && key in acc) {
      return (acc as Record<string, unknown>)[key];
    }
    return undefined;
  }, dict);
  return typeof value === 'string' ? value : path;
}

export function translate(locale: string, path: string, vars?: Record<string, string | number>): string {
  const dict = dictionaries[asLocale(locale)] ?? en;
  let text = lookup(dict, path);
  if (text === path) text = lookup(en, path);
  if (vars) {
    for (const [key, replacement] of Object.entries(vars)) {
      text = text.replaceAll(`{${key}}`, String(replacement));
    }
  }
  return text;
}
