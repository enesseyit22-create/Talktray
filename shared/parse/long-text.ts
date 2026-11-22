/** One note from a long voice or typed draft. Paragraphs stay whole; tasks are not split out. */

const FILLER = /^(?:(?:um+|uh+|er+|ı+|i+|e+|şey|yani|like|you know)\b[,\s]*)+/i;

export function wordCount(text: string): number {
  const words = text.trim().split(/\s+/).filter(Boolean);
  return words.length;
}

export function cleanLongText(raw: string): { title: string; body: string } {
  const collapsed = raw.replace(/\s+/g, ' ').replace(FILLER, '').trim();
  if (!collapsed) return { title: '', body: '' };
  const sentences = collapsed.split(/(?<=[.!?…])\s+/).map((part) => part.trim()).filter(Boolean);
  const paragraphs: string[] = [];
  let bucket: string[] = [];
  let size = 0;
  for (const sentence of sentences.length ? sentences : [collapsed]) {
    bucket.push(sentence);
    size += sentence.length;
    if (size >= 320) {
      paragraphs.push(bucket.join(' '));
      bucket = [];
      size = 0;
    }
  }
  if (bucket.length) paragraphs.push(bucket.join(' '));
  const body = paragraphs.join('\n\n');
  const first = (paragraphs[0] ?? collapsed).split(/[.!?…]/)[0]?.trim() || collapsed;
  const title = first.length > 72 ? `${first.slice(0, 71).trim()}…` : first;
  return { title, body };
}
