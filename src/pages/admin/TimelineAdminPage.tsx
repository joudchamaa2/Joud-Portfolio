import { zodResolver } from '@hookform/resolvers/zod'
import { useQuery } from '@tanstack/react-query'
import { History, Pencil, Plus, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { PageHeader, ReorderButtons, useAdminMutation } from '@/components/admin/shared'
import { Button } from '@/components/ui/button'
import { ConfirmDialog, Dialog } from '@/components/ui/dialog'
import { CharCount, Field, Input, Select, Switch, Textarea } from '@/components/ui/form'
import { Badge, Card, CardHeader, EmptyState, ErrorState, Spinner } from '@/components/ui/misc'
import {
  createTimelineEntry,
  deleteTimelineEntry,
  listAdminTimeline,
  moveItem,
  reorder,
  updateTimelineEntry,
  type AdminTimelineEntry,
} from '@/lib/api/admin'
import { qk } from '@/lib/query'
import { TIMELINE_META, TIMELINE_ORDER, type TimelineKind } from '@/lib/timeline'
import { dateToMonth, emptyToNull, formatRange, monthToDate } from '@/lib/utils'
import { timelineSchema, type TimelineValues } from '@/lib/validation/schemas'

function EntryDialog({ entry, kind, onClose }: { entry: AdminTimelineEntry | null; kind: TimelineKind; onClose: () => void }) {
  const form = useForm<TimelineValues>({
    resolver: zodResolver(timelineSchema),
    defaultValues: {
      kind: entry?.kind ?? kind,
      title: entry?.title ?? '',
      organization: entry?.organization ?? '',
      location: entry?.location ?? '',
      description: entry?.description ?? '',
      start_date: dateToMonth(entry?.start_date),
      end_date: dateToMonth(entry?.end_date),
      is_current: entry?.is_current ?? false,
      credential_url: entry?.credential_url ?? '',
      is_visible: entry?.is_visible ?? true,
    },
  })
  const { register, handleSubmit, formState, watch, setValue } = form
  const { errors } = formState
  const isCurrent = watch('is_current')

  const save = useAdminMutation(
    (values: TimelineValues) => {
      const { start_date, end_date, ...rest } = values
      const row = { ...emptyToNull(rest), kind: values.kind, start_date: monthToDate(start_date), end_date: values.is_current ? null : monthToDate(end_date) }
      return entry ? updateTimelineEntry(entry.id, row) : createTimelineEntry(row)
    },
    { success: entry ? 'Entry updated' : 'Entry added', invalidate: [qk.adminTimeline], onSuccess: onClose },
  )

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()} title={entry ? 'Edit entry' : `Add ${TIMELINE_META[kind].singular.toLowerCase()}`} className="max-w-xl">
      <form noValidate onSubmit={handleSubmit((v) => save.mutate(v))} className="grid gap-4">
        <Field label="Type">
          {({ id }) => (
            <Select id={id} {...register('kind')}>
              {TIMELINE_ORDER.map((k) => <option key={k} value={k}>{TIMELINE_META[k].singular}</option>)}
            </Select>
          )}
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Title" required error={errors.title?.message} hint="Degree, course, role or certificate">
            {({ id, describedBy, invalid }) => <Input id={id} aria-describedby={describedBy} aria-invalid={invalid} maxLength={160} {...register('title')} />}
          </Field>
          <Field label="Organization" required error={errors.organization?.message}>
            {({ id, describedBy, invalid }) => <Input id={id} aria-describedby={describedBy} aria-invalid={invalid} maxLength={160} {...register('organization')} />}
          </Field>
          <Field label="Start" error={errors.start_date?.message} hint="Optional">
            {({ id, describedBy, invalid }) => <Input id={id} type="month" aria-describedby={describedBy} aria-invalid={invalid} {...register('start_date')} />}
          </Field>
          <Field label="End" error={errors.end_date?.message} hint={isCurrent ? 'Ongoing' : 'Optional'}>
            {({ id, describedBy, invalid }) => <Input id={id} type="month" disabled={isCurrent} aria-describedby={describedBy} aria-invalid={invalid} {...register('end_date')} />}
          </Field>
        </div>
        <label className="flex items-center gap-2 text-sm text-fg-muted">
          <Switch
            checked={isCurrent}
            onCheckedChange={(v) => {
              setValue('is_current', v, { shouldDirty: true })
              if (v) setValue('end_date', '', { shouldValidate: true })
            }}
          />
          Ongoing
        </label>
        <Field label="Location" error={errors.location?.message}>
          {({ id, describedBy, invalid }) => <Input id={id} aria-describedby={describedBy} aria-invalid={invalid} maxLength={120} {...register('location')} />}
        </Field>
        <Field label="Description" error={errors.description?.message} hint={<CharCount value={watch('description')} max={4000} />}>
          {({ id, describedBy, invalid }) => <Textarea id={id} rows={4} aria-describedby={describedBy} aria-invalid={invalid} {...register('description')} />}
        </Field>
        <Field label="Credential URL" error={errors.credential_url?.message} hint="For certifications, a public verification link.">
          {({ id, describedBy, invalid }) => <Input id={id} type="url" placeholder="https://" aria-describedby={describedBy} aria-invalid={invalid} {...register('credential_url')} />}
        </Field>
        <label className="flex items-center justify-between rounded-md border border-line px-3 py-2.5 text-sm text-fg">
          Visible on the public site
          <Switch checked={watch('is_visible')} onCheckedChange={(v) => setValue('is_visible', v, { shouldDirty: true })} />
        </label>
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button type="submit" loading={save.isPending}>{entry ? 'Save' : 'Add entry'}</Button>
        </div>
      </form>
    </Dialog>
  )
}

