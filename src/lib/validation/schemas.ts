import { z } from 'zod'
import { CONTACT_LIMITS, EMAIL_PATTERN } from '../../../supabase/functions/_shared/contact-validation'
import { SLUG_PATTERN } from '../utils'
import { ICON_KEYS } from '../icons'

/**
 * Form schemas. Inputs are plain strings/booleans (what the form holds); empty
 * optional strings are converted to null on submit with emptyToNull().
 * Every rule mirrors a database constraint, which remains the final authority.
 */

const optionalText = (max: number) => z.string().trim().max(max, `Keep this under ${max} characters.`)

export function isHttpsUrl(value: string): boolean {
  try {
    const url = new URL(value)
    return url.protocol === 'https:' && Boolean(url.hostname) && !/\s/.test(value)
  } catch {
    return false
  }
}

const optionalHttpsUrl = z
  .string()
  .trim()
  .max(500)
  .refine((v) => v === '' || isHttpsUrl(v), 'Enter a full URL starting with https://')

const requiredHttpsUrl = z.string().trim().max(500).refine(isHttpsUrl, 'Enter a full URL starting with https://')

const optionalEmail = z
  .string()
  .trim()
  .max(254)
  .refine((v) => v === '' || EMAIL_PATTERN.test(v), 'Enter a valid email address.')

const monthField = z.string().refine((v) => v === '' || /^\d{4}-(0[1-9]|1[0-2])$/.test(v), 'Use the format YYYY-MM.')

const slugField = (max: number) =>
  z
    .string()
    .trim()
    .min(1, 'A slug is required.')
    .max(max)
    .regex(SLUG_PATTERN, 'Use lowercase letters, numbers and single hyphens only.')

// --- Auth ------------------------------------------------------------------
export const loginSchema = z.object({
  email: z.string().trim().min(1, 'Enter your email.').refine((v) => EMAIL_PATTERN.test(v), 'Enter a valid email address.'),
  password: z.string().min(1, 'Enter your password.'),
})
export type LoginValues = z.infer<typeof loginSchema>

// --- Contact ---------------------------------------------------------------
export const contactSchema = z.object({
  name: z.string().trim().min(1, 'Please enter your name.').max(CONTACT_LIMITS.name.max),
  email: z.string().trim().max(CONTACT_LIMITS.email.max).refine((v) => EMAIL_PATTERN.test(v), 'Please enter a valid email address.'),
  subject: z.string().trim().min(1, 'Please enter a subject.').max(CONTACT_LIMITS.subject.max),
  message: z
    .string()
    .trim()
    .min(CONTACT_LIMITS.message.min, `Please write at least ${CONTACT_LIMITS.message.min} characters.`)
    .max(CONTACT_LIMITS.message.max, `Please keep it under ${CONTACT_LIMITS.message.max} characters.`),
  website: z.string(),
})
export type ContactValues = z.infer<typeof contactSchema>

// --- Projects --------------------------------------------------------------
export const MAX_FEATURES = 30

export const projectSchema = z
  .object({
    title: z.string().trim().min(1, 'A title is required.').max(120),
    slug: slugField(80),
    summary: z.string().trim().min(1, 'A short summary is required.').max(300),
    category_id: z.string(),
    role: optionalText(120),
    overview: optionalText(8000),
    problem: optionalText(8000),
    objectives: optionalText(8000),
    contribution: optionalText(8000),
    architecture: optionalText(8000),
    challenges: optionalText(8000),
    features: z
      .string()
      .refine((v) => featureLines(v).length <= MAX_FEATURES, `Up to ${MAX_FEATURES} features.`)
      .refine((v) => featureLines(v).every((l) => l.length <= 200), 'Each feature must be under 200 characters.'),
    repo_url: optionalHttpsUrl,
    demo_url: optionalHttpsUrl,
    started_on: monthField,
    completed_on: monthField,
    is_featured: z.boolean(),
    thumbnail_alt: optionalText(200),
    seo_description: optionalText(300),
  })
  .refine((v) => !v.started_on || !v.completed_on || v.completed_on >= v.started_on, {
    path: ['completed_on'],
    message: 'The end date must be after the start date.',
  })
