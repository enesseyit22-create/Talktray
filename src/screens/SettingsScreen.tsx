import { AudioModule } from 'expo-audio';
import * as Notifications from 'expo-notifications';
import { useEffect, useState, type ReactNode } from 'react';
import { Linking, Platform, Pressable, ScrollView, Share, Switch, View } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Aurora } from '@/components/Aurora';
import { Logo, WidgetPreview } from '@/components/Brand';
import { AppText, Chip, Field, GlassCard, PrimaryButton, Sheet } from '@/components/ui/primitives';
import { useApp } from '@/data/AppProvider';
import { deviceLocale, LOCALES, LOCALE_LABELS, useI18n } from '@/i18n';
import { errorText } from '@/lib/errors';
import { PRIVACY_URL, SITE_ORIGIN, SUPPORT_EMAIL, TERMS_URL } from '@/lib/legal';
import { supabase } from '@/lib/supabase';
import { normalizeUsername, usernameProblem } from '@/lib/username';
import { openExactAlarmSettings, sendTestNotification } from '@/services/notifications';
import { useTheme, type ThemeMode } from '@/theme/ThemeProvider';
import { useUpdates } from '@/updates/UpdateProvider';
import { isSameZonedDay } from '../../shared/parse/time';

type Perm = 'granted' | 'denied' | 'undetermined';

