import { useState } from 'react';
import { ScrollView } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Aurora } from '@/components/Aurora';
import { EditSheet } from '@/components/EditSheet';
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
  const notes = items.filter((item) => item.type === 'note');
  return (
    <Aurora>
      <ScrollView contentContainerStyle={{ padding: 20, paddingTop: Math.max(insets.top, 16) + 8, paddingBottom: 130, gap: 14 }}>
        <AppText size={32} weight="extrabold">
          {t('tabs.notes')}
        </AppText>
        {notes.length === 0 ? <EmptyState title={t('notes.emptyTitle')} body={t('notes.emptyBody')} /> : null}
        {notes.map((item) => (
          <ItemCard key={item.id} item={item} timeZone={profile.timezone} onPress={() => setEditing(item)} />
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
          void deleteItem(editing.id);
          setEditing(null);
        }}
      />
    </Aurora>
  );
}
