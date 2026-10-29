import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { Archive, ArchiveRestore, ArrowLeft, ChevronLeft, ChevronRight, Inbox, Mail, MailOpen, Reply, Search, Trash2 } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router'
import { PageHeader, useAdminMutation } from '@/components/admin/shared'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/ui/dialog'
import { Input } from '@/components/ui/form'
import { Badge, EmptyState, ErrorState, Spinner } from '@/components/ui/misc'
import {
  deleteMessage,
  getMessage,
  listMessages,
  MESSAGE_FILTERS,
  MESSAGES_PAGE_SIZE,
  updateMessage,
  type ContactMessage,
  type MessageFilter,
} from '@/lib/api/admin'
import { qk } from '@/lib/query'
import { cn, formatDateTime } from '@/lib/utils'

const FILTER_LABELS: Record<MessageFilter, string> = { inbox: 'Inbox', unread: 'Unread', archived: 'Archived', all: 'All' }

function MessageDetail({ id, onClose }: { id: string; onClose: () => void }) {
  const message = useQuery({ queryKey: ['admin', 'message', id], queryFn: () => getMessage(id) })
  const [confirm, setConfirm] = useState(false)
  const invalidate = [['admin', 'messages'], ['admin', 'message', id], qk.adminStats]
  const update = useAdminMutation((values: Parameters<typeof updateMessage>[1]) => updateMessage(id, values), {
    invalidate,
    success: (_r, v) => (v.is_archived === true ? 'Message archived' : v.is_archived === false ? 'Moved to inbox' : null),
  })
  const remove = useAdminMutation(() => deleteMessage(id), { success: 'Message deleted', invalidate, onSuccess: onClose })

  // Opening an unread message marks it as read.
  const markedRef = useRef<string | null>(null)
  const m = message.data
  useEffect(() => {
    if (m && !m.is_read && markedRef.current !== m.id) {
      markedRef.current = m.id
      update.mutate({ is_read: true })
    }
  }, [m, update])

  if (message.isPending) return <Spinner />
  if (message.isError) return <ErrorState message="The message could not be loaded." onRetry={() => void message.refetch()} />
  if (!m) return <EmptyState title="Message not found" description="It may have been deleted." />

  const replyHref = `mailto:${encodeURIComponent(m.email)}?subject=${encodeURIComponent(`Re: ${m.subject}`)}`
  return (
    <article className="grid gap-5">
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="ghost" size="sm" className="lg:hidden" onClick={onClose}><ArrowLeft aria-hidden /> Back</Button>
        <div className="ml-auto flex flex-wrap gap-1">
          <Button asChild size="sm"><a href={replyHref}><Reply aria-hidden /> Reply</a></Button>
          <Button variant="ghost" size="sm" onClick={() => update.mutate({ is_read: !m.is_read })} disabled={update.isPending}>
            {m.is_read ? <><Mail aria-hidden /> Mark unread</> : <><MailOpen aria-hidden /> Mark read</>}
          </Button>
          <Button variant="ghost" size="sm" onClick={() => update.mutate({ is_archived: !m.is_archived })} disabled={update.isPending}>
            {m.is_archived ? <><ArchiveRestore aria-hidden /> Unarchive</> : <><Archive aria-hidden /> Archive</>}
          </Button>
          <Button variant="danger-ghost" size="sm" onClick={() => setConfirm(true)}><Trash2 aria-hidden /> Delete</Button>
        </div>
      </div>
      <header className="border-b border-line pb-5">
        <h2 className="font-display text-2xl break-words text-fg">{m.subject}</h2>
        <p className="mt-2 text-sm text-fg-muted">
          {m.name} &lt;<a href={replyHref} className="text-gold hover:underline">{m.email}</a>&gt;
        </p>
        <p className="mt-1 text-xs text-fg-subtle">{formatDateTime(m.created_at)}</p>
      </header>
      {/* Rendered as plain text — never as HTML. */}
      <p className="text-[15px] leading-relaxed break-words whitespace-pre-wrap text-fg">{m.message}</p>
      <ConfirmDialog
        open={confirm}
        onOpenChange={setConfirm}
        title="Delete this message?"
        description="It will be permanently removed."
        loading={remove.isPending}
        onConfirm={() => remove.mutate()}
      />
    </article>
  )
}

