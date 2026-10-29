import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { SiteDataProvider } from '@/components/site/SiteData'
import * as api from '@/lib/api/public'
import ContactPage from '@/pages/public/ContactPage'
import ProjectDetailPage from '@/pages/public/ProjectDetailPage'
import ProjectsPage from '@/pages/public/ProjectsPage'
import { projectCard, projectDetail, siteData } from './fixtures'
import { renderRoute } from './render'

vi.mock('@/lib/api/public', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/api/public')>()),
  fetchSiteData: vi.fn(),
  fetchProjects: vi.fn(),
  fetchProjectFilters: vi.fn(),
  fetchProjectBySlug: vi.fn(),
  fetchRelatedProjects: vi.fn(),
  submitContactMessage: vi.fn(),
}))

const withSite = (children: React.ReactNode) => <SiteDataProvider>{children}</SiteDataProvider>

beforeEach(() => {
  vi.mocked(api.fetchSiteData).mockResolvedValue(siteData)
  vi.mocked(api.fetchProjectFilters).mockResolvedValue({
    categories: [{ id: 'c1', name: 'Web Application', slug: 'web-application' }],
    skills: [{ id: 's1', name: 'React' }],
  })
  vi.mocked(api.fetchRelatedProjects).mockResolvedValue([])
})

describe('Projects page', () => {
  it('lists projects with links to their pages and ordered tags', async () => {
    vi.mocked(api.fetchProjects).mockResolvedValue({ items: [projectCard()], total: 1 })
    renderRoute(<ProjectsPage />, { path: '/projects', wrapper: withSite })

    const link = await screen.findByRole('link', { name: 'Online Shop' })
    expect(link).toHaveAttribute('href', '/projects/online-shop')
    const tags = screen.getByRole('list', { name: 'Technologies' })
    expect(within(tags).getAllByRole('listitem').map((li) => li.textContent)).toEqual(['React', 'Laravel'])
  })

  it('shows an empty state when nothing is published', async () => {
    vi.mocked(api.fetchProjects).mockResolvedValue({ items: [], total: 0 })
    renderRoute(<ProjectsPage />, { path: '/projects', wrapper: withSite })
    expect(await screen.findByText('Projects are on their way')).toBeInTheDocument()
  })

  it('passes category and technology filters from the URL', async () => {
    vi.mocked(api.fetchProjects).mockResolvedValue({ items: [projectCard()], total: 1 })
    renderRoute(<ProjectsPage />, { path: '/projects', url: '/projects?category=web-application&tech=react&sort=title', wrapper: withSite })
    await screen.findByRole('link', { name: 'Online Shop' })
    expect(api.fetchProjects).toHaveBeenCalledWith({ categoryId: 'c1', skillId: 's1', sort: 'title', page: 1 })
  })

  it('treats unknown filter values as no results instead of showing everything', async () => {
    renderRoute(<ProjectsPage />, { path: '/projects', url: '/projects?tech=cobol', wrapper: withSite })
    expect(await screen.findByText('No projects match these filters')).toBeInTheDocument()
    expect(api.fetchProjects).not.toHaveBeenCalled()
  })

  it('updates the URL when a category is chosen', async () => {
    vi.mocked(api.fetchProjects).mockResolvedValue({ items: [projectCard()], total: 1 })
    const { router } = renderRoute(<ProjectsPage />, { path: '/projects', wrapper: withSite })
    await userEvent.click(await screen.findByRole('button', { name: 'Web Application' }))
    expect(router.state.location.search).toBe('?category=web-application')
  })
})

