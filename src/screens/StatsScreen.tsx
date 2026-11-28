import { ScrollView } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Aurora } from '@/components/Aurora';
import { AppText, EmptyState, PrimaryButton } from '@/components/ui/primitives';
import { useApp } from '@/data/AppProvider';
import { useI18n } from '@/i18n';
import { intlLocale } from '@/i18n/locale';
import { bestDayLabel, summarizeWeek } from '@/lib/week-summary';
import { streakCount } from '@/lib/streak';

export function StatsScreen() {
  const { t, locale } = useI18n();
  const insets = useSafeAreaInsets();
  const { items, recordings, profile } = useApp();
  const summary = summarizeWeek(items, recordings, new Date(), profile.timezone);
  const streak = streakCount(items.map((item) => item.completedAt), new Date(), profile.timezone);
  const day = bestDayLabel(summary.bestDay, profile.timezone, intlLocale(locale));
  return (
    <Aurora>
      <ScrollView contentContainerStyle={{ padding: 20, paddingTop: Math.max(insets.top, 16) + 12, gap: 12 }}>
        <PrimaryButton tone="glass" label={t('close')} onPress={() => router.back()} />
        <AppText size={32} weight="extrabold">{t('stats.title')}</AppText>
        <AppText>{t('stats.done', { count: summary.done })}</AppText>
        <AppText>{t('stats.recordings', { count: summary.recordings })}</AppText>
        <AppText>{day ? t('stats.best', { day }) : t('stats.noBest')}</AppText>
        <AppText>{t('stats.streak', { count: streak })}</AppText>
        {summary.done === 0 && summary.recordings === 0 ? <EmptyState title={t('stats.emptyTitle')} body={t('stats.emptyBody')} /> : null}
      </ScrollView>
    </Aurora>
  );
}
