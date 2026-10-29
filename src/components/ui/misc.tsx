import { CircleAlert, LoaderCircle, type LucideIcon } from 'lucide-react'
import type { ComponentProps, ReactNode } from 'react'
import { cn } from '@/lib/utils'
import { Button } from './button'

export function Badge({
  className,
  tone = 'neutral',
  ...props
}: ComponentProps<'span'> & { tone?: 'neutral' | 'gold' | 'success' | 'danger' | 'muted' }) {
  const tones = {
    neutral: 'border-line-strong text-fg-muted',
    gold: 'border-gold/40 text-gold bg-gold/5',
    success: 'border-success/40 text-success bg-success/5',
    danger: 'border-danger/40 text-danger bg-danger/5',
    muted: 'border-line text-fg-subtle',
  }
  return (
    <span
      className={cn('inline-flex items-center gap-1 rounded-sm border px-2 py-0.5 font-mono text-[11px] leading-5 tracking-wide', tones[tone], className)}
      {...props}
    />
  )
}

export function Skeleton({ className, ...props }: ComponentProps<'div'>) {
  return <div aria-hidden className={cn('animate-pulse rounded-md bg-surface-3', className)} {...props} />
}

export function Spinner({ label = 'Loading', className }: { label?: string; className?: string }) {
  return (
    <div role="status" className={cn('flex items-center justify-center gap-2 py-16 text-sm text-fg-subtle', className)}>
      <LoaderCircle className="size-4 animate-spin" aria-hidden />
      <span>{label}…</span>
    </div>
  )
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
}: {
  icon?: LucideIcon
  title: string
  description?: ReactNode
  action?: ReactNode
  className?: string
}) {
  return (
    <div className={cn('flex flex-col items-center rounded-lg border border-dashed border-line px-6 py-14 text-center', className)}>
      {Icon && <Icon className="mb-4 size-6 text-fg-subtle" aria-hidden />}
      <p className="font-display text-lg text-fg">{title}</p>
      {description && <p className="mt-1.5 max-w-sm text-sm text-fg-muted">{description}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  )
}

export function ErrorState({ message, onRetry, className }: { message: string; onRetry?: () => void; className?: string }) {
  return (
    <div role="alert" className={cn('flex flex-col items-center rounded-lg border border-danger/30 bg-danger/5 px-6 py-10 text-center', className)}>
      <CircleAlert className="mb-3 size-5 text-danger" aria-hidden />
      <p className="text-sm text-fg">{message}</p>
      {onRetry && (
        <Button variant="secondary" size="sm" className="mt-4" onClick={onRetry}>
          Try again
        </Button>
      )}
    </div>
  )
}

export function Card({ className, ...props }: ComponentProps<'section'>) {
  return <section className={cn('min-w-0 rounded-lg border border-line bg-surface', className)} {...props} />
}

export function CardHeader({ title, description, actions }: { title: string; description?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3 border-b border-line px-5 py-4">
      <div className="grid gap-0.5">
        <h2 className="text-[15px] font-medium text-fg">{title}</h2>
        {description && <p className="text-[13px] text-fg-subtle">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  )
}
