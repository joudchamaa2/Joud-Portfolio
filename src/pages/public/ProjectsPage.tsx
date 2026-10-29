import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { ChevronLeft, ChevronRight, FolderOpen } from 'lucide-react'
import { useSearchParams } from 'react-router'
import { ProjectCard } from '@/components/site/ProjectCard'
import { SectionHeader } from '@/components/site/primitives'
import { Seo } from '@/components/site/Seo'
import { Button } from '@/components/ui/button'
import { Label, Select } from '@/components/ui/form'
import { EmptyState, ErrorState, Skeleton } from '@/components/ui/misc'
import { fetchProjectFilters, fetchProjects, PROJECT_SORTS, PROJECTS_PAGE_SIZE, type ProjectSort } from '@/lib/api/public'
import { qk } from '@/lib/query'
import { cn } from '@/lib/utils'

const SORT_LABELS: Record<ProjectSort, string> = { curated: 'Curated order', newest: 'Most recent', title: 'Title (A–Z)' }

export default function ProjectsPage() {
  const [params, setParams] = useSearchParams()
  const categorySlug = params.get('category')
  const techName = params.get('tech')
  const sortParam = params.get('sort')
  const sort: ProjectSort = (PROJECT_SORTS as readonly string[]).includes(sortParam ?? '') ? (sortParam as ProjectSort) : 'curated'
  const page = Math.max(1, Number.parseInt(params.get('page') ?? '1', 10) || 1)

  const filters = useQuery({ queryKey: qk.projectFilters, queryFn: fetchProjectFilters })
  const category = filters.data?.categories.find((c) => c.slug === categorySlug) ?? null
  const skill = filters.data?.skills.find((s) => s.name.toLowerCase() === techName?.toLowerCase()) ?? null
  // An unknown filter value (e.g. a stale link) yields an empty result rather than everything.
  const unknownFilter = filters.isSuccess && ((categorySlug && !category) || (techName && !skill))

  const queryParams = { categoryId: category?.id ?? null, skillId: skill?.id ?? null, sort, page }
  const projects = useQuery({
    queryKey: qk.projects(queryParams),
    queryFn: () => fetchProjects(queryParams),
    enabled: filters.isSuccess && !unknownFilter,
    placeholderData: keepPreviousData,
  })

  function update(next: Record<string, string | null>) {
    const merged = new URLSearchParams(params)
    for (const [key, value] of Object.entries(next)) {
      if (value) merged.set(key, value)
      else merged.delete(key)
    }
    if (!('page' in next)) merged.delete('page')
    setParams(merged)
  }

  const total = projects.data?.total ?? 0
  const pageCount = Math.max(1, Math.ceil(total / PROJECTS_PAGE_SIZE))
  const hasFilters = Boolean(categorySlug || techName)

  return (
    <div className="container-page section">
      <Seo title="Projects" path="/projects" description="Software projects by Joud Chamaa — case studies, technologies and source code." />
      <SectionHeader as="h1" label="Work" title="Projects" description="A selection of things I have designed and built, with notes on the problem, my contribution and the technologies involved." />

      <div className="mb-10 flex flex-col gap-5 border-y border-line py-5 lg:flex-row lg:items-end lg:justify-between">
        <div role="group" aria-label="Filter by category" className="flex flex-wrap gap-2">
          {[{ slug: null as string | null, name: 'All' }, ...(filters.data?.categories ?? [])].map((c) => {
            const active = (c.slug ?? null) === (categorySlug ?? null)
            return (
              <button
                key={c.slug ?? 'all'}
                type="button"
                aria-pressed={active}
                onClick={() => update({ category: c.slug })}
                className={cn(
                  'rounded-full border px-3.5 py-1.5 text-[13px] transition-colors',
                  active ? 'border-gold bg-gold/10 text-fg' : 'border-line text-fg-muted hover:border-line-strong hover:text-fg',
                )}
              >
                {c.name}
              </button>
            )
          })}
        </div>
        <div className="grid grid-cols-2 gap-3 sm:flex">
          <div className="grid gap-1.5 sm:w-48">
            <Label htmlFor="tech-filter" className="text-xs text-fg-subtle">Technology</Label>
            <Select id="tech-filter" value={skill?.name ?? ''} onChange={(e) => update({ tech: e.target.value || null })}>
              <option value="">All technologies</option>
              {filters.data?.skills.map((s) => (
                <option key={s.id} value={s.name}>{s.name}</option>
              ))}
            </Select>
          </div>
          <div className="grid gap-1.5 sm:w-44">
            <Label htmlFor="sort" className="text-xs text-fg-subtle">Sort</Label>
            <Select id="sort" value={sort} onChange={(e) => update({ sort: e.target.value === 'curated' ? null : e.target.value })}>
              {PROJECT_SORTS.map((s) => (
                <option key={s} value={s}>{SORT_LABELS[s]}</option>
              ))}
            </Select>
          </div>
        </div>
      </div>

      {filters.isError || projects.isError ? (
        <ErrorState message="Projects could not be loaded." onRetry={() => void (filters.isError ? filters.refetch() : projects.refetch())} />
      ) : unknownFilter || (projects.isSuccess && projects.data.items.length === 0) ? (
        <EmptyState
          icon={FolderOpen}
          title={hasFilters ? 'No projects match these filters' : 'Projects are on their way'}
          description={hasFilters ? 'Try a different category or technology.' : 'Case studies will appear here once they are published.'}
          action={hasFilters ? <Button variant="secondary" onClick={() => setParams({})}>Clear filters</Button> : undefined}
        />
      ) : !projects.data ? (
        <div className="grid gap-x-8 gap-y-14 md:grid-cols-2 lg:grid-cols-3" aria-busy>
          {Array.from({ length: 6 }, (_, i) => (
            <div key={i} className="grid gap-3">
              <Skeleton className="aspect-[16/10]" />
              <Skeleton className="h-6 w-2/3" />
              <Skeleton className="h-4 w-full" />
            </div>
          ))}
        </div>
      ) : (
        <>
          <p className="sr-only" aria-live="polite">{total} projects</p>
          <div className={cn('grid gap-x-8 gap-y-14 md:grid-cols-2 lg:grid-cols-3', projects.isFetching && 'opacity-60 transition-opacity')}>
            {projects.data.items.map((p) => <ProjectCard key={p.id} project={p} headingLevel={2} />)}
          </div>
          {pageCount > 1 && (
            <nav aria-label="Pagination" className="mt-16 flex items-center justify-center gap-2">
              <Button variant="secondary" size="icon" disabled={page <= 1} onClick={() => update({ page: String(page - 1) })} aria-label="Previous page">
                <ChevronLeft />
              </Button>
              {Array.from({ length: pageCount }, (_, i) => i + 1).map((n) => (
                <Button
                  key={n}
                  variant={n === page ? 'primary' : 'ghost'}
                  size="icon"
                  aria-current={n === page ? 'page' : undefined}
                  onClick={() => update({ page: n === 1 ? null : String(n) })}
                >
                  {n}
                </Button>
              ))}
              <Button variant="secondary" size="icon" disabled={page >= pageCount} onClick={() => update({ page: String(page + 1) })} aria-label="Next page">
                <ChevronRight />
              </Button>
            </nav>
          )}
        </>
      )}
    </div>
  )
}
