import { Bell, Trash2 } from 'lucide-react-native';
import { useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Aurora } from '@/components/Aurora';
import { Logo } from '@/components/Brand';
import { tabBarClearance } from '@/components/GlassTabBar';
import { ItemCard } from '@/components/ItemCard';
import { useCapture } from '@/capture/CaptureProvider';
import { RecordOrb } from '@/components/RecordOrb';
import { EditSheet, type EditableItem } from '@/components/EditSheet';
import { AppText, Chip, EmptyState, GlassCard, PrimaryButton, Sheet } from '@/components/ui/primitives';
import { useApp } from '@/data/AppProvider';
import type { InboxItem } from '@/domain/types';
import { errorText } from '@/lib/errors';
import { formatClock, formatDuration, greetingKey, isOverdue } from '@/lib/format';
import { useNow } from '@/lib/useNow';
import { useI18n } from '@/i18n';
import { useTheme } from '@/theme/ThemeProvider';
import { deviceTimeZone, isSameZonedDay } from '../../shared/parse/time';

type Filter = 'today' | 'overdue' | 'reminders' | 'calendar' | 'shopping' | 'all';

export function InboxScreen() {
  const { t, locale } = useI18n();
  const { colors } = useTheme();
  const { profile, items, recordings, updateItem, deleteItem, deleteItems, deleteRecording, deleteAllRecordings, toggleComplete } = useApp();
  const capture = useCapture();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ item?: string | string[] }>();
  const linkedId = Array.isArray(params.item) ? params.item[0] : params.item;
  const [filter, setFilter] = useState<Filter>('today');
  const [picked, setPicked] = useState<InboxItem | null>(null);
  const linked = linkedId ? items.find((item) => item.id === linkedId) ?? null : null;
  const editing = picked ?? linked;
  const [bell, setBell] = useState(false);
  const [confirm, setConfirm] = useState<
    | { kind: 'recording'; id: string }
    | { kind: 'recordings' }
    | { kind: 'item'; id: string }
    | { kind: 'overdue' }
    | null
  >(null);
  const [confirmError, setConfirmError] = useState<string | null>(null);
  const now = useNow();
  const overdue = items
    .filter((item) => isOverdue(item, now, profile.timezone))
    .sort((a, b) => (a.dueAt ?? '').localeCompare(b.dueAt ?? ''));
  const visible = filterItems(items, filter, now, profile.timezone);
  const shown =
    filter === 'overdue'
      ? overdue
      : filter === 'today'
        ? visible.filter((item) => !isOverdue(item, now, profile.timezone)).slice(0, 3)
        : filter === 'all'
          ? visible.filter((item) => !isOverdue(item, now, profile.timezone))
          : [...visible].sort(
              (a, b) => Number(isOverdue(b, now, profile.timezone)) - Number(isOverdue(a, now, profile.timezone)),
            );
  const showOverdueSection = (filter === 'today' || filter === 'all') && overdue.length > 0;
  const upcoming = items
    .filter((item) => item.dueAt && !item.completedAt && new Date(item.dueAt).getTime() > now.getTime() - 60 * 60 * 1000)
    .sort((a, b) => (a.dueAt ?? '').localeCompare(b.dueAt ?? ''))
    .slice(0, 5);
  const activeTasks = items.filter((item) => item.type === 'task' && !item.completedAt).length;
  const notesToday = items.filter(
    (item) => item.type === 'note' && isSameZonedDay(new Date(item.createdAt), now, profile.timezone),
  ).length;
  const greeting = t(`greet.${greetingKey(now, deviceTimeZone())}`);

  return (
    <Aurora>
      <ScrollView contentContainerStyle={{ padding: 20, paddingTop: Math.max(insets.top, 16) + 8, paddingBottom: tabBarClearance(insets.bottom), gap: 16 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <Logo animated />
          <Pressable
            onPress={() => setBell(true)}
            style={{
              width: 44,
              height: 44,
              borderRadius: 22,
              backgroundColor: colors.glassStrong,
              alignItems: 'center',
              justifyContent: 'center',
              borderWidth: 1,
              borderColor: colors.glassBorder,
            }}
          >
            <Bell color={colors.text} size={20} />
            {upcoming.length ? (
              <View style={{ position: 'absolute', top: 8, right: 8, width: 8, height: 8, borderRadius: 4, backgroundColor: colors.dot }} />
            ) : null}
          </Pressable>
        </View>
        <View>
          <AppText size={34} weight="extrabold">
            {profile.displayName ? t('greet.hello', { greeting, name: profile.displayName }) : greeting}
          </AppText>
          <AppText color={colors.muted}>{t('greet.subtitle')}</AppText>
        </View>
        <View style={{ alignItems: 'center', marginVertical: 4 }}>
          <RecordOrb
            size={176}
            recording={capture.isRecording}
            accessibilityLabel={t('tabs.record')}
            label={capture.isRecording ? formatDuration(capture.durationMillis) : capture.busy ? t('record.processing') : undefined}
            onPress={() => void capture.toggle()}
            onHoldStart={() => void capture.start()}
            onHoldEnd={() => void capture.stopAndSubmit()}
          />
        </View>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={{ marginHorizontal: -20 }}
          contentContainerStyle={{ gap: 8, paddingHorizontal: 20 }}
        >
          {(['today', 'overdue', 'reminders', 'calendar', 'shopping', 'all'] as Filter[]).map((key) => (
            <Chip key={key} label={t(`filters.${key}`)} active={filter === key} onPress={() => setFilter(key)} />
          ))}
        </ScrollView>
        {showOverdueSection ? (
          <View style={{ gap: 10 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
              <AppText weight="bold" size={18} color={colors.danger}>
                {t('overdue.section')}
              </AppText>
              <Pressable onPress={() => setConfirm({ kind: 'overdue' })} style={{ minHeight: 44, justifyContent: 'center' }}>
                <AppText size={13} weight="semibold" color={colors.danger}>
                  {t('history.pastClear')}
                </AppText>
              </Pressable>
            </View>
            {overdue.map((item) => (
              <ItemCard
                key={item.id}
                item={item}
                timeZone={profile.timezone}
                onPress={() => setPicked(item)}
                onLongPress={() => setConfirm({ kind: 'item', id: item.id })}
                onToggle={() => void toggleComplete(item.id)}
                onDelete={() => setConfirm({ kind: 'item', id: item.id })}
              />
            ))}
          </View>
        ) : null}
        {filter === 'today' && shown.length > 0 && showOverdueSection ? (
          <AppText weight="bold" size={18}>
            {t('today')}
          </AppText>
        ) : null}
        {shown.length === 0 && !showOverdueSection ? (
          <EmptyState
            title={t(filter === 'overdue' ? 'overdue.emptyTitle' : 'home.emptyTitle')}
            body={t(filter === 'overdue' ? 'overdue.emptyBody' : 'home.emptyBody')}
          />
        ) : (
          shown.map((item) => (
            <ItemCard
              key={item.id}
              item={item}
              timeZone={profile.timezone}
              onPress={() => setPicked(item)}
              onToggle={() => void toggleComplete(item.id)}
              onDelete={() => setConfirm({ kind: 'item', id: item.id })}
            />
          ))
        )}
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <Stat value={String(recordings.length)} label={t('home.voiceNotes')} tint={colors.task} />
          <Stat value={String(activeTasks)} label={t('home.activeTasks')} tint={colors.shopping} />
          <Stat value={String(notesToday)} label={t('home.notesToday')} tint={colors.note} />
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
          <AppText weight="bold" size={18}>
            {t('home.recent')}
          </AppText>
          {recordings.length ? (
            <Pressable onPress={() => setConfirm({ kind: 'recordings' })} style={{ minHeight: 44, justifyContent: 'center' }}>
              <AppText size={13} weight="semibold" color={colors.danger}>
                {t('history.clear')}
              </AppText>
            </Pressable>
          ) : null}
        </View>
        <AppText size={12} color={colors.muted}>
          {t('history.hold')}
        </AppText>
        {recordings.map((recording) => (
          <GlassCard key={recording.id} onLongPress={() => setConfirm({ kind: 'recording', id: recording.id })}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <View style={{ flex: 1, gap: 2 }}>
                <AppText weight="semibold" numberOfLines={2}>
                  {recording.transcript || t('history.untitled')}
                </AppText>
                <AppText size={12} color={colors.muted}>
                  {formatClock(recording.createdAt, profile.timezone, locale)} · {formatDuration(recording.durationMs)}
                </AppText>
              </View>
              <Pressable
                accessibilityRole="button"
                hitSlop={8}
                onPress={() => setConfirm({ kind: 'recording', id: recording.id })}
                style={{ minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' }}
              >
                <Trash2 color={colors.danger} size={18} />
              </Pressable>
            </View>
          </GlassCard>
        ))}
      </ScrollView>
      <EditSheet
        visible={Boolean(editing)}
        item={editing}
        timeZone={profile.timezone}
        defaultOffsets={profile.reminderOffsets}
        onClose={() => {
          setPicked(null);
          if (linkedId) router.setParams({ item: '' });
        }}
        onChange={(patch) => {
          if (!editing) return;
          const next = { ...editing, ...patch };
          setPicked(next);
          void updateItem(editing.id, patch);
        }}
        onDelete={() => {
          if (!editing) return;
          setConfirm({ kind: 'item', id: editing.id });
        }}
      />
      <Sheet
        visible={Boolean(confirm)}
        onClose={() => {
          setConfirm(null);
          setConfirmError(null);
        }}
      >
        <AppText size={20} weight="extrabold">
          {t(
            confirm?.kind === 'recordings'
              ? 'history.clearTitle'
              : confirm?.kind === 'overdue'
                ? 'history.pastClearTitle'
                : confirm?.kind === 'item'
                  ? 'history.pastDeleteTitle'
                  : 'history.deleteTitle',
          )}
        </AppText>
        <AppText color={colors.muted}>
          {t(
            confirm?.kind === 'recordings'
              ? 'history.clearBody'
              : confirm?.kind === 'overdue'
                ? 'history.pastClearBody'
                : confirm?.kind === 'item'
                  ? 'history.pastDeleteBody'
                  : 'history.deleteBody',
          )}
        </AppText>
        {confirmError ? <AppText color={colors.danger}>{confirmError}</AppText> : null}
        <PrimaryButton
          label={t('delete')}
          onPress={() => {
            const current = confirm;
            if (!current) return;
            setConfirmError(null);
            const run =
              current.kind === 'recording'
                ? deleteRecording(current.id)
                : current.kind === 'recordings'
                  ? deleteAllRecordings()
                  : current.kind === 'item'
                    ? deleteItem(current.id)
                    : deleteItems(overdue.map((item) => item.id));
            void run
              .then(() => {
                if (current.kind === 'item' && editing?.id === current.id) {
                  setPicked(null);
                  if (linkedId) router.setParams({ item: '' });
                }
                setConfirm(null);
              })
              .catch((caught) => setConfirmError(errorText(caught, t('errors.generic'))));
          }}
        />
        <PrimaryButton
          tone="glass"
          label={t('cancel')}
          onPress={() => {
            setConfirm(null);
            setConfirmError(null);
          }}
        />
      </Sheet>
      <Sheet visible={bell} onClose={() => setBell(false)}>
        <AppText size={20} weight="extrabold">
          {t('comingUp')}
        </AppText>
        {upcoming.length === 0 ? <AppText color={colors.muted}>{t('noUpcoming')}</AppText> : null}
        {upcoming.map((item) => (
          <ItemCard key={item.id} item={item} timeZone={profile.timezone} onDelete={() => setConfirm({ kind: 'item', id: item.id })} />
        ))}
      </Sheet>
    </Aurora>
  );
}

function Stat({
  value,
  label,
  tint,
}: {
  value: string;
  label: string;
  tint: { tile: string; icon: string };
}) {
  const { colors } = useTheme();
  return (
    <GlassCard padding={12} style={{ flex: 1, minWidth: 0, gap: 2 }}>
      <View style={{ width: 28, height: 28, borderRadius: 10, backgroundColor: tint.tile }} />
      <AppText size={20} weight="extrabold" color={tint.icon}>
        {value}
      </AppText>
      <AppText size={11} color={colors.muted}>
        {label}
      </AppText>
    </GlassCard>
  );
}

function filterItems(items: InboxItem[], filter: Filter, now: Date, timeZone: string) {
  return items.filter((item) => {
    if (item.completedAt && filter !== 'all') return false;
    if (filter === 'overdue') return isOverdue(item, now, timeZone);
    if (filter === 'all') return true;
    if (filter === 'reminders') return item.type === 'reminder';
    if (filter === 'calendar') return item.type === 'event';
    if (filter === 'shopping') return item.type === 'shopping';
    const dueToday = item.dueAt ? isSameZonedDay(new Date(item.dueAt), now, timeZone) : false;
    const createdToday = isSameZonedDay(new Date(item.createdAt), now, timeZone);
    return dueToday || createdToday;
  });
}

export type { EditableItem };