export type ProjectValues = z.infer<typeof projectSchema>

export function featureLines(text: string): string[] {
  return text
    .split('\n')
    .map((l) => l.replace(/^\s*[-*•]\s*/, '').trim())
    .filter(Boolean)
}

export const categorySchema = z.object({
  name: z.string().trim().min(1, 'A name is required.').max(60),
})
export type CategoryValues = z.infer<typeof categorySchema>

// --- Skills ----------------------------------------------------------------
export const skillSchema = z.object({
  name: z.string().trim().min(1, 'A name is required.').max(60),
  category_id: z.string().min(1, 'Choose a category.'),
  icon: z.string().refine((v) => v === '' || (ICON_KEYS as readonly string[]).includes(v), 'Unknown icon.'),
  proficiency_note: optionalText(160),
  is_visible: z.boolean(),
})
export type SkillValues = z.infer<typeof skillSchema>

// --- Timeline --------------------------------------------------------------
export const TIMELINE_KINDS = ['education', 'training', 'experience', 'certification'] as const

export const timelineSchema = z
  .object({
    kind: z.enum(TIMELINE_KINDS),
    title: z.string().trim().min(1, 'A title is required.').max(160),
    organization: z.string().trim().min(1, 'An organization is required.').max(160),
    location: optionalText(120),
    description: optionalText(4000),
    start_date: monthField,
    end_date: monthField,
    is_current: z.boolean(),
    credential_url: optionalHttpsUrl,
    is_visible: z.boolean(),
  })
  .refine((v) => !(v.is_current && v.end_date), { path: ['end_date'], message: 'Ongoing entries cannot have an end date.' })
  .refine((v) => !v.start_date || !v.end_date || v.end_date >= v.start_date, {
    path: ['end_date'],
    message: 'The end date must be after the start date.',
  })
export type TimelineValues = z.infer<typeof timelineSchema>

// --- Profile ---------------------------------------------------------------
export const profileSchema = z.object({
  full_name: z.string().trim().min(1, 'Your name is required.').max(120),
  headline: z.string().trim().min(1, 'A professional title is required.').max(160),
  intro: optionalText(600),
  bio: optionalText(6000),
  journey: optionalText(6000),
  interests: optionalText(3000),
  goals: optionalText(3000),
  location: optionalText(120),
  public_email: optionalEmail,
  phone: z
    .string()
    .trim()
    .refine((v) => v === '' || /^\+?[0-9 ().-]{6,24}$/.test(v), 'Use digits, spaces and + ( ) - only.'),
  avatar_alt: optionalText(200),
  seo_description: optionalText(300),
})
export type ProfileValues = z.infer<typeof profileSchema>

export const SOCIAL_PLATFORMS = ['github', 'linkedin', 'x', 'gitlab', 'stackoverflow', 'website', 'other'] as const

export const socialLinkSchema = z.object({
  platform: z.enum(SOCIAL_PLATFORMS),
  label: z.string().trim().min(1, 'A label is required.').max(60),
  url: requiredHttpsUrl,
  is_visible: z.boolean(),
})
export type SocialLinkValues = z.infer<typeof socialLinkSchema>

// --- Settings --------------------------------------------------------------
export const settingsSchema = z.object({
  site_title: z.string().trim().min(1, 'A site title is required.').max(80),
  site_description: optionalText(300),
  monogram: z.string().trim().min(1, 'Use 1–4 characters.').max(4, 'Use 1–4 characters.'),
  footer_text: optionalText(300),
  show_featured_projects: z.boolean(),
  show_skills: z.boolean(),
  show_education: z.boolean(),
  show_about: z.boolean(),
  show_contact: z.boolean(),
  featured_limit: z.number({ message: 'Enter a number.' }).int().min(1).max(12),
  notification_email: optionalEmail,
})
export type SettingsValues = z.infer<typeof settingsSchema>
