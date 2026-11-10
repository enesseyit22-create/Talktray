import { supabase } from '@/lib/supabase';
import { zonedParts, zonedTimeToUtc } from '../../shared/parse/time';

export type FreeLimits = {
  free_recordings_per_day: number | null;
  free_recordings_per_month: number | null;
  free_max_seconds_per_recording: number | null;
  free_max_items: number | null;
};

/** Matches the seeded row: the only hard-coded free cap today is 25 recordings a month. */
export const DEFAULT_FREE_LIMITS: FreeLimits = {
  free_recordings_per_day: null,
  free_recordings_per_month: 25,
  free_max_seconds_per_recording: null,
  free_max_items: null,
};

function limitOrNull(value: unknown): number | null {
  if (value == null) return null;
  const number = typeof value === 'number' ? value : Number(value);
  if (!Number.isInteger(number) || number < 0) return null;
  return number;
}

export function parseFreeLimits(value: unknown): FreeLimits {
  const record = value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
  return {
    free_recordings_per_day: limitOrNull(record.free_recordings_per_day),
    free_recordings_per_month:
      record.free_recordings_per_month == null && !('free_recordings_per_month' in record)
        ? DEFAULT_FREE_LIMITS.free_recordings_per_month
        : limitOrNull(record.free_recordings_per_month),
    free_max_seconds_per_recording: limitOrNull(record.free_max_seconds_per_recording),
    free_max_items: limitOrNull(record.free_max_items),
  };
}

export function zonedDayStart(now: Date, timeZone: string): Date {
  const parts = zonedParts(now, timeZone);
  return zonedTimeToUtc({ year: parts.year, month: parts.month, day: parts.day, hour: 0, minute: 0 }, timeZone);
}

export function zonedMonthStart(now: Date, timeZone: string): Date {
  const parts = zonedParts(now, timeZone);
  return zonedTimeToUtc({ year: parts.year, month: parts.month, day: 1, hour: 0, minute: 0 }, timeZone);
}

export async function loadFreeLimits(): Promise<FreeLimits> {
  const { data, error } = await supabase.from('app_settings').select('value').eq('key', 'free_limits').maybeSingle();
  if (error || !data) return DEFAULT_FREE_LIMITS;
  return parseFreeLimits(data.value);
}
