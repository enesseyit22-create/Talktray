import { Calendar, Check, ChevronRight, Clock, Leaf, ShoppingBag, Trash2 } from 'lucide-react-native';
import { Pressable, View } from 'react-native';
import Swipeable from 'react-native-gesture-handler/Swipeable';

import { AppText, GlassCard } from '@/components/ui/primitives';
import type { InboxItem } from '@/domain/types';
import { formatClock, formatDayLabel, isOverdue, pastDuePhrase, type PastDuePhrase } from '@/lib/format';
import { useI18n } from '@/i18n';
import { haptic } from '@/lib/haptics';
import { useNow } from '@/lib/useNow';
import { useTheme } from '@/theme/ThemeProvider';
import type { ItemType } from '../../shared/parse/types';

const ICONS = {
  task: Check,
  reminder: Clock,
  event: Calendar,
  shopping: ShoppingBag,
  note: Leaf,
} as const;

export function TypeIcon({ type, done }: { type: ItemType; done?: boolean }) {
  const { colors } = useTheme();
  const palette = colors[type];
  const Icon = done ? Check : ICONS[type];
  return (
    <View
      style={{
        width: 44,
        height: 44,
        borderRadius: 16,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: palette.tile,
      }}
    >
      <Icon color={palette.icon} size={20} strokeWidth={2.3} />
    </View>
  );
}

export function OverdueBadge() {
  const { t } = useI18n();
  return (
    <View style={{ flexShrink: 1, maxWidth: '100%', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999, backgroundColor: '#E15B73' }}>
      <AppText size={11} weight="bold" color="#FFFFFF" style={{ textAlign: 'center' }}>
        {t('overdue.badge')}
      </AppText>
    </View>
  );
}

export function overdueCaption(
  t: (key: string, vars?: Record<string, string | number>) => string,
  phrase: PastDuePhrase,
): string {
  if (phrase.kind === 'yesterday') {
    return phrase.time ? t('overdue.yesterday', { time: phrase.time }) : t('overdue.yesterdayDay');
  }
  return t(`overdue.${phrase.unit}`, { count: phrase.count });
}

export function ItemCard({
  item,
  timeZone,
  onPress,
  onLongPress,
  onToggle,
  onDelete,
}: {
  item: InboxItem;
  timeZone: string;
  onPress?: () => void;
  onLongPress?: () => void;
  onToggle?: () => void;
  onDelete?: () => void;
}) {
  const { colors } = useTheme();
  const { t, locale } = useI18n();
  const now = useNow();
  const time = item.dueAt ? formatClock(item.dueAt, timeZone, locale) : '';
  const day = item.dueAt
    ? formatDayLabel(item.dueAt, now, timeZone, locale, t('today'), t('tomorrow'))
    : formatDayLabel(item.createdAt, now, timeZone, locale, t('today'), t('tomorrow'));
  const overdue = isOverdue(item, now, timeZone);
  const pastLabel = overdue && item.dueAt ? overdueCaption(t, pastDuePhrase(item.dueAt, now, timeZone, locale, item.allDay)) : '';
  const subtitle = pastLabel
    ? item.type === 'shopping'
      ? `${item.listName ?? t('types.shopping')} · ${pastLabel}`
      : pastLabel
    : item.type === 'shopping'
      ? `${item.listName ?? t('types.shopping')}${time ? ` · ${time}` : ''}`
      : item.type === 'note'
        ? `${day}${time ? '' : ` · ${formatClock(item.createdAt, timeZone, locale)}`}`
        : time
          ? `${day} · ${time}`
          : t(`types.${item.type}`);
  const accent = colors[item.type].icon;

  const card = (
    <GlassCard onPress={onPress} onLongPress={onLongPress} padding={14}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <Pressable
          onPress={() => {
            haptic('success');
            onToggle?.();
          }}
        >
          <TypeIcon type={item.type} done={Boolean(item.completedAt)} />
        </Pressable>
        <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
          <AppText weight="bold" numberOfLines={3} style={item.completedAt ? { textDecorationLine: 'line-through', opacity: 0.6 } : undefined}>
            {t(`types.${item.type}`)}: {item.title}
          </AppText>
          <AppText size={13} color={overdue ? colors.danger : colors.muted} numberOfLines={2}>
            {subtitle}
          </AppText>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2, flexShrink: 1, maxWidth: '46%' }}>
          {overdue ? <OverdueBadge /> : time ? (
            <AppText size={13} weight="semibold" color={accent} numberOfLines={1} style={{ flexShrink: 1 }}>
              {time}
            </AppText>
          ) : null}
          {onDelete ? (
            <Pressable
              accessibilityRole="button"
              hitSlop={8}
              onPress={onDelete}
              style={{ minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' }}
            >
              <Trash2 color={colors.danger} size={18} />
            </Pressable>
          ) : (
            <ChevronRight color={colors.soft} size={16} />
          )}
        </View>
      </View>
    </GlassCard>
  );

  if (!onDelete) return card;
  return (
    <Swipeable
      overshootRight={false}
      renderRightActions={() => (
        <Pressable
          onPress={onDelete}
          style={{
            width: 88,
            marginLeft: 8,
            borderRadius: 22,
            backgroundColor: colors.danger,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Trash2 color="#FFFFFF" size={20} />
        </Pressable>
      )}
    >
      {card}
    </Swipeable>
  );
}
