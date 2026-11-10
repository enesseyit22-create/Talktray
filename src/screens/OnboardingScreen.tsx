import { useRef, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Aurora } from '@/components/Aurora';
import { Logo, WelcomeMark } from '@/components/Brand';
import { AppText, GlassCard, PrimaryButton } from '@/components/ui/primitives';
import { useApp } from '@/data/AppProvider';
import { useI18n } from '@/i18n';
import { useTheme } from '@/theme/ThemeProvider';

const SLIDES = ['s1', 's2', 's3'] as const;

export function OnboardingScreen() {
  const { t } = useI18n();
  const { colors } = useTheme();
  const { finishOnboarding } = useApp();
  const insets = useSafeAreaInsets();
  const [index, setIndex] = useState(0);
  const last = index === SLIDES.length - 1;
  const busy = useRef(false);

  const next = async () => {
    if (!last) {
      setIndex((value) => value + 1);
      return;
    }
    if (busy.current) return;
    busy.current = true;
    try {
      await finishOnboarding();
      router.replace('/sign-in');
    } finally {
      busy.current = false;
    }
  };

  return (
    <Aurora>
      <ScrollView
        contentContainerStyle={{
          flexGrow: 1,
          padding: 24,
          paddingTop: Math.max(insets.top, 16) + 8,
          paddingBottom: Math.max(insets.bottom, 16),
          justifyContent: 'space-between',
          gap: 24,
        }}
      >
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          {index === 0 ? <View /> : <Logo />}
          <Pressable
            hitSlop={8}
            style={{ minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' }}
            onPress={async () => {
              await finishOnboarding();
              router.replace('/sign-in');
            }}
          >
            <AppText weight="semibold" color={colors.muted}>
              {t('skip')}
            </AppText>
          </Pressable>
        </View>
        <View style={{ alignItems: 'center', gap: 28 }}>
          {index === 0 ? <WelcomeMark /> : null}
          {index === 1 ? (
            <View style={{ width: '100%', gap: 10 }}>
              {(['task', 'reminder', 'note'] as const).map((type) => (
                <GlassCard key={type}>
                  <AppText weight="bold">{t(`types.${type}`)}</AppText>
                </GlassCard>
              ))}
            </View>
          ) : null}
          {index === 2 ? (
            <GlassCard style={{ width: '100%', gap: 8 }}>
              <AppText weight="bold">{t('comingUp')}</AppText>
              <AppText color={colors.muted}>{t('greet.subtitle')}</AppText>
            </GlassCard>
          ) : null}
          <View style={{ gap: 8, alignItems: 'center' }}>
            <AppText size={32} weight="extrabold" style={{ textAlign: 'center' }}>
              {t(`onboarding.${SLIDES[index]}Title`)}
            </AppText>
            <AppText color={colors.muted} style={{ textAlign: 'center' }}>
              {t(`onboarding.${SLIDES[index]}Body`)}
            </AppText>
          </View>
        </View>
        <View style={{ gap: 16 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 8 }}>
            {SLIDES.map((slide, slideIndex) => (
              <View
                key={slide}
                style={{
                  width: slideIndex === index ? 22 : 8,
                  height: 8,
                  borderRadius: 99,
                  backgroundColor: slideIndex === index ? colors.primary : colors.soft,
                }}
              />
            ))}
          </View>
          <PrimaryButton label={last ? t('onboarding.start') : t('onboarding.next')} onPress={() => void next()} />
        </View>
      </ScrollView>
    </Aurora>
  );
}
