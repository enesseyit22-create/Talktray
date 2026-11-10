import { Bell } from 'lucide-react-native';
import { useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { router } from 'expo-router';

import { Aurora } from '@/components/Aurora';
import { Logo } from '@/components/Brand';
import { ItemCard } from '@/components/ItemCard';
import { RecordOrb } from '@/components/RecordOrb';
import { EditSheet, type EditableItem } from '@/components/EditSheet';
import { AppText, Chip, EmptyState, GlassCard, Sheet } from '@/components/ui/primitives';
import { useApp } from '@/data/AppProvider';
import type { InboxItem } from '@/domain/types';
import { formatClock, formatDuration, greetingKey } from '@/lib/format';
import { useI18n } from '@/i18n';
import { useTheme } from '@/theme/ThemeProvider';
import { isSameZonedDay } from '../../shared/parse/time';

type Filter = 'today' | 'reminders' | 'calendar' | 'shopping' | 'all';

export function InboxScreen() {
  const { t, locale } = useI18n();
  const { colors } = useTheme();
  const { profile, items, recordings, updateItem, deleteItem, toggleComplete } = useApp();
  const [filter, setFilter] = useState<Filter>('today');
  const [editing, setEditing] = useState<InboxItem | null>(null);
  const [bell, setBell] = useState(false);
  const now = new Date();
  const visible = filterItems(items, filter, now, profile.timezone);
  const shown = filter === 'today' ? visible.slice(0, 3) : visible;
  const upcoming = items
    .filter((item) => item.dueAt && !item.completedAt && new Date(item.dueAt).getTime() > now.getTime() - 60 * 60 * 1000)
    .sort((a, b) => (a.dueAt ?? '').localeCompare(b.dueAt ?? ''))
    .slice(0, 5);
  const activeTasks = items.filter((item) => item.type === 'task' && !item.completedAt).length;
  const notesToday = items.filter(
    (item) => item.type === 'note' && isSameZonedDay(new Date(item.createdAt), now, profile.timezone),
  ).length;
  const greeting = t(`greet.${greetingKey(now, profile.timezone)}`);

  return (
    <Aurora>
      <ScrollView contentContainerStyle={{ padding: 20, paddingTop: 64, paddingBottom: 130, gap: 16 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <Logo />
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
          <RecordOrb size={176} onPress={() => router.push('/record')} />
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
          {(['today', 'reminders', 'calendar', 'shopping', 'all'] as Filter[]).map((key) => (
            <Chip key={key} label={t(`filters.${key}`)} active={filter === key} onPress={() => setFilter(key)} />
          ))}
        </ScrollView>
        {shown.length === 0 ? (
          <EmptyState title={t('home.emptyTitle')} body={t('home.emptyBody')} />
        ) : (
          shown.map((item) => (
            <ItemCard
              key={item.id}
              item={item}
              timeZone={profile.timezone}
              onPress={() => setEditing(item)}
              onToggle={() => void toggleComplete(item.id)}
            />
          ))
        )}
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <Stat value={String(recordings.length)} label={t('home.voiceNotes')} tint={colors.task} />
          <Stat value={String(activeTasks)} label={t('home.activeTasks')} tint={colors.shopping} />
          <Stat value={String(notesToday)} label={t('home.notesToday')} tint={colors.note} />
        </View>
        <AppText weight="bold" size={18}>
          {t('home.recent')}
        </AppText>
        {recordings.slice(0, 3).map((recording) => (
          <GlassCard key={recording.id}>
            <AppText weight="semibold" numberOfLines={2}>
              {recording.transcript}
            </AppText>
            <AppText size={12} color={colors.muted}>
              {formatClock(recording.createdAt, profile.timezone, locale)} · {formatDuration(recording.durationMs)}
            </AppText>
          </GlassCard>
        ))}
      </ScrollView>
      <EditSheet
        visible={Boolean(editing)}
        item={editing}
        timeZone={profile.timezone}
        onClose={() => setEditing(null)}
        onChange={(patch) => {
          if (!editing) return;
          const next = { ...editing, ...patch };
          setEditing(next);
          void updateItem(editing.id, patch);
        }}
        onDelete={() => {
          if (!editing) return;
          void deleteItem(editing.id);
          setEditing(null);
        }}
      />
      <Sheet visible={bell} onClose={() => setBell(false)}>
        <AppText size={20} weight="extrabold">
          {t('comingUp')}
        </AppText>
        {upcoming.length === 0 ? <AppText color={colors.muted}>{t('noUpcoming')}</AppText> : null}
        {upcoming.map((item) => (
          <ItemCard key={item.id} item={item} timeZone={profile.timezone} />
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
  return (
    <GlassCard padding={12} style={{ flex: 1, gap: 2 }}>
      <View style={{ width: 28, height: 28, borderRadius: 10, backgroundColor: tint.tile }} />
      <AppText size={20} weight="extrabold" color={tint.icon}>
        {value}
      </AppText>
      <AppText size={11} color="#8E89A8">
        {label}
      </AppText>
    </GlassCard>
  );
}

function filterItems(items: InboxItem[], filter: Filter, now: Date, timeZone: string) {
  return items.filter((item) => {
    if (item.completedAt && filter !== 'all') return false;
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
