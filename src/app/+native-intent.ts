import { isRecordLink } from '../../shared/parse/links';

export function redirectSystemPath({ path }: { path: string; initial: boolean }) {
  if (isRecordLink(path)) {
    return '/record?autostart=1';
  }
  return path;
}
