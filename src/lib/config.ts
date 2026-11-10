const url = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
const key = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';

export const supabaseUrl = url;
export const supabaseAnonKey = key;

export const isSupabaseConfigured =
  url.startsWith('https://') &&
  !url.includes('YOUR_PROJECT') &&
  key.length > 20 &&
  !key.includes('YOUR_');

export const APP_GROUP = 'group.com.talktray.app';
export const RECORD_URL = 'talktray://record';
