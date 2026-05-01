import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';

import { SUPABASE_ANON_KEY, SUPABASE_URL } from '@env';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    autoRefreshToken: true,
    detectSessionInUrl: false,
    persistSession: true,
    storage: AsyncStorage
  }
});

let bootstrapPromise: Promise<void> | null = null;

export function bootstrapAnonymousSession(): Promise<void> {
  if (bootstrapPromise) {
    return bootstrapPromise;
  }

  bootstrapPromise = (async () => {
    const { data, error } = await supabase.auth.getSession();

    if (error) {
      throw error;
    }

    if (data.session) {
      return;
    }

    const { error: signInError } = await supabase.auth.signInAnonymously();

    if (signInError) {
      throw signInError;
    }
  })().finally(() => {
    bootstrapPromise = null;
  });

  return bootstrapPromise;
}
