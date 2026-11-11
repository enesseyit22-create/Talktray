import { useState } from 'react';
import { ScrollView } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Aurora } from '@/components/Aurora';
import { ConfirmDelete } from '@/components/ConfirmDelete';
import { EditSheet } from '@/components/EditSheet';
import { tabBarClearance } from '@/components/GlassTabBar';
import { ItemCard } from '@/components/ItemCard';
import { AppText, EmptyState } from '@/components/ui/primitives';
import { useApp } from '@/data/AppProvider';
import type { InboxItem } from '@/domain/types';
import { useI18n } from '@/i18n';

export function NotesScreen() {
  const { t } = useI18n();
  const insets = useSafeAreaInsets();
  const { items, profile, updateItem, deleteItem } = useApp();
  const [editing, setEditing] = useState<InboxItem | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const notes = items.filter((item) => item.type === 'note');
  return (
    <Aurora>
      <ScrollView contentContainerStyle={{ padding: 20, paddingTop: Math.max(insets.top, 16) + 8, paddingBottom: tabBarClearance(insets.bottom), gap: 14 }}>
        <AppText size={32} weight="extrabold">
          {t('tabs.notes')}
        </AppText>
        {notes.length === 0 ? <EmptyState title={t('notes.emptyTitle')} body={t('notes.emptyBody')} /> : null}
        {notes.map((item) => (
          <ItemCard key={item.id} item={item} timeZone={profile.timezone} onPress={() => setEditing(item)} onDelete={() => setPendingId(item.id)} />
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
