/**
 * In-process Postgres (PGlite) harness that mimics the parts of a Supabase
 * database the migrations depend on — the anon/authenticated/service_role
 * roles, auth.uid(), auth.users, storage.buckets/objects and Supabase's
 * default "grant all to API roles" privileges — then applies the real
 * migration files from supabase/migrations in order.
 *
 * This lets RLS policies, grants, constraints and RPCs be tested exactly as
 * written, without Docker or a hosted project.
 */
import { PGlite } from '@electric-sql/pglite'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('../..', import.meta.url))
export const migrationsDir = join(root, 'supabase/migrations')

const SUPABASE_BOOTSTRAP = /* sql */ `
  create role anon nologin noinherit;
  create role authenticated nologin noinherit;
  create role service_role nologin noinherit bypassrls;

  create schema auth;
  create table auth.users (
    id uuid primary key,
    email text unique,
    raw_user_meta_data jsonb not null default '{}'
  );
  create function auth.uid() returns uuid language sql stable as $$
    select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
  $$;
  grant usage on schema auth to anon, authenticated, service_role;
  grant execute on all functions in schema auth to anon, authenticated, service_role;

  create schema storage;
  create table storage.buckets (
    id text primary key,
    name text not null unique,
    public boolean default false,
    file_size_limit bigint,
    allowed_mime_types text[],
    created_at timestamptz default now(),
    updated_at timestamptz default now()
  );
  create table storage.objects (
    id uuid primary key default gen_random_uuid(),
    bucket_id text references storage.buckets (id),
    name text,
    owner uuid,
    metadata jsonb,
    created_at timestamptz default now(),
    unique (bucket_id, name)
  );
  alter table storage.objects enable row level security;
  alter table storage.buckets enable row level security;
  grant usage on schema storage to anon, authenticated, service_role;
  grant all on storage.objects, storage.buckets to anon, authenticated, service_role;

  grant usage on schema public to anon, authenticated, service_role;
  alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
  alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
  alter default privileges in schema public grant execute on functions to anon, authenticated, service_role;
`

export function migrationFiles(): string[] {
  return readdirSync(migrationsDir)
    .filter((f) => f.endsWith('.sql'))
    .sort()
}

export async function createDatabase(options: { seed?: boolean } = {}): Promise<PGlite> {
  const db = new PGlite()
  await db.exec(SUPABASE_BOOTSTRAP)
  for (const file of migrationFiles()) {
    await db.exec(readFileSync(join(migrationsDir, file), 'utf8'))
  }
  if (options.seed) {
    await db.exec(readFileSync(join(root, 'supabase/seed.sql'), 'utf8'))
  }
  return db
}

export type Actor =
  | { role: 'anon' }
  | { role: 'authenticated'; userId: string }
  | { role: 'service_role' }

/** Runs `fn` with the session switched to the given API role / user. */
export async function as<T>(db: PGlite, actor: Actor, fn: () => Promise<T>): Promise<T> {
  const sub = actor.role === 'authenticated' ? actor.userId : ''
  await db.query(`select set_config('request.jwt.claim.sub', $1, false)`, [sub])
  await db.exec(`set role ${actor.role}`)
  try {
    return await fn()
  } finally {
    await db.exec('reset role')
    await db.query(`select set_config('request.jwt.claim.sub', '', false)`)
  }
}

export async function createUser(db: PGlite, id: string, email: string, admin = false) {
  await db.query('insert into auth.users (id, email) values ($1, $2)', [id, email])
  if (admin) await db.query('insert into public.admins (user_id) values ($1)', [id])
}
