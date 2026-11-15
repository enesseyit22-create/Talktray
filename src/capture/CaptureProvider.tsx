import {
  AudioModule,
  RecordingPresets,
  setAudioModeAsync,
  setIsAudioActiveAsync,
  useAudioRecorder,
  useAudioRecorderState,
} from 'expo-audio';
import { router } from 'expo-router';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';

import { useApp } from '@/data/AppProvider';
import { useI18n } from '@/i18n';
import { errorText } from '@/lib/errors';
import { loadFreeLimits, type FreeLimits } from '@/lib/free-limits';
import { RECORDINGS_BEFORE_PAYWALL, shouldPresentPaywall } from '../../shared/parse/quota';

type CaptureValue = {
  isRecording: boolean;
  durationMillis: number;
  busy: boolean;
  error: string | null;
  start: () => Promise<void>;
  stopAndSubmit: () => Promise<void>;
  toggle: () => Promise<void>;
};

const CaptureContext = createContext<CaptureValue | null>(null);

/** Taps shorter than this are treated as accidental and never sent or counted. */
const MIN_RECORDING_MS = 1000;

/**
 * Hands the microphone back to the system after a take. Without this the iOS audio
 * session stays in record mode, the orange microphone indicator stays on, and the
 * next take can start against a half-open session.
 */
async function releaseMicrophone() {
  await setAudioModeAsync({ playsInSilentMode: true, allowsRecording: false }).catch(() => undefined);
  await setIsAudioActiveAsync(false).catch(() => undefined);
}

export function CaptureProvider({ children }: { children: ReactNode }) {
  const { t } = useI18n();
  const { usage, recordings, processThought } = useApp();
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const state = useAudioRecorderState(recorder, 200);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [limits, setLimits] = useState<FreeLimits | null>(null);
  const session = useRef<'idle' | 'starting' | 'live' | 'stopping'>('idle');
  const stopAfterStart = useRef(false);
  const capping = useRef(false);

  const completedEver = recordings.filter((recording) => recording.status !== 'failed').length;
  const maxSeconds =
    usage.isPro || completedEver < RECORDINGS_BEFORE_PAYWALL ? null : limits?.free_max_seconds_per_recording ?? null;

  useEffect(() => {
    if (usage.isPro) return;
    let active = true;
    void loadFreeLimits().then((next) => {
      if (active) setLimits(next);
    });
    return () => {
      active = false;
    };
  }, [usage.isPro]);

  const finish = useCallback(
    async (durationMs: number) => {
      const result = await processThought({ audioUri: recorder.uri, durationMs });
      const seen = recordings.filter((recording) => recording.status !== 'failed').length;
      if (result === 'quota') {
        if (shouldPresentPaywall(seen, usage.isPro)) router.push('/paywall');
        else setError(t(usage.isPro ? 'errors.quotaPro' : 'errors.quota'));
        return;
      }
      router.push('/review');
    },
    [processThought, recorder, recordings, t, usage.isPro],
  );

  const stopAndSubmit = useCallback(async () => {
    if (session.current === 'starting') {
      stopAfterStart.current = true;
      return;
    }
    if (session.current !== 'live') return;
    session.current = 'stopping';
    setBusy(true);
    setError(null);
    const durationMs = state.durationMillis;
    try {
      await recorder.stop();
      await releaseMicrophone();
      if (durationMs < MIN_RECORDING_MS) {
        setError(t('record.tooShort'));
        return;
      }
      await finish(durationMs);
    } catch (caught) {
      setError(errorText(caught, t('errors.generic')));
    } finally {
      session.current = 'idle';
      setBusy(false);
    }
  }, [finish, recorder, state.durationMillis, t]);

  const start = useCallback(async () => {
    if (session.current !== 'idle' || busy) return;
    stopAfterStart.current = false;
    session.current = 'starting';
    setError(null);
    try {
      const permission = await AudioModule.requestRecordingPermissionsAsync();
      if (!permission.granted) {
        session.current = 'idle';
        setError(t('record.permission'));
        return;
      }
      await setAudioModeAsync({ playsInSilentMode: true, allowsRecording: true });
      if (session.current !== 'starting') {
        await releaseMicrophone();
        return;
      }
      // Passing the preset makes a fresh file for every take instead of reusing the last one.
      await recorder.prepareToRecordAsync(RecordingPresets.HIGH_QUALITY);
      if (stopAfterStart.current || session.current !== 'starting') {
        session.current = 'idle';
        await releaseMicrophone();
        return;
      }
      recorder.record();
      session.current = 'live';
      if (stopAfterStart.current) await stopAndSubmit();
    } catch (caught) {
      session.current = 'idle';
      await releaseMicrophone();
      setError(errorText(caught, t('errors.generic')));
    }
  }, [busy, recorder, stopAndSubmit, t]);

  const toggle = useCallback(async () => {
    if (session.current === 'live' || state.isRecording) await stopAndSubmit();
    else await start();
  }, [start, state.isRecording, stopAndSubmit]);

  useEffect(() => {
    if (session.current !== 'live' || maxSeconds == null || capping.current) return;
    if (state.durationMillis < maxSeconds * 1000) return;
    capping.current = true;
    const timer = setTimeout(() => {
      void stopAndSubmit().finally(() => {
        capping.current = false;
      });
    }, 0);
    return () => clearTimeout(timer);
  }, [maxSeconds, state.durationMillis, stopAndSubmit]);

  const value = useMemo<CaptureValue>(
    () => ({
      isRecording: state.isRecording,
      durationMillis: state.durationMillis,
      busy,
      error,
      start,
      stopAndSubmit,
      toggle,
    }),
    [busy, error, start, state.durationMillis, state.isRecording, stopAndSubmit, toggle],
  );

  return <CaptureContext.Provider value={value}>{children}</CaptureContext.Provider>;
}

export function useCapture() {
  const value = useContext(CaptureContext);
  if (!value) throw new Error('useCapture must be used within CaptureProvider');
  return value;
}
