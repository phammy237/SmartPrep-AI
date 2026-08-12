import 'react-native-url-polyfill/auto';

import { createClient } from '@supabase/supabase-js';
import { AppState } from 'react-native';

import { Database } from '@/types/database.types';
import { env } from './env';
import { largeSecureStore } from './secureStorageAdapter';

export const supabase = createClient<Database>(env.EXPO_PUBLIC_SUPABASE_URL, env.EXPO_PUBLIC_SUPABASE_ANON_KEY, {
  auth: {
    storage: largeSecureStore,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});

/**
 * Supabase's auto token-refresh timer keeps running in the background even
 * when the app isn't in the foreground, which wastes battery and can race
 * with the OS suspending the app. Tie it to foreground/background state, per
 * Supabase's Expo guide.
 */
AppState.addEventListener('change', (state) => {
  if (state === 'active') {
    supabase.auth.startAutoRefresh();
  } else {
    supabase.auth.stopAutoRefresh();
  }
});
