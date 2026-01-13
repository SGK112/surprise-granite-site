-- ============================================================
-- JOBS & CUSTOMER MANAGEMENT SYSTEM
-- Complete workflow from payment to project completion
-- Run this in Supabase SQL Editor
-- ============================================================

-- ============================================================
-- CUSTOMERS TABLE - Centralized customer records
-- ============================================================
CREATE TABLE IF NOT EXISTS public.customers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Customer Info
  name TEXT NOT NULL,
  email TEXT,
  phone TEXT,

  -- Address
  address TEXT,
  city TEXT,
  state TEXT,
  zip TEXT,

  -- Additional Info
  notes TEXT,
  source TEXT, -- How they found you: website, referral, google, etc.

  -- Stripe Reference
  stripe_customer_id TEXT,

  -- Stats (updated by triggers/app)
  total_jobs INTEGER DEFAULT 0,
  total_spent DECIMAL(12,2) DEFAULT 0,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- Prevent duplicate customers per user
  UNIQUE(user_id, email)
);

-- Enable RLS
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "customers_select_own" ON public.customers
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "customers_insert_own" ON public.customers
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "customers_update_own" ON public.customers
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "customers_delete_own" ON public.customers
  FOR DELETE USING (auth.uid() = user_id);

CREATE POLICY "customers_service_all" ON public.customers
  FOR ALL USING (auth.role() = 'service_role');

GRANT ALL ON public.customers TO authenticated;
GRANT ALL ON public.customers TO service_role;

CREATE INDEX IF NOT EXISTS customers_user_idx ON public.customers(user_id);
CREATE INDEX IF NOT EXISTS customers_email_idx ON public.customers(email);
CREATE INDEX IF NOT EXISTS customers_stripe_idx ON public.customers(stripe_customer_id);

-- ============================================================
-- CONTRACTORS TABLE - Your contractor pool
-- ============================================================
CREATE TABLE IF NOT EXISTS public.contractors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Contractor Info
  name TEXT NOT NULL,
  company_name TEXT,
  email TEXT,
  phone TEXT,

  -- Address
  address TEXT,
  city TEXT,
  state TEXT,
  zip TEXT,

  -- Professional Info
  specialty TEXT[], -- ['fabrication', 'installation', 'plumbing', 'electrical']
  license_number TEXT,
  insurance_expiry DATE,

  -- Rates
  hourly_rate DECIMAL(10,2),
  day_rate DECIMAL(10,2),

  -- Status
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'on_hold')),
  notes TEXT,

  -- Stats
  total_jobs INTEGER DEFAULT 0,
  total_earned DECIMAL(12,2) DEFAULT 0,
  avg_rating DECIMAL(3,2),

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.contractors ENABLE ROW LEVEL SECURITY;

CREATE POLICY "contractors_select_own" ON public.contractors
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "contractors_insert_own" ON public.contractors
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "contractors_update_own" ON public.contractors
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "contractors_delete_own" ON public.contractors
  FOR DELETE USING (auth.uid() = user_id);

CREATE POLICY "contractors_service_all" ON public.contractors
  FOR ALL USING (auth.role() = 'service_role');

GRANT ALL ON public.contractors TO authenticated;
GRANT ALL ON public.contractors TO service_role;

CREATE INDEX IF NOT EXISTS contractors_user_idx ON public.contractors(user_id);
CREATE INDEX IF NOT EXISTS contractors_status_idx ON public.contractors(status);

