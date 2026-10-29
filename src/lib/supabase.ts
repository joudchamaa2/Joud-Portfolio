import { createClient } from '@supabase/supabase-js'
import type { Database } from './database.types'
import { env, isSupabaseConfigured } from './env'

/**
 * Browser Supabase client. Uses only the publishable key; every request is
 * subject to Row Level Security. When configuration is missing the app shows
 * a setup screen instead of making requests (see App.tsx).
 */
export const supabase = createClient<Database>(
  isSupabaseConfigured ? env.supabaseUrl : 'http://localhost:54321',
  isSupabaseConfigured ? env.supabaseKey : 'not-configured',
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: false,
      storageKey: 'jc-portfolio-auth',
    },
  },
)
