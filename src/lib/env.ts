/** Public, build-time configuration. Nothing here is secret. */
export const env = {
  supabaseUrl: import.meta.env.VITE_SUPABASE_URL?.trim() ?? '',
  supabaseKey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim() ?? '',
  siteUrl: (import.meta.env.VITE_SITE_URL?.trim() ?? '').replace(/\/+$/, ''),
  turnstileSiteKey: import.meta.env.VITE_TURNSTILE_SITE_KEY?.trim() ?? '',
}

export const isSupabaseConfigured = Boolean(env.supabaseUrl && env.supabaseKey)
