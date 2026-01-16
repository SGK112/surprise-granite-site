-- =============================================
-- SURPRISE GRANITE - LEAD ADDRESS FIELDS
-- Migration 007: Add billing/service address to leads
-- =============================================

-- Add address columns to leads table
ALTER TABLE leads ADD COLUMN IF NOT EXISTS billing_address JSONB;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS service_address JSONB;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS address_same BOOLEAN DEFAULT true;

-- Address JSONB structure:
-- {
--   "street": "123 Main St",
--   "street2": "Apt 4B",
--   "city": "Surprise",
--   "state": "AZ",
--   "zip": "85374"
-- }

-- Add comment for documentation
COMMENT ON COLUMN leads.billing_address IS 'Customer billing address as JSONB {street, street2, city, state, zip}';
COMMENT ON COLUMN leads.service_address IS 'Service/project address if different from billing';
COMMENT ON COLUMN leads.address_same IS 'True if service address is same as billing address';

-- Create index for address-based queries (optional, for performance)
CREATE INDEX IF NOT EXISTS idx_leads_billing_city ON leads ((billing_address->>'city'));
CREATE INDEX IF NOT EXISTS idx_leads_billing_state ON leads ((billing_address->>'state'));
CREATE INDEX IF NOT EXISTS idx_leads_billing_zip ON leads ((billing_address->>'zip'));