-- ============================================================
-- JOBS TABLE - Main job/project tracking
-- ============================================================
CREATE TABLE IF NOT EXISTS public.jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Job Number (auto-generated)
  job_number TEXT NOT NULL,

  -- References
  customer_id UUID REFERENCES public.customers(id) ON DELETE SET NULL,
  estimate_id UUID REFERENCES public.estimates(id) ON DELETE SET NULL,

  -- Customer Info (denormalized for convenience)
  customer_name TEXT NOT NULL,
  customer_email TEXT,
  customer_phone TEXT,
  customer_address TEXT,

  -- Project Details
  project_type TEXT, -- kitchen, bathroom, outdoor, commercial
  project_description TEXT,

  -- Job Site Address (if different from customer)
  job_address TEXT,
  job_city TEXT,
  job_state TEXT,
  job_zip TEXT,

  -- Materials
  material_name TEXT, -- e.g., "Calacatta Miragio Celio"
  material_supplier TEXT, -- e.g., "MSI"
  material_color TEXT,
  material_thickness TEXT,
  material_sqft DECIMAL(10,2),
  material_ordered BOOLEAN DEFAULT false,
  material_ordered_at TIMESTAMPTZ,
  material_received BOOLEAN DEFAULT false,
  material_received_at TIMESTAMPTZ,

  -- Financials
  contract_amount DECIMAL(12,2),
  deposit_amount DECIMAL(12,2),
  deposit_paid BOOLEAN DEFAULT false,
  deposit_paid_at TIMESTAMPTZ,
  balance_due DECIMAL(12,2),
  total_paid DECIMAL(12,2) DEFAULT 0,

  -- Stripe References
  stripe_invoice_id TEXT,
  stripe_payment_intent_id TEXT,

  -- Status Workflow
  status TEXT DEFAULT 'new' CHECK (status IN (
    'new',           -- Just created from payment
    'reviewing',     -- Admin reviewing details
    'material_ordered', -- Materials ordered from supplier
    'material_received', -- Materials in warehouse
    'assigned',      -- Contractor assigned
    'scheduled',     -- Field measure/template scheduled
    'measured',      -- Field measure complete
    'in_production', -- Being fabricated
    'ready',         -- Ready for installation
    'installing',    -- Installation in progress
    'completed',     -- Job complete
    'on_hold',       -- Paused
    'cancelled'      -- Cancelled
  )),

  -- Key Dates
  estimated_start_date DATE,
  estimated_completion_date DATE,
  actual_start_date DATE,
  actual_completion_date DATE,

  -- Scheduling
  field_measure_date TIMESTAMPTZ,
  field_measure_notes TEXT,
  install_date TIMESTAMPTZ,
  install_notes TEXT,

  -- External References
  moraware_job_id TEXT,  -- CounterGo/Moraware reference
  external_reference TEXT, -- Any other system reference

  -- Notes
  internal_notes TEXT,   -- Admin only
  customer_notes TEXT,   -- Shared with customer

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(user_id, job_number)
);

-- Enable RLS
ALTER TABLE public.jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "jobs_select_own" ON public.jobs
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "jobs_insert_own" ON public.jobs
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "jobs_update_own" ON public.jobs
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "jobs_delete_own" ON public.jobs
  FOR DELETE USING (auth.uid() = user_id);

CREATE POLICY "jobs_service_all" ON public.jobs
  FOR ALL USING (auth.role() = 'service_role');

GRANT ALL ON public.jobs TO authenticated;
GRANT ALL ON public.jobs TO service_role;

CREATE INDEX IF NOT EXISTS jobs_user_idx ON public.jobs(user_id);
CREATE INDEX IF NOT EXISTS jobs_customer_idx ON public.jobs(customer_id);
CREATE INDEX IF NOT EXISTS jobs_status_idx ON public.jobs(status);
CREATE INDEX IF NOT EXISTS jobs_stripe_invoice_idx ON public.jobs(stripe_invoice_id);

