# Security model

## Principles

1. **The database is the security boundary.** The admin route guard only decides what to render; every read and write is authorised by Postgres Row Level Security.
2. **Authentication ≠ authorisation.** Being signed in grants nothing. Every write policy requires `public.is_admin()`, which checks the `admins` table — never user-editable metadata.
3. **Least privilege for each role.** `anon` may only `SELECT` public tables; `authenticated` users have table grants but RLS returns/permits nothing extra unless they are admins; `service_role` is used only inside Edge Functions.
4. **Private data lives in private places.** Admin-only values (CV path, notification email) are in `private_settings`, not in public tables. Contact messages are never readable without admin rights. The CV bucket is private.

## Authorisation

| Data | Anonymous / ordinary user | Administrator |
| --- | --- | --- |
| `projects` | published only | all, full CRUD |
| `project_images`, `project_skills` | rows of published projects only | full CRUD |
| `skills` | visible skills + tags already on published projects | full CRUD |
| `timeline_entries`, `social_links` | visible only | full CRUD |
| `profile`, `site_settings` | read (all columns are public by design) | update only (singletons) |
| `private_settings` | none (no grant) | read/update |
| `contact_messages` | none (no grant, no policy) | read, update status, delete |
| `admins` | none / own row only | own row; cannot add admins via API |

- `is_admin()` is `SECURITY DEFINER` with `search_path = ''` and schema-qualified references.
- Admin RPCs (`admin_dashboard_stats`, `reorder_rows`, `set_project_skills`) are `SECURITY INVOKER` (RLS still applies), check `is_admin()` explicitly, and are not executable by `anon`. `reorder_rows` uses a table whitelist with `format('%I')`.
- `submit_contact_message` is executable **only** by `service_role` and enforces rate limits in the database (3 per 10 minutes and 10 per day per hashed IP; 60 per hour globally).
- Database triggers keep invariants that the UI cannot bypass: CV cannot be published without a file, removing the CV unpublishes it, `published_at` / `updated_at` are maintained.
- Check constraints mirror the Zod schemas: slug format and uniqueness, `https://` URLs only (blocks `javascript:` etc.), length limits, date ranges, email format.

## Contact form

Browser → `contact` Edge Function → `submit_contact_message()`:
honeypot field · minimum fill time (3 s) and maximum token age · server-side validation and control-character stripping · optional Cloudflare Turnstile · body size limit · CORS allow-list · salted IP hash (raw IPs are never stored) · database rate limits · optional Resend notification as **plain text** with `reply_to` (no HTML built from visitor input). Bots that trip the honeypot or timing check receive a normal success response and nothing is stored.

Messages are rendered in the admin as text nodes only (`white-space: pre-wrap`); there is no `dangerouslySetInnerHTML` anywhere (enforced by the `react/no-danger` lint rule).

## Uploads

- Bucket-level limits: size and MIME type per bucket (enforced by Supabase Storage).
- Client-side: size check plus **magic-byte detection** (a renamed executable is rejected regardless of name or declared type); images are re-encoded to WebP in the browser, which also strips EXIF metadata such as GPS location.
- Object names are generated (`<folder>/<uuid>.<ext>`); client filenames are never used.
- Only admins can insert/update/delete objects in any portfolio bucket.
- Replacements follow upload-new → update-row → delete-old using exact stored paths; failed row updates delete the new upload. Deleting a project removes its thumbnail and gallery files.
- `project-images` is a public bucket: files of draft projects are reachable only by their unguessable UUID URL, and the database rows that reveal those URLs are hidden by RLS.

## Secrets

| Where | What |
| --- | --- |
| Browser (`VITE_*`) | Supabase URL, publishable key, site URL, Turnstile **site** key — all public |
| Edge Function secrets | service-role key (injected), `IP_HASH_SALT`, `TURNSTILE_SECRET_KEY`, `RESEND_API_KEY`, sender/recipient |
| Nowhere in the repo | anything secret — `.env*` and `supabase/functions/.env` are git-ignored |

## HTTP headers (vercel.json)

CSP (`default-src 'self'`, scripts only from self and Cloudflare Turnstile, no `unsafe-eval`, `frame-ancestors 'none'`, `object-src 'none'`), HSTS, `X-Frame-Options: DENY`, `nosniff`, strict referrer policy, restrictive permissions policy, `noindex` + `no-store` for `/admin`. `style-src` allows `'unsafe-inline'` because the toast library and React `style` attributes inject inline styles.

## Known limitations

- Login brute-force protection relies on Supabase Auth's built-in rate limits; there is no additional captcha on the login form.
- The database tests run in PGlite with an emulation of Supabase roles and schemas. They exercise the real migration SQL, but hosted-platform behaviour (Storage API MIME enforcement, Auth settings, Edge Function runtime) must be verified with the production checklist.
- Session tokens are stored in `localStorage` (supabase-js default for SPAs); the CSP reduces, but cannot eliminate, XSS exposure.
