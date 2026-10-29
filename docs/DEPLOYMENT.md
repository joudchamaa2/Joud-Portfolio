# Deployment guide

Order matters: set up Supabase first, verify it, then deploy the frontend.
Commands use `npx supabase …` (the Supabase CLI does not need a global install).

## 1. Supabase project

1. Create a project at <https://supabase.com/dashboard>. Save the database password in a password manager.
2. **Disable public sign-ups:** Authentication → Sign In / Providers → turn off **Allow new users to sign up**. Leave Email enabled (needed for the admin login). Disable anonymous sign-ins.
3. Authentication → URL Configuration: set **Site URL** to your production URL.
4. Note from Project Settings → API keys: the project URL, the **publishable** key (`sb_publishable_…`). Never copy the secret/service-role key anywhere except Supabase's own secret store.

## 2. Database migrations, RLS and storage

Option A — CLI (recommended):

```bash
npx supabase login
npx supabase link --project-ref <your-project-ref>
npx supabase db push            # applies supabase/migrations in order
```

Option B — SQL editor: run each file in `supabase/migrations/` **in filename order**.

The migrations create all tables, constraints, triggers, the `is_admin()` function, every RLS policy and grant, the admin RPCs, the three storage buckets (with size and MIME limits) and their policies. Nothing has to be configured by hand.

Then load the initial content **once** — SQL editor → paste `supabase/seed.sql` → Run.

Verify in the dashboard:
- Table Editor: every table shows **RLS enabled**.
- Storage: `project-images` (public, 5 MB, JPEG/PNG/WebP), `profile-assets` (public, 2 MB), `cv` (**private**, 5 MB, PDF only).

Optional: regenerate types against the live schema (should produce no meaningful diff):
```bash
npx supabase gen types typescript --linked --schema public > src/lib/database.types.ts
```

## 3. Administrator account

1. Authentication → Users → **Add user → Create new user**: your email, a strong unique password, **Auto Confirm User** ticked.
2. SQL editor: open `supabase/admin/provision_admin.sql`, replace the email, run it. It must return one row.

Only users in `public.admins` can sign in to the admin panel or write data. Creating a user without step 2 grants nothing.

## 4. Edge Functions and secrets

```bash
cp supabase/functions/.env.example supabase/functions/.env   # fill in; this file is git-ignored
npx supabase secrets set --env-file supabase/functions/.env
npx supabase functions deploy contact --no-verify-jwt
npx supabase functions deploy cv-url --no-verify-jwt
```

`--no-verify-jwt` is intentional: both endpoints are public, are called with the publishable key (not a JWT), and enforce their own rules. `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are injected automatically.

| Secret | Required | Purpose |
| --- | --- | --- |
| `IP_HASH_SALT` | yes | Random 32+ chars; visitor IPs are stored only as salted hashes for rate limiting. Generate e.g. with `openssl rand -hex 32`. |
| `ALLOWED_ORIGINS` | recommended | `https://your-domain.com,https://www.your-domain.com` |
| `TURNSTILE_SECRET_KEY` | optional | Cloudflare Turnstile; also set `VITE_TURNSTILE_SITE_KEY` in Vercel. |
| `RESEND_API_KEY`, `CONTACT_FROM_EMAIL` | optional | Email notifications via [Resend](https://resend.com). The sender domain must be verified in Resend. |
| `CONTACT_NOTIFY_EMAIL` | optional | Fallback recipient; the admin Settings page can set it instead (stored privately). |

## 5. GitHub

```bash
git add -A
git commit -m "Initial portfolio"
git branch -M main
git remote add origin https://github.com/<you>/<repo>.git
git push -u origin main
```
`.env*` files (except `.env.example`) and `supabase/functions/.env` are git-ignored. Run `git status` before the first commit to confirm no secrets are staged.

## 6. Vercel

1. <https://vercel.com/new> → import the GitHub repository. Framework: **Vite** (auto-detected; `vercel.json` sets the build command and output).
2. Environment variables (Production and Preview):
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_PUBLISHABLE_KEY`
   - `VITE_SITE_URL` (e.g. `https://joudchamaa.com`, no trailing slash)
   - `VITE_TURNSTILE_SITE_KEY` (only if using Turnstile)
3. Deploy. Vercel runs `npm run build` (typecheck + build + SEO files) but **not** the test suite — run `npm run check` locally before pushing.

`vercel.json` adds SPA rewrites, long-term caching for hashed assets, and security headers (CSP, HSTS, frame denial, nosniff, referrer and permissions policies). The CSP allows `*.supabase.co`; if you use a Supabase **custom domain**, add it to `img-src` and `connect-src`.

**Sitemap freshness:** the sitemap is generated at build time. Create a deploy hook (Vercel → Settings → Git → Deploy Hooks) and trigger it after publishing projects, or simply redeploy.

## 7. Custom domain

Vercel → Project → Settings → Domains → add the domain and follow the DNS instructions (an `A` record for the apex, `CNAME` for `www`). Then update everywhere the URL appears:
- Vercel `VITE_SITE_URL` (redeploy afterwards)
- Supabase Auth → URL Configuration → Site URL
- Edge Function secret `ALLOWED_ORIGINS` (`npx supabase secrets set ALLOWED_ORIGINS=…`)
- Turnstile widget hostnames, if used

---

## Production checklist

Run these against the **deployed** site before sharing it.

**Security**
- [ ] Public sign-ups are disabled (Auth settings).
- [ ] Signed out, open `/admin` → redirected to the login page.
- [ ] A non-admin user (create a throwaway user without provisioning) is refused at login; delete that user afterwards.
- [ ] In the browser console on the public site, run
      `await (await fetch('<SUPABASE_URL>/rest/v1/contact_messages?select=*', {headers:{apikey:'<PUBLISHABLE_KEY>'}})).json()` → permission error, no rows.
- [ ] Same for `projects?select=slug&status=eq.draft` → empty array while a draft exists.
- [ ] `<SUPABASE_URL>/storage/v1/object/public/cv/<anything>` → error (the CV bucket is private).
- [ ] No service-role/secret key, database password or Resend key in the Vercel env or the repository (e.g. `git grep -n "sb_secret_\|eyJhbGci"` returns nothing).

**Functionality**
- [ ] Sign in as admin; dashboard numbers match the database.
- [ ] Create a draft project → not visible on `/projects` in a private window → publish → visible → unpublish → hidden again.
- [ ] Upload a thumbnail and gallery image; try a renamed `.exe`/`.txt` and a > 5 MB image — both are rejected.
- [ ] Upload a CV, enable "Allow visitors to download the CV" → "Download CV" works in a private window; disable → button disappears and the function returns 404.
- [ ] Submit the contact form → message appears in the admin inbox; email arrives (if Resend is configured). Submit 4 times quickly → the 4th is rate-limited.
- [ ] Edit profile/settings → changes appear on the public site.
- [ ] Delete a test project → its images disappear from Storage.

**Quality**
- [ ] Check the site at phone, tablet and desktop widths.
- [ ] `/robots.txt` and `/sitemap.xml` load and use the production domain.
- [ ] Unknown URLs show the 404 page; `/projects/does-not-exist` shows "Project not found".
- [ ] Replace placeholder content: add verified projects, dates, links and contact details; review every visible text for accuracy.
