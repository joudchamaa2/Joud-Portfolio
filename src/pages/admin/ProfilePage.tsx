import { zodResolver } from '@hookform/resolvers/zod'
import { useQuery } from '@tanstack/react-query'
import { Eye, EyeOff, FileText, Link2, Pencil, Plus, Save, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { toast } from 'sonner'
import { Link } from 'react-router'
import { FilePicker, ImageSlot, PageHeader, ReorderButtons, useAdminMutation } from '@/components/admin/shared'
import { Button } from '@/components/ui/button'
import { ConfirmDialog, Dialog } from '@/components/ui/dialog'
import { CharCount, Field, Input, Select, Switch, Textarea } from '@/components/ui/form'
import { Badge, Card, CardHeader, ErrorState, Spinner } from '@/components/ui/misc'
import {
  adminCvUrl,
  createSocialLink,
  deleteSocialLink,
  fetchAdminProfile,
  fetchAdminSettings,
  listAdminSocialLinks,
  moveItem,
  removeAvatar,
  removeCv,
  reorder,
  setAvatar,
  updateProfile,
  updateSocialLink,
  uploadCv,
  type AdminSocialLink,
} from '@/lib/api/admin'
import type { Tables } from '@/lib/database.types'
import { toAppError } from '@/lib/errors'
import { FILE_RULES, formatBytes } from '@/lib/files'
import { qk } from '@/lib/query'
import { publicUrl } from '@/lib/storage'
import { emptyToNull, formatDateTime } from '@/lib/utils'
import { profileSchema, SOCIAL_PLATFORMS, socialLinkSchema, type ProfileValues, type SocialLinkValues } from '@/lib/validation/schemas'

const PLATFORM_LABELS: Record<(typeof SOCIAL_PLATFORMS)[number], string> = {
  github: 'GitHub',
  linkedin: 'LinkedIn',
  x: 'X',
  gitlab: 'GitLab',
  stackoverflow: 'Stack Overflow',
  website: 'Website',
  other: 'Other',
}

function ProfileForm({ profile }: { profile: Tables<'profile'> }) {
  const form = useForm<ProfileValues>({
    resolver: zodResolver(profileSchema),
    defaultValues: {
      full_name: profile.full_name,
      headline: profile.headline,
      intro: profile.intro ?? '',
      bio: profile.bio ?? '',
      journey: profile.journey ?? '',
      interests: profile.interests ?? '',
      goals: profile.goals ?? '',
      location: profile.location ?? '',
      public_email: profile.public_email ?? '',
      phone: profile.phone ?? '',
      avatar_alt: profile.avatar_alt ?? '',
      seo_description: profile.seo_description ?? '',
    },
  })
  const { register, handleSubmit, formState, watch, reset } = form
  const { errors, isDirty } = formState
  const save = useAdminMutation((values: ProfileValues) => updateProfile(emptyToNull(values)), {
    success: 'Profile saved',
    invalidate: [qk.adminProfile],
    onSuccess: (_r, values) => reset(values),
  })

  const area = (name: 'intro' | 'bio' | 'journey' | 'interests' | 'goals' | 'seo_description', label: string, max: number, rows: number, hint?: string) => (
    <Field label={label} error={errors[name]?.message} hint={<span className="flex justify-between gap-4"><span>{hint}</span><CharCount value={watch(name)} max={max} /></span>}>
      {({ id, describedBy, invalid }) => <Textarea id={id} rows={rows} aria-describedby={describedBy} aria-invalid={invalid} {...register(name)} />}
    </Field>
  )

  return (
    <form noValidate onSubmit={handleSubmit((v) => save.mutate(v))} className="grid min-w-0 gap-6">
      <Card>
        <CardHeader title="Identity" description="Empty optional fields are not shown publicly." />
        <div className="grid gap-5 p-5 sm:grid-cols-2">
          <Field label="Full name" required error={errors.full_name?.message}>
            {({ id, describedBy, invalid }) => <Input id={id} aria-describedby={describedBy} aria-invalid={invalid} {...register('full_name')} />}
          </Field>
          <Field label="Professional title" required error={errors.headline?.message}>
            {({ id, describedBy, invalid }) => <Input id={id} aria-describedby={describedBy} aria-invalid={invalid} {...register('headline')} />}
          </Field>
          <Field label="Location" error={errors.location?.message} hint="Optional — e.g. city and country.">
            {({ id, describedBy, invalid }) => <Input id={id} aria-describedby={describedBy} aria-invalid={invalid} {...register('location')} />}
          </Field>
          <Field label="Public email" error={errors.public_email?.message} hint="Shown publicly. Leave empty to rely on the contact form.">
            {({ id, describedBy, invalid }) => <Input id={id} type="email" aria-describedby={describedBy} aria-invalid={invalid} {...register('public_email')} />}
          </Field>
          <Field label="Public phone" error={errors.phone?.message} hint="Optional and shown publicly.">
            {({ id, describedBy, invalid }) => <Input id={id} type="tel" aria-describedby={describedBy} aria-invalid={invalid} {...register('phone')} />}
          </Field>
          <Field label="Photo alt text" error={errors.avatar_alt?.message}>
            {({ id, describedBy, invalid }) => <Input id={id} aria-describedby={describedBy} aria-invalid={invalid} {...register('avatar_alt')} />}
          </Field>
        </div>
      </Card>
      <Card>
        <CardHeader title="About content" description="Separate paragraphs with a blank line." />
        <div className="grid gap-5 p-5">
          {area('intro', 'Introduction', 600, 3, 'Shown in the homepage hero.')}
          {area('bio', 'Biography', 6000, 7, 'The first paragraph is used as the homepage About preview.')}
          {area('journey', 'Development journey', 6000, 5)}
          {area('interests', 'Technical interests', 3000, 4)}
          {area('goals', 'Professional goals', 3000, 4)}
          {area('seo_description', 'SEO description', 300, 2, 'Default meta description for search results.')}
        </div>
      </Card>
      <div className="sticky bottom-4 z-10 flex items-center justify-end gap-3 rounded-lg border border-line bg-surface/95 p-3 backdrop-blur">
        {isDirty && <span className="text-xs text-gold">Unsaved changes</span>}
        <Button type="submit" loading={save.isPending} disabled={!isDirty}><Save aria-hidden /> Save profile</Button>
      </div>
    </form>
  )
}

function SocialLinkDialog({ link, nextOrder, onClose }: { link: AdminSocialLink | null; nextOrder: number; onClose: () => void }) {
  const form = useForm<SocialLinkValues>({
    resolver: zodResolver(socialLinkSchema),
    defaultValues: { platform: link?.platform as SocialLinkValues['platform'] ?? 'github', label: link?.label ?? 'GitHub', url: link?.url ?? '', is_visible: link?.is_visible ?? true },
  })
  const { register, handleSubmit, formState, watch, setValue } = form
  const save = useAdminMutation((v: SocialLinkValues) => (link ? updateSocialLink(link.id, v) : createSocialLink(v, nextOrder)), {
    success: link ? 'Link updated' : 'Link added',
    invalidate: [qk.adminSocialLinks],
    onSuccess: onClose,
  })
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()} title={link ? 'Edit link' : 'Add link'}>
      <form noValidate onSubmit={handleSubmit((v) => save.mutate(v))} className="grid gap-4">
        <Field label="Platform">
          {({ id }) => (
            <Select
              id={id}
              {...register('platform', {
                onChange: (e) => {
                  const label = PLATFORM_LABELS[e.target.value as keyof typeof PLATFORM_LABELS]
                  if (!link && e.target.value !== 'other') setValue('label', label)
                },
              })}
            >
              {SOCIAL_PLATFORMS.map((p) => <option key={p} value={p}>{PLATFORM_LABELS[p]}</option>)}
            </Select>
          )}
        </Field>
        <Field label="Label" required error={formState.errors.label?.message}>
          {({ id, describedBy, invalid }) => <Input id={id} aria-describedby={describedBy} aria-invalid={invalid} maxLength={60} {...register('label')} />}
        </Field>
        <Field label="URL" required error={formState.errors.url?.message}>
          {({ id, describedBy, invalid }) => <Input id={id} type="url" placeholder="https://" aria-describedby={describedBy} aria-invalid={invalid} {...register('url')} />}
        </Field>
        <label className="flex items-center justify-between rounded-md border border-line px-3 py-2.5 text-sm text-fg">
          Visible on the public site
          <Switch checked={watch('is_visible')} onCheckedChange={(v) => setValue('is_visible', v)} />
        </label>
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button type="submit" loading={save.isPending}>{link ? 'Save' : 'Add link'}</Button>
        </div>
      </form>
    </Dialog>
  )
}

