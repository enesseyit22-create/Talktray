import { type ReactNode } from 'react';
import { View } from 'react-native';

import { AppText, Chip, Field, PrimaryButton, Sheet } from '@/components/ui/primitives';
import { useI18n } from '@/i18n';
import { resolveRelativeDate } from '../../shared/parse/dates';
import type { ItemType } from '../../shared/parse/types';

const TYPES: ItemType[] = ['task', 'reminder', 'event', 'shopping', 'note'];

export type EditableItem = {
  type: ItemType;
  title: string;
  notes: string | null;
  dueAt: string | null;
  allDay: boolean;
  listName: string | null;
};

export function EditSheet({
  visible,
  item,
  timeZone,
  onClose,
  onChange,
  onDelete,
}: {
  visible: boolean;
  item: EditableItem | null;
  timeZone: string;
  onClose: () => void;
  onChange: (patch: Partial<EditableItem>) => void;
  onDelete?: () => void;
}) {
  const { t } = useI18n();
  if (!item) return null;
  const apply = (phrase: string | null) => {
    if (!phrase) {
      onChange({ dueAt: null, allDay: false });
      return;
    }
    const resolved = resolveRelativeDate(phrase, { now: new Date(), timeZone });
    if (!resolved) return;
    onChange({ dueAt: resolved.date.toISOString(), allDay: resolved.allDay });
  };
  return (
    <Sheet visible={visible} onClose={onClose}>
      <AppText size={20} weight="extrabold">
        {t('edit.title')}
      </AppText>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {TYPES.map((type) => (
          <Chip key={type} label={t(`types.${type}`)} active={item.type === type} onPress={() => onChange({ type })} />
        ))}
      </View>
      <Field
        label={t('edit.titleLabel')}
        value={item.title}
        onChangeText={(title) => onChange({ title })}
        autoCapitalize="sentences"
      />
      <Field
        label={t('edit.notes')}
        value={item.notes ?? ''}
        onChangeText={(notes) => onChange({ notes })}
        multiline
        autoCapitalize="sentences"
      />
      {item.type === 'shopping' ? (
        <Field
          label={t('edit.list')}
          value={item.listName ?? ''}
          onChangeText={(listName) => onChange({ listName })}
          autoCapitalize="words"
        />
      ) : null}
      <AppText size={13} weight="semibold">
        {t('edit.due')}
      </AppText>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        <Chip label={t('edit.none')} onPress={() => apply(null)} />
        <Chip label={t('edit.tonight')} onPress={() => apply('bu akşam')} />
        <Chip label={t('tomorrow')} onPress={() => apply('yarın saat 9')} />
        <Chip label={t('edit.nextWeek')} onPress={() => apply('gelecek hafta')} />
      </View>
      <PrimaryButton label={t('save')} onPress={onClose} />
      {onDelete ? <PrimaryButton label={t('delete')} tone="glass" onPress={onDelete} /> : null}
    </Sheet>
  );
}

export function Row({ children }: { children: ReactNode }) {
  return <View style={{ flexDirection: 'row', gap: 8 }}>{children}</View>;
}
