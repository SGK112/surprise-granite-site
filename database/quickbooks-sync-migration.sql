-- =====================================================
-- QUICKBOOKS SYNC MIGRATION
-- Add fields required for QuickBooks Online integration
-- =====================================================

-- =====================================================
-- INVOICES - QuickBooks Sync Fields
-- =====================================================

-- QuickBooks Invoice ID
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name = 'invoices' AND column_name = 'qbo_id') THEN
    ALTER TABLE invoices ADD COLUMN qbo_id TEXT;
  END IF;
END $$;

-- QuickBooks Sync Token (for optimistic locking)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name = 'invoices' AND column_name = 'qbo_sync_token') THEN
    ALTER TABLE invoices ADD COLUMN qbo_sync_token TEXT;
  END IF;
END $$;

-- Last synced timestamp
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name = 'invoices' AND column_name = 'qbo_synced_at') THEN
    ALTER TABLE invoices ADD COLUMN qbo_synced_at TIMESTAMPTZ;
  END IF;
END $$;

-- Sync status: pending, synced, error, skipped
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name = 'invoices' AND column_name = 'qbo_sync_status') THEN
    ALTER TABLE invoices ADD COLUMN qbo_sync_status TEXT DEFAULT 'pending';
  END IF;
END $$;

-- Sync error message
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name = 'invoices' AND column_name = 'qbo_sync_error') THEN
    ALTER TABLE invoices ADD COLUMN qbo_sync_error TEXT;
  END IF;
END $$;

-- QuickBooks Customer Reference ID
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name = 'invoices' AND column_name = 'qbo_customer_id') THEN
    ALTER TABLE invoices ADD COLUMN qbo_customer_id TEXT;
  END IF;
END $$;

-- Tax Rate (for QB tax calculation)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name = 'invoices' AND column_name = 'tax_rate') THEN
    ALTER TABLE invoices ADD COLUMN tax_rate DECIMAL(5,3) DEFAULT 0;
  END IF;
END $$;

-- Tax Amount
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name = 'invoices' AND column_name = 'tax_amount') THEN
    ALTER TABLE invoices ADD COLUMN tax_amount DECIMAL(10,2) DEFAULT 0;
  END IF;
END $$;

-- Payment Terms (Net 30, Due on Receipt, etc.)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name = 'invoices' AND column_name = 'payment_terms') THEN
    ALTER TABLE invoices ADD COLUMN payment_terms TEXT DEFAULT 'Net 30';
  END IF;
END $$;

-- Shipping address fields for QB
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name = 'invoices' AND column_name = 'ship_to_address') THEN
    ALTER TABLE invoices ADD COLUMN ship_to_address TEXT;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name = 'invoices' AND column_name = 'ship_to_city') THEN
    ALTER TABLE invoices ADD COLUMN ship_to_city TEXT;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name = 'invoices' AND column_name = 'ship_to_state') THEN
    ALTER TABLE invoices ADD COLUMN ship_to_state TEXT;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name = 'invoices' AND column_name = 'ship_to_zip') THEN
    ALTER TABLE invoices ADD COLUMN ship_to_zip TEXT;
  END IF;
END $$;

-- =====================================================
-- ESTIMATES - QuickBooks Sync Fields
-- =====================================================

-- QuickBooks Estimate ID
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name = 'estimates' AND column_name = 'qbo_id') THEN
    ALTER TABLE estimates ADD COLUMN qbo_id TEXT;
  END IF;
END $$;

-- QuickBooks Sync Token
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name = 'estimates' AND column_name = 'qbo_sync_token') THEN
    ALTER TABLE estimates ADD COLUMN qbo_sync_token TEXT;
  END IF;
END $$;

-- Last synced timestamp
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name = 'estimates' AND column_name = 'qbo_synced_at') THEN
    ALTER TABLE estimates ADD COLUMN qbo_synced_at TIMESTAMPTZ;
  END IF;
END $$;

-- Sync status
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name = 'estimates' AND column_name = 'qbo_sync_status') THEN
    ALTER TABLE estimates ADD COLUMN qbo_sync_status TEXT DEFAULT 'pending';
  END IF;
