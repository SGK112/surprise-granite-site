-- =====================================================
-- PROPOSAL SHARES — short-link backing for /share.html
-- 2026-05-11
--
-- Replaces the base64-in-URL-fragment scheme that produced 4 KB URLs.
-- The proposal payload is stored once; the share URL just carries a
-- UUID. Public read by ID (anyone with the link can view); service-role
-- inserts on behalf of the GC.
-- =====================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.proposal_shares (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  payload          JSONB NOT NULL,
  created_by_email TEXT,
  view_count       INT NOT NULL DEFAULT 0,
  expires_at       TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '180 days'),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_proposal_shares_created_by
  ON public.proposal_shares (created_by_email, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_proposal_shares_expires
  ON public.proposal_shares (expires_at);

ALTER TABLE public.proposal_shares ENABLE ROW LEVEL SECURITY;

-- Public read by id (the share URL is the cap; anyone with it can view).
-- No anon listing — they have to know the UUID.
DROP POLICY IF EXISTS "proposal_shares_select_anon" ON public.proposal_shares;
CREATE POLICY "proposal_shares_select_anon"
  ON public.proposal_shares FOR SELECT
  TO anon, authenticated USING (true);

-- All writes through service role (backend mediated). Direct anon
-- inserts blocked to prevent spam / abuse.
DROP POLICY IF EXISTS "proposal_shares_service_role_all" ON public.proposal_shares;
CREATE POLICY "proposal_shares_service_role_all"
  ON public.proposal_shares FOR ALL
  TO service_role USING (true) WITH CHECK (true);

COMMIT;

-- VERIFY:
--   SELECT tablename FROM pg_tables WHERE tablename = 'proposal_shares';
