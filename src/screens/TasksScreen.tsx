import { useState } from 'react';
import { ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Aurora } from '@/components/Aurora';
import { UndoToast, useUndoDelete } from '@/components/UndoToast';
import { EditSheet } from '@/components/EditSheet';
import { tabBarClearance } from '@/components/GlassTabBar';
import { ItemCard } from '@/components/ItemCard';
import { SearchBar } from '@/components/SearchBar';
import { AppText, Chip, EmptyState } from '@/components/ui/primitives';
import { useApp } from '@/data/AppProvider';
import type { InboxItem } from '@/domain/types';
import { useI18n } from '@/i18n';
import { searchItems } from '@/lib/search';
import { isOverdue } from '@/lib/format';
import { useNow } from '@/lib/useNow';

export function TasksScreen() {
  const { t } = useI18n();
  const insets = useSafeAreaInsets();
  const { items, profile, toggleComplete, updateItem, deleteItem } = useApp();
  const undo = useUndoDelete({ deleteItem });
  const now = useNow();
  const [done, setDone] = useState(false);
  const [editing, setEditing] = useState<InboxItem | null>(null);
  const [query, setQuery] = useState('');
  const list = searchItems(items.filter((item) => !undo.hiddenItemIds.includes(item.id)), query)
    .filter((item) => item.type === 'task' && Boolean(item.completedAt) === done)
    .sort((a, b) => Number(isOverdue(b, now, profile.timezone)) - Number(isOverdue(a, now, profile.timezone)));
  return (
    <Aurora>
      <ScrollView contentContainerStyle={{ padding: 20, paddingTop: Math.max(insets.top, 16) + 8, paddingBottom: tabBarClearance(insets.bottom), gap: 14 }}>
        <AppText size={32} weight="extrabold">
          {t('tabs.tasks')}
        </AppText>
        <SearchBar value={query} onChangeText={setQuery} />
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          <Chip label={t('tasks.open')} active={!done} onPress={() => setDone(false)} />
          <Chip label={t('tasks.completed')} active={done} onPress={() => setDone(true)} />
        </View>
        {list.length === 0 ? (
          query.trim() ? (
            <EmptyState title={t('search.emptyTitle')} body={t('search.emptyBody')} />
          ) : (
            <EmptyState title={t('tasks.emptyTitle')} body={t('tasks.emptyBody')} />
          )
        ) : null}
        {list.map((item) => (
          <ItemCard
            key={item.id}
            item={item}
            timeZone={profile.timezone}
            onPress={() => setEditing(item)}
            onToggle={() => void toggleComplete(item.id)}
            onDelete={() => undo.removeItem(item.id)}
          />
        ))}
      </ScrollView>
      <EditSheet
        visible={Boolean(editing)}
        item={editing}
        timeZone={profile.timezone}
        defaultOffsets={profile.reminderOffsets}
        onClose={() => setEditing(null)}
        onChange={(patch) => {
          if (!editing) return;
          setEditing({ ...editing, ...patch });
          void updateItem(editing.id, patch);
        }}
        onDelete={() => {
          if (!editing) return;
          undo.removeItem(editing.id);
          setEditing(null);
        }}
      />
      <UndoToast visible={undo.visible} bottom={tabBarClearance(insets.bottom) - 8} onUndo={undo.undo} onDismiss={undo.dismiss} />
    </Aurora>
  );
}
