// @vitest-environment node
import { describe, expect, it, vi } from 'vitest'
import { CONTACT_LIMITS, validateContact } from '../../supabase/functions/_shared/contact-validation'
import { createContactHandler, type ContactDeps } from '../../supabase/functions/contact/handler'
import { createCvHandler, CV_URL_TTL_SECONDS } from '../../supabase/functions/cv-url/handler'

const NOW = Date.now()
const valid = {
  name: 'Ada Lovelace',
  email: 'Ada@Example.com',
  subject: 'Internship opportunity',
  message: 'Hello! I would like to talk about a role.',
  website: '',
  startedAt: NOW - 10_000,
}

describe('validateContact (shared by browser and Edge Function)', () => {
  it('accepts and normalises a valid submission', () => {
    const result = validateContact(valid, NOW)
    expect(result).toEqual({ ok: true, data: expect.objectContaining({ email: 'ada@example.com', name: 'Ada Lovelace' }) })
  })

  it('flags honeypot and implausible timing as spam', () => {
    expect(validateContact({ ...valid, website: 'http://spam' }, NOW)).toEqual({ ok: false, reason: 'spam' })
    expect(validateContact({ ...valid, startedAt: NOW - 500 }, NOW)).toEqual({ ok: false, reason: 'spam' })
    expect(validateContact({ ...valid, startedAt: NOW - CONTACT_LIMITS.maxFillMs - 1 }, NOW)).toEqual({ ok: false, reason: 'spam' })
    expect(validateContact({ ...valid, startedAt: 'yesterday' }, NOW)).toEqual({ ok: false, reason: 'spam' })
  })

  it('reports field errors', () => {
    expect(validateContact({ ...valid, email: 'nope', message: 'short' }, NOW)).toEqual({
      ok: false,
      reason: 'invalid',
      fieldErrors: { email: expect.any(String), message: expect.any(String) },
    })
  })

  it('strips control characters and header-style newlines from single-line fields', () => {
    const result = validateContact({ ...valid, subject: 'Hi\r\nBcc: victim@example.com\u0000' }, NOW)
    expect(result.ok && result.data.subject).toBe('Hi Bcc: victim@example.com')
  })
})

function contactDeps(overrides: Partial<ContactDeps> = {}) {
  const env: Record<string, string> = { IP_HASH_SALT: 'salt', ALLOWED_ORIGINS: 'https://joud.dev' }
  const deps = {
    env: (k: string) => env[k],
    insertMessage: vi.fn(async () => 'ok' as const),
    getNotificationEmail: vi.fn(async () => 'owner@example.com'),
    fetch: vi.fn(async () => new Response(JSON.stringify({ success: true }), { status: 200 })) as unknown as typeof fetch,
    ...overrides,
  }
  return { deps, env }
}

const post = (body: unknown, headers: Record<string, string> = {}) =>
  new Request('https://fn.example/contact', {
    method: 'POST',
    headers: { origin: 'https://joud.dev', 'content-type': 'application/json', 'x-forwarded-for': '203.0.113.7, 10.0.0.1', ...headers },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  })

