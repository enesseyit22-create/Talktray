/**
 * Speech settings for expo-audio. JS only — the installed recorder already
 * accepts these fields. Mono 16 kHz AAC at 32 kbps.
 *
 * HIGH_QUALITY is stereo 44.1 kHz at 128 kbps (~960 KB per minute).
 * This is about 240 KB per minute, which is what Whisper resamples to anyway.
 * Android stays on AAC in an m4a container. The LOW_QUALITY preset is 3gp AMR,
 * which the transcription endpoint rejects.
 */
export const HIGH_QUALITY_BIT_RATE = 128_000;
export const SPEECH_BIT_RATE = 32_000;
export const SPEECH_SAMPLE_RATE = 16_000;
export const SPEECH_CHANNELS = 1;

export function speechBytesPerMinute(bitRate: number): number {
  return (bitRate / 8) * 60;
}

export function speechRecordingCore() {
  return {
    extension: '.m4a' as const,
    sampleRate: SPEECH_SAMPLE_RATE,
    numberOfChannels: SPEECH_CHANNELS,
    bitRate: SPEECH_BIT_RATE,
    android: {
      outputFormat: 'mpeg4' as const,
      audioEncoder: 'aac' as const,
      sampleRate: SPEECH_SAMPLE_RATE,
    },
    web: {
      mimeType: 'audio/webm' as const,
      bitsPerSecond: SPEECH_BIT_RATE,
    },
  };
}
