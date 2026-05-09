-- =====================================================
-- VENDOR CATALOGS — cloud-synced price sheets
-- 2026-05-09
--
-- Backs the Blueprint Takeoff "📚 Vendor Catalogs" feature. A user uploads
-- a Daltile/MSI/Mohawk/etc. price sheet PDF, GPT vision parses it into
-- {sku, name, line, color, size, finish, thickness, price, price_unit}
-- entries, and the catalog is saved here. The estimator matches blueprint
-- material codes against enabled catalogs to swap industry-avg pricing
-- for the user's actual wholesale.
--
-- Per-user via RLS so a contractor's price sheets stay private. Service
-- role bypass for backend-driven imports.
-- =====================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.vendor_catalogs (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  vendor          TEXT NOT NULL DEFAULT 'Unknown',
  category        TEXT NOT NULL DEFAULT 'other', -- tile, flooring, quartz, cabinet, paint, etc.
  products        JSONB NOT NULL DEFAULT '[]'::jsonb, -- array of {sku, name, line, color, size, finish, thickness, price, price_unit}
  enabled         BOOLEAN NOT NULL DEFAULT true,
  source_filename TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_vendor_catalogs_user
  ON public.vendor_catalogs (user_id, updated_at DESC);

-- updated_at auto-touch trigger
CREATE OR REPLACE FUNCTION public.vendor_catalogs_touch_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_vendor_catalogs_touch ON public.vendor_catalogs;
CREATE TRIGGER trg_vendor_catalogs_touch
  BEFORE UPDATE ON public.vendor_catalogs
  FOR EACH ROW EXECUTE FUNCTION public.vendor_catalogs_touch_updated_at();

ALTER TABLE public.vendor_catalogs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "vendor_catalogs_select_own" ON public.vendor_catalogs;
CREATE POLICY "vendor_catalogs_select_own"
  ON public.vendor_catalogs FOR SELECT
  TO authenticated USING (user_id = auth.uid());

DROP POLICY IF EXISTS "vendor_catalogs_insert_own" ON public.vendor_catalogs;
CREATE POLICY "vendor_catalogs_insert_own"
  ON public.vendor_catalogs FOR INSERT
  TO authenticated WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "vendor_catalogs_update_own" ON public.vendor_catalogs;
CREATE POLICY "vendor_catalogs_update_own"
  ON public.vendor_catalogs FOR UPDATE
  TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "vendor_catalogs_delete_own" ON public.vendor_catalogs;
CREATE POLICY "vendor_catalogs_delete_own"
  ON public.vendor_catalogs FOR DELETE
  TO authenticated USING (user_id = auth.uid());

DROP POLICY IF EXISTS "vendor_catalogs_service_role_all" ON public.vendor_catalogs;
CREATE POLICY "vendor_catalogs_service_role_all"
  ON public.vendor_catalogs FOR ALL
  TO service_role USING (true) WITH CHECK (true);

COMMIT;

-- VERIFY:
--   SELECT tablename, rowsecurity FROM pg_tables WHERE tablename = 'vendor_catalogs';
