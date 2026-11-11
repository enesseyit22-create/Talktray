import { AudioLines, Mic } from 'lucide-react-native';
import { useEffect, useRef } from 'react';
import { Image, Pressable, StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';

import { AppText } from '@/components/ui/primitives';
import { useTheme } from '@/theme/ThemeProvider';
import mark from '../../assets/brand/logo-1024.png';

export function RecordOrb({
  size = 188,
  recording = false,
  label,
  variant = 'mic',
  accessibilityLabel = 'Record',
  onPress,
  onHoldStart,
  onHoldEnd,
}: {
  size?: number;
  recording?: boolean;
  label?: string;
  variant?: 'mic' | 'logo';
  accessibilityLabel?: string;
  onPress?: () => void;
  onHoldStart?: () => void;
  onHoldEnd?: () => void;
}) {
  const { colors, scheme } = useTheme();
  const pulse = useSharedValue(0);
  const holdTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const held = useRef(false);

  useEffect(() => {
    pulse.value = recording
      ? withRepeat(withTiming(1, { duration: 1400, easing: Easing.out(Easing.quad) }), -1, false)
      : withTiming(0, { duration: 240 });
  }, [pulse, recording]);

  const ring = useAnimatedStyle(() => ({
    transform: [{ scale: 1 + pulse.value * 0.16 }],
    opacity: recording ? 0.55 * (1 - pulse.value) : 0.35,
  }));
  const ringTwo = useAnimatedStyle(() => ({
    transform: [{ scale: 1 + pulse.value * 0.28 }],
    opacity: recording ? 0.28 * (1 - pulse.value) : 0.18,
  }));

  return (
    <View pointerEvents="box-none" style={{ alignItems: 'center', gap: 10 }}>
      <View pointerEvents="box-none" style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
        <Animated.View
          pointerEvents="none"
          style={[
            styles.ring,
            ringTwo,
            { width: size, height: size, borderColor: scheme === 'dark' ? 'rgba(196,181,253,0.35)' : 'rgba(255,255,255,0.7)' },
          ]}
        />
        <Animated.View
          pointerEvents="none"
          style={[
            styles.ring,
            ring,
            {
              width: size * 0.82,
              height: size * 0.82,
              borderColor: scheme === 'dark' ? 'rgba(255,255,255,0.2)' : 'rgba(255,255,255,0.9)',
            },
          ]}
        />
        <Pressable
          onPressIn={() => {
            held.current = false;
            holdTimer.current = setTimeout(() => {
              held.current = true;
              onHoldStart?.();
            }, 280);
          }}
          onPressOut={() => {
            if (holdTimer.current) clearTimeout(holdTimer.current);
            if (held.current) onHoldEnd?.();
          }}
          accessibilityRole="button"
          accessibilityLabel={accessibilityLabel}
          accessibilityState={{ selected: recording }}
          testID="record-orb"
          onPress={() => {
            if (held.current) {
              held.current = false;
              return;
            }
            onPress?.();
          }}
          style={[
            styles.core,
            {
              width: size * (variant === 'logo' ? 0.78 : 0.62),
              height: size * (variant === 'logo' ? 0.78 : 0.62),
              backgroundColor: scheme === 'dark' ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.78)',
              borderColor: scheme === 'dark' ? 'rgba(255,255,255,0.2)' : 'rgba(255,255,255,0.95)',
              shadowColor: colors.shadow,
            },
          ]}
        >
          {variant === 'logo' ? (
            <Image
              source={mark}
              accessibilityIgnoresInvertColors
              style={{ width: size * 0.5, height: size * 0.5 }}
              resizeMode="contain"
            />
          ) : (
            <>
              <Mic color={colors.primary} size={size * 0.22} strokeWidth={2.2} />
              {recording ? <Bars /> : <AudioLines color={colors.primary} size={18} strokeWidth={2.4} />}
            </>
          )}
        </Pressable>
      </View>
      {label ? (
        <AppText weight="semibold" color={colors.muted}>
          {label}
        </AppText>
      ) : null}
    </View>
  );
}

function Bars() {
  const { colors } = useTheme();
  const t = useSharedValue(0);
  useEffect(() => {
    t.value = withRepeat(withTiming(1, { duration: 900, easing: Easing.linear }), -1, false);
  }, [t]);
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 3, height: 16 }}>
      {[0, 1, 2, 3, 4].map((index) => (
        <Bar key={index} index={index} progress={t} color={colors.primary} />
      ))}
    </View>
  );
}

function Bar({
  index,
  progress,
  color,
}: {
  index: number;
  progress: { value: number };
  color: string;
}) {
  const style = useAnimatedStyle(() => {
    const phase = (progress.value + index * 0.16) % 1;
    const height = 4 + Math.abs(Math.sin(phase * Math.PI)) * 12;
    return { height };
  });
  return <Animated.View style={[{ width: 3, borderRadius: 99, backgroundColor: color }, style]} />;
}

const styles = StyleSheet.create({
  ring: {
    position: 'absolute',
    borderRadius: 999,
    borderWidth: 1,
    backgroundColor: 'rgba(255,255,255,0.18)',
  },
  core: {
    borderRadius: 999,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    shadowOpacity: 0.18,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 12 },
    elevation: 8,
  },
});
