-- =====================================================
-- VENDOR UPLOAD LINKS — public catalog-submission tokens
-- 2026-05-11
--
-- A GC creates a token, emails it to their Daltile/MSI/etc. rep, the
-- rep opens /tools/blueprint-takeoff/vendor-upload.html#t=<token>,
-- drops their price sheet PDF, AI parses it, and the resulting catalog
-- attaches to the GC's account (or their org's shared catalogs if the
-- token was created with an org_id). No vendor account needed.
--
-- Tokens have:
--   - max_uses: prevents one shared link from being abused
--   - expires_at: time-bounded so old links expire
--   - vendor_hint: pre-fills "what catalog is this?" so the rep doesn't
--     have to label it themselves
-- =====================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.vendor_upload_links (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_by      UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  org_id          UUID REFERENCES public.orgs(id) ON DELETE SET NULL,
  vendor_hint     TEXT,                                  -- e.g. "Daltile" — pre-fills vendor field
  category_hint   TEXT,                                  -- e.g. "tile" — pre-fills category
  notify_email    TEXT,                                  -- where to email when uploaded (defaults to creator's)
  max_uses        INT NOT NULL DEFAULT 5,
  use_count       INT NOT NULL DEFAULT 0,
  expires_at      TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '90 days'),
  last_used_at    TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_vendor_upload_links_creator
  ON public.vendor_upload_links (created_by, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_vendor_upload_links_expires
  ON public.vendor_upload_links (expires_at) WHERE use_count < max_uses;

ALTER TABLE public.vendor_upload_links ENABLE ROW LEVEL SECURITY;

-- Creators can SELECT/UPDATE/DELETE their own links
DROP POLICY IF EXISTS "vendor_upload_links_owner_all" ON public.vendor_upload_links;
CREATE POLICY "vendor_upload_links_owner_all"
  ON public.vendor_upload_links FOR ALL
  TO authenticated
  USING (created_by = auth.uid())
  WITH CHECK (created_by = auth.uid());

-- Service role does everything (token validation + catalog insert
-- on behalf of the rep happens server-side through service role).
DROP POLICY IF EXISTS "vendor_upload_links_service_role_all" ON public.vendor_upload_links;
CREATE POLICY "vendor_upload_links_service_role_all"
  ON public.vendor_upload_links FOR ALL
  TO service_role USING (true) WITH CHECK (true);

COMMIT;

-- VERIFY:
--   SELECT tablename FROM pg_tables WHERE tablename = 'vendor_upload_links';
