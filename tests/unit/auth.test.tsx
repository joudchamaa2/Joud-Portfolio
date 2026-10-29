import { act, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AuthProvider } from '@/auth/AuthProvider'
import { RequireAdmin } from '@/auth/RequireAdmin'
import * as adminApi from '@/lib/api/admin'
import LoginPage from '@/pages/admin/LoginPage'
import { renderRoute } from './render'

type Listener = (event: string, session: unknown) => void

const auth = vi.hoisted(() => {
  const state = { session: null as unknown, listener: null as Listener | null }
  return {
    state,
    client: {
      getSession: vi.fn(async () => ({ data: { session: state.session } })),
      onAuthStateChange: vi.fn((cb: Listener) => {
        state.listener = cb
        return { data: { subscription: { unsubscribe: vi.fn() } } }
      }),
      signInWithPassword: vi.fn(),
      signOut: vi.fn(async () => {
        state.session = null
        state.listener?.('SIGNED_OUT', null)
        return { error: null }
      }),
    },
  }
})

vi.mock('@/lib/supabase', () => ({ supabase: { auth: auth.client } }))
vi.mock('@/lib/api/admin', async (orig) => ({ ...(await orig<typeof import('@/lib/api/admin')>()), checkIsAdmin: vi.fn() }))

const session = (id = 'user-1') => ({ user: { id, email: 'owner@example.com' }, access_token: 't' })
const withAuth = (children: React.ReactNode) => <AuthProvider>{children}</AuthProvider>
const loginRoute = { path: '/admin/login', element: <LoginPage /> }

function renderProtected(url = '/admin/projects') {
  return renderRoute(
    <RequireAdmin>
      <p>Secret admin content</p>
    </RequireAdmin>,
    { path: '/admin/*', url, extraRoutes: [loginRoute], wrapper: withAuth },
  )
}

beforeEach(() => {
  auth.state.session = null
  auth.state.listener = null
})

describe('admin route guard', () => {
  it('redirects anonymous visitors to the login page, remembering the destination', async () => {
    const { router } = renderProtected()
    expect(await screen.findByRole('heading', { name: 'Administrator sign in' })).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/admin/login')
    expect(new URLSearchParams(router.state.location.search).get('next')).toBe('/admin/projects')
    expect(screen.queryByText('Secret admin content')).not.toBeInTheDocument()
  })

  it('denies signed-in users who are not in the admins table', async () => {
    auth.state.session = session()
    vi.mocked(adminApi.checkIsAdmin).mockResolvedValue(false)
    renderProtected()
    expect(await screen.findByRole('heading', { name: 'Access denied' })).toBeInTheDocument()
    expect(screen.queryByText('Secret admin content')).not.toBeInTheDocument()
  })

  it('treats a failed admin check as not authorised', async () => {
    auth.state.session = session()
    vi.mocked(adminApi.checkIsAdmin).mockRejectedValue(new Error('network'))
    renderProtected()
    expect(await screen.findByRole('heading', { name: 'Access denied' })).toBeInTheDocument()
  })

  it('renders protected content for administrators', async () => {
    auth.state.session = session()
    vi.mocked(adminApi.checkIsAdmin).mockResolvedValue(true)
    renderProtected()
    expect(await screen.findByText('Secret admin content')).toBeInTheDocument()
  })

  it('sends users back to login with an "expired" notice when the session ends on its own', async () => {
    auth.state.session = session()
    vi.mocked(adminApi.checkIsAdmin).mockResolvedValue(true)
    const { router } = renderProtected()
    await screen.findByText('Secret admin content')

    act(() => auth.state.listener?.('SIGNED_OUT', null))

    expect(await screen.findByText('Your session has expired. Please sign in again.')).toBeInTheDocument()
    expect(new URLSearchParams(router.state.location.search).get('reason')).toBe('expired')
  })

  it('signs out locally from the access-denied screen', async () => {
    auth.state.session = session()
    vi.mocked(adminApi.checkIsAdmin).mockResolvedValue(false)
    renderProtected()
    await userEvent.click(await screen.findByRole('button', { name: 'Sign out' }))
    expect(auth.client.signOut).toHaveBeenCalledWith({ scope: 'local' })
    expect(await screen.findByRole('heading', { name: 'Administrator sign in' })).toBeInTheDocument()
    // A deliberate sign-out is not reported as an expired session.
    expect(screen.queryByText(/session has expired/)).not.toBeInTheDocument()
  })
})

describe('login page', () => {
  const renderLogin = (url = '/admin/login') =>
    renderRoute(<LoginPage />, { path: '/admin/login', url, extraRoutes: [{ path: '/admin/*', element: <p>Dashboard</p> }], wrapper: withAuth })

  it('validates input', async () => {
    renderLogin()
    await userEvent.click(await screen.findByRole('button', { name: 'Sign in' }))
    expect(await screen.findByText('Enter your email.')).toBeInTheDocument()
    expect(screen.getByText('Enter your password.')).toBeInTheDocument()
    expect(auth.client.signInWithPassword).not.toHaveBeenCalled()
  })

  async function submit(email = 'owner@example.com', password = 'correct horse') {
    await userEvent.type(await screen.findByLabelText('Email'), email)
    await userEvent.type(screen.getByLabelText('Password'), password)
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }))
  }

  it('shows a generic error for wrong credentials', async () => {
    auth.client.signInWithPassword.mockResolvedValue({ data: { session: null }, error: { status: 400, message: 'Invalid login credentials' } })
    renderLogin()
    await submit()
    expect(await screen.findByText('Invalid email or password.')).toBeInTheDocument()
  })

  it('signs non-admin accounts straight back out', async () => {
    auth.client.signInWithPassword.mockImplementation(async () => {
      auth.state.session = session('user-2')
      auth.state.listener?.('SIGNED_IN', auth.state.session)
      return { data: { session: auth.state.session }, error: null }
    })
    vi.mocked(adminApi.checkIsAdmin).mockResolvedValue(false)
    renderLogin()
    await submit()
    expect(await screen.findByText('This account does not have administrator access.')).toBeInTheDocument()
    expect(auth.client.signOut).toHaveBeenCalled()
  })

  it('signs administrators in and continues to the requested page', async () => {
    auth.client.signInWithPassword.mockImplementation(async () => {
      auth.state.session = session()
      auth.state.listener?.('SIGNED_IN', auth.state.session)
      return { data: { session: auth.state.session }, error: null }
    })
    vi.mocked(adminApi.checkIsAdmin).mockResolvedValue(true)
    const { router } = renderLogin('/admin/login?next=%2Fadmin%2Fmessages')
    await submit()
    await waitFor(() => expect(router.state.location.pathname).toBe('/admin/messages'))
    expect(auth.client.signInWithPassword).toHaveBeenCalledWith({ email: 'owner@example.com', password: 'correct horse' })
  })

  it('ignores off-site redirect targets', async () => {
    auth.client.signInWithPassword.mockImplementation(async () => {
      auth.state.session = session()
      auth.state.listener?.('SIGNED_IN', auth.state.session)
      return { data: { session: auth.state.session }, error: null }
    })
    vi.mocked(adminApi.checkIsAdmin).mockResolvedValue(true)
    const { router } = renderLogin('/admin/login?next=%2F%2Fevil.example%2Fadmin')
    await submit()
    await waitFor(() => expect(router.state.location.pathname).toBe('/admin'))
  })
})
