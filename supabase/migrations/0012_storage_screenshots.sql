-- Migration 0012 — Storage bucket for screenshots.
-- Path convention: {user_id}/{task_id}/{shot_id}.png
-- Visibility: private (signed URLs only).
-- RLS: a user can read/write under their own user_id prefix AND under any
-- project they're a member of. Files outside both → denied.

BEGIN;

-- Bucket itself (idempotent)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('screenshots', 'screenshots', false, 20971520, ARRAY['image/png','image/jpeg','image/webp'])
ON CONFLICT (id) DO UPDATE SET
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- Policy helpers — re-use is_project_member from 0011, plus a parser for the
-- task_id segment in the path.
CREATE OR REPLACE FUNCTION storage_path_task_id(path TEXT)
RETURNS UUID
LANGUAGE SQL IMMUTABLE
AS $$
  SELECT
    CASE WHEN split_part(path, '/', 2) ~ '^[0-9a-f-]{36}$'
         THEN split_part(path, '/', 2)::UUID
         ELSE NULL
    END;
$$;

-- ─────────────────────────────────────────────────────────────────
-- SELECT — any project member can read shots referenced by their tasks
-- ─────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS screenshots_select ON storage.objects;
CREATE POLICY screenshots_select ON storage.objects
  FOR SELECT
  USING (
    bucket_id = 'screenshots'
    AND (
      -- owner of the file (uploader's user_id is path[1])
      (storage.foldername(name))[1] = auth.uid()::TEXT
      OR
      -- file belongs to a task in a project the user is a member of
      EXISTS(
        SELECT 1 FROM tasks t
         WHERE t.id = storage_path_task_id(name)
           AND is_project_member(t.project_id)
      )
    )
  );

-- ─────────────────────────────────────────────────────────────────
-- INSERT — user can upload under their own user_id prefix AND the target task
-- belongs to a project they can write in (member/admin/owner).
-- ─────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS screenshots_insert ON storage.objects;
CREATE POLICY screenshots_insert ON storage.objects
  FOR INSERT
  WITH CHECK (
    bucket_id = 'screenshots'
    AND (storage.foldername(name))[1] = auth.uid()::TEXT
    AND EXISTS(
      SELECT 1 FROM tasks t
       WHERE t.id = storage_path_task_id(name)
         AND project_role(t.project_id) IN ('owner','admin','member')
    )
  );

-- ─────────────────────────────────────────────────────────────────
-- UPDATE — same as INSERT
-- ─────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS screenshots_update ON storage.objects;
CREATE POLICY screenshots_update ON storage.objects
  FOR UPDATE
  USING (
    bucket_id = 'screenshots'
    AND (storage.foldername(name))[1] = auth.uid()::TEXT
  );

-- ─────────────────────────────────────────────────────────────────
-- DELETE — uploader OR project owner/admin
-- ─────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS screenshots_delete ON storage.objects;
CREATE POLICY screenshots_delete ON storage.objects
  FOR DELETE
  USING (
    bucket_id = 'screenshots'
    AND (
      (storage.foldername(name))[1] = auth.uid()::TEXT
      OR EXISTS(
        SELECT 1 FROM tasks t
         WHERE t.id = storage_path_task_id(name)
           AND project_role(t.project_id) IN ('owner','admin')
      )
    )
  );

COMMIT;
