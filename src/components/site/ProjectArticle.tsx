import { ArrowLeft, Code2, Globe } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { Link } from 'react-router'
import { Dialog } from '@/components/ui/dialog'
import { tagNames, type ProjectDetailData } from '@/lib/api/public'
import { publicUrl } from '@/lib/storage'
import { formatRange, hasText } from '@/lib/utils'
import { ProjectThumb } from './ProjectCard'
import { ExternalLink, Prose, TechList } from './primitives'

function Block({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section aria-labelledby={id} className="grid gap-4 border-t border-line pt-8 md:grid-cols-[12rem_1fr] md:gap-10">
      <h2 id={id} className="eyebrow pt-1 text-fg-muted">{title}</h2>
      <div>{children}</div>
    </section>
  )
}

function MetaItem({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid gap-1.5">
      <dt className="eyebrow">{label}</dt>
      <dd className="text-sm text-fg">{children}</dd>
    </div>
  )
}

type Image = ProjectDetailData['images'][number]

function Gallery({ images }: { images: Image[] }) {
  const [active, setActive] = useState<Image | null>(null)
  const sorted = [...images].sort((a, b) => a.sort_order - b.sort_order)
  return (
    <>
      <ul className="grid gap-6 sm:grid-cols-2">
        {sorted.map((image) => (
          <li key={image.id}>
            <figure>
              <button
                type="button"
                onClick={() => setActive(image)}
                className="group relative block w-full overflow-hidden rounded-md border border-line bg-surface-2"
                aria-label={`Enlarge image${image.alt_text ? `: ${image.alt_text}` : ''}`}
              >
                <img
                  src={publicUrl('project-images', image.storage_path) ?? ''}
                  alt={image.alt_text}
                  loading="lazy"
                  decoding="async"
                  className="aspect-[16/10] w-full object-cover transition-transform duration-500 group-hover:scale-[1.015]"
                />
                {image.is_mockup && (
                  <span className="absolute top-3 left-3 rounded-sm bg-bg/85 px-2 py-0.5 font-mono text-[10px] tracking-wide text-fg-muted uppercase">
                    Concept mockup
                  </span>
                )}
              </button>
              {image.caption && <figcaption className="mt-2.5 text-[13px] text-fg-subtle">{image.caption}</figcaption>}
            </figure>
          </li>
        ))}
      </ul>
      <Dialog open={Boolean(active)} onOpenChange={(open) => !open && setActive(null)} title={active?.caption || active?.alt_text || 'Screenshot'} className="max-w-5xl">
        {active && (
          <figure className="grid gap-3">
            <img src={publicUrl('project-images', active.storage_path) ?? ''} alt={active.alt_text} className="max-h-[75dvh] w-full rounded-md object-contain" />
            {active.is_mockup && <figcaption className="text-xs text-fg-subtle">This image is a design mockup, not a screenshot of a running application.</figcaption>}
          </figure>
        )}
      </Dialog>
    </>
  )
}

export function ProjectArticle({ project, backLink = true }: { project: ProjectDetailData; backLink?: boolean }) {
  const tags = tagNames(project)
  const range = formatRange(project.started_on, project.completed_on)
  const features = project.features.filter(hasText)

  return (
    <article className="container-page section">
      {backLink && (
        <Link to="/projects" className="link-underline mb-10 inline-flex items-center gap-1.5 text-sm text-fg-muted hover:text-fg">
          <ArrowLeft className="size-4" aria-hidden /> All projects
        </Link>
      )}

      <header className="grid gap-10 lg:grid-cols-[1fr_18rem] lg:gap-16">
        <div>
          {project.category && <p className="eyebrow">{project.category.name}</p>}
          <h1 className="display mt-4 text-5xl text-fg sm:text-6xl">{project.title}</h1>
          <p className="mt-6 max-w-2xl text-lg leading-relaxed text-fg-muted">{project.summary}</p>
          {(project.demo_url || project.repo_url) && (
            <div className="mt-8 flex flex-wrap gap-3">
              {project.demo_url && (
                <ExternalLink href={project.demo_url} className="h-11 rounded-md bg-gold px-5 text-sm font-medium text-bg transition-colors hover:bg-gold-bright">
                  <Globe className="size-4" aria-hidden /> Live demo
                </ExternalLink>
              )}
              {project.repo_url && (
                <ExternalLink href={project.repo_url} className="h-11 rounded-md border border-line-strong px-5 text-sm text-fg transition-colors hover:bg-surface-2">
                  <Code2 className="size-4" aria-hidden /> Source code
                </ExternalLink>
              )}
            </div>
          )}
        </div>
        <dl className="grid content-start gap-6 border-t border-line pt-6 lg:border-t-0 lg:border-l lg:pt-0 lg:pl-8">
          {hasText(project.role) && <MetaItem label="Role">{project.role}</MetaItem>}
          {range && <MetaItem label="Timeline">{range}</MetaItem>}
          {project.category && <MetaItem label="Category">{project.category.name}</MetaItem>}
          {tags.length > 0 && (
            <MetaItem label="Technologies">
              <TechList items={tags} className="mt-1" />
            </MetaItem>
          )}
        </dl>
      </header>

      {project.thumbnail_path && (
        <ProjectThumb path={project.thumbnail_path} alt={project.thumbnail_alt} title={project.title} eager className="mt-14 aspect-[16/9]" />
      )}

      <div className="mt-16 grid gap-12">
        {hasText(project.overview) && <Block id="overview" title="Overview"><Prose text={project.overview} /></Block>}
        {hasText(project.problem) && <Block id="problem" title="The problem"><Prose text={project.problem} /></Block>}
        {hasText(project.objectives) && <Block id="objectives" title="Objectives"><Prose text={project.objectives} /></Block>}
        {hasText(project.contribution) && <Block id="contribution" title="My contribution"><Prose text={project.contribution} /></Block>}
        {features.length > 0 && (
          <Block id="features" title="Main features">
            <ul className="grid gap-3 sm:grid-cols-2">
              {features.map((f) => (
                <li key={f} className="flex gap-3 text-[15px] leading-relaxed text-fg-muted">
                  <span aria-hidden className="mt-[0.75em] h-px w-3 shrink-0 bg-gold" />
                  {f}
                </li>
              ))}
            </ul>
          </Block>
        )}
        {hasText(project.architecture) && <Block id="architecture" title="Architecture"><Prose text={project.architecture} /></Block>}
        {hasText(project.challenges) && <Block id="challenges" title="Challenges & solutions"><Prose text={project.challenges} /></Block>}
        {project.images.length > 0 && <Block id="screenshots" title="Screenshots"><Gallery images={project.images} /></Block>}
      </div>
    </article>
  )
}
