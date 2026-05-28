-- 0014_public_task_token.sql
-- Public, anonymous read-only access to a task by an unguessable share token.
-- Lets the desktop/web app generate a shareable URL for clients without
-- requiring login. Applied via Supabase Management API on 2026-05-27.

-- 1. Token column (DEFAULT fills existing rows row-by-row on PG 11+).
ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS public_token UUID DEFAULT gen_random_uuid();

-- Backfill for any row missed by the DEFAULT (older PG, etc.).
UPDATE public.tasks SET public_token = gen_random_uuid() WHERE public_token IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_tasks_public_token ON public.tasks(public_token);

-- 2. SECURITY DEFINER reader: bypass RLS but expose only display-safe columns.
-- Returns at most one task plus its project title/code.
CREATE OR REPLACE FUNCTION public.get_task_by_token(p_token UUID)
RETURNS TABLE (
  id UUID, title TEXT, description TEXT, status TEXT, desktop_status SMALLINT,
  project_id UUID, project_title TEXT, project_code TEXT,
  shot1_url TEXT, shot2_url TEXT, shots_extra JSONB,
  annotations JSONB, checklist JSONB,
  created_at TIMESTAMPTZ, updated_at TIMESTAMPTZ
)
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT t.id, t.title, t.description, t.status, t.desktop_status,
         t.project_id, p.title AS project_title, p.project_code,
         t.shot1_url, t.shot2_url, t.shots_extra,
         t.annotations, t.checklist,
         t.created_at, t.updated_at
  FROM public.tasks t
  LEFT JOIN public.projects p ON p.id = t.project_id
  WHERE t.public_token = p_token
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.get_task_by_token(UUID) TO anon, authenticated;
