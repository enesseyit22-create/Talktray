/** The take is still on the phone (and on the server, once it was uploaded). */
export class RecordingKeptError extends Error {
  readonly recordingId: string | null;
  constructor(message: string, recordingId: string | null) {
    super(message);
    this.name = 'RecordingKeptError';
    this.recordingId = recordingId;
  }
}

export function processErrorKey(code: string): 'errors.transcription' | 'errors.analysis' | 'errors.process' {
  if (code === 'MISSING_PROVIDER_KEY' || code === 'AUDIO_NOT_FOUND' || code.startsWith('STT_')) return 'errors.transcription';
  if (code === 'MISSING_LLM_KEY' || code.startsWith('LLM_')) return 'errors.analysis';
  return 'errors.process';
}

export function errorText(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message.trim()) return error.message.trim();
  if (error && typeof error === 'object' && 'message' in error) {
    const message = (error as { message: unknown }).message;
    if (typeof message === 'string' && message.trim()) return message.trim();
  }
  return fallback;
}
