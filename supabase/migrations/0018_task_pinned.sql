-- 0018_task_pinned.sql
-- v0.1.152 (#17 reported by DB): tasks can be pinned so they stay at the
-- top of the list and appear in a dedicated Pinned sidebar section. The
-- partial index speeds up the "all pinned across the project" query that
-- the sidebar uses to render counts and the picker view.
ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS pinned boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS tasks_pinned_idx ON public.tasks(project_id, pinned) WHERE pinned = true;
