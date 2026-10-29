import type { Session } from '@supabase/supabase-js'
import { useQueryClient } from '@tanstack/react-query'
import { createContext, use, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { checkIsAdmin } from '@/lib/api/admin'
import { supabase } from '@/lib/supabase'

type Status = 'loading' | 'signed-out' | 'signed-in'

type AuthContextValue = {
  status: Status
  session: Session | null
  /** null while the admin check is in flight. */
  isAdmin: boolean | null
  /** True when the session ended without the user signing out. */
  sessionExpired: boolean
  signIn: (email: string, password: string) => Promise<{ error?: string }>
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient()
  const [status, setStatus] = useState<Status>('loading')
  const [session, setSession] = useState<Session | null>(null)
  // The admin check result is tied to the user it was computed for, so a
  // different (or no) user never inherits a previous user's status.
  const [adminCheck, setAdminCheck] = useState<{ userId: string; isAdmin: boolean } | null>(null)
  const [sessionExpired, setSessionExpired] = useState(false)
  const manualSignOut = useRef(false)
  const userId = session?.user.id ?? null
  const isAdmin = userId && adminCheck?.userId === userId ? adminCheck.isAdmin : null

  useEffect(() => {
    let active = true
    supabase.auth.getSession().then(({ data }) => {
      if (!active) return
      setSession(data.session)
      setStatus(data.session ? 'signed-in' : 'signed-out')
    })
    // Keep this callback synchronous: supabase-js warns against awaiting
    // other Supabase calls inside it.
    const { data: listener } = supabase.auth.onAuthStateChange((event, next) => {
      setSession(next)
      setStatus(next ? 'signed-in' : 'signed-out')
      if (event === 'SIGNED_OUT') {
        if (!manualSignOut.current) setSessionExpired(true)
        manualSignOut.current = false
        setAdminCheck(null)
        queryClient.removeQueries({ queryKey: ['admin'] })
      }
      if (event === 'SIGNED_IN') setSessionExpired(false)
    })
    return () => {
      active = false
      listener.subscription.unsubscribe()
    }
  }, [queryClient])

  // Verify admin rights against the admins table whenever the user changes.
  useEffect(() => {
    if (!userId) return
    let active = true
    checkIsAdmin()
      .then((value) => active && setAdminCheck({ userId, isAdmin: value }))
      .catch(() => active && setAdminCheck({ userId, isAdmin: false }))
    return () => {
      active = false
    }
  }, [userId])

  const signOut = useCallback(async () => {
    manualSignOut.current = true
    await supabase.auth.signOut({ scope: 'local' })
    setSessionExpired(false)
  }, [])

  const signIn = useCallback(
    async (email: string, password: string) => {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password })
      if (error || !data.session) {
        // Deliberately generic: do not reveal whether the account exists.
        return { error: error?.status === 429 ? 'Too many attempts. Please wait a moment and try again.' : 'Invalid email or password.' }
      }
      let admin = false
      try {
        admin = await checkIsAdmin()
      } catch {
        admin = false
      }
      if (!admin) {
        await signOut()
        return { error: 'This account does not have administrator access.' }
      }
      setAdminCheck({ userId: data.session.user.id, isAdmin: true })
      return {}
    },
    [signOut],
  )

  const value = useMemo(
    () => ({ status, session, isAdmin, sessionExpired, signIn, signOut }),
    [status, session, isAdmin, sessionExpired, signIn, signOut],
  )
  return <AuthContext value={value}>{children}</AuthContext>
}

export function useAuth(): AuthContextValue {
  const ctx = use(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
