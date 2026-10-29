import { QueryClientProvider } from '@tanstack/react-query'
import { useState } from 'react'
import { RouterProvider } from 'react-router'
import { Toaster } from 'sonner'
import { AuthProvider } from './auth/AuthProvider'
import { isSupabaseConfigured } from './lib/env'
import { createQueryClient } from './lib/query'
import { createRouter } from './router'

function SetupRequired() {
  return (
    <main className="grid min-h-dvh place-items-center px-6">
      <div className="max-w-lg rounded-lg border border-line bg-surface p-8">
        <p className="eyebrow text-gold">Configuration required</p>
        <h1 className="display mt-3 text-3xl text-fg">Connect Supabase</h1>
        <p className="mt-3 text-sm leading-relaxed text-fg-muted">
          Set <code className="font-mono text-fg">VITE_SUPABASE_URL</code> and{' '}
          <code className="font-mono text-fg">VITE_SUPABASE_PUBLISHABLE_KEY</code> in <code className="font-mono text-fg">.env.local</code>{' '}
          (or in your Vercel project settings), then restart or redeploy. See the README for setup steps.
        </p>
      </div>
    </main>
  )
}

export default function App() {
  const [queryClient] = useState(createQueryClient)
  const [router] = useState(createRouter)

  if (!isSupabaseConfigured) return <SetupRequired />

  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <RouterProvider router={router} />
      </AuthProvider>
      <Toaster
        theme="dark"
        position="bottom-right"
        toastOptions={{
          classNames: {
            toast: '!bg-surface !border-line !text-fg !font-sans',
            description: '!text-fg-muted',
          },
        }}
      />
    </QueryClientProvider>
  )
}
