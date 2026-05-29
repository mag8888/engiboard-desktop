-- 0016_profiles_role_check_align.sql
-- The original profiles_role_check used 'lead_engineer'/'viewer' values left
-- over from an earlier schema. The frontend RBAC system uses 'engineer',
-- 'lead', 'admin' — so the constraint rejected any Admin → Lead promotion.
-- Drop the stale CHECK and rebuild it with the current canonical set, after
-- migrating any pre-existing 'lead_engineer' rows.
-- Applied via Supabase Management API on 2026-05-28.

ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
UPDATE public.profiles SET role = 'lead'     WHERE role = 'lead_engineer';
UPDATE public.profiles SET role = 'engineer' WHERE role = 'viewer';
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_role_check CHECK (role IN ('engineer','lead','admin'));
