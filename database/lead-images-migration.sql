-- =====================================================
-- LEAD IMAGES SUPPORT MIGRATION
-- Adds image upload capability to leads for customer project photos
-- Run this in Supabase SQL Editor
-- =====================================================

-- Add images column to leads table (for admin panel leads)
ALTER TABLE leads
ADD COLUMN IF NOT EXISTS images JSONB DEFAULT '[]'::jsonb,
ADD COLUMN IF NOT EXISTS image_urls TEXT[] DEFAULT '{}',
ADD COLUMN IF NOT EXISTS assigned_to UUID REFERENCES auth.users(id),
ADD COLUMN IF NOT EXISTS assigned_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS assigned_by UUID REFERENCES auth.users(id),
ADD COLUMN IF NOT EXISTS assignment_type TEXT DEFAULT 'manual' CHECK (assignment_type IN ('manual', 'auto', 'purchased')),
ADD COLUMN IF NOT EXISTS assignment_notes TEXT,
ADD COLUMN IF NOT EXISTS vendor_id UUID,
ADD COLUMN IF NOT EXISTS location_city TEXT,
ADD COLUMN IF NOT EXISTS location_state TEXT DEFAULT 'AZ';

-- Add images column to vendor_leads table (for vendor ecosystem)
ALTER TABLE vendor_leads
ADD COLUMN IF NOT EXISTS images JSONB DEFAULT '[]'::jsonb,
ADD COLUMN IF NOT EXISTS image_urls TEXT[] DEFAULT '{}',
ADD COLUMN IF NOT EXISTS assigned_vendor_id UUID REFERENCES vendor_profiles(id),
ADD COLUMN IF NOT EXISTS assigned_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS assigned_by UUID REFERENCES auth.users(id),
ADD COLUMN IF NOT EXISTS assignment_type TEXT DEFAULT 'manual' CHECK (assignment_type IN ('manual', 'auto', 'purchased', 'subscription'));

-- Create index for faster queries on assigned leads
CREATE INDEX IF NOT EXISTS idx_leads_assigned_to ON leads(assigned_to) WHERE assigned_to IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_vendor_leads_assigned ON vendor_leads(assigned_vendor_id) WHERE assigned_vendor_id IS NOT NULL;

-- =====================================================
-- LEAD IMAGES STORAGE TABLE
-- Stores individual image metadata for leads
-- =====================================================
CREATE TABLE IF NOT EXISTS lead_images (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  lead_id UUID NOT NULL,
  lead_table TEXT NOT NULL DEFAULT 'leads' CHECK (lead_table IN ('leads', 'vendor_leads')),

  -- File info
  file_name TEXT NOT NULL,
  file_url TEXT NOT NULL,
  file_size INTEGER,
  mime_type TEXT,

  -- Image metadata
  width INTEGER,
  height INTEGER,
  description TEXT,
  category TEXT DEFAULT 'project' CHECK (category IN ('project', 'before', 'inspiration', 'blueprint', 'damage', 'other')),

  -- Storage info
  storage_bucket TEXT DEFAULT 'lead-images',
  storage_path TEXT NOT NULL,

  -- Status
  is_primary BOOLEAN DEFAULT false,
  is_processed BOOLEAN DEFAULT false,

  uploaded_at TIMESTAMPTZ DEFAULT NOW(),
  uploaded_by UUID
);

-- Create index for faster lookups by lead
CREATE INDEX IF NOT EXISTS idx_lead_images_lead ON lead_images(lead_id, lead_table);

-- =====================================================
-- LEAD ASSIGNMENT HISTORY TABLE
-- Tracks all lead assignments for audit and analytics
-- =====================================================
CREATE TABLE IF NOT EXISTS lead_assignments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  lead_id UUID NOT NULL,
  lead_table TEXT NOT NULL DEFAULT 'leads' CHECK (lead_table IN ('leads', 'vendor_leads')),

  -- Assignment details
  assigned_to UUID REFERENCES auth.users(id),
  vendor_id UUID REFERENCES vendor_profiles(id),
  assigned_by UUID REFERENCES auth.users(id),
  assignment_type TEXT NOT NULL CHECK (assignment_type IN ('manual', 'auto', 'purchased', 'subscription', 'reassign')),

  -- Status tracking
  status TEXT DEFAULT 'assigned' CHECK (status IN ('assigned', 'accepted', 'rejected', 'expired', 'completed')),
  status_changed_at TIMESTAMPTZ,

  -- Pricing
  lead_price DECIMAL(8,2),
  was_charged BOOLEAN DEFAULT false,

  -- Notes
  notes TEXT,
  rejection_reason TEXT,

  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for lead assignments
