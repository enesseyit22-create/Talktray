import { useCallback, useEffect, useRef, useState } from 'react';
import { RefreshControl, ScrollView, View } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Aurora } from '@/components/Aurora';
import { AppText, Chip, EmptyState, Field, GlassCard, PrimaryButton } from '@/components/ui/primitives';
import { useApp } from '@/data/AppProvider';
import { useI18n } from '@/i18n';
import { intlLocale } from '@/i18n/locale';
import { parseFreeLimits, type FreeLimits } from '@/lib/free-limits';
import { accessView, type AccessFacts } from '@/lib/admin-access';
import type { ProPlan } from '@/lib/pro-override';
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

type AccessRow = AccessFacts & {
  id: string;
  email: string | null;
  username: string | null;
  display_name?: string | null;
};

type AdminUser = AccessRow & {
  locale: string | null;
  created_at: string;
  last_activity: string | null;
  recording_count: number;
};

type ActiveUser = AccessRow & {
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
  const [limits, setLimits] = useState<Record<keyof FreeLimits, string>>({
    free_recordings_per_day: '',
    free_recordings_per_month: '25',
    free_max_seconds_per_recording: '',
    free_max_items: '',
  });
  const [limitMessage, setLimitMessage] = useState<string | null>(null);
  const [savingLimits, setSavingLimits] = useState(false);
  const [activeUsers, setActiveUsers] = useState<ActiveUser[]>([]);
  const [proNotice, setProNotice] = useState<string | null>(null);
  const [proFailed, setProFailed] = useState(false);
  const [busyUser, setBusyUser] = useState<string | null>(null);
  const [blocked, setBlocked] = useState<Record<string, string>>({});
  const [families, setFamilies] = useState<{ id: string; name: string; owner: string; members: number; items: number }[]>([]);
  const [pushTitle, setPushTitle] = useState('');
  const [pushBody, setPushBody] = useState('');
  const [audience, setAudience] = useState<'all' | 'user' | 'free' | 'pro' | 'language'>('all');
  const [pushUser, setPushUser] = useState('');
  const [pushLocale, setPushLocale] = useState('tr');
  const [pushNotice, setPushNotice] = useState<string | null>(null);
  const [pushing, setPushing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
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

  const applyLimits = (value: unknown) => {
    const parsed = parseFreeLimits(value);
    setLimits({
      free_recordings_per_day: parsed.free_recordings_per_day == null ? '' : String(parsed.free_recordings_per_day),
      free_recordings_per_month: parsed.free_recordings_per_month == null ? '' : String(parsed.free_recordings_per_month),
      free_max_seconds_per_recording:
        parsed.free_max_seconds_per_recording == null ? '' : String(parsed.free_max_seconds_per_recording),
      free_max_items: parsed.free_max_items == null ? '' : String(parsed.free_max_items),
    });
  };

  const loadLimits = useCallback(async () => {
    const { data } = await supabase.from('app_settings').select('value').eq('key', 'free_limits').maybeSingle();
    if (data) applyLimits(data.value);
  }, []);

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
      const activeResult = await supabase.rpc('admin_active_users', { p_within_seconds: 90 });
      if (ticket !== request.current) return;
      if (!activeResult.error) setActiveUsers((activeResult.data ?? []) as ActiveUser[]);
    },
    [t],
  );

  const loadActive = useCallback(async () => {
    const { data, error: activeError } = await supabase.rpc('admin_active_users', { p_within_seconds: 90 });
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
    const until = plan === 'revoke' ? null : plan === 'lifetime' ? 'infinity' : typeof data === 'string' && data.trim() ? data : null;
    const patch = { pro_override_until: until, pro_override_plan: plan === 'revoke' ? null : plan };
    setUsers((current) => current.map((user) => (user.id === userId ? { ...user, ...patch } : user)));
    setActiveUsers((current) => current.map((user) => (user.id === userId ? { ...user, ...patch } : user)));
    setProFailed(false);
    setProNotice(t('admin.proSaved'));
  };

  const setBlockedUser = async (userId: string, next: boolean) => {
    const { data, error: blockError } = await supabase.rpc('admin_set_blocked', { p_user_id: userId, p_blocked: next });
    if (blockError) {
      setProFailed(true);
      setProNotice(t('admin.proError'));
      return;
    }
    setBlocked((current) => {
      const copy = { ...current };
      if (next && typeof data === 'string') copy[userId] = data;
      else delete copy[userId];
      return copy;
    });
  };

  const deleteUser = async (userId: string) => {
    const { error: deleteError } = await supabase.rpc('admin_delete_user', { p_user_id: userId });
    setConfirmDelete(null);
    if (deleteError) {
      setProFailed(true);
      setProNotice(t('admin.deleteUserError'));
      return;
    }
    setUsers((current) => current.filter((user) => user.id !== userId));
    setActiveUsers((current) => current.filter((user) => user.id !== userId));
    setProFailed(false);
    setProNotice(t('admin.deletedUser'));
  };

  const sendPush = async () => {
    setPushing(true);
    setPushNotice(null);
    const { data, error: sendError } = await supabase.functions.invoke('admin-push', {
      body: {
        kind: 'broadcast',
        title: pushTitle.trim(),
        body: pushBody.trim(),
        audience,
        userId: audience === 'user' ? pushUser.trim() : null,
        locale: audience === 'language' ? pushLocale.trim() : null,
      },
    });
    setPushing(false);
    if (sendError) {
      setPushNotice(t('admin.pushError'));
      return;
    }
    const sent = typeof data === 'object' && data && 'sent' in data ? Number((data as { sent: number }).sent) : 0;
    setPushNotice(t('admin.pushSent', { count: Number.isFinite(sent) ? sent : 0 }));
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
      void loadLimits();
      void supabase.rpc('admin_blocked_users').then(({ data }) => {
        const map: Record<string, string> = {};
        for (const row of (data ?? []) as { id: string; blocked_at: string }[]) map[row.id] = row.blocked_at;
        setBlocked(map);
      });
      void supabase.rpc('admin_family_groups').then(({ data }) => {
        if (Array.isArray(data)) setFamilies(data as { id: string; name: string; owner: string; members: number; items: number }[]);
      });
    });
    return () => {
      active = false;
    };
  }, [load, loadLimits, t]);

  useEffect(() => {
    if (!allowed) return;
    const timer = setInterval(() => void loadActive(), 5_000);
    const channel = supabase
      .channel('admin-presence')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'user_presence' }, () => void loadActive())
      .subscribe();
    return () => {
      clearInterval(timer);
      void supabase.removeChannel(channel);
    };
  }, [allowed, loadActive]);

  const refresh = async () => {
    setRefreshing(true);
    await Promise.all([load(query, 0, true), loadLimits()]);
    setRefreshing(false);
  };

  const personName = (person: { display_name?: string | null; email: string | null; username: string | null; id: string }) =>
    person.display_name || person.email || person.username || person.id;

  const describe = (row: AccessFacts) => {
    const view = accessView(row);
    const gift = !view.giftKnown
      ? null
      : view.gift === 'none'
        ? t('admin.proFree')
        : view.gift === 'lifetime'
          ? t('admin.giftedLifetime')
          : view.gift === 'month'
            ? `${t('admin.giftedMonth')} · ${t('admin.proUntil', { date: stamp(view.giftUntil) })}`
            : view.gift === 'year'
              ? `${t('admin.giftedYear')} · ${t('admin.proUntil', { date: stamp(view.giftUntil) })}`
              : t('admin.giftedUntil', { date: stamp(view.giftUntil) });
    const usage = !view.usage
      ? null
      : view.usage.kind === 'open'
        ? t('admin.usageOpen', { count: view.usage.count })
        : `${t(
            view.usage.kind === 'fair' ? 'admin.usageFair' : view.usage.kind === 'trial' ? 'admin.usageTrial' : 'admin.usageMonth',
            { count: view.usage.count, limit: view.usage.limit ?? 0 },
          )} · ${t('admin.usageLeft', { count: view.usage.remaining ?? 0 })}`;
    return { gift, store: view.store ? t('admin.storePro') : null, usage };
  };

  const grantChips = (userId: string) => (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 }}>
      {(['month', 'year', 'lifetime', 'revoke'] as const).map((plan) => (
        <Chip
          key={plan}
          label={t(
            plan === 'month' ? 'admin.grantMonth' : plan === 'year' ? 'admin.grantYear' : plan === 'lifetime' ? 'admin.grantLifetime' : 'admin.revokePro',
          )}
          onPress={() => void grantPro(userId, plan)}
        />
      ))}
    </View>
  );

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
        style={{ flex: 1 }}
        keyboardShouldPersistTaps="handled"
        automaticallyAdjustKeyboardInsets
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void refresh()} tintColor={colors.primary} />}
        contentContainerStyle={{
          padding: 20,
          paddingTop: Math.max(insets.top, 16) + 8,
          paddingBottom: Math.max(insets.bottom, 16) + 24,
          gap: 16,
        }}
      >
        <AppText size={32} weight="extrabold">
          {t('admin.title')}
        </AppText>
        {allowed === false ? <EmptyState title={t('admin.denied')} body={t('admin.deniedBody')} /> : null}
        {error && allowed !== false ? <AppText color={colors.danger}>{error}</AppText> : null}
        {stats ? (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {cards.map(([label, value]) => (
              <GlassCard key={String(label)} padding={12} style={{ flexGrow: 1, flexBasis: '46%', maxWidth: '100%', minWidth: 0, gap: 2 }}>
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
            <GlassCard style={{ gap: 10 }}>
              <AppText size={18} weight="extrabold">
                {t('admin.limitsTitle')}
              </AppText>
              <AppText size={13} color={colors.muted}>
                {t('admin.limitsHint')}
              </AppText>
              {(
                [
                  ['free_recordings_per_day', 'admin.perDay'],
                  ['free_recordings_per_month', 'admin.perMonth'],
                  ['free_max_seconds_per_recording', 'admin.maxSeconds'],
                  ['free_max_items', 'admin.maxItems'],
                ] as const
              ).map(([key, label]) => (
                <Field
                  key={key}
                  label={t(label)}
                  value={limits[key]}
                  onChangeText={(value) => setLimits((current) => ({ ...current, [key]: value.replace(/[^\d]/g, '') }))}
                  autoCapitalize="none"
                  placeholder={t('admin.unlimited')}
                />
              ))}
              {limitMessage ? <AppText color={limitMessage === 'saved' ? colors.success : colors.danger}>{t(`admin.${limitMessage}`)}</AppText> : null}
              <PrimaryButton
                label={t('admin.saveLimits')}
                loading={savingLimits}
                onPress={() => {
                  const payload = Object.fromEntries(
                    (Object.keys(limits) as (keyof FreeLimits)[]).map((key) => [key, limits[key] === '' ? null : Number(limits[key])]),
                  );
                  setSavingLimits(true);
                  setLimitMessage(null);
                  void supabase.rpc('admin_set_free_limits', { p: payload }).then(({ error: saveError }) => {
                    setSavingLimits(false);
                    setLimitMessage(saveError ? 'saveFailed' : 'saved');
                  });
                }}
              />
            </GlassCard>
            <AppText size={18} weight="extrabold">
              {t('admin.live')} · {activeUsers.length}
            </AppText>
            {activeUsers.length === 0 ? <EmptyState title={t('admin.liveEmpty')} body={t('admin.liveEmptyBody')} /> : null}
            {activeUsers.map((person) => {
              const access = describe(person);
              return (
                <GlassCard key={person.id} style={{ gap: 2 }}>
                  <AppText weight="bold">{personName(person)}</AppText>
                  <AppText size={13} color={colors.muted}>
                    {[person.username ? `@${person.username}` : null, person.platform].filter(Boolean).join(' · ')}
                  </AppText>
                  {access.gift ? <AppText size={13}>{access.gift}</AppText> : null}
                  {access.store ? (
                    <AppText size={13} color={colors.primary}>
                      {access.store}
                    </AppText>
                  ) : null}
                  {access.usage ? (
                    <AppText size={13} color={colors.muted}>
                      {access.usage}
                    </AppText>
                  ) : null}
                  <AppText size={12} color={colors.muted}>
                    {t('admin.lastActive')}: {stamp(person.last_seen_at)}
                  </AppText>
                  {grantChips(person.id)}
                </GlassCard>
              );
            })}
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
            {users.map((user) => {
              const access = describe(user);
              return (
                <GlassCard key={user.id} style={{ gap: 2 }}>
                  <AppText weight="bold">{personName(user)}</AppText>
                  <AppText size={13} color={colors.muted}>
                    {[user.username ? `@${user.username}` : null, user.locale, t('admin.recordingsCount', { count: user.recording_count })]
                      .filter(Boolean)
                      .join(' · ')}
                  </AppText>
                  <AppText size={12} color={colors.muted}>
                    {t('admin.lastActive')}: {stamp(user.last_activity || user.created_at)}
                  </AppText>
                  {access.gift ? <AppText size={13}>{access.gift}</AppText> : null}
                  {access.store ? (
                    <AppText size={13} color={colors.primary}>
                      {access.store}
                    </AppText>
                  ) : null}
                  {access.usage ? (
                    <AppText size={13} color={colors.muted}>
                      {access.usage}
                    </AppText>
                  ) : null}
                  {grantChips(user.id)}
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 }}>
                    <Chip
                      label={blocked[user.id] ? t('admin.unblock') : t('admin.block')}
                      onPress={() => void setBlockedUser(user.id, !blocked[user.id])}
                    />
                    <Chip
                      label={t('admin.pushUser')}
                      onPress={() => {
                        setAudience('user');
                        setPushUser(user.id);
                      }}
                    />
                    <Chip label={t('admin.deleteUser')} onPress={() => setConfirmDelete(user.id)} />
                  </View>
                  {blocked[user.id] ? <AppText size={12} color={colors.danger}>{t('admin.blocked')}</AppText> : null}
                  {confirmDelete === user.id ? (
                    <View style={{ gap: 8, marginTop: 8 }}>
                      <AppText>{t('admin.deleteUserBody')}</AppText>
                      <PrimaryButton label={t('admin.deleteUser')} onPress={() => void deleteUser(user.id)} />
                      <PrimaryButton tone="glass" label={t('cancel')} onPress={() => setConfirmDelete(null)} />
                    </View>
                  ) : null}
                </GlassCard>
              );
            })}
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
        {allowed ? (
          <>
            <AppText size={18} weight="extrabold">
              {t('admin.families')}
            </AppText>
            {families.length === 0 ? <EmptyState title={t('admin.families')} body={t('admin.familiesEmpty')} /> : null}
            {families.map((group) => (
              <GlassCard key={group.id} style={{ gap: 2 }}>
                <AppText weight="bold">{group.name}</AppText>
                <AppText size={13} color={colors.muted}>
                  {t('admin.familyMeta', { owner: group.owner, members: group.members, items: group.items })}
                </AppText>
              </GlassCard>
            ))}
            <GlassCard style={{ gap: 10 }}>
              <AppText size={18} weight="extrabold">
                {t('admin.pushTitle')}
              </AppText>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                {(['all', 'user', 'free', 'pro', 'language'] as const).map((kind) => (
                  <Chip
                    key={kind}
                    label={t(
                      kind === 'all'
                        ? 'admin.pushAll'
                        : kind === 'user'
                          ? 'admin.pushUser'
                          : kind === 'free'
                            ? 'admin.pushFree'
                            : kind === 'pro'
                              ? 'admin.pushPro'
                              : 'admin.pushLanguage',
                    )}
                    active={audience === kind}
                    onPress={() => setAudience(kind)}
                  />
                ))}
              </View>
              {audience === 'user' ? (
                <Field label={t('admin.pushUser')} value={pushUser} onChangeText={setPushUser} autoCapitalize="none" />
              ) : null}
              {audience === 'language' ? (
                <Field label={t('admin.locale')} value={pushLocale} onChangeText={setPushLocale} autoCapitalize="none" />
              ) : null}
              <Field label={t('admin.pushTitle')} value={pushTitle} onChangeText={setPushTitle} autoCapitalize="sentences" />
              <Field label={t('admin.pushBody')} value={pushBody} onChangeText={setPushBody} autoCapitalize="sentences" multiline />
              <GlassCard padding={12} style={{ gap: 4 }}>
                <AppText size={12} color={colors.muted}>{t('admin.pushPreview')}</AppText>
                <AppText weight="bold">{pushTitle || '—'}</AppText>
                <AppText>{pushBody || '—'}</AppText>
              </GlassCard>
              {pushNotice ? <AppText size={13}>{pushNotice}</AppText> : null}
              <PrimaryButton
                label={t('admin.pushSend')}
                loading={pushing}
                disabled={!pushTitle.trim() || !pushBody.trim() || (audience === 'user' && !pushUser.trim())}
                onPress={() => void sendPush()}
              />
            </GlassCard>
          </>
        ) : null}
        <PrimaryButton tone="glass" label={t('admin.back')} onPress={() => router.back()} />
      </ScrollView>
    </Aurora>
  );
}
