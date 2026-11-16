import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { flushSync } from 'react-dom';
import { getCalendars } from 'expo-localization';
import { AppState } from 'react-native';

import { buildSeed } from '@/data/seed';
import { loadDemo, loadPrefs, saveDemo, savePrefs, type DemoState } from '@/data/storage';
import type { Draft, DraftItem, InboxItem, Profile, Recording, SessionUser, Usage } from '@/domain/types';
import { asLocale, deviceLocale, resolveLocalePreference, translate, useI18n, type Locale } from '@/i18n';
import { isSupabaseConfigured } from '@/lib/config';
import { processErrorKey } from '@/lib/errors';
import { ACCESS_REFRESH_MS, subscribeAccessChanges } from '@/lib/access-sync';
import { loadFreeLimits, readFreeLimits, zonedDayStart, zonedMonthStart, type FreeLimits } from '@/lib/free-limits';
import { timeZoneForRequest } from '@/lib/format';
import { fetchAllPages } from '@/lib/fetch-all';
import { createId } from '@/lib/id';
import { overrideIsActive } from '@/lib/pro-grant';
import { readOwnProOverride } from '@/lib/pro-override';
import { mergeUsageState, nextGiftUntil, nextPlanLimit } from '@/lib/pro-usage';
import { supabase } from '@/lib/supabase';
import { signInWithApple, signInWithGoogle } from '@/services/auth';
import { exportItemToDevice, removeItemFromDevice } from '@/services/calendar';
import { persistRemoteProfile } from '@/data/save-profile';
import { registerAdminPushToken } from '@/services/admin-push';
import { touchPresence } from '@/services/presence';
import { cancelRemindersForItem, ensureReminderChannel, promptExactAlarmOnce, requestReminderPermission, syncItemNotifications, syncWeeklyDigest } from '@/services/notifications';
import {
  configurePurchases,
  loadStoreOffers,
  logOutPurchases,
  onProChange,
  purchaseOffer,
  readStorePro,
  restorePurchases,
} from '@/services/purchases';
import type { PurchaseResult, RestoreResult } from '@/services/billing-shared';
import { syncWidgets } from '@/services/widget-sync';
import { useTheme } from '@/theme/ThemeProvider';
import {
  decideFreeRecording,
  evaluateQuota,
  extractItems,
  monthPeriod,
  recordingLimit,
  SAMPLE_TRANSCRIPTS,
  safeTimeZone,
  deviceTimeZone,
  isSameZonedDay,
  asRepeat,
  nextOccurrence,
} from '../../shared/parse';

type AppValue = {
  ready: boolean;
  configured: boolean;
  mode: 'signedOut' | 'demo' | 'supabase';
  onboardingDone: boolean;
  user: SessionUser | null;
  profile: Profile;
  items: InboxItem[];
  recordings: Recording[];
  usage: Usage;
  /** Active admin gift. Null when there is no gift. A failed read keeps the previous value. */
  giftUntil: string | null;
  draft: Draft | null;
  banner: string | null;
  finishOnboarding: () => Promise<void>;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string, name: string) => Promise<'session' | 'confirm'>;
  signInApple: () => Promise<void>;
  signInGoogle: () => Promise<void>;
  enterDemo: (name: string, email?: string) => Promise<void>;
  signOut: () => Promise<void>;
  deleteAccount: () => Promise<void>;
  deleteAllRecordings: () => Promise<void>;
  deleteRecording: (id: string) => Promise<void>;
  deleteItems: (ids: string[]) => Promise<void>;
  updateProfile: (patch: Partial<Profile>) => Promise<void>;
  processThought: (input: { audioUri?: string | null; durationMs: number; transcript?: string }) => Promise<'review' | 'quota'>;
  updateDraftItem: (localId: string, patch: Partial<DraftItem>) => void;
  removeDraftItem: (localId: string) => void;
  addDraftItem: () => void;
  setDraftTranscript: (text: string) => void;
  reparseDraft: () => void;
  saveDraft: (exportCalendar: boolean) => Promise<void>;
  discardDraft: () => void;
  toggleComplete: (id: string) => Promise<void>;
  updateItem: (id: string, patch: Partial<InboxItem>) => Promise<void>;
  deleteItem: (id: string) => Promise<void>;
  clearSamples: () => Promise<void>;
  simulatePro: () => Promise<void>;
  purchase: (plan: 'monthly' | 'yearly') => Promise<PurchaseResult>;
  restore: () => Promise<RestoreResult>;
  clearBanner: () => void;
  openSample: (locale: Locale) => Promise<'review' | 'quota'>;
};

const AppContext = createContext<AppValue | null>(null);

function defaultProfile(locale: Locale, timeZone: string): Profile {
  return {
    displayName: '',
    username: null,
    timezone: timeZone,
    locale,
    localePreference: 'system',
    theme: 'system',
    exportToCalendar: false,
    notificationsEnabled: true,
    reminderOffsets: [0],
  };
}

function authProvider(user: {
  app_metadata?: { provider?: string };
  identities?: { provider?: string }[] | null;
}): string {
  return user.app_metadata?.provider || user.identities?.[0]?.provider || 'email';
}

function sampleTranscript(locale: string): string {
  return locale === 'tr' ? SAMPLE_TRANSCRIPTS.tr : SAMPLE_TRANSCRIPTS.en;
}

function phoneTimeZone() {
  return safeTimeZone(getCalendars()[0]?.timeZone ?? deviceTimeZone());
}

