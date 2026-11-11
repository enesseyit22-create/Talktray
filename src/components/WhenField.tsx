import { useState } from 'react';
import { Pressable, View } from 'react-native';

import { AppText, Chip } from '@/components/ui/primitives';
import { useI18n } from '@/i18n';
import { composeDueAt, dueParts, monthCells, shiftMonth } from '@/lib/month-grid';
import { useTheme } from '@/theme/ThemeProvider';

const WEEKDAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

export function WhenField({
  dueAt,
  allDay,
  timeZone,
  onChange,
}: {
  dueAt: string | null;
  allDay: boolean;
  timeZone: string;
  onChange: (patch: { dueAt: string | null; allDay: boolean }) => void;
}) {
  const { t, locale } = useI18n();
  const { colors } = useTheme();
  const parts = dueParts(dueAt, timeZone);
  const [visibleMonth, setVisibleMonth] = useState({ year: parts.year, month: parts.month });
  const monthLabel = new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric' }).format(
    new Date(Date.UTC(visibleMonth.year, visibleMonth.month - 1, 1)),
  );
  const cells = monthCells(visibleMonth.year, visibleMonth.month);
  const selected = dueAt ? dueParts(dueAt, timeZone) : null;

  const pickDay = (day: number) => {
    onChange({
      allDay,
      dueAt: composeDueAt(
        timeZone,
        { year: visibleMonth.year, month: visibleMonth.month, day, hour: parts.hour, minute: parts.minute },
        allDay,
      ),
    });
  };
  const step = (kind: 'hour' | 'minute', delta: number) => {
    const base = selected ?? parts;
    const hour = kind === 'hour' ? (base.hour + delta + 24) % 24 : base.hour;
    const minute = kind === 'minute' ? (base.minute + delta + 60) % 60 : base.minute;
    onChange({
      allDay: false,
      dueAt: composeDueAt(timeZone, { year: base.year, month: base.month, day: base.day, hour, minute }, false),
    });
  };

  return (
    <View style={{ gap: 10 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('when.prev')}
          onPress={() => setVisibleMonth((current) => shiftMonth(current.year, current.month, -1))}
          style={{ minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' }}
        >
          <AppText weight="bold" color={colors.primary}>
            ‹
          </AppText>
        </Pressable>
        <AppText weight="semibold">{monthLabel}</AppText>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('when.next')}
          onPress={() => setVisibleMonth((current) => shiftMonth(current.year, current.month, 1))}
          style={{ minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' }}
        >
          <AppText weight="bold" color={colors.primary}>
            ›
          </AppText>
        </Pressable>
      </View>
      <View style={{ flexDirection: 'row' }}>
        {WEEKDAYS.map((label, index) => (
          <AppText key={`${label}-${index}`} size={11} color={colors.muted} style={{ flex: 1, textAlign: 'center' }}>
            {label}
          </AppText>
        ))}
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
        {cells.map((day, index) => {
          const active =
            day != null &&
            selected != null &&
            selected.year === visibleMonth.year &&
            selected.month === visibleMonth.month &&
            selected.day === day;
          return (
            <Pressable
              key={`${visibleMonth.year}-${visibleMonth.month}-${index}`}
              disabled={day == null}
              onPress={() => day != null && pickDay(day)}
              style={{ width: `${100 / 7}%`, aspectRatio: 1, alignItems: 'center', justifyContent: 'center' }}
            >
              {day != null ? (
                <View
                  style={{
                    width: 32,
                    height: 32,
                    borderRadius: 16,
                    alignItems: 'center',
                    justifyContent: 'center',
                    backgroundColor: active ? colors.primary : 'transparent',
                  }}
                >
                  <AppText size={13} weight={active ? 'bold' : 'regular'} color={active ? colors.onPrimary : colors.text}>
                    {day}
                  </AppText>
                </View>
              ) : null}
            </Pressable>
          );
        })}
      </View>
      <Chip label={t('when.allDay')} active={allDay} onPress={() => onChange({ dueAt, allDay: !allDay })} />
      {allDay ? null : (
        <View style={{ flexDirection: 'row', gap: 12 }}>
          <Stepper label={t('when.hour')} value={String(parts.hour).padStart(2, '0')} onDown={() => step('hour', -1)} onUp={() => step('hour', 1)} />
          <Stepper label={t('when.minute')} value={String(parts.minute).padStart(2, '0')} onDown={() => step('minute', -5)} onUp={() => step('minute', 5)} />
        </View>
      )}
    </View>
  );
}

function Stepper({
  label,
  value,
  onDown,
  onUp,
}: {
  label: string;
  value: string;
  onDown: () => void;
  onUp: () => void;
}) {
  const { colors } = useTheme();
  return (
    <View style={{ flex: 1, gap: 6 }}>
      <AppText size={12} color={colors.muted}>
        {label}
      </AppText>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Pressable onPress={onDown} style={{ minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' }}>
          <AppText weight="bold" color={colors.primary}>
            −
          </AppText>
        </Pressable>
        <AppText weight="bold">{value}</AppText>
        <Pressable onPress={onUp} style={{ minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' }}>
          <AppText weight="bold" color={colors.primary}>
            +
          </AppText>
        </Pressable>
      </View>
    </View>
  );
}
