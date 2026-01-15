-- =============================================
-- SURPRISE GRANITE - ENTERPRISE PRODUCT MANAGEMENT
-- Migration 002: Row-Level Security Policies
-- =============================================

-- Enable RLS on all tables
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_slabs ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_tiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_flooring ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_installation ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_skus ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE erp_integrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE sync_logs ENABLE ROW LEVEL SECURITY;

-- =============================================
-- PRODUCTS - RLS Policies
-- =============================================

-- Distributors can view their own products
DROP POLICY IF EXISTS "Distributors can view own products" ON products;
CREATE POLICY "Distributors can view own products" ON products
  FOR SELECT
  USING (
    distributor_id IN (
      SELECT id FROM distributors WHERE user_id = auth.uid()
    )
  );

-- Public products visible to everyone (marketplace)
DROP POLICY IF EXISTS "Public products visible to all" ON products;
CREATE POLICY "Public products visible to all" ON products
  FOR SELECT
  USING (is_public = true AND status = 'active');

-- Distributors can insert their own products
DROP POLICY IF EXISTS "Distributors can insert own products" ON products;
CREATE POLICY "Distributors can insert own products" ON products
  FOR INSERT
  WITH CHECK (
    distributor_id IN (
      SELECT id FROM distributors WHERE user_id = auth.uid()
    )
  );

-- Distributors can update their own products
DROP POLICY IF EXISTS "Distributors can update own products" ON products;
CREATE POLICY "Distributors can update own products" ON products
  FOR UPDATE
  USING (
    distributor_id IN (
      SELECT id FROM distributors WHERE user_id = auth.uid()
    )
  )
  WITH CHECK (
    distributor_id IN (
      SELECT id FROM distributors WHERE user_id = auth.uid()
    )
  );

-- Distributors can delete their own products
DROP POLICY IF EXISTS "Distributors can delete own products" ON products;
CREATE POLICY "Distributors can delete own products" ON products
  FOR DELETE
  USING (
    distributor_id IN (
      SELECT id FROM distributors WHERE user_id = auth.uid()
    )
  );

-- =============================================
-- PRODUCT_SLABS - RLS Policies
-- =============================================

DROP POLICY IF EXISTS "Distributors can manage own slabs" ON product_slabs;
CREATE POLICY "Distributors can manage own slabs" ON product_slabs
  FOR ALL
  USING (
    product_id IN (
      SELECT p.id FROM products p
      JOIN distributors d ON p.distributor_id = d.id
      WHERE d.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Public slabs visible to all" ON product_slabs;
CREATE POLICY "Public slabs visible to all" ON product_slabs
  FOR SELECT
  USING (
    product_id IN (
      SELECT id FROM products WHERE is_public = true AND status = 'active'
    )
  );

-- =============================================
-- PRODUCT_TILES - RLS Policies
-- =============================================

DROP POLICY IF EXISTS "Distributors can manage own tiles" ON product_tiles;
CREATE POLICY "Distributors can manage own tiles" ON product_tiles
  FOR ALL
  USING (
    product_id IN (
      SELECT p.id FROM products p
      JOIN distributors d ON p.distributor_id = d.id
      WHERE d.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Public tiles visible to all" ON product_tiles;
CREATE POLICY "Public tiles visible to all" ON product_tiles
  FOR SELECT
  USING (
    product_id IN (
      SELECT id FROM products WHERE is_public = true AND status = 'active'
    )
  );

-- =============================================
-- PRODUCT_FLOORING - RLS Policies
-- =============================================

DROP POLICY IF EXISTS "Distributors can manage own flooring" ON product_flooring;
CREATE POLICY "Distributors can manage own flooring" ON product_flooring
  FOR ALL
  USING (
    product_id IN (
      SELECT p.id FROM products p
      JOIN distributors d ON p.distributor_id = d.id
      WHERE d.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Public flooring visible to all" ON product_flooring;
CREATE POLICY "Public flooring visible to all" ON product_flooring
  FOR SELECT
  USING (
    product_id IN (
      SELECT id FROM products WHERE is_public = true AND status = 'active'
    )
  );

-- =============================================
-- PRODUCT_INSTALLATION - RLS Policies
-- =============================================

DROP POLICY IF EXISTS "Distributors can manage own installation products" ON product_installation;
CREATE POLICY "Distributors can manage own installation products" ON product_installation
  FOR ALL
  USING (
    product_id IN (
      SELECT p.id FROM products p
      JOIN distributors d ON p.distributor_id = d.id
      WHERE d.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Public installation products visible to all" ON product_installation;
CREATE POLICY "Public installation products visible to all" ON product_installation
  FOR SELECT
  USING (
    product_id IN (
      SELECT id FROM products WHERE is_public = true AND status = 'active'
    )
  );

-- =============================================
-- PRODUCT_SKUS - RLS Policies
-- =============================================

DROP POLICY IF EXISTS "Distributors can manage own SKUs" ON product_skus;
CREATE POLICY "Distributors can manage own SKUs" ON product_skus
  FOR ALL
  USING (
    product_id IN (
      SELECT p.id FROM products p
      JOIN distributors d ON p.distributor_id = d.id
      WHERE d.user_id = auth.uid()
    )
  );

-- =============================================
-- INVENTORY_TRANSACTIONS - RLS Policies
-- =============================================

DROP POLICY IF EXISTS "Distributors can view own transactions" ON inventory_transactions;
CREATE POLICY "Distributors can view own transactions" ON inventory_transactions
  FOR SELECT
  USING (
    product_id IN (
      SELECT p.id FROM products p
      JOIN distributors d ON p.distributor_id = d.id
      WHERE d.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Distributors can insert own transactions" ON inventory_transactions;
CREATE POLICY "Distributors can insert own transactions" ON inventory_transactions
  FOR INSERT
  WITH CHECK (
    product_id IN (
      SELECT p.id FROM products p
      JOIN distributors d ON p.distributor_id = d.id
      WHERE d.user_id = auth.uid()
    )
  );

-- =============================================
-- ERP_INTEGRATIONS - RLS Policies
-- =============================================

DROP POLICY IF EXISTS "Distributors can manage own integrations" ON erp_integrations;
CREATE POLICY "Distributors can manage own integrations" ON erp_integrations
  FOR ALL
  USING (
    distributor_id IN (
      SELECT id FROM distributors WHERE user_id = auth.uid()
    )
  );

-- =============================================
-- SYNC_LOGS - RLS Policies
-- =============================================

DROP POLICY IF EXISTS "Distributors can view own sync logs" ON sync_logs;
CREATE POLICY "Distributors can view own sync logs" ON sync_logs
  FOR SELECT
  USING (
    integration_id IN (
      SELECT e.id FROM erp_integrations e
      JOIN distributors d ON e.distributor_id = d.id
      WHERE d.user_id = auth.uid()
    )
  );

-- =============================================
-- SERVICE ROLE BYPASS
-- These policies allow the service role full access
-- (used by API server with service key)
-- =============================================

-- Note: Service role automatically bypasses RLS in Supabase
-- No additional policies needed for service role access
