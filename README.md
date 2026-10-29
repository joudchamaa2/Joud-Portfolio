# Joud Chamaa — Portfolio

Personal software-engineering portfolio with a secure admin panel.
React 19 + Vite + TypeScript (strict) on the frontend; Supabase (Postgres, Auth, Storage, Edge Functions) as the backend; deployed as a static site on Vercel.

> Scope: this repository represents Joud as an individual developer. It contains no company or SaaS functionality.

- **Public site:** home, projects (filters, sorting, pagination), project case studies, about, skills, experience/education, contact form, CV download.
- **Admin (`/admin`):** dashboard with live stats, project CRUD (drafts, publish, featured, ordering, slugs, tags, thumbnails, galleries), skills, education/experience, contact inbox, profile, site settings, uploads.

Deployment, Supabase setup and the production checklist are in **[docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)**. The security model is in **[docs/SECURITY.md](docs/SECURITY.md)**.

---

## Run locally

Requirements: Node.js ≥ 20.19 (developed on Node 24), npm.

```bash
npm install
cp .env.example .env.local      # then fill in the values (see below)
npm run dev                      # http://localhost:5173
```

`.env.local` needs a Supabase project (hosted, or local via the CLI):

| Variable | Required | Notes |
| --- | --- | --- |
| `VITE_SUPABASE_URL` | yes | Project URL |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | yes | `sb_publishable_…` (legacy anon key also works). Public by design — RLS enforces access. |
| `VITE_SITE_URL` | recommended | Canonical URL, e.g. `https://joudchamaa.com`. Used for canonical/OG tags, robots.txt, sitemap. |
| `VITE_TURNSTILE_SITE_KEY` | optional | Enables the Cloudflare Turnstile captcha on the contact form. |

Without the two Supabase variables the app shows a "Configuration required" screen instead of failing.

**Never put secrets in `VITE_*` variables** — they are embedded in the browser bundle. Server secrets go in Edge Function secrets (`supabase/functions/.env.example`).

### Local Supabase (optional, requires Docker)

```bash
npx supabase start          # applies supabase/migrations and supabase/seed.sql
npx supabase functions serve --env-file supabase/functions/.env
```
Use the printed API URL and publishable key in `.env.local`. Create the admin user in Studio (http://localhost:54323) and run `supabase/admin/provision_admin.sql`.

---

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Vite dev server |
| `npm run build` | Typecheck, production build, then generate `robots.txt` / `sitemap.xml` |
| `npm run test` | All tests (database/RLS + app) |
| `npm run test:db` | Only the database security tests |
| `npm run lint` | oxlint (React, a11y, TypeScript rules), warnings fail |
| `npm run typecheck` | `tsc -b` |
| `npm run db:types` | Regenerate `src/lib/database.types.ts` from the migrations |
| `npm run check` | Everything above — use before deploying |

---

## Project structure

```
supabase/
  migrations/            schema → security (RLS, grants, RPCs) → storage
  seed.sql               initial editable content (only verified facts)
  functions/
    contact/             contact form endpoint (validation, spam checks, rate limit, email)
    cv-url/              short-lived signed CV links, only when publication is on
    _shared/             runtime-agnostic helpers shared with the browser & tests
  admin/provision_admin.sql
src/
  lib/api/public.ts      visitor queries (always filtered to published/visible)
  lib/api/admin.ts       admin operations (authorised by RLS)
  lib/validation/        Zod schemas mirroring database constraints
  lib/files.ts, storage.ts  upload validation (size + magic bytes), generated paths
  auth/                  session handling and the admin route guard
  pages/public, pages/admin, components, layouts
tests/
  db/                    PGlite harness + RLS / constraint / storage-policy tests
  unit/                  validation, query layer, Edge Function handlers, components
scripts/
  gen-db-types.ts        types generated from the real migrations
  generate-seo-files.ts  post-build robots.txt + sitemap.xml
```

## Testing approach

- **Database security tests run the real migration SQL** in PGlite (Postgres compiled to WebAssembly) with Supabase's roles (`anon`, `authenticated`, `service_role`), `auth.uid()`, storage tables and default grants emulated. They check anonymous visitors, ordinary signed-in users and administrators against every table, RPC and bucket — including draft privacy and contact-message privacy. No Docker needed.
- **Edge Function handlers** are pure, dependency-injected functions tested under Node; `index.ts` only wires in Deno and the service-role client.
- **Components** are tested with React Testing Library against mocked data-access modules.

PGlite is not the hosted Supabase stack, so after deploying, run the production checklist in `docs/DEPLOYMENT.md`, which repeats the key checks against the real project.

## SEO behaviour

This is a client-rendered SPA:

- Each route sets its title, description, canonical URL and Open Graph tags at runtime (React 19 metadata). Google renders JavaScript and sees them.
- Crawlers that do **not** run JavaScript (most link-preview bots: LinkedIn, Slack, X, WhatsApp) see the static defaults in `index.html` — the site name and description — not per-project previews.
- `robots.txt` and `sitemap.xml` are generated at build time; the sitemap lists published projects as of the last deploy. Redeploy (or wire a Vercel deploy hook) after publishing new projects.
- `/admin` is disallowed in robots.txt, excluded from the sitemap, and served with `X-Robots-Tag: noindex`.

Build-time prerendering was evaluated and not adopted: content lives in the database and changes without a rebuild, so prerendered HTML would go stale between deploys and add a build-time dependency on the database. If per-project link previews become important, the natural next step is a small Vercel function that serves OG tags for `/projects/:slug` to bots. No SEO setup guarantees rankings.
