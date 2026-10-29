import type { TablesInsert, TablesUpdate } from '../database.types'
import { AppError, unwrap, unwrapMaybe } from '../errors'
import { FILE_RULES } from '../files'
import { removeFiles, removeFilesQuietly, uploadValidatedFile } from '../storage'
import { supabase } from '../supabase'
import { sanitizeSearchTerm, slugify } from '../utils'
import { PROJECT_DETAIL_SELECT } from './public'

/*
 * Administrator operations. Every call below is authorised by RLS against the
 * admins table — the UI route guard is a convenience, not the security layer.
 *
 * Replacing a stored file follows: upload new -> update row -> delete old.
 * If the row update fails the new upload is removed, so no orphans remain.
 */

export type ReorderTable =
  | 'projects'
  | 'project_images'
  | 'skills'
  | 'skill_categories'
  | 'project_categories'
  | 'timeline_entries'
  | 'social_links'

export async function reorder(table: ReorderTable, ids: string[]) {
  unwrap(await supabase.rpc('reorder_rows', { p_table: table, p_ids: ids }), 'Could not save the new order.')
}

/** Returns a copy of `items` with the element at `index` moved by `delta`. */
export function moveItem<T>(items: T[], index: number, delta: -1 | 1): T[] {
  const target = index + delta
  if (target < 0 || target >= items.length) return items
  const next = [...items]
  const [item] = next.splice(index, 1)
  next.splice(target, 0, item as T)
  return next
}

// --- Auth ------------------------------------------------------------------

export async function checkIsAdmin(): Promise<boolean> {
  const { data, error } = await supabase.rpc('is_admin')
  if (error) throw new AppError('Could not verify administrator access.')
  return data === true
}

// --- Dashboard ---------------------------------------------------------------

export type DashboardStats = {
  published_projects: number
  draft_projects: number
  skills: number
  total_messages: number
  unread_messages: number
}

export async function fetchDashboardStats(): Promise<DashboardStats> {
  return unwrap(await supabase.rpc('admin_dashboard_stats'), 'Could not load statistics.') as unknown as DashboardStats
}

// --- Projects ------------------------------------------------------------------

export async function listAdminProjects() {
  return unwrap(
    await supabase
      .from('projects')
      .select('id, slug, title, summary, status, is_featured, sort_order, updated_at, thumbnail_path, category:project_categories(id, name)')
      .order('sort_order')
      .order('created_at'),
    'Could not load projects.',
  )
}
export type AdminProjectRow = Awaited<ReturnType<typeof listAdminProjects>>[number]

export async function getAdminProject(id: string) {
  return unwrapMaybe(
    await supabase.from('projects').select(PROJECT_DETAIL_SELECT).eq('id', id).maybeSingle(),
    'Could not load this project.',
  )
}
export type AdminProject = NonNullable<Awaited<ReturnType<typeof getAdminProject>>>

export async function isSlugAvailable(slug: string, excludeId?: string): Promise<boolean> {
  let query = supabase.from('projects').select('id', { head: true, count: 'exact' }).eq('slug', slug)
  if (excludeId) query = query.neq('id', excludeId)
  const result = await query
  unwrap(result)
  return (result.count ?? 0) === 0
}

export async function createProject(values: TablesInsert<'projects'>): Promise<string> {
  const minOrder = unwrapMaybe(
    await supabase.from('projects').select('sort_order').order('sort_order').limit(1).maybeSingle(),
  )
  const row = unwrap(
    await supabase
      .from('projects')
      .insert({ ...values, sort_order: (minOrder?.sort_order ?? 1) - 1 })
      .select('id')
      .single(),
    'Could not create the project.',
  )
  return row.id
}

export async function updateProject(id: string, values: TablesUpdate<'projects'>) {
  unwrap(await supabase.from('projects').update(values).eq('id', id).select('id').single(), 'Could not save the project.')
}

export async function setProjectSkills(projectId: string, skillIds: string[]) {
  unwrap(await supabase.rpc('set_project_skills', { p_project_id: projectId, p_skill_ids: skillIds }), 'Could not save technologies.')
}

export async function deleteProject(id: string) {
  const project = unwrap(
    await supabase.from('projects').select('thumbnail_path, images:project_images(storage_path)').eq('id', id).single(),
  )
  unwrap(await supabase.from('projects').delete().eq('id', id), 'Could not delete the project.')
  await removeFilesQuietly('project-images', [project.thumbnail_path, ...project.images.map((i) => i.storage_path)])
}

