import AsyncStorage from '@react-native-async-storage/async-storage';

import type { InboxItem, Profile, Recording, SessionUser } from '@/domain/types';
import type { ThemeMode } from '@/theme/ThemeProvider';
import { asLocale, deviceLocale, type Locale } from '@/i18n';

const PREFS = 'talktray.prefs';
const DEMO = 'talktray.demo';

export type Prefs = {
  onboardingDone: boolean;
  theme: ThemeMode;
  locale: Locale;
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
};

export async function loadPrefs(): Promise<Prefs> {
  const raw = await AsyncStorage.getItem(PREFS);
  if (!raw) return { ...defaultPrefs, locale: deviceLocale() };
  try {
    const parsed = JSON.parse(raw) as Partial<Prefs>;
    return {
      ...defaultPrefs,
      ...parsed,
      locale: asLocale(parsed.locale ?? deviceLocale()),
    };
  } catch {
    return { ...defaultPrefs, locale: deviceLocale() };
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
