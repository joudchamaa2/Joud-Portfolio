import { useQuery } from '@tanstack/react-query'
import { useParams } from 'react-router'
import { ProjectArticle } from '@/components/site/ProjectArticle'
import { ProjectCard } from '@/components/site/ProjectCard'
import { SectionHeader } from '@/components/site/primitives'
import { Seo } from '@/components/site/Seo'
import { ErrorState, Spinner } from '@/components/ui/misc'
import { fetchProjectBySlug, fetchRelatedProjects, type ProjectDetailData } from '@/lib/api/public'
import { qk } from '@/lib/query'
import { publicUrl } from '@/lib/storage'
import NotFoundPage from './NotFoundPage'

function RelatedProjects({ project }: { project: ProjectDetailData }) {
  const related = useQuery({ queryKey: qk.related(project.id), queryFn: () => fetchRelatedProjects(project) })
  if (!related.data?.length) return null
  return (
    <section className="border-t border-line" aria-labelledby="related-heading">
      <div className="container-page section">
        <SectionHeader label="Keep exploring" title={<span id="related-heading">Related projects</span>} />
        <div className="grid gap-x-8 gap-y-14 md:grid-cols-2 lg:grid-cols-3">
          {related.data.map((p) => <ProjectCard key={p.id} project={p} />)}
        </div>
      </div>
    </section>
  )
}

export default function ProjectDetailPage() {
  const { slug = '' } = useParams()
  const project = useQuery({ queryKey: qk.project(slug), queryFn: () => fetchProjectBySlug(slug) })

  if (project.isPending) return <Spinner label="Loading project" />
  if (project.isError) {
    return (
      <div className="container-page section">
        <ErrorState message="This project could not be loaded." onRetry={() => void project.refetch()} />
      </div>
    )
  }
  if (!project.data) return <NotFoundPage what="project" />

  const p = project.data
  return (
    <>
      <Seo
        title={p.title}
        description={p.seo_description || p.summary}
        path={`/projects/${p.slug}`}
        image={publicUrl('project-images', p.thumbnail_path)}
        type="article"
      />
      <ProjectArticle project={p} />
      <RelatedProjects project={p} />
    </>
  )
}
