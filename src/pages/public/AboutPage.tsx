import { useQuery } from '@tanstack/react-query'
import { ArrowRight, Mail, MapPin, Phone } from 'lucide-react'
import { Link } from 'react-router'
import { CvButton, Prose, SectionHeader, SocialLinks } from '@/components/site/primitives'
import { Seo } from '@/components/site/Seo'
import { useSiteData } from '@/components/site/SiteData'
import { Button } from '@/components/ui/button'
import { fetchTimeline } from '@/lib/api/public'
import { qk } from '@/lib/query'
import { publicUrl } from '@/lib/storage'
import { formatRange, hasText } from '@/lib/utils'

function Part({ title, text }: { title: string; text: string | null }) {
  if (!hasText(text)) return null
  return (
    <section className="grid gap-4 border-t border-line pt-8 md:grid-cols-[12rem_1fr] md:gap-10">
      <h2 className="eyebrow pt-1 text-fg-muted">{title}</h2>
      <Prose text={text} />
    </section>
  )
}

export default function AboutPage() {
  const { profile, settings, socialLinks } = useSiteData()
  const timeline = useQuery({ queryKey: qk.timeline, queryFn: fetchTimeline })
  const education = (timeline.data ?? []).filter((t) => t.kind === 'education' || t.kind === 'training')
  const avatar = publicUrl('profile-assets', profile.avatar_path)

  return (
    <div className="container-page section">
      <Seo title="About" path="/about" type="profile" description={profile.intro} />
      <SectionHeader as="h1" label="About" title={<>Hi, I’m {profile.full_name.split(' ')[0]}.</>} description={profile.intro} />

      <div className="grid gap-14 lg:grid-cols-[1fr_20rem] lg:gap-20">
        <div className="grid gap-12">
          <Part title="Biography" text={profile.bio} />
          <Part title="Journey" text={profile.journey} />
          {education.length > 0 && (
            <section className="grid gap-4 border-t border-line pt-8 md:grid-cols-[12rem_1fr] md:gap-10">
              <h2 className="eyebrow pt-1 text-fg-muted">Education</h2>
              <ul className="grid gap-5">
                {education.map((e) => {
                  const range = formatRange(e.start_date, e.end_date, e.is_current)
                  return (
                    <li key={e.id}>
                      <p className="font-display text-lg text-fg">{e.title}</p>
                      <p className="text-sm text-fg-muted">
                        {e.organization}
                        {e.location && ` · ${e.location}`}
                        {range && ` · ${range}`}
                      </p>
                    </li>
                  )
                })}
              </ul>
            </section>
          )}
          <Part title="Interests" text={profile.interests} />
          <Part title="Goals" text={profile.goals} />
        </div>

        <aside className="grid content-start gap-6 lg:sticky lg:top-24">
          {avatar && (
            <img src={avatar} alt={profile.avatar_alt ?? profile.full_name} className="aspect-[4/5] w-full rounded-lg border border-line object-cover" />
          )}
          <div className="grid gap-3 rounded-lg border border-line bg-surface p-5 text-sm">
            <p className="font-medium text-fg">{profile.headline}</p>
            {hasText(profile.location) && (
              <p className="flex items-center gap-2 text-fg-muted"><MapPin className="size-4 text-fg-subtle" aria-hidden /> {profile.location}</p>
            )}
            {hasText(profile.public_email) && (
              <a href={`mailto:${profile.public_email}`} className="flex items-center gap-2 text-fg-muted hover:text-gold">
                <Mail className="size-4 text-fg-subtle" aria-hidden /> {profile.public_email}
              </a>
            )}
            {hasText(profile.phone) && (
              <a href={`tel:${profile.phone.replace(/[^+\d]/g, '')}`} className="flex items-center gap-2 text-fg-muted hover:text-gold">
                <Phone className="size-4 text-fg-subtle" aria-hidden /> {profile.phone}
              </a>
            )}
            <SocialLinks links={socialLinks} className="mt-2 border-t border-line pt-4" />
          </div>
          <div className="flex flex-wrap gap-3">
            <Button asChild>
              <Link to="/contact">Contact me <ArrowRight aria-hidden /></Link>
            </Button>
            {settings.cv_published && <CvButton />}
          </div>
        </aside>
      </div>
    </div>
  )
}
