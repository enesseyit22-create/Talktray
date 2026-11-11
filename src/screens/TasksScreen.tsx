import { useState } from 'react';
import { ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Aurora } from '@/components/Aurora';
import { ConfirmDelete } from '@/components/ConfirmDelete';
import { EditSheet } from '@/components/EditSheet';
import { ItemCard } from '@/components/ItemCard';
import { AppText, Chip, EmptyState } from '@/components/ui/primitives';
import { useApp } from '@/data/AppProvider';
import type { InboxItem } from '@/domain/types';
import { useI18n } from '@/i18n';
import { isOverdue } from '@/lib/format';
import { useNow } from '@/lib/useNow';

export function TasksScreen() {
  const { t } = useI18n();
  const insets = useSafeAreaInsets();
  const { items, profile, toggleComplete, updateItem, deleteItem } = useApp();
  const now = useNow();
  const [done, setDone] = useState(false);
  const [editing, setEditing] = useState<InboxItem | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const list = items
    .filter((item) => item.type === 'task' && Boolean(item.completedAt) === done)
    .sort((a, b) => Number(isOverdue(b, now, profile.timezone)) - Number(isOverdue(a, now, profile.timezone)));
  return (
    <Aurora>
      <ScrollView contentContainerStyle={{ padding: 20, paddingTop: Math.max(insets.top, 16) + 8, paddingBottom: 130, gap: 14 }}>
        <AppText size={32} weight="extrabold">
          {t('tabs.tasks')}
        </AppText>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <Chip label={t('tasks.open')} active={!done} onPress={() => setDone(false)} />
          <Chip label={t('tasks.completed')} active={done} onPress={() => setDone(true)} />
        </View>
        {list.length === 0 ? <EmptyState title={t('tasks.emptyTitle')} body={t('tasks.emptyBody')} /> : null}
        {list.map((item) => (
          <ItemCard
            key={item.id}
            item={item}
            timeZone={profile.timezone}
            onPress={() => setEditing(item)}
            onToggle={() => void toggleComplete(item.id)}
            onDelete={() => setPendingId(item.id)}
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
          setPendingId(editing.id);
        }}
      />
      <ConfirmDelete
        visible={pendingId != null}
        title={t('confirmDelete.itemTitle')}
        body={t('confirmDelete.itemBody')}
        onCancel={() => setPendingId(null)}
        onConfirm={() => {
          if (!pendingId) return;
          void deleteItem(pendingId);
          if (editing?.id === pendingId) setEditing(null);
          setPendingId(null);
        }}
      />
    </Aurora>
  );
}
