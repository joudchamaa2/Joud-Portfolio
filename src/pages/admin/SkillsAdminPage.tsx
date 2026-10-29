import { zodResolver } from '@hookform/resolvers/zod'
import { useQuery } from '@tanstack/react-query'
import { Layers, Pencil, Plus, Tags, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { CategoryManager } from '@/components/admin/CategoryManager'
import { PageHeader, ReorderButtons, useAdminMutation } from '@/components/admin/shared'
import { Button } from '@/components/ui/button'
import { ConfirmDialog, Dialog } from '@/components/ui/dialog'
import { Field, Input, Select, Switch } from '@/components/ui/form'
import { Badge, Card, CardHeader, EmptyState, ErrorState, Spinner } from '@/components/ui/misc'
import {
  createSkill,
  createSkillCategory,
  deleteSkill,
  deleteSkillCategory,
  listAdminSkillGroups,
  moveItem,
  renameSkillCategory,
  reorder,
  updateSkill,
  type AdminSkill,
  type AdminSkillGroup,
} from '@/lib/api/admin'
import { ICON_KEYS, skillIcon } from '@/lib/icons'
import { qk } from '@/lib/query'
import { skillSchema, type SkillValues } from '@/lib/validation/schemas'

function SkillDialog({
  open,
  onOpenChange,
  groups,
  skill,
  defaultCategory,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  groups: AdminSkillGroup[]
  skill: AdminSkill | null
  defaultCategory?: string
}) {
  const form = useForm<SkillValues>({
    resolver: zodResolver(skillSchema),
    values: {
      name: skill?.name ?? '',
      category_id: skill?.category_id ?? defaultCategory ?? groups[0]?.id ?? '',
      icon: skill?.icon ?? '',
      proficiency_note: skill?.proficiency_note ?? '',
      is_visible: skill?.is_visible ?? true,
    },
  })
  const { register, handleSubmit, formState, watch, setValue } = form
  const save = useAdminMutation(
    async (values: SkillValues) => {
      const row = { ...values, icon: values.icon || null, proficiency_note: values.proficiency_note.trim() || null }
      if (skill) await updateSkill(skill.id, row)
      else await createSkill(row)
    },
    { success: skill ? 'Skill updated' : 'Skill added', invalidate: [qk.adminSkills, qk.adminStats], onSuccess: () => onOpenChange(false) },
  )
  const Icon = skillIcon(watch('icon'))

  return (
    <Dialog open={open} onOpenChange={onOpenChange} title={skill ? 'Edit skill' : 'Add skill'}>
      <form noValidate onSubmit={handleSubmit((v) => save.mutate(v))} className="grid gap-4">
        <Field label="Name" required error={formState.errors.name?.message}>
          {({ id, describedBy, invalid }) => <Input id={id} aria-describedby={describedBy} aria-invalid={invalid} maxLength={60} {...register('name')} />}
        </Field>
        <Field label="Category" required error={formState.errors.category_id?.message}>
          {({ id }) => (
            <Select id={id} {...register('category_id')}>
              {groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
            </Select>
          )}
        </Field>
        <Field label="Icon" error={formState.errors.icon?.message}>
          {({ id }) => (
            <div className="flex items-center gap-2">
              <span className="grid size-10 shrink-0 place-items-center rounded-md border border-line text-fg-muted">
                {Icon ? <Icon className="size-4" aria-hidden /> : <span className="text-xs">—</span>}
              </span>
              <Select id={id} {...register('icon')}>
                <option value="">No icon</option>
                {ICON_KEYS.map((k) => <option key={k} value={k}>{k}</option>)}
              </Select>
            </div>
          )}
        </Field>
        <Field label="Proficiency note" error={formState.errors.proficiency_note?.message} hint="Optional, honest context — e.g. “Explored”, “Used in coursework”, “Daily use”.">
          {({ id, describedBy, invalid }) => <Input id={id} aria-describedby={describedBy} aria-invalid={invalid} maxLength={160} {...register('proficiency_note')} />}
        </Field>
        <label className="flex items-center justify-between rounded-md border border-line px-3 py-2.5 text-sm text-fg">
          Visible on the public site
          <Switch checked={watch('is_visible')} onCheckedChange={(v) => setValue('is_visible', v, { shouldDirty: true })} />
        </label>
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button type="submit" loading={save.isPending}>{skill ? 'Save' : 'Add skill'}</Button>
        </div>
      </form>
    </Dialog>
  )
}

export default function SkillsAdminPage() {
  const groups = useQuery({ queryKey: qk.adminSkills, queryFn: listAdminSkillGroups })
  const [dialog, setDialog] = useState<{ skill: AdminSkill | null; category?: string } | null>(null)
  const [categoriesOpen, setCategoriesOpen] = useState(false)
  const [toDelete, setToDelete] = useState<AdminSkill | null>(null)

  const invalidate = [qk.adminSkills, qk.adminStats]
  const order = useAdminMutation(({ table, ids }: { table: 'skills' | 'skill_categories'; ids: string[] }) => reorder(table, ids), { invalidate })
  const visibility = useAdminMutation(({ id, visible }: { id: string; visible: boolean }) => updateSkill(id, { is_visible: visible }), { invalidate })
  const remove = useAdminMutation(deleteSkill, { success: 'Skill deleted', invalidate, onSuccess: () => setToDelete(null) })
  const createCat = useAdminMutation(createSkillCategory, { success: 'Category added', invalidate })
  const renameCat = useAdminMutation(({ id, name }: { id: string; name: string }) => renameSkillCategory(id, name), { success: 'Category renamed', invalidate })
  const deleteCat = useAdminMutation(deleteSkillCategory, { success: 'Category deleted', invalidate })

  const data = groups.data ?? []
  return (
    <>
      <PageHeader
        title="Skills"
        description="Grouped by category. Hidden skills can still appear as project technology tags."
        actions={
          <>
            <Button variant="secondary" onClick={() => setCategoriesOpen(true)}><Tags aria-hidden /> Categories</Button>
            <Button onClick={() => setDialog({ skill: null })} disabled={data.length === 0}><Plus aria-hidden /> Add skill</Button>
          </>
        }
      />
      {groups.isPending ? (
        <Spinner />
      ) : groups.isError ? (
        <ErrorState message="Skills could not be loaded." onRetry={() => void groups.refetch()} />
      ) : data.length === 0 ? (
        <EmptyState icon={Layers} title="No skill categories" description="Create a category first." action={<Button onClick={() => setCategoriesOpen(true)}>Manage categories</Button>} />
      ) : (
        <div className="grid grid-cols-1 gap-6">
          {data.map((group) => (
            <Card key={group.id}>
              <CardHeader
                title={group.name}
                description={`${group.skills.length} skill${group.skills.length === 1 ? '' : 's'}`}
                actions={<Button size="sm" variant="ghost" onClick={() => setDialog({ skill: null, category: group.id })}><Plus aria-hidden /> Add</Button>}
              />
              {group.skills.length === 0 ? (
                <p className="px-5 py-6 text-sm text-fg-subtle">No skills in this category.</p>
              ) : (
                <ul className="divide-y divide-line">
                  {group.skills.map((skill, i) => {
                    const Icon = skillIcon(skill.icon)
                    return (
                      <li key={skill.id} className="flex items-center gap-3 px-3 py-2 sm:px-4">
                        <ReorderButtons
                          index={i}
                          count={group.skills.length}
                          label={skill.name}
                          disabled={order.isPending}
                          onMove={(d) => order.mutate({ table: 'skills', ids: moveItem(group.skills, i, d).map((s) => s.id) })}
                        />
                        <span className="grid size-8 shrink-0 place-items-center rounded-md border border-line text-fg-subtle">
                          {Icon && <Icon className="size-3.5" aria-hidden />}
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm text-fg">
                            {skill.name} {!skill.is_visible && <Badge tone="muted" className="ml-1">Hidden</Badge>}
                          </p>
                          {skill.proficiency_note && <p className="truncate text-xs text-fg-subtle">{skill.proficiency_note}</p>}
                        </div>
                        <Switch
                          checked={skill.is_visible}
                          disabled={visibility.isPending}
                          onCheckedChange={(v) => visibility.mutate({ id: skill.id, visible: v })}
                          aria-label={`${skill.is_visible ? 'Hide' : 'Show'} ${skill.name}`}
                        />
                        <Button size="icon-sm" variant="ghost" aria-label={`Edit ${skill.name}`} onClick={() => setDialog({ skill })}><Pencil /></Button>
                        <Button size="icon-sm" variant="danger-ghost" aria-label={`Delete ${skill.name}`} onClick={() => setToDelete(skill)}><Trash2 /></Button>
                      </li>
                    )
                  })}
                </ul>
              )}
            </Card>
          ))}
        </div>
      )}

      {dialog && (
        <SkillDialog open onOpenChange={(o) => !o && setDialog(null)} groups={data} skill={dialog.skill} defaultCategory={dialog.category} />
      )}
      <Dialog open={categoriesOpen} onOpenChange={setCategoriesOpen} title="Skill categories" description="Categories with skills cannot be deleted until they are empty.">
        <CategoryManager
          categories={data.map((g) => ({ id: g.id, name: g.name, count: g.skills.length }))}
          busy={createCat.isPending || renameCat.isPending || deleteCat.isPending || order.isPending}
          onCreate={createCat.mutateAsync}
          onRename={(id, name) => renameCat.mutateAsync({ id, name })}
          onDelete={deleteCat.mutateAsync}
          onReorder={(ids) => order.mutateAsync({ table: 'skill_categories', ids })}
          deleteHint={(c) => (c.count ? `This category still has ${c.count} skill(s). Move or delete them first.` : 'This category is empty.')}
        />
      </Dialog>
      <ConfirmDialog
        open={Boolean(toDelete)}
        onOpenChange={(o) => !o && setToDelete(null)}
        title={`Delete “${toDelete?.name}”?`}
        description="The skill will also be removed from any projects that use it as a technology tag."
        loading={remove.isPending}
        onConfirm={() => toDelete && remove.mutate(toDelete.id)}
      />
    </>
  )
}
