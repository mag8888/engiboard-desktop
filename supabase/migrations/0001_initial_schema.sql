-- ─────────────────────────────────────────────────────────────────
-- EngiBoard · Initial schema
-- Migration: 0001
-- Date: 2026-05-03
-- Sprint: S2 P0-3 (Real Supabase persistence)
-- ─────────────────────────────────────────────────────────────────
-- Tables: profiles, projects, tasks, comments, image_comments
-- Auth: leverages auth.users from Supabase Auth (Google OAuth)
-- ─────────────────────────────────────────────────────────────────

-- ─── extensions ─────────────────────────────────────────────────
create extension if not exists "uuid-ossp";

-- ─── profiles ───────────────────────────────────────────────────
-- Extension of auth.users for public-facing user info.
create table if not exists public.profiles (
  id              uuid primary key references auth.users(id) on delete cascade,
  email           text unique not null,
  display_name    text,
  initials        text,                   -- e.g., 'AS' for Aleksey Stepikin
  avatar_color    text default '#0EA5E9', -- hex, used for avatar background
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- Auto-create profile on new auth.user signup
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, email, display_name, initials)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)),
    upper(substring(coalesce(new.raw_user_meta_data->>'full_name', new.email), 1, 1)) ||
      upper(substring(split_part(coalesce(new.raw_user_meta_data->>'full_name', new.email), ' ', 2), 1, 1))
  )
  on conflict (id) do nothing;
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ─── projects ───────────────────────────────────────────────────
create table if not exists public.projects (
  id              uuid primary key default uuid_generate_v4(),
  owner_id        uuid not null references public.profiles(id) on delete cascade,
  name            text not null,
  code            text,                   -- short code like 'CL-12'
  color           text default '#0EA5E9', -- hex, project accent color
  sort_order      integer default 0,
  archived        boolean default false,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists projects_owner_idx on public.projects(owner_id);
create index if not exists projects_sort_idx on public.projects(owner_id, sort_order);

-- ─── tasks ──────────────────────────────────────────────────────
create table if not exists public.tasks (
  id              uuid primary key default uuid_generate_v4(),
  project_id      uuid not null references public.projects(id) on delete cascade,
  week            text,                   -- e.g., '26W17'
  status          smallint not null default 0,  -- 0..7 (see STATUSES in index.html)
  title           text not null,
  notes           text,
  shot1_url       text,                   -- Supabase Storage URL (or null)
  shot2_url       text,                   -- Supabase Storage URL (or null)
  extra_shot_urls text[] default '{}',    -- additional Storage URLs
  height          integer default 90,     -- row height in px
  sort_order      integer default 0,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists tasks_project_idx on public.tasks(project_id);
create index if not exists tasks_project_sort_idx on public.tasks(project_id, sort_order);
create index if not exists tasks_status_idx on public.tasks(status);

-- ─── comments ───────────────────────────────────────────────────
-- Plain text chat messages on a task
create table if not exists public.comments (
  id              uuid primary key default uuid_generate_v4(),
  task_id         uuid not null references public.tasks(id) on delete cascade,
  author_id       uuid not null references public.profiles(id) on delete set null,
  text            text not null,
  created_at      timestamptz not null default now()
);

create index if not exists comments_task_idx on public.comments(task_id, created_at);

-- ─── image_comments ─────────────────────────────────────────────
-- Pin-style comments anchored to a position on a screenshot
-- (used in lightbox + slideshow with B-17 pin system)
create table if not exists public.image_comments (
  id              uuid primary key default uuid_generate_v4(),
  task_id         uuid not null references public.tasks(id) on delete cascade,
  shot_index      smallint not null default 0,
    -- 0=shot1 (BEFORE), 1=shot2 (AFTER), 2+=extra_shot_urls[shot_index-2]
  x_pct           numeric(5,2) not null check (x_pct >= 0 and x_pct <= 100),
  y_pct           numeric(5,2) not null check (y_pct >= 0 and y_pct <= 100),
  author_id       uuid not null references public.profiles(id) on delete set null,
  text            text not null,
  created_at      timestamptz not null default now()
);

create index if not exists image_comments_task_idx on public.image_comments(task_id, shot_index);

-- ─── updated_at triggers ────────────────────────────────────────
create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists projects_updated_at on public.projects;
create trigger projects_updated_at before update on public.projects
  for each row execute function public.set_updated_at();

drop trigger if exists tasks_updated_at on public.tasks;
create trigger tasks_updated_at before update on public.tasks
  for each row execute function public.set_updated_at();

drop trigger if exists profiles_updated_at on public.profiles;
create trigger profiles_updated_at before update on public.profiles
  for each row execute function public.set_updated_at();
