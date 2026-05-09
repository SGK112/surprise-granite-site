-- =====================================================
-- BLUEPRINT TAKEOFF — cloud project storage
-- 2026-05-09
--
-- Two tables to back the AI takeoff/estimating tool:
--   1. takeoff_projects — saved projects per user (sheets, totals, materials,
--      estimate, proposal, cover info, questions, measurements). Primary
--      storage; localStorage in the browser is just an offline cache mirror.
--   2. proposal_acceptances — when a customer signs + pays the deposit on
--      a shared proposal, the signature + acceptance record lands here.
--
-- RLS so users only see their own rows. Service role can do everything for
-- backend-driven operations (e.g., the public share-page acceptance write).
-- =====================================================

BEGIN;

-- =====================================================
-- TAKEOFF PROJECTS
-- =====================================================
CREATE TABLE IF NOT EXISTS public.takeoff_projects (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name        TEXT NOT NULL DEFAULT 'Untitled project',
  payload     JSONB NOT NULL DEFAULT '{}'::jsonb, -- full project snapshot
  total_bid   INTEGER, -- denormalized from payload for cheap list queries
  source      TEXT,    -- filename or URL the project was started from
  stage       TEXT,    -- 'index' | 'extracted' | 'estimated' | 'proposed'
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_takeoff_projects_user
  ON public.takeoff_projects (user_id, updated_at DESC);

-- updated_at auto-touch trigger
CREATE OR REPLACE FUNCTION public.takeoff_projects_touch_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_takeoff_projects_touch ON public.takeoff_projects;
CREATE TRIGGER trg_takeoff_projects_touch
  BEFORE UPDATE ON public.takeoff_projects
  FOR EACH ROW EXECUTE FUNCTION public.takeoff_projects_touch_updated_at();

-- RLS — users only see their own
ALTER TABLE public.takeoff_projects ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "takeoff_projects_select_own" ON public.takeoff_projects;
CREATE POLICY "takeoff_projects_select_own"
  ON public.takeoff_projects FOR SELECT
  TO authenticated USING (user_id = auth.uid());

DROP POLICY IF EXISTS "takeoff_projects_insert_own" ON public.takeoff_projects;
CREATE POLICY "takeoff_projects_insert_own"
  ON public.takeoff_projects FOR INSERT
  TO authenticated WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "takeoff_projects_update_own" ON public.takeoff_projects;
CREATE POLICY "takeoff_projects_update_own"
  ON public.takeoff_projects FOR UPDATE
  TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "takeoff_projects_delete_own" ON public.takeoff_projects;
CREATE POLICY "takeoff_projects_delete_own"
  ON public.takeoff_projects FOR DELETE
  TO authenticated USING (user_id = auth.uid());

-- Service role bypasses RLS (used by backend for admin/migration operations)
DROP POLICY IF EXISTS "takeoff_projects_service_role_all" ON public.takeoff_projects;
CREATE POLICY "takeoff_projects_service_role_all"
  ON public.takeoff_projects FOR ALL
  TO service_role USING (true) WITH CHECK (true);


-- =====================================================
-- PROPOSAL ACCEPTANCES
-- Captured when a customer signs + initiates deposit on a shared proposal.
-- user_id is the contractor (preparedBy.email mapped to a SG user when
-- possible); null for proposals shared without auth context.
-- =====================================================
CREATE TABLE IF NOT EXISTS public.proposal_acceptances (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id            UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  prepared_by_email  TEXT,
  accepted_by_name   TEXT NOT NULL,
  accepted_by_email  TEXT NOT NULL,
  project            TEXT,
  customer           TEXT,
  total_bid          INTEGER, -- dollars
  deposit            INTEGER, -- dollars
  signature_png      TEXT,    -- base64 data URL
  ip_address         TEXT,
  user_agent         TEXT,
  stripe_session_id  TEXT,
  paid_at            TIMESTAMPTZ,
  accepted_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_proposal_acceptances_user
  ON public.proposal_acceptances (user_id, accepted_at DESC);

CREATE INDEX IF NOT EXISTS idx_proposal_acceptances_prepared_by
  ON public.proposal_acceptances (prepared_by_email, accepted_at DESC);

ALTER TABLE public.proposal_acceptances ENABLE ROW LEVEL SECURITY;

-- Contractors can read acceptances for proposals they prepared
DROP POLICY IF EXISTS "proposal_acceptances_select_own" ON public.proposal_acceptances;
CREATE POLICY "proposal_acceptances_select_own"
  ON public.proposal_acceptances FOR SELECT
  TO authenticated USING (user_id = auth.uid());

-- Service role does the writes (the share page is unauthenticated; backend
-- writes on behalf of the customer signing)
DROP POLICY IF EXISTS "proposal_acceptances_service_role_all" ON public.proposal_acceptances;
CREATE POLICY "proposal_acceptances_service_role_all"
  ON public.proposal_acceptances FOR ALL
  TO service_role USING (true) WITH CHECK (true);

COMMIT;

-- =====================================================
-- VERIFICATION
-- After running:
--   SELECT * FROM pg_tables WHERE tablename IN ('takeoff_projects','proposal_acceptances');
--   SELECT tablename, rowsecurity FROM pg_tables WHERE tablename IN ('takeoff_projects','proposal_acceptances');
-- =====================================================
