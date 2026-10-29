import { zodResolver } from '@hookform/resolvers/zod'
import { CircleCheck, Mail, MapPin, Send } from 'lucide-react'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { SectionHeader, SocialLinks } from '@/components/site/primitives'
import { Seo } from '@/components/site/Seo'
import { useSiteData } from '@/components/site/SiteData'
import { Turnstile } from '@/components/site/Turnstile'
import { Button } from '@/components/ui/button'
import { CharCount, Field, Input, Textarea } from '@/components/ui/form'
import { submitContactMessage, type ContactError } from '@/lib/api/public'
import { env } from '@/lib/env'
import { hasText } from '@/lib/utils'
import { contactSchema, type ContactValues } from '@/lib/validation/schemas'
import { CONTACT_LIMITS } from '../../../supabase/functions/_shared/contact-validation'

const EMPTY: ContactValues = { name: '', email: '', subject: '', message: '', website: '' }

export function ContactForm() {
  const [startedAt, setStartedAt] = useState(() => Date.now())
  const [status, setStatus] = useState<'idle' | 'sent'>('idle')
  const [serverError, setServerError] = useState<string | null>(null)
  const [token, setToken] = useState<string | null>(null)
  const [turnstileReset, setTurnstileReset] = useState(0)
  const needsCaptcha = Boolean(env.turnstileSiteKey)

  const form = useForm<ContactValues>({ resolver: zodResolver(contactSchema), defaultValues: EMPTY, mode: 'onTouched' })
  const { register, handleSubmit, formState, watch, setError, reset } = form
  const { errors, isSubmitting } = formState

  async function onSubmit(values: ContactValues) {
    setServerError(null)
    if (needsCaptcha && !token) {
      setServerError('Please complete the verification challenge.')
      return
    }
    try {
      await submitContactMessage({ ...values, startedAt, turnstileToken: token ?? undefined })
      setStatus('sent')
      reset(EMPTY)
    } catch (error) {
      const e = error as ContactError
      if (e.fieldErrors) {
        for (const [field, message] of Object.entries(e.fieldErrors)) {
          if (message) setError(field as keyof ContactValues, { message })
        }
      }
      setServerError(
        e.code === 'rate_limited'
          ? 'You have sent several messages recently. Please wait a while before trying again.'
          : e.message || 'Your message could not be sent. Please try again later.',
      )
      setToken(null)
      setTurnstileReset((n) => n + 1)
    }
  }

  if (status === 'sent') {
    return (
      <div role="status" className="flex flex-col items-start rounded-lg border border-success/30 bg-success/5 p-8">
        <CircleCheck className="size-6 text-success" aria-hidden />
        <h2 className="mt-4 font-display text-2xl text-fg">Message sent</h2>
        <p className="mt-2 text-fg-muted">Thank you for reaching out. I will reply to the email address you provided.</p>
        <Button
          variant="secondary"
          className="mt-6"
          onClick={() => {
            setStatus('idle')
            setStartedAt(Date.now())
          }}
        >
          Send another message
        </Button>
      </div>
    )
  }

  return (
    <form noValidate onSubmit={handleSubmit(onSubmit)} className="grid gap-5" aria-label="Contact form">
      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="Name" required error={errors.name?.message}>
          {({ id, describedBy, invalid }) => (
            <Input id={id} autoComplete="name" aria-describedby={describedBy} aria-invalid={invalid} {...register('name')} />
          )}
        </Field>
        <Field label="Email" required error={errors.email?.message}>
          {({ id, describedBy, invalid }) => (
            <Input id={id} type="email" autoComplete="email" aria-describedby={describedBy} aria-invalid={invalid} {...register('email')} />
          )}
        </Field>
      </div>
      <Field label="Subject" required error={errors.subject?.message}>
        {({ id, describedBy, invalid }) => <Input id={id} aria-describedby={describedBy} aria-invalid={invalid} {...register('subject')} />}
      </Field>
      <Field
        label="Message"
        required
        error={errors.message?.message}
        hint={<CharCount value={watch('message')} max={CONTACT_LIMITS.message.max} />}
      >
        {({ id, describedBy, invalid }) => (
          <Textarea id={id} rows={7} aria-describedby={describedBy} aria-invalid={invalid} {...register('message')} />
        )}
      </Field>

      {/* Honeypot: invisible to people and assistive tech; bots tend to fill it. */}
      <div aria-hidden className="absolute -left-[9999px] h-px w-px overflow-hidden">
        <label htmlFor="website">Website</label>
        <input id="website" type="text" tabIndex={-1} autoComplete="off" {...register('website')} />
      </div>

      {needsCaptcha && <Turnstile siteKey={env.turnstileSiteKey} onToken={setToken} resetKey={turnstileReset} />}

      {serverError && (
        <p role="alert" className="rounded-md border border-danger/30 bg-danger/5 px-4 py-3 text-sm text-danger">
          {serverError}
        </p>
      )}

      <div>
        <Button type="submit" size="lg" loading={isSubmitting}>
          {!isSubmitting && <Send aria-hidden />}
          Send message
        </Button>
      </div>
    </form>
  )
}

export default function ContactPage() {
  const { profile, socialLinks } = useSiteData()
  return (
    <div className="container-page section">
      <Seo title="Contact" path="/contact" description={`Get in touch with ${profile.full_name}.`} />
      <SectionHeader as="h1" label="Contact" title="Let’s talk" description="Questions, opportunities or project ideas — send a message using the form." />
      <div className="grid gap-14 lg:grid-cols-[1fr_18rem] lg:gap-20">
        <ContactForm />
        <aside className="grid content-start gap-6 text-sm">
          {hasText(profile.public_email) && (
            <div className="grid gap-1.5">
              <p className="eyebrow">Email</p>
              <a href={`mailto:${profile.public_email}`} className="flex items-center gap-2 text-fg hover:text-gold">
                <Mail className="size-4 text-fg-subtle" aria-hidden /> {profile.public_email}
              </a>
            </div>
          )}
          {hasText(profile.location) && (
            <div className="grid gap-1.5">
              <p className="eyebrow">Location</p>
              <p className="flex items-center gap-2 text-fg"><MapPin className="size-4 text-fg-subtle" aria-hidden /> {profile.location}</p>
            </div>
          )}
          {socialLinks.length > 0 && (
            <div className="grid gap-3">
              <p className="eyebrow">Elsewhere</p>
              <SocialLinks links={socialLinks} className="flex-col gap-y-3" />
            </div>
          )}
        </aside>
      </div>
    </div>
  )
}
