-- =============================================
-- Project Management Schema
-- Adds CRM, customer tracking, and payment integration
-- Run this in Supabase SQL Editor
-- =============================================

-- =============================================
-- STEP 1: Add project management columns to room_designs
-- =============================================

-- Project status tracking
ALTER TABLE room_designs
ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'draft'
CHECK (status IN ('draft', 'quoted', 'sent', 'viewed', 'approved', 'paid', 'in_progress', 'completed', 'cancelled'));

-- Customer association
ALTER TABLE room_designs
ADD COLUMN IF NOT EXISTS customer_id UUID REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE room_designs
ADD COLUMN IF NOT EXISTS customer_name TEXT;

ALTER TABLE room_designs
ADD COLUMN IF NOT EXISTS customer_email TEXT;

ALTER TABLE room_designs
ADD COLUMN IF NOT EXISTS customer_phone TEXT;

ALTER TABLE room_designs
ADD COLUMN IF NOT EXISTS customer_address TEXT;

-- Link to leads table
ALTER TABLE room_designs
ADD COLUMN IF NOT EXISTS lead_id UUID;

-- Quote tracking
ALTER TABLE room_designs
ADD COLUMN IF NOT EXISTS quote_version INTEGER DEFAULT 1;

ALTER TABLE room_designs
ADD COLUMN IF NOT EXISTS quote_sent_at TIMESTAMPTZ;

ALTER TABLE room_designs
ADD COLUMN IF NOT EXISTS quote_viewed_at TIMESTAMPTZ;

ALTER TABLE room_designs
ADD COLUMN IF NOT EXISTS quote_approved_at TIMESTAMPTZ;

ALTER TABLE room_designs
ADD COLUMN IF NOT EXISTS quote_expires_at TIMESTAMPTZ;

ALTER TABLE room_designs
ADD COLUMN IF NOT EXISTS quote_notes TEXT;

-- Payment tracking
ALTER TABLE room_designs
ADD COLUMN IF NOT EXISTS payment_status TEXT DEFAULT 'unpaid'
CHECK (payment_status IN ('unpaid', 'deposit_paid', 'partial', 'paid', 'refunded'));

ALTER TABLE room_designs
ADD COLUMN IF NOT EXISTS deposit_amount NUMERIC(10,2);

ALTER TABLE room_designs
ADD COLUMN IF NOT EXISTS amount_paid NUMERIC(10,2) DEFAULT 0;

ALTER TABLE room_designs
ADD COLUMN IF NOT EXISTS stripe_payment_intent_id TEXT;

ALTER TABLE room_designs
ADD COLUMN IF NOT EXISTS stripe_customer_id TEXT;

-- Project dates
ALTER TABLE room_designs
ADD COLUMN IF NOT EXISTS scheduled_date DATE;

ALTER TABLE room_designs
ADD COLUMN IF NOT EXISTS completed_date DATE;

-- Assigned staff
ALTER TABLE room_designs
ADD COLUMN IF NOT EXISTS assigned_to UUID REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE room_designs
ADD COLUMN IF NOT EXISTS assigned_to_name TEXT;

-- =============================================
-- STEP 2: Create Project Activity Log (CRM)
-- =============================================

