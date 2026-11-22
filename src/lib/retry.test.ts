import { describe, expect, it } from 'vitest';

import { isRetryableProcessCode, isRetryableStatus, retryAsync, retryDelayMs } from './retry';

describe('retry', () => {
  it('retries timeouts and server errors only', () => {
    expect(isRetryableStatus(429)).toBe(true);
    expect(isRetryableStatus(500)).toBe(true);
    expect(isRetryableStatus(503)).toBe(true);
    expect(isRetryableStatus(400)).toBe(false);
    expect(isRetryableStatus(401)).toBe(false);
  });

  it('does not retry quota or a missing recording', () => {
    expect(isRetryableProcessCode('')).toBe(true);
    expect(isRetryableProcessCode('STT_503')).toBe(true);
    expect(isRetryableProcessCode('LLM_429')).toBe(true);
    expect(isRetryableProcessCode('quota_exceeded')).toBe(false);
    expect(isRetryableProcessCode('RECORDING_NOT_FOUND')).toBe(false);
  });

  it('backs off and returns the first success', async () => {
    expect(retryDelayMs(0)).toBe(350);
    expect(retryDelayMs(1)).toBe(700);
    let calls = 0;
    const value = await retryAsync(async () => {
      calls += 1;
      if (calls < 2) throw new Error('again');
      return 'ok';
    }, 3);
    expect(value).toBe('ok');
    expect(calls).toBe(2);
  });
});
