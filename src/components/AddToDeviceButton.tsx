import { useState } from 'react';
import { Platform } from 'react-native';

import { AppText, PrimaryButton } from '@/components/ui/primitives';
import { useI18n } from '@/i18n';
import { deviceTarget } from '@/lib/device-target';
import { addItemToDevice } from '@/services/calendar';
import { useTheme } from '@/theme/ThemeProvider';
import type { ItemType } from '../../shared/parse/types';

type Dated = {
  type: ItemType;
  title: string;
  notes: string | null;
  dueAt: string | null;
  allDay: boolean;
};

export function AddToDeviceButton({
  item,
  timeZone,
  linkedId,
  onLinked,
}: {
  item: Dated;
  timeZone: string;
  linkedId?: string | null;
  onLinked?: (id: string | null) => void;
}) {
  const { t } = useI18n();
  const { colors } = useTheme();
  const [message, setMessage] = useState<string | null>(linkedId ? t('device.already') : null);
  const [busy, setBusy] = useState(false);
  const destination = deviceTarget(item.type, Platform.OS);
  if (!item.dueAt || !destination) return null;
  const reminders = destination === 'reminders';

  const add = async () => {
    if (linkedId || busy) return;
    setBusy(true);
    setMessage(null);
    const result = await addItemToDevice(item, timeZone);
    setBusy(false);
    if (result.ok) {
      onLinked?.(result.id);
      setMessage(result.destination === 'reminders' ? t('device.addedReminder') : t('device.addedCalendar'));
      return;
    }
    if (result.reason === 'denied') {
      setMessage(reminders ? t('device.deniedReminder') : t('device.deniedCalendar'));
      return;
    }
    setMessage(result.reason === 'unsupported' ? t('device.unavailable') : t('device.failed'));
  };

  return (
    <>
      {linkedId ? null : (
        <PrimaryButton
          tone="glass"
          label={reminders ? t('device.addReminder') : t('device.addCalendar')}
          loading={busy}
          onPress={() => void add()}
        />
      )}
      {message ? (
        <AppText size={13} color={colors.muted}>
          {message}
        </AppText>
      ) : null}
    </>
  );
}
