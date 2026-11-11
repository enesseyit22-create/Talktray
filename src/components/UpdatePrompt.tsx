import { Platform, StatusBar, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText, BoundedScroll, GlassCard, PrimaryButton } from '@/components/ui/primitives';
import { useI18n } from '@/i18n';
import { sheetTopInset } from '@/lib/layout';
import { useUpdates } from '@/updates/UpdateProvider';

export function UpdatePrompt() {
  const { promptVisible, dismiss, restart } = useUpdates();
  const { t } = useI18n();
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  if (!promptVisible) return null;
  const top = sheetTopInset(insets.top, Platform.OS === 'android' ? StatusBar.currentHeight ?? 0 : 0, Platform.OS);
  const bottom = Math.max(insets.bottom, 16);
  const maxHeight = Math.max(0, height - top - bottom - 16);
  return (
    <View pointerEvents="box-none" style={{ position: 'absolute', left: 16, right: 16, bottom, maxHeight }}>
      <GlassCard padding={0} style={{ maxHeight }}>
        <BoundedScroll maxHeight={maxHeight} contentStyle={{ padding: 16, gap: 12 }}>
          <AppText size={18} weight="extrabold">
            {t('updates.ready')}
          </AppText>
          <AppText>{t('updates.readyBody')}</AppText>
          <PrimaryButton label={t('updates.restart')} onPress={() => void restart()} />
          <PrimaryButton tone="glass" label={t('updates.later')} onPress={dismiss} />
        </BoundedScroll>
      </GlassCard>
    </View>
  );
}
