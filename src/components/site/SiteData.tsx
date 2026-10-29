import { useQuery } from '@tanstack/react-query'
import { createContext, use, useEffect, type ReactNode } from 'react'
import { fetchSiteData, type SiteData } from '@/lib/api/public'
import { qk } from '@/lib/query'
import { publicUrl } from '@/lib/storage'
import { Button } from '../ui/button'
import { Spinner } from '../ui/misc'

const SiteDataContext = createContext<SiteData | null>(null)

/** Loads settings, profile and social links once for the whole site. */
export function SiteDataProvider({ children }: { children: ReactNode }) {
  const query = useQuery({ queryKey: qk.site, queryFn: fetchSiteData, staleTime: 5 * 60_000 })

  const faviconPath = query.data?.settings.favicon_path
  useEffect(() => {
    const href = publicUrl('profile-assets', faviconPath)
    if (!href) return
    const link = document.querySelector<HTMLLinkElement>('link[rel="icon"]')
    if (link) {
      link.href = href
      link.type = ''
    }
  }, [faviconPath])

  if (query.isPending) return <Spinner className="min-h-dvh" />
  if (query.isError) {
    return (
      <main className="grid min-h-dvh place-items-center px-6 text-center">
        <div className="max-w-sm">
          <p className="font-display text-2xl text-fg">This page could not load</p>
          <p className="mt-2 text-sm text-fg-muted">The portfolio content is temporarily unavailable. Please try again shortly.</p>
          <Button className="mt-6" variant="secondary" onClick={() => void query.refetch()}>
            Try again
          </Button>
        </div>
      </main>
    )
  }
  return <SiteDataContext value={query.data}>{children}</SiteDataContext>
}

export function useSiteData(): SiteData {
  const ctx = use(SiteDataContext)
  if (!ctx) throw new Error('useSiteData must be used within SiteDataProvider')
  return ctx
}
