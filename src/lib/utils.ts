import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/** Lowercase, ASCII, hyphen-separated slug matching the database constraint. */
export function slugify(input: string, maxLength = 80): string {
  return input
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, maxLength)
    .replace(/-+$/g, '')
}

export const SLUG_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/

/** Splits plain text into paragraphs on blank lines. */
export function paragraphs(text: string | null | undefined): string[] {
  if (!text) return []
  return text
    .replace(/\r\n/g, '\n')
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean)
}

export function hasText(value: string | null | undefined): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

const monthYear = new Intl.DateTimeFormat('en', { month: 'short', year: 'numeric', timeZone: 'UTC' })
const fullDate = new Intl.DateTimeFormat('en', { dateStyle: 'medium', timeZone: 'UTC' })
const dateTime = new Intl.DateTimeFormat('en', { dateStyle: 'medium', timeStyle: 'short' })

export function formatMonth(date: string | null | undefined): string | null {
  if (!date) return null
  const d = new Date(`${date.slice(0, 10)}T00:00:00Z`)
  return Number.isNaN(d.getTime()) ? null : monthYear.format(d)
}

export function formatDate(date: string | null | undefined): string {
  if (!date) return ''
  const d = new Date(date)
  return Number.isNaN(d.getTime()) ? '' : fullDate.format(d)
}

export function formatDateTime(date: string | null | undefined): string {
  if (!date) return ''
  const d = new Date(date)
  return Number.isNaN(d.getTime()) ? '' : dateTime.format(d)
}

/** "Sep 2022 — Present", "Sep 2022 — Jun 2024", or null when no dates are known. */
export function formatRange(start: string | null, end: string | null, isCurrent = false): string | null {
  const from = formatMonth(start)
  const to = isCurrent ? 'Present' : formatMonth(end)
  if (from && to) return `${from} — ${to}`
  return from ?? to
}

/** <input type="month"> value ("YYYY-MM") <-> SQL date ("YYYY-MM-01"). */
export function monthToDate(value: string | null | undefined): string | null {
  return value && /^\d{4}-\d{2}$/.test(value) ? `${value}-01` : null
}
export function dateToMonth(value: string | null | undefined): string {
  return value ? value.slice(0, 7) : ''
}

/** Trims strings and converts empty strings to null so optional columns stay null. */
export function emptyToNull<T extends Record<string, unknown>>(values: T): T {
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(values)) {
    if (typeof v === 'string') {
      const trimmed = v.trim()
      out[k] = trimmed === '' ? null : trimmed
    } else {
      out[k] = v
    }
  }
  return out as T
}

export function absoluteUrl(path: string, siteUrl: string): string | undefined {
  if (!siteUrl) return undefined
  return `${siteUrl}${path.startsWith('/') ? path : `/${path}`}`
}

/** Removes characters that carry meaning in PostgREST filter syntax. */
export function sanitizeSearchTerm(term: string): string {
  return term
    .replace(/[,()*%\\:"']/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80)
}
