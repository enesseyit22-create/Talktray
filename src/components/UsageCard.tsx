import { useEffect, useMemo, useState } from 'react';
import { View } from 'react-native';

import { AppText, GlassCard } from '@/components/ui/primitives';
import { useApp } from '@/data/AppProvider';
import { useI18n } from '@/i18n';
import { intlLocale } from '@/i18n/locale';
import { loadFreeLimits, zonedMonthStart } from '@/lib/free-limits';
import { supabase } from '@/lib/supabase';
import { factsFromRecordings, factsFromRpc, nextMonthReset, usageMeter, usageProgress, type UsageFacts } from '@/lib/usage-meter';
import { useTheme } from '@/theme/ThemeProvider';

export function UsageCard() {
  const app = useApp();
  const { t, locale } = useI18n();
  const { colors } = useTheme();
  const local = useMemo(
    () => factsFromRecordings(app.recordings, app.profile.timezone, null),
    [app.profile.timezone, app.recordings],
  );
  const stamp = `${app.recordings.length}:${app.usage.count}:${app.usage.isPro}`;
  const [remote, setRemote] = useState<{ stamp: string; facts: UsageFacts } | null>(null);

  useEffect(() => {
    if (app.mode !== 'supabase') return;
    let active = true;
    const ticket = stamp;
    void (async () => {
      const limits = await loadFreeLimits().catch(() => null);
      const base = factsFromRecordings(app.recordings, app.profile.timezone, limits);
      const periodStart = zonedMonthStart(new Date(), app.profile.timezone).toISOString();
      const { data, error } = await supabase.rpc('my_recording_usage', { p_period_start: periodStart });
      if (!active) return;
      setRemote({ stamp: ticket, facts: error || data == null ? base : factsFromRpc(data, base) });
    })();
    return () => {
      active = false;
    };
  }, [app.mode, app.profile.timezone, app.recordings, app.usage.count, app.usage.isPro, stamp]);

  const facts = remote?.stamp === stamp ? remote.facts : local;
  const meter = usageMeter(app.usage.isPro, facts);
  const label =
    meter.kind === 'trial'
      ? t('usage.trial', { count: meter.count, limit: meter.limit })
      : meter.kind === 'open'
        ? t('usage.monthOpen', { count: meter.count })
        : t('usage.month', { count: meter.count, limit: meter.limit });
  const reset = nextMonthReset(new Date(), app.profile.timezone);
  const resetLabel = new Intl.DateTimeFormat(intlLocale(locale), {
    timeZone: app.profile.timezone,
    month: 'short',
    day: 'numeric',
  }).format(reset);
  const width = `${Math.round(usageProgress(meter) * 100)}%` as const;

  return (
    <GlassCard style={{ gap: 8 }}>
      <AppText weight="semibold">{label}</AppText>
      {meter.kind === 'open' ? null : (
        <View style={{ height: 8, borderRadius: 99, backgroundColor: colors.soft, overflow: 'hidden' }}>
          <View style={{ width, height: 8, borderRadius: 99, backgroundColor: colors.primary }} />
        </View>
      )}
      {meter.kind === 'trial' ? null : (
        <AppText size={12} color={colors.muted}>
          {t('usage.resets', { date: resetLabel })}
        </AppText>
      )}
    </GlassCard>
  );
}
