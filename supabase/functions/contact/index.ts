// Supabase Edge Function (Deno): public contact form endpoint.
// Deploy: npx supabase functions deploy contact --no-verify-jwt
import { createClient } from 'npm:@supabase/supabase-js@2.118.0'
import { createContactHandler } from './handler.ts'

declare const EdgeRuntime: { waitUntil(promise: Promise<unknown>): void } | undefined

const env = (key: string) => Deno.env.get(key)
const supabaseUrl = env('SUPABASE_URL')!
const serviceKey = env('SUPABASE_SERVICE_ROLE_KEY') ?? env('SUPABASE_SECRET_KEY')!

// Service-role client: bypasses RLS, so it only ever calls the narrow
// submit_contact_message function and reads the notification address.
const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } })

const handler = createContactHandler({
  env,
  fetch,
  log: (message, detail) => console.error(`[contact] ${message}`, detail ?? ''),
  waitUntil: typeof EdgeRuntime !== 'undefined' ? (p) => EdgeRuntime.waitUntil(p) : undefined,
  insertMessage: async ({ name, email, subject, message, ipHash, userAgent }) => {
    const { error } = await admin.rpc('submit_contact_message', {
      p_name: name,
      p_email: email,
      p_subject: subject,
      p_message: message,
      p_ip_hash: ipHash,
      p_user_agent: userAgent,
    })
    if (!error) return 'ok'
    if (error.message.includes('rate_limited')) return 'rate_limited'
    console.error('[contact] insert failed', error.code)
    return 'error'
  },
  getNotificationEmail: async () => {
    const { data } = await admin.from('private_settings').select('notification_email').eq('id', 1).maybeSingle()
    return data?.notification_email ?? null
  },
})

Deno.serve(handler)
