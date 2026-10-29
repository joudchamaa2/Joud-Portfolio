import { ArrowRight } from 'lucide-react'
import { Link } from 'react-router'
import { tagNames, type ProjectCardData } from '@/lib/api/public'
import { publicUrl } from '@/lib/storage'
import { cn } from '@/lib/utils'
import { TechList } from './primitives'

/** Thumbnail with a neutral patterned placeholder when no image is set. */
export function ProjectThumb({
  path,
  alt,
  title,
  className,
  eager,
}: {
  path: string | null
  alt: string | null
  title: string
  className?: string
  eager?: boolean
}) {
  const src = publicUrl('project-images', path)
  return (
    <div className={cn('relative aspect-[16/10] overflow-hidden rounded-md border border-line bg-surface-2', className)}>
      {src ? (
        <img
          src={src}
          alt={alt ?? ''}
          loading={eager ? 'eager' : 'lazy'}
          decoding="async"
          className="size-full object-cover transition-transform duration-700 ease-[var(--ease-soft)] group-hover:scale-[1.02]"
        />
      ) : (
        <div className="grid-pattern grid size-full place-items-center" aria-hidden>
          <span className="display text-5xl text-line-strong">{title.slice(0, 1)}</span>
        </div>
      )}
    </div>
  )
}

export function ProjectCard({ project, headingLevel = 3 }: { project: ProjectCardData; headingLevel?: 2 | 3 }) {
  const Heading = headingLevel === 2 ? 'h2' : 'h3'
  const tags = tagNames(project)
  return (
    <article className="group relative flex flex-col">
      <ProjectThumb path={project.thumbnail_path} alt={project.thumbnail_alt} title={project.title} />
      <div className="mt-5 flex items-center gap-3">
        {project.category && <p className="eyebrow">{project.category.name}</p>}
        {project.is_featured && <span className="font-mono text-[11px] tracking-wide text-gold uppercase">Featured</span>}
      </div>
      <Heading className="mt-2 font-display text-2xl text-fg">
        <Link to={`/projects/${project.slug}`} className="after:absolute after:inset-0 focus-visible:outline-none">
          {project.title}
        </Link>
      </Heading>
      <p className="mt-2 line-clamp-3 text-sm leading-relaxed text-fg-muted">{project.summary}</p>
      <TechList items={tags} max={4} className="mt-4" />
      <span className="mt-5 inline-flex items-center gap-1.5 text-sm text-fg transition-colors group-hover:text-gold">
        View case study
        <ArrowRight className="size-4 transition-transform duration-200 group-hover:translate-x-0.5" aria-hidden />
      </span>
      {/* focus ring for the stretched link */}
      <span aria-hidden className="pointer-events-none absolute -inset-3 rounded-lg ring-gold group-has-[a:focus-visible]:ring-2" />
    </article>
  )
}
