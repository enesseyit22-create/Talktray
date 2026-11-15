import type { Repeat } from './repeat';
export const ITEM_TYPES = ['task', 'reminder', 'event', 'shopping', 'note'] as const;

export type ItemType = (typeof ITEM_TYPES)[number];

export type ParsedItem = {
  type: ItemType;
  title: string;
  notes: string | null;
  dueAt: string | null;
  allDay: boolean;
  listName: string | null;
  /** Minutes before dueAt. Null means the profile default. */
  reminderOffsets: number[] | null;
  /** Repeating schedule (Pro). Missing or null means it happens once. */
  repeat?: Repeat | null;
};

export type ExtractContext = {
  now: Date;
  timeZone: string;
  locale?: string;
};

export type ResolvedWhen = {
  date: Date;
  allDay: boolean;
};
