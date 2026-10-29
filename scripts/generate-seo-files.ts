/**
 * Post-build step: writes dist/robots.txt and dist/sitemap.xml.
 *
 * Published project URLs are fetched with the public (publishable) key, so
 * only content visitors can already see is listed. Admin routes are excluded
 * and disallowed. If Supabase is unreachable the sitemap still lists the
 * static pages and the build continues.
 *
 * The sitemap reflects the database at build time: redeploy (or trigger a
 * Vercel deploy hook) after publishing new projects.
 */
import { writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { loadEnv } from 'vite'

const root = fileURLToPath(new URL('..', import.meta.url))
const dist = fileURLToPath(new URL('../dist/', import.meta.url))
const env = { ...loadEnv('production', root, 'VITE_'), ...process.env }

const siteUrl = (env.VITE_SITE_URL ?? '').trim().replace(/\/+$/, '')
const supabaseUrl = (env.VITE_SUPABASE_URL ?? '').trim()
const supabaseKey = (env.VITE_SUPABASE_PUBLISHABLE_KEY ?? '').trim()

const STATIC_ROUTES = ['/', '/projects', '/about', '/skills', '/experience', '/contact']

const escapeXml = (s: string) =>
  s.replace(/[<>&'"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' })[c]!)

async function publishedProjects(): Promise<Array<{ slug: string; updated_at: string }>> {
  if (!supabaseUrl || !supabaseKey) return []
  try {
    const res = await fetch(
      `${supabaseUrl}/rest/v1/projects?select=slug,updated_at&status=eq.published&order=sort_order`,
      { headers: { apikey: supabaseKey, Authorization: `Bearer ${supabaseKey}` }, signal: AbortSignal.timeout(10_000) },
    )
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    return (await res.json()) as Array<{ slug: string; updated_at: string }>
  } catch (error) {
    console.warn(`[seo] Could not fetch projects for the sitemap (${(error as Error).message}); listing static pages only.`)
    return []
  }
}

const robots = ['User-agent: *', 'Allow: /', 'Disallow: /admin', ...(siteUrl ? ['', `Sitemap: ${siteUrl}/sitemap.xml`] : []), ''].join('\n')
writeFileSync(`${dist}robots.txt`, robots)

if (!siteUrl) {
  console.warn('[seo] VITE_SITE_URL is not set: robots.txt written without a sitemap, sitemap.xml skipped.')
} else {
  const projects = await publishedProjects()
  const urls = [
    ...STATIC_ROUTES.map((path) => `  <url><loc>${escapeXml(siteUrl + path)}</loc></url>`),
    ...projects.map(
      (p) => `  <url><loc>${escapeXml(`${siteUrl}/projects/${p.slug}`)}</loc><lastmod>${p.updated_at.slice(0, 10)}</lastmod></url>`,
    ),
  ]
  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join('\n')}\n</urlset>\n`
  writeFileSync(`${dist}sitemap.xml`, xml)
  console.log(`[seo] sitemap.xml written with ${urls.length} URLs.`)
}