export function SettingsScreen() {
  const { t, locale } = useI18n();
  const { colors } = useTheme();
  const app = useApp();
  const updates = useUpdates();
  const insets = useSafeAreaInsets();
  const [name, setName] = useState(app.profile.displayName);
  const [seenName, setSeenName] = useState(app.profile.displayName);
  const [username, setUsername] = useState(app.profile.username ?? '');
  const [seenUsername, setSeenUsername] = useState(app.profile.username ?? '');
  const [accountError, setAccountError] = useState<string | null>(null);
  const [savingAccount, setSavingAccount] = useState(false);
  const [zone, setZone] = useState(app.profile.timezone);
  const [seenZone, setSeenZone] = useState(app.profile.timezone);
  const [zoneError, setZoneError] = useState<string | null>(null);
  if (seenName !== app.profile.displayName) {
    setSeenName(app.profile.displayName);
    setName(app.profile.displayName);
  }
  if (seenUsername !== (app.profile.username ?? '')) {
    setSeenUsername(app.profile.username ?? '');
    setUsername(app.profile.username ?? '');
  }
  if (seenZone !== app.profile.timezone) {
    setSeenZone(app.profile.timezone);
    setZone(app.profile.timezone);
  }
  const usernameIssue = usernameProblem(username);
  const normalizedUsername = normalizeUsername(username);
  const usernameMatchesSaved = normalizedUsername === (app.profile.username ?? '');
  const [availability, setAvailability] = useState<{ name: string; state: 'available' | 'taken' | 'error'; message?: string } | null>(null);
  const [mic, setMic] = useState<Perm>('undetermined');
  const [notice, setNotice] = useState<Perm>('undetermined');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [confirmRecordings, setConfirmRecordings] = useState(false);
  const [faq, setFaq] = useState(false);
  const [licenses, setLicenses] = useState(false);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [testNote, setTestNote] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);

  const remoteMessage =
    availability?.name === normalizedUsername && availability.state === 'error' ? availability.message ?? null : null;
  const needsRemoteCheck = usernameIssue === null && !usernameMatchesSaved && app.mode === 'supabase';
  const usernameState: 'idle' | 'checking' | 'available' | 'taken' | 'invalid' =
    usernameIssue === 'invalid'
      ? 'invalid'
      : usernameIssue === 'empty'
        ? 'idle'
        : usernameMatchesSaved || app.mode !== 'supabase'
          ? 'available'
          : availability?.name === normalizedUsername
            ? availability.state === 'error'
              ? 'idle'
              : availability.state
            : 'checking';

  useEffect(() => {
    if (!needsRemoteCheck) return;
    let cancelled = false;
    const timer = setTimeout(() => {
      void supabase.rpc('username_available', { candidate: normalizedUsername }).then(({ data, error }) => {
        if (cancelled) return;
        if (error) setAvailability({ name: normalizedUsername, state: 'error', message: error.message });
        else setAvailability({ name: normalizedUsername, state: data ? 'available' : 'taken' });
      });
    }, 350);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [needsRemoteCheck, normalizedUsername]);

  useEffect(() => {
    const read = async () => {
      const audio = await AudioModule.getRecordingPermissionsAsync();
      setMic(audio.granted ? 'granted' : audio.canAskAgain === false ? 'denied' : 'undetermined');
      const notes = await Notifications.getPermissionsAsync();
      setNotice(notes.granted ? 'granted' : notes.canAskAgain === false ? 'denied' : 'undetermined');
    };
    void read();
  }, []);

  useEffect(() => {
    if (app.mode !== 'supabase' || !app.user) return;
    let active = true;
    void supabase.rpc('is_admin').then(({ data, error }) => {
      if (active && !error && data === true) setIsAdmin(true);
    });
    return () => {
      active = false;
    };
  }, [app.mode, app.user]);

  const todayCount = app.recordings.filter((recording) =>
    isSameZonedDay(new Date(recording.createdAt), new Date(), app.profile.timezone),
  ).length;
  const initial = (name || app.profile.username || t('appName')).trim().charAt(0).toUpperCase() || 'T';
  const providerKey =
    app.mode === 'demo'
      ? 'settings.providerDemo'
      : app.user?.provider === 'apple'
        ? 'settings.providerApple'
        : app.user?.provider === 'google'
          ? 'settings.providerGoogle'
          : 'settings.providerEmail';

  const saveAccount = async () => {
    setAccountError(null);
    if (usernameState === 'invalid') return;
    if (usernameState === 'taken' || usernameState === 'checking') return;
    setSavingAccount(true);
    try {
      await app.updateProfile({
        displayName: name.trim(),
        username: username.trim() ? normalizeUsername(username) : null,
      });
    } catch (caught) {
      const code = caught && typeof caught === 'object' && 'code' in caught ? String((caught as { code: string }).code) : '';
      if (code === '23505') setAccountError(t('settings.usernameTaken'));
      else if (code === 'PROFILE_NOT_SAVED') setAccountError(t('settings.profileNotSaved'));
      else setAccountError(errorText(caught, t('settings.profileNotSaved')));
    } finally {
      setSavingAccount(false);
    }
  };

  const saveZone = async (next: string) => {
    if (!isTimeZone(next)) {
      setZoneError(t('settings.timezoneInvalid'));
      return;
    }
    setZoneError(null);
    setZone(next);
    try {
      await app.updateProfile({ timezone: next });
    } catch (caught) {
      setZone(app.profile.timezone);
      setZoneError(errorText(caught, t('settings.profileNotSaved')));
    }
  };

  const persist = (patch: Parameters<typeof app.updateProfile>[0]) => {
    void app.updateProfile(patch).catch((caught) => setActionError(errorText(caught, t('settings.profileNotSaved'))));
  };

  const toggleNotifications = async (enabled: boolean) => {
    try {
      if (!enabled) {
        await app.updateProfile({ notificationsEnabled: false });
        return;
      }
      const result = await Notifications.requestPermissionsAsync();
      const state: Perm = result.granted ? 'granted' : result.canAskAgain === false ? 'denied' : 'undetermined';
      setNotice(state);
      if (!result.granted) {
        await Linking.openSettings();
        return;
      }
      await app.updateProfile({ notificationsEnabled: true });
    } catch (caught) {
      setActionError(errorText(caught, t('settings.profileNotSaved')));
    }
  };

  const exportData = async () => {
    if (!app.items.length && !app.recordings.length) {
      setActionError(t('settings.exportEmpty'));
      return;
    }
    const payload = JSON.stringify(
      {
        profile: app.profile,
        items: app.items,
        recordings: app.recordings.map(({ transcript, language, durationMs, status, createdAt }) => ({
          transcript,
          language,
          durationMs,
          status,
          createdAt,
        })),
      },
      null,
      2,
    );
    await Share.share({ message: payload, title: 'Talktray' });
  };

  return (
    <Aurora>
      <ScrollView contentContainerStyle={{ padding: 20, paddingTop: Math.max(insets.top, 16) + 12, paddingBottom: 150, gap: 16 }}>
        <AppText size={32} weight="extrabold">
          {t('settings.title')}
        </AppText>
        {isAdmin ? (
          <Section title={t('admin.title')}>
            <Row label={t('admin.open')} onPress={() => router.push('/admin')} />
          </Section>
        ) : null}

        <Section title={t('settings.account')}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 44 }}>
            <View
              style={{
                width: 52,
                height: 52,
                borderRadius: 26,
                backgroundColor: colors.primary,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <AppText size={22} weight="extrabold" color={colors.onPrimary}>
                {initial}
              </AppText>
            </View>
            <View style={{ flex: 1 }}>
              <AppText weight="bold">{name.trim() || t('appName')}</AppText>
              <AppText size={13} color={colors.muted}>
                {app.profile.username ? `@${app.profile.username}` : t('settings.username')}
              </AppText>
            </View>
          </View>
          <Field label={t('settings.displayName')} value={name} onChangeText={setName} autoCapitalize="words" />
          <Field
            label={t('settings.username')}
            value={username}
            onChangeText={(value) => {
              setAccountError(null);
              setUsername(value.toLowerCase());
            }}
            autoCapitalize="none"
            placeholder={t('settings.usernamePlaceholder')}
          />
          <AppText size={13} color={usernameState === 'taken' || usernameState === 'invalid' ? colors.danger : colors.muted}>
            {usernameState === 'checking'
              ? t('settings.usernameChecking')
              : usernameState === 'available'
                ? t('settings.usernameAvailable')
                : usernameState === 'taken'
                  ? t('settings.usernameTaken')
                  : usernameState === 'invalid'
                    ? t('settings.usernameInvalid')
                    : t('settings.usernameHint')}
          </AppText>
          {remoteMessage || accountError ? <AppText color={colors.danger}>{remoteMessage || accountError}</AppText> : null}
          <PrimaryButton label={t('settings.save')} loading={savingAccount} onPress={() => void saveAccount()} />
          <Info label={t('settings.email')} value={app.mode === 'demo' ? t('profile.demoBanner') : app.user?.email || '—'} />
          <Info label={t('settings.provider')} value={t(providerKey)} />
          <PrimaryButton tone="glass" label={t('signOut')} onPress={() => void app.signOut().then(() => router.replace('/sign-in'))} />
          <Row label={t('account.delete')} danger onPress={() => setConfirmDelete(true)} />
        </Section>

        <Section title={t('settings.subscription')}>
          <AppText weight="bold">{app.usage.isPro ? t('pro') : t('free')}</AppText>
          <AppText size={13} color={colors.muted}>
            {app.usage.isPro
              ? t('profile.usagePro', { count: app.usage.count, limit: app.usage.limit })
              : t('profile.usage', { count: app.usage.count, limit: app.usage.limit })}
          </AppText>
          {!app.usage.isPro ? <PrimaryButton label={t('upgrade')} onPress={() => router.push('/paywall')} /> : null}
          <PrimaryButton tone="glass" label={t('restore')} onPress={() => void app.restore()} />
          <Row label={t('settings.manage')} onPress={() => void Linking.openURL(subscriptionUrl())} />
          <AppText size={13} color={colors.muted}>
            {t('settings.billingNote')}
          </AppText>
        </Section>

        <Section title={t('settings.preferences')}>
          <AppText weight="bold">{t('profile.language')}</AppText>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            <PrimaryButton
              tone={app.profile.localePreference === 'system' ? 'solid' : 'glass'}
              label={t('profile.languageSystem')}
              onPress={() => persist({ localePreference: 'system', locale: deviceLocale() })}
            />
            {LOCALES.map((code) => (
              <PrimaryButton
                key={code}
                tone={app.profile.localePreference === code ? 'solid' : 'glass'}
                label={LOCALE_LABELS[code]}
                onPress={() => persist({ localePreference: code, locale: code })}
              />
            ))}
          </View>
          <AppText weight="bold">{t('profile.theme')}</AppText>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {(['system', 'light', 'dark'] as ThemeMode[]).map((mode) => (
              <PrimaryButton
                key={mode}
                tone={app.profile.theme === mode ? 'solid' : 'glass'}
                label={t(`profile.${mode}`)}
                onPress={() => persist({ theme: mode })}
              />
            ))}
          </View>
          <Field label={t('profile.timezone')} value={zone} onChangeText={setZone} autoCapitalize="none" placeholder="Europe/Istanbul" />
          {zoneError ? <AppText color={colors.danger}>{zoneError}</AppText> : null}
          <PrimaryButton label={t('settings.save')} onPress={() => void saveZone(zone.trim())} />
          <PrimaryButton
            tone="glass"
            label={t('settings.timezoneDevice')}
            onPress={() => void saveZone(Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC')}
          />
          <AppText weight="bold">{t('remind.title')}</AppText>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {[0, 5, 10, 15, 30, 60, 1440].map((offset) => {
              const selected = app.profile.reminderOffsets.includes(offset);
              const label = offset === 0 ? t('remind.at') : offset === 60 ? t('remind.hour') : offset === 1440 ? t('remind.day') : t('remind.minutes', { minutes: offset });
              return (
                <Chip
                  key={offset}
                  label={label}
                  active={selected}
                  onPress={() => {
                    const next = selected
                      ? app.profile.reminderOffsets.filter((value) => value !== offset)
                      : [...app.profile.reminderOffsets, offset].sort((a, b) => a - b);
                    if (!next.length) return;
                    persist({ reminderOffsets: next });
                  }}
                />
              );
            })}
          </View>
          <Toggle label={t('profile.notifications')} value={app.profile.notificationsEnabled} onChange={(value) => void toggleNotifications(value)} />
          {Platform.OS === 'android' ? (
            <>
              <AppText size={13} color={colors.muted}>
                {t('settings.exactAlarmBody')}
              </AppText>
              <Row label={t('settings.exactAlarm')} onPress={() => void openExactAlarmSettings()} />
            </>
          ) : null}
          <PrimaryButton
            tone="glass"
            label={t('settings.testNotification')}
            onPress={() =>
              void sendTestNotification(locale).then((sent) => {
                setTestNote(sent ? t('notifications.testSent') : t('settings.notificationsDenied'));
              })
            }
          />
          {testNote ? <AppText size={13} color={colors.muted}>{testNote}</AppText> : null}
          {notice === 'denied' ? (
            <Row label={t('settings.notificationsDenied')} onPress={() => void Linking.openSettings()} />
          ) : null}
          <Toggle
            label={t('profile.calendar')}
            value={app.profile.exportToCalendar}
            onChange={(exportToCalendar) => persist({ exportToCalendar })}
          />
          <Info label={t('settings.microphone')} value={t(mic === 'granted' ? 'settings.microphoneGranted' : mic === 'denied' ? 'settings.microphoneDenied' : 'settings.microphoneUndetermined')} />
          <Row label={t('settings.openSettings')} onPress={() => void Linking.openSettings()} />
        </Section>

        <Section title={t('settings.privacy')}>
          <Row label={t('paywall.privacy')} onPress={() => void Linking.openURL(PRIVACY_URL)} />
          <Row label={t('paywall.terms')} onPress={() => void Linking.openURL(TERMS_URL)} />
          <Row label={t('settings.exportData')} onPress={() => void exportData().catch((error) => setActionError(errorText(error, t('errors.generic'))))} />
          <Row label={t('settings.deleteRecordings')} danger onPress={() => setConfirmRecordings(true)} />
          <AppText size={13} color={colors.muted}>
            {t('settings.dataUse')}
          </AppText>
          {actionError ? <AppText color={colors.danger}>{actionError}</AppText> : null}
        </Section>

        <Section title={t('settings.support')}>
          <Row label={t('settings.contact')} onPress={() => void Linking.openURL(`mailto:${SUPPORT_EMAIL}`)} />
          <Row
            label={t('settings.rate')}
            onPress={() => {
              if (Platform.OS === 'ios') {
                void Linking.openURL('https://apps.apple.com/app/id6833066274?action=write-review');
                return;
              }
              void Linking.openURL('market://details?id=com.talktray.app').catch(() =>
                Linking.openURL('https://play.google.com/store/apps/details?id=com.talktray.app'),
              );
            }}
          />
          <Row
            label={t('settings.share')}
            onPress={() => void Share.share({ message: t('settings.shareMessage', { url: SITE_ORIGIN }) })}
          />
          <Row label={t('settings.faq')} onPress={() => setFaq(true)} />
        </Section>

        <Section title={t('settings.about')}>
          <View style={{ alignItems: 'center', paddingVertical: 6 }}>
            <Logo size={72} layout="stack" />
          </View>
          <Info label={t('updates.version')} value={updates.version} />
          <Info label={t('settings.build')} value={Platform.OS === 'web' ? 'web' : String(Platform.Version)} />
          <Info label={t('updates.updateId')} value={updates.updateId} />
          <Row label={t('settings.licenses')} onPress={() => setLicenses(true)} />
          <PrimaryButton
            tone="glass"
            label={updates.status === 'checking' ? t('updates.checking') : t('updates.check')}
            loading={updates.status === 'checking'}
            onPress={() => void updates.check(true)}
          />
        </Section>

        <AppText size={20} weight="extrabold">
          {t('profile.captureTitle')}
        </AppText>
        <WidgetPreview count={todayCount} label={t('home.voiceNotes')} />
        <GlassCard style={{ gap: 8 }}>
          <AppText color={colors.muted}>{t('profile.captureBody')}</AppText>
          <AppText color={colors.muted}>{t('profile.widgetSteps')}</AppText>
          <AppText color={colors.muted}>{t('profile.androidSteps')}</AppText>
        </GlassCard>
      </ScrollView>

      <Sheet visible={confirmDelete} onClose={() => setConfirmDelete(false)}>
        <AppText size={20} weight="extrabold">
          {t('account.title')}
        </AppText>
        <AppText color={colors.muted}>{t('account.body')}</AppText>
        <PrimaryButton
          label={t('account.confirm')}
          loading={busy}
          onPress={() => {
            setBusy(true);
            void app
              .deleteAccount()
              .then(() => router.replace('/sign-in'))
              .catch((error) => setActionError(errorText(error, t('account.failed'))))
              .finally(() => {
                setBusy(false);
                setConfirmDelete(false);
              });
          }}
        />
        <PrimaryButton tone="glass" label={t('cancel')} onPress={() => setConfirmDelete(false)} />
      </Sheet>
      <Sheet visible={confirmRecordings} onClose={() => setConfirmRecordings(false)}>
        <AppText size={20} weight="extrabold">
          {t('settings.deleteRecordingsTitle')}
        </AppText>
        <AppText color={colors.muted}>{t('settings.deleteRecordingsBody')}</AppText>
        <PrimaryButton
          label={t('settings.deleteRecordings')}
          loading={busy}
          onPress={() => {
            setBusy(true);
            void app
              .deleteAllRecordings()
              .catch((error) => setActionError(errorText(error, t('errors.generic'))))
              .finally(() => {
                setBusy(false);
                setConfirmRecordings(false);
              });
          }}
        />
        <PrimaryButton tone="glass" label={t('cancel')} onPress={() => setConfirmRecordings(false)} />
      </Sheet>
      <Sheet visible={faq} onClose={() => setFaq(false)}>
        <AppText size={20} weight="extrabold">
          {t('settings.faq')}
        </AppText>
        <AppText weight="bold">{t('settings.faq1q')}</AppText>
        <AppText color={colors.muted}>{t('settings.faq1a')}</AppText>
        <AppText weight="bold">{t('settings.faq2q')}</AppText>
        <AppText color={colors.muted}>{t('settings.faq2a')}</AppText>
        <AppText weight="bold">{t('settings.faq3q')}</AppText>
        <AppText color={colors.muted}>{t('settings.faq3a')}</AppText>
      </Sheet>
      <Sheet visible={licenses} onClose={() => setLicenses(false)}>
        <AppText size={20} weight="extrabold">
          {t('settings.licenses')}
        </AppText>
        <AppText color={colors.muted}>{t('settings.licensesBody')}</AppText>
      </Sheet>
    </Aurora>
  );
}

function subscriptionUrl() {
  if (Platform.OS === 'android') {
    return 'https://play.google.com/store/account/subscriptions?package=com.talktray.app';
  }
  return 'https://apps.apple.com/account/subscriptions';
}

function isTimeZone(value: string) {
  try {
    Intl.DateTimeFormat('en-US', { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View style={{ gap: 10 }}>
      <AppText size={13} weight="bold" style={{ letterSpacing: 0.4 }}>
        {title}
      </AppText>
      <GlassCard style={{ gap: 12 }}>{children}</GlassCard>
    </View>
  );
}

function Row({ label, onPress, danger }: { label: string; onPress: () => void; danger?: boolean }) {
  const { colors } = useTheme();
  return (
    <Pressable onPress={onPress} style={{ minHeight: 44, justifyContent: 'center' }}>
      <AppText weight="semibold" color={danger ? colors.danger : colors.primary}>
        {label}
      </AppText>
    </Pressable>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  const { colors } = useTheme();
  return (
    <View style={{ minHeight: 44, justifyContent: 'center' }}>
      <AppText size={13} color={colors.muted}>
        {label}
      </AppText>
      <AppText weight="semibold">{value}</AppText>
    </View>
  );
}

function Toggle({ label, value, onChange }: { label: string; value: boolean; onChange: (value: boolean) => void }) {
  const { colors } = useTheme();
  return (
    <View style={{ minHeight: 44, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
      <AppText weight="semibold" style={{ flex: 1 }}>
        {label}
      </AppText>
      <Switch value={value} onValueChange={onChange} trackColor={{ true: colors.primary, false: colors.soft }} />
    </View>
  );
}
