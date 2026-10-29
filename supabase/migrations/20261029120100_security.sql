-- =============================================================================
-- Authorization: admin check, Row Level Security, grants and admin RPCs.
--
-- Model:
--   * anon / authenticated may READ only content intended for publication.
--   * Every write requires public.is_admin(), which checks the admins table.
--     Being authenticated is never sufficient on its own.
--   * contact_messages are written only by the service role (Edge Function).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- is_admin(): security definer so it can read public.admins regardless of the
-- caller's RLS, with an empty search_path to prevent object shadowing.
-- -----------------------------------------------------------------------------
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.admins a where a.user_id = (select auth.uid())
  );
$$;

revoke execute on function public.is_admin() from public;
grant execute on function public.is_admin() to anon, authenticated, service_role;

-- -----------------------------------------------------------------------------
-- Table privileges (defence in depth on top of RLS).
-- Supabase grants ALL on new public tables to anon/authenticated by default;
-- narrow that down so anonymous visitors can only ever SELECT public content.
-- -----------------------------------------------------------------------------
revoke all on all tables in schema public from anon;
grant select on
  public.profile,
  public.social_links,
  public.site_settings,
  public.project_categories,
  public.projects,
  public.project_images,
  public.skill_categories,
  public.skills,
  public.project_skills,
  public.timeline_entries
to anon;

-- admins is never modified through the Data API.
revoke all on public.admins from authenticated;
grant select on public.admins to authenticated;

-- Singletons: no inserts or deletes through the API.
revoke insert, delete on public.profile, public.site_settings, public.private_settings from authenticated;

-- Contact messages are created only by the Edge Function (service role).
revoke insert on public.contact_messages from authenticated;

-- -----------------------------------------------------------------------------
-- Enable RLS everywhere.
-- -----------------------------------------------------------------------------
alter table public.admins             enable row level security;
alter table public.profile            enable row level security;
alter table public.social_links       enable row level security;
alter table public.site_settings      enable row level security;
alter table public.private_settings   enable row level security;
alter table public.project_categories enable row level security;
alter table public.projects           enable row level security;
alter table public.project_images     enable row level security;
alter table public.skill_categories   enable row level security;
alter table public.skills             enable row level security;
alter table public.project_skills     enable row level security;
alter table public.timeline_entries   enable row level security;
alter table public.contact_messages   enable row level security;

-- admins ----------------------------------------------------------------------
create policy "admins: users can see their own row"
  on public.admins for select to authenticated
  using (user_id = (select auth.uid()));

-- profile / site_settings (singletons, fully public by design) ----------------
create policy "profile: public read" on public.profile
  for select to anon, authenticated using (true);
create policy "profile: admin update" on public.profile
  for update to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

create policy "site_settings: public read" on public.site_settings
  for select to anon, authenticated using (true);
create policy "site_settings: admin update" on public.site_settings
  for update to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

-- private_settings (admin only) -------------------------------------------------
create policy "private_settings: admin read" on public.private_settings
  for select to authenticated using ((select public.is_admin()));
create policy "private_settings: admin update" on public.private_settings
  for update to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

-- social_links -------------------------------------------------------------------
create policy "social_links: public read visible" on public.social_links
  for select to anon, authenticated using (is_visible);
create policy "social_links: admin all" on public.social_links
  for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

-- project_categories --------------------------------------------------------------
create policy "project_categories: public read" on public.project_categories
  for select to anon, authenticated using (true);
create policy "project_categories: admin all" on public.project_categories
  for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

-- projects ------------------------------------------------------------------------
create policy "projects: public read published" on public.projects
  for select to anon, authenticated using (status = 'published');
create policy "projects: admin all" on public.projects
  for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

-- project_images / project_skills: visible only through a published project ----
create policy "project_images: public read for published projects" on public.project_images
  for select to anon, authenticated
  using (exists (select 1 from public.projects p where p.id = project_id and p.status = 'published'));
create policy "project_images: admin all" on public.project_images
  for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

create policy "project_skills: public read for published projects" on public.project_skills
  for select to anon, authenticated
  using (exists (select 1 from public.projects p where p.id = project_id and p.status = 'published'));
create policy "project_skills: admin all" on public.project_skills
  for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

-- skill_categories ------------------------------------------------------------------
create policy "skill_categories: public read" on public.skill_categories
  for select to anon, authenticated using (true);
create policy "skill_categories: admin all" on public.skill_categories
  for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

-- skills: visible skills, plus hidden skills already shown as a published
-- project's technology tag (so tags render without exposing anything new).
create policy "skills: public read visible or used by published project" on public.skills
  for select to anon, authenticated
  using (
    is_visible
    or exists (
      select 1 from public.project_skills ps
      join public.projects p on p.id = ps.project_id
      where ps.skill_id = skills.id and p.status = 'published'
    )
  );
create policy "skills: admin all" on public.skills
  for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

-- timeline_entries ----------------------------------------------------------------
create policy "timeline_entries: public read visible" on public.timeline_entries
  for select to anon, authenticated using (is_visible);
create policy "timeline_entries: admin all" on public.timeline_entries
  for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

