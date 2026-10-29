import { useQuery } from '@tanstack/react-query'
import { Layers } from 'lucide-react'
import { SectionHeader } from '@/components/site/primitives'
import { Seo } from '@/components/site/Seo'
import { EmptyState, ErrorState, Spinner } from '@/components/ui/misc'
import { fetchSkillGroups } from '@/lib/api/public'
import { skillIcon } from '@/lib/icons'
import { qk } from '@/lib/query'

export default function SkillsPage() {
  const skills = useQuery({ queryKey: qk.skills, queryFn: fetchSkillGroups })

  return (
    <div className="container-page section">
      <Seo title="Skills" path="/skills" description="Technologies, languages and tools Joud Chamaa works with." />
      <SectionHeader
        as="h1"
        label="Skills"
        title="Technical toolkit"
        description="The languages, frameworks and tools I have worked with. Notes indicate where something has been explored rather than used extensively."
      />
      {skills.isPending ? (
        <Spinner />
      ) : skills.isError ? (
        <ErrorState message="Skills could not be loaded." onRetry={() => void skills.refetch()} />
      ) : skills.data.length === 0 ? (
        <EmptyState icon={Layers} title="No skills listed yet" />
      ) : (
        <div className="grid gap-px overflow-hidden rounded-lg border border-line bg-line md:grid-cols-2">
          {skills.data.map((group, i) => (
            <section key={group.id} aria-labelledby={`skills-${group.id}`} className="bg-bg p-6 sm:p-8">
              <h2 id={`skills-${group.id}`} className="mb-6 flex items-baseline gap-3">
                <span className="font-mono text-xs text-gold">{String(i + 1).padStart(2, '0')}</span>
                <span className="font-display text-xl text-fg">{group.name}</span>
              </h2>
              <ul className="grid gap-3 sm:grid-cols-2">
                {group.skills.map((skill) => {
                  const Icon = skillIcon(skill.icon)
                  return (
                    <li key={skill.id} className="flex items-start gap-3">
                      <span className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-md border border-line text-fg-subtle">
                        {Icon ? <Icon className="size-3.5" aria-hidden /> : <span className="size-1 rounded-full bg-fg-subtle" />}
                      </span>
                      <span className="grid">
                        <span className="text-sm text-fg">{skill.name}</span>
                        {skill.proficiency_note && <span className="text-xs text-fg-subtle">{skill.proficiency_note}</span>}
                      </span>
                    </li>
                  )
                })}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  )
}