function SocialLinksCard() {
  const links = useQuery({ queryKey: qk.adminSocialLinks, queryFn: listAdminSocialLinks })
  const [dialog, setDialog] = useState<{ link: AdminSocialLink | null } | null>(null)
  const [toDelete, setToDelete] = useState<AdminSocialLink | null>(null)
  const invalidate = [qk.adminSocialLinks]
  const order = useAdminMutation((ids: string[]) => reorder('social_links', ids), { invalidate })
  const toggle = useAdminMutation(({ id, v }: { id: string; v: boolean }) => updateSocialLink(id, { is_visible: v }), { invalidate })
  const remove = useAdminMutation(deleteSocialLink, { success: 'Link deleted', invalidate, onSuccess: () => setToDelete(null) })
  const data = links.data ?? []

  return (
    <Card>
      <CardHeader title="Social links" description="GitHub, LinkedIn and others. HTTPS only." actions={<Button size="sm" variant="secondary" onClick={() => setDialog({ link: null })}><Plus aria-hidden /> Add</Button>} />
      {links.isPending ? (
        <Spinner />
      ) : data.length === 0 ? (
        <p className="flex items-center gap-2 px-5 py-6 text-sm text-fg-subtle"><Link2 className="size-4" aria-hidden /> No links yet.</p>
      ) : (
        <ul className="divide-y divide-line">
          {data.map((link, i) => (
            <li key={link.id} className="flex items-center gap-3 px-3 py-2">
              <ReorderButtons index={i} count={data.length} label={link.label} disabled={order.isPending} onMove={(d) => order.mutate(moveItem(data, i, d).map((l) => l.id))} />
              <div className="min-w-0 flex-1">
                <p className="text-sm text-fg">{link.label} {!link.is_visible && <Badge tone="muted">Hidden</Badge>}</p>
                <p className="truncate text-xs text-fg-subtle">{link.url}</p>
              </div>
              <Button size="icon-sm" variant="ghost" aria-label={`${link.is_visible ? 'Hide' : 'Show'} ${link.label}`} onClick={() => toggle.mutate({ id: link.id, v: !link.is_visible })}>
                {link.is_visible ? <Eye /> : <EyeOff />}
              </Button>
              <Button size="icon-sm" variant="ghost" aria-label={`Edit ${link.label}`} onClick={() => setDialog({ link })}><Pencil /></Button>
              <Button size="icon-sm" variant="danger-ghost" aria-label={`Delete ${link.label}`} onClick={() => setToDelete(link)}><Trash2 /></Button>
            </li>
          ))}
        </ul>
      )}
      {dialog && <SocialLinkDialog link={dialog.link} nextOrder={(data.at(-1)?.sort_order ?? 0) + 1} onClose={() => setDialog(null)} />}
      <ConfirmDialog
        open={Boolean(toDelete)}
        onOpenChange={(o) => !o && setToDelete(null)}
        title={`Delete “${toDelete?.label}”?`}
        description="The link will be removed from your site."
        loading={remove.isPending}
        onConfirm={() => toDelete && remove.mutate(toDelete.id)}
      />
    </Card>
  )
}

