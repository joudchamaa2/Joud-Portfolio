import { Menu } from 'lucide-react'
import { useState } from 'react'
import { Link, NavLink, Outlet, ScrollRestoration } from 'react-router'
import { CvButton, SocialLinks } from '@/components/site/primitives'
import { useSiteData } from '@/components/site/SiteData'
import { Button } from '@/components/ui/button'
import { Sheet } from '@/components/ui/dialog'
import { publicUrl } from '@/lib/storage'
import { cn } from '@/lib/utils'

// Evaluated once per page load; fine for a copyright year.
const YEAR = new Date().getFullYear()

const NAV = [
  { to: '/projects', label: 'Work' },
  { to: '/about', label: 'About' },
  { to: '/skills', label: 'Skills' },
  { to: '/experience', label: 'Experience' },
  { to: '/contact', label: 'Contact' },
]

function Brand() {
  const { settings, profile } = useSiteData()
  const logo = publicUrl('profile-assets', settings.logo_path)
  return (
    <Link to="/" className="group flex items-center gap-3" aria-label={`${profile.full_name} — home`}>
      {logo ? (
        <img src={logo} alt="" className="size-9 rounded-md object-cover" />
      ) : (
        <span className="grid size-9 place-items-center rounded-md border border-gold/50 font-display text-[15px] font-semibold text-fg transition-colors group-hover:border-gold">
          {settings.monogram}
        </span>
      )}
      <span className="hidden text-sm font-medium tracking-tight text-fg sm:inline">{profile.full_name}</span>
    </Link>
  )
}

function SiteHeader() {
  const { settings } = useSiteData()
  const [open, setOpen] = useState(false)
  const navLink = ({ isActive }: { isActive: boolean }) =>
    cn('text-sm transition-colors hover:text-fg', isActive ? 'text-fg' : 'text-fg-muted')

  return (
    <header className="sticky top-0 z-40 border-b border-line/70 bg-bg/85 backdrop-blur-md">
      <div className="container-page flex h-16 items-center justify-between gap-6">
        <Brand />
        <nav aria-label="Main" className="hidden items-center gap-8 md:flex">
          {NAV.map((item) => (
            <NavLink key={item.to} to={item.to} className={navLink}>
              {item.label}
            </NavLink>
          ))}
          {settings.cv_published && <CvButton size="sm" />}
        </nav>
        <Button variant="ghost" size="icon" className="md:hidden" aria-label="Open menu" onClick={() => setOpen(true)}>
          <Menu />
        </Button>
      </div>
      <Sheet open={open} onOpenChange={setOpen} title="Menu">
        <div className="mb-8">
          <Brand />
        </div>
        <nav aria-label="Mobile" className="grid gap-1">
          {NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              onClick={() => setOpen(false)}
              className={({ isActive }) =>
                cn('rounded-md px-3 py-2.5 font-display text-xl', isActive ? 'bg-surface-3 text-fg' : 'text-fg-muted')
              }
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
        {settings.cv_published && <CvButton className="mt-8" />}
      </Sheet>
    </header>
  )
}

function SiteFooter() {
  const { settings, profile, socialLinks } = useSiteData()
  return (
    <footer className="border-t border-line">
      <div className="container-page flex flex-col gap-6 py-10 md:flex-row md:items-center md:justify-between">
        <div className="grid gap-1">
          <p className="text-sm text-fg">
            © {YEAR} {profile.full_name}
          </p>
          {settings.footer_text && <p className="text-[13px] text-fg-subtle">{settings.footer_text}</p>}
        </div>
        <SocialLinks links={socialLinks} />
      </div>
    </footer>
  )
}

export function PublicLayout() {
  return (
    <div className="flex min-h-dvh flex-col">
      <a href="#main" className="sr-only z-50 rounded-md bg-gold px-4 py-2 text-bg focus:not-sr-only focus:fixed focus:top-3 focus:left-3">
        Skip to content
      </a>
      <SiteHeader />
      <main id="main" className="flex-1">
        <Outlet />
      </main>
      <SiteFooter />
      <ScrollRestoration />
    </div>
  )
}
