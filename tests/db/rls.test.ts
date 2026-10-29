import type { PGlite } from '@electric-sql/pglite'
import { beforeAll, describe, expect, it } from 'vitest'
import { as, createDatabase, createUser, type Actor } from './harness.ts'

const ADMIN_ID = '00000000-0000-0000-0000-00000000a001'
const USER_ID = '00000000-0000-0000-0000-00000000b001'

const anon: Actor = { role: 'anon' }
const user: Actor = { role: 'authenticated', userId: USER_ID }
const admin: Actor = { role: 'authenticated', userId: ADMIN_ID }
const service: Actor = { role: 'service_role' }

let db: PGlite
let publishedId: string
let draftId: string
let hiddenSkillId: string
let draftOnlySkillId: string

async function rows<T = Record<string, unknown>>(actor: Actor, sql: string, params: unknown[] = []) {
  return as(db, actor, async () => (await db.query<T>(sql, params)).rows)
}

async function affected(actor: Actor, sql: string, params: unknown[] = []) {
  return as(db, actor, async () => (await db.query(sql, params)).affectedRows ?? 0)
}

async function fails(actor: Actor, sql: string, params: unknown[] = []) {
  return as(db, actor, () => db.query(sql, params)).then(
    () => null,
    (error: Error) => error.message,
  )
}

beforeAll(async () => {
  db = await createDatabase({ seed: true })
  await createUser(db, ADMIN_ID, 'admin@example.test', true)
  await createUser(db, USER_ID, 'user@example.test')

  const insertProject = `insert into public.projects (slug, title, summary, status)
                         values ($1, $2, 'Summary', $3) returning id`
  publishedId = (await db.query<{ id: string }>(insertProject, ['shop', 'Shop', 'published'])).rows[0].id
  draftId = (await db.query<{ id: string }>(insertProject, ['secret-draft', 'Secret draft', 'draft'])).rows[0].id

  const category = (await db.query<{ id: string }>(`select id from public.skill_categories where slug = 'tools'`)).rows[0].id
  hiddenSkillId = (await db.query<{ id: string }>(
    `insert into public.skills (name, category_id, is_visible) values ('Hidden tag', $1, false) returning id`, [category],
  )).rows[0].id
  draftOnlySkillId = (await db.query<{ id: string }>(
    `insert into public.skills (name, category_id, is_visible) values ('Draft-only tag', $1, false) returning id`, [category],
  )).rows[0].id

  await db.query(`insert into public.project_skills (project_id, skill_id) values ($1, $2), ($3, $4)`,
    [publishedId, hiddenSkillId, draftId, draftOnlySkillId])
  await db.query(`insert into public.project_images (project_id, storage_path) values ($1, 'p/a.webp'), ($2, 'd/b.webp')`,
    [publishedId, draftId])
  await db.query(`insert into public.timeline_entries (kind, title, organization, is_visible)
                  values ('experience', 'Hidden role', 'Hidden org', false)`)
  await db.query(`insert into public.contact_messages (name, email, subject, message)
                  values ('Visitor', 'visitor@example.test', 'Hello', 'A private message body')`)
})