export function AppProvider({ children }: { children: ReactNode }) {
  const { setLocale } = useI18n();
  const { setMode } = useTheme();
  const [ready, setReady] = useState(false);
  const [onboardingDone, setOnboardingDone] = useState(false);
  const [mode, setAppMode] = useState<AppValue['mode']>('signedOut');
  const [user, setUser] = useState<SessionUser | null>(null);
  const [profile, setProfile] = useState<Profile>(defaultProfile(deviceLocale(), phoneTimeZone()));
  const [items, setItems] = useState<InboxItem[]>([]);
  const [recordings, setRecordings] = useState<Recording[]>([]);
  const [usage, setUsage] = useState<Usage>({
    period: monthPeriod(new Date(), phoneTimeZone()),
    count: 0,
    limit: recordingLimit(false),
    isPro: false,
  });
  const [draft, setDraft] = useState<Draft | null>(null);
  const [banner, setBanner] = useState<string | null>(null);
  const [giftUntil, setGiftUntil] = useState<string | null>(null);
  const storePro = useRef(false);
  const giftUntilRef = useRef<string | null>(null);
  const giftUserRef = useRef<string | null>(null);

  const applyProfile = useCallback(
    (next: Profile) => {
      setProfile(next);
      setLocale(next.locale);
      setMode(next.theme);
    },
    [setLocale, setMode],
  );

  const persistDemo = useCallback(
    async (next: Omit<DemoState, 'user' | 'profile'> & { user: SessionUser; profile: Profile }) => {
      await saveDemo(next);
    },
    [],
  );

  const loadRemote = useCallback(
    async (sessionUser: {
      id: string;
      email?: string | null;
      app_metadata?: { provider?: string };
      identities?: { provider?: string }[] | null;
    }) => {
      const userId = sessionUser.id;
      const email = sessionUser.email ?? '';
      const prefs = await loadPrefs();
      const localePreference = prefs.localePreference;
      const [{ data: profileRow }, { data: itemRows }, { data: recordingRows }] = await Promise.all([
        supabase.from('profiles').select('*').eq('id', userId).maybeSingle(),
        fetchAllPages((from, to) =>
          supabase.from('items').select('*').order('created_at', { ascending: false }).order('id').range(from, to),
        ),
        fetchAllPages((from, to) =>
          supabase.from('recordings').select('*').order('created_at', { ascending: false }).order('id').range(from, to),
        ),
      ]);
      const nextProfile: Profile = {
        displayName: profileRow?.display_name || email.split('@')[0] || 'TalkTray',
        username: typeof profileRow?.username === 'string' ? profileRow.username : null,
        timezone: timeZoneForRequest(safeTimeZone(profileRow?.timezone || phoneTimeZone()), phoneTimeZone()),
        locale: resolveLocalePreference(localePreference, deviceLocale()),
        localePreference,
        theme: profileRow?.theme === 'light' || profileRow?.theme === 'dark' ? profileRow.theme : 'system',
        exportToCalendar: Boolean(profileRow?.export_to_calendar),
        notificationsEnabled: profileRow?.notifications_enabled !== false,
        reminderOffsets: readReminderOffsets(profileRow?.reminder_offsets),
      };
      const deviceZone = phoneTimeZone();
      if (profileRow?.timezone === 'UTC' && deviceZone !== 'UTC' && nextProfile.timezone === deviceZone) {
        await supabase.from('profiles').update({ timezone: deviceZone }).eq('id', userId);
      }
      applyProfile(nextProfile);
      await configurePurchases(userId);
      const store = await loadStoreOffers().catch(() => null);
      const storeIsPro = store?.isPro ?? false;
      storePro.current = storeIsPro;
      const previousGift = giftUserRef.current === userId ? giftUntilRef.current : null;
      giftUserRef.current = userId;
      const grant = await readOwnProOverride(userId);
      if (giftUserRef.current !== userId) return;
      const until = nextGiftUntil(previousGift, grant);
      giftUntilRef.current = until;
      const limits = await loadFreeLimits().catch(() => null);
      const period = monthPeriod(new Date(), nextProfile.timezone);
      const count =
        (await countMonthCredits(nextProfile.timezone)) ??
        (recordingRows ?? []).filter((row) => {
          if (row.status === 'failed') return false;
          return monthPeriod(new Date(String(row.created_at)), nextProfile.timezone) === period;
        }).length;
      flushSync(() => {
        setUser({ id: userId, email, provider: authProvider(sessionUser) });
        setItems((itemRows ?? []).map(mapItem));
        setRecordings((recordingRows ?? []).map(mapRecording));
        setGiftUntil(until);
        setUsage({
          period,
          count,
          limit: storeIsPro || overrideIsActive(until) ? recordingLimit(true) : freeMonthLimit(limits),
          isPro: storeIsPro || overrideIsActive(until),
        });
        setAppMode('supabase');
      });
    },
    [applyProfile],
  );

  useEffect(() => {
    let active = true;
    (async () => {
      const prefs = await loadPrefs();
      if (!active) return;
      setOnboardingDone(prefs.onboardingDone);
      const locale = resolveLocalePreference(prefs.localePreference, deviceLocale());
      setLocale(locale);
      setMode(prefs.theme);
      const preview = process.env.EXPO_PUBLIC_PREVIEW === '1';
      const previewLocale = asLocale(process.env.EXPO_PUBLIC_PREVIEW_LOCALE || locale);
      if (preview) {
        const name = process.env.EXPO_PUBLIC_PREVIEW_NAME || 'TalkTray';
        const timeZone = phoneTimeZone();
        const seeded = buildSeed(new Date(), timeZone, previewLocale === 'tr' ? 'tr' : 'en');
        const nextProfile = {
          ...defaultProfile(previewLocale, timeZone),
          displayName: name,
          localePreference: prefs.localePreference,
        };
        applyProfile(nextProfile);
        setUser({ id: 'preview', email: 'preview@example.com' });
        setItems(seeded.items);
        setRecordings(seeded.recordings);
        setUsage({
          period: seeded.period,
          count: seeded.usageCount,
          limit: seeded.usageLimit,
          isPro: false,
        });
        setAppMode('demo');
        setOnboardingDone(true);
        setReady(true);
        return;
      }
      if (isSupabaseConfigured) {
        const { data } = await supabase.auth.getSession();
        if (data.session?.user) {
          try {
            await loadRemote(data.session.user);
          } catch {
            if (!active) return;
            setUser({
              id: data.session.user.id,
              email: data.session.user.email ?? '',
              provider: authProvider(data.session.user),
            });
            setAppMode('supabase');
            setBanner(translate(locale, 'errors.network'));
          }
        }
      } else {
        const demo = await loadDemo();
        if (demo) {
          applyProfile({
            ...demo.profile,
            localePreference: prefs.localePreference,
            locale: resolveLocalePreference(prefs.localePreference, deviceLocale()),
          });
          setUser(demo.user);
          setItems(demo.items);
          setRecordings(demo.recordings);
          const period = monthPeriod(new Date(), demo.profile.timezone);
          const count = demo.usagePeriod === period ? demo.usageCount : 0;
          setUsage({ period, count, limit: recordingLimit(demo.isPro), isPro: demo.isPro });
          setAppMode('demo');
        }
      }
      if (active) setReady(true);
    })().catch(() => {
      if (active) setReady(true);
    });
    if (!isSupabaseConfigured) return () => {
      active = false;
    };
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session?.user) return;
      loadRemote(session.user).catch(() => undefined);
    });
    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, [applyProfile, loadRemote, setLocale, setMode]);

  useEffect(() => {
    if (mode !== 'supabase' || !user) return;
    void registerAdminPushToken();
  }, [mode, user]);

  useEffect(() => {
    if (mode !== 'supabase' || !user) return;
    const userId = user.id;
    let stopped = false;
    let accessTimer: ReturnType<typeof setInterval> | undefined;
    let presenceTimer: ReturnType<typeof setInterval> | undefined;

    const refreshAccess = () => {
      void (async () => {
        const [grant, limits] = await Promise.all([
          readOwnProOverride(userId),
          readFreeLimits().catch(() => null),
        ]);
        if (stopped || giftUserRef.current !== userId) return;
        const until = nextGiftUntil(giftUntilRef.current, grant);
        if (giftUntilRef.current !== until) {
          giftUntilRef.current = until;
          setGiftUntil(until);
        }
        if (grant.status === 'unknown' && !limits) return;
        setUsage((current) => {
          const isPro = storePro.current || overrideIsActive(until);
          const limit = nextPlanLimit({
            isPro,
            wasPro: current.isPro,
            currentLimit: current.limit,
            freeMonthLimit: limits ? limits.free_recordings_per_month : undefined,
          });
          if (current.isPro === isPro && current.limit === limit) return current;
          return { ...current, isPro, limit };
        });
      })();
    };

    const beatPresence = () => {
      void (async () => {
        const store = await readStorePro();
        if (stopped || giftUserRef.current !== userId) return;
        if (typeof store === 'boolean') storePro.current = store;
        void touchPresence(storePro.current);
        refreshAccess();
      })();
    };

    const start = () => {
      if (accessTimer) return;
      beatPresence();
      accessTimer = setInterval(refreshAccess, ACCESS_REFRESH_MS);
      presenceTimer = setInterval(beatPresence, 60_000);
    };
    const stop = () => {
      if (accessTimer) clearInterval(accessTimer);
      if (presenceTimer) clearInterval(presenceTimer);
      accessTimer = undefined;
      presenceTimer = undefined;
    };
    if (AppState.currentState === 'active') start();
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') start();
      else stop();
    });
    const unsubscribe = subscribeAccessChanges(userId, refreshAccess);
    return () => {
      stopped = true;
      stop();
      sub.remove();
      unsubscribe();
    };
  }, [mode, user]);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state !== 'active') return;
      setProfile((current) => {
        if (current.localePreference !== 'system') return current;
        const next = deviceLocale();
        if (next === current.locale) return current;
        setLocale(next);
        return { ...current, locale: next };
      });
    });
    return () => sub.remove();
  }, [setLocale]);

  useEffect(() => {
    if (!user) return;
    const now = new Date();
    const todayCount = recordings.filter((recording) =>
      isSameZonedDay(new Date(recording.createdAt), now, profile.timezone),
    ).length;
    const openTasks = items.filter((item) => item.type === 'task' && !item.completedAt).length;
    syncWidgets({ todayCount, openTasks });
  }, [items, recordings, user, profile.timezone]);

  // Renewals, expiries, and purchases made elsewhere update the plan without a restart.
  useEffect(() => {
    if (mode !== 'supabase') return;
    return onProChange((isPro) => {
      setUsage((current) =>
        current.isPro === isPro ? current : { ...current, isPro, limit: isPro ? recordingLimit(true) : current.limit },
      );
    });
  }, [mode]);

  useEffect(() => {
    void ensureReminderChannel(profile.locale);
  }, [profile.locale]);

  useEffect(() => {
    if (!user) return;
    const run = () => {
      void syncItemNotifications(profile.notificationsEnabled ? items : [], profile.locale, profile.reminderOffsets);
      void syncWeeklyDigest(items, profile.locale, profile.timezone, profile.notificationsEnabled);
    };
    // Typing in an item changes it on every key. Reschedule once the edits settle.
    const timer = setTimeout(run, 800);
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') run();
    });
    return () => {
      clearTimeout(timer);
      sub.remove();
    };
  }, [user, items, profile.notificationsEnabled, profile.locale, profile.reminderOffsets, profile.timezone]);

  const snapshotDemo = useCallback(
    async (overrides: Partial<DemoState> = {}) => {
      if (!user) return;
      const next: DemoState = {
        user,
        profile,
        items,
        recordings,
        usageCount: usage.count,
        usagePeriod: usage.period,
        isPro: usage.isPro,
        ...overrides,
      };
      await persistDemo(next);
    },
    [items, persistDemo, profile, recordings, usage.count, usage.isPro, usage.period, user],
  );

  const actions = useRef<Pick<AppValue, 'enterDemo' | 'updateProfile' | 'processThought'> | null>(null);

  // Item edits are saved to the server after typing pauses, one write per item, newest state wins.
  const pendingWrites = useRef(new Map<string, InboxItem>());
  const writeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const localeRef = useRef(profile.locale);
  useEffect(() => {
    localeRef.current = profile.locale;
  }, [profile.locale]);

  const flushWrites = useCallback(async () => {
    if (writeTimer.current) clearTimeout(writeTimer.current);
    writeTimer.current = null;
    const batch = [...pendingWrites.current.values()];
    pendingWrites.current.clear();
    for (const updated of batch) {
      const { error } = await supabase
        .from('items')
        .update({
          type: updated.type,
          title: updated.title,
          notes: updated.notes,
          due_at: updated.dueAt,
          all_day: updated.allDay,
          list_name: updated.listName,
          reminder_offsets: updated.reminderOffsets,
          repeat: updated.dueAt ? updated.repeat ?? null : null,
          notification_id: updated.notificationId,
        })
        .eq('id', updated.id);
      if (error) setBanner(translate(localeRef.current, 'errors.saveFailed'));
    }
  }, []);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state !== 'active') void flushWrites();
    });
    return () => {
      sub.remove();
      void flushWrites();
    };
  }, [flushWrites]);

  const value = useMemo<AppValue>(() => {
    const refreshUsage = (count: number, isPro: boolean, period = usage.period, limit = recordingLimit(isPro)) => {
      setUsage({ period, count, limit, isPro });
    };

    return {
      ready,
      configured: isSupabaseConfigured,
      mode,
      onboardingDone,
      user,
      profile,
      items,
      recordings,
      usage,
      giftUntil,
      draft,
      banner,
      clearBanner: () => setBanner(null),
      finishOnboarding: async () => {
        setOnboardingDone(true);
        const prefs = await loadPrefs();
        await savePrefs({
          ...prefs,
          onboardingDone: true,
          locale: profile.locale,
          localePreference: profile.localePreference,
          theme: profile.theme,
        });
      },
      updateProfile: async (patch) => {
        const next = { ...profile, ...patch };
        if (next.localePreference === 'system') next.locale = deviceLocale();
        const prefs = await loadPrefs();
        const writePrefs = () =>
          savePrefs({
            ...prefs,
            onboardingDone,
            locale: next.locale,
            localePreference: next.localePreference,
            theme: next.theme,
          });
        if (mode === 'supabase' && user) {
          const saved = await persistRemoteProfile(user.id, next);
          const confirmed = { ...next, displayName: saved.displayName, username: saved.username };
          await writePrefs();
          applyProfile(confirmed);
          if (patch.notificationsEnabled === true) void promptExactAlarmOnce();
          return;
        }
        await writePrefs();
        applyProfile(next);
        if (patch.notificationsEnabled === true) void promptExactAlarmOnce();
        if (mode === 'demo' && user) {
          await persistDemo({
            user,
            profile: next,
            items,
            recordings,
            usageCount: usage.count,
            usagePeriod: usage.period,
            isPro: usage.isPro,
          });
        }
      },
      enterDemo: async (name, email) => {
        const timeZone = phoneTimeZone();
        const locale = profile.locale || deviceLocale();
        const existing = await loadDemo();
        const seeded = existing ?? null;
        const nextProfile: Profile = {
          ...(seeded?.profile ?? defaultProfile(locale, timeZone)),
          displayName: name.trim() || seeded?.profile.displayName || 'TalkTray',
          timezone: timeZone,
          locale,
          localePreference: profile.localePreference,
          reminderOffsets: seeded?.profile.reminderOffsets?.length ? seeded.profile.reminderOffsets : [0],
        };
        const nextUser = seeded?.user ?? { id: createId(), email: email?.trim() || 'demo@talktray.app' };
        const seed = seeded ? null : buildSeed(new Date(), timeZone, locale === 'tr' ? 'tr' : 'en');
        const nextItems = seeded?.items ?? seed?.items ?? [];
        const nextRecordings = seeded?.recordings ?? seed?.recordings ?? [];
        const period = monthPeriod(new Date(), timeZone);
        const count = seeded && seeded.usagePeriod === period ? seeded.usageCount : seed?.usageCount ?? 0;
        const isPro = seeded?.isPro ?? false;
        applyProfile(nextProfile);
        flushSync(() => {
          setUser(nextUser);
          setItems(nextItems);
          setRecordings(nextRecordings);
          refreshUsage(count, isPro, period);
          setAppMode('demo');
        });
        await persistDemo({
          user: nextUser,
          profile: nextProfile,
          items: nextItems,
          recordings: nextRecordings,
          usageCount: count,
          usagePeriod: period,
          isPro,
        });
      },
      signIn: async (email, password) => {
        if (!isSupabaseConfigured) {
          await actions.current?.enterDemo(email.split('@')[0] || 'TalkTray', email);
          return;
        }
        const { data, error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
        if (error) throw error;
        if (data.user) await loadRemote(data.user);
      },
      signUp: async (email, password, name) => {
        if (isSupabaseConfigured) {
          const { data, error } = await supabase.auth.signUp({
            email: email.trim(),
            password,
            options: { data: { display_name: name, locale: profile.locale } },
          });
          if (error) throw error;
          if (data.session?.user) {
            await loadRemote(data.session.user);
            return 'session';
          }
          return 'confirm';
        }
        await actions.current?.enterDemo(name || email.split('@')[0] || 'TalkTray', email);
        return 'session';
      },
      signInApple: async () => {
        if (!isSupabaseConfigured) throw new Error('OAUTH');
        const name = await signInWithApple();
        if (name) await actions.current?.updateProfile({ displayName: name });
      },
      signInGoogle: async () => {
        if (!isSupabaseConfigured) throw new Error('OAUTH');
        await signInWithGoogle();
      },
      signOut: async () => {
        if (mode === 'supabase') await supabase.auth.signOut();
        await logOutPurchases();
        storePro.current = false;
        giftUntilRef.current = null;
        giftUserRef.current = null;
        setGiftUntil(null);
        setUser(null);
        setItems([]);
        setRecordings([]);
        setDraft(null);
        setAppMode('signedOut');
        refreshUsage(0, false, monthPeriod(new Date(), profile.timezone));
      },
      deleteAccount: async () => {
        if (mode === 'supabase') {
          const { error } = await supabase.rpc('delete_own_account');
          if (error) throw error;
          await supabase.auth.signOut();
        }
        await purgeFromDevice(items);
        await logOutPurchases();
        await saveDemo(null);
        storePro.current = false;
        giftUntilRef.current = null;
        giftUserRef.current = null;
        setGiftUntil(null);
        setUser(null);
        setItems([]);
        setRecordings([]);
        setDraft(null);
        setBanner(null);
        setAppMode('signedOut');
        refreshUsage(0, false, monthPeriod(new Date(), profile.timezone));
      },
      deleteAllRecordings: async () => {
        // Everything that came from a recording goes with it: items, reminders, calendar entries.
        const linked = items.filter((item) => item.recordingId);
        const linkedIds = new Set(linked.map((item) => item.id));
        const nextItems = items.filter((item) => !linkedIds.has(item.id));
        if (mode === 'supabase' && user) {
          const removedItems = await supabase.from('items').delete().eq('user_id', user.id).not('recording_id', 'is', null);
          if (removedItems.error) throw removedItems.error;
          await supabase.storage.from('recordings').list(user.id).then(async ({ data }) => {
            const paths = (data ?? []).map((file) => `${user.id}/${file.name}`);
            if (paths.length) await supabase.storage.from('recordings').remove(paths);
          });
          const { error } = await supabase.from('recordings').delete().eq('user_id', user.id);
          if (error) {
            setItems(nextItems);
            throw error;
          }
        }
        setItems(nextItems);
        setRecordings([]);
        await purgeFromDevice(linked);
        if (mode === 'demo' && user) {
          await persistDemo({
            user,
            profile,
            items: nextItems,
            recordings: [],
            usageCount: 0,
            usagePeriod: usage.period,
            isPro: usage.isPro,
          });
        }
        // Used recordings stay used. Only the on-device demo resets.
        if (mode !== 'supabase') refreshUsage(0, usage.isPro);
      },
      deleteRecording: async (id) => {
        const linked = items.filter((item) => item.recordingId === id);
        const nextRecordings = recordings.filter((recording) => recording.id !== id);
        const nextItems = items.filter((item) => item.recordingId !== id);
        setRecordings(nextRecordings);
        setItems(nextItems);
        const counts = countCompleted(nextRecordings, profile.timezone);
        if (mode !== 'supabase') refreshUsage(counts.month, usage.isPro);
        if (mode === 'supabase' && user) {
          const { data } = await supabase.from('recordings').select('storage_path').eq('id', id).maybeSingle();
          const path = (data?.storage_path as string | null) || `${user.id}/${id}.m4a`;
          // Items first: the foreign key would otherwise only unlink them.
          const removedItems = await supabase.from('items').delete().eq('recording_id', id);
          if (removedItems.error) {
            setRecordings(recordings);
            setItems(items);
            throw removedItems.error;
          }
          await supabase.storage.from('recordings').remove([path]).catch(() => undefined);
          const { error } = await supabase.from('recordings').delete().eq('id', id);
          if (error) {
            setRecordings(recordings);
            throw error;
          }
        } else if (user) {
          await persistDemo({
            user,
            profile,
            items: nextItems,
            recordings: nextRecordings,
            usageCount: counts.month,
            usagePeriod: usage.period,
            isPro: usage.isPro,
          });
        }
        await purgeFromDevice(linked);
      },
      deleteItems: async (ids) => {
        if (!ids.length) return;
        const idSet = new Set(ids);
        const nextItems = items.filter((item) => !idSet.has(item.id));
        setItems(nextItems);
        await Promise.all(ids.map((itemId) => cancelRemindersForItem(itemId)));
        if (mode === 'supabase') {
          const { error } = await supabase.from('items').delete().in('id', ids);
          if (error) {
            setItems(items);
            throw error;
          }
        } else if (user) {
          await snapshotDemo({ items: nextItems });
        }
        await purgeFromDevice(items.filter((item) => idSet.has(item.id)));
      },
      processThought: async (input) => {
        if (mode !== 'supabase' || !user) {
          const gate = evaluateQuota(usage.count, usage.isPro);
          if (!gate.allowed) return 'quota';
        } else if (!usage.isPro) {
          const limits = await loadFreeLimits().catch(() => null);
          const counts = countCompleted(recordings, profile.timezone);
          const decision = decideFreeRecording({
            isPro: false,
            completedEver: counts.ever,
            completedToday: counts.today,
            completedMonth: counts.month,
            durationSeconds: Math.floor(input.durationMs / 1000),
            itemCount: items.length,
            limits,
          });
          if (!decision.allowed) return 'quota';
        }
        const now = new Date().toISOString();
        const spoken = input.transcript?.trim() ?? '';
        if (mode !== 'supabase' || !user) {
          const transcript = spoken || sampleTranscript(profile.locale);
          const parsed = extractItems(transcript, {
            now: new Date(),
            timeZone: profile.timezone,
            locale: profile.locale,
          });
          const recording: Recording = {
            id: createId(),
            transcript,
            language: profile.locale,
            durationMs: input.durationMs,
            status: 'ready',
            storagePath: null,
            createdAt: now,
          };
          const nextRecordings = [recording, ...recordings];
          const count = usage.count + 1;
          setRecordings(nextRecordings);
          refreshUsage(count, usage.isPro);
          setDraft({
            recordingId: recording.id,
            transcript,
            language: profile.locale,
            durationMs: input.durationMs,
            items: parsed.map((item) => ({ ...item, localId: createId() })),
            mocked: !spoken,
            audioUri: input.audioUri ?? null,
          });
          if (user) {
            await persistDemo({
              user,
              profile,
              items,
              recordings: nextRecordings,
              usageCount: count,
              usagePeriod: usage.period,
              isPro: usage.isPro,
            });
          }
          return 'review';
        }

        const recordingId = createId();
        let storagePath: string | null = null;
        if (input.audioUri) {
          const response = await fetch(input.audioUri);
          const bytes = await response.arrayBuffer();
          storagePath = `${user.id}/${recordingId}.m4a`;
          const upload = await supabase.storage.from('recordings').upload(storagePath, bytes, {
            contentType: 'audio/mp4',
            upsert: false,
          });
          if (upload.error) throw upload.error;
        }
        const inserted = await supabase.from('recordings').insert({
          id: recordingId,
          user_id: user.id,
          storage_path: storagePath,
          transcript: spoken || null,
          duration_ms: input.durationMs,
          status: 'processing',
          language: profile.locale,
        });
        if (inserted.error) throw inserted.error;
        const { data, error } = await supabase.functions.invoke('process-recording', {
          body: {
            recordingId,
            timezone: timeZoneForRequest(profile.timezone, phoneTimeZone()),
            locale: profile.locale,
            now: new Date().toISOString(),
            useStoredTranscript: !input.audioUri,
          },
        });
        if (error) {
          const code = await readFunctionError(error);
          if (code === 'QUOTA_EXCEEDED' || code === 'quota_exceeded') return 'quota';
          throw new Error(translate(profile.locale, processErrorKey(code)));
        }
        const payload = data as {
          transcript?: string;
          language?: string | null;
          items?: Omit<DraftItem, 'localId'>[];
          usage?: { count: number; limit: number | null; isPro: boolean };
        };
        if (payload.usage) {
          const gifted = overrideIsActive(giftUntilRef.current);
          if (payload.usage.isPro && !gifted) storePro.current = true;
          const merged = mergeUsageState({
            count: payload.usage.count,
            serverIsPro: Boolean(payload.usage.isPro),
            serverLimit: payload.usage.limit ?? null,
            storeIsPro: storePro.current,
            giftUntil: giftUntilRef.current,
            proLimit: recordingLimit(true),
          });
          refreshUsage(merged.count, merged.isPro, usage.period, merged.limit);
        }
        setDraft({
          recordingId,
          transcript: payload.transcript || spoken,
          language: payload.language ?? profile.locale,
          durationMs: input.durationMs,
          items: (payload.items ?? []).map((item) => ({ ...item, localId: createId() })),
          mocked: false,
          audioUri: input.audioUri ?? null,
        });
        setRecordings((current) => [
          {
            id: recordingId,
            transcript: payload.transcript || spoken,
            language: payload.language ?? profile.locale,
            durationMs: input.durationMs,
            status: 'ready',
            storagePath,
            createdAt: now,
          },
          ...current,
        ]);
        return 'review';
      },
      openSample: async (locale) => {
        if (mode !== 'supabase') {
          return (
            actions.current?.processThought({ durationMs: 12000, transcript: sampleTranscript(locale) }) ??
            'quota'
          );
        }
        // Signed-in accounts try samples on the device. Nothing is sent and no recording is used.
        const transcript = sampleTranscript(locale);
        const parsed = extractItems(transcript, { now: new Date(), timeZone: profile.timezone, locale });
        setDraft({
          recordingId: null,
          transcript,
          language: locale,
          durationMs: 0,
          items: parsed.map((item) => ({ ...item, localId: createId() })),
          mocked: false,
          audioUri: null,
        });
        return 'review';
      },
      updateDraftItem: (localId, patch) => {
        setDraft((current) =>
          current
            ? { ...current, items: current.items.map((item) => (item.localId === localId ? { ...item, ...patch } : item)) }
            : current,
        );
      },
      removeDraftItem: (localId) => {
        setDraft((current) =>
          current ? { ...current, items: current.items.filter((item) => item.localId !== localId) } : current,
        );
      },
      addDraftItem: () => {
        setDraft((current) =>
          current
            ? {
                ...current,
                items: [
                  ...current.items,
                  { localId: createId(), type: 'task', title: '', notes: null, dueAt: null, allDay: false, listName: null, reminderOffsets: null, repeat: null },
                ],
              }
            : current,
        );
      },
      setDraftTranscript: (text) => setDraft((current) => (current ? { ...current, transcript: text } : current)),
      reparseDraft: () => {
        setDraft((current) => {
          if (!current) return current;
          const parsed = extractItems(current.transcript, {
            now: new Date(),
            timeZone: profile.timezone,
            locale: profile.locale,
          });
          return { ...current, items: parsed.map((item) => ({ ...item, localId: createId() })) };
        });
      },
      saveDraft: async (exportCalendar) => {
        if (!draft || !user) return;
        const now = new Date().toISOString();
        const saved: InboxItem[] = [];
        for (const entry of draft.items) {
          if (!entry.title.trim()) continue;
          const next: InboxItem = {
            id: createId(),
            recordingId: draft.recordingId,
            type: entry.type,
            title: entry.title.trim(),
            notes: entry.notes,
            dueAt: entry.dueAt,
            allDay: entry.allDay,
            listName: entry.listName,
            reminderOffsets: entry.reminderOffsets,
            repeat: usage.isPro && entry.dueAt ? entry.repeat ?? null : null,
            completedAt: null,
            calendarEventId: null,
            notificationId: null,
            createdAt: now,
            updatedAt: now,
          };
          if (exportCalendar && next.dueAt) {
            next.calendarEventId = await exportItemToDevice(next, profile.timezone).catch(() => null);
          }
          saved.push(next);
        }
        const nextItems = [...saved, ...items];
        if (profile.notificationsEnabled && saved.some((item) => item.dueAt)) {
          await requestReminderPermission();
        }
        if (mode === 'supabase') {
          if (saved.length) {
            const { error } = await supabase.from('items').insert(
              saved.map((item) => ({
                id: item.id,
                user_id: user.id,
                recording_id: item.recordingId,
                type: item.type,
                title: item.title,
                notes: item.notes,
                due_at: item.dueAt,
                all_day: item.allDay,
                list_name: item.listName,
                reminder_offsets: item.reminderOffsets,
                repeat: item.repeat ?? null,
                notification_id: item.notificationId,
                calendar_event_id: item.calendarEventId,
              })),
            );
            if (error) throw error;
          }
        } else {
          await persistDemo({
            user,
            profile,
            items: nextItems,
            recordings,
            usageCount: usage.count,
            usagePeriod: usage.period,
            isPro: usage.isPro,
          });
        }
        setItems(nextItems);
        setDraft(null);
        setBanner(translate(profile.locale, 'review.saved'));
      },
      discardDraft: () => setDraft(null),
      toggleComplete: async (id) => {
        const current = items.find((item) => item.id === id);
        if (!current) return;
        if (current.repeat && current.dueAt && !current.completedAt) {
          // Finishing a repeating item moves it to the next occurrence. It never sits in "done".
          const dueAt = nextOccurrence(current.dueAt, current.repeat, profile.timezone, new Date());
          const advanced = items.map((item) =>
            item.id === id ? { ...item, dueAt, updatedAt: new Date().toISOString() } : item,
          );
          setItems(advanced);
          if (mode === 'supabase') {
            const { error } = await supabase.from('items').update({ due_at: dueAt }).eq('id', id);
            if (error) {
              setItems((list) => list.map((item) => (item.id === id ? { ...item, dueAt: current.dueAt } : item)));
              setBanner(translate(profile.locale, 'errors.saveFailed'));
            } else {
              setBanner(translate(profile.locale, 'repeat.moved'));
            }
          } else if (user) {
            await snapshotDemo({ items: advanced });
            setBanner(translate(profile.locale, 'repeat.moved'));
          }
          return;
        }
        const completedAt = current.completedAt ? null : new Date().toISOString();
        const nextItems = items.map((item) =>
          item.id === id ? { ...item, completedAt, updatedAt: new Date().toISOString() } : item,
        );
        setItems(nextItems);
        if (mode === 'supabase') {
          const { error } = await supabase.from('items').update({ completed_at: completedAt }).eq('id', id);
          if (error) {
            setItems((list) => list.map((item) => (item.id === id ? { ...item, completedAt: current.completedAt } : item)));
            setBanner(translate(profile.locale, 'errors.saveFailed'));
          }
        } else if (user) {
          await persistDemo({
            user,
            profile,
            items: nextItems,
            recordings,
            usageCount: usage.count,
            usagePeriod: usage.period,
            isPro: usage.isPro,
          });
        }
      },
      updateItem: async (id, patch) => {
        const nextItems = items.map((item) =>
          item.id === id ? { ...item, ...patch, updatedAt: new Date().toISOString() } : item,
        );
        setItems(nextItems);
        const updated = nextItems.find((item) => item.id === id);
        if (updated && 'dueAt' in patch && profile.notificationsEnabled && updated.dueAt && !updated.completedAt) {
          await requestReminderPermission();
        }
        if (mode === 'supabase' && updated) {
          pendingWrites.current.set(id, updated);
          if (writeTimer.current) clearTimeout(writeTimer.current);
          writeTimer.current = setTimeout(() => void flushWrites(), 700);
        } else if (user) {
          await snapshotDemo({ items: nextItems });
        }
      },
      deleteItem: async (id) => {
        const nextItems = items.filter((item) => item.id !== id);
        setItems(nextItems);
        await cancelRemindersForItem(id);
        pendingWrites.current.delete(id);
        if (mode === 'supabase') {
          const { data, error } = await supabase.from('items').delete().eq('id', id).select('id');
          if (error || !data?.length) {
            setItems(items);
            setBanner(translate(profile.locale, 'confirmDelete.failed'));
            return;
          }
        } else if (user) {
          await snapshotDemo({ items: nextItems });
        }
        await purgeFromDevice(items.filter((item) => item.id === id));
      },
      clearSamples: async () => {
        setItems([]);
        setRecordings([]);
        refreshUsage(0, usage.isPro);
        if (user && mode === 'demo') {
          await persistDemo({
            user,
            profile,
            items: [],
            recordings: [],
            usageCount: 0,
            usagePeriod: usage.period,
            isPro: usage.isPro,
          });
        }
      },
      simulatePro: async () => {
        refreshUsage(usage.count, true);
        if (user && mode === 'demo') {
          await persistDemo({
            user,
            profile,
            items,
            recordings,
            usageCount: usage.count,
            usagePeriod: usage.period,
            isPro: true,
          });
        }
      },
      purchase: async (plan) => {
        const result = await purchaseOffer(plan);
        if (result.isPro) {
          storePro.current = true;
          refreshUsage(usage.count, true);
        }
        return result;
      },
      restore: async () => {
        const result = await restorePurchases();
        if (result.isPro) {
          storePro.current = true;
          refreshUsage(usage.count, true);
        }
        return result;
      },
    };
  }, [
    applyProfile,
    banner,
    draft,
    flushWrites,
    items,
    mode,
    loadRemote,
    onboardingDone,
    persistDemo,
    profile,
    ready,
    recordings,
    snapshotDemo,
    giftUntil,
    usage,
    user,
  ]);

  useEffect(() => {
    actions.current = value;
  }, [value]);

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp() {
  const value = useContext(AppContext);
  if (!value) throw new Error('useApp must be used within AppProvider');
  return value;
}

/** This month's used recordings from the credit ledger. Null when the ledger is not deployed yet. */
async function countMonthCredits(timeZone: string): Promise<number | null> {
  const start = zonedMonthStart(new Date(), timeZone).toISOString();
  const { count, error } = await supabase
    .from('recording_credits')
    .select('recording_id', { count: 'exact', head: true })
    .gte('created_at', start);
  return error ? null : count ?? 0;
}

/** Removes an item's scheduled reminders and its phone calendar entry. Best effort, never throws. */
async function purgeFromDevice(removed: InboxItem[]): Promise<void> {
  await Promise.all(
    removed.map(async (item) => {
      await cancelRemindersForItem(item.id).catch(() => undefined);
      await removeItemFromDevice(item.calendarEventId).catch(() => undefined);
    }),
  );
}

function freeMonthLimit(limits: FreeLimits | null): number {
  if (!limits || limits.free_recordings_per_month == null) return Number.MAX_SAFE_INTEGER;
  return limits.free_recordings_per_month;
}

function countCompleted(recordings: Recording[], timeZone: string) {
  const now = new Date();
  const active = recordings.filter((recording) => recording.status !== 'failed');
  const day = zonedDayStart(now, timeZone).getTime();
  const month = zonedMonthStart(now, timeZone).getTime();
  return {
    ever: active.length,
    today: active.filter((recording) => new Date(recording.createdAt).getTime() >= day).length,
    month: active.filter((recording) => new Date(recording.createdAt).getTime() >= month).length,
  };
}

function mapItem(row: Record<string, unknown>): InboxItem {
  return {
    id: String(row.id),
    recordingId: (row.recording_id as string | null) ?? null,
    type: row.type as InboxItem['type'],
    title: String(row.title ?? ''),
    notes: (row.notes as string | null) ?? null,
    dueAt: (row.due_at as string | null) ?? null,
    allDay: Boolean(row.all_day),
    listName: (row.list_name as string | null) ?? null,
    reminderOffsets: Array.isArray(row.reminder_offsets) ? row.reminder_offsets.map((value) => Number(value)) : null,
    repeat: asRepeat(row.repeat),
    completedAt: (row.completed_at as string | null) ?? null,
    calendarEventId: (row.calendar_event_id as string | null) ?? null,
    notificationId: (row.notification_id as string | null) ?? null,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

const PRESET_OFFSETS = [0, 5, 10, 15, 30, 60, 1440];

function readReminderOffsets(value: unknown): number[] {
  if (!Array.isArray(value)) return [0];
  const offsets = [...new Set(value.map((entry) => Number(entry)).filter((entry) => PRESET_OFFSETS.includes(entry)))].sort(
    (a, b) => a - b,
  );
  return offsets.length > 0 ? offsets : [0];
}

function mapRecording(row: Record<string, unknown>): Recording {
  return {
    id: String(row.id),
    transcript: String(row.transcript ?? ''),
    language: (row.language as string | null) ?? null,
    durationMs: Number(row.duration_ms ?? 0),
    status: (row.status as Recording['status']) ?? 'ready',
    storagePath: typeof row.storage_path === 'string' ? row.storage_path : null,
    createdAt: String(row.created_at),
  };
}

async function readFunctionError(error: { context?: { json?: () => Promise<{ error?: string }> } }): Promise<string> {
  try {
    const body = await error.context?.json?.();
    return body?.error ?? '';
  } catch {
    return '';
  }
}
