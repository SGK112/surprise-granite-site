-- ============================================================
-- PROJECTS CONSOLIDATION MIGRATION
-- Absorbs Jobs + Leads functionality into unified Projects
-- Run this in Supabase SQL Editor
-- ============================================================

-- ============================================================
-- PHASE 1: Add job-specific columns to projects table
-- ============================================================

-- Job identification
ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS job_number TEXT,
  ADD COLUMN IF NOT EXISTS legacy_job_id UUID;

-- Job site address (if different from customer address)
ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS job_address TEXT,
  ADD COLUMN IF NOT EXISTS job_city TEXT,
  ADD COLUMN IF NOT EXISTS job_state TEXT,
  ADD COLUMN IF NOT EXISTS job_zip TEXT;

-- Material tracking
ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS material_name TEXT,
  ADD COLUMN IF NOT EXISTS material_supplier TEXT,
  ADD COLUMN IF NOT EXISTS material_color TEXT,
  ADD COLUMN IF NOT EXISTS material_thickness TEXT,
  ADD COLUMN IF NOT EXISTS material_sqft DECIMAL(10,2),
  ADD COLUMN IF NOT EXISTS material_status TEXT DEFAULT 'none'
    CHECK (material_status IN ('none', 'pending', 'ordered', 'confirmed', 'shipped', 'received', 'inspected', 'issue')),
  ADD COLUMN IF NOT EXISTS material_ordered_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS material_received_at TIMESTAMPTZ;

-- Enhanced financial tracking
ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS contract_amount DECIMAL(12,2),
  ADD COLUMN IF NOT EXISTS deposit_amount DECIMAL(12,2),
  ADD COLUMN IF NOT EXISTS deposit_paid BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS deposit_paid_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS balance_due DECIMAL(12,2),
  ADD COLUMN IF NOT EXISTS total_paid DECIMAL(12,2) DEFAULT 0;

-- Scheduling fields
ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS field_measure_date TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS field_measure_notes TEXT,
  ADD COLUMN IF NOT EXISTS install_date TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS install_notes TEXT;

-- External references
ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS stripe_invoice_id TEXT,
  ADD COLUMN IF NOT EXISTS stripe_payment_intent_id TEXT,
  ADD COLUMN IF NOT EXISTS moraware_job_id TEXT,
  ADD COLUMN IF NOT EXISTS external_reference TEXT;

-- Lead/opportunity tracking
ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS lead_id UUID,
  ADD COLUMN IF NOT EXISTS lead_source TEXT,
  ADD COLUMN IF NOT EXISTS lead_price DECIMAL(10,2);

-- Customer portal access
ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS portal_token TEXT UNIQUE,
  ADD COLUMN IF NOT EXISTS portal_pin TEXT,
  ADD COLUMN IF NOT EXISTS portal_enabled BOOLEAN DEFAULT true;

-- Customer ID reference
ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS customer_id UUID;

-- Update status check to include more granular statuses
ALTER TABLE public.projects DROP CONSTRAINT IF EXISTS projects_status_check;
ALTER TABLE public.projects ADD CONSTRAINT projects_status_check
  CHECK (status IN (
    'lead',              -- Initial opportunity
    'contacted',         -- Lead contacted
    'qualified',         -- Lead qualified
    'approved',          -- Estimate approved
    'deposit_paid',      -- Deposit received
    'material_ordered',  -- Materials ordered
    'material_received', -- Materials in warehouse
    'scheduled',         -- Installation scheduled
    'in_progress',       -- Work in progress
    'completed',         -- Job complete
    'on_hold',           -- Paused
    'cancelled'          -- Cancelled
  ));

-- Create unique index for job numbers
CREATE UNIQUE INDEX IF NOT EXISTS projects_job_number_idx ON public.projects(user_id, job_number) WHERE job_number IS NOT NULL;

