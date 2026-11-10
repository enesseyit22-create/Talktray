import { createClient } from '@supabase/supabase-js';

import { authStorage } from '@/lib/auth-storage';
import { supabaseAnonKey, supabaseUrl } from '@/lib/config';

export const supabase = createClient(
  supabaseUrl || 'https://placeholder.supabase.co',
  supabaseAnonKey || 'public-anon-key-placeholder',
  {
    auth: {
      storage: authStorage,
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
    },
  },
);
