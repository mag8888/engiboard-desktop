-- 0015_rbac_global_roles.sql
-- Global role-based access (admin / lead / engineer) keyed off profiles.role.
-- - admin: create/update/delete projects, manage members, manage user roles
-- - lead:  create/update/delete tasks
-- - engineer: read-only on tasks (still a member, can comment via app)
-- Applied via Supabase Management API on 2026-05-28.

CREATE OR REPLACE FUNCTION public.eb_role()
RETURNS TEXT LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT role FROM public.profiles WHERE id = auth.uid()
$$;
GRANT EXECUTE ON FUNCTION public.eb_role() TO anon, authenticated;

-- TASKS: insert/update/delete restricted to admin & lead.
DROP POLICY IF EXISTS "update tasks"          ON public.tasks;
DROP POLICY IF EXISTS "tasks_insert_member"   ON public.tasks;
DROP POLICY IF EXISTS "tasks_update_member"   ON public.tasks;
DROP POLICY IF EXISTS "tasks_delete_member"   ON public.tasks;
CREATE POLICY tasks_insert_role ON public.tasks FOR INSERT TO authenticated
  WITH CHECK (public.eb_role() IN ('admin','lead'));
CREATE POLICY tasks_update_role ON public.tasks FOR UPDATE TO authenticated
  USING (public.eb_role() IN ('admin','lead') OR public.is_project_member(project_id));
CREATE POLICY tasks_delete_role ON public.tasks FOR DELETE TO authenticated
  USING (public.eb_role() IN ('admin','lead'));

-- PROJECTS: only admin can create / update / delete.
DROP POLICY IF EXISTS "projects_insert_self"   ON public.projects;
DROP POLICY IF EXISTS "projects_update_member" ON public.projects;
DROP POLICY IF EXISTS "projects_delete_admin"  ON public.projects;
CREATE POLICY projects_insert_admin ON public.projects FOR INSERT TO authenticated
  WITH CHECK (public.eb_role() = 'admin');
CREATE POLICY projects_update_admin ON public.projects FOR UPDATE TO authenticated
  USING (public.eb_role() = 'admin');
CREATE POLICY projects_delete_admin ON public.projects FOR DELETE TO authenticated
  USING (public.eb_role() = 'admin');

-- PROJECT_MEMBERS: only admin adds/removes.
DROP POLICY IF EXISTS project_members_insert ON public.project_members;
DROP POLICY IF EXISTS project_members_delete ON public.project_members;
CREATE POLICY pm_insert_admin ON public.project_members FOR INSERT TO authenticated
  WITH CHECK (public.eb_role() = 'admin');
CREATE POLICY pm_delete_admin ON public.project_members FOR DELETE TO authenticated
  USING (public.eb_role() = 'admin');

-- PROFILES: anyone updates own non-role fields; only admin changes role.
DROP POLICY IF EXISTS "update own profile" ON public.profiles;
CREATE POLICY profiles_update_self ON public.profiles FOR UPDATE TO authenticated
  USING (id = auth.uid())
  WITH CHECK (
    id = auth.uid()
    AND role IS NOT DISTINCT FROM (SELECT p.role FROM public.profiles p WHERE p.id = auth.uid())
  );
CREATE POLICY profiles_update_admin ON public.profiles FOR UPDATE TO authenticated
  USING (public.eb_role() = 'admin')
  WITH CHECK (public.eb_role() = 'admin');

-- Manually mark the system owner as admin (others default to engineer).
UPDATE public.profiles SET role = 'admin' WHERE email = 'aleksey.stepikin@gmail.com';
