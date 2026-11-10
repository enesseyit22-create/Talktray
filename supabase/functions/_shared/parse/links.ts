/** True when an external URL should open Talktray directly into recording. */
export function isRecordLink(url: string | null | undefined): boolean {
  if (!url) return false;
  const value = url.trim();
  if (/^talktray:\/\/record\b/i.test(value)) return true;
  try {
    const parsed = new URL(value);
    const host = parsed.hostname.toLowerCase();
    const path = parsed.pathname.replace(/\/+$/, '').toLowerCase();
    if (host === 'record') return true;
    if (host === 'talktray.app' || host.endsWith('.talktray.app')) {
      return path === '/record' || path.endsWith('/record');
    }
    return false;
  } catch {
    return false;
  }
}
