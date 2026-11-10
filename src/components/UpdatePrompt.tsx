import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText, GlassCard, PrimaryButton } from '@/components/ui/primitives';
import { useI18n } from '@/i18n';
import { useUpdates } from '@/updates/UpdateProvider';

export function UpdatePrompt() {
  const { promptVisible, dismiss, restart } = useUpdates();
  const { t } = useI18n();
  const insets = useSafeAreaInsets();
  if (!promptVisible) return null;
  return (
    <View
      pointerEvents="box-none"
      style={{ position: 'absolute', left: 16, right: 16, bottom: Math.max(insets.bottom, 16) }}
    >
      <GlassCard style={{ gap: 12 }}>
        <AppText size={18} weight="extrabold">
          {t('updates.ready')}
        </AppText>
        <AppText>{t('updates.readyBody')}</AppText>
        <PrimaryButton label={t('updates.restart')} onPress={() => void restart()} />
        <PrimaryButton tone="glass" label={t('updates.later')} onPress={dismiss} />
      </GlassCard>
    </View>
  );
}
