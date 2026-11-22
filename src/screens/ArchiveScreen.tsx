import { ScrollView } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Aurora } from '@/components/Aurora';
import { UndoToast, useUndoDelete } from '@/components/UndoToast';
import { tabBarClearance } from '@/components/GlassTabBar';
import { ItemCard } from '@/components/ItemCard';
import { AppText, EmptyState, PrimaryButton } from '@/components/ui/primitives';
import { useApp } from '@/data/AppProvider';
import { useI18n } from '@/i18n';

export function ArchiveScreen() {
  const { t } = useI18n();
  const insets = useSafeAreaInsets();
  const { items, profile, updateItem, deleteItem } = useApp();
  const undo = useUndoDelete({ deleteItem });
  const archived = items.filter((item) => item.completedAt && !undo.hiddenItemIds.includes(item.id));
  return (
    <Aurora>
      <ScrollView contentContainerStyle={{ padding: 20, paddingTop: Math.max(insets.top, 16) + 8, paddingBottom: tabBarClearance(insets.bottom), gap: 12 }}>
        <PrimaryButton tone="glass" label={t('close')} onPress={() => router.back()} />
        <AppText size={32} weight="extrabold">
          {t('archive.title')}
        </AppText>
        <AppText color="#6b7280">{t('archive.hint')}</AppText>
        {archived.length === 0 ? <EmptyState title={t('archive.emptyTitle')} body={t('archive.emptyBody')} /> : null}
        {archived.map((item) => (
          <ItemCard
            key={item.id}
            item={item}
            timeZone={profile.timezone}
            onDelete={() => undo.removeItem(item.id)}
          />
        ))}
        {archived.map((item) => (
          <PrimaryButton
            key={`restore-${item.id}`}
            tone="glass"
            label={t('archive.restore', { title: item.title })}
            onPress={() => void updateItem(item.id, { completedAt: null })}
          />
        ))}
      </ScrollView>
      <UndoToast visible={undo.visible} bottom={24} onUndo={undo.undo} onDismiss={undo.dismiss} />
    </Aurora>
  );
}
