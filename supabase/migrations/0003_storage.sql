-- ─────────────────────────────────────────────────────────────────
-- EngiBoard · Storage bucket for screenshots
-- Migration: 0003
-- Date: 2026-05-03
-- ─────────────────────────────────────────────────────────────────
-- Bucket: 'screenshots' (private)
-- Path pattern: {user_id}/{task_id}/{shot_id}.{ext}
-- Access: authenticated user can read/write their own paths
-- ─────────────────────────────────────────────────────────────────

-- Create bucket (idempotent)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'screenshots',
  'screenshots',
  false,           -- private; access via signed URLs or RLS
  10485760,        -- 10 MB per file
  array['image/png', 'image/jpeg', 'image/webp']
)
on conflict (id) do update set
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- ─── RLS: storage.objects ───────────────────────────────────────
-- Users can only operate on objects under their own user_id prefix
-- Path: {user_id}/{task_id}/{filename}

drop policy if exists "screenshots_select_own" on storage.objects;
create policy "screenshots_select_own"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'screenshots'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "screenshots_insert_own" on storage.objects;
create policy "screenshots_insert_own"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'screenshots'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "screenshots_update_own" on storage.objects;
create policy "screenshots_update_own"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'screenshots'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "screenshots_delete_own" on storage.objects;
create policy "screenshots_delete_own"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'screenshots'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
