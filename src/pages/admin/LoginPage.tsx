import { zodResolver } from '@hookform/resolvers/zod'
import { ArrowLeft, Lock } from 'lucide-react'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router'
import { useAuth } from '@/auth/AuthProvider'
import { Button } from '@/components/ui/button'
import { Field, Input } from '@/components/ui/form'
import { Spinner } from '@/components/ui/misc'
import { loginSchema, type LoginValues } from '@/lib/validation/schemas'

/** Only allow same-site admin paths as post-login redirects. */
function safeNext(next: string | null): string {
  return next && /^\/admin(\/[\w\-/?=&%.]*)?$/.test(next) && !next.startsWith('//') ? next : '/admin'
}

export default function LoginPage() {
  const { status, isAdmin, signIn } = useAuth()
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const next = safeNext(params.get('next'))
  const [error, setError] = useState<string | null>(null)

  const form = useForm<LoginValues>({ resolver: zodResolver(loginSchema), defaultValues: { email: '', password: '' } })
  const { register, handleSubmit, formState } = form

  if (status === 'loading' || (status === 'signed-in' && isAdmin === null && !formState.isSubmitting)) {
    return <Spinner className="min-h-dvh" />
  }
  if (status === 'signed-in' && isAdmin && !formState.isSubmitting) return <Navigate to={next} replace />

  async function onSubmit(values: LoginValues) {
    setError(null)
    const result = await signIn(values.email, values.password)
    if (result.error) setError(result.error)
    else navigate(next, { replace: true })
  }

  return (
    <main className="grid min-h-dvh place-items-center px-4 py-12">
      <title>Sign in · Admin</title>
      <meta name="robots" content="noindex, nofollow" />
      <div className="w-full max-w-sm">
        <Link to="/" className="mb-10 inline-flex items-center gap-1.5 text-sm text-fg-subtle hover:text-fg">
          <ArrowLeft className="size-4" aria-hidden /> Back to site
        </Link>
        <div className="rounded-lg border border-line bg-surface p-7">
          <span className="grid size-10 place-items-center rounded-md border border-gold/50">
            <Lock className="size-4 text-gold" aria-hidden />
          </span>
          <h1 className="mt-5 font-display text-2xl text-fg">Administrator sign in</h1>
          <p className="mt-1 text-sm text-fg-muted">Restricted area. Accounts are provisioned manually.</p>

          {params.get('reason') === 'expired' && !error && (
            <p role="status" className="mt-5 rounded-md border border-gold/30 bg-gold/5 px-3 py-2.5 text-sm text-fg">
              Your session has expired. Please sign in again.
            </p>
          )}

          <form noValidate onSubmit={handleSubmit(onSubmit)} className="mt-6 grid gap-4">
            <Field label="Email" error={formState.errors.email?.message}>
              {({ id, describedBy, invalid }) => (
                <Input id={id} type="email" autoComplete="username" aria-describedby={describedBy} aria-invalid={invalid} {...register('email')} />
              )}
            </Field>
            <Field label="Password" error={formState.errors.password?.message}>
              {({ id, describedBy, invalid }) => (
                <Input
                  id={id}
                  type="password"
                  autoComplete="current-password"
                  aria-describedby={describedBy}
                  aria-invalid={invalid}
                  {...register('password')}
                />
              )}
            </Field>
            {error && (
              <p role="alert" className="rounded-md border border-danger/30 bg-danger/5 px-3 py-2.5 text-sm text-danger">
                {error}
              </p>
            )}
            <Button type="submit" className="mt-2" loading={formState.isSubmitting}>
              Sign in
            </Button>
          </form>
        </div>
      </div>
    </main>
  )
}
