/**
 * Issues a short-lived signed download URL for the CV — only when CV
 * publication is enabled. The CV bucket itself stays private.
 */
import { corsHeaders, isOriginAllowed, json, type Env } from '../_shared/http.ts'

export const CV_URL_TTL_SECONDS = 60

export type CvDeps = {
  env: Env
  getCvState: () => Promise<{ published: boolean; path: string | null; fileName: string | null }>
  signUrl: (path: string, expiresIn: number, downloadName: string) => Promise<string | null>
}

export function createCvHandler(deps: CvDeps) {
  return async function handle(req: Request): Promise<Response> {
    const cors = corsHeaders(req, deps.env)
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors })
    if (req.method !== 'POST' && req.method !== 'GET') return json({ error: 'method_not_allowed', message: 'Method not allowed.' }, 405, cors)
    if (!isOriginAllowed(req, deps.env)) return json({ error: 'forbidden', message: 'Origin not allowed.' }, 403, cors)

    const state = await deps.getCvState()
    if (!state.published || !state.path) {
      return json({ error: 'not_available', message: 'The CV is not available right now.' }, 404, cors)
    }
    const url = await deps.signUrl(state.path, CV_URL_TTL_SECONDS, state.fileName ?? 'CV.pdf')
    if (!url) return json({ error: 'server_error', message: 'The CV could not be retrieved.' }, 500, cors)
    return json({ url }, 200, cors)
  }
}