function ResumeCard() {
  const settings = useQuery({ queryKey: qk.adminSettings, queryFn: fetchAdminSettings })
  const [confirm, setConfirm] = useState(false)
  const [opening, setOpening] = useState(false)
  const invalidate = [qk.adminSettings]
  const priv = settings.data?.privateSettings
  const upload = useAdminMutation((file: File) => uploadCv(file, priv?.cv_path ?? null), { success: 'CV uploaded', invalidate })
  const remove = useAdminMutation(() => removeCv(priv!.cv_path!), { success: 'CV removed', invalidate, onSuccess: () => setConfirm(false) })

  async function view() {
    if (!priv?.cv_path) return
    setOpening(true)
    try {
      window.open(await adminCvUrl(priv.cv_path), '_blank', 'noopener,noreferrer')
    } catch (e) {
      toast.error(toAppError(e).message)
    } finally {
      setOpening(false)
    }
  }

  return (
    <Card>
      <CardHeader title="Resume / CV" description="Stored in a private bucket. Visitors get a short-lived link only when publishing is on." />
      <div className="grid gap-4 p-5">
        {settings.isPending ? (
          <Spinner />
        ) : settings.isError ? (
          <ErrorState message="Could not load CV details." onRetry={() => void settings.refetch()} />
        ) : priv?.cv_path ? (
          <div className="flex items-center gap-3 rounded-md border border-line p-3">
            <FileText className="size-5 text-gold" aria-hidden />
            <div className="min-w-0 flex-1 text-sm">
              <p className="text-fg">CV uploaded {priv.cv_size_bytes ? `· ${formatBytes(priv.cv_size_bytes)}` : ''}</p>
              <p className="text-xs text-fg-subtle">{formatDateTime(priv.cv_uploaded_at)}</p>
            </div>
            <Badge tone={settings.data.settings.cv_published ? 'success' : 'muted'}>{settings.data.settings.cv_published ? 'Published' : 'Not published'}</Badge>
          </div>
        ) : (
          <p className="text-sm text-fg-subtle">No CV uploaded.</p>
        )}
        <div className="flex flex-wrap gap-2">
          <FilePicker accept="application/pdf" onFiles={([f]) => f && upload.mutate(f)} loading={upload.isPending}>
            {priv?.cv_path ? 'Replace CV' : 'Upload CV'}
          </FilePicker>
          {priv?.cv_path && (
            <>
              <Button size="sm" variant="ghost" onClick={view} loading={opening}>View</Button>
              <Button size="sm" variant="danger-ghost" onClick={() => setConfirm(true)}><Trash2 aria-hidden /> Remove</Button>
            </>
          )}
        </div>
        <p className="text-xs text-fg-subtle">
          {FILE_RULES.cv.label}. Control public visibility in <Link to="/admin/settings" className="text-gold hover:underline">Settings</Link>.
        </p>
      </div>
      <ConfirmDialog
        open={confirm}
        onOpenChange={setConfirm}
        title="Remove the CV?"
        description="The file is deleted from storage and the public download is turned off."
        loading={remove.isPending}
        onConfirm={() => remove.mutate()}
      />
    </Card>
  )
}