export async function setProjectThumbnail(projectId: string, file: File, previousPath: string | null) {
  const { path } = await uploadValidatedFile(file, FILE_RULES.projectImage, projectId)
  const result = await supabase.from('projects').update({ thumbnail_path: path }).eq('id', projectId)
  if (result.error) {
    await removeFilesQuietly('project-images', [path])
    unwrap(result, 'Could not save the thumbnail.')
  }
  await removeFilesQuietly('project-images', [previousPath])
  return path
}

export async function removeProjectThumbnail(projectId: string, path: string) {
  unwrap(await supabase.from('projects').update({ thumbnail_path: null }).eq('id', projectId), 'Could not remove the thumbnail.')
  await removeFilesQuietly('project-images', [path])
}

export async function addProjectImages(projectId: string, files: File[], startOrder: number) {
  const errors: string[] = []
  let order = startOrder
  for (const file of files) {
    try {
      const { path } = await uploadValidatedFile(file, FILE_RULES.projectImage, projectId)
      const result = await supabase
        .from('project_images')
        .insert({ project_id: projectId, storage_path: path, sort_order: ++order, alt_text: '' })
      if (result.error) {
        await removeFilesQuietly('project-images', [path])
        unwrap(result)
      }
    } catch (error) {
      errors.push(`${file.name}: ${error instanceof Error ? error.message : 'upload failed'}`)
    }
  }
  if (errors.length) throw new AppError(errors.join('\n'))
}

export async function updateProjectImage(id: string, values: TablesUpdate<'project_images'>) {
  unwrap(await supabase.from('project_images').update(values).eq('id', id), 'Could not save the image details.')
}

export async function deleteProjectImage(id: string, storagePath: string) {
  unwrap(await supabase.from('project_images').delete().eq('id', id), 'Could not delete the image.')
  await removeFilesQuietly('project-images', [storagePath])
}

// --- Project categories ----------------------------------------------------------

export async function listProjectCategories() {
  return unwrap(
    await supabase.from('project_categories').select('id, name, slug, sort_order, projects(count)').order('sort_order'),
    'Could not load categories.',
  )
}

export async function createProjectCategory(name: string) {
  const last = unwrapMaybe(
    await supabase.from('project_categories').select('sort_order').order('sort_order', { ascending: false }).limit(1).maybeSingle(),
  )
  unwrap(
    await supabase.from('project_categories').insert({ name, slug: slugify(name, 60), sort_order: (last?.sort_order ?? 0) + 1 }),
    'Could not create the category.',
  )
}

export async function renameProjectCategory(id: string, name: string) {
  unwrap(await supabase.from('project_categories').update({ name, slug: slugify(name, 60) }).eq('id', id), 'Could not rename the category.')
}

export async function deleteProjectCategory(id: string) {
  unwrap(await supabase.from('project_categories').delete().eq('id', id), 'Could not delete the category.')
}

// --- Skills --------------------------------------------------------------------

export async function listAdminSkillGroups() {
  const rows = unwrap(
    await supabase
      .from('skill_categories')
      .select('id, name, slug, sort_order, skills(id, name, icon, proficiency_note, sort_order, is_visible, category_id)')
      .order('sort_order'),
    'Could not load skills.',
  )
  return rows.map((c) => ({ ...c, skills: [...c.skills].sort((a, b) => a.sort_order - b.sort_order) }))
}
export type AdminSkillGroup = Awaited<ReturnType<typeof listAdminSkillGroups>>[number]
export type AdminSkill = AdminSkillGroup['skills'][number]

export async function createSkill(values: TablesInsert<'skills'>) {
  const last = unwrapMaybe(
    await supabase
      .from('skills')
      .select('sort_order')
      .eq('category_id', values.category_id)
      .order('sort_order', { ascending: false })
      .limit(1)
      .maybeSingle(),
  )
  return unwrap(
    await supabase
      .from('skills')
      .insert({ ...values, sort_order: (last?.sort_order ?? 0) + 1 })
      .select('id, name')
      .single(),
    'Could not create the skill.',
  )
}

export async function updateSkill(id: string, values: TablesUpdate<'skills'>) {
  unwrap(await supabase.from('skills').update(values).eq('id', id), 'Could not save the skill.')
}

export async function deleteSkill(id: string) {
  unwrap(await supabase.from('skills').delete().eq('id', id), 'Could not delete the skill.')
}

export async function createSkillCategory(name: string) {
  const last = unwrapMaybe(
    await supabase.from('skill_categories').select('sort_order').order('sort_order', { ascending: false }).limit(1).maybeSingle(),
  )
  unwrap(
    await supabase.from('skill_categories').insert({ name, slug: slugify(name, 60), sort_order: (last?.sort_order ?? 0) + 1 }),
    'Could not create the category.',
  )
}

