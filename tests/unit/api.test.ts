import { beforeEach, describe, expect, it, vi } from 'vitest'

/*
 * A recording fake of the Supabase query builder: every chained call is
 * captured so tests can assert which filters a query applies.
 */
const state = vi.hoisted(() => {
  type Op = [string, unknown[]]
  const queries: Array<{ table: string; ops: Op[] }> = []
  let nextResult: { data: unknown; error: unknown; count?: number } = { data: [], error: null, count: 0 }
  const upload = vi.fn(async (path: string) => ({ data: { path }, error: null }))
  const remove = vi.fn(async () => ({ data: [], error: null }))
  function builder(table: string): unknown {
    const ops: Op[] = []
    queries.push({ table, ops })
    const proxy: unknown = new Proxy(
      {},
      {
        get(_t, prop) {
          if (prop === 'then') return (res: (v: unknown) => unknown, rej: (e: unknown) => unknown) => Promise.resolve(nextResult).then(res, rej)
          return (...args: unknown[]) => {
            ops.push([String(prop), args])
            return proxy
          }
        },
      },
    )
    return proxy
  }
  return {
    queries,
    upload,
    remove,
    setResult: (r: typeof nextResult) => (nextResult = r),
    supabase: {
      from: (table: string) => builder(table),
      rpc: vi.fn(async () => ({ data: null, error: null })),
      storage: { from: () => ({ upload, remove, getPublicUrl: (p: string) => ({ data: { publicUrl: `https://cdn.test/${p}` } }) }) },
      functions: { invoke: vi.fn() },
      auth: {},
    },
  }
})

vi.mock('@/lib/supabase', () => ({ supabase: state.supabase }))

const { fetchProjectBySlug, fetchProjects, fetchSiteData, fetchSkillGroups, fetchTimeline, fetchFeaturedProjects } = await import('@/lib/api/public')
const { uploadValidatedFile } = await import('@/lib/storage')
const { FILE_RULES } = await import('@/lib/files')

const opsFor = (table: string) => state.queries.filter((q) => q.table === table).flatMap((q) => q.ops)
const hasEq = (table: string, column: string, value: unknown) =>
  opsFor(table).some(([op, args]) => op === 'eq' && args[0] === column && args[1] === value)

beforeEach(() => {
  state.queries.length = 0
  state.setResult({ data: [], error: null, count: 0 })
})

describe('public queries never rely on the caller being anonymous', () => {
  it('project listings filter to published projects', async () => {
    await fetchProjects({ sort: 'newest', page: 2 })
    expect(hasEq('projects', 'status', 'published')).toBe(true)
    expect(opsFor('projects')).toContainEqual(['range', [9, 17]])
  })

  it('featured projects filter to published and featured', async () => {
    await fetchFeaturedProjects(3)
    expect(hasEq('projects', 'status', 'published')).toBe(true)
    expect(hasEq('projects', 'is_featured', true)).toBe(true)
  })

  it('project detail filters by slug and published status', async () => {
    state.setResult({ data: null, error: null })
    expect(await fetchProjectBySlug('my-shop')).toBeNull()
    expect(hasEq('projects', 'slug', 'my-shop')).toBe(true)
    expect(hasEq('projects', 'status', 'published')).toBe(true)
  })

  it('invalid slugs are rejected without querying the database', async () => {
    for (const slug of ['Bad Slug', '../etc/passwd', 'a,b', 'x'.repeat(81), '']) {
      expect(await fetchProjectBySlug(slug)).toBeNull()
    }
    expect(state.queries).toHaveLength(0)
  })

  it('social links and timeline filter to visible rows', async () => {
    state.setResult({ data: { id: 1 }, error: null })
    await fetchSiteData()
    expect(hasEq('social_links', 'is_visible', true)).toBe(true)
    state.setResult({ data: [], error: null })
    await fetchTimeline()
    expect(hasEq('timeline_entries', 'is_visible', true)).toBe(true)
  })

  it('hidden skills are removed from the public skills list', async () => {
    state.setResult({
      data: [
        { id: 'c1', name: 'Frontend', slug: 'frontend', sort_order: 1, skills: [
          { id: 's1', name: 'React', is_visible: true, sort_order: 2, icon: null, proficiency_note: null },
          { id: 's2', name: 'Secret', is_visible: false, sort_order: 1, icon: null, proficiency_note: null },
        ] },
        { id: 'c2', name: 'Empty', slug: 'empty', sort_order: 2, skills: [{ id: 's3', name: 'Hidden', is_visible: false, sort_order: 1, icon: null, proficiency_note: null }] },
      ],
      error: null,
    })
    const groups = await fetchSkillGroups()
    expect(groups.map((g) => g.name)).toEqual(['Frontend'])
    expect(groups[0]!.skills.map((s) => s.name)).toEqual(['React'])
  })

  it('surfaces database errors as friendly messages', async () => {
    state.setResult({ data: null, error: { code: '42501', message: 'permission denied' } })
    await expect(fetchProjects()).rejects.toThrow('You do not have permission')
  })
})

describe('uploads', () => {
  const pngBytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0])

  it('rejects disallowed files before contacting storage', async () => {
    const exe = new File([new Uint8Array([0x4d, 0x5a, 0, 0])], 'cv.pdf', { type: 'application/pdf' })
    await expect(uploadValidatedFile(exe, FILE_RULES.cv, 'cv')).rejects.toThrow('Unsupported file')
    const huge = new File([new Uint8Array(6 * 1024 * 1024)], 'x.png', { type: 'image/png' })
    await expect(uploadValidatedFile(huge, FILE_RULES.projectImage, 'p')).rejects.toThrow('maximum')
    expect(state.upload).not.toHaveBeenCalled()
  })

  it('stores files under generated names, ignoring the client filename', async () => {
    const file = new File([pngBytes], '../../evil name.php.png', { type: 'text/html' })
    const { path } = await uploadValidatedFile(file, FILE_RULES.projectImage, 'project-123')
    expect(path).toMatch(/^project-123\/[0-9a-f-]{36}\.png$/)
    expect(state.upload).toHaveBeenCalledWith(path, expect.anything(), expect.objectContaining({ contentType: 'image/png', upsert: false }))
  })
})
