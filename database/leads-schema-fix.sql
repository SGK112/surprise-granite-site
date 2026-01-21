-- ============================================================
-- LEADS TABLE SCHEMA FIX
-- Adds missing columns and RLS policies for account leads management
-- Run this in Supabase SQL Editor
-- ============================================================

-- 1. Add user_id column (CRITICAL for RLS)
ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;

-- 2. Add name fields the app expects
ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS full_name TEXT,
  ADD COLUMN IF NOT EXISTS first_name TEXT,
  ADD COLUMN IF NOT EXISTS last_name TEXT;

-- 3. Add form and message fields
ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS form_name TEXT DEFAULT 'website',
  ADD COLUMN IF NOT EXISTS message TEXT;

-- 4. Add zip_code field
ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS zip_code TEXT;

-- 5. Add address fields as JSONB (for structured data)
ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS billing_address JSONB,
  ADD COLUMN IF NOT EXISTS service_address JSONB,
  ADD COLUMN IF NOT EXISTS address_same BOOLEAN DEFAULT true;

-- 6. Add raw_data for flexible storage
ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS raw_data JSONB;

-- 7. Update status check constraint to include all needed values
ALTER TABLE public.leads DROP CONSTRAINT IF EXISTS leads_status_check;
ALTER TABLE public.leads ADD CONSTRAINT leads_status_check
  CHECK (status IN ('new', 'contacted', 'qualified', 'quoted', 'won', 'lost', 'archived', 'proposal_sent'));

-- ============================================================
-- FIX RLS POLICIES
-- ============================================================

-- Drop existing policies
DROP POLICY IF EXISTS "leads_select_own" ON public.leads;
DROP POLICY IF EXISTS "leads_update_own" ON public.leads;
DROP POLICY IF EXISTS "leads_insert_own" ON public.leads;
DROP POLICY IF EXISTS "leads_delete_own" ON public.leads;
DROP POLICY IF EXISTS "leads_public_insert" ON public.leads;
DROP POLICY IF EXISTS "leads_service_all" ON public.leads;

-- Allow authenticated users to SELECT their own leads
CREATE POLICY "leads_select_own" ON public.leads
  FOR SELECT USING (
    user_id = auth.uid()
    OR assigned_to = auth.uid()
    OR user_id IS NULL  -- Legacy leads without user_id
  );

-- CRITICAL: Allow authenticated users to INSERT leads
CREATE POLICY "leads_insert_own" ON public.leads
  FOR INSERT WITH CHECK (
    auth.uid() IS NOT NULL
  );

-- Allow authenticated users to UPDATE their own leads
CREATE POLICY "leads_update_own" ON public.leads
  FOR UPDATE USING (
    user_id = auth.uid()
    OR assigned_to = auth.uid()
  );

-- Allow authenticated users to DELETE their own leads
CREATE POLICY "leads_delete_own" ON public.leads
  FOR DELETE USING (
    user_id = auth.uid()
  );

-- Allow public form submissions (for website contact forms)
CREATE POLICY "leads_public_insert" ON public.leads
  FOR INSERT WITH CHECK (true);

-- Service role full access
CREATE POLICY "leads_service_all" ON public.leads
  FOR ALL USING (auth.role() = 'service_role');

-- ============================================================
-- GRANTS
-- ============================================================
GRANT ALL ON public.leads TO authenticated;
GRANT ALL ON public.leads TO service_role;
GRANT INSERT ON public.leads TO anon;  -- For public form submissions

-- ============================================================
-- INDEXES
-- ============================================================
CREATE INDEX IF NOT EXISTS leads_user_id_idx ON public.leads(user_id);
CREATE INDEX IF NOT EXISTS leads_email_idx ON public.leads(email);
CREATE INDEX IF NOT EXISTS leads_created_at_idx ON public.leads(created_at DESC);

-- ============================================================
-- BACKFILL: Set user_id for existing leads based on assigned_to
-- ============================================================
UPDATE public.leads
SET user_id = assigned_to
WHERE user_id IS NULL AND assigned_to IS NOT NULL;

-- ============================================================
-- DONE
-- ============================================================
SELECT 'Leads schema fix complete! The leads table now has all required columns and RLS policies.' as status;
