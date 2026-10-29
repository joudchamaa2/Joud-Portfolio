import { useQuery } from '@tanstack/react-query'
import { ArrowRight, Mail } from 'lucide-react'
import { Link } from 'react-router'
import { ProjectCard } from '@/components/site/ProjectCard'
import { CvButton, Prose, SectionHeader, SocialLinks } from '@/components/site/primitives'
import { Seo } from '@/components/site/Seo'
import { useSiteData } from '@/components/site/SiteData'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/misc'
import { fetchFeaturedProjects, fetchSkillGroups, fetchTimeline, type SkillGroup, type TimelineEntry } from '@/lib/api/public'
import { skillIcon } from '@/lib/icons'
import { qk } from '@/lib/query'
import { publicUrl } from '@/lib/storage'
import { formatRange, hasText, paragraphs } from '@/lib/utils'

function CodeLine({ k, children }: { k: string; children: React.ReactNode }) {
  return (
    <div className="pl-5">
      <span className="text-fg-muted">{k}</span>
      <span className="text-fg-subtle">: </span>
      {children}
      <span className="text-fg-subtle">,</span>
    </div>
  )
}

const Str = ({ children }: { children: string }) => <span className="text-gold">"{children}"</span>

function StrList({ items }: { items: string[] }) {
  return (
    <>
      <span className="text-fg-subtle">[</span>
      {items.map((item, i) => (
        <span key={item}>
          <Str>{item}</Str>
          {i < items.length - 1 && <span className="text-fg-subtle">, </span>}
        </span>
      ))}
      <span className="text-fg-subtle">]</span>
    </>
  )
}

/** A small, data-driven "profile.ts" panel. Every value comes from the database. */
function DeveloperPanel({ skills, timeline }: { skills: SkillGroup[]; timeline: TimelineEntry[] }) {
  const { profile } = useSiteData()
  const focus = skills.slice(0, 3).map((g) => g.name)
  const education = [...new Set(timeline.filter((t) => t.kind === 'education' || t.kind === 'training').map((t) => t.organization))]
  return (
    <figure className="animate-rise overflow-hidden rounded-lg border border-line bg-surface [animation-delay:200ms]" aria-label="Profile summary">
      <div className="flex items-center gap-2 border-b border-line px-4 py-3">
        <span className="size-2.5 rounded-full bg-line-strong" />
        <span className="size-2.5 rounded-full bg-line-strong" />
        <span className="size-2.5 rounded-full bg-line-strong" />
        <span className="ml-3 font-mono text-xs text-fg-subtle">profile.ts</span>
      </div>
      <pre className="overflow-x-auto p-5 font-mono text-[12.5px] leading-7 whitespace-pre-wrap sm:text-[13px]">
        <code>
          <div>
            <span className="text-fg-subtle">export const </span>
            <span className="text-fg">developer</span>
            <span className="text-fg-subtle"> = {'{'}</span>
          </div>
          <CodeLine k="name"><Str>{profile.full_name}</Str></CodeLine>
          <CodeLine k="role"><Str>{profile.headline}</Str></CodeLine>
          {hasText(profile.location) && <CodeLine k="location"><Str>{profile.location}</Str></CodeLine>}
          {focus.length > 0 && <CodeLine k="focus"><StrList items={focus} /></CodeLine>}
          {education.length > 0 && <CodeLine k="education"><StrList items={education} /></CodeLine>}
          <div className="text-fg-subtle">{'}'}</div>
        </code>
      </pre>
    </figure>
  )
}

function Hero({ skills, timeline }: { skills: SkillGroup[]; timeline: TimelineEntry[] }) {
  const { profile, settings, socialLinks } = useSiteData()
  const avatar = publicUrl('profile-assets', profile.avatar_path)
  return (
    <section className="relative overflow-hidden border-b border-line">
      <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-gold/40 to-transparent" />
      <div className="container-page grid gap-14 pt-16 pb-20 md:pt-24 md:pb-28 lg:grid-cols-[1.25fr_1fr] lg:items-center lg:gap-16">
        <div>
          <p className="eyebrow animate-rise flex items-center gap-3">
            {avatar && <img src={avatar} alt={profile.avatar_alt ?? ''} className="size-8 rounded-full border border-line object-cover" />}
            <span>{profile.headline}</span>
          </p>
          <h1 className="display animate-rise mt-6 text-[clamp(3rem,9vw,6.5rem)] text-fg [animation-delay:60ms]">
            {profile.full_name}
            <span className="text-gold">.</span>
          </h1>
          {hasText(profile.intro) && (
            <p className="animate-rise mt-7 max-w-xl text-lg leading-relaxed text-fg-muted [animation-delay:120ms]">{profile.intro}</p>
          )}
          <div className="animate-rise mt-9 flex flex-wrap gap-3 [animation-delay:160ms]">
            <Button asChild size="lg">
              <Link to="/projects">
                View projects <ArrowRight aria-hidden />
              </Link>
            </Button>
            <Button asChild size="lg" variant="secondary">
              <Link to="/contact">
                <Mail aria-hidden /> Contact me
              </Link>
            </Button>
            {settings.cv_published && <CvButton size="lg" variant="ghost" />}
          </div>
          <SocialLinks links={socialLinks} className="animate-rise mt-10 [animation-delay:200ms]" />
        </div>
        <DeveloperPanel skills={skills} timeline={timeline} />
      </div>
    </section>
  )
}