export async function renameSkillCategory(id: string, name: string) {
  unwrap(await supabase.from('skill_categories').update({ name, slug: slugify(name, 60) }).eq('id', id), 'Could not rename the category.')
}

export async function deleteSkillCategory(id: string) {
  unwrap(await supabase.from('skill_categories').delete().eq('id', id), 'Could not delete the category.')
}

// --- Timeline ------------------------------------------------------------------

export async function listAdminTimeline() {
  return unwrap(await supabase.from('timeline_entries').select('*').order('sort_order'), 'Could not load entries.')
}
export type AdminTimelineEntry = Awaited<ReturnType<typeof listAdminTimeline>>[number]

export async function createTimelineEntry(values: TablesInsert<'timeline_entries'>) {
  const last = unwrapMaybe(
    await supabase
      .from('timeline_entries')
      .select('sort_order')
      .eq('kind', values.kind)
      .order('sort_order', { ascending: false })
      .limit(1)
      .maybeSingle(),
  )
  unwrap(
    await supabase.from('timeline_entries').insert({ ...values, sort_order: (last?.sort_order ?? 0) + 1 }),
    'Could not create the entry.',
  )
}

export async function updateTimelineEntry(id: string, values: TablesUpdate<'timeline_entries'>) {
  unwrap(await supabase.from('timeline_entries').update(values).eq('id', id), 'Could not save the entry.')
}

export async function deleteTimelineEntry(id: string) {
  unwrap(await supabase.from('timeline_entries').delete().eq('id', id), 'Could not delete the entry.')
}

// --- Contact messages ----------------------------------------------------------------

export const MESSAGE_FILTERS = ['inbox', 'unread', 'archived', 'all'] as const
export type MessageFilter = (typeof MESSAGE_FILTERS)[number]
export const MESSAGES_PAGE_SIZE = 20

export async function listMessages({ filter, search, page }: { filter: MessageFilter; search: string; page: number }) {
  let query = supabase
    .from('contact_messages')
    .select('id, name, email, subject, message, is_read, is_archived, created_at', { count: 'exact' })
    .order('created_at', { ascending: false })

  if (filter === 'inbox') query = query.eq('is_archived', false)
  if (filter === 'unread') query = query.eq('is_archived', false).eq('is_read', false)
  if (filter === 'archived') query = query.eq('is_archived', true)

  const term = sanitizeSearchTerm(search)
  if (term) {
    query = query.or(['name', 'email', 'subject', 'message'].map((c) => `${c}.ilike.*${term}*`).join(','))
  }

  const from = (Math.max(1, page) - 1) * MESSAGES_PAGE_SIZE
  const result = await query.range(from, from + MESSAGES_PAGE_SIZE - 1)
  return { items: unwrap(result, 'Could not load messages.'), total: result.count ?? 0 }
}
export type ContactMessage = Awaited<ReturnType<typeof listMessages>>['items'][number]

export async function getMessage(id: string) {
  return unwrapMaybe(
    await supabase
      .from('contact_messages')
      .select('id, name, email, subject, message, is_read, is_archived, created_at')
      .eq('id', id)
      .maybeSingle(),
    'Could not load the message.',
  )
}

export async function fetchUnreadMessages(limit = 5) {
  const result = await supabase
    .from('contact_messages')
    .select('id, name, subject, created_at', { count: 'exact' })
    .eq('is_read', false)
    .eq('is_archived', false)
    .order('created_at', { ascending: false })
    .limit(limit)
  return { items: unwrap(result, 'Could not load notifications.'), total: result.count ?? 0 }
}

export async function updateMessage(id: string, values: Pick<TablesUpdate<'contact_messages'>, 'is_read' | 'is_archived'>) {
  unwrap(await supabase.from('contact_messages').update(values).eq('id', id), 'Could not update the message.')
}

export async function deleteMessage(id: string) {
  unwrap(await supabase.from('contact_messages').delete().eq('id', id), 'Could not delete the message.')
}

// --- Profile & social links ------------------------------------------------------

export async function fetchAdminProfile() {
  return unwrap(await supabase.from('profile').select('*').eq('id', 1).single(), 'Could not load the profile.')
}

export async function updateProfile(values: TablesUpdate<'profile'>) {
  unwrap(await supabase.from('profile').update(values).eq('id', 1).select('id').single(), 'Could not save the profile.')
}

