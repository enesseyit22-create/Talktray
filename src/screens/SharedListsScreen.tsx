import { useFocusEffect, router } from 'expo-router';
import { ChevronLeft, ChevronRight, Lock, Share2, Users } from 'lucide-react-native';
import { useCallback, useState } from 'react';
import { Platform, Pressable, ScrollView, Share, StatusBar, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Aurora } from '@/components/Aurora';
import { AppText, EmptyState, Field, GlassCard, PrimaryButton, Skeleton } from '@/components/ui/primitives';
import { useApp } from '@/data/AppProvider';
import { useI18n } from '@/i18n';
import { sheetTopInset } from '@/lib/layout';
import {
  createSharedList,
  formatInviteCode,
  inviteLink,
  joinSharedList,
  loadSharedLists,
  normalizeInviteCode,
  sharedListError,
  type SharedList,
} from '@/services/shared-lists';
import { useTheme } from '@/theme/ThemeProvider';

export function SharedListsScreen() {
  const { t, locale } = useI18n();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const app = useApp();
  const [lists, setLists] = useState<SharedList[] | null>(null);
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState<'create' | 'join' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const signedIn = (app.mode === 'supabase' && Boolean(app.user)) || process.env.EXPO_PUBLIC_PREVIEW === '1';

  const reload = useCallback(() => {
    if (!signedIn) return;
    loadSharedLists(locale)
      .then(setLists)
      .catch(() => {
        setLists((current) => current ?? []);
        setError(t('shared.errorNetwork'));
      });
  }, [locale, signedIn, t]);

  useFocusEffect(reload);

  const explain = (caught: unknown) => {
    const kind = sharedListError(caught as { message?: string; code?: string });
    setError(
      t(
        kind === 'not_found'
          ? 'shared.errorNotFound'
          : kind === 'full'
            ? 'shared.errorFull'
            : kind === 'too_many'
              ? 'shared.errorTooMany'
              : 'shared.errorNetwork',
      ),
    );
  };

  const create = async () => {
    if (!app.usage.isPro) {
      router.push('/paywall');
      return;
    }
    setBusy('create');
    setError(null);
    try {
      const made = await createSharedList(name || t('shared.defaultName'));
      setName('');
      router.push({ pathname: '/lists/[id]', params: { id: made.id } });
    } catch (caught) {
      explain(caught);
    } finally {
      setBusy(null);
    }
  };

  const join = async () => {
    setBusy('join');
    setError(null);
    try {
      const joined = await joinSharedList(code);
      setCode('');
      router.push({ pathname: '/lists/[id]', params: { id: joined.id } });
    } catch (caught) {
      explain(caught);
    } finally {
      setBusy(null);
    }
  };

  return (
    <Aurora>
      <ScrollView
        style={{ flex: 1 }}
        keyboardShouldPersistTaps="handled"
        automaticallyAdjustKeyboardInsets
        contentContainerStyle={{
          padding: 20,
          paddingTop: sheetTopInset(insets.top, Platform.OS === 'android' ? StatusBar.currentHeight ?? 0 : 0, Platform.OS) + 8,
          paddingBottom: Math.max(insets.bottom, 16) + 28,
          gap: 14,
        }}
      >
        <Pressable
          onPress={() => router.back()}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={t('close')}
          style={{ minHeight: 44, flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', gap: 2 }}
        >
          <ChevronLeft color={colors.muted} size={20} />
          <AppText color={colors.muted}>{t('close')}</AppText>
        </Pressable>
        <AppText size={32} weight="extrabold">
          {t('shared.title')}
        </AppText>
        <AppText color={colors.muted}>{t('shared.subtitle')}</AppText>

        {!signedIn ? (
          <EmptyState title={t('shared.signInTitle')} body={t('shared.signInBody')} />
        ) : (
          <>
            {lists == null ? <Skeleton /> : null}
            {lists?.length === 0 ? (
              <View style={{ gap: 12 }}>
                <EmptyState title={t('shared.emptyTitle')} body={t('shared.emptyBody')} />
                <PrimaryButton label={t('shared.emptyCta')} onPress={() => void create()} loading={busy === 'create'} />
              </View>
            ) : null}
            {lists?.map((list) => (
              <GlassCard key={list.id} onPress={() => router.push({ pathname: '/lists/[id]', params: { id: list.id } })}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                  <Users color={colors.primary} size={20} />
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <AppText weight="bold" numberOfLines={1}>
                      {list.name}
                    </AppText>
                    <AppText size={12} color={colors.muted}>
                      {list.ownerId === app.user?.id ? t('shared.youOwn') : t('shared.youJoined')}
                    </AppText>
                  </View>
                  <Pressable
                    onPress={() => {
                      const code = formatInviteCode(list.inviteCode);
                      void Share.share({
                        message: t('shared.inviteMessage', { name: list.name, code, link: inviteLink(list.inviteCode) }),
                      });
                    }}
                    accessibilityRole="button"
                    accessibilityLabel={t('shared.share')}
                    hitSlop={8}
                    style={{ minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' }}
                  >
                    <Share2 color={colors.primary} size={18} />
                  </Pressable>
                  <ChevronRight color={colors.soft} size={16} />
                </View>
              </GlassCard>
            ))}

            <GlassCard style={{ gap: 10 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <AppText weight="bold">{t('shared.newTitle')}</AppText>
                {!app.usage.isPro ? <Lock color={colors.primary} size={14} /> : null}
              </View>
              <Field value={name} onChangeText={setName} placeholder={t('shared.defaultName')} autoCapitalize="sentences" />
              <PrimaryButton
                label={app.usage.isPro ? t('shared.create') : t('shared.createPro')}
                onPress={() => void create()}
                loading={busy === 'create'}
              />
            </GlassCard>

            <GlassCard style={{ gap: 10 }}>
              <AppText weight="bold">{t('shared.joinTitle')}</AppText>
              <AppText size={13} color={colors.muted}>
                {t('shared.joinBody')}
              </AppText>
              <Field value={code} onChangeText={(value) => setCode(value.toUpperCase())} placeholder="ABCD-2345" />
              <PrimaryButton
                tone="glass"
                label={t('shared.join')}
                onPress={() => void join()}
                loading={busy === 'join'}
                disabled={normalizeInviteCode(code).length !== 8}
              />
            </GlassCard>
          </>
        )}
        {error ? <AppText color={colors.danger}>{error}</AppText> : null}
      </ScrollView>
    </Aurora>
  );
}
