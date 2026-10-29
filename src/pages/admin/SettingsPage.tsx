import { zodResolver } from '@hookform/resolvers/zod'
import { useQuery } from '@tanstack/react-query'
import { Save } from 'lucide-react'
import { useForm } from 'react-hook-form'
import { Link } from 'react-router'
import { ImageSlot, PageHeader, useAdminMutation } from '@/components/admin/shared'
import { Button } from '@/components/ui/button'
import { CharCount, Field, Input, SwitchField, Textarea } from '@/components/ui/form'
import { Card, CardHeader, ErrorState, Spinner } from '@/components/ui/misc'
import {
  fetchAdminSettings,
  removeSiteAsset,
  setSiteAsset,
  updatePrivateSettings,
  updateSettings,
  type AdminSettings,
  type SiteAsset,
} from '@/lib/api/admin'
import { FILE_RULES } from '@/lib/files'
import { qk } from '@/lib/query'
import { publicUrl } from '@/lib/storage'
import { settingsSchema, type SettingsValues } from '@/lib/validation/schemas'

const SECTIONS = [
  ['show_featured_projects', 'Featured projects', 'Projects marked as featured.'],
  ['show_skills', 'Skills overview', 'Grouped technologies.'],
  ['show_about', 'About preview', 'First paragraph of your biography.'],
  ['show_education', 'Education highlights', 'Education, training and certifications.'],
  ['show_contact', 'Contact call to action', 'Invitation to get in touch.'],
] as const

function SettingsForm({ data }: { data: AdminSettings }) {
  const { settings, privateSettings } = data
  const form = useForm<SettingsValues>({
    resolver: zodResolver(settingsSchema),
    defaultValues: {
      site_title: settings.site_title,
      site_description: settings.site_description ?? '',
      monogram: settings.monogram,
      footer_text: settings.footer_text ?? '',
      show_featured_projects: settings.show_featured_projects,
      show_skills: settings.show_skills,
      show_education: settings.show_education,
      show_about: settings.show_about,
      show_contact: settings.show_contact,
      featured_limit: settings.featured_limit,
      notification_email: privateSettings.notification_email ?? '',
    },
  })
  const { register, handleSubmit, formState, watch, setValue, reset } = form
  const { errors, isDirty } = formState

  const save = useAdminMutation(
    async ({ notification_email, ...values }: SettingsValues) => {
      await updateSettings({
        ...values,
        site_title: values.site_title.trim(),
        monogram: values.monogram.trim(),
        site_description: values.site_description.trim() || null,
        footer_text: values.footer_text.trim() || null,
      })
      await updatePrivateSettings({ notification_email: notification_email.trim() || null })
    },
    { success: 'Settings saved', invalidate: [qk.adminSettings], onSuccess: (_r, v) => reset(v) },
  )

  return (
    <form noValidate onSubmit={handleSubmit((v) => save.mutate(v))} className="grid min-w-0 gap-6">
      <Card>
        <CardHeader title="General" />
        <div className="grid gap-5 p-5 sm:grid-cols-[1fr_8rem]">
          <Field label="Site title" required error={errors.site_title?.message} hint="Browser tab and default search title.">
            {({ id, describedBy, invalid }) => <Input id={id} aria-describedby={describedBy} aria-invalid={invalid} maxLength={80} {...register('site_title')} />}
          </Field>
          <Field label="Monogram" required error={errors.monogram?.message} hint="Used when no logo is set.">
            {({ id, describedBy, invalid }) => <Input id={id} aria-describedby={describedBy} aria-invalid={invalid} maxLength={4} {...register('monogram')} />}
          </Field>
          <Field className="sm:col-span-2" label="Default meta description" error={errors.site_description?.message} hint={<CharCount value={watch('site_description')} max={300} />}>
            {({ id, describedBy, invalid }) => <Textarea id={id} rows={2} aria-describedby={describedBy} aria-invalid={invalid} {...register('site_description')} />}
          </Field>
          <Field className="sm:col-span-2" label="Footer text" error={errors.footer_text?.message}>
            {({ id, describedBy, invalid }) => <Input id={id} aria-describedby={describedBy} aria-invalid={invalid} maxLength={300} {...register('footer_text')} />}
          </Field>
        </div>
      </Card>

      <Card>
        <CardHeader title="Homepage sections" description="Sections without content are hidden automatically." />
        <div className="divide-y divide-line px-5">
          {SECTIONS.map(([key, label, description]) => (
            <SwitchField key={key} label={label} description={description} checked={watch(key)} onCheckedChange={(v) => setValue(key, v, { shouldDirty: true })} />
          ))}
          <div className="flex items-center justify-between gap-6 py-3">
            <div>
              <label htmlFor="featured_limit" className="text-[13px] font-medium text-fg">Featured projects shown</label>
              <p className="text-xs text-fg-subtle">Mark projects as featured on the <Link to="/admin/projects" className="text-gold hover:underline">Projects</Link> page.</p>
              {errors.featured_limit && <p role="alert" className="text-xs text-danger">{errors.featured_limit.message}</p>}
            </div>
            <Input id="featured_limit" type="number" min={1} max={12} className="w-20" {...register('featured_limit', { valueAsNumber: true })} />
          </div>
        </div>
      </Card>

      <Card>
        <CardHeader title="Notifications" description="Requires the Resend secrets on the contact Edge Function (see README)." />
        <div className="p-5">
          <Field label="Send new-message notifications to" error={errors.notification_email?.message} hint="Private — never shown on the site.">
            {({ id, describedBy, invalid }) => <Input id={id} type="email" aria-describedby={describedBy} aria-invalid={invalid} {...register('notification_email')} />}
          </Field>
        </div>
      </Card>

      <div className="sticky bottom-4 z-10 flex items-center justify-end gap-3 rounded-lg border border-line bg-surface/95 p-3 backdrop-blur">
        {isDirty && <span className="text-xs text-gold">Unsaved changes</span>}
        <Button type="submit" loading={save.isPending} disabled={!isDirty}><Save aria-hidden /> Save settings</Button>
      </div>
    </form>
  )
}

