-- =====================================================
-- INVITE TRACKING MIGRATION
-- Add columns to track invitation views and responses
-- =====================================================

-- Add viewed_at column to general_collaborators
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name = 'general_collaborators' AND column_name = 'viewed_at') THEN
    ALTER TABLE general_collaborators ADD COLUMN viewed_at TIMESTAMPTZ;
  END IF;
END $$;

-- Add declined_at column to general_collaborators
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name = 'general_collaborators' AND column_name = 'declined_at') THEN
    ALTER TABLE general_collaborators ADD COLUMN declined_at TIMESTAMPTZ;
  END IF;
END $$;

-- Add view_count column to general_collaborators
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name = 'general_collaborators' AND column_name = 'view_count') THEN
    ALTER TABLE general_collaborators ADD COLUMN view_count INTEGER DEFAULT 0;
  END IF;
END $$;

-- Add resent_at column to track when invitation was resent
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name = 'general_collaborators' AND column_name = 'resent_at') THEN
    ALTER TABLE general_collaborators ADD COLUMN resent_at TIMESTAMPTZ;
  END IF;
END $$;

-- Add same columns to project_collaborators
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name = 'project_collaborators' AND column_name = 'viewed_at') THEN
    ALTER TABLE project_collaborators ADD COLUMN viewed_at TIMESTAMPTZ;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name = 'project_collaborators' AND column_name = 'declined_at') THEN
    ALTER TABLE project_collaborators ADD COLUMN declined_at TIMESTAMPTZ;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name = 'project_collaborators' AND column_name = 'view_count') THEN
    ALTER TABLE project_collaborators ADD COLUMN view_count INTEGER DEFAULT 0;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name = 'project_collaborators' AND column_name = 'resent_at') THEN
    ALTER TABLE project_collaborators ADD COLUMN resent_at TIMESTAMPTZ;
  END IF;
END $$;

-- Index for finding unviewed invitations
CREATE INDEX IF NOT EXISTS idx_general_collaborators_unviewed
  ON general_collaborators(invited_by, status)
  WHERE viewed_at IS NULL AND status = 'pending';

CREATE INDEX IF NOT EXISTS idx_project_collaborators_unviewed
  ON project_collaborators(invited_by, invitation_status)
  WHERE viewed_at IS NULL AND invitation_status = 'pending';

COMMENT ON COLUMN general_collaborators.viewed_at IS 'Timestamp when the invite link was first opened';
COMMENT ON COLUMN general_collaborators.declined_at IS 'Timestamp when the invite was declined';
COMMENT ON COLUMN general_collaborators.view_count IS 'Number of times the invite link was opened';
COMMENT ON COLUMN general_collaborators.resent_at IS 'Timestamp when the invite was last resent';

-- =====================================================
-- LEAD CONVERSION TRACKING
-- Add columns to track lead-to-customer conversion
-- =====================================================

-- Add converted_at column to leads
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name = 'leads' AND column_name = 'converted_at') THEN
    ALTER TABLE leads ADD COLUMN converted_at TIMESTAMPTZ;
  END IF;
END $$;

-- Add customer_id column to leads (bidirectional reference)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name = 'leads' AND column_name = 'customer_id') THEN
    ALTER TABLE leads ADD COLUMN customer_id UUID REFERENCES customers(id) ON DELETE SET NULL;
  END IF;
END $$;

-- Add lead_id column to customers (bidirectional reference)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name = 'customers' AND column_name = 'lead_id') THEN
    ALTER TABLE customers ADD COLUMN lead_id UUID REFERENCES leads(id) ON DELETE SET NULL;
  END IF;
END $$;

-- Index for finding converted leads
CREATE INDEX IF NOT EXISTS idx_leads_converted ON leads(customer_id) WHERE customer_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_customers_from_lead ON customers(lead_id) WHERE lead_id IS NOT NULL;

COMMENT ON COLUMN leads.converted_at IS 'Timestamp when lead was converted to customer';
COMMENT ON COLUMN leads.customer_id IS 'Reference to customer record if lead was converted';
COMMENT ON COLUMN customers.lead_id IS 'Reference to original lead record if converted';