describe('Project detail page', () => {
  it('shows a not-found page for unknown or unpublished slugs', async () => {
    vi.mocked(api.fetchProjectBySlug).mockResolvedValue(null)
    renderRoute(<ProjectDetailPage />, { path: '/projects/:slug', url: '/projects/secret-draft', wrapper: withSite })
    expect(await screen.findByRole('heading', { name: 'Project not found' })).toBeInTheDocument()
    expect(api.fetchProjectBySlug).toHaveBeenCalledWith('secret-draft')
  })

  it('renders only sections that have content and labels mockups', async () => {
    vi.mocked(api.fetchProjectBySlug).mockResolvedValue(projectDetail())
    renderRoute(<ProjectDetailPage />, { path: '/projects/:slug', url: '/projects/online-shop', wrapper: withSite })

    expect(await screen.findByRole('heading', { level: 1, name: 'Online Shop' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Overview' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'My contribution' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'The problem' })).not.toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Architecture' })).not.toBeInTheDocument()
    expect(screen.getByText('Concept mockup')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Source code/ })).toHaveAttribute('href', 'https://github.com/example/shop')
    expect(screen.queryByRole('link', { name: /Live demo/ })).not.toBeInTheDocument()
  })

  it('renders admin-authored text as text, never as HTML', async () => {
    vi.mocked(api.fetchProjectBySlug).mockResolvedValue(projectDetail({ overview: '<img src=x onerror=alert(1)> <b>bold</b>' }))
    const { container } = renderRoute(<ProjectDetailPage />, { path: '/projects/:slug', url: '/projects/online-shop', wrapper: withSite })
    expect(await screen.findByText('<img src=x onerror=alert(1)> <b>bold</b>')).toBeInTheDocument()
    expect(container.querySelector('img[src="x"]')).toBeNull()
    expect(container.querySelector('b')).toBeNull()
  })
})

describe('Contact form', () => {
  it('validates fields before submitting', async () => {
    renderRoute(<ContactPage />, { path: '/contact', wrapper: withSite })
    await userEvent.click(await screen.findByRole('button', { name: /send message/i }))
    expect(await screen.findByText('Please enter your name.')).toBeInTheDocument()
    expect(screen.getByText('Please enter a valid email address.')).toBeInTheDocument()
    expect(screen.getByText(/at least 10 characters/)).toBeInTheDocument()
    expect(api.submitContactMessage).not.toHaveBeenCalled()
  })

  it('includes a hidden honeypot field', async () => {
    renderRoute(<ContactPage />, { path: '/contact', wrapper: withSite })
    const honeypot = await screen.findByLabelText('Website')
    expect(honeypot).toHaveAttribute('tabindex', '-1')
    expect(honeypot.closest('[aria-hidden="true"]')).not.toBeNull()
  })

  async function fill() {
    await userEvent.type(await screen.findByLabelText(/^Name/), 'Ada')
    await userEvent.type(screen.getByLabelText(/^Email/), 'ada@example.com')
    await userEvent.type(screen.getByLabelText(/^Subject/), 'Hello')
    await userEvent.type(screen.getByLabelText(/^Message/), 'I would like to discuss a role.')
    await userEvent.click(screen.getByRole('button', { name: /send message/i }))
  }

  it('submits and shows a success state', async () => {
    vi.mocked(api.submitContactMessage).mockResolvedValue()
    renderRoute(<ContactPage />, { path: '/contact', wrapper: withSite })
    await fill()
    expect(await screen.findByText('Message sent')).toBeInTheDocument()
    expect(api.submitContactMessage).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Ada', email: 'ada@example.com', website: '', startedAt: expect.any(Number) }),
    )
  })

  it('explains rate limiting and keeps the form', async () => {
    vi.mocked(api.submitContactMessage).mockRejectedValue(Object.assign(new Error('Too many'), { code: 'rate_limited' }))
    renderRoute(<ContactPage />, { path: '/contact', wrapper: withSite })
    await fill()
    expect(await screen.findByText(/sent several messages recently/)).toBeInTheDocument()
    await waitFor(() => expect(screen.getByRole('button', { name: /send message/i })).toBeEnabled())
  })

  it('shows server-side field errors', async () => {
    vi.mocked(api.submitContactMessage).mockRejectedValue(
      Object.assign(new Error('Please correct the highlighted fields.'), { code: 'invalid', fieldErrors: { email: 'Email rejected by server.' } }),
    )
    renderRoute(<ContactPage />, { path: '/contact', wrapper: withSite })
    await fill()
    expect(await screen.findByText('Email rejected by server.')).toBeInTheDocument()
  })
})