END $$;

-- Sync error
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name = 'estimates' AND column_name = 'qbo_sync_error') THEN
    ALTER TABLE estimates ADD COLUMN qbo_sync_error TEXT;
  END IF;
END $$;

-- QuickBooks Customer Reference
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name = 'estimates' AND column_name = 'qbo_customer_id') THEN
    ALTER TABLE estimates ADD COLUMN qbo_customer_id TEXT;
  END IF;
END $$;

-- Tax fields for estimates
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name = 'estimates' AND column_name = 'tax_rate') THEN
    ALTER TABLE estimates ADD COLUMN tax_rate DECIMAL(5,3) DEFAULT 0;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name = 'estimates' AND column_name = 'tax_amount') THEN
    ALTER TABLE estimates ADD COLUMN tax_amount DECIMAL(10,2) DEFAULT 0;
  END IF;
END $$;

-- Expiration date for estimates (QB TxnDate + ExpirationDate)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name = 'estimates' AND column_name = 'expiration_date') THEN
    ALTER TABLE estimates ADD COLUMN expiration_date DATE;
  END IF;
END $$;

-- Accepted date (when customer accepts)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name = 'estimates' AND column_name = 'accepted_at') THEN
    ALTER TABLE estimates ADD COLUMN accepted_at TIMESTAMPTZ;
  END IF;
END $$;

-- =====================================================
-- CUSTOMERS - QuickBooks Sync Fields
-- =====================================================

-- QuickBooks Customer ID
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name = 'customers' AND column_name = 'qbo_id') THEN
    ALTER TABLE customers ADD COLUMN qbo_id TEXT;
  END IF;
END $$;

-- QuickBooks Sync Token
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name = 'customers' AND column_name = 'qbo_sync_token') THEN
    ALTER TABLE customers ADD COLUMN qbo_sync_token TEXT;
  END IF;
END $$;

-- Last synced
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name = 'customers' AND column_name = 'qbo_synced_at') THEN
    ALTER TABLE customers ADD COLUMN qbo_synced_at TIMESTAMPTZ;
  END IF;
END $$;

-- Company name (for business customers)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name = 'customers' AND column_name = 'company_name') THEN
    ALTER TABLE customers ADD COLUMN company_name TEXT;
  END IF;
END $$;

-- =====================================================
-- INVOICE ITEMS - QuickBooks Line Item Fields
-- =====================================================

-- Service/Product code for QB Items
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name = 'invoice_items' AND column_name = 'item_code') THEN
    ALTER TABLE invoice_items ADD COLUMN item_code TEXT;
  END IF;
END $$;

-- QuickBooks Item ID reference
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name = 'invoice_items' AND column_name = 'qbo_item_id') THEN
    ALTER TABLE invoice_items ADD COLUMN qbo_item_id TEXT;
  END IF;
END $$;

-- Service date (for time-based billing)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name = 'invoice_items' AND column_name = 'service_date') THEN
    ALTER TABLE invoice_items ADD COLUMN service_date DATE;
  END IF;
END $$;

-- Tax code for line item
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name = 'invoice_items' AND column_name = 'tax_code') THEN
    ALTER TABLE invoice_items ADD COLUMN tax_code TEXT DEFAULT 'TAX';
  END IF;
END $$;

-- =====================================================
-- ESTIMATE ITEMS - QuickBooks Line Item Fields
-- =====================================================

-- Service/Product code
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name = 'estimate_items' AND column_name = 'item_code') THEN
    ALTER TABLE estimate_items ADD COLUMN item_code TEXT;
  END IF;
END $$;

-- QuickBooks Item ID
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name = 'estimate_items' AND column_name = 'qbo_item_id') THEN
    ALTER TABLE estimate_items ADD COLUMN qbo_item_id TEXT;
  END IF;
END $$;

-- Tax code
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name = 'estimate_items' AND column_name = 'tax_code') THEN
    ALTER TABLE estimate_items ADD COLUMN tax_code TEXT DEFAULT 'TAX';
  END IF;
END $$;

-- =====================================================
-- QUICKBOOKS OAUTH TOKENS TABLE
-- Store OAuth tokens per user
-- =====================================================

