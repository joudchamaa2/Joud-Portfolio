import { useQuery } from '@tanstack/react-query'
import { Eye, FolderKanban, Pencil, Plus, Search, Star, Tags, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router'
import { CategoryManager } from '@/components/admin/CategoryManager'
import { PageHeader, ReorderButtons, useAdminMutation } from '@/components/admin/shared'
import { Button } from '@/components/ui/button'
import { ConfirmDialog, Dialog } from '@/components/ui/dialog'
import { Input, Switch } from '@/components/ui/form'
import { Badge, EmptyState, ErrorState, Spinner } from '@/components/ui/misc'
import {
  createProjectCategory,
  deleteProject,
  deleteProjectCategory,
  listAdminProjects,
  listProjectCategories,
  moveItem,
  renameProjectCategory,
  reorder,
  updateProject,
  type AdminProjectRow,
} from '@/lib/api/admin'
import { qk } from '@/lib/query'
import { publicUrl } from '@/lib/storage'
import { formatDate } from '@/lib/utils'

function CategoriesDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const categories = useQuery({ queryKey: qk.adminCategories, queryFn: listProjectCategories, enabled: open })
  const invalidate = [qk.adminCategories, qk.adminProjects]
  const create = useAdminMutation(createProjectCategory, { success: 'Category added', invalidate })
  const rename = useAdminMutation(({ id, name }: { id: string; name: string }) => renameProjectCategory(id, name), { success: 'Category renamed', invalidate })
  const remove = useAdminMutation(deleteProjectCategory, { success: 'Category deleted', invalidate })
  const order = useAdminMutation((ids: string[]) => reorder('project_categories', ids), { invalidate })
  const busy = create.isPending || rename.isPending || remove.isPending || order.isPending

  return (
    <Dialog open={open} onOpenChange={onOpenChange} title="Project categories" description="Categories group projects and power the public filters.">
      {categories.isPending ? (
        <Spinner />
      ) : (
        <CategoryManager
          categories={(categories.data ?? []).map((c) => ({ id: c.id, name: c.name, count: c.projects[0]?.count ?? 0 }))}
          busy={busy}
          onCreate={create.mutateAsync}
          onRename={(id, name) => rename.mutateAsync({ id, name })}
          onDelete={remove.mutateAsync}
          onReorder={order.mutateAsync}
          deleteHint={(c) => (c.count ? `${c.count} project(s) will become uncategorised.` : 'This category is not used by any project.')}
        />
      )}
    </Dialog>
  )
}