describe('anonymous visitors', () => {
  it('see published projects but never drafts', async () => {
    const result = await rows<{ slug: string }>(anon, 'select slug from public.projects')
    expect(result.map((r) => r.slug)).toEqual(['shop'])
    expect(await rows(anon, 'select * from public.projects where id = $1', [draftId])).toHaveLength(0)
  })

  it('cannot see images or technology tags of draft projects', async () => {
    const images = await rows<{ project_id: string }>(anon, 'select project_id from public.project_images')
    expect(images.map((r) => r.project_id)).toEqual([publishedId])
    const tags = await rows<{ project_id: string }>(anon, 'select project_id from public.project_skills')
    expect(tags.map((r) => r.project_id)).toEqual([publishedId])
  })

  it('see visible skills plus hidden skills already used by a published project', async () => {
    const names = (await rows<{ name: string }>(anon, 'select name from public.skills')).map((r) => r.name)
    expect(names).toContain('React')
    expect(names).toContain('Hidden tag')
    expect(names).not.toContain('Draft-only tag')
  })

  it('see only visible timeline entries', async () => {
    const titles = (await rows<{ title: string }>(anon, 'select title from public.timeline_entries')).map((r) => r.title)
    expect(titles).toContain('Full Stack Web Development')
    expect(titles).not.toContain('Hidden role')
  })

  it('cannot read contact messages, admins or private settings', async () => {
    expect(await fails(anon, 'select * from public.contact_messages')).toMatch(/permission denied/)
    expect(await fails(anon, 'select * from public.admins')).toMatch(/permission denied/)
    expect(await fails(anon, 'select * from public.private_settings')).toMatch(/permission denied/)
  })

  it('cannot submit contact messages directly', async () => {
    expect(await fails(anon, `insert into public.contact_messages (name, email, subject, message)
                              values ('x', 'x@y.zz', 's', 'spam spam spam')`)).toMatch(/permission denied/)
    expect(await fails(anon, `select public.submit_contact_message('x', 'x@y.zz', 's', 'spam spam spam', null, null)`))
      .toMatch(/permission denied/)
  })

  it('cannot write any portfolio content', async () => {
    expect(await fails(anon, `insert into public.projects (slug, title, summary) values ('x', 'x', 'x')`)).toMatch(/permission denied/)
    expect(await fails(anon, `update public.projects set title = 'pwned'`)).toMatch(/permission denied/)
    expect(await fails(anon, `delete from public.projects`)).toMatch(/permission denied/)
    expect(await fails(anon, `update public.profile set full_name = 'pwned'`)).toMatch(/permission denied/)
    expect(await fails(anon, `update public.site_settings set cv_published = true`)).toMatch(/permission denied/)
  })

  it('cannot call admin RPCs', async () => {
    expect(await fails(anon, 'select public.admin_dashboard_stats()')).toMatch(/permission denied/)
    expect(await fails(anon, `select public.reorder_rows('projects', array[]::uuid[])`)).toMatch(/permission denied/)
  })

  it('can read public profile and settings', async () => {
    const [profile] = await rows<{ full_name: string }>(anon, 'select full_name from public.profile')
    expect(profile.full_name).toBe('Joud Chamaa')
    expect(await rows(anon, 'select * from public.site_settings')).toHaveLength(1)
  })
})

describe('authenticated non-admin users', () => {
  it('are not admins', async () => {
    const [{ is_admin }] = await rows<{ is_admin: boolean }>(user, 'select public.is_admin() as is_admin')
    expect(is_admin).toBe(false)
  })

  it('cannot see drafts', async () => {
    expect(await rows(user, 'select * from public.projects where id = $1', [draftId])).toHaveLength(0)
  })

  it('cannot read contact messages or private settings', async () => {
    expect(await rows(user, 'select * from public.contact_messages')).toHaveLength(0)
    expect(await rows(user, 'select * from public.private_settings')).toHaveLength(0)
  })

  it('cannot promote themselves to admin', async () => {
    expect(await fails(user, 'insert into public.admins (user_id) values ($1)', [USER_ID])).toMatch(/permission denied/)
  })

  it('cannot modify content (RLS blocks every write)', async () => {
    expect(await fails(user, `insert into public.projects (slug, title, summary) values ('x', 'x', 'x')`))
      .toMatch(/row-level security/)
    expect(await affected(user, `update public.projects set title = 'pwned'`)).toBe(0)
    expect(await affected(user, `delete from public.projects`)).toBe(0)
    expect(await affected(user, `update public.profile set full_name = 'pwned'`)).toBe(0)
    expect(await affected(user, `update public.contact_messages set is_read = true`)).toBe(0)
    expect(await affected(user, `delete from public.contact_messages`)).toBe(0)
    expect(await fails(user, `insert into public.skills (name, category_id)
                              select 'x', id from public.skill_categories limit 1`)).toMatch(/row-level security/)
  })

  it('cannot insert contact messages directly', async () => {
    expect(await fails(user, `insert into public.contact_messages (name, email, subject, message)
                              values ('x', 'x@y.zz', 's', 'spam spam spam')`)).toMatch(/permission denied/)
  })

  it('are rejected by admin RPCs', async () => {
    expect(await fails(user, 'select public.admin_dashboard_stats()')).toMatch(/Not authorized/)
    expect(await fails(user, `select public.reorder_rows('projects', array[$1]::uuid[])`, [publishedId])).toMatch(/Not authorized/)
    expect(await fails(user, `select public.set_project_skills($1, array[]::uuid[])`, [publishedId])).toMatch(/Not authorized/)
  })

  it('can see only their own admins row (none)', async () => {
    expect(await rows(user, 'select * from public.admins')).toHaveLength(0)
  })
})

