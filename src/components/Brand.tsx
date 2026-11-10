import { Image, View } from 'react-native';

import mark from '../../assets/images/icon.png';
import { AppText } from '@/components/ui/primitives';
import { useTheme } from '@/theme/ThemeProvider';

export function Logo({ light = false }: { light?: boolean }) {
  const { colors } = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
      <Image source={mark} style={{ width: 32, height: 32, borderRadius: 9 }} />
      <AppText weight="bold" size={18} color={light ? '#FFFFFF' : colors.text}>
        Talktray
      </AppText>
    </View>
  );
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
      <AppText weight="bold" size={13} color={colors.primary}>
        Talktray
      </AppText>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <View
          style={{
            width: 54,
            height: 54,
            borderRadius: 27,
            backgroundColor: scheme === 'dark' ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.85)',
            alignItems: 'center',
            justifyContent: 'center',
            borderWidth: 1,
            borderColor: colors.glassBorder,
          }}
        >
          <Image source={mark} style={{ width: 54, height: 54, borderRadius: 16 }} />
        </View>
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
