import AsyncStorage from '@react-native-async-storage/async-storage';

import type { InboxItem, Profile, Recording, SessionUser } from '@/domain/types';
import type { ThemeMode } from '@/theme/ThemeProvider';
import { deviceLocale, isLocalePreference, resolveLocalePreference, type Locale, type LocalePreference } from '@/i18n';

const PREFS = 'talktray.prefs';
const DEMO = 'talktray.demo';

export type Prefs = {
  onboardingDone: boolean;
  theme: ThemeMode;
  locale: Locale;
  localePreference: LocalePreference;
};

export type DemoState = {
  user: SessionUser;
  profile: Profile;
  items: InboxItem[];
  recordings: Recording[];
  usageCount: number;
  usagePeriod: string;
  isPro: boolean;
};

const defaultPrefs: Prefs = {
  onboardingDone: false,
  theme: 'system',
  locale: 'en',
  localePreference: 'system',
};

export async function loadPrefs(): Promise<Prefs> {
  const device = deviceLocale();
  const raw = await AsyncStorage.getItem(PREFS);
  if (!raw) return { ...defaultPrefs, locale: device, localePreference: 'system' };
  try {
    const parsed = JSON.parse(raw) as Partial<Prefs>;
    const localePreference = isLocalePreference(parsed.localePreference) ? parsed.localePreference : 'system';
    const theme = parsed.theme === 'light' || parsed.theme === 'dark' || parsed.theme === 'system' ? parsed.theme : 'system';
    return {
      ...defaultPrefs,
      ...parsed,
      theme,
      localePreference,
      locale: resolveLocalePreference(localePreference, device),
    };
  } catch {
    return { ...defaultPrefs, locale: device, localePreference: 'system' };
  }
}

export async function savePrefs(prefs: Prefs) {
  await AsyncStorage.setItem(PREFS, JSON.stringify(prefs));
}

export async function loadDemo(): Promise<DemoState | null> {
  const raw = await AsyncStorage.getItem(DEMO);
  return raw ? (JSON.parse(raw) as DemoState) : null;
}

export async function saveDemo(state: DemoState | null) {
  if (!state) {
    await AsyncStorage.removeItem(DEMO);
    return;
  }
  await AsyncStorage.setItem(DEMO, JSON.stringify(state));
}