describe('administrators', () => {
  it('are recognised by is_admin()', async () => {
    const [{ is_admin }] = await rows<{ is_admin: boolean }>(admin, 'select public.is_admin() as is_admin')
    expect(is_admin).toBe(true)
  })

  it('see drafts and published projects', async () => {
    expect(await rows(admin, 'select * from public.projects')).toHaveLength(2)
  })

  it('can create, publish, unpublish and delete projects', async () => {
    const [created] = await rows<{ id: string; published_at: string | null }>(admin,
      `insert into public.projects (slug, title, summary) values ('new-one', 'New', 'S') returning id, published_at`)
    expect(created.published_at).toBeNull()

    const [published] = await rows<{ published_at: string | null }>(admin,
      `update public.projects set status = 'published' where id = $1 returning published_at`, [created.id])
    expect(published.published_at).not.toBeNull()

    expect(await affected(admin, `update public.projects set status = 'draft' where id = $1`, [created.id])).toBe(1)
    expect(await rows(anon, 'select * from public.projects where id = $1', [created.id])).toHaveLength(0)
    expect(await affected(admin, 'delete from public.projects where id = $1', [created.id])).toBe(1)
  })

  it('manage technology tags atomically and in order', async () => {
    const skills = await rows<{ id: string }>(admin, `select id from public.skills where name in ('React', 'MySQL') order by name desc`)
    await rows(admin, 'select public.set_project_skills($1, $2::uuid[])', [publishedId, skills.map((s) => s.id)])
    const tags = await rows<{ skill_id: string; sort_order: number }>(admin,
      'select skill_id, sort_order from public.project_skills where project_id = $1 order by sort_order', [publishedId])
    expect(tags.map((t) => t.skill_id)).toEqual(skills.map((s) => s.id))
    expect(tags.map((t) => t.sort_order)).toEqual([1, 2])
  })

  it('reorder rows through the whitelisted RPC only', async () => {
    await rows(admin, `select public.reorder_rows('projects', array[$1, $2]::uuid[])`, [draftId, publishedId])
    const order = await rows<{ id: string }>(admin, 'select id from public.projects order by sort_order')
    expect(order.map((o) => o.id)).toEqual([draftId, publishedId])
    expect(await fails(admin, `select public.reorder_rows('admins', array[]::uuid[])`)).toMatch(/Unsupported table/)
  })

  it('read and manage contact messages', async () => {
    const messages = await rows<{ id: string }>(admin, 'select id from public.contact_messages')
    expect(messages).toHaveLength(1)
    expect(await affected(admin, 'update public.contact_messages set is_read = true, is_archived = true where id = $1',
      [messages[0].id])).toBe(1)
  })

  it('get real dashboard statistics', async () => {
    const [{ stats }] = await rows<{ stats: Record<string, number> }>(admin, 'select public.admin_dashboard_stats() as stats')
    expect(stats.published_projects).toBe(1)
    expect(stats.draft_projects).toBe(1)
    expect(stats.total_messages).toBe(1)
    expect(stats.skills).toBeGreaterThan(20)
  })

  it('can update profile and settings but not delete the singletons', async () => {
    expect(await affected(admin, `update public.profile set location = 'Saida, Lebanon'`)).toBe(1)
    expect(await fails(admin, 'delete from public.profile')).toMatch(/permission denied/)
  })

  it('cannot grant admin rights through the API', async () => {
    expect(await fails(admin, 'insert into public.admins (user_id) values ($1)', [USER_ID])).toMatch(/permission denied/)
  })
})

describe('contact submissions (service role via Edge Function)', () => {
  it('inserts messages and rate-limits by IP hash', async () => {
    const submit = `select public.submit_contact_message('Ann', 'ann@example.test', 'Hi', 'A long enough message', 'iphash-1', 'UA')`
    for (let i = 0; i < 3; i++) {
      expect(await rows(service, submit)).toHaveLength(1)
    }
    expect(await fails(service, submit)).toMatch(/rate_limited/)
    // another visitor is unaffected
    expect(await rows(service, submit.replace('iphash-1', 'iphash-2'))).toHaveLength(1)
  })

  it('still enforces table constraints', async () => {
    expect(await fails(service, `select public.submit_contact_message('Ann', 'not-an-email', 'Hi', 'A long enough message', null, null)`))
      .toMatch(/check constraint/)
    expect(await fails(service, `select public.submit_contact_message('Ann', 'a@b.cd', 'Hi', 'short', null, null)`))
      .toMatch(/check constraint/)
  })
})

