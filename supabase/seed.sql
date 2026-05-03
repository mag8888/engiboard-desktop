-- ─────────────────────────────────────────────────────────────────
-- EngiBoard · Demo seed data (optional)
-- Run AFTER signing in once via the app so auth.users has a row.
-- Replace YOUR_USER_ID with your actual auth.users.id (uuid).
-- ─────────────────────────────────────────────────────────────────

-- Find your user id:
-- select id, email from auth.users;

-- Example seed (commented out — uncomment + replace YOUR_USER_ID to use):

-- insert into public.projects (owner_id, name, code, color, sort_order) values
--   ('YOUR_USER_ID', 'Conveyor Line #12', 'CL-12', '#0EA5E9', 1),
--   ('YOUR_USER_ID', 'Welding Station #3', 'WS-3', '#F97316', 2),
--   ('YOUR_USER_ID', 'QC Inspection Bay', 'QC-1', '#22C55E', 3);

-- insert into public.tasks (project_id, week, status, title, sort_order)
-- select p.id, '26W17', 1, 'Initial site survey completed', 1
--   from public.projects p where p.code = 'CL-12';
