import {
  AudioModule,
  RecordingPresets,
  setAudioModeAsync,
  useAudioRecorder,
  useAudioRecorderState,
} from 'expo-audio';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { ScrollView, View } from 'react-native';

import { Aurora } from '@/components/Aurora';
import { RecordOrb } from '@/components/RecordOrb';
import { AppText, Field, GlassCard, PrimaryButton } from '@/components/ui/primitives';
import { useApp } from '@/data/AppProvider';
import { useI18n } from '@/i18n';
import { formatDuration } from '@/lib/format';
import { consumeAutoRecord } from '@/lib/record-signal';
import { useTheme } from '@/theme/ThemeProvider';

export function RecordScreen() {
  const { t } = useI18n();
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

  const finish = useCallback(
    async (input: { audioUri?: string | null; durationMs: number; transcript?: string }) => {
      setBusy(true);
      setError(null);
      try {
        const result = await processThought(input);
        if (result === 'quota') router.push('/paywall');
        else router.push('/review');
      } catch {
        setError(t('errors.generic'));
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
      if (started.current || consumeAutoRecord()) {
        started.current = false;
        void start();
      }
    }, [start]),
  );

  return (
    <Aurora>
      <ScrollView contentContainerStyle={{ padding: 24, paddingTop: 72, paddingBottom: 140, alignItems: 'center', gap: 18 }}>
        <AppText size={32} weight="extrabold" style={{ textAlign: 'center' }}>
          {t('record.title')}
        </AppText>
        <AppText color={colors.muted} style={{ textAlign: 'center' }}>
          {state.isRecording ? t('record.recording') : t('record.hint')}
        </AppText>
        <RecordOrb
          size={250}
          recording={state.isRecording}
          label={state.isRecording ? formatDuration(state.durationMillis) : undefined}
          onPress={() => void (state.isRecording ? stop() : start())}
          onHoldStart={() => void start()}
          onHoldEnd={() => void stop()}
        />
        <GlassCard>
          <AppText weight="semibold" color={colors.primary}>
            {usage.isPro
              ? t('record.unlimited', { limit: usage.limit })
              : t('record.remaining', { count: usage.count, limit: usage.limit })}
          </AppText>
        </GlassCard>
        {busy ? <AppText color={colors.muted}>{t('record.processing')}</AppText> : null}
        {error ? <AppText color={colors.danger}>{error}</AppText> : null}
        <View style={{ width: '100%', gap: 10 }}>
          <AppText weight="semibold">{t('record.samples')}</AppText>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <View style={{ flex: 1 }}>
              <PrimaryButton
                tone="glass"
                label={t('record.sampleTr')}
                onPress={() => void openSample('tr').then((result) => router.push(result === 'quota' ? '/paywall' : '/review'))}
              />
            </View>
            <View style={{ flex: 1 }}>
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