describe('data integrity constraints', () => {
  it('enforce unique, well-formed slugs', async () => {
    expect(await fails(admin, `insert into public.projects (slug, title, summary) values ('shop', 'Dup', 'S')`))
      .toMatch(/duplicate key|projects_slug_key/)
    expect(await fails(admin, `insert into public.projects (slug, title, summary) values ('Bad Slug!', 'X', 'S')`))
      .toMatch(/check constraint/)
  })

  it('require https URLs for project links', async () => {
    expect(await fails(admin, `update public.projects set repo_url = 'javascript:alert(1)' where id = $1`, [publishedId]))
      .toMatch(/check constraint/)
    expect(await fails(admin, `update public.projects set demo_url = 'http://insecure.example' where id = $1`, [publishedId]))
      .toMatch(/check constraint/)
    expect(await affected(admin, `update public.projects set demo_url = 'https://demo.example.com' where id = $1`, [publishedId]))
      .toBe(1)
  })

  it('validate timeline date ranges', async () => {
    const base = `insert into public.timeline_entries (kind, title, organization, start_date, end_date, is_current) values ('experience', 'T', 'O', $1, $2, $3)`
    expect(await fails(admin, base, ['2024-05-01', '2023-01-01', false])).toMatch(/timeline_dates_check/)
    expect(await fails(admin, base, ['2024-05-01', '2024-06-01', true])).toMatch(/timeline_current_check/)
  })

  it('refuse to publish a CV that has not been uploaded, and unpublish on removal', async () => {
    expect(await fails(admin, 'update public.site_settings set cv_published = true')).toMatch(/Upload a CV/)
    await affected(admin, `update public.private_settings set cv_path = 'cv/1.pdf', cv_file_name = 'cv.pdf'`)
    expect(await affected(admin, 'update public.site_settings set cv_published = true')).toBe(1)
    await affected(admin, 'update public.private_settings set cv_path = null')
    const [settings] = await rows<{ cv_published: boolean }>(anon, 'select cv_published from public.site_settings')
    expect(settings.cv_published).toBe(false)
  })

  it('maintain updated_at automatically', async () => {
    await db.query(`update public.profile set updated_at = '2000-01-01'`)
    await affected(admin, `update public.profile set location = 'Lebanon'`)
    const [p] = await rows<{ updated_at: Date }>(anon, 'select updated_at from public.profile')
    expect(new Date(p.updated_at).getFullYear()).toBeGreaterThan(2000)
  })
})

describe('storage policies', () => {
  const upload = (bucket: string) =>
    `insert into storage.objects (bucket_id, name) values ('${bucket}', 'x/${crypto.randomUUID()}.webp')`

  it('configure bucket limits and privacy', async () => {
    const buckets = await db.query<{ id: string; public: boolean; file_size_limit: number; allowed_mime_types: string[] }>(
      'select id, public, file_size_limit, allowed_mime_types from storage.buckets order by id')
    expect(buckets.rows).toEqual([
      { id: 'cv', public: false, file_size_limit: 5242880, allowed_mime_types: ['application/pdf'] },
      { id: 'profile-assets', public: true, file_size_limit: 2097152, allowed_mime_types: ['image/jpeg', 'image/png', 'image/webp'] },
      { id: 'project-images', public: true, file_size_limit: 5242880, allowed_mime_types: ['image/jpeg', 'image/png', 'image/webp'] },
    ])
  })

  it('block anonymous and non-admin uploads, allow admins', async () => {
    for (const bucket of ['project-images', 'profile-assets', 'cv']) {
      expect(await fails(anon, upload(bucket))).toMatch(/row-level security/)
      expect(await fails(user, upload(bucket))).toMatch(/row-level security/)
      expect(await fails(admin, upload(bucket))).toBeNull()
    }
  })

  it('keep the private CV bucket unreadable for visitors and users', async () => {
    expect(await rows(anon, `select * from storage.objects where bucket_id = 'cv'`)).toHaveLength(0)
    expect(await rows(user, `select * from storage.objects where bucket_id = 'cv'`)).toHaveLength(0)
    expect((await rows(admin, `select * from storage.objects where bucket_id = 'cv'`)).length).toBeGreaterThan(0)
  })

  it('block non-admin deletion', async () => {
    expect(await affected(user, `delete from storage.objects`)).toBe(0)
    expect(await affected(anon, `delete from storage.objects`)).toBe(0)
  })
})

describe('RLS coverage', () => {
  it('is enabled on every public table', async () => {
    const result = await db.query<{ relname: string }>(`
      select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity`)
    expect(result.rows).toEqual([])
  })
})
