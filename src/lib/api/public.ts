import { FunctionsHttpError } from '@supabase/supabase-js'
import type { ContactPayload } from '../../../supabase/functions/_shared/contact-validation'
import { AppError, unwrap, unwrapMaybe } from '../errors'
import { supabase } from '../supabase'
import { SLUG_PATTERN } from '../utils'

/*
 * Public (visitor-facing) queries. RLS already limits anonymous access to
 * published / visible rows; the explicit filters below additionally keep the
 * public pages identical for a signed-in administrator, whose policies would
 * otherwise also return drafts and hidden rows.
 */

export const PROJECT_CARD_SELECT =
  'id, slug, title, summary, thumbnail_path, thumbnail_alt, is_featured, started_on, completed_on, published_at, category:project_categories(id, name, slug), tags:project_skills(sort_order, skill:skills(id, name))'

export const PROJECT_DETAIL_SELECT =
  '*, category:project_categories(id, name, slug), tags:project_skills(sort_order, skill:skills(id, name)), images:project_images(id, storage_path, alt_text, caption, is_mockup, sort_order)'

type Tagged = { tags: Array<{ sort_order: number; skill: { id: string; name: string } | null }> }

/** Flattens and orders technology tags. */
export function tagNames<T extends Tagged>(project: T): Array<{ id: string; name: string }> {
  return [...project.tags]
    .sort((a, b) => a.sort_order - b.sort_order)
    .flatMap((t) => (t.skill ? [t.skill] : []))
}

// --- Site-wide data ---------------------------------------------------------

export async function fetchSiteData() {
  const [settings, profile, links] = await Promise.all([
    supabase.from('site_settings').select('*').eq('id', 1).single(),
    supabase.from('profile').select('*').eq('id', 1).single(),
    supabase.from('social_links').select('id, platform, label, url').eq('is_visible', true).order('sort_order'),
  ])
  return {
    settings: unwrap(settings, 'Could not load site settings.'),
    profile: unwrap(profile, 'Could not load profile.'),
    socialLinks: unwrap(links, 'Could not load links.'),
  }
}
export type SiteData = Awaited<ReturnType<typeof fetchSiteData>>

// --- Projects ----------------------------------------------------------------

export const PROJECT_SORTS = ['curated', 'newest', 'title'] as const
export type ProjectSort = (typeof PROJECT_SORTS)[number]
export const PROJECTS_PAGE_SIZE = 9

export type ProjectQuery = {
  categoryId?: string | null
  skillId?: string | null
  sort?: ProjectSort
  page?: number
}

export async function fetchProjects({ categoryId, skillId, sort = 'curated', page = 1 }: ProjectQuery = {}) {
  let ids: string[] | null = null
  if (skillId) {
    const links = unwrap(
      await supabase.from('project_skills').select('project_id').eq('skill_id', skillId),
      'Could not load projects.',
    )
    ids = links.map((l) => l.project_id)
    if (ids.length === 0) return { items: [], total: 0 }
  }

  let query = supabase.from('projects').select(PROJECT_CARD_SELECT, { count: 'exact' }).eq('status', 'published')
  if (categoryId) query = query.eq('category_id', categoryId)
  if (ids) query = query.in('id', ids)

  if (sort === 'newest') {
    query = query.order('completed_on', { ascending: false, nullsFirst: false }).order('published_at', { ascending: false })
  } else if (sort === 'title') {
    query = query.order('title')
  } else {
    query = query.order('sort_order').order('published_at', { ascending: false })
  }

  const from = (Math.max(1, page) - 1) * PROJECTS_PAGE_SIZE
  const result = await query.range(from, from + PROJECTS_PAGE_SIZE - 1)
  const items = unwrap(result, 'Could not load projects.')
  return { items, total: result.count ?? items.length }
}
export type ProjectCardData = Awaited<ReturnType<typeof fetchProjects>>['items'][number]

export async function fetchFeaturedProjects(limit: number) {
  return unwrap(
    await supabase
      .from('projects')
      .select(PROJECT_CARD_SELECT)
      .eq('status', 'published')
      .eq('is_featured', true)
      .order('sort_order')
      .limit(limit),
    'Could not load featured projects.',
  )
}