-- Create indexes for new columns
CREATE INDEX IF NOT EXISTS projects_lead_id_idx ON public.projects(lead_id);
CREATE INDEX IF NOT EXISTS projects_customer_id_idx ON public.projects(customer_id);
CREATE INDEX IF NOT EXISTS projects_portal_token_idx ON public.projects(portal_token);
CREATE INDEX IF NOT EXISTS projects_stripe_invoice_idx ON public.projects(stripe_invoice_id);
CREATE INDEX IF NOT EXISTS projects_material_status_idx ON public.projects(material_status);

-- ============================================================
-- PHASE 2: Create project_contractors table
-- ============================================================

CREATE TABLE IF NOT EXISTS public.project_contractors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  contractor_id UUID NOT NULL REFERENCES public.contractors(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Role on this project
  role TEXT DEFAULT 'installer' CHECK (role IN ('installer', 'fabricator', 'measurer', 'helper', 'subcontractor')),

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
    'in_progress', -- Work in progress
    'completed',  -- Work finished
    'removed'     -- Removed from project
  )),
  responded_at TIMESTAMPTZ,
  decline_reason TEXT,

  -- Payment
  agreed_rate DECIMAL(10,2),
  rate_type TEXT DEFAULT 'flat' CHECK (rate_type IN ('flat', 'hourly', 'sqft', 'daily')),
  estimated_hours DECIMAL(10,2),
  actual_hours DECIMAL(10,2),
  amount_paid DECIMAL(10,2) DEFAULT 0,

  -- Notes
  notes TEXT,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(project_id, contractor_id)
);

-- Enable RLS
ALTER TABLE public.project_contractors ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "project_contractors_select_own" ON public.project_contractors
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "project_contractors_insert_own" ON public.project_contractors
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "project_contractors_update_own" ON public.project_contractors
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "project_contractors_delete_own" ON public.project_contractors
  FOR DELETE USING (auth.uid() = user_id);

CREATE POLICY "project_contractors_service_all" ON public.project_contractors
  FOR ALL USING (auth.role() = 'service_role');

-- Allow contractors to view their own assignments
CREATE POLICY "project_contractors_contractor_view" ON public.project_contractors
  FOR SELECT USING (
    contractor_id IN (
      SELECT id FROM public.contractors WHERE email = auth.email()
    )
  );

GRANT ALL ON public.project_contractors TO authenticated;
GRANT ALL ON public.project_contractors TO service_role;

-- Indexes
CREATE INDEX IF NOT EXISTS project_contractors_project_idx ON public.project_contractors(project_id);
CREATE INDEX IF NOT EXISTS project_contractors_contractor_idx ON public.project_contractors(contractor_id);
CREATE INDEX IF NOT EXISTS project_contractors_token_idx ON public.project_contractors(invite_token);
CREATE INDEX IF NOT EXISTS project_contractors_status_idx ON public.project_contractors(status);

-- ============================================================
-- PHASE 3: Create project_material_orders table
-- ============================================================

CREATE TABLE IF NOT EXISTS public.project_material_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Order Details
  order_number TEXT,
  vendor_id UUID,
  vendor_name TEXT,

  -- Items (JSONB array)
  items JSONB DEFAULT '[]',
  -- items structure: [{ name, color, thickness, quantity, unit, unit_cost, total }]

  -- Status
  status TEXT DEFAULT 'pending' CHECK (status IN (
    'pending',      -- Need to order
    'ordered',      -- Order placed
    'confirmed',    -- Supplier confirmed
    'shipped',      -- In transit
    'received',     -- At warehouse
    'inspected',    -- Quality checked
    'issue',        -- Problem with order
    'cancelled'     -- Order cancelled
  )),

  -- Dates
  ordered_at TIMESTAMPTZ,
  expected_delivery DATE,
  received_at TIMESTAMPTZ,

  -- Pricing
  subtotal DECIMAL(12,2),
  tax DECIMAL(12,2),
  shipping DECIMAL(12,2),
  total_amount DECIMAL(12,2),

  -- Communication
  confirmation_number TEXT,
  tracking_number TEXT,
  supplier_notes TEXT,

  -- Notes
  notes TEXT,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.project_material_orders ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "project_material_orders_select_own" ON public.project_material_orders
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "project_material_orders_insert_own" ON public.project_material_orders
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "project_material_orders_update_own" ON public.project_material_orders
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "project_material_orders_delete_own" ON public.project_material_orders
  FOR DELETE USING (auth.uid() = user_id);

