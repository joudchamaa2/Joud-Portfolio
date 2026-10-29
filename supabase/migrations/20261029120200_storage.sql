-- =============================================================================
-- Storage buckets and object policies.
--
--   project-images  public read (unguessable generated paths; rows referencing
--                   draft images are hidden by RLS), admin-only writes.
--   profile-assets  public read for publishable assets (avatar, logo, favicon,
--                   social image), admin-only writes.
--   cv              PRIVATE. Admin-only access. Visitors receive a short-lived
--                   signed URL from the cv-url Edge Function, which first checks
--                   that CV publication is enabled.
--
-- Size and MIME limits are enforced by the buckets themselves; the admin UI
-- additionally validates type, size and file signature before uploading.
-- =============================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('project-images', 'project-images', true,  5242880, array['image/jpeg', 'image/png', 'image/webp']),
  ('profile-assets', 'profile-assets', true,  2097152, array['image/jpeg', 'image/png', 'image/webp']),
  ('cv',             'cv',             false, 5242880, array['application/pdf'])
on conflict (id) do update set
  public             = excluded.public,
  file_size_limit    = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Public buckets serve objects through their public URL without consulting
-- these policies, so no anon SELECT policy is created: anonymous clients cannot
-- list buckets or touch the API. Admins need SELECT to list/replace/sign.

create policy "portfolio buckets: admin read"
  on storage.objects for select to authenticated
  using (bucket_id in ('project-images', 'profile-assets', 'cv') and (select public.is_admin()));

create policy "portfolio buckets: admin insert"
  on storage.objects for insert to authenticated
  with check (bucket_id in ('project-images', 'profile-assets', 'cv') and (select public.is_admin()));

create policy "portfolio buckets: admin update"
  on storage.objects for update to authenticated
  using (bucket_id in ('project-images', 'profile-assets', 'cv') and (select public.is_admin()))
  with check (bucket_id in ('project-images', 'profile-assets', 'cv') and (select public.is_admin()));

create policy "portfolio buckets: admin delete"
  on storage.objects for delete to authenticated
  using (bucket_id in ('project-images', 'profile-assets', 'cv') and (select public.is_admin()));