/** Categories and technologies that appear on at least one published project. */
export async function fetchProjectFilters() {
  const [categories, tags] = await Promise.all([
    supabase
      .from('project_categories')
      .select('id, name, slug, sort_order, projects!inner(id)')
      .eq('projects.status', 'published')
      .order('sort_order'),
    supabase.from('project_skills').select('skill:skills(id, name), project:projects!inner(id)').eq('project.status', 'published'),
  ])
  const categoryRows = unwrap(categories, 'Could not load filters.')
  const tagRows = unwrap(tags, 'Could not load filters.')
  const skills = new Map<string, { id: string; name: string }>()
  for (const row of tagRows) if (row.skill) skills.set(row.skill.id, row.skill)
  return {
    categories: categoryRows.map(({ id, name, slug }) => ({ id, name, slug })),
    skills: [...skills.values()].sort((a, b) => a.name.localeCompare(b.name)),
  }
}

export async function fetchProjectBySlug(slug: string) {
  if (!SLUG_PATTERN.test(slug) || slug.length > 80) return null
  return unwrapMaybe(
    await supabase.from('projects').select(PROJECT_DETAIL_SELECT).eq('slug', slug).eq('status', 'published').maybeSingle(),
    'Could not load this project.',
  )
}
export type ProjectDetailData = NonNullable<Awaited<ReturnType<typeof fetchProjectBySlug>>>

export async function fetchRelatedProjects(project: { id: string; category_id: string | null }, limit = 3) {
  const related: ProjectCardData[] = []
  if (project.category_id) {
    related.push(
      ...unwrap(
        await supabase
          .from('projects')
          .select(PROJECT_CARD_SELECT)
          .eq('status', 'published')
          .eq('category_id', project.category_id)
          .neq('id', project.id)
          .order('sort_order')
          .limit(limit),
      ),
    )
  }
  if (related.length < limit) {
    const exclude = [project.id, ...related.map((p) => p.id)]
    related.push(
      ...unwrap(
        await supabase
          .from('projects')
          .select(PROJECT_CARD_SELECT)
          .eq('status', 'published')
          .not('id', 'in', `(${exclude.join(',')})`)
          .order('is_featured', { ascending: false })
          .order('sort_order')
          .limit(limit - related.length),
      ),
    )
  }
  // Defensive de-duplication (the queries already exclude overlaps).
  return [...new Map(related.map((p) => [p.id, p])).values()]
}

// --- Skills & timeline -----------------------------------------------------------

export async function fetchSkillGroups() {
  const rows = unwrap(
    await supabase
      .from('skill_categories')
      .select('id, name, slug, sort_order, skills(id, name, icon, proficiency_note, sort_order, is_visible)')
      .order('sort_order'),
    'Could not load skills.',
  )
  return rows
    .map((c) => ({
      ...c,
      skills: c.skills.filter((s) => s.is_visible).sort((a, b) => a.sort_order - b.sort_order),
    }))
    .filter((c) => c.skills.length > 0)
}
export type SkillGroup = Awaited<ReturnType<typeof fetchSkillGroups>>[number]

export async function fetchTimeline() {
  return unwrap(
    await supabase
      .from('timeline_entries')
      .select('id, kind, title, organization, location, description, start_date, end_date, is_current, credential_url, sort_order')
      .eq('is_visible', true)
      .order('sort_order')
      .order('start_date', { ascending: false, nullsFirst: false }),
    'Could not load experience.',
  )
}
export type TimelineEntry = Awaited<ReturnType<typeof fetchTimeline>>[number]

// --- Edge Functions ----------------------------------------------------------------

async function functionError(error: unknown, fallback: string): Promise<AppError> {
  if (error instanceof FunctionsHttpError) {
    try {
      const body = (await error.context.json()) as { error?: string; message?: string; fieldErrors?: Record<string, string> }
      const appError = new AppError(body.message ?? fallback, body.error)
      return Object.assign(appError, { fieldErrors: body.fieldErrors })
    } catch {
      return new AppError(fallback)
    }
  }
  return new AppError('Network error. Check your connection and try again.', 'network')
}

/** Returns a short-lived signed download URL, or throws if the CV is unavailable. */
export async function requestCvUrl(): Promise<string> {
  const { data, error } = await supabase.functions.invoke<{ url: string }>('cv-url', { method: 'POST', body: {} })
  if (error || !data?.url) throw await functionError(error, 'The CV is not available right now.')
  return data.url
}

export type ContactError = AppError & { fieldErrors?: Partial<Record<string, string>> }

export async function submitContactMessage(payload: ContactPayload): Promise<void> {
  const { error } = await supabase.functions.invoke('contact', { body: payload })
  if (error) throw await functionError(error, 'Your message could not be sent. Please try again later.')
}