export async function setAvatar(file: File, previousPath: string | null) {
  const { path } = await uploadValidatedFile(file, FILE_RULES.profileAsset, 'avatar')
  const result = await supabase.from('profile').update({ avatar_path: path }).eq('id', 1)
  if (result.error) {
    await removeFilesQuietly('profile-assets', [path])
    unwrap(result, 'Could not save the photo.')
  }
  await removeFilesQuietly('profile-assets', [previousPath])
}

export async function removeAvatar(path: string) {
  unwrap(await supabase.from('profile').update({ avatar_path: null }).eq('id', 1), 'Could not remove the photo.')
  await removeFilesQuietly('profile-assets', [path])
}

export async function listAdminSocialLinks() {
  return unwrap(await supabase.from('social_links').select('*').order('sort_order'), 'Could not load links.')
}
export type AdminSocialLink = Awaited<ReturnType<typeof listAdminSocialLinks>>[number]

export async function createSocialLink(values: TablesInsert<'social_links'>, sortOrder: number) {
  unwrap(await supabase.from('social_links').insert({ ...values, sort_order: sortOrder }), 'Could not add the link.')
}

export async function updateSocialLink(id: string, values: TablesUpdate<'social_links'>) {
  unwrap(await supabase.from('social_links').update(values).eq('id', id), 'Could not save the link.')
}

export async function deleteSocialLink(id: string) {
  unwrap(await supabase.from('social_links').delete().eq('id', id), 'Could not delete the link.')
}

// --- Settings, site assets & CV -------------------------------------------------------

export async function fetchAdminSettings() {
  const [settings, privateSettings] = await Promise.all([
    supabase.from('site_settings').select('*').eq('id', 1).single(),
    supabase.from('private_settings').select('*').eq('id', 1).single(),
  ])
  return {
    settings: unwrap(settings, 'Could not load settings.'),
    privateSettings: unwrap(privateSettings, 'Could not load settings.'),
  }
}
export type AdminSettings = Awaited<ReturnType<typeof fetchAdminSettings>>

export async function updateSettings(values: TablesUpdate<'site_settings'>) {
  unwrap(await supabase.from('site_settings').update(values).eq('id', 1).select('id').single(), 'Could not save settings.')
}

export async function updatePrivateSettings(values: TablesUpdate<'private_settings'>) {
  unwrap(await supabase.from('private_settings').update(values).eq('id', 1).select('id').single(), 'Could not save settings.')
}

export type SiteAsset = 'logo_path' | 'favicon_path' | 'og_image_path'

export async function setSiteAsset(field: SiteAsset, file: File, previousPath: string | null) {
  const { path } = await uploadValidatedFile(file, FILE_RULES.profileAsset, field.replace('_path', '').replace('_', '-'))
  const result = await supabase.from('site_settings').update({ [field]: path } as TablesUpdate<'site_settings'>).eq('id', 1)
  if (result.error) {
    await removeFilesQuietly('profile-assets', [path])
    unwrap(result, 'Could not save the image.')
  }
  await removeFilesQuietly('profile-assets', [previousPath])
}

export async function removeSiteAsset(field: SiteAsset, path: string) {
  unwrap(await supabase.from('site_settings').update({ [field]: null } as TablesUpdate<'site_settings'>).eq('id', 1), 'Could not remove the image.')
  await removeFilesQuietly('profile-assets', [path])
}

export async function uploadCv(file: File, previousPath: string | null) {
  const { path, size } = await uploadValidatedFile(file, FILE_RULES.cv, 'cv')
  const result = await supabase
    .from('private_settings')
    .update({ cv_path: path, cv_file_name: 'Joud-Chamaa-CV.pdf', cv_size_bytes: size, cv_uploaded_at: new Date().toISOString() })
    .eq('id', 1)
  if (result.error) {
    await removeFilesQuietly('cv', [path])
    unwrap(result, 'Could not save the CV.')
  }
  await removeFilesQuietly('cv', [previousPath])
}

export async function removeCv(path: string) {
  // The database trigger also unpublishes the CV when its path is cleared.
  unwrap(
    await supabase
      .from('private_settings')
      .update({ cv_path: null, cv_file_name: null, cv_size_bytes: null, cv_uploaded_at: null })
      .eq('id', 1),
    'Could not remove the CV.',
  )
  await removeFiles('cv', [path])
}

export async function adminCvUrl(path: string): Promise<string> {
  const { data, error } = await supabase.storage.from('cv').createSignedUrl(path, 60)
  if (error || !data) throw new AppError('Could not open the CV.')
  return data.signedUrl
}