export default function ProfilePage() {
  const profile = useQuery({ queryKey: qk.adminProfile, queryFn: fetchAdminProfile })
  const invalidate = [qk.adminProfile]
  const avatarUpload = useAdminMutation((file: File) => setAvatar(file, profile.data?.avatar_path ?? null), { success: 'Photo updated', invalidate })
  const avatarRemove = useAdminMutation(() => removeAvatar(profile.data!.avatar_path!), { success: 'Photo removed', invalidate })

  return (
    <>
      <PageHeader title="Profile" description="Your public identity, biography, links and CV." />
      {profile.isPending ? (
        <Spinner />
      ) : profile.isError ? (
        <ErrorState message="The profile could not be loaded." onRetry={() => void profile.refetch()} />
      ) : (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start">
          <ProfileForm key={profile.data.updated_at} profile={profile.data} />
          <div className="grid min-w-0 gap-6">
            <Card>
              <CardHeader title="Profile photo" />
              <div className="p-5">
                <ImageSlot
                  label="Photo"
                  hint={FILE_RULES.profileAsset.label}
                  aspect="aspect-[4/5]"
                  src={publicUrl('profile-assets', profile.data.avatar_path)}
                  uploading={avatarUpload.isPending}
                  removing={avatarRemove.isPending}
                  onUpload={(f) => avatarUpload.mutate(f)}
                  onRemove={() => avatarRemove.mutate()}
                />
              </div>
            </Card>
            <ResumeCard />
            <SocialLinksCard />
          </div>
        </div>
      )}
    </>
  )
}
