import {
  AudioModule,
  AudioQuality,
  IOSOutputFormat,
  setAudioModeAsync,
  useAudioRecorder,
  useAudioRecorderState,
} from 'expo-audio';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Platform, Pressable, ScrollView, Share, StatusBar, TextInput } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { speechRecordingCore, SPEECH_SAMPLE_RATE } from '@/capture/speech-recording';
import { Aurora } from '@/components/Aurora';
import { AppText, PrimaryButton } from '@/components/ui/primitives';
import { useApp } from '@/data/AppProvider';
import { useI18n } from '@/i18n';
import { recordingClock } from '@/lib/format';
import { sheetTopInset } from '@/lib/layout';
import { useTheme } from '@/theme/ThemeProvider';
import { cleanLongText, wordCount } from '../../shared/parse/long-text';
import { PRO_MAX_SECONDS_PER_RECORDING } from '../../shared/parse/quota';

const SPEECH = {
  ...speechRecordingCore(),
  ios: {
    outputFormat: IOSOutputFormat.MPEG4AAC,
    audioQuality: AudioQuality.LOW,
    sampleRate: SPEECH_SAMPLE_RATE,
    linearPCMBitDepth: 16,
    linearPCMIsBigEndian: false,
    linearPCMIsFloat: false,
  },
};

export function WriteScreen() {
  const { t } = useI18n();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ id?: string }>();
  const itemId = Array.isArray(params.id) ? params.id[0] : params.id;
  const app = useApp();
  const existing = itemId ? app.items.find((item) => item.id === itemId) : null;
  const [title, setTitle] = useState(existing?.title ?? '');
  const [body, setBody] = useState(existing?.notes ?? '');
  const [recordingId, setRecordingId] = useState<string | null>(existing?.recordingId ?? null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const recorder = useAudioRecorder(SPEECH);
  const state = useAudioRecorderState(recorder, 250);
  const maxSeconds = app.usage.isPro ? PRO_MAX_SECONDS_PER_RECORDING : null;

  const stopAndAppend = async () => {
    const durationMs = state.durationMillis;
    setBusy(true);
    setError(null);
    try {
      await recorder.stop();
      await setAudioModeAsync({ playsInSilentMode: true, allowsRecording: false }).catch(() => undefined);
      if (durationMs < 1000) {
        setError(t('record.tooShort'));
        return;
      }
      const result = await app.captureLongText({ audioUri: recorder.uri, durationMs });
      if (result === 'quota') {
        router.push('/paywall');
        return;
      }
      const cleaned = cleanLongText(result.text);
      setBody((current) => (current.trim() ? `${current.trim()}\n\n${cleaned.body}` : cleaned.body));
      if (!title.trim()) setTitle(cleaned.title);
      if (result.recordingId) setRecordingId(result.recordingId);
    } catch {
      setError(t('errors.transcription'));
    } finally {
      setBusy(false);
    }
  };

  const toggleRecord = async () => {
    if (state.isRecording) {
      await stopAndAppend();
      return;
    }
    setError(null);
    const permission = await AudioModule.requestRecordingPermissionsAsync();
    if (!permission.granted) {
      setError(t('record.permission'));
      return;
    }
    await setAudioModeAsync({ playsInSilentMode: true, allowsRecording: true });
    await recorder.prepareToRecordAsync(SPEECH);
    recorder.record();
  };

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      if (existing) {
        await app.updateItem(existing.id, { title: title.trim(), notes: body.trim() });
        router.back();
        return;
      }
      const result = await app.saveLongDocument({ title, body, recordingId });
      if (result === 'quota') {
        router.push('/paywall');
        return;
      }
      router.back();
    } catch {
      setError(t('errors.saveFailed'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Aurora>
      <ScrollView
        keyboardShouldPersistTaps="handled"
        automaticallyAdjustKeyboardInsets
        contentContainerStyle={{
          padding: 20,
          paddingTop: sheetTopInset(insets.top, Platform.OS === 'android' ? StatusBar.currentHeight ?? 0 : 0, Platform.OS) + 8,
          paddingBottom: Math.max(insets.bottom, 16) + 24,
          gap: 12,
        }}
      >
        <Pressable onPress={() => router.back()} hitSlop={8} style={{ minHeight: 44, justifyContent: 'center' }}>
          <AppText color={colors.muted}>{t('close')}</AppText>
        </Pressable>
        <AppText size={28} weight="extrabold">
          {t('write.title')}
        </AppText>
        <AppText color={colors.muted}>{t('write.hint')}</AppText>
        <TextInput
          value={title}
          onChangeText={setTitle}
          placeholder={t('write.titlePlaceholder')}
          placeholderTextColor={colors.soft}
          style={{ color: colors.text, fontSize: 22, fontWeight: '700', minHeight: 44 }}
        />
        <TextInput
          value={body}
          onChangeText={setBody}
          placeholder={t('write.bodyPlaceholder')}
          placeholderTextColor={colors.soft}
          multiline
          textAlignVertical="top"
          style={{
            color: colors.text,
            fontSize: 18,
            lineHeight: 28,
            minHeight: 280,
          }}
        />
        <AppText size={13} color={colors.muted}>
          {t('write.words', { count: wordCount(`${title} ${body}`) })}
        </AppText>
        {error ? <AppText color={colors.danger}>{error}</AppText> : null}
        <PrimaryButton
          tone="glass"
          label={state.isRecording ? recordingClock(state.durationMillis, maxSeconds) : t('write.append')}
          onPress={() => void toggleRecord()}
          loading={busy && !state.isRecording}
        />
        <PrimaryButton
          tone="glass"
          label={t('write.share')}
          onPress={() => void Share.share({ message: `${title}\n\n${body}`.trim() })}
          disabled={!body.trim()}
        />
        <PrimaryButton label={t('write.save')} onPress={() => void save()} loading={busy} disabled={!title.trim() || !body.trim()} />
      </ScrollView>
    </Aurora>
  );
}
