import { describe, expect, it } from 'vitest';

import { HIGH_QUALITY_BIT_RATE, SPEECH_BIT_RATE, SPEECH_CHANNELS, speechBytesPerMinute, speechRecordingCore } from './speech-recording';

describe('speech recording', () => {
  it('is mono AAC in an m4a file and much smaller than the high preset', () => {
    const options = speechRecordingCore();
    expect(options.extension).toBe('.m4a');
    expect(options.numberOfChannels).toBe(SPEECH_CHANNELS);
    expect(options.bitRate).toBe(SPEECH_BIT_RATE);
    expect(options.android.audioEncoder).toBe('aac');
    expect(options.android.outputFormat).toBe('mpeg4');
    expect(options.android.outputFormat).not.toBe('3gp');
    const before = speechBytesPerMinute(HIGH_QUALITY_BIT_RATE);
    const after = speechBytesPerMinute(SPEECH_BIT_RATE);
    expect(after).toBe(240_000);
    expect(before / after).toBe(4);
  });
});
