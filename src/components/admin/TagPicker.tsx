import { useQuery } from '@tanstack/react-query'
import { Plus, X } from 'lucide-react'
import { useId, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input, Select } from '@/components/ui/form'
import { createSkill, listAdminSkillGroups } from '@/lib/api/admin'
import { qk } from '@/lib/query'
import { useAdminMutation } from './shared'

/**
 * Technology tags for a project. Tags are skills; creating a new tag here adds
 * a hidden skill (it appears on the project but not in the public skills list
 * until made visible on the Skills page).
 */
export function TagPicker({ value, onChange }: { value: string[]; onChange: (ids: string[]) => void }) {
  const groups = useQuery({ queryKey: qk.adminSkills, queryFn: listAdminSkillGroups })
  const [query, setQuery] = useState('')
  const [newCategory, setNewCategory] = useState('')
  const listId = useId()

  const skills = (groups.data ?? []).flatMap((g) => g.skills)
  const byId = new Map(skills.map((s) => [s.id, s]))
  const term = query.trim().toLowerCase()
  const suggestions = term ? skills.filter((s) => !value.includes(s.id) && s.name.toLowerCase().includes(term)).slice(0, 8) : []
  const exact = skills.find((s) => s.name.toLowerCase() === term)

  const create = useAdminMutation(createSkill, {
    success: (s) => `Added “${s.name}” as a hidden skill`,
    invalidate: [qk.adminSkills],
    onSuccess: (s) => {
      onChange([...value, s.id])
      setQuery('')
    },
  })

  const add = (id: string) => {
    if (!value.includes(id)) onChange([...value, id])
    setQuery('')
  }
  const categoryId = newCategory || groups.data?.[0]?.id || ''

  return (
    <div className="grid gap-3">
      {value.length > 0 ? (
        <ul className="flex flex-wrap gap-2" aria-label="Selected technologies">
          {value.map((id, i) => (
            <li key={id} className="flex items-center gap-1 rounded-sm border border-line-strong bg-surface-2 py-0.5 pr-1 pl-2.5 text-[13px] text-fg">
              {byId.get(id)?.name ?? '…'}
              <button
                type="button"
                className="rounded-sm p-0.5 text-fg-subtle hover:text-fg"
                aria-label={`Remove ${byId.get(id)?.name ?? 'tag'}`}
                onClick={() => onChange(value.filter((_, j) => j !== i))}
              >
                <X className="size-3.5" />
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-fg-subtle">No technologies selected.</p>
      )}
      <div className="relative">
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search or add a technology…"
          aria-label="Search technologies"
          aria-controls={listId}
          maxLength={60}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              const first = exact && !value.includes(exact.id) ? exact : suggestions[0]
              if (first) add(first.id)
            }
          }}
        />
        {term && (
          <div id={listId} className="absolute inset-x-0 top-full z-20 mt-1 rounded-md border border-line bg-surface p-1 shadow-xl shadow-black/40">
            {suggestions.map((s) => (
              <button key={s.id} type="button" onClick={() => add(s.id)} className="block w-full rounded-sm px-3 py-2 text-left text-sm text-fg-muted hover:bg-surface-3 hover:text-fg">
                {s.name}
                {!s.is_visible && <span className="ml-2 text-xs text-fg-subtle">(hidden skill)</span>}
              </button>
            ))}
            {!exact && (
              <div className="flex flex-wrap items-center gap-2 border-t border-line p-2 first:border-t-0">
                <span className="text-xs text-fg-subtle">Create “{query.trim()}” in</span>
                <div className="w-44">
                  <Select value={categoryId} onChange={(e) => setNewCategory(e.target.value)} aria-label="Category for new technology" className="h-8 text-xs">
                    {groups.data?.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
                  </Select>
                </div>
                <Button
                  size="sm"
                  variant="secondary"
                  loading={create.isPending}
                  disabled={!categoryId}
                  onClick={() => create.mutate({ name: query.trim(), category_id: categoryId, is_visible: false })}
                >
                  <Plus aria-hidden /> Create
                </Button>
              </div>
            )}
            {exact && value.includes(exact.id) && <p className="px-3 py-2 text-xs text-fg-subtle">Already added.</p>}
          </div>
        )}
      </div>
    </div>
  )
}
