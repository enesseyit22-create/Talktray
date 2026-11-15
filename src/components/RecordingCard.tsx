import { Lock, Pause, Play, Trash2 } from 'lucide-react-native';
import { ActivityIndicator, Pressable, View } from 'react-native';

import { AppText, GlassCard } from '@/components/ui/primitives';
import type { Recording } from '@/domain/types';
import { useI18n } from '@/i18n';
import { formatClock, formatDuration } from '@/lib/format';
import type { useRecordingPlayback } from '@/playback/useRecordingPlayback';
import { useTheme } from '@/theme/ThemeProvider';

export function RecordingCard({
  recording,
  timeZone,
  playback,
  isPro,
  onLongPress,
  onDelete,
  lines = 2,
}: {
  recording: Recording;
  timeZone: string;
  playback: ReturnType<typeof useRecordingPlayback>;
  isPro: boolean;
  onLongPress?: () => void;
  onDelete?: () => void;
  lines?: number;
}) {
  const { t, locale } = useI18n();
  const { colors } = useTheme();
  const canPlay = Boolean(recording.storagePath);
  const playing = playback.isPlaying(recording.id);
  const loading = playback.isLoading(recording.id);
  const progress = playback.progress(recording.id);
  const label = !isPro ? t('history.playPro') : playing ? t('history.pause') : t('history.play');

  return (
    <GlassCard onLongPress={onLongPress}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        {canPlay ? (
          <Pressable
            onPress={() => void playback.toggle(recording)}
            accessibilityRole="button"
            accessibilityLabel={label}
            hitSlop={6}
            style={{
              width: 44,
              height: 44,
              borderRadius: 22,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: isPro ? colors.primary : colors.glassStrong,
              borderWidth: isPro ? 0 : 1,
              borderColor: colors.glassBorder,
            }}
          >
            {loading ? (
              <ActivityIndicator color={isPro ? '#fff' : colors.primary} />
            ) : !isPro ? (
              <Lock color={colors.primary} size={18} />
            ) : playing ? (
              <Pause color="#fff" size={18} fill="#fff" />
            ) : (
              <Play color="#fff" size={18} fill="#fff" style={{ marginLeft: 2 }} />
            )}
          </Pressable>
        ) : null}
        <View style={{ flex: 1, minWidth: 0, gap: 4 }}>
          <AppText weight="semibold" numberOfLines={lines}>
            {recording.transcript || t('history.untitled')}
          </AppText>
          <AppText size={12} color={colors.muted}>
            {formatClock(recording.createdAt, timeZone, locale)} · {formatDuration(recording.durationMs)}
          </AppText>
          {playback.hasFailed(recording.id) ? (
            <AppText size={12} color={colors.danger}>
              {t('history.playFailed')}
            </AppText>
          ) : null}
        </View>
        {onDelete ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('delete')}
            hitSlop={8}
            onPress={onDelete}
            style={{ minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' }}
          >
            <Trash2 color={colors.danger} size={18} />
          </Pressable>
        ) : null}
      </View>
      {progress > 0 ? (
        <View style={{ height: 3, borderRadius: 2, marginTop: 10, backgroundColor: colors.glassBorder, overflow: 'hidden' }}>
          <View style={{ width: `${Math.min(100, progress * 100)}%`, height: '100%', backgroundColor: colors.primary }} />
        </View>
      ) : null}
    </GlassCard>
  );
}
