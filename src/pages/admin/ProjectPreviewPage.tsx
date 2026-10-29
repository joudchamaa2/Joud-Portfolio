import { useQuery } from '@tanstack/react-query'
import { ArrowLeft, Eye } from 'lucide-react'
import { Link, useParams } from 'react-router'
import { ProjectArticle } from '@/components/site/ProjectArticle'
import { Button } from '@/components/ui/button'
import { EmptyState, ErrorState, Spinner } from '@/components/ui/misc'
import { getAdminProject } from '@/lib/api/admin'
import { qk } from '@/lib/query'

/** Renders a project exactly as the public page would, including drafts. */
export default function ProjectPreviewPage() {
  const { id = '' } = useParams()
  const project = useQuery({ queryKey: qk.adminProject(id), queryFn: () => getAdminProject(id) })

  if (project.isPending) return <Spinner />
  if (project.isError) return <ErrorState message="The project could not be loaded." onRetry={() => void project.refetch()} />
  if (!project.data) return <EmptyState title="Project not found" />

  const p = project.data
  return (
    <>
      <title>{`Preview: ${p.title} · Admin`}</title>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-md border border-gold/30 bg-gold/5 px-4 py-3">
        <p className="flex items-center gap-2 text-sm text-fg">
          <Eye className="size-4 text-gold" aria-hidden />
          Preview — {p.status === 'published' ? 'this project is published.' : 'this draft is not visible to visitors.'}
        </p>
        <div className="flex gap-2">
          {p.status === 'published' && (
            <Button asChild variant="ghost" size="sm">
              <a href={`/projects/${p.slug}`} target="_blank" rel="noopener noreferrer">Open public page</a>
            </Button>
          )}
          <Button asChild variant="secondary" size="sm">
            <Link to={`/admin/projects/${p.id}`}><ArrowLeft aria-hidden /> Back to editor</Link>
          </Button>
        </div>
      </div>
      <div className="-mx-4 rounded-lg border border-line sm:-mx-6">
        <ProjectArticle project={p} backLink={false} />
      </div>
    </>
  )
}
