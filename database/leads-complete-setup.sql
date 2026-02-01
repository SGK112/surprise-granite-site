-- ============================================================
-- COMPLETE LEADS TABLE SETUP
-- Run this in Supabase SQL Editor
-- ============================================================

-- Create leads table if not exists
CREATE TABLE IF NOT EXISTS public.leads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Lead info (multiple naming conventions for compatibility)
  name TEXT,
  full_name TEXT,
  first_name TEXT,
  last_name TEXT,
  homeowner_name TEXT,

  -- Contact
  email TEXT,
  homeowner_email TEXT,
  phone TEXT,
  homeowner_phone TEXT,

  -- Address
  address TEXT,
  project_address TEXT,
  city TEXT,
  state TEXT,
  zip TEXT,
  project_zip TEXT,

  -- Project details
  project_type TEXT,
  project_budget TEXT,
  project_timeline TEXT,
  project_details TEXT,
  description TEXT,
  message TEXT,

  -- Source
  source TEXT DEFAULT 'website',
  source_details TEXT,
  form_name TEXT DEFAULT 'website',

  -- Appointment
  appointment_date TEXT,
  appointment_time TEXT,
  appointment_status TEXT DEFAULT 'scheduled',

  -- Assignment
  assigned_to UUID REFERENCES auth.users(id),
  claimed_at TIMESTAMPTZ,

  -- Status
  status TEXT DEFAULT 'new',
  lead_price DECIMAL(10,2) DEFAULT 15,

  -- Metadata
  notes TEXT,
  raw_data JSONB,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.leads ENABLE ROW LEVEL SECURITY;

-- Drop old policies (safe if they don't exist)
DROP POLICY IF EXISTS "leads_select_own" ON public.leads;
DROP POLICY IF EXISTS "leads_update_own" ON public.leads;
DROP POLICY IF EXISTS "leads_insert_own" ON public.leads;
DROP POLICY IF EXISTS "leads_delete_own" ON public.leads;
DROP POLICY IF EXISTS "leads_public_insert" ON public.leads;
DROP POLICY IF EXISTS "leads_service_all" ON public.leads;

-- RLS Policies
CREATE POLICY "leads_select_own" ON public.leads FOR SELECT USING (
  user_id = auth.uid() OR assigned_to = auth.uid() OR user_id IS NULL
);
CREATE POLICY "leads_insert_own" ON public.leads FOR INSERT WITH CHECK (true);
CREATE POLICY "leads_update_own" ON public.leads FOR UPDATE USING (
  user_id = auth.uid() OR assigned_to = auth.uid()
);
CREATE POLICY "leads_delete_own" ON public.leads FOR DELETE USING (user_id = auth.uid());
CREATE POLICY "leads_service_all" ON public.leads FOR ALL USING (auth.role() = 'service_role');

-- Grants
GRANT ALL ON public.leads TO authenticated;
GRANT ALL ON public.leads TO service_role;
GRANT INSERT ON public.leads TO anon;

-- Indexes
CREATE INDEX IF NOT EXISTS leads_user_id_idx ON public.leads(user_id);
CREATE INDEX IF NOT EXISTS leads_email_idx ON public.leads(email);
CREATE INDEX IF NOT EXISTS leads_homeowner_email_idx ON public.leads(homeowner_email);
CREATE INDEX IF NOT EXISTS leads_status_idx ON public.leads(status);
CREATE INDEX IF NOT EXISTS leads_created_at_idx ON public.leads(created_at DESC);

SELECT 'Leads table created successfully!' as status;