CREATE INDEX IF NOT EXISTS idx_lead_assignments_lead ON lead_assignments(lead_id, lead_table);
CREATE INDEX IF NOT EXISTS idx_lead_assignments_vendor ON lead_assignments(vendor_id) WHERE vendor_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_lead_assignments_user ON lead_assignments(assigned_to) WHERE assigned_to IS NOT NULL;

-- =====================================================
-- AUTO-ASSIGNMENT RULES TABLE
-- Configures automatic lead distribution by ZIP/area
-- =====================================================
CREATE TABLE IF NOT EXISTS lead_auto_assignment_rules (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

  -- Rule criteria
  zip_codes TEXT[] DEFAULT '{}', -- ZIP codes this rule applies to
  project_types TEXT[] DEFAULT '{}', -- Project types (empty = all)
  min_budget TEXT, -- Minimum budget tier

  -- Assignment target
  vendor_id UUID REFERENCES vendor_profiles(id),
  user_id UUID REFERENCES auth.users(id),

  -- Rule settings
  priority INTEGER DEFAULT 10, -- Lower = higher priority
  max_leads_per_day INTEGER DEFAULT 10,
  max_leads_per_month INTEGER,
  is_active BOOLEAN DEFAULT true,

  -- Usage tracking
  leads_assigned_today INTEGER DEFAULT 0,
  leads_assigned_month INTEGER DEFAULT 0,
  last_assigned_at TIMESTAMPTZ,
  last_reset_at TIMESTAMPTZ DEFAULT NOW(),

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create index for rule matching
CREATE INDEX IF NOT EXISTS idx_auto_assignment_active ON lead_auto_assignment_rules(is_active, priority) WHERE is_active = true;

-- =====================================================
-- FUNCTIONS FOR AUTO-ASSIGNMENT
-- =====================================================

-- Function to find matching vendors for a lead based on ZIP code
CREATE OR REPLACE FUNCTION find_matching_vendors_for_lead(
  p_zip_code TEXT,
  p_project_type TEXT DEFAULT NULL,
  p_limit INTEGER DEFAULT 5
)
RETURNS TABLE (
  vendor_id UUID,
  business_name TEXT,
  priority INTEGER,
  subscription_plan TEXT,
  leads_remaining INTEGER
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    vp.id as vendor_id,
    vp.business_name,
    CASE
      WHEN sp.lead_priority = 'first' THEN 1
      WHEN sp.lead_priority = 'priority' THEN 2
      WHEN sp.lead_priority = 'standard' THEN 3
      ELSE 4
    END as priority,
    sp.name as subscription_plan,
    (COALESCE(sp.leads_per_month, 50) - COALESCE(vs.leads_used_this_period, 0)) as leads_remaining
  FROM vendor_profiles vp
  JOIN vendor_subscriptions vs ON vs.vendor_id = vp.id
  JOIN subscription_plans sp ON sp.id = vs.plan_id
  JOIN service_areas sa ON sa.vendor_id = vp.id
  WHERE
    vp.is_active = true
    AND vs.status = 'active'
    AND sa.zip_code = p_zip_code
    AND sa.is_active = true
    AND (sp.leads_per_month IS NULL OR vs.leads_used_this_period < sp.leads_per_month)
    AND (p_project_type IS NULL OR p_project_type = ANY(vp.specialties))
  ORDER BY priority, leads_remaining DESC
  LIMIT p_limit;
END;
$$ LANGUAGE plpgsql;

-- Function to auto-assign a lead
CREATE OR REPLACE FUNCTION auto_assign_lead(
  p_lead_id UUID,
  p_lead_table TEXT,
  p_zip_code TEXT,
  p_project_type TEXT DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
  v_vendor_id UUID;
  v_user_id UUID;
BEGIN
  -- First check auto-assignment rules
  SELECT vendor_id, user_id INTO v_vendor_id, v_user_id
  FROM lead_auto_assignment_rules
  WHERE
    is_active = true
    AND (zip_codes = '{}' OR p_zip_code = ANY(zip_codes))
    AND (project_types = '{}' OR p_project_type = ANY(project_types))
    AND (max_leads_per_day IS NULL OR leads_assigned_today < max_leads_per_day)
  ORDER BY priority
  LIMIT 1;

  -- If no rule found, try vendor matching
  IF v_vendor_id IS NULL THEN
    SELECT vendor_id INTO v_vendor_id
    FROM find_matching_vendors_for_lead(p_zip_code, p_project_type, 1);
  END IF;

  -- Record the assignment if vendor found
  IF v_vendor_id IS NOT NULL THEN
    INSERT INTO lead_assignments (lead_id, lead_table, vendor_id, assigned_to, assignment_type)
    VALUES (p_lead_id, p_lead_table, v_vendor_id, v_user_id, 'auto');

    -- Update lead table
    IF p_lead_table = 'leads' THEN
      UPDATE leads SET
        assigned_to = v_user_id,
        vendor_id = v_vendor_id,
        assigned_at = NOW(),
        assignment_type = 'auto'
      WHERE id = p_lead_id;
    ELSIF p_lead_table = 'vendor_leads' THEN
      UPDATE vendor_leads SET
        assigned_vendor_id = v_vendor_id,
        assigned_at = NOW(),
        assignment_type = 'auto'
      WHERE id = p_lead_id;
    END IF;
  END IF;

  RETURN v_vendor_id;
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- STORAGE BUCKET SETUP
-- Run this in Supabase Dashboard > Storage
-- =====================================================
-- 1. Create bucket: lead-images
-- 2. Make it public for read access
-- 3. Set allowed MIME types: image/jpeg, image/png, image/webp, image/heic
-- 4. Set max file size: 10MB

-- RLS Policies for lead_images
ALTER TABLE lead_images ENABLE ROW LEVEL SECURITY;

-- Anyone can insert images (needed for form submissions)
CREATE POLICY "Anyone can upload lead images" ON lead_images
  FOR INSERT WITH CHECK (true);

-- Only admins and assigned vendors can view images
CREATE POLICY "Admins and assigned vendors can view images" ON lead_images
  FOR SELECT USING (
    auth.uid() IN (
      SELECT id FROM auth.users WHERE raw_user_meta_data->>'role' = 'admin'
    )
    OR
    EXISTS (
      SELECT 1 FROM leads l
      WHERE l.id = lead_images.lead_id
      AND (l.assigned_to = auth.uid() OR l.vendor_id::text = auth.uid()::text)
    )
    OR
    EXISTS (
      SELECT 1 FROM vendor_leads vl
      WHERE vl.id = lead_images.lead_id
      AND vl.assigned_vendor_id::text = auth.uid()::text
    )
  );

-- RLS for lead_assignments
ALTER TABLE lead_assignments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage all assignments" ON lead_assignments
  FOR ALL USING (
    auth.uid() IN (
      SELECT id FROM auth.users WHERE raw_user_meta_data->>'role' = 'admin'
    )
  );

CREATE POLICY "Vendors can view their assignments" ON lead_assignments
  FOR SELECT USING (
    vendor_id::text = auth.uid()::text OR assigned_to = auth.uid()
  );

-- RLS for auto-assignment rules (admin only)
ALTER TABLE lead_auto_assignment_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Only admins can manage auto-assignment rules" ON lead_auto_assignment_rules
  FOR ALL USING (
    auth.uid() IN (
      SELECT id FROM auth.users WHERE raw_user_meta_data->>'role' = 'admin'
    )
  );

-- =====================================================
-- DONE!
-- =====================================================
COMMENT ON TABLE lead_images IS 'Stores images uploaded with lead submissions';
COMMENT ON TABLE lead_assignments IS 'Tracks lead assignment history and status';
COMMENT ON TABLE lead_auto_assignment_rules IS 'Configures automatic lead distribution rules';
