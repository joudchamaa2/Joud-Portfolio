import { describe, expect, it } from 'vitest'
import { FILE_RULES, sniffFileType, validateFile } from '@/lib/files'
import { emptyToNull, formatRange, monthToDate, paragraphs, sanitizeSearchTerm, slugify, SLUG_PATTERN } from '@/lib/utils'
import { featureLines, isHttpsUrl, projectSchema, settingsSchema, socialLinkSchema, timelineSchema } from '@/lib/validation/schemas'

const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]
const JPEG = [0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0]
const WEBP = [0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50]
const PDF = [0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37]
const EXE = [0x4d, 0x5a, 0x90, 0x00]

const file = (bytes: number[], name: string, type: string, padTo = 0) => {
  const data = new Uint8Array(Math.max(bytes.length, padTo))
  data.set(bytes)
  return new File([data], name, { type })
}

describe('slugify', () => {
  it('produces database-compatible slugs', () => {
    expect(slugify('  My E-Commerce App!  ')).toBe('my-e-commerce-app')
    expect(slugify('Café & Résumé — v2')).toBe('cafe-and-resume-v2')
    expect(slugify('---')).toBe('')
    for (const input of ['Hello World', 'A__B', 'x'.repeat(200), 'Ünïcödé']) {
      const slug = slugify(input)
      expect(slug).toMatch(SLUG_PATTERN)
      expect(slug.length).toBeLessThanOrEqual(80)
    }
  })
})

describe('text helpers', () => {
  it('splits paragraphs on blank lines', () => {
    expect(paragraphs('One\nline two\n\n\nThree')).toEqual(['One\nline two', 'Three'])
    expect(paragraphs(null)).toEqual([])
  })

  it('formats optional date ranges without inventing dates', () => {
    expect(formatRange(null, null)).toBeNull()
    expect(formatRange('2022-09-01', null, true)).toBe('Sep 2022 — Present')
    expect(formatRange('2021-01-01', '2023-06-01')).toBe('Jan 2021 — Jun 2023')
    expect(formatRange(null, '2023-06-01')).toBe('Jun 2023')
  })

  it('converts month inputs and empty strings', () => {
    expect(monthToDate('2024-03')).toBe('2024-03-01')
    expect(monthToDate('')).toBeNull()
    expect(emptyToNull({ a: '  ', b: ' x ', c: 3 })).toEqual({ a: null, b: 'x', c: 3 })
  })

  it('strips PostgREST filter syntax from search terms', () => {
    expect(sanitizeSearchTerm('a,b),name.eq.x*%')).toBe('a b name.eq.x')
  })
})

describe('file validation', () => {
  it('detects real file types from signatures', async () => {
    expect(await sniffFileType(file(PNG, 'a.png', 'image/png'))).toBe('image/png')
    expect(await sniffFileType(file(JPEG, 'a.jpg', 'image/jpeg'))).toBe('image/jpeg')
    expect(await sniffFileType(file(WEBP, 'a.webp', 'image/webp'))).toBe('image/webp')
    expect(await sniffFileType(file(PDF, 'a.pdf', 'application/pdf'))).toBe('application/pdf')
    expect(await sniffFileType(file(EXE, 'a.png', 'image/png'))).toBeNull()
  })

  it('rejects renamed executables even with an image name and MIME type', async () => {
    const result = await validateFile(file(EXE, 'photo.png', 'image/png'), FILE_RULES.projectImage)
    expect(result).toEqual({ ok: false, error: expect.stringContaining('Unsupported file') })
  })

  it('rejects oversized and empty files', async () => {
    const big = file(PNG, 'big.png', 'image/png', FILE_RULES.profileAsset.maxBytes + 1)
    expect((await validateFile(big, FILE_RULES.profileAsset)).ok).toBe(false)
    expect((await validateFile(new File([], 'e.png'), FILE_RULES.projectImage)).ok).toBe(false)
  })

  it('accepts only PDFs for the CV and only images for galleries', async () => {
    expect(await validateFile(file(PDF, 'cv.pdf', 'application/pdf'), FILE_RULES.cv)).toEqual({ ok: true, type: 'application/pdf' })
    expect((await validateFile(file(PNG, 'cv.pdf', 'application/pdf'), FILE_RULES.cv)).ok).toBe(false)
    expect((await validateFile(file(PDF, 'img.png', 'image/png'), FILE_RULES.projectImage)).ok).toBe(false)
    expect(await validateFile(file(WEBP, 'x.bin', ''), FILE_RULES.projectImage)).toEqual({ ok: true, type: 'image/webp' })
  })
})

