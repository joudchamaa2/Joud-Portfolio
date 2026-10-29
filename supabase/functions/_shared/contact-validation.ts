/**
 * Contact form rules shared by the browser form and the `contact` Edge
 * Function. Dependency-free so it runs unchanged in Deno, Node and Vite.
 * The server re-validates everything; the client copy only provides fast
 * feedback.
 */

export const CONTACT_LIMITS = {
  name: { min: 1, max: 100 },
  email: { max: 254 },
  subject: { min: 1, max: 150 },
  message: { min: 10, max: 5000 },
  /** Submissions completed faster than this are treated as bots. */
  minFillMs: 3000,
  /** Form tokens older than this are rejected as stale/replayed. */
  maxFillMs: 1000 * 60 * 60 * 6,
} as const

export const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/

export type ContactPayload = {
  name: string
  email: string
  subject: string
  message: string
  /** Honeypot: must be empty. Hidden from humans, filled by naive bots. */
  website: string
  /** Epoch ms when the form was rendered. */
  startedAt: number
  turnstileToken?: string
}

export type ContactInput = Pick<ContactPayload, 'name' | 'email' | 'subject' | 'message'>

export type ContactValidation =
  | { ok: true; data: ContactInput }
  | { ok: false; reason: 'invalid'; fieldErrors: Partial<Record<keyof ContactInput, string>> }
  | { ok: false; reason: 'spam' }

// Strip control characters (except tab/newline) that have no place in a message.
// eslint-disable-next-line no-control-regex
const CONTROL_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g

function clean(value: unknown, multiline = false): string {
  if (typeof value !== 'string') return ''
  let v = value.replace(CONTROL_CHARS, '')
  if (!multiline) v = v.replace(/\s+/g, ' ')
  return v.trim()
}

export function validateContact(raw: unknown, now = Date.now()): ContactValidation {
  const body = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>

  // Bot heuristics first: honeypot filled, or form submitted implausibly fast/late.
  if (typeof body.website === 'string' && body.website.trim() !== '') return { ok: false, reason: 'spam' }
  const startedAt = typeof body.startedAt === 'number' ? body.startedAt : Number.NaN
  const elapsed = now - startedAt
  if (!Number.isFinite(elapsed) || elapsed < CONTACT_LIMITS.minFillMs || elapsed > CONTACT_LIMITS.maxFillMs) {
    return { ok: false, reason: 'spam' }
  }

  const data: ContactInput = {
    name: clean(body.name),
    email: clean(body.email).toLowerCase(),
    subject: clean(body.subject),
    message: clean(body.message, true),
  }

  const fieldErrors: Partial<Record<keyof ContactInput, string>> = {}
  const L = CONTACT_LIMITS
  if (data.name.length < L.name.min || data.name.length > L.name.max) fieldErrors.name = `Please enter your name (up to ${L.name.max} characters).`
  if (data.email.length > L.email.max || !EMAIL_PATTERN.test(data.email)) fieldErrors.email = 'Please enter a valid email address.'
  if (data.subject.length < L.subject.min || data.subject.length > L.subject.max) fieldErrors.subject = `Please enter a subject (up to ${L.subject.max} characters).`
  if (data.message.length < L.message.min || data.message.length > L.message.max) {
    fieldErrors.message = `Your message should be between ${L.message.min} and ${L.message.max} characters.`
  }

  if (Object.keys(fieldErrors).length > 0) return { ok: false, reason: 'invalid', fieldErrors }
  return { ok: true, data }
}
