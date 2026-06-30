-- 0022_task_checklist_links.sql
--
-- The desktop app has long written per-task checklist items and external links
-- back to Supabase via db.tasks.update({ checklist }) / ({ links }), but the
-- `tasks` table never had columns for them. Those updates were rejected by
-- Postgres ("column does not exist") and silently swallowed by the .catch(()=>{})
-- wrappers, so:
--   * a checklist / links created in the cloud-backed app vanished on reload
--     (loadFromSupabase rebuilds TASKS from the row, which had no such data);
--   * undo-restore of a deleted cloud task failed entirely, because its INSERT
--     payload included these phantom columns and the whole row insert was rejected.
--
-- Add the columns so both round-trip. JSONB arrays, matching the in-memory shape
-- ([{id,text,done}] for checklist, [{id,url,title,type}] for links).

alter table public.tasks
  add column if not exists checklist jsonb not null default '[]'::jsonb,
  add column if not exists links     jsonb not null default '[]'::jsonb;