describe('form schemas', () => {
  const validProject = {
    title: 'Shop',
    slug: 'shop',
    summary: 'An online store',
    category_id: '',
    role: '',
    overview: '',
    problem: '',
    objectives: '',
    contribution: '',
    architecture: '',
    challenges: '',
    features: '- Cart\n- Checkout\n\n',
    repo_url: '',
    demo_url: 'https://shop.example.com',
    started_on: '2024-01',
    completed_on: '2024-05',
    is_featured: false,
    thumbnail_alt: '',
    seo_description: '',
  }

  it('accepts a valid project', () => {
    expect(projectSchema.safeParse(validProject).success).toBe(true)
    expect(featureLines(validProject.features)).toEqual(['Cart', 'Checkout'])
  })

  it('rejects malformed slugs, unsafe URLs and reversed dates', () => {
    const issues = (patch: object) => projectSchema.safeParse({ ...validProject, ...patch }).error?.issues.map((i) => i.path[0])
    expect(issues({ slug: 'Bad Slug' })).toEqual(['slug'])
    expect(issues({ slug: 'double--hyphen' })).toEqual(['slug'])
    expect(issues({ repo_url: 'javascript:alert(1)' })).toEqual(['repo_url'])
    expect(issues({ demo_url: 'http://insecure.example' })).toEqual(['demo_url'])
    expect(issues({ completed_on: '2023-01' })).toEqual(['completed_on'])
    expect(issues({ features: Array.from({ length: 31 }, (_, i) => `f${i}`).join('\n') })).toEqual(['features'])
  })

  it('only treats https URLs as valid', () => {
    expect(isHttpsUrl('https://github.com/user/repo')).toBe(true)
    expect(isHttpsUrl('http://github.com')).toBe(false)
    expect(isHttpsUrl('data:text/html,hi')).toBe(false)
    expect(socialLinkSchema.safeParse({ platform: 'github', label: 'GitHub', url: 'ftp://x', is_visible: true }).success).toBe(false)
  })

  it('validates timeline date ranges and ongoing entries', () => {
    const base = { kind: 'experience', title: 'Dev', organization: 'Org', location: '', description: '', credential_url: '', is_visible: true }
    expect(timelineSchema.safeParse({ ...base, start_date: '2024-05', end_date: '2023-01', is_current: false }).success).toBe(false)
    expect(timelineSchema.safeParse({ ...base, start_date: '2024-05', end_date: '2024-06', is_current: true }).success).toBe(false)
    expect(timelineSchema.safeParse({ ...base, start_date: '', end_date: '', is_current: false }).success).toBe(true)
  })

  it('bounds settings values', () => {
    const base = {
      site_title: 'Site', site_description: '', monogram: 'JC', footer_text: '', notification_email: '',
      show_featured_projects: true, show_skills: true, show_education: true, show_about: true, show_contact: true,
    }
    expect(settingsSchema.safeParse({ ...base, featured_limit: 3 }).success).toBe(true)
    expect(settingsSchema.safeParse({ ...base, featured_limit: 50 }).success).toBe(false)
    expect(settingsSchema.safeParse({ ...base, featured_limit: 3, monogram: 'TOOLONG' }).success).toBe(false)
  })
})
