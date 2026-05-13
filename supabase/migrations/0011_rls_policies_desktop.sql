-- Migration 0011 — RLS policies for unified schema.
-- Builds on 0010. Assumes project_members(project_id, user_id, role) exists.
--
-- Web app's existing policies on projects/tasks/messages are "USING (true)"
-- — fully open to authenticated users. We REPLACE those with strict project-
-- membership scoping so the desktop client doesn't accidentally show every
-- user's data.

BEGIN;

ALTER TABLE projects        ENABLE ROW LEVEL SECURITY;
ALTER TABLE tasks           ENABLE ROW LEVEL SECURITY;
ALTER TABLE task_comments   ENABLE ROW LEVEL SECURITY;
ALTER TABLE image_comments  ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_members ENABLE ROW LEVEL SECURITY;

-- ── helper functions ──
CREATE OR REPLACE FUNCTION is_project_member(p_id UUID)
RETURNS BOOLEAN
LANGUAGE SQL SECURITY DEFINER SET search_path = public STABLE
AS $$
  SELECT EXISTS(
    SELECT 1 FROM project_members
     WHERE project_id = p_id
       AND user_id    = auth.uid()
  );
$$;

CREATE OR REPLACE FUNCTION project_role(p_id UUID)
RETURNS TEXT
LANGUAGE SQL SECURITY DEFINER SET search_path = public STABLE
AS $$
  SELECT role FROM project_members
   WHERE project_id = p_id AND user_id = auth.uid()
   LIMIT 1;
$$;

-- ─────────────────────────────────────────────────────────────────
-- PROJECTS  (replace web's open policies)
-- ─────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "read projects"   ON projects;
DROP POLICY IF EXISTS "insert projects" ON projects;
DROP POLICY IF EXISTS "update projects" ON projects;
DROP POLICY IF EXISTS projects_select_member  ON projects;
DROP POLICY IF EXISTS projects_insert_self    ON projects;
DROP POLICY IF EXISTS projects_update_member  ON projects;
DROP POLICY IF EXISTS projects_delete_admin   ON projects;

CREATE POLICY projects_select_member ON projects
  FOR SELECT USING ( is_project_member(id) OR owner_id = auth.uid() );

CREATE POLICY projects_insert_self ON projects
  FOR INSERT WITH CHECK ( owner_id = auth.uid() );

CREATE POLICY projects_update_member ON projects
  FOR UPDATE USING ( is_project_member(id) );

CREATE POLICY projects_delete_admin ON projects
  FOR DELETE USING ( project_role(id) IN ('admin','lead_engineer') OR owner_id = auth.uid() );

-- ─────────────────────────────────────────────────────────────────
-- TASKS
-- ─────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "read tasks"   ON tasks;
DROP POLICY IF EXISTS "insert tasks" ON tasks;
DROP POLICY IF EXISTS "delete tasks" ON tasks;
DROP POLICY IF EXISTS tasks_select_member  ON tasks;
DROP POLICY IF EXISTS tasks_insert_member  ON tasks;
DROP POLICY IF EXISTS tasks_update_member  ON tasks;
DROP POLICY IF EXISTS tasks_delete_member  ON tasks;

CREATE POLICY tasks_select_member ON tasks
  FOR SELECT USING ( is_project_member(project_id) );

CREATE POLICY tasks_insert_member ON tasks
  FOR INSERT WITH CHECK ( is_project_member(project_id) );

CREATE POLICY tasks_update_member ON tasks
  FOR UPDATE USING ( is_project_member(project_id) );

CREATE POLICY tasks_delete_member ON tasks
  FOR DELETE USING ( project_role(project_id) IN ('admin','lead_engineer') );

-- ─────────────────────────────────────────────────────────────────
-- TASK_COMMENTS
-- ─────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS task_comments_select         ON task_comments;
DROP POLICY IF EXISTS task_comments_insert_self    ON task_comments;
DROP POLICY IF EXISTS task_comments_update_self    ON task_comments;
DROP POLICY IF EXISTS task_comments_delete         ON task_comments;

CREATE POLICY task_comments_select ON task_comments
  FOR SELECT USING (
    EXISTS(SELECT 1 FROM tasks t WHERE t.id = task_comments.task_id AND is_project_member(t.project_id))
  );

CREATE POLICY task_comments_insert_self ON task_comments
  FOR INSERT WITH CHECK (
    author_id = auth.uid()
    AND EXISTS(SELECT 1 FROM tasks t WHERE t.id = task_comments.task_id AND is_project_member(t.project_id))
  );

CREATE POLICY task_comments_update_self ON task_comments
  FOR UPDATE USING ( author_id = auth.uid() );

CREATE POLICY task_comments_delete ON task_comments
  FOR DELETE USING (
    author_id = auth.uid()
    OR EXISTS(SELECT 1 FROM tasks t WHERE t.id = task_comments.task_id AND project_role(t.project_id) IN ('admin','lead_engineer'))
  );

-- ─────────────────────────────────────────────────────────────────
-- IMAGE_COMMENTS
-- ─────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS image_comments_select        ON image_comments;
DROP POLICY IF EXISTS image_comments_insert_self   ON image_comments;
DROP POLICY IF EXISTS image_comments_update_self   ON image_comments;
DROP POLICY IF EXISTS image_comments_delete        ON image_comments;

CREATE POLICY image_comments_select ON image_comments
  FOR SELECT USING (
    EXISTS(SELECT 1 FROM tasks t WHERE t.id = image_comments.task_id AND is_project_member(t.project_id))
  );

CREATE POLICY image_comments_insert_self ON image_comments
  FOR INSERT WITH CHECK (
    author_id = auth.uid()
    AND EXISTS(SELECT 1 FROM tasks t WHERE t.id = image_comments.task_id AND is_project_member(t.project_id))
  );

CREATE POLICY image_comments_update_self ON image_comments
  FOR UPDATE USING ( author_id = auth.uid() );

CREATE POLICY image_comments_delete ON image_comments
  FOR DELETE USING (
    author_id = auth.uid()
    OR EXISTS(SELECT 1 FROM tasks t WHERE t.id = image_comments.task_id AND project_role(t.project_id) IN ('admin','lead_engineer'))
  );

-- ─────────────────────────────────────────────────────────────────
-- PROJECT_MEMBERS
-- ─────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "read members"   ON project_members;
DROP POLICY IF EXISTS "insert members" ON project_members;
DROP POLICY IF EXISTS project_members_select  ON project_members;
DROP POLICY IF EXISTS project_members_insert  ON project_members;
DROP POLICY IF EXISTS project_members_delete  ON project_members;

CREATE POLICY project_members_select ON project_members
  FOR SELECT USING ( user_id = auth.uid() OR is_project_member(project_id) );

CREATE POLICY project_members_insert ON project_members
  FOR INSERT WITH CHECK (
    project_role(project_id) IN ('admin','lead_engineer')
    OR EXISTS(SELECT 1 FROM projects p WHERE p.id = project_members.project_id AND p.owner_id = auth.uid())
  );

CREATE POLICY project_members_delete ON project_members
  FOR DELETE USING (
    project_role(project_id) IN ('admin','lead_engineer')
    OR user_id = auth.uid()
  );

COMMIT;
