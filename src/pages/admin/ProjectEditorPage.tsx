import { zodResolver } from '@hookform/resolvers/zod'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Eye, EyeOff, Rocket, Save, Trash2 } from 'lucide-react'
import { useEffect, useState, type ReactNode } from 'react'
import { useForm, type UseFormRegisterReturn } from 'react-hook-form'
import { Link, useNavigate, useParams } from 'react-router'
import { toast } from 'sonner'
import { GalleryManager } from '@/components/admin/GalleryManager'
import { ImageSlot, PageHeader, useAdminMutation } from '@/components/admin/shared'
import { TagPicker } from '@/components/admin/TagPicker'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/ui/dialog'
import { CharCount, Field, Input, Select, Switch, Textarea } from '@/components/ui/form'
import { Badge, Card, CardHeader, EmptyState, ErrorState, Spinner } from '@/components/ui/misc'
import {
  createProject,
  deleteProject,
  getAdminProject,
  isSlugAvailable,
  listProjectCategories,
  removeProjectThumbnail,
  setProjectSkills,
  setProjectThumbnail,
  updateProject,
  type AdminProject,
} from '@/lib/api/admin'
import { tagNames } from '@/lib/api/public'
import type { Enums, TablesInsert } from '@/lib/database.types'
import { toAppError } from '@/lib/errors'
import { FILE_RULES } from '@/lib/files'
import { qk } from '@/lib/query'
import { publicUrl } from '@/lib/storage'
import { dateToMonth, emptyToNull, monthToDate, slugify } from '@/lib/utils'
import { featureLines, projectSchema, type ProjectValues } from '@/lib/validation/schemas'

type Status = Enums<'project_status'>

function toFormValues(p?: AdminProject): ProjectValues {
  return {
    title: p?.title ?? '',
    slug: p?.slug ?? '',
    summary: p?.summary ?? '',
    category_id: p?.category_id ?? '',
    role: p?.role ?? '',
    overview: p?.overview ?? '',
    problem: p?.problem ?? '',
    objectives: p?.objectives ?? '',
    contribution: p?.contribution ?? '',
    architecture: p?.architecture ?? '',
    challenges: p?.challenges ?? '',
    features: (p?.features ?? []).join('\n'),
    repo_url: p?.repo_url ?? '',
    demo_url: p?.demo_url ?? '',
    started_on: dateToMonth(p?.started_on),
    completed_on: dateToMonth(p?.completed_on),
    is_featured: p?.is_featured ?? false,
    thumbnail_alt: p?.thumbnail_alt ?? '',
    seo_description: p?.seo_description ?? '',
  }
}

function toRow(values: ProjectValues): Omit<TablesInsert<'projects'>, 'status'> {
  const { features, started_on, completed_on, category_id, ...rest } = values
  return {
    ...emptyToNull(rest),
    title: values.title.trim(),
    slug: values.slug.trim(),
    summary: values.summary.trim(),
    category_id: category_id || null,
    features: featureLines(features),
    started_on: monthToDate(started_on),
    completed_on: monthToDate(completed_on),
  }
}

function TextArea({ label, hint, error, max, value, rows = 5, field }: { label: string; hint?: ReactNode; error?: string; max: number; value: string; rows?: number; field: UseFormRegisterReturn }) {
  return (
    <Field label={label} error={error} hint={<span className="flex justify-between gap-4"><span>{hint}</span><CharCount value={value} max={max} /></span>}>
      {({ id, describedBy, invalid }) => <Textarea id={id} rows={rows} aria-describedby={describedBy} aria-invalid={invalid} {...field} />}
    </Field>
  )
}

type Category = Awaited<ReturnType<typeof listProjectCategories>>[number]