-- ============================================================
-- JOB FILES TABLE - Images, drawings, documents
-- ============================================================
CREATE TABLE IF NOT EXISTS public.job_files (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- File Info
  file_name TEXT NOT NULL,
  file_url TEXT NOT NULL,
  file_type TEXT, -- image, document, drawing, estimate, invoice
  file_size INTEGER,
  mime_type TEXT,

  -- Metadata
  category TEXT DEFAULT 'general', -- photo, drawing, moraware_export, contract, receipt
  description TEXT,

  -- Source
  source TEXT DEFAULT 'upload', -- upload, moraware, camera, email

  -- Visibility
  visible_to_customer BOOLEAN DEFAULT false,
  visible_to_contractor BOOLEAN DEFAULT false,

  -- Timestamps
  uploaded_at TIMESTAMPTZ DEFAULT NOW(),
  uploaded_by UUID REFERENCES auth.users(id)
);

-- Enable RLS
ALTER TABLE public.job_files ENABLE ROW LEVEL SECURITY;

CREATE POLICY "job_files_select_own" ON public.job_files
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "job_files_insert_own" ON public.job_files
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "job_files_update_own" ON public.job_files
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "job_files_delete_own" ON public.job_files
  FOR DELETE USING (auth.uid() = user_id);

CREATE POLICY "job_files_service_all" ON public.job_files
  FOR ALL USING (auth.role() = 'service_role');

GRANT ALL ON public.job_files TO authenticated;
GRANT ALL ON public.job_files TO service_role;

CREATE INDEX IF NOT EXISTS job_files_job_idx ON public.job_files(job_id);
CREATE INDEX IF NOT EXISTS job_files_category_idx ON public.job_files(category);

-- ============================================================
-- JOB CONTRACTORS TABLE - Contractor assignments
-- ============================================================
CREATE TABLE IF NOT EXISTS public.job_contractors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
  contractor_id UUID NOT NULL REFERENCES public.contractors(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Role on this job
  role TEXT DEFAULT 'installer', -- installer, fabricator, measurer, helper

  -- Assignment
  assigned_at TIMESTAMPTZ DEFAULT NOW(),
  assigned_by UUID REFERENCES auth.users(id),

  -- Invite System
  invite_token TEXT UNIQUE,
  invite_sent_at TIMESTAMPTZ,
  invite_expires_at TIMESTAMPTZ,

  -- Response
  status TEXT DEFAULT 'pending' CHECK (status IN (
    'pending',    -- Invite sent, awaiting response
    'accepted',   -- Contractor accepted
    'declined',   -- Contractor declined
    'completed',  -- Job finished
    'removed'     -- Removed from job
  )),
  responded_at TIMESTAMPTZ,
  decline_reason TEXT,

  -- Payment
  agreed_rate DECIMAL(10,2),
  rate_type TEXT DEFAULT 'flat', -- flat, hourly, sqft
  amount_paid DECIMAL(10,2) DEFAULT 0,

  -- Notes
  notes TEXT,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(job_id, contractor_id)
);

-- Enable RLS
ALTER TABLE public.job_contractors ENABLE ROW LEVEL SECURITY;

CREATE POLICY "job_contractors_select_own" ON public.job_contractors
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "job_contractors_insert_own" ON public.job_contractors
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "job_contractors_update_own" ON public.job_contractors
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "job_contractors_delete_own" ON public.job_contractors
  FOR DELETE USING (auth.uid() = user_id);

CREATE POLICY "job_contractors_service_all" ON public.job_contractors
  FOR ALL USING (auth.role() = 'service_role');

-- Allow contractors to view/update their own assignments via token
CREATE POLICY "job_contractors_contractor_view" ON public.job_contractors
  FOR SELECT USING (
    contractor_id IN (
      SELECT id FROM public.contractors WHERE email = auth.email()
    )
  );

GRANT ALL ON public.job_contractors TO authenticated;
GRANT ALL ON public.job_contractors TO service_role;

CREATE INDEX IF NOT EXISTS job_contractors_job_idx ON public.job_contractors(job_id);
CREATE INDEX IF NOT EXISTS job_contractors_contractor_idx ON public.job_contractors(contractor_id);
CREATE INDEX IF NOT EXISTS job_contractors_token_idx ON public.job_contractors(invite_token);

