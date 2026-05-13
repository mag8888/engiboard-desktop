-- Migration 0010 — Align desktop schema to the EXISTING web app (Option D).
--
-- Real schema state (inspected via psql before writing this):
--   projects   — has columns: id, title, description, status (CHECK in 4 values),
--                priority, owner_id, created_at, updated_at, due_date,
--                cad_software, project_code, progress
--   tasks      — id, title, description, status (CHECK in 5 values), priority,
--                project_id, assignee_id, created_by, created_at, updated_at,
--                due_date, position, checklist, progress
--   profiles   — id, email, full_name, avatar_url, role (CHECK), department
--   project_members — id, project_id, user_id, role (default 'engineer'), joined_at
--   messages   — project-level chat (NOT per-task)
--   activity_logs, cad_files — already present
--
-- Strategy:
--   1. Widen tasks.status CHECK to accept all 8 desktop values
--   2. Widen projects.status CHECK to accept the union
--   3. Add desktop-specific columns (shot1_url, shot2_url, annotations…)
--   4. Add a trigger keeping web `status` and `desktop_status` in sync
--   5. Create `task_comments` for desktop's per-task chat (web's `messages`
--      is project-level so we don't repurpose it)
--   6. Create `image_comments` for pinned screenshot comments
--
-- All idempotent. Safe to re-run.

BEGIN;

-- ─────────────────────────────────────────────────────────────────
-- 1. Widen status CHECK constraints to fit both web + desktop vocab
-- ─────────────────────────────────────────────────────────────────
ALTER TABLE tasks DROP CONSTRAINT IF EXISTS tasks_status_check;
ALTER TABLE tasks ADD CONSTRAINT tasks_status_check
  CHECK (status = ANY (ARRAY[
    -- web app's existing values
    'todo','in_progress','review','done','blocked',
    -- desktop additions
    'info','not_relevant','info_required','problem','upcoming','completed','cancelled'
  ]));

ALTER TABLE projects DROP CONSTRAINT IF EXISTS projects_status_check;
ALTER TABLE projects ADD CONSTRAINT projects_status_check
  CHECK (status = ANY (ARRAY[
    'active','on_hold','completed','cancelled',
    'planning','archived'
  ]));

-- ─────────────────────────────────────────────────────────────────
-- 2. PROJECTS — add columns desktop reads / writes
-- ─────────────────────────────────────────────────────────────────
ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS client     TEXT,
  ADD COLUMN IF NOT EXISTS sort_order INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS archived   BOOLEAN DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_projects_archived_sort
  ON projects(archived, sort_order);

-- ─────────────────────────────────────────────────────────────────
-- 3. TASKS — desktop-specific columns
-- ─────────────────────────────────────────────────────────────────
ALTER TABLE tasks
  ADD COLUMN IF NOT EXISTS shot1_url      TEXT,
  ADD COLUMN IF NOT EXISTS shot2_url      TEXT,
  ADD COLUMN IF NOT EXISTS shots_extra    JSONB DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS desktop_status SMALLINT DEFAULT 7,
  ADD COLUMN IF NOT EXISTS annotations    JSONB DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS week_tag       TEXT,
  ADD COLUMN IF NOT EXISTS sort_order     INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS time_min       INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS timer_start    TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_tasks_project_sort   ON tasks(project_id, sort_order);
CREATE INDEX IF NOT EXISTS idx_tasks_desktop_status ON tasks(desktop_status);
CREATE INDEX IF NOT EXISTS idx_tasks_search
  ON tasks USING GIN(to_tsvector('simple', coalesce(title,'') || ' ' || coalesce(description,'')));

