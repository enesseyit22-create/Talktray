/** Short pauses between attempts. Attempt 0 waits 350ms. */
export function retryDelayMs(attempt: number): number {
  return 350 * (attempt + 1);
}

export function isRetryableStatus(status: number): boolean {
  return status === 408 || status === 429 || status >= 500;
}

/** Empty and provider failures can be tried again. Quota and auth cannot. */
export function isRetryableProcessCode(code: string): boolean {
  if (!code) return true;
  if (code === 'QUOTA_EXCEEDED' || code === 'quota_exceeded') return false;
  if (code === 'UNAUTHENTICATED' || code === 'RECORDING_REQUIRED' || code === 'RECORDING_NOT_FOUND') return false;
  if (code === 'ALREADY_PROCESSED') return false;
  return true;
}

export async function retryAsync<T>(fn: () => Promise<T>, attempts = 3): Promise<T> {
  let last: unknown;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      return await fn();
    } catch (error) {
      last = error;
      if (attempt === attempts - 1) break;
      await new Promise((resolve) => setTimeout(resolve, retryDelayMs(attempt)));
    }
  }
  throw last;
}
