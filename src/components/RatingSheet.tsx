import { Linking, Platform } from 'react-native';

import { AppText, PrimaryButton, Sheet } from '@/components/ui/primitives';
import { useApp } from '@/data/AppProvider';
import { useI18n } from '@/i18n';
import { ANDROID_MARKET_URL, ANDROID_REVIEW_WEB, IOS_REVIEW_URL } from '@/lib/rating';
import { useTheme } from '@/theme/ThemeProvider';

async function openStoreReview(): Promise<void> {
  if (Platform.OS === 'ios') {
    await Linking.openURL(IOS_REVIEW_URL);
    return;
  }
  if (Platform.OS === 'android') {
    const opened = await Linking.openURL(ANDROID_MARKET_URL).then(() => true).catch(() => false);
    if (!opened) await Linking.openURL(ANDROID_REVIEW_WEB);
  }
}

/** In-app sheet. expo-store-review is not in this binary, so the store page opens with Linking. */
export function RatingSheet() {
  const { t } = useI18n();
  const { colors } = useTheme();
  const { askRating, dismissRating } = useApp();
  return (
    <Sheet visible={askRating} onClose={dismissRating}>
      <AppText size={22} weight="extrabold">
        {t('rating.title')}
      </AppText>
      <AppText color={colors.muted}>{t('rating.body')}</AppText>
      <PrimaryButton
        label={t('rating.rate')}
        onPress={() => {
          void openStoreReview().finally(dismissRating);
        }}
      />
      <PrimaryButton tone="glass" label={t('rating.later')} onPress={dismissRating} />
    </Sheet>
  );
}
