import { type ReactNode } from 'react';
import { ScrollView, View } from 'react-native';

import { OverdueBadge, overdueCaption } from '@/components/ItemCard';
import { AppText, Chip, Field, PrimaryButton, Sheet } from '@/components/ui/primitives';
import { useI18n } from '@/i18n';
import { useTheme } from '@/theme/ThemeProvider';
import { isOverdue, pastDuePhrase } from '@/lib/format';
import { useNow } from '@/lib/useNow';
import { resolveRelativeDate } from '../../shared/parse/dates';
import type { ItemType } from '../../shared/parse/types';

const TYPES: ItemType[] = ['task', 'reminder', 'event', 'shopping', 'note'];
const PRESETS = [0, 5, 10, 15, 30, 60, 1440];

function offsetLabel(t: (key: string, params?: Record<string, string | number>) => string, minutes: number) {
  if (minutes === 0) return t('remind.at');
  if (minutes === 60) return t('remind.hour');
  if (minutes === 1440) return t('remind.day');
  return t('remind.minutes', { minutes });
}

export type EditableItem = {
  type: ItemType;
  title: string;
  notes: string | null;
  dueAt: string | null;
  allDay: boolean;
  listName: string | null;
  reminderOffsets: number[] | null;
  completedAt?: string | null;
};

export function EditSheet({
  visible,
  item,
  timeZone,
  defaultOffsets,
  onClose,
  onChange,
  onDelete,
}: {
  visible: boolean;
  item: EditableItem | null;
  timeZone: string;
  defaultOffsets: number[];
  onClose: () => void;
  onChange: (patch: Partial<EditableItem>) => void;
  onDelete?: () => void;
}) {
  const { t, locale } = useI18n();
  const { colors } = useTheme();
  const now = useNow();
  if (!item) return null;
  const overdue = isOverdue(item, now, timeZone);
  const pastLabel = overdue && item.dueAt ? overdueCaption(t, pastDuePhrase(item.dueAt, now, timeZone, locale, item.allDay)) : '';
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
      {overdue ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <OverdueBadge />
          <AppText size={14} weight="semibold" color={colors.danger} style={{ flexShrink: 1 }}>
            {pastLabel}
          </AppText>
        </View>
      ) : null}
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
        {t('remind.title')}
      </AppText>
      <ScrollView
        horizontal
        nestedScrollEnabled
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ gap: 8, paddingRight: 4 }}
      >
        <Chip
          label={t('remind.useDefault')}
          active={item.reminderOffsets == null}
          onPress={() => onChange({ reminderOffsets: null })}
        />
        {[...new Set([...PRESETS, ...(item.reminderOffsets ?? [])])].sort((a, b) => a - b).map((offset) => {
          const selected = (item.reminderOffsets ?? defaultOffsets).includes(offset);
          return (
            <Chip
              key={offset}
              label={offsetLabel(t, offset)}
              active={item.reminderOffsets != null && selected}
              onPress={() => {
                const base = item.reminderOffsets ?? [...defaultOffsets];
                const next = base.includes(offset)
                  ? base.filter((value) => value !== offset)
                  : [...base, offset].sort((a, b) => a - b);
                onChange({ reminderOffsets: next.length > 0 ? next : [0] });
              }}
            />
          );
        })}
      </ScrollView>
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
