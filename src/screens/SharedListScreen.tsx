import { router, useFocusEffect } from 'expo-router';
import { Check, ChevronLeft, Share2, Trash2 } from 'lucide-react-native';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Platform, Pressable, ScrollView, Share, StatusBar, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Aurora } from '@/components/Aurora';
import { AppText, EmptyState, Field, GlassCard, PrimaryButton, Sheet, Skeleton } from '@/components/ui/primitives';
import { useApp } from '@/data/AppProvider';
import { useI18n } from '@/i18n';
import { haptic } from '@/lib/haptics';
import { createId } from '@/lib/id';
import { sheetTopInset } from '@/lib/layout';
import {
  addSharedItem,
  clearDoneSharedItems,
  deleteSharedItem,
  formatInviteCode,
  inviteLink,
  leaveSharedList,
  loadSharedList,
  rotateInviteCode,
  setSharedItemDone,
  sharedListError,
  sortSharedItems,
  subscribeSharedList,
  type SharedItem,
  type SharedList,
  type SharedMember,
} from '@/services/shared-lists';
import { useTheme } from '@/theme/ThemeProvider';

export function SharedListScreen({ listId }: { listId: string }) {
  const { t, locale } = useI18n();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const app = useApp();
  const [list, setList] = useState<SharedList | null>(null);
  const [members, setMembers] = useState<SharedMember[]>([]);
  const [items, setItems] = useState<SharedItem[] | null>(null);
  const [missing, setMissing] = useState(false);
  const [draft, setDraft] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [confirmLeave, setConfirmLeave] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const loading = useRef(false);

  const reload = useCallback(() => {
    if (!listId || loading.current) return;
    loading.current = true;
    loadSharedList(listId, locale)
      .then((next) => {
        setList(next.list);
        setMembers(next.members);
        setItems(next.items);
        setMissing(!next.list);
      })
      .catch(() => setError(t('shared.errorNetwork')))
      .finally(() => {
        loading.current = false;
      });
  }, [listId, locale, t]);

  useFocusEffect(reload);

  useEffect(() => {
    if (!listId) return;
    const stop = subscribeSharedList(listId, reload);
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') reload();
    });
    return () => {
      stop();
      sub.remove();
    };
  }, [listId, reload]);

  const owner = Boolean(list && app.user && list.ownerId === app.user.id);
  const sorted = sortSharedItems(items ?? []);
  const doneCount = sorted.filter((item) => item.doneAt).length;
  const nameOf = (userId: string | null) => members.find((member) => member.userId === userId)?.displayName ?? null;

  const add = async () => {
    const title = draft.trim();
    if (!title || !list) return;
    const id = createId();
    const optimistic: SharedItem = {
      id,
      listId: list.id,
      title,
      addedBy: app.user?.id ?? null,
      doneAt: null,
      doneBy: null,
      createdAt: new Date().toISOString(),
    };
    setDraft('');
    setItems((current) => [...(current ?? []), optimistic]);
    try {
      const saved = await addSharedItem(list.id, id, title);
      setItems((current) => (current ?? []).map((item) => (item.id === id ? saved : item)));
    } catch (caught) {
      setItems((current) => (current ?? []).filter((item) => item.id !== id));
      setDraft(title);
      const kind = sharedListError(caught as { message?: string });
      setError(t(kind === 'full' ? 'shared.errorItemsFull' : 'shared.errorNetwork'));
    }
  };

  const toggle = async (item: SharedItem) => {
    haptic('success');
    const done = !item.doneAt;
    const stamp = done ? new Date().toISOString() : null;
    setItems((current) =>
      (current ?? []).map((entry) =>
        entry.id === item.id ? { ...entry, doneAt: stamp, doneBy: done ? app.user?.id ?? null : null } : entry,
      ),
    );
    try {
      await setSharedItemDone(item.id, done);
    } catch {
      setItems((current) => (current ?? []).map((entry) => (entry.id === item.id ? item : entry)));
      setError(t('shared.errorNetwork'));
    }
  };

  const remove = async (item: SharedItem) => {
    setItems((current) => (current ?? []).filter((entry) => entry.id !== item.id));
    try {
      await deleteSharedItem(item.id);
    } catch {
      setItems((current) => [...(current ?? []), item]);
      setError(t('shared.errorNetwork'));
    }
  };

  const clearDone = async () => {
    if (!list) return;
    const before = items;
    setItems((current) => (current ?? []).filter((item) => !item.doneAt));
    try {
      await clearDoneSharedItems(list.id);
    } catch {
      setItems(before);
      setError(t('shared.errorNetwork'));
    }
  };

  const share = async () => {
    if (!list) return;
    await Share.share({
      message: t('shared.inviteMessage', {
        name: list.name,
        code: formatInviteCode(list.inviteCode),
        link: inviteLink(list.inviteCode),
      }),
    }).catch(() => undefined);
  };

  const rotate = async () => {
    if (!list) return;
    try {
      const code = await rotateInviteCode(list.id);
      setList({ ...list, inviteCode: code });
    } catch {
      setError(t('shared.errorNetwork'));
    }
  };

  const leave = async () => {
    if (!list) return;
    setLeaving(true);
    try {
      await leaveSharedList(list.id);
      setConfirmLeave(false);
      router.back();
    } catch {
      setError(t('shared.errorNetwork'));
    } finally {
      setLeaving(false);
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
          gap: 12,
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
          <AppText color={colors.muted}>{t('shared.title')}</AppText>
        </Pressable>

        {missing ? (
          <EmptyState title={t('shared.goneTitle')} body={t('shared.goneBody')} />
        ) : !list ? (
          <Skeleton height={120} />
        ) : (
          <>
            <AppText size={30} weight="extrabold" numberOfLines={2}>
              {list.name}
            </AppText>
            <AppText size={13} color={colors.muted} numberOfLines={2}>
              {members
                .map((member) => member.displayName || t('shared.someone'))
                .join(' · ')}
            </AppText>

            <View style={{ flexDirection: 'row', gap: 8 }}>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Field value={draft} onChangeText={setDraft} placeholder={t('shared.addPlaceholder')} autoCapitalize="sentences" />
              </View>
              <View style={{ minWidth: 96, flexShrink: 0 }}>
                <PrimaryButton label={t('shared.add')} onPress={() => void add()} disabled={!draft.trim()} />
              </View>
            </View>

            {items == null ? <Skeleton /> : null}
            {items?.length === 0 ? <EmptyState title={t('shared.itemsEmptyTitle')} body={t('shared.itemsEmptyBody')} /> : null}
            {sorted.map((item) => {
              const doneByName = item.doneAt ? nameOf(item.doneBy) : null;
              return (
                <GlassCard key={item.id} padding={12}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                    <Pressable
                      onPress={() => void toggle(item)}
                      accessibilityRole="checkbox"
                      accessibilityState={{ checked: Boolean(item.doneAt) }}
                      accessibilityLabel={item.title}
                      hitSlop={6}
                      style={{
                        width: 32,
                        height: 32,
                        borderRadius: 16,
                        borderWidth: 2,
                        borderColor: item.doneAt ? colors.success : colors.soft,
                        backgroundColor: item.doneAt ? colors.success : 'transparent',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      {item.doneAt ? <Check color="#fff" size={18} /> : null}
                    </Pressable>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <AppText
                        weight="semibold"
                        numberOfLines={2}
                        style={item.doneAt ? { textDecorationLine: 'line-through', opacity: 0.55 } : undefined}
                      >
                        {item.title}
                      </AppText>
                      {doneByName ? (
                        <AppText size={12} color={colors.muted}>
                          {t('shared.doneBy', { name: doneByName })}
                        </AppText>
                      ) : null}
                    </View>
                    <Pressable
                      onPress={() => void remove(item)}
                      accessibilityRole="button"
                      accessibilityLabel={t('delete')}
                      hitSlop={8}
                      style={{ minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' }}
                    >
                      <Trash2 color={colors.danger} size={18} />
                    </Pressable>
                  </View>
                </GlassCard>
              );
            })}
            {doneCount > 0 ? (
              <PrimaryButton tone="glass" label={t('shared.clearDone', { count: doneCount })} onPress={() => void clearDone()} />
            ) : null}

            <GlassCard style={{ gap: 10 }}>
              <AppText weight="bold">{t('shared.inviteTitle')}</AppText>
              <AppText size={13} color={colors.muted}>
                {t('shared.inviteBody')}
              </AppText>
              <AppText size={26} weight="extrabold" style={{ letterSpacing: 2, textAlign: 'center' }}>
                {formatInviteCode(list.inviteCode)}
              </AppText>
              <Pressable
                onPress={() => void share()}
                accessibilityRole="button"
                style={{
                  minHeight: 48,
                  borderRadius: 999,
                  backgroundColor: colors.primary,
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 8,
                }}
              >
                <Share2 color="#fff" size={18} />
                <AppText weight="bold" color="#fff">
                  {t('shared.share')}
                </AppText>
              </Pressable>
              {owner ? <PrimaryButton tone="glass" label={t('shared.newCode')} onPress={() => void rotate()} /> : null}
            </GlassCard>

            <Pressable onPress={() => setConfirmLeave(true)} style={{ minHeight: 44, justifyContent: 'center', alignSelf: 'center' }}>
              <AppText weight="semibold" color={colors.danger}>
                {owner ? t('shared.deleteList') : t('shared.leave')}
              </AppText>
            </Pressable>
          </>
        )}
        {error ? <AppText color={colors.danger}>{error}</AppText> : null}
      </ScrollView>
      <Sheet visible={confirmLeave} onClose={() => setConfirmLeave(false)}>
        <AppText size={20} weight="extrabold">
          {owner ? t('shared.deleteTitle') : t('shared.leaveTitle')}
        </AppText>
        <AppText color={colors.muted}>{owner ? t('shared.deleteBody') : t('shared.leaveBody')}</AppText>
        <PrimaryButton label={owner ? t('shared.deleteList') : t('shared.leave')} onPress={() => void leave()} loading={leaving} />
        <PrimaryButton tone="glass" label={t('cancel')} onPress={() => setConfirmLeave(false)} />
      </Sheet>
    </Aurora>
  );
}
