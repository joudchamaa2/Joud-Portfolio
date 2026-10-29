import { MutationCache, QueryCache, QueryClient } from '@tanstack/react-query'
import { isAuthExpiredError } from './errors'
import { supabase } from './supabase'

function handleAuthExpiry(error: unknown) {
  // A rejected token means the session is gone: sign out locally so the
  // admin guard redirects to the login page with an "expired" notice.
  if (isAuthExpiredError(error)) void supabase.auth.signOut({ scope: 'local' })
}

export function createQueryClient() {
  return new QueryClient({
    queryCache: new QueryCache({ onError: handleAuthExpiry }),
    mutationCache: new MutationCache({ onError: handleAuthExpiry }),
    defaultOptions: {
      queries: {
        staleTime: 60_000,
        refetchOnWindowFocus: false,
        retry: (count, error) => count < 1 && !isAuthExpiredError(error),
      },
      mutations: { retry: false },
    },
  })
}

/** Query keys. Everything under ['admin'] is cleared on sign-out. */
export const qk = {
  site: ['site'] as const,
  projects: (params: object) => ['projects', params] as const,
  projectFilters: ['projects', 'filters'] as const,
  featured: (limit: number) => ['projects', 'featured', limit] as const,
  project: (slug: string) => ['project', slug] as const,
  related: (id: string) => ['project', 'related', id] as const,
  skills: ['skills'] as const,
  timeline: ['timeline'] as const,

  adminStats: ['admin', 'stats'] as const,
  adminProjects: ['admin', 'projects'] as const,
  adminProject: (id: string) => ['admin', 'project', id] as const,
  adminCategories: ['admin', 'project-categories'] as const,
  adminSkills: ['admin', 'skills'] as const,
  adminTimeline: ['admin', 'timeline'] as const,
  adminMessages: (params: object) => ['admin', 'messages', params] as const,
  adminUnread: ['admin', 'messages', 'unread'] as const,
  adminProfile: ['admin', 'profile'] as const,
  adminSocialLinks: ['admin', 'social-links'] as const,
  adminSettings: ['admin', 'settings'] as const,
}
