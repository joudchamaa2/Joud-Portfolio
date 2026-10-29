import { useMutation, useQueryClient, type QueryKey } from '@tanstack/react-query'
import { ChevronDown, ChevronUp, ImagePlus, Trash2, Upload } from 'lucide-react'
import { useId, useRef, useState, type ReactNode } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/ui/dialog'
import { toAppError } from '@/lib/errors'
import { cn } from '@/lib/utils'

export function PageHeader({ title, description, actions }: { title: string; description?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <title>{`${title} · Admin`}</title>
      <div>
        <h1 className="font-display text-3xl text-fg">{title}</h1>
        {description && <p className="mt-1.5 text-sm text-fg-muted">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  )
}

/**
 * useMutation with consistent success/error toasts and cache invalidation.
 * Errors are normalised to friendly messages by toAppError.
 */
export function useAdminMutation<TVars = void, TResult = unknown>(
  fn: (vars: TVars) => Promise<TResult>,
  options: { success?: string | ((result: TResult, vars: TVars) => string | null); invalidate?: QueryKey[]; onSuccess?: (result: TResult, vars: TVars) => void } = {},
) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: fn,
    onSuccess: async (result, vars) => {
      await Promise.all((options.invalidate ?? []).map((queryKey) => queryClient.invalidateQueries({ queryKey })))
      // Public pages read from the same tables; refresh them too.
      void queryClient.invalidateQueries({ predicate: (q) => q.queryKey[0] !== 'admin' })
      const message = typeof options.success === 'function' ? options.success(result, vars) : options.success
      if (message) toast.success(message)
      options.onSuccess?.(result, vars)
    },
    onError: (error) => {
      toast.error(toAppError(error).message)
    },
  })
}

export function ReorderButtons({
  index,
  count,
  onMove,
  disabled,
  label,
}: {
  index: number
  count: number
  onMove: (delta: -1 | 1) => void
  disabled?: boolean
  label: string
}) {
  return (
    <div className="flex flex-col">
      <Button variant="ghost" size="icon-sm" className="h-6" disabled={disabled || index === 0} onClick={() => onMove(-1)} aria-label={`Move ${label} up`}>
        <ChevronUp />
      </Button>
      <Button variant="ghost" size="icon-sm" className="h-6" disabled={disabled || index === count - 1} onClick={() => onMove(1)} aria-label={`Move ${label} down`}>
        <ChevronDown />
      </Button>
    </div>
  )
}

/** Hidden file input + button. Validation happens in the upload functions. */
export function FilePicker({
  accept,
  multiple,
  onFiles,
  children,
  loading,
  variant = 'secondary',
  size = 'sm',
}: {
  accept: string
  multiple?: boolean
  onFiles: (files: File[]) => void
  children: ReactNode
  loading?: boolean
  variant?: 'secondary' | 'primary' | 'ghost'
  size?: 'sm' | 'md'
}) {
  const ref = useRef<HTMLInputElement>(null)
  const id = useId()
  return (
    <>
      <input
        ref={ref}
        id={id}
        type="file"
        accept={accept}
        multiple={multiple}
        className="sr-only"
        tabIndex={-1}
        onChange={(e) => {
          const files = Array.from(e.target.files ?? [])
          e.target.value = ''
          if (files.length) onFiles(files)
        }}
      />
      <Button variant={variant} size={size} loading={loading} onClick={() => ref.current?.click()}>
        {!loading && <Upload aria-hidden />}
        {children}
      </Button>
    </>
  )
}

export const IMAGE_ACCEPT = 'image/jpeg,image/png,image/webp'

/** Single image slot with preview, replace and remove. */
export function ImageSlot({
  label,
  hint,
  src,
  aspect = 'aspect-[16/10]',
  uploading,
  removing,
  onUpload,
  onRemove,
}: {
  label: string
  hint: string
  src: string | null
  aspect?: string
  uploading?: boolean
  removing?: boolean
  onUpload: (file: File) => void
  onRemove: () => void
}) {
  const [confirm, setConfirm] = useState(false)
  return (
    <div className="grid gap-3">
      <div className={cn('relative overflow-hidden rounded-md border border-line bg-surface-2', aspect)}>
        {src ? (
          <img src={src} alt={`${label} preview`} className="size-full object-cover" />
        ) : (
          <div className="grid-pattern grid size-full place-items-center text-fg-subtle">
            <ImagePlus className="size-6" aria-hidden />
          </div>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <FilePicker accept={IMAGE_ACCEPT} onFiles={([file]) => file && onUpload(file)} loading={uploading}>
          {src ? 'Replace' : 'Upload'} {label.toLowerCase()}
        </FilePicker>
        {src && (
          <Button variant="danger-ghost" size="sm" onClick={() => setConfirm(true)} loading={removing}>
            {!removing && <Trash2 aria-hidden />} Remove
          </Button>
        )}
      </div>
      <p className="text-xs text-fg-subtle">{hint}</p>
      <ConfirmDialog
        open={confirm}
        onOpenChange={setConfirm}
        title={`Remove ${label.toLowerCase()}?`}
        description="The image will be deleted from storage."
        confirmLabel="Remove"
        onConfirm={() => {
          setConfirm(false)
          onRemove()
        }}
      />
    </div>
  )
}
