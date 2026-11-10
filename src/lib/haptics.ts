import * as Haptics from 'expo-haptics';
import { Platform } from 'react-native';

export function haptic(kind: 'light' | 'medium' | 'success' | 'select' = 'light') {
  if (Platform.OS === 'web') return;
  const run = async () => {
    if (kind === 'success') {
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      return;
    }
    if (kind === 'select') {
      await Haptics.selectionAsync();
      return;
    }
    await Haptics.impactAsync(
      kind === 'medium' ? Haptics.ImpactFeedbackStyle.Medium : Haptics.ImpactFeedbackStyle.Light,
    );
  };
  run().catch(() => undefined);
}
