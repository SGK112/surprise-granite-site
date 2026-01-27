-- ============================================================
-- PATCH 001: Create missing database objects
-- Run this in Supabase SQL Editor (https://supabase.com/dashboard)
-- Project: ypeypgwsycxcagncgdur
-- Date: 2026-01-27
-- ============================================================

-- ============================================================
-- 1. CREATE get_next_job_number() RPC FUNCTION
--    Generates sequential job numbers: JOB-001, JOB-002, etc.
-- ============================================================
CREATE OR REPLACE FUNCTION public.get_next_job_number(p_user_id UUID)
RETURNS TEXT AS $$
DECLARE
  next_num INTEGER;
  job_prefix TEXT := 'JOB-';
BEGIN
  -- Get the highest existing job number for this user
  SELECT COALESCE(
    MAX(
      CASE
        WHEN job_number ~ '^JOB-[0-9]+$'
        THEN CAST(SUBSTRING(job_number FROM 5) AS INTEGER)
        ELSE 0
      END
    ), 0
  ) + 1
  INTO next_num
  FROM public.jobs
  WHERE user_id = p_user_id;

  RETURN job_prefix || LPAD(next_num::TEXT, 3, '0');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute to authenticated users
GRANT EXECUTE ON FUNCTION public.get_next_job_number(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_next_job_number(UUID) TO service_role;

-- ============================================================
-- 2. ADD type COLUMN TO contractors (if missing)
--    Used by CRM for contractor category: installer, fabricator, etc.
-- ============================================================
ALTER TABLE public.contractors
  ADD COLUMN IF NOT EXISTS type TEXT DEFAULT 'other';

-- ============================================================
-- 3. CREATE listing_inquiries TABLE (if not exists)
--    Contact requests for stone listings marketplace
-- ============================================================
CREATE TABLE IF NOT EXISTS public.listing_inquiries (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  listing_id UUID NOT NULL REFERENCES public.stone_listings(id) ON DELETE CASCADE,
  sender_id UUID REFERENCES auth.users(id),
  sender_name TEXT NOT NULL,
  sender_email TEXT NOT NULL,
  sender_phone TEXT,
  message TEXT NOT NULL,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'responded', 'closed')),
  read BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add status column if table already existed without it
ALTER TABLE public.listing_inquiries
  ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'pending';

-- RLS
ALTER TABLE public.listing_inquiries ENABLE ROW LEVEL SECURITY;

-- Drop and recreate policies to avoid "already exists" errors
DO $$ BEGIN
  DROP POLICY IF EXISTS "listing_inquiries_owner_view" ON public.listing_inquiries;
  DROP POLICY IF EXISTS "listing_inquiries_sender_view" ON public.listing_inquiries;
  DROP POLICY IF EXISTS "listing_inquiries_insert_any" ON public.listing_inquiries;
  DROP POLICY IF EXISTS "listing_inquiries_owner_update" ON public.listing_inquiries;
  DROP POLICY IF EXISTS "listing_inquiries_service_all" ON public.listing_inquiries;
END $$;

CREATE POLICY "listing_inquiries_owner_view" ON public.listing_inquiries
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.stone_listings
      WHERE id = listing_id AND user_id = auth.uid()
    )
  );

CREATE POLICY "listing_inquiries_sender_view" ON public.listing_inquiries
  FOR SELECT USING (auth.uid() = sender_id);

CREATE POLICY "listing_inquiries_insert_any" ON public.listing_inquiries
  FOR INSERT WITH CHECK (true);

CREATE POLICY "listing_inquiries_owner_update" ON public.listing_inquiries
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM public.stone_listings
      WHERE id = listing_id AND user_id = auth.uid()
    )
  );

CREATE POLICY "listing_inquiries_service_all" ON public.listing_inquiries
  FOR ALL USING (auth.role() = 'service_role');

GRANT ALL ON public.listing_inquiries TO authenticated;
GRANT ALL ON public.listing_inquiries TO service_role;
GRANT INSERT ON public.listing_inquiries TO anon;

CREATE INDEX IF NOT EXISTS listing_inquiries_listing_idx ON public.listing_inquiries(listing_id);
CREATE INDEX IF NOT EXISTS listing_inquiries_status_idx ON public.listing_inquiries(status);

-- ============================================================
-- 4. UPDATE LEADS RLS POLICIES TO INCLUDE super_admin
--    Current policies only check account_type = 'admin'
-- ============================================================
DO $$ BEGIN
  DROP POLICY IF EXISTS "leads_admin_view" ON public.leads;
  DROP POLICY IF EXISTS "leads_admin_insert" ON public.leads;
  DROP POLICY IF EXISTS "leads_admin_update" ON public.leads;
  DROP POLICY IF EXISTS "leads_admin_delete" ON public.leads;
END $$;

CREATE POLICY "leads_admin_view" ON public.leads
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.sg_users
      WHERE id = auth.uid() AND account_type IN ('admin', 'super_admin')
    )
  );

CREATE POLICY "leads_admin_insert" ON public.leads
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.sg_users
      WHERE id = auth.uid() AND account_type IN ('admin', 'super_admin')
    )
  );

CREATE POLICY "leads_admin_update" ON public.leads
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM public.sg_users
      WHERE id = auth.uid() AND account_type IN ('admin', 'super_admin')
    )
  );

CREATE POLICY "leads_admin_delete" ON public.leads
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM public.sg_users
      WHERE id = auth.uid() AND account_type IN ('admin', 'super_admin')
    )
  );

-- ============================================================
-- 5. ADD super_admin TO sg_users CHECK CONSTRAINT
--    Allow super_admin as a valid account_type
-- ============================================================
-- Drop and recreate the check constraint to include super_admin
DO $$
BEGIN
  -- Try to drop the existing constraint (name may vary)
  ALTER TABLE public.sg_users DROP CONSTRAINT IF EXISTS sg_users_account_type_check;
  ALTER TABLE public.sg_users DROP CONSTRAINT IF EXISTS check_account_type;

  -- Add updated constraint
  ALTER TABLE public.sg_users ADD CONSTRAINT sg_users_account_type_check
    CHECK (account_type IN ('homeowner', 'pro_fabricator', 'pro_contractor', 'pro_designer', 'admin', 'super_admin'));
EXCEPTION
  WHEN others THEN
    RAISE NOTICE 'Could not update account_type constraint: %. This is OK if the column has no constraint.', SQLERRM;
END $$;

-- ============================================================
-- 6. ADD FK INDEX for stone_listings.user_id (performance)
-- ============================================================
CREATE INDEX IF NOT EXISTS stone_listings_user_id_idx ON public.stone_listings(user_id);

-- ============================================================
-- DONE! Verify by running:
--   SELECT get_next_job_number('05029227-0696-4dec-89c6-856565865a1d');
-- ============================================================
