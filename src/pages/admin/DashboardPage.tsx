import { useQuery } from '@tanstack/react-query'
import { ArrowRight, FilePen, FolderCheck, Inbox, Layers, MailWarning, Plus, type LucideIcon } from 'lucide-react'
import { Link } from 'react-router'
import { PageHeader } from '@/components/admin/shared'
import { Button } from '@/components/ui/button'
import { Card, CardHeader, ErrorState, Skeleton } from '@/components/ui/misc'
import { fetchDashboardStats, fetchUnreadMessages } from '@/lib/api/admin'
import { qk } from '@/lib/query'
import { formatDateTime } from '@/lib/utils'

function Stat({ label, value, icon: Icon, to }: { label: string; value: number | undefined; icon: LucideIcon; to: string }) {
  return (
    <Link to={to} className="group rounded-lg border border-line bg-surface p-5 transition-colors hover:border-line-strong">
      <div className="flex items-center justify-between">
        <p className="text-[13px] text-fg-muted">{label}</p>
        <Icon className="size-4 text-fg-subtle group-hover:text-gold" aria-hidden />
      </div>
      {value === undefined ? <Skeleton className="mt-3 h-9 w-12" /> : <p className="mt-2 font-display text-4xl text-fg">{value}</p>}
    </Link>
  )
}

export default function DashboardPage() {
  const stats = useQuery({ queryKey: qk.adminStats, queryFn: fetchDashboardStats })
  const unread = useQuery({ queryKey: qk.adminUnread, queryFn: () => fetchUnreadMessages(5) })
  const s = stats.data

  return (
    <>
      <PageHeader
        title="Dashboard"
        description="Overview of your portfolio content."
        actions={
          <Button asChild>
            <Link to="/admin/projects/new"><Plus aria-hidden /> New project</Link>
          </Button>
        }
      />
      {stats.isError ? (
        <ErrorState message="Statistics could not be loaded." onRetry={() => void stats.refetch()} />
      ) : (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
          <Stat label="Published projects" value={s?.published_projects} icon={FolderCheck} to="/admin/projects" />
          <Stat label="Draft projects" value={s?.draft_projects} icon={FilePen} to="/admin/projects" />
          <Stat label="Skills" value={s?.skills} icon={Layers} to="/admin/skills" />
          <Stat label="Messages" value={s?.total_messages} icon={Inbox} to="/admin/messages?filter=all" />
          <Stat label="Unread" value={s?.unread_messages} icon={MailWarning} to="/admin/messages?filter=unread" />
        </div>
      )}

      <div className="mt-8 grid gap-6 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <Card>
          <CardHeader
            title="Unread messages"
            actions={
              <Button asChild variant="ghost" size="sm">
                <Link to="/admin/messages">Inbox <ArrowRight aria-hidden /></Link>
              </Button>
            }
          />
          {unread.data?.items.length ? (
            <ul className="divide-y divide-line">
              {unread.data.items.map((m) => (
                <li key={m.id}>
                  <Link to={`/admin/messages?open=${m.id}`} className="grid gap-0.5 px-5 py-3.5 hover:bg-surface-2">
                    <span className="truncate text-sm text-fg">{m.subject}</span>
                    <span className="text-xs text-fg-subtle">{m.name} · {formatDateTime(m.created_at)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="px-5 py-8 text-sm text-fg-subtle">{unread.isPending ? 'Loading…' : 'You are all caught up.'}</p>
          )}
        </Card>
        <Card>
          <CardHeader title="Quick links" />
          <ul className="grid gap-1 p-3 text-sm">
            {[
              ['/admin/profile', 'Edit profile, photo and CV'],
              ['/admin/timeline', 'Add education or experience'],
              ['/admin/skills', 'Manage skills'],
              ['/admin/settings', 'Site settings and visibility'],
            ].map(([to, label]) => (
              <li key={to}>
                <Link to={to!} className="flex items-center justify-between rounded-md px-3 py-2.5 text-fg-muted hover:bg-surface-2 hover:text-fg">
                  {label} <ArrowRight className="size-4" aria-hidden />
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </>
  )
}