function Row({ m, active, onOpen }: { m: ContactMessage; active: boolean; onOpen: () => void }) {
  return (
    <li>
      <button
        type="button"
        onClick={onOpen}
        aria-current={active || undefined}
        className={cn('grid w-full gap-0.5 px-4 py-3 text-left transition-colors hover:bg-surface-2', active && 'bg-surface-3')}
      >
        <span className="flex items-center gap-2">
          {!m.is_read && <span className="size-1.5 shrink-0 rounded-full bg-gold" aria-label="Unread" />}
          <span className={cn('truncate text-sm', m.is_read ? 'text-fg-muted' : 'font-medium text-fg')}>{m.name}</span>
          {m.is_archived && <Badge tone="muted">Archived</Badge>}
          <span className="ml-auto shrink-0 text-[11px] text-fg-subtle">{formatDateTime(m.created_at)}</span>
        </span>
        <span className="truncate text-[13px] text-fg">{m.subject}</span>
        <span className="truncate text-xs text-fg-subtle">{m.message}</span>
      </button>
    </li>
  )
}

export default function MessagesPage() {
  const [params, setParams] = useSearchParams()
  const filterParam = params.get('filter')
  const filter: MessageFilter = (MESSAGE_FILTERS as readonly string[]).includes(filterParam ?? '') ? (filterParam as MessageFilter) : 'inbox'
  const page = Math.max(1, Number(params.get('page')) || 1)
  const openId = params.get('open')
  const [search, setSearch] = useState(params.get('q') ?? '')
  const [debounced, setDebounced] = useState(search)

  useEffect(() => {
    const t = setTimeout(() => setDebounced(search), 300)
    return () => clearTimeout(t)
  }, [search])

  const queryParams = { filter, search: debounced, page }
  const messages = useQuery({ queryKey: qk.adminMessages(queryParams), queryFn: () => listMessages(queryParams), placeholderData: keepPreviousData })

  const set = (next: Record<string, string | null>) => {
    const merged = new URLSearchParams(params)
    for (const [k, v] of Object.entries(next)) {
      if (v) merged.set(k, v)
      else merged.delete(k)
    }
    setParams(merged)
  }

  const total = messages.data?.total ?? 0
  const pages = Math.max(1, Math.ceil(total / MESSAGES_PAGE_SIZE))

  return (
    <>
      <PageHeader title="Messages" description="Submissions from the contact form." />
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[22rem_minmax(0,1fr)]">
        <div className={cn('grid content-start gap-3', openId && 'hidden lg:grid')}>
          <div role="tablist" aria-label="Message filter" className="flex gap-1 rounded-md border border-line p-1">
            {MESSAGE_FILTERS.map((f) => (
              <button
                key={f}
                role="tab"
                aria-selected={f === filter}
                onClick={() => set({ filter: f === 'inbox' ? null : f, page: null })}
                className={cn('flex-1 rounded-sm px-2 py-1.5 text-xs transition-colors', f === filter ? 'bg-surface-3 text-fg' : 'text-fg-muted hover:text-fg')}
              >
                {FILTER_LABELS[f]}
              </button>
            ))}
          </div>
          <div className="relative">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-fg-subtle" aria-hidden />
            <Input
              value={search}
              onChange={(e) => {
                setSearch(e.target.value)
                set({ page: null })
              }}
              placeholder="Search name, email, subject…"
              aria-label="Search messages"
              className="pl-9"
            />
          </div>
          <div className="overflow-hidden rounded-lg border border-line bg-surface">
            {messages.isPending ? (
              <Spinner />
            ) : messages.isError ? (
              <ErrorState message="Messages could not be loaded." onRetry={() => void messages.refetch()} className="m-3" />
            ) : messages.data.items.length === 0 ? (
              <EmptyState icon={Inbox} title={debounced ? 'No matches' : 'No messages'} className="m-3 border-0" />
            ) : (
              <ul className="divide-y divide-line">
                {messages.data.items.map((m) => (
                  <Row key={m.id} m={m} active={m.id === openId} onOpen={() => set({ open: m.id })} />
                ))}
              </ul>
            )}
          </div>
          {pages > 1 && (
            <div className="flex items-center justify-between text-xs text-fg-subtle">
              <Button variant="ghost" size="sm" disabled={page <= 1} onClick={() => set({ page: String(page - 1) })}><ChevronLeft aria-hidden /> Newer</Button>
              <span>Page {page} of {pages}</span>
              <Button variant="ghost" size="sm" disabled={page >= pages} onClick={() => set({ page: String(page + 1) })}>Older <ChevronRight aria-hidden /></Button>
            </div>
          )}
        </div>
        <div className={cn('min-w-0 rounded-lg border border-line bg-surface p-5 sm:p-6', !openId && 'hidden lg:block')}>
          {openId ? (
            <MessageDetail key={openId} id={openId} onClose={() => set({ open: null })} />
          ) : (
            <EmptyState icon={Mail} title="Select a message" className="border-0" />
          )}
        </div>
      </div>
    </>
  )
}
