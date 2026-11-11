import { BlurView } from 'expo-blur';
import { CircleCheck, CircleUser, House, Mic, NotebookPen } from 'lucide-react-native';
import { PixelRatio, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText } from '@/components/ui/primitives';
import { useI18n } from '@/i18n';
import { haptic } from '@/lib/haptics';
import { contentClearance, tabBarBlockHeight } from '@/lib/layout';
import { useTheme } from '@/theme/ThemeProvider';

/** Scroll space that clears the floating bar and the mic button that rises above it. */
export function tabBarClearance(bottomInset: number): number {
  return contentClearance(bottomInset, PixelRatio.getFontScale());
}

const ICONS = {
  home: House,
  tasks: CircleCheck,
  record: Mic,
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
  const barHeight = tabBarBlockHeight(PixelRatio.getFontScale());
  return (
    <View pointerEvents="box-none" style={[styles.wrap, { bottom: Math.max(insets.bottom, 10) }]}>
      <BlurView
        intensity={scheme === 'dark' ? 42 : 30}
        tint={scheme === 'dark' ? 'dark' : 'light'}
        blurMethod="dimezisBlurViewSdk31Plus"
        style={[styles.bar, { height: barHeight, backgroundColor: colors.glassStrong, borderColor: colors.glassBorder }]}
      >
        {state.routes.map((route, index) => {
          const focused = state.index === index;
          const Icon = ICONS[route.name as keyof typeof ICONS] ?? House;
          const label = t(`tabs.${route.name === 'home' ? 'inbox' : route.name}`);
          const onPress = () => {
            haptic('select');
            const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
            if (!focused && !event.defaultPrevented) navigation.navigate(route.name);
          };
          if (route.name === 'record') {
            return (
              <Pressable key={route.key} onPress={onPress} style={styles.slot}>
                <View style={[styles.record, { backgroundColor: colors.primary, borderColor: colors.glassBorder }]}>
                  <Mic color={colors.onPrimary} size={26} strokeWidth={2.4} />
                </View>
                <AppText size={11} weight="semibold" numberOfLines={2} color={focused ? colors.tabActive : colors.tab} style={styles.label}>
                  {label}
                </AppText>
              </Pressable>
            );
          }
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
  record: {
    width: 62,
    height: 62,
    borderRadius: 31,
    marginTop: -28,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
    shadowColor: '#7A6AF0',
    shadowOpacity: 0.35,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 8,
  },
});