function AssetSlot({ field, label, hint, aspect, data }: { field: SiteAsset; label: string; hint: string; aspect: string; data: AdminSettings }) {
  const current = data.settings[field]
  const invalidate = [qk.adminSettings]
  const upload = useAdminMutation((file: File) => setSiteAsset(field, file, current), { success: `${label} updated`, invalidate })
  const remove = useAdminMutation(() => removeSiteAsset(field, current!), { success: `${label} removed`, invalidate })
  return (
    <ImageSlot
      label={label}
      hint={hint}
      aspect={aspect}
      src={publicUrl('profile-assets', current)}
      uploading={upload.isPending}
      removing={remove.isPending}
      onUpload={(f) => upload.mutate(f)}
      onRemove={() => remove.mutate()}
    />
  )
}

function CvVisibility({ data }: { data: AdminSettings }) {
  const hasCv = Boolean(data.privateSettings.cv_path)
  const toggle = useAdminMutation((on: boolean) => updateSettings({ cv_published: on }), {
    success: (_r, on) => (on ? 'CV is now downloadable' : 'CV download turned off'),
    invalidate: [qk.adminSettings],
  })
  return (
    <Card>
      <CardHeader title="CV visibility" />
      <div className="px-5">
        <SwitchField
          label="Allow visitors to download the CV"
          description={hasCv ? 'Shows “Download CV” buttons across the site.' : <>Upload a CV on the <Link to="/admin/profile" className="text-gold hover:underline">Profile</Link> page first.</>}
          checked={data.settings.cv_published}
          disabled={!hasCv || toggle.isPending}
          onCheckedChange={(v) => toggle.mutate(v)}
        />
      </div>
    </Card>
  )
}

export default function SettingsPage() {
  const settings = useQuery({ queryKey: qk.adminSettings, queryFn: fetchAdminSettings })
  return (
    <>
      <PageHeader title="Settings" description="Site-wide configuration, branding and visibility." />
      {settings.isPending ? (
        <Spinner />
      ) : settings.isError ? (
        <ErrorState message="Settings could not be loaded." onRetry={() => void settings.refetch()} />
      ) : (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start">
          <SettingsForm key={settings.data.settings.updated_at} data={settings.data} />
          <div className="grid min-w-0 gap-6">
            <CvVisibility data={settings.data} />
            <Card>
              <CardHeader title="Branding" description={FILE_RULES.profileAsset.label} />
              <div className="grid gap-6 p-5">
                <AssetSlot field="logo_path" label="Logo" hint="Square image, shown in the header." aspect="aspect-square w-24" data={settings.data} />
                <AssetSlot field="favicon_path" label="Favicon" hint="Square PNG, at least 64×64." aspect="aspect-square w-16" data={settings.data} />
                <AssetSlot field="og_image_path" label="Social image" hint="1200×630 recommended. Used for link previews." aspect="aspect-[1200/630]" data={settings.data} />
              </div>
            </Card>
            <Card>
              <CardHeader title="Social links" />
              <p className="p-5 text-sm text-fg-muted">
                Social links are managed on the <Link to="/admin/profile" className="text-gold hover:underline">Profile</Link> page.
              </p>
            </Card>
          </div>
        </div>
      )}
    </>
  )
}