CREATE POLICY "project_material_orders_service_all" ON public.project_material_orders
  FOR ALL USING (auth.role() = 'service_role');

GRANT ALL ON public.project_material_orders TO authenticated;
GRANT ALL ON public.project_material_orders TO service_role;

-- Indexes
CREATE INDEX IF NOT EXISTS project_material_orders_project_idx ON public.project_material_orders(project_id);
CREATE INDEX IF NOT EXISTS project_material_orders_status_idx ON public.project_material_orders(status);
CREATE INDEX IF NOT EXISTS project_material_orders_vendor_idx ON public.project_material_orders(vendor_id);

-- ============================================================
-- PHASE 4: Create project_status_history table
-- ============================================================

CREATE TABLE IF NOT EXISTS public.project_status_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,

  -- Status Change
  from_status TEXT,
  to_status TEXT NOT NULL,
  changed_by UUID REFERENCES auth.users(id),
  changed_by_name TEXT,

  -- Details
  notes TEXT,

  -- Timestamp
  changed_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.project_status_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "project_status_history_service_all" ON public.project_status_history
  FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "project_status_history_select" ON public.project_status_history
  FOR SELECT USING (
    project_id IN (SELECT id FROM public.projects WHERE user_id = auth.uid())
  );

CREATE POLICY "project_status_history_insert" ON public.project_status_history
  FOR INSERT WITH CHECK (
    project_id IN (SELECT id FROM public.projects WHERE user_id = auth.uid())
  );

GRANT ALL ON public.project_status_history TO authenticated;
GRANT ALL ON public.project_status_history TO service_role;

CREATE INDEX IF NOT EXISTS project_status_history_project_idx ON public.project_status_history(project_id);
CREATE INDEX IF NOT EXISTS project_status_history_changed_at_idx ON public.project_status_history(changed_at);

-- ============================================================
-- PHASE 5: Trigger to log project status changes
-- ============================================================

CREATE OR REPLACE FUNCTION log_project_status_change()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.status IS DISTINCT FROM NEW.status THEN
    INSERT INTO public.project_status_history (project_id, from_status, to_status, changed_by)
    VALUES (NEW.id, OLD.status, NEW.status, auth.uid());

    -- Auto-update timestamps based on status
    CASE NEW.status
      WHEN 'approved' THEN NEW.approved_at := COALESCE(NEW.approved_at, NOW());
      WHEN 'scheduled' THEN NEW.scheduled_at := COALESCE(NEW.scheduled_at, NOW());
      WHEN 'in_progress' THEN NEW.started_at := COALESCE(NEW.started_at, NOW());
      WHEN 'completed' THEN
        NEW.completed_at := COALESCE(NEW.completed_at, NOW());
        NEW.progress := 100;
      ELSE NULL;
    END CASE;
  END IF;

  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS project_status_change_trigger ON public.projects;
CREATE TRIGGER project_status_change_trigger
  BEFORE UPDATE ON public.projects
  FOR EACH ROW
  EXECUTE FUNCTION log_project_status_change();

-- ============================================================
-- PHASE 6: Function to generate job number for projects
-- ============================================================

CREATE OR REPLACE FUNCTION generate_project_job_number(p_user_id UUID)
RETURNS TEXT AS $$
DECLARE
  v_prefix TEXT;
  v_next_num INTEGER;
  v_job_number TEXT;
BEGIN
  -- Get settings or use defaults
  SELECT job_prefix, job_next_number INTO v_prefix, v_next_num
  FROM public.business_settings
  WHERE user_id = p_user_id;

  IF v_prefix IS NULL THEN
    v_prefix := 'PRJ-';
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
    VALUES (p_user_id, 'PRJ-', 1002)
    ON CONFLICT (user_id) DO UPDATE SET job_next_number = 1002;
  END IF;

  RETURN v_job_number;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- PHASE 7: Function to generate portal token
