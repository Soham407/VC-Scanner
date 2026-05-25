import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';

import { SUPABASE_ANON_KEY, SUPABASE_URL } from '@env';
import { resolveSupabaseConfig } from './supabaseConfig';

const { anonKey: supabaseAnonKey, url: supabaseUrl } = resolveSupabaseConfig({
  anonKeyCandidates: [
    process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY,
    process.env.SUPABASE_ANON_KEY,
    SUPABASE_ANON_KEY
  ],
  urlCandidates: [
    process.env.EXPO_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_URL,
    SUPABASE_URL
  ]
});

export { getRequiredConfigValue } from './supabaseConfig';

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    autoRefreshToken: true,
    detectSessionInUrl: false,
    persistSession: true,
    storage: AsyncStorage
  }
});
