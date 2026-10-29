import { ImagePlus, Save, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/ui/dialog'
import { Input, Switch } from '@/components/ui/form'
import { EmptyState } from '@/components/ui/misc'
import { addProjectImages, deleteProjectImage, moveItem, reorder, updateProjectImage, type AdminProject } from '@/lib/api/admin'
import { FILE_RULES } from '@/lib/files'
import { qk } from '@/lib/query'
import { publicUrl } from '@/lib/storage'
import { FilePicker, IMAGE_ACCEPT, ReorderButtons, useAdminMutation } from './shared'

type Image = AdminProject['images'][number]

function ImageRow({ image, index, count, projectId, onMove, busy }: { image: Image; index: number; count: number; projectId: string; onMove: (d: -1 | 1) => void; busy: boolean }) {
  const [alt, setAlt] = useState(image.alt_text)
  const [caption, setCaption] = useState(image.caption ?? '')
  const [confirm, setConfirm] = useState(false)
  const invalidate = [qk.adminProject(projectId)]
  const save = useAdminMutation(() => updateProjectImage(image.id, { alt_text: alt.trim().slice(0, 200), caption: caption.trim() || null }), {
    success: 'Image details saved',
    invalidate,
  })
  const mockup = useAdminMutation((value: boolean) => updateProjectImage(image.id, { is_mockup: value }), { invalidate })
  const remove = useAdminMutation(() => deleteProjectImage(image.id, image.storage_path), { success: 'Image deleted', invalidate })
  const dirty = alt !== image.alt_text || caption !== (image.caption ?? '')

  return (
    <li className="grid gap-4 p-4 sm:grid-cols-[auto_9rem_1fr] sm:items-start">
      <ReorderButtons index={index} count={count} onMove={onMove} disabled={busy} label="image" />
      <img src={publicUrl('project-images', image.storage_path) ?? ''} alt="" className="aspect-[16/10] w-full rounded-sm border border-line object-cover sm:w-36" />
      <div className="grid gap-2">
        <Input value={alt} onChange={(e) => setAlt(e.target.value)} placeholder="Alt text — describe the image" aria-label="Alt text" maxLength={200} />
        <Input value={caption} onChange={(e) => setCaption(e.target.value)} placeholder="Caption (optional)" aria-label="Caption" maxLength={300} />
        <div className="flex flex-wrap items-center justify-between gap-2">
          <label className="flex items-center gap-2 text-xs text-fg-muted">
            <Switch checked={image.is_mockup} disabled={mockup.isPending} onCheckedChange={(v) => mockup.mutate(v)} />
            Design mockup (labelled publicly)
          </label>
          <div className="flex gap-1">
            <Button size="sm" variant="secondary" disabled={!dirty} loading={save.isPending} onClick={() => save.mutate()}>
              {!save.isPending && <Save aria-hidden />} Save
            </Button>
            <Button size="sm" variant="danger-ghost" onClick={() => setConfirm(true)} aria-label="Delete image">
              <Trash2 aria-hidden />
            </Button>
          </div>
        </div>
      </div>
      <ConfirmDialog
        open={confirm}
        onOpenChange={setConfirm}
        title="Delete this image?"
        description="It will be removed from the gallery and deleted from storage."
        loading={remove.isPending}
        onConfirm={() => remove.mutate(undefined, { onSettled: () => setConfirm(false) })}
      />
    </li>
  )
}

export function GalleryManager({ projectId, images }: { projectId: string; images: Image[] }) {
  const sorted = [...images].sort((a, b) => a.sort_order - b.sort_order)
  const invalidate = [qk.adminProject(projectId)]
  const upload = useAdminMutation(
    (files: File[]) => addProjectImages(projectId, files, sorted.at(-1)?.sort_order ?? 0),
    { success: (_r, files) => `${files.length} image${files.length === 1 ? '' : 's'} uploaded`, invalidate },
  )
  const order = useAdminMutation((ids: string[]) => reorder('project_images', ids), { invalidate })

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-fg-subtle">{FILE_RULES.projectImage.label}. Images are resized and converted to WebP before upload.</p>
        <FilePicker accept={IMAGE_ACCEPT} multiple onFiles={(files) => upload.mutate(files.slice(0, 12))} loading={upload.isPending}>
          Add screenshots
        </FilePicker>
      </div>
      {sorted.length === 0 ? (
        <EmptyState icon={ImagePlus} title="No screenshots yet" description="Add real screenshots of the project. Mark design mockups so they are labelled honestly." />
      ) : (
        <ul className="divide-y divide-line rounded-md border border-line">
          {sorted.map((image, i) => (
            <ImageRow
              key={`${image.id}-${image.alt_text}-${image.caption}`}
              image={image}
              index={i}
              count={sorted.length}
              projectId={projectId}
              busy={order.isPending}
              onMove={(d) => order.mutate(moveItem(sorted, i, d).map((x) => x.id))}
            />
          ))}
        </ul>
      )}
    </div>
  )
}
