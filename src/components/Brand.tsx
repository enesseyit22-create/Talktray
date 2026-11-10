import { useEffect, useState } from 'react';
import { AccessibilityInfo, Image, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withDelay, withSpring, withTiming } from 'react-native-reanimated';

import mark from '../../assets/brand/logo-1024.png';
import { AppText } from '@/components/ui/primitives';
import { useTheme } from '@/theme/ThemeProvider';
import { fonts } from '@/theme/tokens';

const LETTERS = [
  { char: 'T', tray: false, color: '' },
  { char: 'a', tray: false, color: '' },
  { char: 'l', tray: false, color: '' },
  { char: 'k', tray: false, color: '' },
  { char: 'T', tray: true, color: '#8B7CFF' },
  { char: 'r', tray: true, color: '#6E8EF2' },
  { char: 'a', tray: true, color: '#52C4E0' },
  { char: 'y', tray: true, color: '#3EE0C5' },
] as const;

let welcomePlayed = false;

function takeWelcomeAnimation() {
  if (welcomePlayed) return false;
  welcomePlayed = true;
  return true;
}

function useReduceMotion() {
  const [reduce, setReduce] = useState(false);
  useEffect(() => {
    let active = true;
    const apply = (value: boolean) => {
      if (active) setReduce(value);
    };
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', apply);
    AccessibilityInfo.isReduceMotionEnabled().then(apply).catch(() => undefined);
    return () => {
      active = false;
      sub.remove();
    };
  }, []);
  return reduce;
}

function Ripple({ size, play, delay }: { size: number; play: boolean; delay: number }) {
  const scale = useSharedValue(play ? 0.7 : 1);
  const opacity = useSharedValue(play ? 0.42 : 0);
  useEffect(() => {
    if (!play) return;
    scale.value = withDelay(delay, withTiming(1.42, { duration: 880 }));
    opacity.value = withDelay(delay, withTiming(0, { duration: 880 }));
  }, [delay, opacity, play, scale]);
  const style = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ scale: scale.value }],
  }));
  return (
    <Animated.View
      pointerEvents="none"
      style={[
        {
          position: 'absolute',
          width: size,
          height: size,
          borderRadius: size / 2,
          borderWidth: Math.max(1.5, size * 0.02),
          borderColor: 'rgba(139,124,255,0.55)',
        },
        style,
      ]}
    />
  );
}

function Mark({ size, play }: { size: number; play: boolean }) {
  const reduce = useReduceMotion();
  const motion = play && !reduce;
  const scale = useSharedValue(motion ? 0.84 : 1);
  const opacity = useSharedValue(motion ? 0 : 1);
  useEffect(() => {
    if (!motion) {
      scale.value = 1;
      opacity.value = 1;
      return;
    }
    opacity.value = withTiming(1, { duration: 420 });
    scale.value = withSpring(1, { damping: 12, stiffness: 150, mass: 0.65 });
  }, [motion, opacity, scale]);
  const style = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ scale: scale.value }],
  }));
  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      {motion ? (
        <>
          <Ripple size={size * 0.92} play delay={40} />
          <Ripple size={size * 0.92} play delay={220} />
        </>
      ) : null}
      <Animated.View style={style}>
        <Image source={mark} style={{ width: size, height: size }} resizeMode="contain" accessibilityIgnoresInvertColors />
      </Animated.View>
    </View>
  );
}

function Letter({
  char,
  color,
  index,
  size,
  play,
}: {
  char: string;
  color: string;
  index: number;
  size: number;
  play: boolean;
}) {
  const opacity = useSharedValue(play ? 0 : 1);
  const shift = useSharedValue(play ? 10 : 0);
  useEffect(() => {
    if (!play) {
      opacity.value = 1;
      shift.value = 0;
      return;
    }
    const delay = 520 + index * 55;
    opacity.value = withDelay(delay, withTiming(1, { duration: 280 }));
    shift.value = withDelay(delay, withTiming(0, { duration: 280 }));
  }, [index, opacity, play, shift]);
  const style = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateY: shift.value }],
  }));
  return (
    <Animated.Text
      style={[
        {
          fontFamily: fonts.wordmark,
          fontSize: size,
          lineHeight: Math.round(size * 1.15),
          color,
          marginRight: index === LETTERS.length - 1 ? 0 : -size * 0.04,
        },
        style,
      ]}
    >
      {char}
    </Animated.Text>
  );
}

function Wordmark({ size, play }: { size: number; play: boolean }) {
  const { colors } = useTheme();
  const reduce = useReduceMotion();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-end' }}>
      {LETTERS.map((letter, index) => (
        <Letter
          key={`${letter.char}-${index}`}
          char={letter.char}
          color={letter.tray ? letter.color : colors.text}
          index={index}
          size={size}
          play={play && !reduce}
        />
      ))}
    </View>
  );
}

export function Logo({
  size = 28,
  animated = false,
  layout = 'row',
}: {
  size?: number;
  animated?: boolean;
  layout?: 'row' | 'stack';
}) {
  const [play] = useState(() => (animated ? takeWelcomeAnimation() : false));
  const wordSize = layout === 'stack' ? Math.round(size * 0.34) : Math.round(size * 0.64);
  return (
    <View
      accessibilityRole="header"
      accessibilityLabel="TalkTray"
      style={
        layout === 'stack'
          ? { alignItems: 'center', gap: Math.round(size * 0.08) }
          : { flexDirection: 'row', alignItems: 'center', gap: 8 }
      }
    >
      <Mark size={size} play={play} />
      <Wordmark size={wordSize} play={play} />
    </View>
  );
}

export function WelcomeMark() {
  return <Logo size={120} animated layout="stack" />;
}

export function WidgetPreview({ count, label }: { count: number; label: string }) {
  const { colors, scheme } = useTheme();
  return (
    <View
      style={{
        height: 148,
        borderRadius: 28,
        padding: 16,
        backgroundColor: scheme === 'dark' ? '#221C3E' : '#F4EEFF',
        borderWidth: 1,
        borderColor: colors.glassBorder,
        justifyContent: 'space-between',
        overflow: 'hidden',
      }}
    >
      <View
        style={{
          position: 'absolute',
          width: 90,
          height: 90,
          borderRadius: 45,
          backgroundColor: colors.blobs[1],
          right: -10,
          top: -20,
        }}
      />
      <Wordmark size={16} play={false} />
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <Image source={mark} style={{ width: 54, height: 54 }} resizeMode="contain" />
        <View>
          <AppText weight="extrabold" size={28}>
            {count}
          </AppText>
          <AppText size={13} color={colors.muted}>
            {label}
          </AppText>
        </View>
      </View>
    </View>
  );
}