-- contact_messages: admins read / update status / delete. No public access. --------
create policy "contact_messages: admin read" on public.contact_messages
  for select to authenticated using ((select public.is_admin()));
create policy "contact_messages: admin update" on public.contact_messages
  for update to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));
create policy "contact_messages: admin delete" on public.contact_messages
  for delete to authenticated using ((select public.is_admin()));

-- -----------------------------------------------------------------------------
-- CV publication integrity: cannot publish a CV that has not been uploaded,
-- and removing the CV automatically unpublishes it.
-- -----------------------------------------------------------------------------
create or replace function public.site_settings_check_cv()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.cv_published and not exists (
    select 1 from public.private_settings where id = 1 and cv_path is not null
  ) then
    raise exception 'Upload a CV before publishing it.' using errcode = '23514';
  end if;
  return new;
end;
$$;
revoke execute on function public.site_settings_check_cv() from public;

create trigger check_cv_published before update on public.site_settings
  for each row execute function public.site_settings_check_cv();

create or replace function public.private_settings_unpublish_cv()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.cv_path is null and old.cv_path is not null then
    update public.site_settings set cv_published = false where id = 1 and cv_published;
  end if;
  return new;
end;
$$;
revoke execute on function public.private_settings_unpublish_cv() from public;

create trigger unpublish_cv_on_removal after update on public.private_settings
  for each row execute function public.private_settings_unpublish_cv();

-- -----------------------------------------------------------------------------
-- Admin RPCs. SECURITY INVOKER, so RLS still applies; the explicit is_admin()
-- check gives a clear error instead of silently touching zero rows.
-- -----------------------------------------------------------------------------
create or replace function public.admin_dashboard_stats()
returns json
language plpgsql
stable
security invoker
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'Not authorized' using errcode = '42501';
  end if;
  return json_build_object(
    'published_projects', (select count(*) from public.projects where status = 'published'),
    'draft_projects',     (select count(*) from public.projects where status = 'draft'),
    'skills',             (select count(*) from public.skills),
    'total_messages',     (select count(*) from public.contact_messages),
    'unread_messages',    (select count(*) from public.contact_messages where not is_read and not is_archived)
  );
end;
$$;

-- Rewrites sort_order for the given ids, in array order.
create or replace function public.reorder_rows(p_table text, p_ids uuid[])
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'Not authorized' using errcode = '42501';
  end if;
  if p_table not in ('projects', 'project_images', 'skills', 'skill_categories',
                     'project_categories', 'timeline_entries', 'social_links') then
    raise exception 'Unsupported table %', p_table using errcode = '22023';
  end if;
  execute format(
    'update public.%I as t set sort_order = x.ord::integer
       from unnest($1) with ordinality as x(id, ord)
      where t.id = x.id',
    p_table
  ) using p_ids;
end;
$$;

-- Replaces a project's technology tags atomically, preserving order.
create or replace function public.set_project_skills(p_project_id uuid, p_skill_ids uuid[])
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'Not authorized' using errcode = '42501';
  end if;
  delete from public.project_skills
   where project_id = p_project_id
     and not (skill_id = any (coalesce(p_skill_ids, '{}')));
  insert into public.project_skills (project_id, skill_id, sort_order)
  select p_project_id, x.id, x.ord::integer
    from unnest(coalesce(p_skill_ids, '{}')) with ordinality as x(id, ord)
  on conflict (project_id, skill_id) do update set sort_order = excluded.sort_order;
end;
$$;

-- Called only by the contact Edge Function (service role). Applies rate limits
-- inside the database so they hold even if several function instances run.
create or replace function public.submit_contact_message(
  p_name text,
  p_email text,
  p_subject text,
  p_message text,
  p_ip_hash text,
  p_user_agent text
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_id uuid;
begin
  if p_ip_hash is not null then
    if (select count(*) from public.contact_messages
         where ip_hash = p_ip_hash and created_at > now() - interval '10 minutes') >= 3
       or (select count(*) from public.contact_messages
         where ip_hash = p_ip_hash and created_at > now() - interval '1 day') >= 10 then
      raise exception 'rate_limited' using errcode = 'P0001';
    end if;
  end if;
  -- global ceiling against distributed floods
  if (select count(*) from public.contact_messages where created_at > now() - interval '1 hour') >= 60 then
    raise exception 'rate_limited' using errcode = 'P0001';
  end if;

  insert into public.contact_messages (name, email, subject, message, ip_hash, user_agent)
  values (p_name, p_email, p_subject, p_message, p_ip_hash, left(p_user_agent, 300))
  returning id into v_id;
  return v_id;
end;
$$;

revoke execute on function public.admin_dashboard_stats() from public, anon;
revoke execute on function public.reorder_rows(text, uuid[]) from public, anon;
revoke execute on function public.set_project_skills(uuid, uuid[]) from public, anon;
grant execute on function public.admin_dashboard_stats() to authenticated;
grant execute on function public.reorder_rows(text, uuid[]) to authenticated;
grant execute on function public.set_project_skills(uuid, uuid[]) to authenticated;

revoke execute on function public.submit_contact_message(text, text, text, text, text, text) from public, anon, authenticated;
grant execute on function public.submit_contact_message(text, text, text, text, text, text) to service_role;
