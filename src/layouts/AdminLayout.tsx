import { useQuery } from '@tanstack/react-query'
import {
  Bell,
  ChevronRight,
  ExternalLink,
  FolderKanban,
  History,
  Inbox,
  Layers,
  LayoutDashboard,
  LogOut,
  Menu,
  Settings,
  UserRound,
} from 'lucide-react'
import { useState } from 'react'
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router'
import { useAuth } from '@/auth/AuthProvider'
import { Button } from '@/components/ui/button'
import { Sheet } from '@/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown'
import { fetchUnreadMessages } from '@/lib/api/admin'
import { qk } from '@/lib/query'
import { cn, formatDateTime } from '@/lib/utils'

const NAV = [
  { to: '/admin', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/admin/projects', label: 'Projects', icon: FolderKanban },
  { to: '/admin/skills', label: 'Skills', icon: Layers },
  { to: '/admin/timeline', label: 'Education & experience', icon: History },
  { to: '/admin/messages', label: 'Messages', icon: Inbox },
  { to: '/admin/profile', label: 'Profile', icon: UserRound },
  { to: '/admin/settings', label: 'Settings', icon: Settings },
]

const CRUMB_LABELS: Record<string, string> = {
  projects: 'Projects',
  new: 'New project',
  preview: 'Preview',
  skills: 'Skills',
  timeline: 'Education & experience',
  messages: 'Messages',
  profile: 'Profile',
  settings: 'Settings',
}

function useUnread() {
  return useQuery({ queryKey: qk.adminUnread, queryFn: () => fetchUnreadMessages(5), refetchInterval: 60_000 })
}

function SideNav({ onNavigate }: { onNavigate?: () => void }) {
  const unread = useUnread().data?.total ?? 0
  return (
    <nav aria-label="Admin" className="grid gap-0.5">
      {NAV.map(({ to, label, icon: Icon, end }) => (
        <NavLink
          key={to}
          to={to}
          end={end}
          onClick={onNavigate}
          className={({ isActive }) =>
            cn(
              'flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors',
              isActive ? 'bg-surface-3 text-fg' : 'text-fg-muted hover:bg-surface-2 hover:text-fg',
            )
          }
        >
          <Icon className="size-4" aria-hidden />
          <span className="flex-1">{label}</span>
          {to === '/admin/messages' && unread > 0 && (
            <span className="rounded-sm bg-gold px-1.5 font-mono text-[11px] text-bg" aria-label={`${unread} unread`}>
              {unread}
            </span>
          )}
        </NavLink>
      ))}
    </nav>
  )
}

function Breadcrumbs() {
  const { pathname } = useLocation()
  const parts = pathname.split('/').filter(Boolean).slice(1)
  const crumbs = [{ label: 'Admin', to: '/admin' }]
  parts.forEach((part, i) => {
    const to = `/admin/${parts.slice(0, i + 1).join('/')}`
    crumbs.push({ label: CRUMB_LABELS[part] ?? (parts[i - 1] === 'projects' ? 'Edit project' : part), to })
  })
  return (
    <nav aria-label="Breadcrumb" className="hidden min-w-0 sm:block">
      <ol className="flex items-center gap-1.5 text-[13px]">
        {crumbs.map((c, i) => (
          <li key={c.to} className="flex min-w-0 items-center gap-1.5">
            {i > 0 && <ChevronRight className="size-3.5 shrink-0 text-fg-subtle" aria-hidden />}
            {i === crumbs.length - 1 ? (
              <span aria-current="page" className="truncate text-fg">{c.label}</span>
            ) : (
              <Link to={c.to} className="truncate text-fg-subtle hover:text-fg">{c.label}</Link>
            )}
          </li>
        ))}
      </ol>
    </nav>
  )
}

function Notifications() {
  const unread = useUnread()
  const navigate = useNavigate()
  const total = unread.data?.total ?? 0
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="relative" aria-label={`Notifications${total ? `, ${total} unread messages` : ''}`}>
          <Bell />
          {total > 0 && <span className="absolute top-2 right-2 size-2 rounded-full bg-gold" aria-hidden />}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-80">
        <DropdownMenuLabel>{total ? `${total} unread message${total === 1 ? '' : 's'}` : 'No unread messages'}</DropdownMenuLabel>
        {unread.data?.items.map((m) => (
          <DropdownMenuItem key={m.id} onSelect={() => navigate(`/admin/messages?open=${m.id}`)} className="grid gap-0.5">
            <span className="truncate text-fg">{m.subject}</span>
            <span className="truncate text-xs text-fg-subtle">
              {m.name} · {formatDateTime(m.created_at)}
            </span>
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => navigate('/admin/messages')}>
          <Inbox /> Open inbox
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function AccountMenu() {
  const { session, signOut } = useAuth()
  const email = session?.user.email ?? 'Administrator'
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" aria-label="Account menu">
          <span className="grid size-7 place-items-center rounded-full border border-gold/50 font-mono text-[11px] uppercase text-fg">
            {email.slice(0, 2)}
          </span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        <DropdownMenuLabel className="truncate">{email}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <a href="/" target="_blank" rel="noopener noreferrer">
            <ExternalLink /> View site
          </a>
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => void signOut()}>
          <LogOut /> Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export function AdminLayout() {
  const [menuOpen, setMenuOpen] = useState(false)
  return (
    <div className="min-h-dvh bg-bg lg:grid lg:grid-cols-[15.5rem_1fr]">
      <meta name="robots" content="noindex, nofollow" />
      <div className="hidden border-r border-line bg-surface lg:block">
      <aside className="sticky top-0 flex h-dvh flex-col px-3 py-5">
        <Link to="/admin" className="mb-8 flex items-center gap-2.5 px-3">
          <span className="grid size-8 place-items-center rounded-md border border-gold/50 font-display text-sm font-semibold">JC</span>
          <span className="text-sm font-medium">Portfolio admin</span>
        </Link>
        <SideNav />
      </aside>
      </div>
      <Sheet open={menuOpen} onOpenChange={setMenuOpen} title="Admin navigation">
        <p className="mb-6 px-3 text-sm font-medium">Portfolio admin</p>
        <SideNav onNavigate={() => setMenuOpen(false)} />
      </Sheet>
      <div className="min-w-0">
        <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-line bg-bg/90 px-4 backdrop-blur-md sm:px-6">
          <Button variant="ghost" size="icon" className="lg:hidden" aria-label="Open navigation" onClick={() => setMenuOpen(true)}>
            <Menu />
          </Button>
          <Breadcrumbs />
          <div className="ml-auto flex items-center gap-1">
            <Notifications />
            <AccountMenu />
          </div>
        </header>
        <main className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 lg:py-10">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
