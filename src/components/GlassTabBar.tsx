import { BlurView } from 'expo-blur';
import { CircleCheck, CircleUser, House, NotebookPen } from 'lucide-react-native';
import { PixelRatio, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useCapture } from '@/capture/CaptureProvider';
import { RecordOrb } from '@/components/RecordOrb';
import { AppText } from '@/components/ui/primitives';
import { useI18n } from '@/i18n';
import { formatDuration } from '@/lib/format';
import { haptic } from '@/lib/haptics';
import { contentClearance, tabBarBlockHeight } from '@/lib/layout';
import { useTheme } from '@/theme/ThemeProvider';

const CAPTURE_SIZE = 112;
/** Rise already included by contentClearance for the previous mic button. */
const LEGACY_MIC_RISE = 28;

/** Scroll space that clears the floating bar and the logo button that rises above it. */
export function tabBarClearance(bottomInset: number): number {
  const scaled = contentClearance(bottomInset, PixelRatio.getFontScale());
  return scaled - LEGACY_MIC_RISE + CAPTURE_SIZE / 2;
}

const ICONS = {
  home: House,
  tasks: CircleCheck,
  notes: NotebookPen,
  profile: CircleUser,
} as const;

type TabRoute = { key: string; name: string };

type TabBarProps = {
  state: { index: number; routes: TabRoute[] };
  navigation: {
    emit: (event: { type: 'tabPress'; target: string; canPreventDefault: true }) => { defaultPrevented: boolean };
    navigate: (name: string) => void;
  };
};

export function GlassTabBar({ state, navigation }: TabBarProps) {
  const insets = useSafeAreaInsets();
  const { colors, scheme } = useTheme();
  const { t } = useI18n();
  const capture = useCapture();
  const barHeight = tabBarBlockHeight(PixelRatio.getFontScale());
  const recordRoute = state.routes.find((route) => route.name === 'record');
  const openRecord = () => {
    if (!recordRoute) return;
    haptic('select');
    const event = navigation.emit({ type: 'tabPress', target: recordRoute.key, canPreventDefault: true });
    if (state.routes[state.index]?.name !== 'record' && !event.defaultPrevented) navigation.navigate('record');
  };
  return (
    <View pointerEvents="box-none" style={[styles.wrap, { bottom: Math.max(insets.bottom, 10) }]}>
      {capture.error ? (
        <AppText size={12} color={colors.danger} style={styles.error} numberOfLines={2}>
          {capture.error}
        </AppText>
      ) : null}
      <BlurView
        intensity={scheme === 'dark' ? 42 : 30}
        tint={scheme === 'dark' ? 'dark' : 'light'}
        blurMethod="dimezisBlurViewSdk31Plus"
        style={[styles.bar, { height: barHeight, backgroundColor: colors.glassStrong, borderColor: colors.glassBorder }]}
      >
        {state.routes.map((route, index) => {
          const focused = state.index === index;
          const label = t(`tabs.${route.name === 'home' ? 'inbox' : route.name}`);
          if (route.name === 'record') {
            return (
              <Pressable key={route.key} onPress={openRecord} style={styles.slot} accessibilityRole="button">
                <View style={styles.recordSpacer} />
                <AppText
                  size={11}
                  weight="semibold"
                  numberOfLines={2}
                  color={focused || capture.isRecording ? colors.tabActive : colors.tab}
                  style={styles.label}
                >
                  {capture.isRecording ? formatDuration(capture.durationMillis) : label}
                </AppText>
              </Pressable>
            );
          }
          const Icon = ICONS[route.name as keyof typeof ICONS] ?? House;
          const onPress = () => {
            haptic('select');
            const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
            if (!focused && !event.defaultPrevented) navigation.navigate(route.name);
          };
          return (
            <Pressable key={route.key} onPress={onPress} style={styles.slot}>
              <Icon color={focused ? colors.tabActive : colors.tab} size={22} strokeWidth={focused ? 2.5 : 2.1} />
              <AppText size={11} weight="semibold" numberOfLines={2} color={focused ? colors.tabActive : colors.tab} style={styles.label}>
                {label}
              </AppText>
            </Pressable>
          );
        })}
      </BlurView>
      <View pointerEvents="box-none" style={styles.captureAnchor}>
        <RecordOrb
          size={CAPTURE_SIZE}
          variant="logo"
          recording={capture.isRecording || capture.busy}
          accessibilityLabel={t('quick.title')}
          onPress={() => void capture.toggle()}
          onHoldStart={() => void capture.start()}
          onHoldEnd={() => void capture.stopAndSubmit()}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: 16, right: 16 },
  bar: {
    borderRadius: 32,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingBottom: 8,
    overflow: 'visible',
  },
  slot: { flex: 1, alignItems: 'center', gap: 4, minWidth: 0 },
  label: { textAlign: 'center', alignSelf: 'stretch' },
  recordSpacer: { height: 28 },
  captureAnchor: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: -CAPTURE_SIZE / 2,
    alignItems: 'center',
  },
  error: {
    position: 'absolute',
    top: -CAPTURE_SIZE / 2 - 28,
    left: 24,
    right: 24,
    textAlign: 'center',
  },
});
