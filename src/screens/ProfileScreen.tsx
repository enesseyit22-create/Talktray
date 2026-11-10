import { useState } from 'react';
import { Pressable, ScrollView, Switch, View } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Aurora } from '@/components/Aurora';
import { WidgetPreview } from '@/components/Brand';
import { AppText, GlassCard, PrimaryButton, Sheet } from '@/components/ui/primitives';
import { useApp } from '@/data/AppProvider';
import { LOCALES, LOCALE_LABELS, useI18n } from '@/i18n';
import { useTheme, type ThemeMode } from '@/theme/ThemeProvider';
import { useUpdates } from '@/updates/UpdateProvider';
import { isSameZonedDay } from '../../shared/parse/time';

export function ProfileScreen() {
  const { t, locale } = useI18n();
  const { colors } = useTheme();
  const app = useApp();
  const updates = useUpdates();
  const insets = useSafeAreaInsets();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const todayCount = app.recordings.filter((recording) =>
    isSameZonedDay(new Date(recording.createdAt), new Date(), app.profile.timezone),
  ).length;

  return (
    <Aurora>
      <ScrollView contentContainerStyle={{ padding: 20, paddingTop: Math.max(insets.top, 16) + 12, paddingBottom: 140, gap: 14 }}>
        <AppText size={32} weight="extrabold">
          {t('profile.title')}
        </AppText>
        <GlassCard style={{ gap: 4 }}>
          <AppText size={13} color={colors.muted}>
            {app.mode === 'demo' ? t('profile.demoBanner') : app.user?.email}
          </AppText>
          <AppText size={24} weight="extrabold">
            {app.profile.displayName || t('appName')}
          </AppText>
        </GlassCard>
        <GlassCard style={{ gap: 8 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <View>
              <AppText weight="bold">{app.usage.isPro ? t('pro') : t('free')}</AppText>
              <AppText size={13} color={colors.muted}>
                {app.usage.isPro
                  ? t('profile.usagePro', { count: app.usage.count, limit: app.usage.limit })
                  : t('profile.usage', { count: app.usage.count, limit: app.usage.limit })}
              </AppText>
            </View>
            {!app.usage.isPro ? <PrimaryButton label={t('upgrade')} onPress={() => router.push('/paywall')} /> : null}
          </View>
          <View style={{ height: 8, borderRadius: 99, backgroundColor: colors.field, overflow: 'hidden' }}>
            <View
              style={{
                width: `${Math.min(100, (app.usage.count / app.usage.limit) * 100)}%`,
                height: 8,
                backgroundColor: colors.primary,
              }}
            />
          </View>
        </GlassCard>
        <GlassCard style={{ gap: 10 }}>
          <AppText weight="bold">{t('profile.language')}</AppText>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {LOCALES.map((code) => (
              <PrimaryButton
                key={code}
                tone={locale === code ? 'solid' : 'glass'}
                label={LOCALE_LABELS[code]}
                onPress={() => void app.updateProfile({ locale: code })}
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
                onPress={() => void app.updateProfile({ theme: mode })}
              />
            ))}
          </View>
          <AppText color={colors.muted}>
            {t('profile.timezone')}: {app.profile.timezone}
          </AppText>
          <Toggle
            label={t('profile.notifications')}
            value={app.profile.notificationsEnabled}
            onChange={(notificationsEnabled) => void app.updateProfile({ notificationsEnabled })}
          />
          <Toggle
            label={t('profile.calendar')}
            value={app.profile.exportToCalendar}
            onChange={(exportToCalendar) => void app.updateProfile({ exportToCalendar })}
          />
        </GlassCard>
        <GlassCard style={{ gap: 8 }}>
          <AppText weight="bold">{t('updates.check')}</AppText>
          <AppText size={13} color={colors.muted}>
            {t('updates.version')} {updates.version}
            {updates.channel ? ` · ${t('updates.channel')} ${updates.channel}` : ''}
          </AppText>
          <AppText size={13} color={colors.muted}>
            {t('updates.updateId')} {updates.updateId}
            {updates.runtimeVersion ? ` · ${t('updates.runtime')} ${updates.runtimeVersion}` : ''}
          </AppText>
          <PrimaryButton
            tone="glass"
            label={updates.status === 'checking' ? t('updates.checking') : t('updates.check')}
            loading={updates.status === 'checking'}
            onPress={() => void updates.check(true)}
          />
          {updates.status === 'current' ? <AppText color={colors.success}>{t('updates.upToDate')}</AppText> : null}
          {updates.status === 'ready' ? <AppText color={colors.primary}>{t('updates.ready')}</AppText> : null}
          {updates.status === 'unavailable' ? <AppText color={colors.muted}>{t('updates.unavailable')}</AppText> : null}
          {updates.status === 'error' ? <AppText color={colors.danger}>{t('updates.failed')}</AppText> : null}
        </GlassCard>
        <AppText size={20} weight="extrabold">
          {t('profile.captureTitle')}
        </AppText>
        <WidgetPreview count={todayCount} label={t('home.voiceNotes')} />
        <GlassCard style={{ gap: 8 }}>
          <AppText color={colors.muted}>{t('profile.captureBody')}</AppText>
          <AppText weight="bold">
            {t('profile.phrase')}: {t('profile.phraseValue')}
          </AppText>
          <AppText color={colors.muted}>{t('profile.widgetSteps')}</AppText>
          <AppText color={colors.muted}>{t('profile.androidSteps')}</AppText>
          <AppText weight="semibold" color={colors.primary}>
            {t('profile.devBuild')}
          </AppText>
        </GlassCard>
        {app.mode === 'demo' ? (
          <PrimaryButton tone="glass" label={t('profile.clearSamples')} onPress={() => void app.clearSamples()} />
        ) : null}
        <PrimaryButton tone="glass" label={t('signOut')} onPress={() => void app.signOut().then(() => router.replace('/sign-in'))} />
        <Pressable
          onPress={() => {
            setDeleteError(null);
            setConfirmDelete(true);
          }}
          style={{ minHeight: 48, alignItems: 'center', justifyContent: 'center' }}
        >
          <AppText weight="semibold" color={colors.danger}>
            {t('account.delete')}
          </AppText>
        </Pressable>
        {deleteError ? <AppText color={colors.danger}>{deleteError}</AppText> : null}
      </ScrollView>
      <Sheet visible={confirmDelete} onClose={() => setConfirmDelete(false)}>
        <AppText size={20} weight="extrabold">
          {t('account.title')}
        </AppText>
        <AppText color={colors.muted}>{t('account.body')}</AppText>
        <PrimaryButton
          label={t('account.confirm')}
          loading={deleting}
          onPress={() => {
            setDeleting(true);
            setDeleteError(null);
            void app
              .deleteAccount()
              .then(() => {
                setConfirmDelete(false);
                router.replace('/sign-in');
              })
              .catch(() => setDeleteError(t('account.failed')))
              .finally(() => setDeleting(false));
          }}
        />
        <PrimaryButton tone="glass" label={t('cancel')} onPress={() => setConfirmDelete(false)} />
      </Sheet>
    </Aurora>
  );
}

function Toggle({ label, value, onChange }: { label: string; value: boolean; onChange: (value: boolean) => void }) {
  const { colors } = useTheme();
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
      <AppText weight="semibold">{label}</AppText>
      <Switch value={value} onValueChange={onChange} trackColor={{ true: colors.primary, false: colors.soft }} />
    </View>
  );
}
