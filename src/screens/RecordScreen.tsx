import {
  AudioModule,
  RecordingPresets,
  setAudioModeAsync,
  useAudioRecorder,
  useAudioRecorderState,
} from 'expo-audio';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ScrollView, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Aurora } from '@/components/Aurora';
import { tabBarClearance } from '@/components/GlassTabBar';
import { RecordOrb } from '@/components/RecordOrb';
import { AppText, Field, GlassCard, PrimaryButton } from '@/components/ui/primitives';
import { useApp } from '@/data/AppProvider';
import { useI18n } from '@/i18n';
import { errorText } from '@/lib/errors';
import { loadFreeLimits } from '@/lib/free-limits';
import { formatDuration } from '@/lib/format';
import { consumeAutoRecord } from '@/lib/record-signal';
import { useTheme } from '@/theme/ThemeProvider';

export function RecordScreen() {
  const { t } = useI18n();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const orbSize = Math.min(250, Math.max(168, width - 72));
  const { colors } = useTheme();
  const { usage, processThought, openSample } = useApp();
  const params = useLocalSearchParams<{ autostart?: string }>();
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const state = useAudioRecorderState(recorder, 200);
  const [typed, setTyped] = useState('');
  const [showType, setShowType] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const started = useRef(params.autostart === '1');
  const [maxSeconds, setMaxSeconds] = useState<number | null>(null);
  const capping = useRef(false);

  const finish = useCallback(
    async (input: { audioUri?: string | null; durationMs: number; transcript?: string }) => {
      setBusy(true);
      setError(null);
      try {
        const result = await processThought(input);
        if (result === 'quota') router.push('/paywall');
        else router.push('/review');
      } catch (caught) {
        setError(errorText(caught, t('errors.generic')));
      } finally {
        setBusy(false);
      }
    },
    [processThought, t],
  );

  const start = useCallback(async () => {
    if (state.isRecording || busy) return;
    const permission = await AudioModule.requestRecordingPermissionsAsync();
    if (!permission.granted) {
      setError(t('record.permission'));
      setShowType(true);
      return;
    }
    await setAudioModeAsync({ playsInSilentMode: true, allowsRecording: true });
    await recorder.prepareToRecordAsync();
    recorder.record();
  }, [busy, recorder, state.isRecording, t]);

  const stop = useCallback(async () => {
    if (!state.isRecording) return;
    await recorder.stop();
    await finish({ audioUri: recorder.uri, durationMs: state.durationMillis });
  }, [finish, recorder, state.durationMillis, state.isRecording]);

  useFocusEffect(
    useCallback(() => {
      if (usage.isPro) {
        setMaxSeconds(null);
        return;
      }
      let active = true;
      void loadFreeLimits().then((limits) => {
        if (active) setMaxSeconds(limits.free_max_seconds_per_recording);
      });
      return () => {
        active = false;
      };
    }, [usage.isPro]),
  );

  useEffect(() => {
    if (!state.isRecording || maxSeconds == null || capping.current) return;
    if (state.durationMillis < maxSeconds * 1000) return;
    capping.current = true;
    const timer = setTimeout(() => {
      void stop().finally(() => {
        capping.current = false;
      });
    }, 0);
    return () => clearTimeout(timer);
  }, [maxSeconds, state.durationMillis, state.isRecording, stop]);

  useFocusEffect(
    useCallback(() => {
      if (started.current || consumeAutoRecord()) {
        started.current = false;
        void start();
      }
    }, [start]),
  );

  return (
    <Aurora>
      <ScrollView
        style={{ flex: 1 }}
        keyboardShouldPersistTaps="handled"
        automaticallyAdjustKeyboardInsets
        contentContainerStyle={{
          padding: 24,
          paddingTop: Math.max(insets.top, 16) + 12,
          paddingBottom: tabBarClearance(insets.bottom),
          gap: 18,
        }}
      >
        <AppText size={32} weight="extrabold" style={{ textAlign: 'center' }}>
          {t('record.title')}
        </AppText>
        <AppText color={colors.muted} style={{ textAlign: 'center' }}>
          {state.isRecording ? t('record.recording') : t('record.hint')}
        </AppText>
        <View style={{ alignItems: 'center' }}>
          <RecordOrb
            size={orbSize}
            recording={state.isRecording}
            label={state.isRecording ? formatDuration(state.durationMillis) : undefined}
            onPress={() => void (state.isRecording ? stop() : start())}
            onHoldStart={() => void start()}
            onHoldEnd={() => void stop()}
          />
        </View>
        <GlassCard>
          <AppText weight="semibold" color={colors.primary}>
            {usage.isPro
              ? t('record.unlimited', { limit: usage.limit })
              : usage.limit > 100_000
                ? t('record.hint')
                : t('record.remaining', { count: usage.count, limit: usage.limit })}
          </AppText>
        </GlassCard>
        {busy ? <AppText color={colors.muted}>{t('record.processing')}</AppText> : null}
        {error ? <AppText color={colors.danger}>{error}</AppText> : null}
        <View style={{ width: '100%', gap: 10 }}>
          <AppText weight="semibold">{t('record.samples')}</AppText>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <View style={{ flex: 1, minWidth: 0 }}>
              <PrimaryButton
                tone="glass"
                label={t('record.sampleTr')}
                onPress={() => void openSample('tr').then((result) => router.push(result === 'quota' ? '/paywall' : '/review'))}
              />
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <PrimaryButton
                tone="glass"
                label={t('record.sampleEn')}
                onPress={() => void openSample('en').then((result) => router.push(result === 'quota' ? '/paywall' : '/review'))}
              />
            </View>
          </View>
          <PrimaryButton tone="glass" label={t('record.typeInstead')} onPress={() => setShowType((value) => !value)} />
          {showType ? (
            <View style={{ gap: 10 }}>
              <Field
                value={typed}
                onChangeText={setTyped}
                placeholder={t('record.placeholder')}
                multiline
                autoCapitalize="sentences"
              />
              <PrimaryButton
                label={t('record.parse')}
                onPress={() => void finish({ durationMs: 0, transcript: typed || undefined })}
                disabled={!typed.trim()}
              />
            </View>
          ) : null}
        </View>
        <AppText size={12} color={colors.soft}>
          {t('record.mix')}
        </AppText>
      </ScrollView>
    </Aurora>
  );
}