function FeaturedWork({ limit }: { limit: number }) {
  const featured = useQuery({ queryKey: qk.featured(limit), queryFn: () => fetchFeaturedProjects(limit) })
  if (featured.isPending) {
    return (
      <div className="container-page section grid gap-10 md:grid-cols-3">
        {Array.from({ length: 3 }, (_, i) => <Skeleton key={i} className="aspect-[16/10]" />)}
      </div>
    )
  }
  if (!featured.data?.length) return null
  return (
    <section className="section" aria-labelledby="work-heading">
      <div className="container-page">
        <SectionHeader
          index="01"
          label="Selected work"
          title={<span id="work-heading">Featured projects</span>}
          action={
            <Link to="/projects" className="link-underline inline-flex items-center gap-1.5 text-sm text-fg-muted hover:text-fg">
              All projects <ArrowRight className="size-4" aria-hidden />
            </Link>
          }
        />
        <div className="grid gap-x-8 gap-y-14 md:grid-cols-2 lg:grid-cols-3">
          {featured.data.map((p) => <ProjectCard key={p.id} project={p} />)}
        </div>
      </div>
    </section>
  )
}

function Toolkit({ groups }: { groups: SkillGroup[] }) {
  if (groups.length === 0) return null
  return (
    <section className="section border-t border-line bg-surface/40" aria-labelledby="toolkit-heading">
      <div className="container-page">
        <SectionHeader
          index="02"
          label="Toolkit"
          title={<span id="toolkit-heading">Technologies I work with</span>}
          action={
            <Link to="/skills" className="link-underline inline-flex items-center gap-1.5 text-sm text-fg-muted hover:text-fg">
              All skills <ArrowRight className="size-4" aria-hidden />
            </Link>
          }
        />
        <div className="grid gap-px overflow-hidden rounded-lg border border-line bg-line sm:grid-cols-2 lg:grid-cols-3">
          {groups.slice(0, 6).map((group) => (
            <div key={group.id} className="bg-bg p-6">
              <h3 className="eyebrow mb-4">{group.name}</h3>
              <ul className="flex flex-wrap gap-x-4 gap-y-2.5">
                {group.skills.map((skill) => {
                  const Icon = skillIcon(skill.icon)
                  return (
                    <li key={skill.id} className="flex items-center gap-1.5 text-sm text-fg">
                      {Icon && <Icon className="size-3.5 text-fg-subtle" aria-hidden />}
                      {skill.name}
                    </li>
                  )
                })}
              </ul>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

function Background({ showAbout, showEducation, timeline }: { showAbout: boolean; showEducation: boolean; timeline: TimelineEntry[] }) {
  const { profile } = useSiteData()
  const aboutPreview = paragraphs(profile.bio)[0]
  const education = timeline.filter((t) => t.kind === 'education' || t.kind === 'training' || t.kind === 'certification')
  const about = showAbout && aboutPreview
  const edu = showEducation && education.length > 0
  if (!about && !edu) return null
  return (
    <section className="section border-t border-line" aria-labelledby="background-heading">
      <div className="container-page">
        <SectionHeader index="03" label="Background" title={<span id="background-heading">About &amp; education</span>} />
        <div className="grid gap-14 lg:grid-cols-2">
          {about && (
            <div>
              <Prose text={aboutPreview} className="text-base" />
              <Link to="/about" className="link-underline mt-6 inline-flex items-center gap-1.5 text-sm text-gold">
                More about me <ArrowRight className="size-4" aria-hidden />
              </Link>
            </div>
          )}
          {edu && (
            <ol className="grid gap-px overflow-hidden rounded-lg border border-line bg-line">
              {education.slice(0, 4).map((entry) => {
                const range = formatRange(entry.start_date, entry.end_date, entry.is_current)
                return (
                  <li key={entry.id} className="bg-bg p-5">
                    <p className="eyebrow">{entry.kind}{range && ` · ${range}`}</p>
                    <p className="mt-2 font-display text-lg text-fg">{entry.title}</p>
                    <p className="text-sm text-fg-muted">{entry.organization}</p>
                  </li>
                )
              })}
            </ol>
          )}
        </div>
      </div>
    </section>
  )
}

function ContactCta() {
  return (
    <section className="section border-t border-line">
      <div className="container-page">
        <div className="relative overflow-hidden rounded-lg border border-line bg-surface px-6 py-14 sm:px-12 md:py-20">
          <div aria-hidden className="hairline absolute inset-x-0 top-0" />
          <p className="eyebrow">Get in touch</p>
          <h2 className="display mt-4 max-w-2xl text-4xl text-fg sm:text-5xl">Have a project or a role in mind?</h2>
          <p className="mt-4 max-w-xl text-fg-muted">Send a message and I will get back to you.</p>
          <Button asChild size="lg" className="mt-8">
            <Link to="/contact">
              Contact me <ArrowRight aria-hidden />
            </Link>
          </Button>
        </div>
      </div>
    </section>
  )
}

export default function HomePage() {
  const { settings } = useSiteData()
  const skills = useQuery({ queryKey: qk.skills, queryFn: fetchSkillGroups })
  const timeline = useQuery({ queryKey: qk.timeline, queryFn: fetchTimeline })
  const skillGroups = skills.data ?? []
  const entries = timeline.data ?? []
  return (
    <>
      <Seo path="/" type="profile" />
      <Hero skills={skillGroups} timeline={entries} />
      {settings.show_featured_projects && <FeaturedWork limit={settings.featured_limit} />}
      {settings.show_skills && <Toolkit groups={skillGroups} />}
      <Background showAbout={settings.show_about} showEducation={settings.show_education} timeline={entries} />
      {settings.show_contact && <ContactCta />}
    </>
  )
}
