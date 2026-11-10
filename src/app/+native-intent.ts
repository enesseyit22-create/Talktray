import { isRecordLink } from '../../shared/parse/links';

export function redirectSystemPath({ path }: { path: string; initial: boolean }) {
  if (isRecordLink(path)) {
    return '/record?autostart=1';
  }
  const item = path.match(/(?:^|\/)item\/([0-9a-f-]{8,})/i);
  if (item?.[1]) return `/home?item=${item[1]}`;
  return path;
}