CREATE TABLE IF NOT EXISTS project_activities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES room_designs(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  activity_type TEXT NOT NULL,
  -- Types: created, updated, quote_sent, quote_viewed, quote_approved,
  --        payment_received, status_changed, note_added, assigned, scheduled
  description TEXT,
  metadata JSONB DEFAULT '{}',
  ip_address TEXT,
  user_agent TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS project_activities_project_idx ON project_activities(project_id);
CREATE INDEX IF NOT EXISTS project_activities_created_idx ON project_activities(created_at DESC);
CREATE INDEX IF NOT EXISTS project_activities_type_idx ON project_activities(activity_type);

-- =============================================
-- STEP 3: Create Quote Versions Table
-- =============================================

CREATE TABLE IF NOT EXISTS quote_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES room_designs(id) ON DELETE CASCADE,
  version_number INTEGER NOT NULL,
  elements JSONB NOT NULL,
  quote_total NUMERIC(10,2),
  quote_breakdown JSONB,
  pricing_config JSONB,
  notes TEXT,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS quote_versions_project_idx ON quote_versions(project_id);
CREATE UNIQUE INDEX IF NOT EXISTS quote_versions_project_version_idx ON quote_versions(project_id, version_number);

-- =============================================
-- STEP 4: Create Payments Table
-- =============================================

CREATE TABLE IF NOT EXISTS project_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES room_designs(id) ON DELETE CASCADE,
  stripe_payment_intent_id TEXT UNIQUE,
  stripe_charge_id TEXT,
  amount NUMERIC(10,2) NOT NULL,
  payment_type TEXT NOT NULL, -- deposit, partial, final, refund
  status TEXT DEFAULT 'pending', -- pending, succeeded, failed, refunded
  customer_email TEXT,
  receipt_url TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS project_payments_project_idx ON project_payments(project_id);
CREATE INDEX IF NOT EXISTS project_payments_stripe_idx ON project_payments(stripe_payment_intent_id);

-- =============================================
-- STEP 5: Create Customer Portal Tokens
-- =============================================

CREATE TABLE IF NOT EXISTS customer_portal_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES room_designs(id) ON DELETE CASCADE,
  token TEXT UNIQUE NOT NULL,
  customer_email TEXT NOT NULL,
  permissions TEXT[] DEFAULT ARRAY['view', 'approve', 'pay'],
  expires_at TIMESTAMPTZ,
  last_accessed_at TIMESTAMPTZ,
  access_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS customer_portal_tokens_token_idx ON customer_portal_tokens(token);
CREATE INDEX IF NOT EXISTS customer_portal_tokens_project_idx ON customer_portal_tokens(project_id);

-- =============================================
-- STEP 6: Enable RLS on new tables
-- =============================================

ALTER TABLE project_activities ENABLE ROW LEVEL SECURITY;
ALTER TABLE quote_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE customer_portal_tokens ENABLE ROW LEVEL SECURITY;

-- Project Activities: Users can view activities for their projects
CREATE POLICY "project_activities_select" ON project_activities
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM room_designs rd
      WHERE rd.id = project_activities.project_id
      AND (rd.user_id = auth.uid() OR rd.customer_id = auth.uid())
    )
  );

CREATE POLICY "project_activities_insert" ON project_activities
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM room_designs rd
      WHERE rd.id = project_activities.project_id
      AND rd.user_id = auth.uid()
    )
    OR auth.uid() IS NOT NULL
  );

-- Quote Versions: Users can view versions for their projects
CREATE POLICY "quote_versions_select" ON quote_versions
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM room_designs rd
      WHERE rd.id = quote_versions.project_id
      AND (rd.user_id = auth.uid() OR rd.customer_id = auth.uid())
    )
  );

CREATE POLICY "quote_versions_insert" ON quote_versions
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM room_designs rd
      WHERE rd.id = quote_versions.project_id
      AND rd.user_id = auth.uid()
    )
  );

-- Payments: Users can view payments for their projects
CREATE POLICY "project_payments_select" ON project_payments
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM room_designs rd
      WHERE rd.id = project_payments.project_id
      AND (rd.user_id = auth.uid() OR rd.customer_id = auth.uid())
    )
  );

-- Service role can insert payments (from webhooks)
CREATE POLICY "project_payments_insert_service" ON project_payments
  FOR INSERT WITH CHECK (true);

-- Portal tokens: Anyone with valid token can access
CREATE POLICY "customer_portal_tokens_select" ON customer_portal_tokens
  FOR SELECT USING (true);

CREATE POLICY "customer_portal_tokens_insert" ON customer_portal_tokens
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM room_designs rd
      WHERE rd.id = customer_portal_tokens.project_id
      AND rd.user_id = auth.uid()
    )
  );

-- =============================================
-- STEP 7: Create helper functions
-- =============================================

-- Function to log project activity
CREATE OR REPLACE FUNCTION log_project_activity(
  p_project_id UUID,
  p_activity_type TEXT,
  p_description TEXT DEFAULT NULL,
  p_metadata JSONB DEFAULT '{}'
)
RETURNS UUID AS $$
DECLARE
  activity_id UUID;
BEGIN
  INSERT INTO project_activities (project_id, user_id, activity_type, description, metadata)
  VALUES (p_project_id, auth.uid(), p_activity_type, p_description, p_metadata)
  RETURNING id INTO activity_id;

  RETURN activity_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to create quote version snapshot
CREATE OR REPLACE FUNCTION create_quote_version(p_project_id UUID)
RETURNS INTEGER AS $$
DECLARE
  new_version INTEGER;
  project_record RECORD;
