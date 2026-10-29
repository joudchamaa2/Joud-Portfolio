import { ArrowUpRight, Download } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { toast } from 'sonner'
import { requestCvUrl, type SiteData } from '@/lib/api/public'
import { cn, paragraphs } from '@/lib/utils'
import { Button } from '../ui/button'

/** Section heading with a numbered mono index, e.g. "01 — Selected work". */
export function SectionHeader({
  index,
  label,
  title,
  description,
  action,
  as: Heading = 'h2',
}: {
  index?: string
  label: string
  title: ReactNode
  description?: ReactNode
  action?: ReactNode
  as?: 'h1' | 'h2'
}) {
  return (
    <header className="mb-10 grid gap-6 md:mb-14 md:grid-cols-[1fr_auto] md:items-end">
      <div>
        <p className="eyebrow mb-4 flex items-center gap-3">
          {index && <span className="text-gold">{index}</span>}
          {index && <span aria-hidden className="h-px w-8 bg-line-strong" />}
          <span>{label}</span>
        </p>
        <Heading className="display text-4xl text-fg sm:text-5xl">{title}</Heading>
        {description && <p className="mt-4 max-w-2xl text-[15px] leading-relaxed text-fg-muted">{description}</p>}
      </div>
      {action}
    </header>
  )
}

/**
 * Renders admin-authored plain text safely: paragraphs on blank lines, list
 * items for lines starting with "-". Content is never interpreted as HTML.
 */
export function Prose({ text, className }: { text: string | null | undefined; className?: string }) {
  const blocks = paragraphs(text)
  if (blocks.length === 0) return null
  return (
    <div className={cn('grid gap-4 text-[15px] leading-[1.75] text-fg-muted', className)}>
      {blocks.map((block, i) => {
        const lines = block.split('\n')
        if (lines.every((l) => /^\s*[-*•]\s+/.test(l))) {
          return (
            <ul key={i} className="grid gap-2">
              {lines.map((l, j) => (
                <li key={j} className="flex gap-3">
                  <span aria-hidden className="mt-[0.7em] h-px w-3 shrink-0 bg-gold" />
                  <span>{l.replace(/^\s*[-*•]\s+/, '')}</span>
                </li>
              ))}
            </ul>
          )
        }
        return (
          <p key={i} className="whitespace-pre-line">
            {block}
          </p>
        )
      })}
    </div>
  )
}

export function ExternalLink({ href, children, className }: { href: string; children: ReactNode; className?: string }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className={cn('group inline-flex items-center gap-1', className)}>
      {children}
      <ArrowUpRight className="size-3.5 transition-transform duration-150 group-hover:translate-x-0.5 group-hover:-translate-y-0.5" aria-hidden />
      <span className="sr-only">(opens in a new tab)</span>
    </a>
  )
}

export function SocialLinks({ links, className }: { links: SiteData['socialLinks']; className?: string }) {
  if (links.length === 0) return null
  return (
    <ul className={cn('flex flex-wrap gap-x-6 gap-y-2', className)}>
      {links.map((link) => (
        <li key={link.id}>
          <ExternalLink href={link.url} className="font-mono text-xs tracking-wide text-fg-muted uppercase transition-colors hover:text-gold">
            {link.label}
          </ExternalLink>
        </li>
      ))}
    </ul>
  )
}

/** Requests a short-lived signed URL from the cv-url Edge Function, then downloads. */
export function CvButton({ variant = 'secondary', size = 'md', className }: { variant?: 'secondary' | 'ghost' | 'primary'; size?: 'sm' | 'md' | 'lg'; className?: string }) {
  const [loading, setLoading] = useState(false)
  async function download() {
    setLoading(true)
    try {
      window.location.assign(await requestCvUrl())
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'The CV is not available right now.')
    } finally {
      setLoading(false)
    }
  }
  return (
    <Button variant={variant} size={size} className={className} loading={loading} onClick={download}>
      {!loading && <Download aria-hidden />}
      Download CV
    </Button>
  )
}

export function TechList({ items, max, className }: { items: Array<{ id: string; name: string }>; max?: number; className?: string }) {
  if (items.length === 0) return null
  const shown = max ? items.slice(0, max) : items
  const rest = items.length - shown.length
  return (
    <ul className={cn('flex flex-wrap gap-1.5', className)} aria-label="Technologies">
      {shown.map((t) => (
        <li key={t.id} className="rounded-sm border border-line px-2 py-0.5 font-mono text-[11px] text-fg-muted">
          {t.name}
        </li>
      ))}
      {rest > 0 && <li className="px-1 py-0.5 font-mono text-[11px] text-fg-subtle">+{rest}</li>}
    </ul>
  )
}
