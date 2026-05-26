-- =====================================================
-- ORGS + TEAM-SHARED VENDOR CATALOGS
-- 2026-05-09
--
-- Lets a contractor's team share vendor catalogs (Daltile, MSI, etc.)
-- across multiple users instead of each estimator re-uploading. Schema:
--
--   orgs              — one row per company / team
--   org_members       — user_id ↔ org_id, role
--   vendor_catalogs.org_id  — when set, all org members can read it
--
-- Auth model:
--   - Owner can invite/remove members and share/unshare catalogs.
--   - Members can read shared catalogs. Cannot share their own catalogs
--     to a team they only belong to (would be a permissioning footgun).
--   - Personal catalogs (org_id IS NULL) stay scoped to the owner.
-- =====================================================

BEGIN;

-- ----- ORGS -----
CREATE TABLE IF NOT EXISTS public.orgs (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name            TEXT NOT NULL,
  owner_user_id   UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_orgs_owner ON public.orgs (owner_user_id);

CREATE OR REPLACE FUNCTION public.orgs_touch_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at := now(); RETURN NEW; END;
$$;
DROP TRIGGER IF EXISTS trg_orgs_touch ON public.orgs;
CREATE TRIGGER trg_orgs_touch BEFORE UPDATE ON public.orgs
  FOR EACH ROW EXECUTE FUNCTION public.orgs_touch_updated_at();

-- ----- ORG MEMBERS -----
-- Composite PK on (org_id, user_id) prevents duplicate memberships and
-- supports clean multi-org scenarios (a user can be in several teams).
CREATE TABLE IF NOT EXISTS public.org_members (
  org_id     UUID NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
  user_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role       TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('owner','admin','member')),
  invited_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (org_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_org_members_user ON public.org_members (user_id);
CREATE INDEX IF NOT EXISTS idx_org_members_org  ON public.org_members (org_id);

-- ----- VENDOR CATALOGS: add org_id -----
-- Backwards compatible — existing rows have org_id NULL (personal).
ALTER TABLE public.vendor_catalogs
  ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES public.orgs(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_vendor_catalogs_org
  ON public.vendor_catalogs (org_id, updated_at DESC) WHERE org_id IS NOT NULL;

-- ============================================================
-- RLS — orgs
-- ============================================================
ALTER TABLE public.orgs ENABLE ROW LEVEL SECURITY;

-- Read: any member of the org (or service role)
DROP POLICY IF EXISTS "orgs_select_member" ON public.orgs;
CREATE POLICY "orgs_select_member"
  ON public.orgs FOR SELECT
  TO authenticated
  USING (
    owner_user_id = auth.uid()
    OR id IN (SELECT org_id FROM public.org_members WHERE user_id = auth.uid())
  );

-- Insert: any authenticated user can create an org (they become owner).
-- The frontend wraps this in a UI flow, but the policy permits it.
DROP POLICY IF EXISTS "orgs_insert_self_owner" ON public.orgs;
CREATE POLICY "orgs_insert_self_owner"
  ON public.orgs FOR INSERT
  TO authenticated WITH CHECK (owner_user_id = auth.uid());

-- Update: only the owner
DROP POLICY IF EXISTS "orgs_update_owner" ON public.orgs;
CREATE POLICY "orgs_update_owner"
  ON public.orgs FOR UPDATE
  TO authenticated USING (owner_user_id = auth.uid()) WITH CHECK (owner_user_id = auth.uid());

-- Delete: only the owner
DROP POLICY IF EXISTS "orgs_delete_owner" ON public.orgs;
CREATE POLICY "orgs_delete_owner"
  ON public.orgs FOR DELETE
  TO authenticated USING (owner_user_id = auth.uid());

DROP POLICY IF EXISTS "orgs_service_role_all" ON public.orgs;
CREATE POLICY "orgs_service_role_all"
  ON public.orgs FOR ALL
  TO service_role USING (true) WITH CHECK (true);

-- ============================================================
-- RLS — org_members
-- ============================================================
ALTER TABLE public.org_members ENABLE ROW LEVEL SECURITY;

-- Read: members can see their own membership rows + the org owner can see all
DROP POLICY IF EXISTS "org_members_select_self_or_owner" ON public.org_members;
CREATE POLICY "org_members_select_self_or_owner"
  ON public.org_members FOR SELECT
  TO authenticated
  USING (
    user_id = auth.uid()
    OR org_id IN (SELECT id FROM public.orgs WHERE owner_user_id = auth.uid())
  );

-- Insert: only the org owner can add members
DROP POLICY IF EXISTS "org_members_insert_owner" ON public.org_members;
CREATE POLICY "org_members_insert_owner"
  ON public.org_members FOR INSERT
  TO authenticated
  WITH CHECK (org_id IN (SELECT id FROM public.orgs WHERE owner_user_id = auth.uid()));

-- Delete: owner OR the member themselves (leave the team)
DROP POLICY IF EXISTS "org_members_delete_owner_or_self" ON public.org_members;
CREATE POLICY "org_members_delete_owner_or_self"
  ON public.org_members FOR DELETE
  TO authenticated
  USING (
    user_id = auth.uid()
    OR org_id IN (SELECT id FROM public.orgs WHERE owner_user_id = auth.uid())
  );

DROP POLICY IF EXISTS "org_members_service_role_all" ON public.org_members;
CREATE POLICY "org_members_service_role_all"
  ON public.org_members FOR ALL
  TO service_role USING (true) WITH CHECK (true);

-- ============================================================
-- RLS — vendor_catalogs (UPDATED policies for shared access)
-- The previous "select_own" / "update_own" / "delete_own" policies
-- restricted to user_id = auth.uid(). Now we expand SELECT to include
-- catalogs the user has access to via an org membership; UPDATE/DELETE
-- stay tied to the catalog's owner (sharing doesn't transfer ownership).
-- ============================================================

-- Drop the old read policy and replace with a broader one.
-- Also drop the NEW name in case the migration partially applied previously
-- (CI was hitting SQLSTATE 42710 here because an earlier statement in this
-- file errored out, leaving the new policy created but the migration not
-- marked applied — so retry kept hitting "already exists").
DROP POLICY IF EXISTS "vendor_catalogs_select_own" ON public.vendor_catalogs;
DROP POLICY IF EXISTS "vendor_catalogs_select_own_or_org" ON public.vendor_catalogs;
CREATE POLICY "vendor_catalogs_select_own_or_org"
  ON public.vendor_catalogs FOR SELECT
  TO authenticated
  USING (
    user_id = auth.uid()
    OR (org_id IS NOT NULL AND org_id IN (
      SELECT org_id FROM public.org_members WHERE user_id = auth.uid()
    ))
    OR (org_id IS NOT NULL AND org_id IN (
      SELECT id FROM public.orgs WHERE owner_user_id = auth.uid()
    ))
  );

-- Insert/update/delete policies stay restricted to the original owner
-- (already in place from the prior migration; no change needed).

COMMIT;

-- VERIFY:
--   SELECT tablename FROM pg_tables WHERE tablename IN ('orgs','org_members');
--   SELECT column_name, data_type FROM information_schema.columns
--     WHERE table_name = 'vendor_catalogs' AND column_name = 'org_id';