function Editor({ project, categories }: { project?: AdminProject; categories: Category[] }) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const isNew = !project
  const [slugTouched, setSlugTouched] = useState(!isNew)
  const [tags, setTags] = useState<string[]>(() => (project ? tagNames(project).map((t) => t.id) : []))
  const [tagsDirty, setTagsDirty] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [saving, setSaving] = useState<Status | 'save' | null>(null)

  const form = useForm<ProjectValues>({ resolver: zodResolver(projectSchema), defaultValues: toFormValues(project), mode: 'onTouched' })
  const { register, handleSubmit, formState, watch, setValue, setError, reset } = form
  const { errors, isDirty } = formState
  const title = watch('title')

  useEffect(() => {
    if (!slugTouched) setValue('slug', slugify(title ?? ''), { shouldValidate: Boolean(title) })
  }, [title, slugTouched, setValue])

  // Warn before leaving with unsaved edits.
  const unsaved = isDirty || tagsDirty
  useEffect(() => {
    if (!unsaved) return
    const handler = (e: BeforeUnloadEvent) => e.preventDefault()
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [unsaved])

  const invalidateAll = async (id?: string) => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: qk.adminProjects }),
      queryClient.invalidateQueries({ queryKey: qk.adminStats }),
      id ? queryClient.invalidateQueries({ queryKey: qk.adminProject(id) }) : null,
      queryClient.invalidateQueries({ predicate: (q) => q.queryKey[0] !== 'admin' }),
    ])
  }

  const submit = (intent: Status | 'save') =>
    handleSubmit(async (values) => {
      setSaving(intent)
      try {
        if (!(await isSlugAvailable(values.slug, project?.id))) {
          setError('slug', { message: 'This slug is already used by another project.' })
          return
        }
        const status: Status = intent === 'save' ? (project?.status ?? 'draft') : intent
        const row = { ...toRow(values), status }
        if (isNew) {
          const id = await createProject(row)
          await setProjectSkills(id, tags)
          await invalidateAll(id)
          toast.success(status === 'published' ? 'Project published' : 'Draft saved — you can now add images')
          reset(values)
          navigate(`/admin/projects/${id}`, { replace: true })
        } else {
          await updateProject(project.id, row)
          await setProjectSkills(project.id, tags)
          await invalidateAll(project.id)
          reset(values)
          setTagsDirty(false)
          toast.success(
            intent === 'published' && project.status !== 'published'
              ? 'Project published'
              : intent === 'draft' && project.status === 'published'
                ? 'Project unpublished'
                : 'Changes saved',
          )
        }
      } catch (error) {
        const e = toAppError(error)
        if (e.code === '23505') setError('slug', { message: e.message })
        toast.error(e.message)
      } finally {
        setSaving(null)
      }
    })

  const invalidate = project ? [qk.adminProject(project.id), qk.adminProjects] : []
  const thumbUpload = useAdminMutation((file: File) => setProjectThumbnail(project!.id, file, project!.thumbnail_path), { success: 'Thumbnail updated', invalidate })
  const thumbRemove = useAdminMutation(() => removeProjectThumbnail(project!.id, project!.thumbnail_path!), { success: 'Thumbnail removed', invalidate })
  const remove = useAdminMutation(() => deleteProject(project!.id), {
    success: 'Project deleted',
    invalidate: [qk.adminProjects, qk.adminStats],
    onSuccess: () => {
      reset(toFormValues(project))
      setTagsDirty(false)
      navigate('/admin/projects', { replace: true })
    },
  })

  const published = project?.status === 'published'

  return (
    <>
      <PageHeader
        title={isNew ? 'New project' : project.title}
        description={
          isNew ? 'New projects are saved as private drafts until you publish them.' : (
            <span className="flex items-center gap-2">
              <Badge tone={published ? 'success' : 'muted'}>{published ? 'Published' : 'Draft'}</Badge>
              <span>/projects/{project.slug}</span>
            </span>
          )
        }
        actions={
          !isNew && (
            <>
              <Button asChild variant="ghost">
                <Link to={`/admin/projects/${project.id}/preview`}><Eye aria-hidden /> Preview</Link>
              </Button>
              <Button variant="danger-ghost" onClick={() => setConfirmDelete(true)}>
                <Trash2 aria-hidden /> Delete
              </Button>
            </>
          )
        }
      />

      <form noValidate onSubmit={(e) => e.preventDefault()} className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start">
        <div className="grid min-w-0 gap-6">
          <Card>
            <CardHeader title="Basics" />
            <div className="grid gap-5 p-5">
              <Field label="Title" required error={errors.title?.message}>
                {({ id, describedBy, invalid }) => <Input id={id} aria-describedby={describedBy} aria-invalid={invalid} maxLength={120} {...register('title')} />}
              </Field>
              <Field label="Slug" required error={errors.slug?.message} hint="Used in the URL. Lowercase letters, numbers and hyphens.">
                {({ id, describedBy, invalid }) => (
                  <div className="flex items-center rounded-md border border-line bg-surface-2 focus-within:border-gold">
                    <span className="pl-3 font-mono text-xs text-fg-subtle">/projects/</span>
                    <Input
                      id={id}
                      aria-describedby={describedBy}
                      aria-invalid={invalid}
                      className="border-0 bg-transparent pl-1 font-mono focus-visible:border-0"
                      maxLength={80}
                      {...register('slug', { onChange: () => setSlugTouched(true) })}
                    />
                  </div>
                )}
              </Field>
              <TextArea label="Summary" max={300} rows={2} value={watch('summary')} error={errors.summary?.message} hint="Shown on project cards and as the default description." field={register('summary')} />
              <div className="grid gap-5 sm:grid-cols-2">
                <Field label="Category">
                  {({ id }) => (
                    <Select id={id} {...register('category_id')}>
                      <option value="">Uncategorised</option>
                      {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </Select>
                  )}
                </Field>
                <Field label="My role" error={errors.role?.message} hint="e.g. Solo developer, Backend developer">
                  {({ id, describedBy, invalid }) => <Input id={id} aria-describedby={describedBy} aria-invalid={invalid} maxLength={120} {...register('role')} />}
                </Field>
                <Field label="Started" error={errors.started_on?.message}>
                  {({ id, describedBy, invalid }) => <Input id={id} type="month" aria-describedby={describedBy} aria-invalid={invalid} {...register('started_on')} />}
                </Field>
                <Field label="Completed" error={errors.completed_on?.message} hint="Leave empty if ongoing.">
                  {({ id, describedBy, invalid }) => <Input id={id} type="month" aria-describedby={describedBy} aria-invalid={invalid} {...register('completed_on')} />}
                </Field>
              </div>
            </div>
          </Card>

          <Card>
            <CardHeader title="Case study" description="Only sections with content are shown publicly. Separate paragraphs with a blank line; start lines with “- ” for lists." />
            <div className="grid gap-5 p-5">
              <TextArea label="Overview" max={8000} value={watch('overview')} error={errors.overview?.message} field={register('overview')} />
              <TextArea label="Problem being addressed" max={8000} value={watch('problem')} error={errors.problem?.message} field={register('problem')} />
              <TextArea label="Objectives" max={8000} value={watch('objectives')} error={errors.objectives?.message} field={register('objectives')} />
              <TextArea label="My contribution" max={8000} value={watch('contribution')} error={errors.contribution?.message} hint="Describe what you personally built." field={register('contribution')} />
              <TextArea label="Main features" max={8000} rows={6} value={watch('features')} error={errors.features?.message} hint="One feature per line (up to 30)." field={register('features')} />
              <TextArea label="Architecture" max={8000} value={watch('architecture')} error={errors.architecture?.message} field={register('architecture')} />
              <TextArea label="Challenges & solutions" max={8000} value={watch('challenges')} error={errors.challenges?.message} field={register('challenges')} />
            </div>
          </Card>

          <Card>
            <CardHeader title="Technologies" description="Shown as tags and used for the public technology filter." />
            <div className="p-5">
              <TagPicker
                value={tags}
                onChange={(ids) => {
                  setTags(ids)
                  setTagsDirty(true)
                }}
              />
            </div>
          </Card>

          <Card>
            <CardHeader title="Screenshots" />
            <div className="p-5">
              {project ? (
                <GalleryManager projectId={project.id} images={project.images} />
              ) : (
                <EmptyState title="Save the project first" description="Images can be added once the draft has been saved." />
              )}
            </div>
          </Card>
        </div>

        <div className="grid grid-cols-1 gap-6 lg:sticky lg:top-20">
          <Card>
            <CardHeader title={isNew ? 'Save' : 'Publishing'} />
            <div className="grid gap-2 p-5">
              {isNew ? (
                <>
                  <Button onClick={submit('published')} loading={saving === 'published'} disabled={Boolean(saving)}>
                    <Rocket aria-hidden /> Publish
                  </Button>
                  <Button variant="secondary" onClick={submit('draft')} loading={saving === 'draft'} disabled={Boolean(saving)}>
                    <Save aria-hidden /> Save draft
                  </Button>
                </>
              ) : (
                <>
                  <Button onClick={submit('save')} loading={saving === 'save'} disabled={Boolean(saving) || !unsaved}>
                    <Save aria-hidden /> Save changes
                  </Button>
                  {published ? (
                    <Button variant="secondary" onClick={submit('draft')} loading={saving === 'draft'} disabled={Boolean(saving)}>
                      <EyeOff aria-hidden /> Unpublish
                    </Button>
                  ) : (
                    <Button variant="secondary" onClick={submit('published')} loading={saving === 'published'} disabled={Boolean(saving)}>
                      <Rocket aria-hidden /> Save &amp; publish
                    </Button>
                  )}
                </>
              )}
              {unsaved && !isNew && <p className="text-center text-xs text-gold">You have unsaved changes.</p>}
              <label className="mt-3 flex items-center justify-between gap-3 border-t border-line pt-4 text-sm text-fg">
                Featured on homepage
                <Switch checked={watch('is_featured')} onCheckedChange={(v) => setValue('is_featured', v, { shouldDirty: true })} />
              </label>
            </div>
          </Card>

          <Card>
            <CardHeader title="Links" description="Only add public repositories — never private or confidential code." />
            <div className="grid gap-4 p-5">
              <Field label="Live demo URL" error={errors.demo_url?.message}>
                {({ id, describedBy, invalid }) => <Input id={id} type="url" placeholder="https://" aria-describedby={describedBy} aria-invalid={invalid} {...register('demo_url')} />}
              </Field>
              <Field label="Public repository URL" error={errors.repo_url?.message}>
                {({ id, describedBy, invalid }) => <Input id={id} type="url" placeholder="https://github.com/…" aria-describedby={describedBy} aria-invalid={invalid} {...register('repo_url')} />}
              </Field>
            </div>
          </Card>

          <Card>
            <CardHeader title="Thumbnail" />
            <div className="grid gap-4 p-5">
              {project ? (
                <ImageSlot
                  label="Thumbnail"
                  hint={FILE_RULES.projectImage.label}
                  src={publicUrl('project-images', project.thumbnail_path)}
                  uploading={thumbUpload.isPending}
                  removing={thumbRemove.isPending}
                  onUpload={(file) => thumbUpload.mutate(file)}
                  onRemove={() => thumbRemove.mutate()}
                />
              ) : (
                <p className="text-sm text-fg-subtle">Save the draft to upload a thumbnail.</p>
              )}
              <Field label="Thumbnail alt text" error={errors.thumbnail_alt?.message}>
                {({ id, describedBy, invalid }) => <Input id={id} aria-describedby={describedBy} aria-invalid={invalid} maxLength={200} {...register('thumbnail_alt')} />}
              </Field>
            </div>
          </Card>

          <Card>
            <CardHeader title="SEO" />
            <div className="p-5">
              <TextArea label="Meta description" max={300} rows={3} value={watch('seo_description')} error={errors.seo_description?.message} hint="Defaults to the summary." field={register('seo_description')} />
            </div>
          </Card>
        </div>
      </form>

      {project && (
        <ConfirmDialog
          open={confirmDelete}
          onOpenChange={setConfirmDelete}
          title={`Delete “${project.title}”?`}
          description="This permanently deletes the project, its gallery and its uploaded images. This cannot be undone."
          loading={remove.isPending}
          onConfirm={() => remove.mutate()}
        />
      )}
    </>
  )
}

export default function ProjectEditorPage() {
  const { id } = useParams()
  const project = useQuery({ queryKey: qk.adminProject(id ?? 'new'), queryFn: () => getAdminProject(id!), enabled: Boolean(id) })
  // Options must exist before the form mounts, or the uncontrolled <select>
  // would drop the project's saved category.
  const categories = useQuery({ queryKey: qk.adminCategories, queryFn: listProjectCategories })

  if (categories.isPending) return <Spinner />
  if (categories.isError) return <ErrorState message="Categories could not be loaded." onRetry={() => void categories.refetch()} />
  if (!id) return <Editor categories={categories.data} />
  if (project.isPending) return <Spinner />
  if (project.isError) return <ErrorState message="The project could not be loaded." onRetry={() => void project.refetch()} />
  if (!project.data) {
    return <EmptyState title="Project not found" action={<Button asChild variant="secondary"><Link to="/admin/projects">Back to projects</Link></Button>} />
  }
  return <Editor key={project.data.id} project={project.data} categories={categories.data} />
}
