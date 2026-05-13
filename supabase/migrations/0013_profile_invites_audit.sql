-- Migration 0013 — auto-create profile on signup, project_invites table,
--                  audit_events log. All idempotent.

BEGIN;

-- ─────────────────────────────────────────────────────────────────
-- 1. Auto-create a `profiles` row when a new auth.users row appears
-- ─────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public, auth
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, avatar_url, role)
  VALUES (
    NEW.id,
    NEW.email,
    coalesce(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)),
    NEW.raw_user_meta_data->>'avatar_url',
    'engineer'
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Backfill: any auth.users without a matching profile gets one now.
INSERT INTO public.profiles (id, email, full_name, role)
  SELECT u.id, u.email,
         coalesce(u.raw_user_meta_data->>'full_name', split_part(u.email, '@', 1)),
         'engineer'
    FROM auth.users u
    LEFT JOIN public.profiles p ON p.id = u.id
   WHERE p.id IS NULL;

-- ─────────────────────────────────────────────────────────────────
-- 2. PROJECT_INVITES — invite a teammate by email
-- ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS project_invites (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id  UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  email       TEXT NOT NULL,
  role        TEXT NOT NULL DEFAULT 'engineer',
  token       TEXT NOT NULL DEFAULT encode(gen_random_bytes(24), 'base64'),
  invited_by  UUID REFERENCES profiles(id) ON DELETE SET NULL,
  accepted_at TIMESTAMPTZ,
  expires_at  TIMESTAMPTZ DEFAULT (now() + interval '14 days'),
  created_at  TIMESTAMPTZ DEFAULT now(),
  UNIQUE (project_id, email)
);

CREATE INDEX IF NOT EXISTS idx_project_invites_token ON project_invites(token);
CREATE INDEX IF NOT EXISTS idx_project_invites_email ON project_invites(email);

ALTER TABLE project_invites ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS invites_select ON project_invites;
DROP POLICY IF EXISTS invites_insert ON project_invites;
DROP POLICY IF EXISTS invites_update ON project_invites;
DROP POLICY IF EXISTS invites_delete ON project_invites;

CREATE POLICY invites_select ON project_invites
  FOR SELECT USING (
    -- inviter / project admin can see all invites for their project
    project_role(project_id) IN ('admin','lead_engineer')
    OR EXISTS(SELECT 1 FROM projects p WHERE p.id = project_invites.project_id AND p.owner_id = auth.uid())
    -- invitee can see their own pending invite
    OR (email = (SELECT email FROM auth.users WHERE id = auth.uid()))
  );

CREATE POLICY invites_insert ON project_invites
  FOR INSERT WITH CHECK (
    project_role(project_id) IN ('admin','lead_engineer')
    OR EXISTS(SELECT 1 FROM projects p WHERE p.id = project_invites.project_id AND p.owner_id = auth.uid())
  );

CREATE POLICY invites_update ON project_invites
  FOR UPDATE USING (
    email = (SELECT email FROM auth.users WHERE id = auth.uid())
    OR project_role(project_id) IN ('admin','lead_engineer')
  );

CREATE POLICY invites_delete ON project_invites
  FOR DELETE USING (
    project_role(project_id) IN ('admin','lead_engineer')
    OR EXISTS(SELECT 1 FROM projects p WHERE p.id = project_invites.project_id AND p.owner_id = auth.uid())
  );

-- Function — accept invite. Adds the current user as a project member and
-- marks the invite accepted. Returns the project_id on success.
CREATE OR REPLACE FUNCTION accept_project_invite(p_token TEXT)
RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_inv  project_invites%ROWTYPE;
  v_uid  UUID := auth.uid();
  v_mail TEXT;
BEGIN
  SELECT email INTO v_mail FROM auth.users WHERE id = v_uid;
  SELECT * INTO v_inv FROM project_invites
    WHERE token = p_token
      AND accepted_at IS NULL
      AND expires_at > now()
      AND email = v_mail;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invite not found, expired, or email mismatch';
  END IF;
  INSERT INTO project_members(project_id, user_id, role)
    VALUES (v_inv.project_id, v_uid, v_inv.role)
    ON CONFLICT (project_id, user_id) DO NOTHING;
  UPDATE project_invites SET accepted_at = now() WHERE id = v_inv.id;
  RETURN v_inv.project_id;
END;
$$;

-- ─────────────────────────────────────────────────────────────────
-- 3. AUDIT_EVENTS — Phase G activity log
-- ─────────────────────────────────────────────────────────────────
-- Existing table `activity_logs` is web-app specific. We add audit_events
-- as the desktop's complement (richer payload, JSONB before/after).
CREATE TABLE IF NOT EXISTS audit_events (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id    UUID REFERENCES profiles(id) ON DELETE SET NULL,
  project_id  UUID REFERENCES projects(id) ON DELETE CASCADE,
  entity      TEXT NOT NULL,           -- 'task' / 'project' / 'comment' / 'shot'
  entity_id   UUID NOT NULL,
  action      TEXT NOT NULL,           -- 'create' / 'update' / 'delete' / 'status_change' / 'comment_add' / 'shot_upload'
  before_data JSONB,
  after_data  JSONB,
  created_at  TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_audit_project_created ON audit_events(project_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_entity ON audit_events(entity, entity_id);

ALTER TABLE audit_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS audit_select ON audit_events;
DROP POLICY IF EXISTS audit_insert ON audit_events;

CREATE POLICY audit_select ON audit_events
  FOR SELECT USING ( is_project_member(project_id) );

CREATE POLICY audit_insert ON audit_events
  FOR INSERT WITH CHECK (
    actor_id = auth.uid()
    AND is_project_member(project_id)
  );

COMMIT;
