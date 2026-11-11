import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Linking from 'expo-linking';

import { Aurora } from '@/components/Aurora';
import { Logo } from '@/components/Brand';
import { AppText } from '@/components/ui/primitives';
import { useI18n } from '@/i18n';
import { hasPendingRecord, onAutoRecord } from '@/lib/record-signal';
import { useTheme } from '@/theme/ThemeProvider';
import { isRecordLink } from '../../shared/parse/links';

const HOLD_MS = 2200;
const FADE_MS = 380;

export function WelcomeIntro() {
  const { t } = useI18n();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const opacity = useSharedValue(1);
  const [visible, setVisible] = useState(true);
  const leaving = useRef(false);
  const dismiss = useRef<(immediate: boolean) => void>(() => undefined);

  useEffect(() => {
    let alive = true;
    let fadeTimer: ReturnType<typeof setTimeout> | undefined;
    const finish = (immediate: boolean) => {
      if (!alive || leaving.current) return;
      leaving.current = true;
      if (immediate) {
        setVisible(false);
        return;
      }
      opacity.value = withTiming(0, { duration: FADE_MS });
      fadeTimer = setTimeout(() => {
        if (alive) setVisible(false);
      }, FADE_MS);
    };
    dismiss.current = finish;
    if (hasPendingRecord()) finish(true);
    const stopListen = onAutoRecord(() => finish(true));
    void Linking.getInitialURL().then((url) => {
      if (isRecordLink(url)) finish(true);
    });
    const hold = setTimeout(() => finish(false), HOLD_MS);
    return () => {
      alive = false;
      clearTimeout(hold);
      if (fadeTimer) clearTimeout(fadeTimer);
      stopListen();
    };
  }, [opacity]);

  const animated = useAnimatedStyle(() => ({ opacity: opacity.value }));
  if (!visible) return null;

  return (
    <Animated.View
      accessibilityViewIsModal
      pointerEvents="auto"
      style={[StyleSheet.absoluteFill, { zIndex: 40 }, animated]}
    >
      <Aurora>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('skip')}
          onPress={() => dismiss.current(false)}
          style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 28 }}
        >
          <View pointerEvents="none" style={{ position: 'absolute', top: insets.top + 8, left: 20, right: 20, minHeight: 44, justifyContent: 'center', alignItems: 'flex-end' }}>
            <AppText weight="semibold" color={colors.muted} style={{ textAlign: 'right' }}>
              {t('skip')}
            </AppText>
          </View>
          <Logo size={128} animated layout="stack" />
          <AppText color={colors.muted} style={{ marginTop: 16, textAlign: 'center', alignSelf: 'stretch' }}>
            {t('greet.subtitle')}
          </AppText>
        </Pressable>
      </Aurora>
    </Animated.View>
  );
}
