import { useState } from 'react';
import { ScrollView } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Aurora } from '@/components/Aurora';
import { UndoToast, useUndoDelete } from '@/components/UndoToast';
import { EditSheet } from '@/components/EditSheet';
import { tabBarClearance } from '@/components/GlassTabBar';
import { ItemCard } from '@/components/ItemCard';
import { SearchBar } from '@/components/SearchBar';
import { AppText, EmptyState } from '@/components/ui/primitives';
import { useApp } from '@/data/AppProvider';
import type { InboxItem } from '@/domain/types';
import { useI18n } from '@/i18n';
import { searchItems } from '@/lib/search';

export function NotesScreen() {
  const { t } = useI18n();
  const insets = useSafeAreaInsets();
  const { items, profile, updateItem, deleteItem } = useApp();
  const undo = useUndoDelete({ deleteItem });
  const [editing, setEditing] = useState<InboxItem | null>(null);
  const [query, setQuery] = useState('');
  const allNotes = items.filter((item) => item.type === 'note' && !undo.hiddenItemIds.includes(item.id));
  const notes = searchItems(allNotes, query);
  return (
    <Aurora>
      <ScrollView contentContainerStyle={{ padding: 20, paddingTop: Math.max(insets.top, 16) + 8, paddingBottom: tabBarClearance(insets.bottom), gap: 14 }}>
        <AppText size={32} weight="extrabold">
          {t('tabs.notes')}
        </AppText>
        {allNotes.length > 0 ? <SearchBar value={query} onChangeText={setQuery} /> : null}
        {notes.length === 0 ? (
          allNotes.length > 0 ? (
            <EmptyState title={t('search.emptyTitle')} body={t('search.emptyBody')} />
          ) : (
            <EmptyState title={t('notes.emptyTitle')} body={t('notes.emptyBody')} />
          )
        ) : null}
        {notes.map((item) => (
          <ItemCard
            key={item.id}
            item={item}
            timeZone={profile.timezone}
            onPress={() => {
              if ((item.notes?.length ?? 0) > 180) router.push({ pathname: '/write', params: { id: item.id } });
              else setEditing(item);
            }}
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
