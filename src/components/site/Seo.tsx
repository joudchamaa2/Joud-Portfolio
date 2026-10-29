import { env } from '@/lib/env'
import { publicUrl } from '@/lib/storage'
import { absoluteUrl } from '@/lib/utils'
import { useSiteData } from './SiteData'

type SeoProps = {
  /** Page title; the site name is appended automatically. Omit on the homepage. */
  title?: string
  description?: string | null
  /** Path for the canonical URL, e.g. "/projects/my-app". */
  path: string
  /** Absolute image URL for social previews. Defaults to the site's OG image. */
  image?: string | null
  type?: 'website' | 'article' | 'profile'
  noindex?: boolean
}

/**
 * Per-page metadata using React 19's native <title>/<meta>/<link> hoisting.
 * Static defaults in index.html are removed at startup (see main.tsx) so these
 * are the only tags present once the app has rendered.
 */
export function Seo({ title, description, path, image, type = 'website', noindex }: SeoProps) {
  const { settings, profile } = useSiteData()
  const fullTitle = title ? `${title} — ${profile.full_name}` : settings.site_title
  const desc = description || profile.seo_description || settings.site_description || ''
  const canonical = absoluteUrl(path, env.siteUrl)
  const ogImage = image ?? publicUrl('profile-assets', settings.og_image_path)

  return (
    <>
      <title>{fullTitle}</title>
      {desc && <meta name="description" content={desc} />}
      {canonical && <link rel="canonical" href={canonical} />}
      {noindex && <meta name="robots" content="noindex, nofollow" />}
      <meta property="og:type" content={type} />
      <meta property="og:site_name" content={profile.full_name} />
      <meta property="og:title" content={fullTitle} />
      {desc && <meta property="og:description" content={desc} />}
      {canonical && <meta property="og:url" content={canonical} />}
      {ogImage && <meta property="og:image" content={ogImage} />}
      <meta name="twitter:card" content={ogImage ? 'summary_large_image' : 'summary'} />
    </>
  )
}