-- ============================================================
-- JOB STATUS HISTORY - Track status changes
-- ============================================================
CREATE TABLE IF NOT EXISTS public.job_status_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,

  -- Status Change
  from_status TEXT,
  to_status TEXT NOT NULL,
  changed_by UUID REFERENCES auth.users(id),

  -- Details
  notes TEXT,

  -- Timestamp
  changed_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.job_status_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "job_status_history_service_all" ON public.job_status_history
  FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "job_status_history_select" ON public.job_status_history
  FOR SELECT USING (
    job_id IN (SELECT id FROM public.jobs WHERE user_id = auth.uid())
  );

GRANT ALL ON public.job_status_history TO authenticated;
GRANT ALL ON public.job_status_history TO service_role;

CREATE INDEX IF NOT EXISTS job_status_history_job_idx ON public.job_status_history(job_id);

-- ============================================================
-- MATERIAL ORDERS TABLE - Track material orders
-- ============================================================
CREATE TABLE IF NOT EXISTS public.material_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Order Details
  order_number TEXT,
  supplier TEXT NOT NULL, -- MSI, Arizona Tile, etc.

  -- Material Info
  material_name TEXT NOT NULL,
  material_color TEXT,
  material_thickness TEXT,
  quantity DECIMAL(10,2),
  unit TEXT DEFAULT 'slab', -- slab, sqft, bundle

  -- Pricing
  unit_cost DECIMAL(10,2),
  total_cost DECIMAL(10,2),

  -- Status
  status TEXT DEFAULT 'pending' CHECK (status IN (
    'pending',      -- Need to order
    'ordered',      -- Order placed
    'confirmed',    -- Supplier confirmed
    'shipped',      -- In transit
    'received',     -- At warehouse
    'inspected',    -- Quality checked
    'issue'         -- Problem with order
  )),

  -- Dates
  ordered_at TIMESTAMPTZ,
  expected_date DATE,
  received_at TIMESTAMPTZ,

  -- Communication
  order_email_sent BOOLEAN DEFAULT false,
  order_email_sent_at TIMESTAMPTZ,
  confirmation_number TEXT,

  -- Notes
  notes TEXT,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.material_orders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "material_orders_select_own" ON public.material_orders
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "material_orders_insert_own" ON public.material_orders
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "material_orders_update_own" ON public.material_orders
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "material_orders_delete_own" ON public.material_orders
  FOR DELETE USING (auth.uid() = user_id);

CREATE POLICY "material_orders_service_all" ON public.material_orders
  FOR ALL USING (auth.role() = 'service_role');

GRANT ALL ON public.material_orders TO authenticated;
GRANT ALL ON public.material_orders TO service_role;

CREATE INDEX IF NOT EXISTS material_orders_job_idx ON public.material_orders(job_id);
CREATE INDEX IF NOT EXISTS material_orders_status_idx ON public.material_orders(status);

-- ============================================================
-- BUSINESS SETTINGS - Add job numbering
-- ============================================================
ALTER TABLE public.business_settings
  ADD COLUMN IF NOT EXISTS job_prefix TEXT DEFAULT 'JOB-',
  ADD COLUMN IF NOT EXISTS job_next_number INTEGER DEFAULT 1001;

-- ============================================================
-- HELPER FUNCTION - Generate next job number
-- ============================================================
CREATE OR REPLACE FUNCTION generate_job_number(p_user_id UUID)
RETURNS TEXT AS $$
DECLARE
  v_prefix TEXT;
  v_next_num INTEGER;
  v_job_number TEXT;
