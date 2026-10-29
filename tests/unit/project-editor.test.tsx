import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import * as admin from '@/lib/api/admin'
import ProjectEditorPage from '@/pages/admin/ProjectEditorPage'
import { projectDetail } from './fixtures'
import { renderRoute } from './render'

vi.mock('@/lib/api/admin', async (orig) => ({
  ...(await orig<typeof import('@/lib/api/admin')>()),
  listProjectCategories: vi.fn(),
  listAdminSkillGroups: vi.fn(),
  getAdminProject: vi.fn(),
  isSlugAvailable: vi.fn(),
  createProject: vi.fn(),
  updateProject: vi.fn(),
  setProjectSkills: vi.fn(),
}))

const editorRoutes = [{ path: '/admin/projects/:id', element: <ProjectEditorPage /> }]

beforeEach(() => {
  vi.mocked(admin.listProjectCategories).mockResolvedValue([
    { id: 'c1', name: 'Web Application', slug: 'web-application', sort_order: 1, projects: [{ count: 0 }] },
  ])
  vi.mocked(admin.listAdminSkillGroups).mockResolvedValue([
    {
      id: 'g1', name: 'Frameworks', slug: 'frameworks', sort_order: 1,
      skills: [{ id: 's1', name: 'React', icon: null, proficiency_note: null, sort_order: 1, is_visible: true, category_id: 'g1' }],
    },
  ])
  vi.mocked(admin.isSlugAvailable).mockResolvedValue(true)
  vi.mocked(admin.createProject).mockResolvedValue('new-id')
  vi.mocked(admin.setProjectSkills).mockResolvedValue()
  vi.mocked(admin.updateProject).mockResolvedValue()
})

describe('project editor — create', () => {
  const renderNew = () => renderRoute(<ProjectEditorPage />, { path: '/admin/projects/new', extraRoutes: editorRoutes })

  it('generates the slug from the title and publishes with tags', async () => {
    const { router } = renderNew()
    await userEvent.type(await screen.findByLabelText(/^Title/), 'My Online Shop!')
    expect(screen.getByLabelText(/^Slug/)).toHaveValue('my-online-shop')

    await userEvent.type(screen.getByLabelText(/^Summary/), 'A storefront built with Laravel.')
    await userEvent.type(screen.getByLabelText(/^Main features/), '- Cart\n- Checkout')
    await userEvent.selectOptions(screen.getByLabelText('Category'), 'c1')
    await userEvent.type(screen.getByLabelText('Search technologies'), 'Rea')
    await userEvent.click(await screen.findByRole('button', { name: 'React' }))
    await userEvent.click(screen.getByRole('button', { name: /^Publish$/ }))

    await waitFor(() => expect(admin.createProject).toHaveBeenCalled())
    expect(admin.createProject).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'My Online Shop!',
        slug: 'my-online-shop',
        status: 'published',
        category_id: 'c1',
        features: ['Cart', 'Checkout'],
        repo_url: null,
        overview: null,
      }),
    )
    expect(admin.setProjectSkills).toHaveBeenCalledWith('new-id', ['s1'])
    await waitFor(() => expect(router.state.location.pathname).toBe('/admin/projects/new-id'))
  })

  it('saves drafts as drafts', async () => {
    renderNew()
    await userEvent.type(await screen.findByLabelText(/^Title/), 'Job Board')
    await userEvent.type(screen.getByLabelText(/^Summary/), 'Job platform.')
    await userEvent.click(screen.getByRole('button', { name: /Save draft/ }))
    await waitFor(() => expect(admin.createProject).toHaveBeenCalledWith(expect.objectContaining({ status: 'draft', slug: 'job-board' })))
  })

  it('refuses a slug that is already taken', async () => {
    vi.mocked(admin.isSlugAvailable).mockResolvedValue(false)
    renderNew()
    await userEvent.type(await screen.findByLabelText(/^Title/), 'Shop')
    await userEvent.type(screen.getByLabelText(/^Summary/), 'Duplicate.')
    await userEvent.click(screen.getByRole('button', { name: /Save draft/ }))
    expect(await screen.findByText('This slug is already used by another project.')).toBeInTheDocument()
    expect(admin.createProject).not.toHaveBeenCalled()
  })

  it('blocks invalid input', async () => {
    renderNew()
    await userEvent.type(await screen.findByLabelText(/^Title/), 'X')
    await userEvent.clear(screen.getByLabelText(/^Slug/))
    await userEvent.type(screen.getByLabelText(/^Slug/), 'Not A Slug')
    await userEvent.type(screen.getByLabelText('Public repository URL'), 'javascript:alert(1)')
    await userEvent.click(screen.getByRole('button', { name: /Save draft/ }))
    expect(await screen.findByText('Use lowercase letters, numbers and single hyphens only.')).toBeInTheDocument()
    expect(screen.getByText('Enter a full URL starting with https://')).toBeInTheDocument()
    expect(screen.getByText('A short summary is required.')).toBeInTheDocument()
    expect(admin.createProject).not.toHaveBeenCalled()
  })

  it('asks to save before uploading images', async () => {
    renderNew()
    expect(await screen.findByText('Save the project first')).toBeInTheDocument()
  })
})

describe('project editor — edit', () => {
  it('loads an existing project, keeps its slug and saves changes', async () => {
    vi.mocked(admin.getAdminProject).mockResolvedValue({ ...projectDetail(), status: 'draft' })
    renderRoute(<ProjectEditorPage />, { path: '/admin/projects/:id', url: '/admin/projects/p1' })

    const title = await screen.findByLabelText(/^Title/)
    expect(title).toHaveValue('Online Shop')
    expect(screen.getByLabelText('Category')).toHaveValue('c1')
    await userEvent.clear(title)
    await userEvent.type(title, 'Online Shop v2')
    // Slugs of existing projects never change implicitly (links would break).
    expect(screen.getByLabelText(/^Slug/)).toHaveValue('online-shop')

    await userEvent.click(screen.getByRole('button', { name: /Save changes/ }))
    await waitFor(() =>
      // category_id guards against the select dropping its value while options load.
      expect(admin.updateProject).toHaveBeenCalledWith('p1', expect.objectContaining({ title: 'Online Shop v2', slug: 'online-shop', status: 'draft', category_id: 'c1' })),
    )
    expect(admin.isSlugAvailable).toHaveBeenCalledWith('online-shop', 'p1')
    expect(admin.setProjectSkills).toHaveBeenCalledWith('p1', ['s1', 's2'])
  })

  it('publishes a draft', async () => {
    vi.mocked(admin.getAdminProject).mockResolvedValue({ ...projectDetail(), status: 'draft' })
    renderRoute(<ProjectEditorPage />, { path: '/admin/projects/:id', url: '/admin/projects/p1' })
    await userEvent.click(await screen.findByRole('button', { name: /Save & publish/ }))
    await waitFor(() => expect(admin.updateProject).toHaveBeenCalledWith('p1', expect.objectContaining({ status: 'published' })))
  })

  it('shows a not-found state for unknown ids', async () => {
    vi.mocked(admin.getAdminProject).mockResolvedValue(null)
    renderRoute(<ProjectEditorPage />, { path: '/admin/projects/:id', url: '/admin/projects/missing' })
    expect(await screen.findByText('Project not found')).toBeInTheDocument()
  })
})
