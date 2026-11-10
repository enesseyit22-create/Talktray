import { BlurTargetView } from 'expo-blur';
import { type ReactNode, useRef } from 'react';
import { StyleSheet, View, type View as RNView } from 'react-native';

import { useTheme } from '@/theme/ThemeProvider';

export function Aurora({ children }: { children: ReactNode }) {
  const { colors } = useTheme();
  const target = useRef<RNView>(null);
  return (
    <View style={[styles.root, { backgroundColor: colors.bg }]}>
      <BlurTargetView ref={target} pointerEvents="none" style={StyleSheet.absoluteFill}>
        <View style={[styles.blob, styles.one, { backgroundColor: colors.blobs[0] }]} />
        <View style={[styles.blob, styles.two, { backgroundColor: colors.blobs[1] }]} />
        <View style={[styles.blob, styles.three, { backgroundColor: colors.blobs[2] }]} />
        <View style={[styles.blob, styles.four, { backgroundColor: colors.blobs[3] }]} />
        <View style={[styles.blob, styles.five, { backgroundColor: colors.blobs[4] }]} />
      </BlurTargetView>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  blob: { position: 'absolute', borderRadius: 999 },
  one: { width: 280, height: 280, top: -60, left: -80, opacity: 0.95 },
  two: { width: 240, height: 240, top: 40, right: -70, opacity: 0.9 },
  three: { width: 220, height: 220, top: 280, left: -40, opacity: 0.75 },
  four: { width: 260, height: 260, bottom: 40, right: -50, opacity: 0.8 },
  five: { width: 180, height: 180, bottom: 180, left: 80, opacity: 0.7 },
});
