import { Check, Pencil, Plus, Trash2, X } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/ui/dialog'
import { Input } from '@/components/ui/form'
import { moveItem } from '@/lib/api/admin'
import { categorySchema } from '@/lib/validation/schemas'
import { ReorderButtons } from './shared'

type Category = { id: string; name: string; count?: number }

/**
 * Inline list editor for categories (used for project and skill categories).
 * Persistence is delegated to the caller.
 */
export function CategoryManager({
  categories,
  busy,
  onCreate,
  onRename,
  onDelete,
  onReorder,
  deleteHint,
}: {
  categories: Category[]
  busy: boolean
  onCreate: (name: string) => Promise<unknown>
  onRename: (id: string, name: string) => Promise<unknown>
  onDelete: (id: string) => Promise<unknown>
  onReorder: (ids: string[]) => Promise<unknown>
  deleteHint: (c: Category) => string
}) {
  const [newName, setNewName] = useState('')
  const [editing, setEditing] = useState<{ id: string; name: string } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [toDelete, setToDelete] = useState<Category | null>(null)

  function validName(name: string) {
    const result = categorySchema.safeParse({ name })
    setError(result.success ? null : (result.error.issues[0]?.message ?? 'Invalid name'))
    return result.success ? result.data.name : null
  }

  return (
    <div className="grid gap-4">
      <form
        className="flex gap-2"
        onSubmit={async (e) => {
          e.preventDefault()
          const name = validName(newName)
          if (!name) return
          await onCreate(name).then(() => setNewName(''), () => undefined)
        }}
      >
        <Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="New category name" aria-label="New category name" maxLength={60} />
        <Button type="submit" variant="secondary" disabled={busy}>
          <Plus aria-hidden /> Add
        </Button>
      </form>
      {error && <p role="alert" className="text-xs text-danger">{error}</p>}
      <ul className="divide-y divide-line rounded-md border border-line">
        {categories.map((c, i) => (
          <li key={c.id} className="flex items-center gap-2 px-2 py-1.5">
            <ReorderButtons
              index={i}
              count={categories.length}
              label={c.name}
              disabled={busy}
              onMove={(d) => void onReorder(moveItem(categories, i, d).map((x) => x.id)).catch(() => undefined)}
            />
            {editing?.id === c.id ? (
              <form
                className="flex flex-1 items-center gap-1"
                onSubmit={async (e) => {
                  e.preventDefault()
                  const name = validName(editing.name)
                  if (!name) return
                  await onRename(c.id, name).then(() => setEditing(null), () => undefined)
                }}
              >
                <Input value={editing.name} onChange={(e) => setEditing({ id: c.id, name: e.target.value })} aria-label="Category name" maxLength={60} ref={(el) => el?.focus()} className="h-8" />
                <Button type="submit" size="icon-sm" variant="ghost" aria-label="Save name" disabled={busy}><Check /></Button>
                <Button size="icon-sm" variant="ghost" aria-label="Cancel" onClick={() => setEditing(null)}><X /></Button>
              </form>
            ) : (
              <>
                <span className="flex-1 text-sm text-fg">
                  {c.name}
                  {c.count !== undefined && <span className="ml-2 font-mono text-xs text-fg-subtle">{c.count}</span>}
                </span>
                <Button size="icon-sm" variant="ghost" aria-label={`Rename ${c.name}`} onClick={() => setEditing({ id: c.id, name: c.name })}><Pencil /></Button>
                <Button size="icon-sm" variant="danger-ghost" aria-label={`Delete ${c.name}`} onClick={() => setToDelete(c)}><Trash2 /></Button>
              </>
            )}
          </li>
        ))}
        {categories.length === 0 && <li className="px-4 py-6 text-center text-sm text-fg-subtle">No categories yet.</li>}
      </ul>
      <ConfirmDialog
        open={Boolean(toDelete)}
        onOpenChange={(open) => !open && setToDelete(null)}
        title={`Delete “${toDelete?.name}”?`}
        description={toDelete ? deleteHint(toDelete) : ''}
        loading={busy}
        onConfirm={async () => {
          if (toDelete) await onDelete(toDelete.id).catch(() => undefined)
          setToDelete(null)
        }}
      />
    </div>
  )
}