describe('contact Edge Function handler', () => {
  it('stores a valid message with a hashed IP, never the raw IP', async () => {
    const { deps } = contactDeps()
    const res = await createContactHandler(deps)(post(valid))
    expect(res.status).toBe(200)
    expect(res.headers.get('access-control-allow-origin')).toBe('https://joud.dev')
    const call = vi.mocked(deps.insertMessage).mock.calls[0]![0]
    expect(call.email).toBe('ada@example.com')
    expect(call.ipHash).toMatch(/^[0-9a-f]{64}$/)
    expect(JSON.stringify(call)).not.toContain('203.0.113.7')
  })

  it('silently drops spam without storing it', async () => {
    const { deps } = contactDeps()
    const res = await createContactHandler(deps)(post({ ...valid, website: 'bot' }))
    expect(res.status).toBe(200)
    expect(deps.insertMessage).not.toHaveBeenCalled()
  })

  it('returns field errors for invalid input', async () => {
    const { deps } = contactDeps()
    const res = await createContactHandler(deps)(post({ ...valid, email: 'bad' }))
    expect(res.status).toBe(400)
    expect(await res.json()).toMatchObject({ error: 'invalid', fieldErrors: { email: expect.any(String) } })
  })

  it('maps database rate limiting to HTTP 429', async () => {
    const { deps } = contactDeps({ insertMessage: vi.fn(async () => 'rate_limited' as const) })
    const res = await createContactHandler(deps)(post(valid))
    expect(res.status).toBe(429)
    expect(await res.json()).toMatchObject({ error: 'rate_limited' })
  })

  it('rejects disallowed origins, wrong methods, oversized and malformed bodies', async () => {
    const { deps } = contactDeps()
    const handle = createContactHandler(deps)
    expect((await handle(post(valid, { origin: 'https://evil.example' }))).status).toBe(403)
    expect((await handle(new Request('https://fn.example/contact', { method: 'GET' }))).status).toBe(405)
    expect((await handle(post({ ...valid, message: 'x'.repeat(30_000) }))).status).toBe(413)
    expect((await handle(post('{not json'))).status).toBe(400)
    expect((await handle(new Request('https://fn.example/contact', { method: 'OPTIONS', headers: { origin: 'https://joud.dev' } }))).status).toBe(204)
    expect(deps.insertMessage).not.toHaveBeenCalled()
  })

  it('requires a valid Turnstile token when the secret is configured', async () => {
    const env: Record<string, string> = { TURNSTILE_SECRET_KEY: 'secret' }
    const failing = vi.fn(async () => new Response(JSON.stringify({ success: false }))) as unknown as typeof fetch
    const { deps } = contactDeps({ env: (k) => env[k], fetch: failing })
    const res = await createContactHandler(deps)(post({ ...valid, turnstileToken: 'token' }))
    expect(res.status).toBe(400)
    expect(deps.insertMessage).not.toHaveBeenCalled()

    const missing = await createContactHandler(contactDeps({ env: (k) => env[k] }).deps)(post(valid))
    expect(missing.status).toBe(400)
  })

  it('sends a plain-text notification through Resend when configured', async () => {
    const env: Record<string, string> = { RESEND_API_KEY: 're_test', CONTACT_FROM_EMAIL: 'Portfolio <n@joud.dev>' }
    const fetchMock = vi.fn(async () => new Response('{}', { status: 200 }))
    const { deps } = contactDeps({ env: (k) => env[k], fetch: fetchMock as unknown as typeof fetch })
    const res = await createContactHandler(deps)(post({ ...valid, message: '<script>alert(1)</script> hello there' }))
    expect(res.status).toBe(200)
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('https://api.resend.com/emails')
    const payload = JSON.parse(init.body as string)
    expect(payload).toMatchObject({ to: ['owner@example.com'], reply_to: 'ada@example.com' })
    expect(payload.html).toBeUndefined()
    expect(payload.text).toContain('<script>alert(1)</script>')
  })
})

describe('cv-url Edge Function handler', () => {
  const env = () => undefined

  it('refuses when the CV is not published', async () => {
    const signUrl = vi.fn()
    const handle = createCvHandler({ env, signUrl, getCvState: async () => ({ published: false, path: 'cv/a.pdf', fileName: 'cv.pdf' }) })
    const res = await handle(new Request('https://fn.example/cv-url', { method: 'POST' }))
    expect(res.status).toBe(404)
    expect(signUrl).not.toHaveBeenCalled()
  })

  it('refuses when no CV is uploaded', async () => {
    const handle = createCvHandler({ env, signUrl: vi.fn(), getCvState: async () => ({ published: true, path: null, fileName: null }) })
    expect((await handle(new Request('https://fn.example/cv-url', { method: 'POST' }))).status).toBe(404)
  })

  it('returns a short-lived signed URL when published', async () => {
    const signUrl = vi.fn(async () => 'https://storage.example/signed?token=abc')
    const handle = createCvHandler({ env, signUrl, getCvState: async () => ({ published: true, path: 'cv/a.pdf', fileName: 'Joud-Chamaa-CV.pdf' }) })
    const res = await handle(new Request('https://fn.example/cv-url', { method: 'POST' }))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ url: 'https://storage.example/signed?token=abc' })
    expect(signUrl).toHaveBeenCalledWith('cv/a.pdf', CV_URL_TTL_SECONDS, 'Joud-Chamaa-CV.pdf')
    expect(CV_URL_TTL_SECONDS).toBeLessThanOrEqual(120)
  })
})
