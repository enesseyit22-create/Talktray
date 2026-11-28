import {
  AudioModule,
  AudioQuality,
  IOSOutputFormat,
  RecordingPresets,
  setAudioModeAsync,
  setIsAudioActiveAsync,
  useAudioRecorder,
  useAudioRecorderState,
} from 'expo-audio';
import { router } from 'expo-router';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';

import { speechRecordingCore } from '@/capture/speech-recording';
import { useApp } from '@/data/AppProvider';
import { useI18n } from '@/i18n';
import { errorText, RecordingKeptError } from '@/lib/errors';
import { loadFreeLimits, type FreeLimits } from '@/lib/free-limits';
import { PRO_MAX_SECONDS_PER_RECORDING, RECORDINGS_BEFORE_PAYWALL, shouldPresentPaywall } from '../../shared/parse/quota';

type PendingTake = {
  uri: string;
  durationMs: number;
  recordingId: string | null;
};

type CaptureValue = {
  isRecording: boolean;
  durationMillis: number;
  /** Longest allowed take in seconds for this account, or null for no limit. */
  maxSeconds: number | null;
  busy: boolean;
  error: string | null;
  /** A take that failed after stop. Retry sends the same file again. */
  pending: PendingTake | null;
  start: () => Promise<void>;
  stopAndSubmit: () => Promise<void>;
  retryPending: () => Promise<void>;
  toggle: () => Promise<void>;
};

const SPEECH_OPTIONS = {
  ...speechRecordingCore(),
  ios: {
    outputFormat: IOSOutputFormat.MPEG4AAC,
    audioQuality: AudioQuality.LOW,
    sampleRate: 16000,
    linearPCMBitDepth: 16,
    linearPCMIsBigEndian: false,
    linearPCMIsFloat: false,
  },
};

const CaptureContext = createContext<CaptureValue | null>(null);

/** Stops a recorder left prepared or running by an earlier take. A no-op when it is idle. */
async function discardStaleTake(recorder: { getStatus: () => { canRecord: boolean; isRecording: boolean }; stop: () => Promise<void> }) {
  let stale = false;
  try {
    const status = recorder.getStatus();
    stale = status.canRecord || status.isRecording;
  } catch {
    stale = true;
  }
  if (stale) await recorder.stop().catch(() => undefined);
}

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
  const recorder = useAudioRecorder(SPEECH_OPTIONS);
  const state = useAudioRecorderState(recorder, 200);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<PendingTake | null>(null);
  const [limits, setLimits] = useState<FreeLimits | null>(null);
  const session = useRef<'idle' | 'starting' | 'live' | 'stopping'>('idle');
  const stopAfterStart = useRef(false);
  const capping = useRef(false);

  const completedEver = recordings.filter((recording) => recording.status !== 'failed').length;
  const maxSeconds = usage.isPro
    ? PRO_MAX_SECONDS_PER_RECORDING
    : completedEver < RECORDINGS_BEFORE_PAYWALL
      ? null
      : limits?.free_max_seconds_per_recording ?? null;

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
    async (durationMs: number, recordingId: string | null = null) => {
      const uri = recorder.uri;
      try {
        const result = await processThought({ audioUri: uri, durationMs, recordingId });
        setPending(null);
        if (result === 'commands') return;
        const seen = recordings.filter((recording) => recording.status !== 'failed').length;
        if (result === 'quota') {
          if (shouldPresentPaywall(seen, usage.isPro)) router.push('/paywall');
          else setError(t(usage.isPro ? 'errors.quotaPro' : 'errors.quota'));
          return;
        }
        router.push('/review');
      } catch (caught) {
        const keptId = caught instanceof RecordingKeptError ? caught.recordingId : recordingId;
        if (uri) setPending({ uri, durationMs, recordingId: keptId });
        setError(t('record.failedKept'));
      }
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
      // A take that was prepared but never stopped (a very short hold, an error mid-start) leaves
      // Android's recorder "already prepared", and the next prepare is rejected. Clear it first.
      await discardStaleTake(recorder);
      // Passing the preset makes a fresh file for every take instead of reusing the last one.
      try {
        await recorder.prepareToRecordAsync(SPEECH_OPTIONS);
      } catch {
        await recorder.stop().catch(() => undefined);
        try {
          await recorder.prepareToRecordAsync(SPEECH_OPTIONS);
        } catch {
          // Some devices reject 16 kHz, or the recorder was left prepared. The high preset still records.
          await recorder.prepareToRecordAsync(RecordingPresets.HIGH_QUALITY);
        }
      }
      if (stopAfterStart.current || session.current !== 'starting') {
        session.current = 'idle';
        await recorder.stop().catch(() => undefined);
        await releaseMicrophone();
        return;
      }
      recorder.record();
      session.current = 'live';
      setPending(null);
      if (stopAfterStart.current) await stopAndSubmit();
    } catch (caught) {
      session.current = 'idle';
      await recorder.stop().catch(() => undefined);
      await releaseMicrophone();
      setError(errorText(caught, t('errors.generic')));
    }
  }, [busy, recorder, stopAndSubmit, t]);

  const retryPending = useCallback(async () => {
    if (!pending || busy) return;
    setBusy(true);
    setError(null);
    try {
      const result = await processThought({
        audioUri: pending.uri,
        durationMs: pending.durationMs,
        recordingId: pending.recordingId,
      });
      setPending(null);
      if (result === 'commands') return;
      const seen = recordings.filter((recording) => recording.status !== 'failed').length;
      if (result === 'quota') {
        if (shouldPresentPaywall(seen, usage.isPro)) router.push('/paywall');
        else setError(t(usage.isPro ? 'errors.quotaPro' : 'errors.quota'));
        return;
      }
      router.push('/review');
    } catch (caught) {
      const keptId = caught instanceof RecordingKeptError ? caught.recordingId : pending.recordingId;
      setPending({ ...pending, recordingId: keptId });
      setError(t('record.failedKept'));
    } finally {
      setBusy(false);
    }
  }, [busy, pending, processThought, recordings, t, usage.isPro]);

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
      maxSeconds,
      busy,
      error,
      pending,
      start,
      stopAndSubmit,
      retryPending,
      toggle,
    }),
    [busy, error, maxSeconds, pending, retryPending, start, state.durationMillis, state.isRecording, stopAndSubmit, toggle],
  );

  return <CaptureContext.Provider value={value}>{children}</CaptureContext.Provider>;
}

export function useCapture() {
  const value = useContext(CaptureContext);
  if (!value) throw new Error('useCapture must be used within CaptureProvider');
  return value;
}