CREATE TABLE IF NOT EXISTS quickbooks_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  realm_id TEXT NOT NULL,  -- QuickBooks Company ID
  access_token TEXT NOT NULL,
  refresh_token TEXT NOT NULL,
  access_token_expires_at TIMESTAMPTZ NOT NULL,
  refresh_token_expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id)
);

-- Enable RLS
ALTER TABLE quickbooks_tokens ENABLE ROW LEVEL SECURITY;

-- Users can only see their own tokens
CREATE POLICY "Users can manage own QB tokens" ON quickbooks_tokens
  FOR ALL USING (auth.uid() = user_id);

-- Service role can manage all tokens
CREATE POLICY "Service role full access to QB tokens" ON quickbooks_tokens
  FOR ALL USING (auth.role() = 'service_role');

-- =====================================================
-- QUICKBOOKS SYNC LOG
-- Track sync operations for debugging
-- =====================================================

CREATE TABLE IF NOT EXISTS quickbooks_sync_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  entity_type TEXT NOT NULL,  -- 'invoice', 'estimate', 'customer'
  entity_id UUID NOT NULL,
  operation TEXT NOT NULL,    -- 'create', 'update', 'delete'
  qbo_id TEXT,
  status TEXT NOT NULL,       -- 'success', 'error'
  error_message TEXT,
  request_payload JSONB,
  response_payload JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE quickbooks_sync_log ENABLE ROW LEVEL SECURITY;

-- Users can see their own sync logs
CREATE POLICY "Users can view own QB sync logs" ON quickbooks_sync_log
  FOR SELECT USING (auth.uid() = user_id);

-- Service role full access
CREATE POLICY "Service role full access to QB sync logs" ON quickbooks_sync_log
  FOR ALL USING (auth.role() = 'service_role');

-- Index for faster lookups
CREATE INDEX IF NOT EXISTS idx_qb_sync_log_user ON quickbooks_sync_log(user_id);
CREATE INDEX IF NOT EXISTS idx_qb_sync_log_entity ON quickbooks_sync_log(entity_type, entity_id);

-- =====================================================
-- INDEXES FOR QUICKBOOKS FIELDS
-- =====================================================

CREATE INDEX IF NOT EXISTS idx_invoices_qbo_id ON invoices(qbo_id) WHERE qbo_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_invoices_qbo_sync_status ON invoices(qbo_sync_status);
CREATE INDEX IF NOT EXISTS idx_estimates_qbo_id ON estimates(qbo_id) WHERE qbo_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_estimates_qbo_sync_status ON estimates(qbo_sync_status);
CREATE INDEX IF NOT EXISTS idx_customers_qbo_id ON customers(qbo_id) WHERE qbo_id IS NOT NULL;

-- =====================================================
-- COMMENTS
-- =====================================================

COMMENT ON COLUMN invoices.qbo_id IS 'QuickBooks Online Invoice ID';
COMMENT ON COLUMN invoices.qbo_sync_token IS 'QuickBooks sync token for optimistic locking';
COMMENT ON COLUMN invoices.qbo_sync_status IS 'Sync status: pending, synced, error, skipped';
COMMENT ON COLUMN invoices.tax_rate IS 'Tax rate percentage (e.g., 8.375 for 8.375%)';
COMMENT ON COLUMN invoices.payment_terms IS 'Payment terms: Net 30, Net 15, Due on Receipt, etc.';

COMMENT ON COLUMN estimates.qbo_id IS 'QuickBooks Online Estimate ID';
COMMENT ON COLUMN estimates.expiration_date IS 'Date when estimate expires';
COMMENT ON COLUMN estimates.accepted_at IS 'When customer accepted the estimate';

COMMENT ON COLUMN customers.qbo_id IS 'QuickBooks Online Customer ID';
COMMENT ON COLUMN customers.company_name IS 'Business/Company name for B2B customers';

COMMENT ON TABLE quickbooks_tokens IS 'OAuth tokens for QuickBooks Online integration';
COMMENT ON TABLE quickbooks_sync_log IS 'Audit log of QuickBooks sync operations';
