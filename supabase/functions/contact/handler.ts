/**
 * Contact submission handler. Pure and dependency-injected so it can be unit
 * tested outside Deno; index.ts wires in the real environment.
 *
 * Pipeline: method/origin/size checks -> JSON parse -> honeypot + timing
 * (silently accepted and dropped) -> field validation -> optional Turnstile
 * -> hashed-IP rate limited insert (database function) -> optional email.
 */
import { validateContact, type ContactInput } from '../_shared/contact-validation.ts'
import { clientIp, corsHeaders, isOriginAllowed, json, sha256Hex, type Env } from '../_shared/http.ts'

const MAX_BODY_BYTES = 20_000

export type ContactDeps = {
  env: Env
  /** Inserts via public.submit_contact_message (service role). */
  insertMessage: (input: ContactInput & { ipHash: string | null; userAgent: string | null }) => Promise<'ok' | 'rate_limited' | 'error'>
  getNotificationEmail: () => Promise<string | null>
  fetch: typeof fetch
  waitUntil?: (promise: Promise<unknown>) => void
  log?: (message: string, detail?: unknown) => void
}

async function verifyTurnstile(deps: ContactDeps, secret: string, token: unknown, ip: string | null): Promise<boolean> {
  if (typeof token !== 'string' || token.length === 0 || token.length > 2048) return false
  const form = new FormData()
  form.set('secret', secret)
  form.set('response', token)
  if (ip) form.set('remoteip', ip)
  try {
    const res = await deps.fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', { method: 'POST', body: form })
    const data = (await res.json()) as { success?: boolean }
    return data.success === true
  } catch (error) {
    deps.log?.('turnstile verification failed', error)
    return false
  }
}

async function sendNotification(deps: ContactDeps, input: ContactInput): Promise<void> {
  const apiKey = deps.env('RESEND_API_KEY')
  const from = deps.env('CONTACT_FROM_EMAIL')
  if (!apiKey || !from) return
  const to = (await deps.getNotificationEmail()) ?? deps.env('CONTACT_NOTIFY_EMAIL')
  if (!to) return
  // Plain-text only: visitor content is never interpolated into HTML.
  const text = `New message from your portfolio contact form.\n\nName: ${input.name}\nEmail: ${input.email}\nSubject: ${input.subject}\n\n${input.message}\n`
  const res = await deps.fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from,
      to: [to],
      reply_to: input.email,
      subject: `Portfolio contact: ${input.subject}`.slice(0, 200),
      text,
    }),
  })
  if (!res.ok) deps.log?.('notification email failed', res.status)
}

export function createContactHandler(deps: ContactDeps) {
  return async function handle(req: Request): Promise<Response> {
    const cors = corsHeaders(req, deps.env)
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors })
    if (req.method !== 'POST') return json({ error: 'method_not_allowed', message: 'Method not allowed.' }, 405, cors)
    if (!isOriginAllowed(req, deps.env)) return json({ error: 'forbidden', message: 'Origin not allowed.' }, 403, cors)

    const raw = await req.text()
    if (raw.length > MAX_BODY_BYTES) return json({ error: 'too_large', message: 'The message is too large.' }, 413, cors)

    let body: unknown
    try {
      body = JSON.parse(raw)
    } catch {
      return json({ error: 'invalid', message: 'Invalid request.' }, 400, cors)
    }

    const result = validateContact(body)
    if (!result.ok) {
      // Bots get a normal-looking success so they learn nothing.
      if (result.reason === 'spam') return json({ ok: true }, 200, cors)
      return json({ error: 'invalid', message: 'Please correct the highlighted fields.', fieldErrors: result.fieldErrors }, 400, cors)
    }

    const ip = clientIp(req)
    const turnstileSecret = deps.env('TURNSTILE_SECRET_KEY')
    if (turnstileSecret) {
      const token = (body as { turnstileToken?: unknown }).turnstileToken
      if (!(await verifyTurnstile(deps, turnstileSecret, token, ip))) {
        return json({ error: 'captcha_failed', message: 'Verification failed. Please try again.' }, 400, cors)
      }
    }

    const salt = deps.env('IP_HASH_SALT') ?? ''
    if (!salt) deps.log?.('IP_HASH_SALT is not set; per-visitor rate limiting is weaker')
    const ipHash = ip ? await sha256Hex(`${salt}:${ip}`) : null
    const userAgent = req.headers.get('user-agent')?.slice(0, 300) ?? null

    const outcome = await deps.insertMessage({ ...result.data, ipHash, userAgent })
    if (outcome === 'rate_limited') {
      return json({ error: 'rate_limited', message: 'Too many messages. Please try again later.' }, 429, cors)
    }
    if (outcome === 'error') {
      return json({ error: 'server_error', message: 'Your message could not be sent. Please try again later.' }, 500, cors)
    }

    const notify = sendNotification(deps, result.data).catch((error) => deps.log?.('notification error', error))
    if (deps.waitUntil) deps.waitUntil(notify)
    else await notify

    return json({ ok: true }, 200, cors)
  }
}