BEGIN
  -- Get current version number
  SELECT COALESCE(MAX(version_number), 0) + 1 INTO new_version
  FROM quote_versions WHERE project_id = p_project_id;

  -- Get project data
  SELECT * INTO project_record FROM room_designs WHERE id = p_project_id;

  -- Insert version
  INSERT INTO quote_versions (project_id, version_number, elements, quote_total, quote_breakdown, pricing_config, created_by)
  VALUES (
    p_project_id,
    new_version,
    project_record.elements,
    project_record.quote_total,
    project_record.quote_breakdown,
    project_record.settings->'pricing_config',
    auth.uid()
  );

  -- Update project version number
  UPDATE room_designs SET quote_version = new_version WHERE id = p_project_id;

  -- Log activity
  PERFORM log_project_activity(p_project_id, 'quote_version_created', 'Quote version ' || new_version || ' created');

  RETURN new_version;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to generate customer portal token
CREATE OR REPLACE FUNCTION generate_customer_portal_token(
  p_project_id UUID,
  p_customer_email TEXT,
  p_expires_days INTEGER DEFAULT 30
)
RETURNS TEXT AS $$
DECLARE
  new_token TEXT;
BEGIN
  -- Generate unique token
  new_token := encode(gen_random_bytes(16), 'hex');

  -- Insert token record
  INSERT INTO customer_portal_tokens (project_id, token, customer_email, expires_at)
  VALUES (p_project_id, new_token, p_customer_email, NOW() + (p_expires_days || ' days')::INTERVAL);

  -- Update project with customer email
  UPDATE room_designs
  SET customer_email = p_customer_email,
      status = CASE WHEN status = 'draft' THEN 'quoted' ELSE status END
  WHERE id = p_project_id;

  -- Log activity
  PERFORM log_project_activity(p_project_id, 'portal_token_created', 'Customer portal link created for ' || p_customer_email);

  RETURN new_token;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to record quote view
CREATE OR REPLACE FUNCTION record_quote_view(p_token TEXT)
RETURNS BOOLEAN AS $$
DECLARE
  token_record RECORD;
BEGIN
  -- Get and validate token
  SELECT * INTO token_record FROM customer_portal_tokens
  WHERE token = p_token AND (expires_at IS NULL OR expires_at > NOW());

  IF token_record IS NULL THEN
    RETURN FALSE;
  END IF;

  -- Update token access
  UPDATE customer_portal_tokens
  SET last_accessed_at = NOW(), access_count = access_count + 1
  WHERE token = p_token;

  -- Update project viewed timestamp (only first time)
  UPDATE room_designs
  SET quote_viewed_at = COALESCE(quote_viewed_at, NOW()),
      status = CASE WHEN status IN ('quoted', 'sent') THEN 'viewed' ELSE status END
  WHERE id = token_record.project_id;

  -- Log activity
  PERFORM log_project_activity(token_record.project_id, 'quote_viewed', 'Quote viewed by customer');

  RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =============================================
-- STEP 8: Create indexes for performance
-- =============================================

CREATE INDEX IF NOT EXISTS room_designs_status_idx ON room_designs(status);
CREATE INDEX IF NOT EXISTS room_designs_customer_email_idx ON room_designs(customer_email);
CREATE INDEX IF NOT EXISTS room_designs_payment_status_idx ON room_designs(payment_status);
CREATE INDEX IF NOT EXISTS room_designs_assigned_to_idx ON room_designs(assigned_to);

-- =============================================
-- STEP 9: Grant permissions
-- =============================================

GRANT ALL ON project_activities TO authenticated;
GRANT ALL ON quote_versions TO authenticated;
GRANT ALL ON project_payments TO authenticated;
GRANT ALL ON customer_portal_tokens TO authenticated;
GRANT SELECT ON project_activities TO anon;
GRANT SELECT ON customer_portal_tokens TO anon;

GRANT EXECUTE ON FUNCTION log_project_activity TO authenticated;
GRANT EXECUTE ON FUNCTION create_quote_version TO authenticated;
GRANT EXECUTE ON FUNCTION generate_customer_portal_token TO authenticated;
GRANT EXECUTE ON FUNCTION record_quote_view TO anon;
GRANT EXECUTE ON FUNCTION record_quote_view TO authenticated;

-- =============================================
-- VERIFICATION
-- =============================================

SELECT 'Migration 010 completed successfully' AS status;

-- Show new columns on room_designs
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'room_designs'
AND column_name IN ('status', 'customer_email', 'payment_status', 'quote_sent_at', 'assigned_to')
ORDER BY column_name;