BEGIN
  -- Get or create business settings
  SELECT job_prefix, job_next_number INTO v_prefix, v_next_num
  FROM public.business_settings
  WHERE user_id = p_user_id;

  IF v_prefix IS NULL THEN
    v_prefix := 'JOB-';
    v_next_num := 1001;
  END IF;

  v_job_number := v_prefix || v_next_num::TEXT;

  -- Increment the counter
  UPDATE public.business_settings
  SET job_next_number = v_next_num + 1
  WHERE user_id = p_user_id;

  -- If no settings exist, create them
  IF NOT FOUND THEN
    INSERT INTO public.business_settings (user_id, job_prefix, job_next_number)
    VALUES (p_user_id, 'JOB-', 1002);
  END IF;

  RETURN v_job_number;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- TRIGGER - Track job status changes
-- ============================================================
CREATE OR REPLACE FUNCTION log_job_status_change()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.status IS DISTINCT FROM NEW.status THEN
    INSERT INTO public.job_status_history (job_id, from_status, to_status, changed_by)
    VALUES (NEW.id, OLD.status, NEW.status, auth.uid());
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS job_status_change_trigger ON public.jobs;
CREATE TRIGGER job_status_change_trigger
  AFTER UPDATE ON public.jobs
  FOR EACH ROW
  EXECUTE FUNCTION log_job_status_change();

-- ============================================================
-- TRIGGER - Update customer stats
-- ============================================================
CREATE OR REPLACE FUNCTION update_customer_stats()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' OR TG_OP = 'UPDATE' THEN
    UPDATE public.customers
    SET
      total_jobs = (SELECT COUNT(*) FROM public.jobs WHERE customer_id = NEW.customer_id),
      total_spent = (SELECT COALESCE(SUM(total_paid), 0) FROM public.jobs WHERE customer_id = NEW.customer_id),
      updated_at = NOW()
    WHERE id = NEW.customer_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS update_customer_stats_trigger ON public.jobs;
CREATE TRIGGER update_customer_stats_trigger
  AFTER INSERT OR UPDATE ON public.jobs
  FOR EACH ROW
  WHEN (NEW.customer_id IS NOT NULL)
  EXECUTE FUNCTION update_customer_stats();

-- ============================================================
-- TRIGGER - Update contractor stats
-- ============================================================
CREATE OR REPLACE FUNCTION update_contractor_stats()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status = 'completed' THEN
    UPDATE public.contractors
    SET
      total_jobs = (
        SELECT COUNT(*) FROM public.job_contractors
        WHERE contractor_id = NEW.contractor_id AND status = 'completed'
      ),
      total_earned = (
        SELECT COALESCE(SUM(amount_paid), 0) FROM public.job_contractors
        WHERE contractor_id = NEW.contractor_id
      ),
      updated_at = NOW()
    WHERE id = NEW.contractor_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS update_contractor_stats_trigger ON public.job_contractors;
CREATE TRIGGER update_contractor_stats_trigger
  AFTER UPDATE ON public.job_contractors
  FOR EACH ROW
  EXECUTE FUNCTION update_contractor_stats();

-- ============================================================
-- INVOICE VIEWS TABLE - Track when customers view invoices
-- ============================================================
CREATE TABLE IF NOT EXISTS public.invoice_views (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id TEXT NOT NULL,
  invoice_number TEXT,
  customer_email TEXT,
  viewed_at TIMESTAMPTZ DEFAULT NOW(),
  ip_address TEXT,
  user_agent TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for fast lookups
CREATE INDEX IF NOT EXISTS idx_invoice_views_invoice_id ON public.invoice_views(invoice_id);
CREATE INDEX IF NOT EXISTS idx_invoice_views_viewed_at ON public.invoice_views(viewed_at DESC);

-- Enable RLS
ALTER TABLE public.invoice_views ENABLE ROW LEVEL SECURITY;

-- Allow service role full access
CREATE POLICY "invoice_views_service_all" ON public.invoice_views
  FOR ALL USING (auth.role() = 'service_role');

-- Grant permissions
GRANT ALL ON public.invoice_views TO service_role;

COMMENT ON TABLE public.invoice_views IS 'Tracks when customers view invoices via tracking links';
