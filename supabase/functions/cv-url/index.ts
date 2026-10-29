// Supabase Edge Function (Deno): short-lived signed CV download links.
// Deploy: npx supabase functions deploy cv-url --no-verify-jwt
import { createClient } from 'npm:@supabase/supabase-js@2.118.0'
import { createCvHandler } from './handler.ts'

const env = (key: string) => Deno.env.get(key)
const admin = createClient(env('SUPABASE_URL')!, env('SUPABASE_SERVICE_ROLE_KEY') ?? env('SUPABASE_SECRET_KEY')!, {
  auth: { persistSession: false, autoRefreshToken: false },
})

Deno.serve(
  createCvHandler({
    env,
    getCvState: async () => {
      const [settings, priv] = await Promise.all([
        admin.from('site_settings').select('cv_published').eq('id', 1).maybeSingle(),
        admin.from('private_settings').select('cv_path, cv_file_name').eq('id', 1).maybeSingle(),
      ])
      return {
        published: settings.data?.cv_published === true,
        path: priv.data?.cv_path ?? null,
        fileName: priv.data?.cv_file_name ?? null,
      }
    },
    signUrl: async (path, expiresIn, downloadName) => {
      const { data, error } = await admin.storage.from('cv').createSignedUrl(path, expiresIn, { download: downloadName })
      if (error) console.error('[cv-url] signing failed', error.message)
      return data?.signedUrl ?? null
    },
  }),
)
