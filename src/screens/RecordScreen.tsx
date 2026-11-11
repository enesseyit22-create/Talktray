import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { ScrollView, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useCapture } from '@/capture/CaptureProvider';
import { Aurora } from '@/components/Aurora';
import { tabBarClearance } from '@/components/GlassTabBar';
import { RecordOrb } from '@/components/RecordOrb';
import { AppText, Field, GlassCard, PrimaryButton } from '@/components/ui/primitives';
import { useApp } from '@/data/AppProvider';
import { useI18n } from '@/i18n';
import { errorText } from '@/lib/errors';
import { formatDuration } from '@/lib/format';
import { consumeAutoRecord } from '@/lib/record-signal';
import { useTheme } from '@/theme/ThemeProvider';
import { shouldPresentPaywall } from '../../shared/parse/quota';

export function RecordScreen() {
  const { t } = useI18n();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const orbSize = Math.min(250, Math.max(168, width - 72));
  const { colors } = useTheme();
  const { usage, recordings, processThought, openSample } = useApp();
  const capture = useCapture();
  const { start } = capture;
  const params = useLocalSearchParams<{ autostart?: string }>();
  const [typed, setTyped] = useState('');
  const [showType, setShowType] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const started = useRef(params.autostart === '1');
  const seen = recordings.filter((recording) => recording.status !== 'failed').length;

  const afterThought = useCallback(
    (result: 'review' | 'quota') => {
      if (result === 'quota') {
        if (shouldPresentPaywall(seen, usage.isPro)) router.push('/paywall');
        else setError(t('errors.quota'));
        return;
      }
      router.push('/review');
    },
    [seen, t, usage.isPro],
  );

  const finish = useCallback(
    async (input: { durationMs: number; transcript?: string }) => {
      setBusy(true);
      setError(null);
      try {
        afterThought(await processThought(input));
      } catch (caught) {
        setError(errorText(caught, t('errors.generic')));
      } finally {
        setBusy(false);
      }
    },
    [afterThought, processThought, t],
  );

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
          {capture.isRecording ? t('record.recording') : t('record.hint')}
        </AppText>
        <View style={{ alignItems: 'center' }}>
          <RecordOrb
            size={orbSize}
            recording={capture.isRecording}
            accessibilityLabel={t('tabs.record')}
            label={capture.isRecording ? formatDuration(capture.durationMillis) : undefined}
            onPress={() => void capture.toggle()}
            onHoldStart={() => void capture.start()}
            onHoldEnd={() => void capture.stopAndSubmit()}
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
        {busy || capture.busy ? <AppText color={colors.muted}>{t('record.processing')}</AppText> : null}
        {error || capture.error ? <AppText color={colors.danger}>{error || capture.error}</AppText> : null}
        <View style={{ width: '100%', gap: 10 }}>
          <AppText weight="semibold">{t('record.samples')}</AppText>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <View style={{ flex: 1, minWidth: 0 }}>
              <PrimaryButton
                tone="glass"
                label={t('record.sampleTr')}
                onPress={() => void openSample('tr').then((result) => afterThought(result))}
              />
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <PrimaryButton
                tone="glass"
                label={t('record.sampleEn')}
                onPress={() => void openSample('en').then((result) => afterThought(result))}
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