-- ============================================================

CREATE OR REPLACE FUNCTION generate_project_portal_token()
RETURNS TEXT AS $$
BEGIN
  RETURN encode(gen_random_bytes(32), 'hex');
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- PHASE 8: Update project_collaborators to support customer role
-- ============================================================

-- Add 'customer' to valid roles if not already present
-- The collaboration.js already validates roles, we just need to ensure the table accepts it
ALTER TABLE public.project_collaborators DROP CONSTRAINT IF EXISTS project_collaborators_role_check;
-- Note: If there's no constraint, this is fine. The API validates roles.

-- Add customer-specific fields
ALTER TABLE public.project_collaborators
  ADD COLUMN IF NOT EXISTS portal_access BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS can_view_files BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS can_view_schedule BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS can_view_handoff BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS can_send_messages BOOLEAN DEFAULT true;

-- ============================================================
-- PHASE 9: Views for unified project dashboard
-- ============================================================

-- Drop existing view if it exists
DROP VIEW IF EXISTS public.unified_project_stats;

-- Create unified stats view
CREATE OR REPLACE VIEW public.unified_project_stats AS
SELECT
  user_id,
  COUNT(*) AS total_projects,
  COUNT(*) FILTER (WHERE status = 'lead') AS leads,
  COUNT(*) FILTER (WHERE status IN ('contacted', 'qualified')) AS qualified_leads,
  COUNT(*) FILTER (WHERE status = 'approved') AS approved,
  COUNT(*) FILTER (WHERE status = 'deposit_paid') AS deposit_paid,
  COUNT(*) FILTER (WHERE status IN ('material_ordered', 'material_received')) AS materials_pending,
  COUNT(*) FILTER (WHERE status = 'scheduled') AS scheduled,
  COUNT(*) FILTER (WHERE status = 'in_progress') AS in_progress,
  COUNT(*) FILTER (WHERE status = 'completed') AS completed,
  COUNT(*) FILTER (WHERE status = 'on_hold') AS on_hold,
  COUNT(*) FILTER (WHERE status = 'cancelled') AS cancelled,

  -- Financial metrics
  COALESCE(SUM(value) FILTER (WHERE status = 'completed'), 0) AS revenue,
  COALESCE(SUM(value) FILTER (WHERE status NOT IN ('completed', 'cancelled')), 0) AS pipeline_value,
  COALESCE(SUM(total_paid), 0) AS total_collected,
  COALESCE(SUM(balance_due) FILTER (WHERE status NOT IN ('completed', 'cancelled')), 0) AS total_outstanding
FROM public.projects
GROUP BY user_id;

GRANT SELECT ON public.unified_project_stats TO authenticated;

-- ============================================================
-- COMMENTS
-- ============================================================

COMMENT ON TABLE public.project_contractors IS 'Contractor assignments to projects (replaces job_contractors)';
COMMENT ON TABLE public.project_material_orders IS 'Material orders for projects (replaces material_orders linked to jobs)';
COMMENT ON TABLE public.project_status_history IS 'Audit log of project status changes';

COMMENT ON COLUMN public.projects.job_number IS 'Auto-generated job number for operational tracking';
COMMENT ON COLUMN public.projects.portal_token IS 'Unique token for customer portal access';
COMMENT ON COLUMN public.projects.material_status IS 'Current status of materials for this project';
COMMENT ON COLUMN public.projects.lead_id IS 'Reference to original lead if converted from lead';

-- ============================================================
-- PHASE 10: Add project_id to calendar_events
-- ============================================================

ALTER TABLE public.calendar_events
  ADD COLUMN IF NOT EXISTS project_id UUID REFERENCES public.projects(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS calendar_events_project_idx ON public.calendar_events(project_id);

COMMENT ON COLUMN public.calendar_events.project_id IS 'Link to project (replaces job_id for consistency)';
