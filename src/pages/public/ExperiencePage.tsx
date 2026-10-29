import { useQuery } from '@tanstack/react-query'
import { History } from 'lucide-react'
import { ExternalLink, Prose, SectionHeader } from '@/components/site/primitives'
import { Seo } from '@/components/site/Seo'
import { EmptyState, ErrorState, Spinner } from '@/components/ui/misc'
import { fetchTimeline, type TimelineEntry } from '@/lib/api/public'
import { qk } from '@/lib/query'
import { TIMELINE_META, TIMELINE_ORDER } from '@/lib/timeline'
import { formatRange } from '@/lib/utils'


function Entry({ entry }: { entry: TimelineEntry }) {
  const range = formatRange(entry.start_date, entry.end_date, entry.is_current)
  return (
    <li className="group relative grid gap-2 pb-10 pl-8 last:pb-0">
      <span aria-hidden className="absolute top-2 left-0 size-2 rounded-full border border-gold bg-bg" />
      <span aria-hidden className="absolute top-5 bottom-0 left-[3.5px] w-px bg-line group-last:hidden" />
      {range && <p className="eyebrow">{range}</p>}
      <h3 className="font-display text-xl text-fg">{entry.title}</h3>
      <p className="text-sm text-fg-muted">
        {entry.organization}
        {entry.location && <span className="text-fg-subtle"> · {entry.location}</span>}
      </p>
      {entry.description && <Prose text={entry.description} className="mt-2 text-sm" />}
      {entry.credential_url && (
        <ExternalLink href={entry.credential_url} className="mt-1 text-sm text-gold">
          View credential
        </ExternalLink>
      )}
    </li>
  )
}

export default function ExperiencePage() {
  const timeline = useQuery({ queryKey: qk.timeline, queryFn: fetchTimeline })
  const groups = TIMELINE_ORDER.map((kind) => ({ kind, entries: (timeline.data ?? []).filter((e) => e.kind === kind) })).filter(
    (g) => g.entries.length > 0,
  )

  return (
    <div className="container-page section">
      <Seo title="Experience & education" path="/experience" description="Education, training, experience and certifications of Joud Chamaa." />
      <SectionHeader as="h1" label="Background" title="Experience & education" />
      {timeline.isPending ? (
        <Spinner />
      ) : timeline.isError ? (
        <ErrorState message="This section could not be loaded." onRetry={() => void timeline.refetch()} />
      ) : groups.length === 0 ? (
        <EmptyState icon={History} title="Nothing to show yet" />
      ) : (
        <div className="grid gap-16">
          {groups.map(({ kind, entries }) => {
            const { title, icon: Icon } = TIMELINE_META[kind]
            return (
              <section key={kind} aria-labelledby={`tl-${kind}`} className="grid gap-8 border-t border-line pt-8 md:grid-cols-[14rem_1fr]">
                <h2 id={`tl-${kind}`} className="flex items-center gap-2.5 text-fg">
                  <Icon className="size-4 text-gold" aria-hidden />
                  <span className="eyebrow text-fg-muted">{title}</span>
                </h2>
                <ol className="grid">{entries.map((e) => <Entry key={e.id} entry={e} />)}</ol>
              </section>
            )
          })}
        </div>
      )}
    </div>
  )
}
