import { BlurView } from 'expo-blur';
import { type ReactNode } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import Animated, { FadeIn, SlideInDown } from 'react-native-reanimated';

import { haptic } from '@/lib/haptics';
import { useTheme } from '@/theme/ThemeProvider';
import { fonts, radius, space } from '@/theme/tokens';

export function AppText({
  children,
  size = 15,
  weight = 'regular',
  color,
  style,
  numberOfLines,
}: {
  children: ReactNode;
  size?: number;
  weight?: keyof typeof fonts;
  color?: string;
  style?: StyleProp<TextStyle>;
  numberOfLines?: number;
}) {
  const { colors } = useTheme();
  return (
    <Text
      numberOfLines={numberOfLines}
      style={[
        {
          color: color ?? colors.text,
          fontSize: size,
          lineHeight: Math.round(size * 1.35),
          fontFamily: fonts[weight],
        },
        style,
      ]}
    >
      {children}
    </Text>
  );
}

export function GlassCard({
  children,
  style,
  onPress,
  padding = space.lg,
}: {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  onPress?: () => void;
  padding?: number;
}) {
  const { colors, scheme } = useTheme();
  const inner = (
    <BlurView
      intensity={scheme === 'dark' ? 36 : 28}
      tint={scheme === 'dark' ? 'dark' : 'light'}
      blurMethod="dimezisBlurViewSdk31Plus"
      style={[
        styles.card,
        {
          backgroundColor: colors.glass,
          borderColor: colors.glassBorder,
          padding,
        },
        style,
      ]}
    >
      {children}
    </BlurView>
  );
  if (!onPress) return inner;
  return (
    <Pressable
      onPress={() => {
        haptic('select');
        onPress();
      }}
    >
      {inner}
    </Pressable>
  );
}

export function PrimaryButton({
  label,
  onPress,
  disabled,
  loading,
  tone = 'solid',
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  loading?: boolean;
  tone?: 'solid' | 'glass';
}) {
  const { colors } = useTheme();
  const solid = tone === 'solid';
  return (
    <Pressable
      disabled={disabled || loading}
      onPress={() => {
        haptic('medium');
        onPress();
      }}
      style={({ pressed }) => [
        styles.button,
        {
          backgroundColor: solid ? colors.primary : colors.glassStrong,
          borderColor: solid ? 'transparent' : colors.glassBorder,
          opacity: disabled ? 0.5 : pressed ? 0.9 : 1,
          transform: [{ scale: pressed ? 0.985 : 1 }],
        },
      ]}
    >
      {loading ? (
        <ActivityIndicator color={solid ? colors.onPrimary : colors.primary} />
      ) : (
        <AppText weight="bold" size={16} color={solid ? colors.onPrimary : colors.text}>
          {label}
        </AppText>
      )}
    </Pressable>
  );
}

export function Field({
  label,
  value,
  onChangeText,
  placeholder,
  secureTextEntry,
  multiline,
  autoCapitalize = 'none',
}: {
  label?: string;
  value: string;
  onChangeText: (value: string) => void;
  placeholder?: string;
  secureTextEntry?: boolean;
  multiline?: boolean;
  autoCapitalize?: 'none' | 'words' | 'sentences';
}) {
  const { colors } = useTheme();
  return (
    <View style={{ gap: 6 }}>
      {label ? (
        <AppText size={13} weight="semibold" color={colors.muted}>
          {label}
        </AppText>
      ) : null}
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.soft}
        secureTextEntry={secureTextEntry}
        multiline={multiline}
        autoCapitalize={autoCapitalize}
        autoCorrect={false}
        style={[
          styles.field,
          {
            color: colors.text,
            backgroundColor: colors.field,
            borderColor: colors.glassBorder,
            minHeight: multiline ? 96 : 52,
            textAlignVertical: multiline ? 'top' : 'center',
            fontFamily: fonts.medium,
          },
        ]}
      />
    </View>
  );
}

export function Chip({
  label,
  active,
  onPress,
}: {
  label: string;
  active?: boolean;
  onPress: () => void;
}) {
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={() => {
        haptic('select');
        onPress();
      }}
      style={[
        styles.chip,
        {
          backgroundColor: active ? colors.primary : colors.glassStrong,
          borderColor: active ? 'transparent' : colors.glassBorder,
          minHeight: 40,
          justifyContent: 'center',
        },
      ]}
    >
      <AppText size={13} weight="semibold" color={active ? colors.onPrimary : colors.text}>
        {label}
      </AppText>
    </Pressable>
  );
}

export function EmptyState({ title, body }: { title: string; body: string }) {
  const { colors } = useTheme();
  return (
    <GlassCard style={{ alignItems: 'center', gap: 8 }}>
      <View style={[styles.emptyOrb, { backgroundColor: colors.task.tile }]}>
        <AppText size={22}>✦</AppText>
      </View>
      <AppText size={18} weight="bold" style={{ textAlign: 'center' }}>
        {title}
      </AppText>
      <AppText color={colors.muted} style={{ textAlign: 'center' }}>
        {body}
      </AppText>
    </GlassCard>
  );
}

export function Skeleton({ height = 72 }: { height?: number }) {
  const { colors } = useTheme();
  return (
    <Animated.View entering={FadeIn.duration(300)} style={[styles.skeleton, { height, backgroundColor: colors.glass }]} />
  );
}

export function Sheet({
  visible,
  onClose,
  children,
}: {
  visible: boolean;
  onClose: () => void;
  children: ReactNode;
}) {
  const { colors } = useTheme();
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} />
      <Animated.View entering={SlideInDown.duration(280)} style={styles.sheetWrap}>
        <View style={[styles.handle, { backgroundColor: colors.soft }]} />
        <GlassCard padding={space.xl} style={{ gap: 14 }}>
          {children}
        </GlassCard>
      </Animated.View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: radius.lg,
    borderWidth: 1,
    overflow: 'hidden',
    shadowColor: '#8B7CFF',
    shadowOpacity: 0.12,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 10 },
    elevation: 4,
  },
  button: {
    minHeight: 54,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    paddingHorizontal: 20,
  },
  field: {
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 16,
  },
  chip: {
    borderRadius: radius.pill,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  emptyOrb: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  skeleton: {
    borderRadius: radius.lg,
    opacity: 0.7,
  },
  backdrop: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    backgroundColor: 'rgba(28, 22, 48, 0.28)',
  },
  sheetWrap: {
    position: 'absolute',
    left: 12,
    right: 12,
    bottom: 12,
  },
  handle: {
    alignSelf: 'center',
    width: 42,
    height: 5,
    borderRadius: 99,
    marginBottom: 8,
    opacity: 0.7,
  },
});