export default function ProjectsAdminPage() {
  const projects = useQuery({ queryKey: qk.adminProjects, queryFn: listAdminProjects })
  const [search, setSearch] = useState('')
  const [toDelete, setToDelete] = useState<AdminProjectRow | null>(null)
  const [categoriesOpen, setCategoriesOpen] = useState(false)

  const invalidate = [qk.adminProjects, qk.adminStats]
  const patch = useAdminMutation(
    ({ id, values }: { id: string; values: Parameters<typeof updateProject>[1] }) => updateProject(id, values),
    {
      invalidate,
      success: (_r, { values }) =>
        values.status === 'published' ? 'Project published' : values.status === 'draft' ? 'Project unpublished' : 'Project updated',
    },
  )
  const order = useAdminMutation((ids: string[]) => reorder('projects', ids), { invalidate })
  const remove = useAdminMutation(deleteProject, { success: 'Project deleted', invalidate, onSuccess: () => setToDelete(null) })

  const all = projects.data ?? []
  const term = search.trim().toLowerCase()
  const filtered = term ? all.filter((p) => `${p.title} ${p.slug} ${p.category?.name ?? ''}`.toLowerCase().includes(term)) : all

  return (
    <>
      <PageHeader
        title="Projects"
        description="Create, publish and order the projects shown on your portfolio."
        actions={
          <>
            <Button variant="secondary" onClick={() => setCategoriesOpen(true)}>
              <Tags aria-hidden /> Categories
            </Button>
            <Button asChild>
              <Link to="/admin/projects/new"><Plus aria-hidden /> New project</Link>
            </Button>
          </>
        }
      />

      {projects.isPending ? (
        <Spinner />
      ) : projects.isError ? (
        <ErrorState message="Projects could not be loaded." onRetry={() => void projects.refetch()} />
      ) : all.length === 0 ? (
        <EmptyState
          icon={FolderKanban}
          title="No projects yet"
          description="Add your first project. It stays a private draft until you publish it."
          action={<Button asChild><Link to="/admin/projects/new"><Plus aria-hidden /> New project</Link></Button>}
        />
      ) : (
        <>
          <div className="relative mb-4 max-w-sm">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-fg-subtle" aria-hidden />
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search projects" aria-label="Search projects" className="pl-9" />
          </div>
          <ul className="divide-y divide-line overflow-hidden rounded-lg border border-line bg-surface">
            {filtered.map((p) => {
              const index = all.findIndex((x) => x.id === p.id)
              const thumb = publicUrl('project-images', p.thumbnail_path)
              const published = p.status === 'published'
              return (
                <li key={p.id} className="flex flex-wrap items-center gap-3 px-3 py-3 sm:flex-nowrap sm:px-4">
                  <ReorderButtons
                    index={index}
                    count={all.length}
                    label={p.title}
                    disabled={Boolean(term) || order.isPending}
                    onMove={(d) => order.mutate(moveItem(all, index, d).map((x) => x.id))}
                  />
                  <div className="hidden h-12 w-20 shrink-0 overflow-hidden rounded-sm border border-line bg-surface-2 sm:block">
                    {thumb && <img src={thumb} alt="" className="size-full object-cover" />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <Link to={`/admin/projects/${p.id}`} className="truncate font-medium text-fg hover:text-gold">{p.title}</Link>
                      <Badge tone={published ? 'success' : 'muted'}>{published ? 'Published' : 'Draft'}</Badge>
                      {p.is_featured && <Badge tone="gold"><Star className="size-3" aria-hidden /> Featured</Badge>}
                    </div>
                    <p className="mt-0.5 truncate text-xs text-fg-subtle">
                      /{p.slug} · {p.category?.name ?? 'Uncategorised'} · Updated {formatDate(p.updated_at)}
                    </p>
                  </div>
                  <div className="flex items-center gap-4">
                    <label className="flex items-center gap-2 text-xs text-fg-muted">
                      <Switch
                        checked={published}
                        disabled={patch.isPending}
                        onCheckedChange={(on) => patch.mutate({ id: p.id, values: { status: on ? 'published' : 'draft' } })}
                        aria-label={`${published ? 'Unpublish' : 'Publish'} ${p.title}`}
                      />
                      <span className="hidden md:inline">Live</span>
                    </label>
                    <label className="flex items-center gap-2 text-xs text-fg-muted">
                      <Switch
                        checked={p.is_featured}
                        disabled={patch.isPending}
                        onCheckedChange={(on) => patch.mutate({ id: p.id, values: { is_featured: on } })}
                        aria-label={`${p.is_featured ? 'Unfeature' : 'Feature'} ${p.title}`}
                      />
                      <span className="hidden md:inline">Featured</span>
                    </label>
                    <div className="flex">
                      <Button asChild variant="ghost" size="icon-sm" aria-label={`Preview ${p.title}`}>
                        <Link to={`/admin/projects/${p.id}/preview`}><Eye /></Link>
                      </Button>
                      <Button asChild variant="ghost" size="icon-sm" aria-label={`Edit ${p.title}`}>
                        <Link to={`/admin/projects/${p.id}`}><Pencil /></Link>
                      </Button>
                      <Button variant="danger-ghost" size="icon-sm" aria-label={`Delete ${p.title}`} onClick={() => setToDelete(p)}>
                        <Trash2 />
                      </Button>
                    </div>
                  </div>
                </li>
              )
            })}
            {filtered.length === 0 && <li className="px-4 py-8 text-center text-sm text-fg-subtle">No projects match “{search}”.</li>}
          </ul>
          {term && <p className="mt-3 text-xs text-fg-subtle">Clear the search to reorder projects.</p>}
        </>
      )}

      <CategoriesDialog open={categoriesOpen} onOpenChange={setCategoriesOpen} />
      <ConfirmDialog
        open={Boolean(toDelete)}
        onOpenChange={(open) => !open && setToDelete(null)}
        title={`Delete “${toDelete?.title}”?`}
        description="This permanently deletes the project, its gallery and its uploaded images. This cannot be undone."
        loading={remove.isPending}
        onConfirm={() => toDelete && remove.mutate(toDelete.id)}
      />
    </>
  )
}
