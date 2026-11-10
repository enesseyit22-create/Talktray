import type { ItemType, ParsedItem } from '../../shared/parse/types';

export type Profile = {
  displayName: string;
  timezone: string;
  locale: 'en' | 'tr';
  theme: 'system' | 'light' | 'dark';
  exportToCalendar: boolean;
  notificationsEnabled: boolean;
};

export type InboxItem = ParsedItem & {
  id: string;
  recordingId: string | null;
  completedAt: string | null;
  calendarEventId: string | null;
  notificationId: string | null;
  createdAt: string;
  updatedAt: string;
};

export type Recording = {
  id: string;
  transcript: string;
  language: string | null;
  durationMs: number;
  status: 'processing' | 'ready' | 'failed';
  createdAt: string;
};

export type Usage = {
  period: string;
  count: number;
  limit: number;
  isPro: boolean;
};

export type DraftItem = ParsedItem & { localId: string };

export type Draft = {
  recordingId: string;
  transcript: string;
  language: string | null;
  durationMs: number;
  items: DraftItem[];
  mocked: boolean;
  audioUri: string | null;
};

export type SessionUser = {
  id: string;
  email: string;
};

export type ItemTypeName = ItemType;