-- ─────────────────────────────────────────────────────────────────
-- 4. Status sync trigger (web text ↔ desktop int)
-- ─────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION sync_task_status()
RETURNS TRIGGER AS $$
BEGIN
  -- TEXT → INT: when web writes `status`, mirror into desktop_status
  IF NEW.status IS NOT NULL
     AND (TG_OP = 'INSERT' OR NEW.status IS DISTINCT FROM OLD.status) THEN
    NEW.desktop_status := CASE lower(NEW.status)
      WHEN 'info'           THEN 0
      WHEN 'done'           THEN 1
      WHEN 'completed'      THEN 1
      WHEN 'not_relevant'   THEN 2
      WHEN 'cancelled'      THEN 2
      WHEN 'review'         THEN 3
      WHEN 'info_required'  THEN 4
      WHEN 'blocked'        THEN 4
      WHEN 'problem'        THEN 5
      WHEN 'in_progress'    THEN 6
      WHEN 'upcoming'       THEN 7
      WHEN 'todo'           THEN 7
      ELSE 7
    END;
  END IF;

  -- INT → TEXT: when desktop writes desktop_status, mirror into status
  IF NEW.desktop_status IS NOT NULL
     AND (TG_OP = 'INSERT' OR NEW.desktop_status IS DISTINCT FROM OLD.desktop_status)
     AND (NEW.status IS NULL OR NEW.status = OLD.status) THEN
    NEW.status := CASE NEW.desktop_status
      WHEN 0 THEN 'info'
      WHEN 1 THEN 'done'
      WHEN 2 THEN 'not_relevant'
      WHEN 3 THEN 'review'
      WHEN 4 THEN 'info_required'
      WHEN 5 THEN 'problem'
      WHEN 6 THEN 'in_progress'
      WHEN 7 THEN 'upcoming'
      ELSE 'upcoming'
    END;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_sync_task_status ON tasks;
CREATE TRIGGER trg_sync_task_status
  BEFORE INSERT OR UPDATE OF status, desktop_status ON tasks
  FOR EACH ROW EXECUTE FUNCTION sync_task_status();

-- Backfill desktop_status for rows where it's still the default 7 but
-- the text status implies a different value.
UPDATE tasks
   SET desktop_status = CASE lower(coalesce(status,''))
     WHEN 'info'           THEN 0
     WHEN 'done'           THEN 1
     WHEN 'completed'      THEN 1
     WHEN 'not_relevant'   THEN 2
     WHEN 'cancelled'      THEN 2
     WHEN 'review'         THEN 3
     WHEN 'info_required'  THEN 4
     WHEN 'blocked'        THEN 4
     WHEN 'problem'        THEN 5
     WHEN 'in_progress'    THEN 6
     WHEN 'upcoming'       THEN 7
     ELSE 7
   END
 WHERE desktop_status IS NULL OR desktop_status = 7;

-- ─────────────────────────────────────────────────────────────────
-- 5. TASK_COMMENTS — desktop's per-task inline chat
-- ─────────────────────────────────────────────────────────────────
-- Web app's existing `messages` table is project-scoped (not per-task), so
-- we add a separate table here.
CREATE TABLE IF NOT EXISTS task_comments (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id     UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  author_id   UUID REFERENCES profiles(id) ON DELETE SET NULL,
  body        TEXT NOT NULL,
  created_at  TIMESTAMPTZ DEFAULT now(),
  edited_at   TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_task_comments_task_created
  ON task_comments(task_id, created_at);

-- ─────────────────────────────────────────────────────────────────
-- 6. IMAGE_COMMENTS — pinned comments on a screenshot coordinate
-- ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS image_comments (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id     UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  slot        SMALLINT NOT NULL,
  x           REAL    NOT NULL,
  y           REAL    NOT NULL,
  author_id   UUID REFERENCES profiles(id) ON DELETE SET NULL,
  body        TEXT NOT NULL,
  created_at  TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_image_comments_task_slot
  ON image_comments(task_id, slot);

-- ─────────────────────────────────────────────────────────────────
-- 7. project_members already exists — just make sure owner is auto-added
-- ─────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION ensure_project_owner_member()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.owner_id IS NOT NULL THEN
    INSERT INTO project_members(project_id, user_id, role)
      VALUES (NEW.id, NEW.owner_id, 'admin')
      ON CONFLICT (project_id, user_id) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_project_owner_member ON projects;
CREATE TRIGGER trg_project_owner_member
  AFTER INSERT ON projects
  FOR EACH ROW EXECUTE FUNCTION ensure_project_owner_member();

COMMIT;
