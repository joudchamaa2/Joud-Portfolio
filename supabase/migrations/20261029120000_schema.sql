-- =============================================================================
-- Portfolio schema: tables, constraints, indexes and triggers.
-- Authorization (RLS, grants, admin RPCs) lives in the next migration.
-- =============================================================================

create type public.project_status as enum ('draft', 'published');
create type public.timeline_kind as enum ('education', 'training', 'experience', 'certification');

-- Shared trigger: keep updated_at accurate on every UPDATE.
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- -----------------------------------------------------------------------------
-- admins: the single source of truth for administrative permissions.
-- Rows are provisioned manually (SQL editor / service role) — never by clients.
-- -----------------------------------------------------------------------------
create table public.admins (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  note       text check (char_length(note) <= 200),
  created_at timestamptz not null default now()
);

-- -----------------------------------------------------------------------------
-- profile (singleton): everything in this table is intended for publication.
-- Optional fields that are null/empty are simply not rendered.
-- -----------------------------------------------------------------------------
create table public.profile (
  id              smallint primary key default 1 check (id = 1),
  full_name       text not null check (char_length(full_name) between 1 and 120),
  headline        text not null check (char_length(headline) between 1 and 160),
  intro           text check (char_length(intro) <= 600),
  bio             text check (char_length(bio) <= 6000),
  journey         text check (char_length(journey) <= 6000),
  interests       text check (char_length(interests) <= 3000),
  goals           text check (char_length(goals) <= 3000),
  location        text check (char_length(location) <= 120),
  public_email    text check (public_email is null or (char_length(public_email) <= 254 and public_email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$')),
  phone           text check (phone is null or phone ~ '^\+?[0-9 ().-]{6,24}$'),
  avatar_path     text check (char_length(avatar_path) <= 300),
  avatar_alt      text check (char_length(avatar_alt) <= 200),
  seo_description text check (char_length(seo_description) <= 300),
  updated_at      timestamptz not null default now()
);

create table public.social_links (
  id         uuid primary key default gen_random_uuid(),
  platform   text not null check (platform in ('github', 'linkedin', 'x', 'gitlab', 'stackoverflow', 'website', 'other')),
  label      text not null check (char_length(label) between 1 and 60),
  url        text not null check (char_length(url) <= 500 and url ~ '^https://[^\s/$.?#][^\s]*$'),
  sort_order integer not null default 0,
  is_visible boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- -----------------------------------------------------------------------------
-- site_settings (singleton): public, non-sensitive configuration.
-- -----------------------------------------------------------------------------
create table public.site_settings (
  id                     smallint primary key default 1 check (id = 1),
  site_title             text not null check (char_length(site_title) between 1 and 80),
  site_description       text check (char_length(site_description) <= 300),
  monogram               text not null default 'JC' check (char_length(monogram) between 1 and 4),
  logo_path              text check (char_length(logo_path) <= 300),
  favicon_path           text check (char_length(favicon_path) <= 300),
  og_image_path          text check (char_length(og_image_path) <= 300),
  footer_text            text check (char_length(footer_text) <= 300),
  show_featured_projects boolean not null default true,
  show_skills            boolean not null default true,
  show_education         boolean not null default true,
  show_about             boolean not null default true,
  show_contact           boolean not null default true,
  featured_limit         smallint not null default 3 check (featured_limit between 1 and 12),
  cv_published           boolean not null default false,
  updated_at             timestamptz not null default now()
);

-- -----------------------------------------------------------------------------
-- private_settings (singleton): admin-only data (private storage paths etc.).
-- Kept separate so public tables never carry private columns.
-- -----------------------------------------------------------------------------
create table public.private_settings (
  id                 smallint primary key default 1 check (id = 1),
  cv_path            text check (char_length(cv_path) <= 300),
  cv_file_name       text check (char_length(cv_file_name) <= 120),
  cv_size_bytes      integer check (cv_size_bytes between 1 and 5242880),
  cv_uploaded_at     timestamptz,
  notification_email text check (notification_email is null or notification_email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  updated_at         timestamptz not null default now()
);

-- -----------------------------------------------------------------------------
-- Projects
-- -----------------------------------------------------------------------------
create table public.project_categories (
  id         uuid primary key default gen_random_uuid(),
  name       text not null check (char_length(name) between 1 and 60),
  slug       text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(slug) <= 60),
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index project_categories_name_key on public.project_categories (lower(name));

create table public.projects (
  id              uuid primary key default gen_random_uuid(),
  slug            text not null check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(slug) <= 80),
  title           text not null check (char_length(title) between 1 and 120),
  summary         text not null check (char_length(summary) between 1 and 300),
  overview        text check (char_length(overview) <= 8000),
  problem         text check (char_length(problem) <= 8000),
  objectives      text check (char_length(objectives) <= 8000),
  contribution    text check (char_length(contribution) <= 8000),
  architecture    text check (char_length(architecture) <= 8000),
  challenges      text check (char_length(challenges) <= 8000),
  features        text[] not null default '{}' check (cardinality(features) <= 30),
  role            text check (char_length(role) <= 120),
  category_id     uuid references public.project_categories (id) on delete set null,
  status          public.project_status not null default 'draft',
  is_featured     boolean not null default false,
  sort_order      integer not null default 0,
  thumbnail_path  text check (char_length(thumbnail_path) <= 300),
  thumbnail_alt   text check (char_length(thumbnail_alt) <= 200),
  repo_url        text check (repo_url is null or (char_length(repo_url) <= 500 and repo_url ~ '^https://[^\s/$.?#][^\s]*$')),
  demo_url        text check (demo_url is null or (char_length(demo_url) <= 500 and demo_url ~ '^https://[^\s/$.?#][^\s]*$')),
  started_on      date,
  completed_on    date,
  seo_description text check (char_length(seo_description) <= 300),
  published_at    timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint projects_slug_key unique (slug),
  constraint projects_dates_check check (completed_on is null or started_on is null or completed_on >= started_on)
);
create index projects_status_order_idx on public.projects (status, sort_order);
create index projects_category_idx on public.projects (category_id);
create index projects_featured_idx on public.projects (sort_order) where status = 'published' and is_featured;

-- Stamp published_at the first time a project is published.
create or replace function public.projects_set_published_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status = 'published' and new.published_at is null then
    new.published_at = now();
  end if;
  return new;
end;
$$;

create table public.project_images (
  id           uuid primary key default gen_random_uuid(),
  project_id   uuid not null references public.projects (id) on delete cascade,
  storage_path text not null unique check (char_length(storage_path) <= 300),
  alt_text     text not null default '' check (char_length(alt_text) <= 200),
  caption      text check (char_length(caption) <= 300),
  -- true when the image is a designed mockup rather than a real screenshot;
  -- the public site labels these explicitly.
  is_mockup    boolean not null default false,
  sort_order   integer not null default 0,
  created_at   timestamptz not null default now()
);
create index project_images_project_idx on public.project_images (project_id, sort_order);

-- -----------------------------------------------------------------------------
-- Skills
-- -----------------------------------------------------------------------------
create table public.skill_categories (
  id         uuid primary key default gen_random_uuid(),
  name       text not null check (char_length(name) between 1 and 60),
  slug       text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(slug) <= 60),
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index skill_categories_name_key on public.skill_categories (lower(name));

create table public.skills (
  id               uuid primary key default gen_random_uuid(),
  name             text not null check (char_length(name) between 1 and 60),
  -- restrict: a category must be emptied before it can be removed
  category_id      uuid not null references public.skill_categories (id) on delete restrict,
  icon             text check (icon ~ '^[a-z0-9-]{1,40}$'),
  proficiency_note text check (char_length(proficiency_note) <= 160),
  sort_order       integer not null default 0,
  is_visible       boolean not null default true,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create unique index skills_name_key on public.skills (lower(name));
create index skills_category_idx on public.skills (category_id, sort_order);

-- Technology tags on projects reference skills.
create table public.project_skills (
  project_id uuid not null references public.projects (id) on delete cascade,
  skill_id   uuid not null references public.skills (id) on delete cascade,
  sort_order integer not null default 0,
  primary key (project_id, skill_id)
);
create index project_skills_skill_idx on public.project_skills (skill_id);

-- -----------------------------------------------------------------------------
-- Timeline: education, training, experience and certifications in one table.
-- Dates are optional so that nothing has to be invented.
-- -----------------------------------------------------------------------------
create table public.timeline_entries (
  id             uuid primary key default gen_random_uuid(),
  kind           public.timeline_kind not null,
  title          text not null check (char_length(title) between 1 and 160),
  organization   text not null check (char_length(organization) between 1 and 160),
  location       text check (char_length(location) <= 120),
  description    text check (char_length(description) <= 4000),
  start_date     date,
  end_date       date,
  is_current     boolean not null default false,
  credential_url text check (credential_url is null or (char_length(credential_url) <= 500 and credential_url ~ '^https://[^\s/$.?#][^\s]*$')),
  sort_order     integer not null default 0,
  is_visible     boolean not null default true,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  constraint timeline_dates_check check (end_date is null or start_date is null or end_date >= start_date),
  constraint timeline_current_check check (not (is_current and end_date is not null))
);
create index timeline_kind_order_idx on public.timeline_entries (kind, sort_order);

-- -----------------------------------------------------------------------------
-- Contact messages: inserted only through the contact Edge Function.
-- -----------------------------------------------------------------------------
create table public.contact_messages (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (char_length(name) between 1 and 100),
  email       text not null check (char_length(email) between 3 and 254 and email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  subject     text not null check (char_length(subject) between 1 and 150),
  message     text not null check (char_length(message) between 10 and 5000),
  is_read     boolean not null default false,
  is_archived boolean not null default false,
  ip_hash     text check (char_length(ip_hash) <= 128),
  user_agent  text check (char_length(user_agent) <= 300),
  created_at  timestamptz not null default now()
);
create index contact_messages_created_idx on public.contact_messages (created_at desc);
create index contact_messages_ip_idx on public.contact_messages (ip_hash, created_at);
create index contact_messages_unread_idx on public.contact_messages (created_at desc) where not is_read and not is_archived;

-- -----------------------------------------------------------------------------
-- Triggers
-- -----------------------------------------------------------------------------
create trigger set_updated_at before update on public.profile for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.social_links for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.site_settings for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.private_settings for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.project_categories for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.projects for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.skill_categories for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.skills for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.timeline_entries for each row execute function public.set_updated_at();
create trigger set_published_at before insert or update on public.projects for each row execute function public.projects_set_published_at();

-- -----------------------------------------------------------------------------
-- Singleton rows (editable from the admin panel).
-- -----------------------------------------------------------------------------
insert into public.profile (id, full_name, headline) values (1, 'Joud Chamaa', 'Full-Stack Developer / Software Developer');
insert into public.site_settings (id, site_title, site_description, footer_text)
values (1, 'Joud Chamaa — Full-Stack Developer', 'Portfolio of Joud Chamaa, a full-stack developer working with React, TypeScript, Laravel and MySQL.', null);
insert into public.private_settings (id) values (1);