export default function TimelineAdminPage() {
  const timeline = useQuery({ queryKey: qk.adminTimeline, queryFn: listAdminTimeline })
  const [dialog, setDialog] = useState<{ entry: AdminTimelineEntry | null; kind: TimelineKind } | null>(null)
  const [toDelete, setToDelete] = useState<AdminTimelineEntry | null>(null)

  const invalidate = [qk.adminTimeline]
  const order = useAdminMutation((ids: string[]) => reorder('timeline_entries', ids), { invalidate })
  const visibility = useAdminMutation(({ id, visible }: { id: string; visible: boolean }) => updateTimelineEntry(id, { is_visible: visible }), { invalidate })
  const remove = useAdminMutation(deleteTimelineEntry, { success: 'Entry deleted', invalidate, onSuccess: () => setToDelete(null) })

  return (
    <>
      <PageHeader
        title="Education & experience"
        description="Only verified information should be visible. Dates are optional."
        actions={<Button onClick={() => setDialog({ entry: null, kind: 'education' })}><Plus aria-hidden /> Add entry</Button>}
      />
      {timeline.isPending ? (
        <Spinner />
      ) : timeline.isError ? (
        <ErrorState message="Entries could not be loaded." onRetry={() => void timeline.refetch()} />
      ) : (
        <div className="grid grid-cols-1 gap-6">
          {TIMELINE_ORDER.map((kind) => {
            const entries = timeline.data.filter((e) => e.kind === kind)
            const { title, icon: Icon } = TIMELINE_META[kind]
            return (
              <Card key={kind}>
                <CardHeader
                  title={title}
                  actions={<Button size="sm" variant="ghost" onClick={() => setDialog({ entry: null, kind })}><Plus aria-hidden /> Add</Button>}
                />
                {entries.length === 0 ? (
                  <div className="flex items-center gap-2 px-5 py-6 text-sm text-fg-subtle"><Icon className="size-4" aria-hidden /> No entries.</div>
                ) : (
                  <ul className="divide-y divide-line">
                    {entries.map((entry, i) => (
                      <li key={entry.id} className="flex items-center gap-3 px-3 py-2.5 sm:px-4">
                        <ReorderButtons
                          index={i}
                          count={entries.length}
                          label={entry.title}
                          disabled={order.isPending}
                          onMove={(d) => order.mutate(moveItem(entries, i, d).map((e) => e.id))}
                        />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm text-fg">
                            {entry.title} {!entry.is_visible && <Badge tone="muted" className="ml-1">Hidden</Badge>}
                          </p>
                          <p className="truncate text-xs text-fg-subtle">
                            {entry.organization}
                            {` · ${formatRange(entry.start_date, entry.end_date, entry.is_current) ?? 'No dates'}`}
                          </p>
                        </div>
                        <Switch
                          checked={entry.is_visible}
                          disabled={visibility.isPending}
                          onCheckedChange={(v) => visibility.mutate({ id: entry.id, visible: v })}
                          aria-label={`${entry.is_visible ? 'Hide' : 'Show'} ${entry.title}`}
                        />
                        <Button size="icon-sm" variant="ghost" aria-label={`Edit ${entry.title}`} onClick={() => setDialog({ entry, kind })}><Pencil /></Button>
                        <Button size="icon-sm" variant="danger-ghost" aria-label={`Delete ${entry.title}`} onClick={() => setToDelete(entry)}><Trash2 /></Button>
                      </li>
                    ))}
                  </ul>
                )}
              </Card>
            )
          })}
          {timeline.data.length === 0 && <EmptyState icon={History} title="No entries yet" />}
        </div>
      )}
      {dialog && <EntryDialog entry={dialog.entry} kind={dialog.kind} onClose={() => setDialog(null)} />}
      <ConfirmDialog
        open={Boolean(toDelete)}
        onOpenChange={(o) => !o && setToDelete(null)}
        title={`Delete “${toDelete?.title}”?`}
        description="This entry will be permanently removed."
        loading={remove.isPending}
        onConfirm={() => toDelete && remove.mutate(toDelete.id)}
      />
    </>
  )
}
