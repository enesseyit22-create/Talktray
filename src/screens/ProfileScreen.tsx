import { ScrollView, Switch, View } from 'react-native';
import { router } from 'expo-router';

import { Aurora } from '@/components/Aurora';
import { WidgetPreview } from '@/components/Brand';
import { AppText, GlassCard, PrimaryButton } from '@/components/ui/primitives';
import { useApp } from '@/data/AppProvider';
import { useI18n, type Locale } from '@/i18n';
import { useTheme, type ThemeMode } from '@/theme/ThemeProvider';
import { isSameZonedDay } from '../../shared/parse/time';

export function ProfileScreen() {
  const { t, locale } = useI18n();
  const { colors } = useTheme();
  const app = useApp();
  const todayCount = app.recordings.filter((recording) =>
    isSameZonedDay(new Date(recording.createdAt), new Date(), app.profile.timezone),
  ).length;

  return (
    <Aurora>
      <ScrollView contentContainerStyle={{ padding: 20, paddingTop: 64, paddingBottom: 140, gap: 14 }}>
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
          <View style={{ flexDirection: 'row', gap: 8 }}>
            {(['tr', 'en'] as Locale[]).map((code) => (
              <View key={code} style={{ flex: 1 }}>
                <PrimaryButton
                  tone={locale === code ? 'solid' : 'glass'}
                  label={code === 'tr' ? 'Türkçe' : 'English'}
                  onPress={() => void app.updateProfile({ locale: code })}
                />
              </View>
            ))}
          </View>
          <AppText weight="bold">{t('profile.theme')}</AppText>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            {(['system', 'light', 'dark'] as ThemeMode[]).map((mode) => (
              <View key={mode} style={{ flex: 1 }}>
                <PrimaryButton
                  tone={app.profile.theme === mode ? 'solid' : 'glass'}
                  label={t(`profile.${mode}`)}
                  onPress={() => void app.updateProfile({ theme: mode })}
                />
              </View>
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
      </ScrollView>
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
