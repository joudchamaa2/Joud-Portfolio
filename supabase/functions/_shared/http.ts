/** Small HTTP helpers shared by the Edge Functions (runtime-agnostic). */

export type Env = (key: string) => string | undefined

export function corsHeaders(req: Request, env: Env): Record<string, string> {
  const origin = req.headers.get('origin') ?? ''
  const allowed = (env('ALLOWED_ORIGINS') ?? '')
    .split(',')
    .map((o) => o.trim().replace(/\/+$/, ''))
    .filter(Boolean)
  // With no allow-list configured the endpoints answer any origin. They are
  // public and unauthenticated either way; abuse is limited by validation,
  // rate limiting and the optional captcha, not by CORS.
  const allowOrigin = allowed.length === 0 ? '*' : allowed.includes(origin) ? origin : ''
  const headers: Record<string, string> = {
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  }
  if (allowOrigin) headers['Access-Control-Allow-Origin'] = allowOrigin
  return headers
}

export function isOriginAllowed(req: Request, env: Env): boolean {
  const origin = req.headers.get('origin')
  if (!origin) return true // non-browser clients; protected by other controls
  return Boolean(corsHeaders(req, env)['Access-Control-Allow-Origin'])
}

export function json(body: unknown, status: number, headers: Record<string, string>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...headers, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  })
}

export function clientIp(req: Request): string | null {
  const forwarded = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
  return forwarded || req.headers.get('cf-connecting-ip') || req.headers.get('x-real-ip') || null
}

export async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input))
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('')
}
