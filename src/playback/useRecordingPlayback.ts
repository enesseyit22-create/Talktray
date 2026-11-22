import { useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import { router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';

import { useCapture } from '@/capture/CaptureProvider';
import { useApp } from '@/data/AppProvider';
import type { Recording } from '@/domain/types';
import { atEnd } from '@/lib/playback-end';
import { supabase } from '@/lib/supabase';

/** Signed links to the private bucket last an hour; one play never needs longer. */
const LINK_SECONDS = 60 * 60;

/**
 * One shared player for a list of recordings. Pro only: free accounts are sent to the paywall.
 * Playback stops when a new recording starts, so the player is never captured by the mic.
 */
export function useRecordingPlayback() {
  const { usage, mode } = useApp();
  const capture = useCapture();
  const player = useAudioPlayer(null);
  const status = useAudioPlayerStatus(player);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [failedId, setFailedId] = useState<string | null>(null);

  // Effects only touch the player. "Playing" is read from the player status, so no state is set here.
  useEffect(() => {
    if (capture.isRecording) player.pause();
  }, [capture.isRecording, player]);

  // At the end, only stop. Seeking back here would restart playback on iOS (the player keeps its
  // rate after the item ends), which then ends again and loops forever. Rewinding happens on the next tap.
  useEffect(() => {
    if (status.didJustFinish) player.pause();
  }, [player, status.didJustFinish]);

  const toggle = useCallback(
    async (recording: Recording) => {
      if (!usage.isPro) {
        router.push('/paywall');
        return;
      }
      if (activeId === recording.id) {
        if (status.playing) {
          player.pause();
          return;
        }
        if (atEnd(status)) await player.seekTo(0).catch(() => undefined);
        player.play();
        return;
      }
      if (!recording.storagePath || mode !== 'supabase') return;
      setFailedId(null);
      setLoadingId(recording.id);
      try {
        const { data, error } = await supabase.storage
          .from('recordings')
          .createSignedUrl(recording.storagePath, LINK_SECONDS);
        if (error || !data?.signedUrl) throw error ?? new Error('NO_URL');
        player.replace({ uri: data.signedUrl });
        player.play();
        setActiveId(recording.id);
      } catch {
        setFailedId(recording.id);
      } finally {
        setLoadingId(null);
      }
    },
    [activeId, mode, player, status, usage.isPro],
  );

  return {
    toggle,
    isPlaying: (id: string) => activeId === id && status.playing,
    isLoading: (id: string) => loadingId === id,
    hasFailed: (id: string) => failedId === id,
    progress: (id: string) =>
      activeId === id && status.duration > 0 && !atEnd(status) ? status.currentTime / status.duration : 0,
  };
}
