import { useCallback, useEffect, useRef, useState } from 'react';
import { RefreshControl, ScrollView, View } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Aurora } from '@/components/Aurora';
import { AppText, Chip, EmptyState, Field, GlassCard, PrimaryButton } from '@/components/ui/primitives';
import { useApp } from '@/data/AppProvider';
import { useI18n } from '@/i18n';
import { intlLocale } from '@/i18n/locale';
import { overrideIsActive, type ProPlan } from '@/lib/pro-override';
import { supabase } from '@/lib/supabase';
import { useTheme } from '@/theme/ThemeProvider';

type Stats = {
  users_total: number;
  users_today: number;
  users_7d: number;
  users_30d: number;
  recordings_total: number;
  recordings_today: number;
  failures_24h: number;
  failures_7d: number;
  items_by_type: Record<string, number>;
  pro_active: number;
  dau: number;
  active_7d: number;
};

type AdminUser = {
  id: string;
  email: string | null;
  username: string | null;
  locale: string | null;
  created_at: string;
  last_activity: string | null;
  recording_count: number;
  pro_override_until?: string | null;
};

type ActiveUser = {
  id: string;
  email: string | null;
  username: string | null;
  platform: string | null;
  last_seen_at: string;
};

type FailedRecording = {
  id: string;
  user: string | null;
  created_at: string;
  error: string | null;
};

const ITEM_TYPES = ['task', 'reminder', 'event', 'shopping', 'note'] as const;
const PAGE = 40;

