-- ─────────────────────────────────────────────────────────────────
-- EngiBoard · Row-Level Security policies
-- Migration: 0002
-- Date: 2026-05-03
-- ─────────────────────────────────────────────────────────────────
-- Strategy: in v1 each user only sees their own data.
-- Project sharing / team workspaces (P1-4) come in S4 — separate migration.
-- ─────────────────────────────────────────────────────────────────

-- ─── enable RLS on all tables ────────────────────────────────────
alter table public.profiles        enable row level security;
alter table public.projects        enable row level security;
alter table public.tasks           enable row level security;
alter table public.comments        enable row level security;
alter table public.image_comments  enable row level security;

-- ─── profiles ───────────────────────────────────────────────────
-- Anyone authenticated can read all profiles (so we can show authors)
drop policy if exists "profiles_read_all" on public.profiles;
create policy "profiles_read_all"
  on public.profiles for select
  to authenticated
  using (true);

-- Only the user themselves can update their profile
drop policy if exists "profiles_update_self" on public.profiles;
create policy "profiles_update_self"
  on public.profiles for update
  to authenticated
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- ─── projects ───────────────────────────────────────────────────
drop policy if exists "projects_read_own" on public.projects;
create policy "projects_read_own"
  on public.projects for select
  to authenticated
  using (auth.uid() = owner_id);

drop policy if exists "projects_insert_own" on public.projects;
create policy "projects_insert_own"
  on public.projects for insert
  to authenticated
  with check (auth.uid() = owner_id);

drop policy if exists "projects_update_own" on public.projects;
create policy "projects_update_own"
  on public.projects for update
  to authenticated
  using (auth.uid() = owner_id)
  with check (auth.uid() = owner_id);

drop policy if exists "projects_delete_own" on public.projects;
create policy "projects_delete_own"
  on public.projects for delete
  to authenticated
  using (auth.uid() = owner_id);

-- ─── tasks ──────────────────────────────────────────────────────
-- Owner of project can do everything with its tasks
drop policy if exists "tasks_read_via_project" on public.tasks;
create policy "tasks_read_via_project"
  on public.tasks for select
  to authenticated
  using (
    exists (
      select 1 from public.projects p
      where p.id = tasks.project_id and p.owner_id = auth.uid()
    )
  );

drop policy if exists "tasks_insert_via_project" on public.tasks;
create policy "tasks_insert_via_project"
  on public.tasks for insert
  to authenticated
  with check (
    exists (
      select 1 from public.projects p
      where p.id = tasks.project_id and p.owner_id = auth.uid()
    )
  );

drop policy if exists "tasks_update_via_project" on public.tasks;
create policy "tasks_update_via_project"
  on public.tasks for update
  to authenticated
  using (
    exists (
      select 1 from public.projects p
      where p.id = tasks.project_id and p.owner_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.projects p
      where p.id = tasks.project_id and p.owner_id = auth.uid()
    )
  );

drop policy if exists "tasks_delete_via_project" on public.tasks;
create policy "tasks_delete_via_project"
  on public.tasks for delete
  to authenticated
  using (
    exists (
      select 1 from public.projects p
      where p.id = tasks.project_id and p.owner_id = auth.uid()
    )
  );

-- ─── comments ───────────────────────────────────────────────────
-- Project owner can read/write all comments on their tasks
-- Author can edit their own comments
drop policy if exists "comments_read_via_task" on public.comments;
create policy "comments_read_via_task"
  on public.comments for select
  to authenticated
  using (
    exists (
      select 1 from public.tasks t
        join public.projects p on p.id = t.project_id
      where t.id = comments.task_id and p.owner_id = auth.uid()
    )
  );

drop policy if exists "comments_insert_self" on public.comments;
create policy "comments_insert_self"
  on public.comments for insert
  to authenticated
  with check (
    auth.uid() = author_id
    and exists (
      select 1 from public.tasks t
        join public.projects p on p.id = t.project_id
      where t.id = comments.task_id and p.owner_id = auth.uid()
    )
  );

drop policy if exists "comments_update_self" on public.comments;
create policy "comments_update_self"
  on public.comments for update
  to authenticated
  using (auth.uid() = author_id)
  with check (auth.uid() = author_id);

drop policy if exists "comments_delete_self" on public.comments;
create policy "comments_delete_self"
  on public.comments for delete
  to authenticated
  using (auth.uid() = author_id);

-- ─── image_comments ─────────────────────────────────────────────
drop policy if exists "image_comments_read_via_task" on public.image_comments;
create policy "image_comments_read_via_task"
  on public.image_comments for select
  to authenticated
  using (
    exists (
      select 1 from public.tasks t
        join public.projects p on p.id = t.project_id
      where t.id = image_comments.task_id and p.owner_id = auth.uid()
    )
  );

drop policy if exists "image_comments_insert_self" on public.image_comments;
create policy "image_comments_insert_self"
  on public.image_comments for insert
  to authenticated
  with check (
    auth.uid() = author_id
    and exists (
      select 1 from public.tasks t
        join public.projects p on p.id = t.project_id
      where t.id = image_comments.task_id and p.owner_id = auth.uid()
    )
  );

drop policy if exists "image_comments_delete_self" on public.image_comments;
create policy "image_comments_delete_self"
  on public.image_comments for delete
  to authenticated
  using (auth.uid() = author_id);
