import { ShieldAlert } from 'lucide-react'
import type { ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router'
import { Button } from '@/components/ui/button'
import { Spinner } from '@/components/ui/misc'
import { useAuth } from './AuthProvider'

/**
 * Client-side gate for the admin area. This only controls what is rendered;
 * the actual protection is Row Level Security on every table and bucket.
 */
export function RequireAdmin({ children }: { children: ReactNode }) {
  const { status, isAdmin, sessionExpired, signOut } = useAuth()
  const location = useLocation()

  if (status === 'loading' || (status === 'signed-in' && isAdmin === null)) {
    return <Spinner label="Checking access" className="min-h-dvh" />
  }

  if (status === 'signed-out') {
    const params = new URLSearchParams({ next: location.pathname + location.search })
    if (sessionExpired) params.set('reason', 'expired')
    return <Navigate to={`/admin/login?${params.toString()}`} replace />
  }

  if (!isAdmin) {
    return (
      <main className="grid min-h-dvh place-items-center px-6">
        <div className="max-w-sm text-center">
          <ShieldAlert className="mx-auto mb-4 size-7 text-danger" aria-hidden />
          <h1 className="font-display text-2xl text-fg">Access denied</h1>
          <p className="mt-2 text-sm text-fg-muted">This account is signed in but is not an administrator.</p>
          <Button className="mt-6" variant="secondary" onClick={() => void signOut()}>
            Sign out
          </Button>
        </div>
      </main>
    )
  }

  return children
}