export function AdminScreen() {
  const { t, locale } = useI18n();
  const { colors } = useTheme();
  const { profile } = useApp();
  const insets = useSafeAreaInsets();
  const [stats, setStats] = useState<Stats | null>(null);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [failures, setFailures] = useState<FailedRecording[]>([]);
  const [query, setQuery] = useState('');
  const [offset, setOffset] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [allowed, setAllowed] = useState<boolean | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [activeUsers, setActiveUsers] = useState<ActiveUser[]>([]);
  const [proNotice, setProNotice] = useState<string | null>(null);
  const [proFailed, setProFailed] = useState(false);
  const [busyUser, setBusyUser] = useState<string | null>(null);
  const request = useRef(0);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const stamp = (iso: string | null) => {
    if (!iso) return '—';
    return new Intl.DateTimeFormat(intlLocale(locale), {
      timeZone: profile.timezone,
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(iso));
  };

  const load = useCallback(
    async (nextQuery: string, nextOffset: number, replace: boolean) => {
      const ticket = ++request.current;
      const gate = await supabase.rpc('is_admin');
      if (ticket !== request.current) return;
      if (gate.error || gate.data !== true) {
        setAllowed(false);
        setError(t('admin.denied'));
        return;
      }
      setAllowed(true);
      const [statsResult, usersResult, failedResult] = await Promise.all([
        supabase.rpc('admin_stats'),
        supabase.rpc('admin_recent_users', { p_search: nextQuery, p_limit: PAGE, p_offset: nextOffset }),
        supabase.rpc('admin_failed_recordings', { p_limit: PAGE }),
      ]);
      if (ticket !== request.current) return;
      if (statsResult.error || usersResult.error || failedResult.error) {
        setError(t('admin.error'));
        return;
      }
      setError(null);
      setStats(statsResult.data as Stats);
      const page = (usersResult.data ?? []) as AdminUser[];
      setUsers((current) => (replace ? page : [...current, ...page]));
      setHasMore(page.length === PAGE);
      setOffset(nextOffset);
      setFailures((failedResult.data ?? []) as FailedRecording[]);
      const activeResult = await supabase.rpc('admin_active_users', { p_within_seconds: 180 });
      if (ticket !== request.current) return;
      if (!activeResult.error) setActiveUsers((activeResult.data ?? []) as ActiveUser[]);
    },
    [t],
  );

  const loadActive = useCallback(async () => {
    const { data, error: activeError } = await supabase.rpc('admin_active_users', { p_within_seconds: 180 });
    if (!activeError) setActiveUsers((data ?? []) as ActiveUser[]);
  }, []);

  const grantPro = async (userId: string, plan: ProPlan) => {
    if (busyUser) return;
    setBusyUser(userId);
    setProNotice(null);
    const { data, error: grantError } = await supabase.rpc('admin_set_pro_override', { p_user_id: userId, p_plan: plan });
    setBusyUser(null);
    if (grantError) {
      setProFailed(true);
      setProNotice(t('admin.proError'));
      return;
    }
    const until = typeof data === 'string' ? data : null;
    setUsers((current) => current.map((user) => (user.id === userId ? { ...user, pro_override_until: until } : user)));
    setProFailed(false);
    setProNotice(t('admin.proSaved'));
  };

  useEffect(() => {
    let active = true;
    void supabase.rpc('is_admin').then(({ data, error: gateError }) => {
      if (!active) return;
      if (gateError || data !== true) {
        setAllowed(false);
        setError(t('admin.denied'));
        return;
      }
      void load('', 0, true);
    });
    return () => {
      active = false;
    };
  }, [load, t]);

  useEffect(() => {
    if (!allowed) return;
    const timer = setInterval(() => void loadActive(), 20_000);
    return () => clearInterval(timer);
  }, [allowed, loadActive]);

  const refresh = async () => {
    setRefreshing(true);
    await load(query, 0, true);
    setRefreshing(false);
  };

  const cards = stats
    ? [
        [t('admin.users'), stats.users_total],
        [t('admin.usersToday'), stats.users_today],
        [t('admin.users7d'), stats.users_7d],
        [t('admin.users30d'), stats.users_30d],
        [t('admin.dau'), stats.dau],
        [t('admin.active7d'), stats.active_7d],
        [t('admin.pro'), stats.pro_active],
        [t('admin.recordings'), stats.recordings_total],
        [t('admin.recordingsToday'), stats.recordings_today],
        [t('admin.failures24h'), stats.failures_24h],
        [t('admin.failures7d'), stats.failures_7d],
      ]
    : [];

  return (
    <Aurora>
      <ScrollView
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void refresh()} tintColor={colors.primary} />}
        contentContainerStyle={{ padding: 20, paddingTop: Math.max(insets.top, 16) + 8, paddingBottom: 40, gap: 16 }}
      >
        <AppText size={32} weight="extrabold">
          {t('admin.title')}
        </AppText>
        {allowed === false ? <EmptyState title={t('admin.denied')} body={t('admin.deniedBody')} /> : null}
        {error && allowed !== false ? <AppText color={colors.danger}>{error}</AppText> : null}
        {stats ? (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {cards.map(([label, value]) => (
              <GlassCard key={String(label)} padding={12} style={{ width: '48%', flexGrow: 1, gap: 2 }}>
                <AppText size={22} weight="extrabold">
                  {String(value)}
                </AppText>
                <AppText size={12} color={colors.muted}>
                  {label}
                </AppText>
              </GlassCard>
            ))}
          </View>
        ) : null}
        {stats ? (
          <GlassCard style={{ gap: 6 }}>
            <AppText weight="bold">{t('admin.items')}</AppText>
            {ITEM_TYPES.map((type) => (
              <View key={type} style={{ flexDirection: 'row', justifyContent: 'space-between', minHeight: 28 }}>
                <AppText color={colors.muted}>{t(`types.${type}`)}</AppText>
                <AppText weight="semibold">{String(stats.items_by_type?.[type] ?? 0)}</AppText>
              </View>
            ))}
          </GlassCard>
        ) : null}
        {allowed ? (
          <>
            <AppText size={18} weight="extrabold">
              {t('admin.live')} · {activeUsers.length}
            </AppText>
            {activeUsers.length === 0 ? <EmptyState title={t('admin.liveEmpty')} body={t('admin.liveEmptyBody')} /> : null}
            {activeUsers.map((person) => (
              <GlassCard key={person.id} style={{ gap: 2 }}>
                <AppText weight="bold">{person.email || person.username || person.id}</AppText>
                <AppText size={13} color={colors.muted}>
                  {[person.username ? `@${person.username}` : null, person.platform].filter(Boolean).join(' · ')}
                </AppText>
                <AppText size={12} color={colors.muted}>
                  {t('admin.lastActive')}: {stamp(person.last_seen_at)}
                </AppText>
              </GlassCard>
            ))}
            <AppText size={18} weight="extrabold">
              {t('admin.recentUsers')}
            </AppText>
            {proNotice ? <AppText size={13} color={proFailed ? colors.danger : colors.muted}>{proNotice}</AppText> : null}
            <Field
              label={t('admin.search')}
              value={query}
              onChangeText={(value) => {
                setQuery(value);
                if (searchTimer.current) clearTimeout(searchTimer.current);
                searchTimer.current = setTimeout(() => void load(value, 0, true), 300);
              }}
              autoCapitalize="none"
              placeholder={t('admin.search')}
            />
            {users.length === 0 ? <EmptyState title={t('admin.emptyUsers')} body={t('admin.emptyUsersBody')} /> : null}
            {users.map((user) => (
              <GlassCard key={user.id} style={{ gap: 2 }}>
                <AppText weight="bold">{user.email || user.username || user.id}</AppText>
                <AppText size={13} color={colors.muted}>
                  {[user.username ? `@${user.username}` : null, user.locale, t('admin.recordingsCount', { count: user.recording_count })]
                    .filter(Boolean)
                    .join(' · ')}
                </AppText>
                <AppText size={12} color={colors.muted}>
                  {t('admin.lastActive')}: {stamp(user.last_activity || user.created_at)}
                </AppText>
                <AppText size={12} color={colors.muted}>
                  {overrideIsActive(user.pro_override_until)
                    ? user.pro_override_until?.toLowerCase() === 'infinity'
                      ? t('admin.proLifetime')
                      : t('admin.proUntil', { date: stamp(user.pro_override_until ?? null) })
                    : t('admin.proFree')}
                </AppText>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 }}>
                  {(['month', 'year', 'lifetime', 'revoke'] as const).map((plan) => (
                    <Chip
                      key={plan}
                      label={t(
                        plan === 'month'
                          ? 'admin.grantMonth'
                          : plan === 'year'
                            ? 'admin.grantYear'
                            : plan === 'lifetime'
                              ? 'admin.grantLifetime'
                              : 'admin.revokePro',
                      )}
                      onPress={() => void grantPro(user.id, plan)}
                    />
                  ))}
                </View>
              </GlassCard>
            ))}
            {hasMore ? (
              <PrimaryButton
                tone="glass"
                label={t('admin.more')}
                onPress={() => void load(query, offset + PAGE, false)}
              />
            ) : null}
            <AppText size={18} weight="extrabold">
              {t('admin.failed')}
            </AppText>
            {failures.length === 0 ? <EmptyState title={t('admin.emptyFailed')} body={t('admin.emptyFailedBody')} /> : null}
            {failures.map((row) => (
              <GlassCard key={row.id} style={{ gap: 2 }}>
                <AppText weight="semibold">{row.user || row.id}</AppText>
                <AppText size={13} color={colors.danger}>
                  {row.error || t('admin.failed')}
                </AppText>
                <AppText size={12} color={colors.muted}>
                  {stamp(row.created_at)}
                </AppText>
              </GlassCard>
            ))}
          </>
        ) : null}
        <PrimaryButton tone="glass" label={t('admin.back')} onPress={() => router.back()} />
      </ScrollView>
    </Aurora>
  );
}
