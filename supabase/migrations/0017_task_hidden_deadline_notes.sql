-- 0017_task_hidden_deadline_notes.sql
-- New per-task fields introduced in v0.1.142..v0.1.147:
--   hidden   — internal stash (kebab menu "Hide (internal)") so the user
--              can park questions/bugs out of the main list
--   deadline — date shown as a red chip next to the assignee, white-on-red
--              when overdue (set via "Set deadline" in the kebab menu)
--   notes    — free-form text from the new Notes pane in presentation mode
-- All three are optional; existing rows default to NULL / false.
ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS hidden   boolean      NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS deadline date,
  ADD COLUMN IF NOT EXISTS notes    text;

-- Optional: speed up the "show hidden tasks" toggle for very large projects.
CREATE INDEX IF NOT EXISTS tasks_hidden_idx ON public.tasks(project_id) WHERE hidden = false;
