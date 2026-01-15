-- =============================================
-- SURPRISE GRANITE - ENTERPRISE PRODUCT MANAGEMENT SCHEMA
-- Migration 001: Helper Functions + Distributors Tables
-- =============================================

-- Helper function for auto-updating timestamps
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 1. DISTRIBUTORS - Stone distributor accounts
CREATE TABLE IF NOT EXISTS distributors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Business info
  company_name VARCHAR(255) NOT NULL,
  business_type VARCHAR(50) DEFAULT 'distributor',
  tax_id VARCHAR(50),

  -- Contact
  contact_name VARCHAR(255),
  email VARCHAR(255) NOT NULL,
  phone VARCHAR(50),
  website VARCHAR(255),

  -- Address
  address_line1 VARCHAR(255),
  address_line2 VARCHAR(255),
  city VARCHAR(100),
  state VARCHAR(50),
  postal_code VARCHAR(20),
  country VARCHAR(100) DEFAULT 'USA',

  -- Settings
  commission_rate DECIMAL(5,2) DEFAULT 5.00,
  payment_terms VARCHAR(50) DEFAULT 'net_30',

  -- Status
  status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'active', 'suspended', 'inactive')),
  verified_at TIMESTAMPTZ,

  -- Metadata
  logo_url TEXT,
  description TEXT,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(email)
);

CREATE INDEX IF NOT EXISTS idx_distributors_user ON distributors(user_id);
CREATE INDEX IF NOT EXISTS idx_distributors_status ON distributors(status);
CREATE INDEX IF NOT EXISTS idx_distributors_email ON distributors(email);

-- 2. DISTRIBUTOR_LOCATIONS - Warehouse/showroom locations
CREATE TABLE IF NOT EXISTS distributor_locations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  distributor_id UUID NOT NULL REFERENCES distributors(id) ON DELETE CASCADE,

  name VARCHAR(255) NOT NULL,
  location_type VARCHAR(50) DEFAULT 'warehouse',

  -- Address
  address_line1 VARCHAR(255),
  address_line2 VARCHAR(255),
  city VARCHAR(100),
  state VARCHAR(50),
  postal_code VARCHAR(20),
  country VARCHAR(100) DEFAULT 'USA',

  -- Contact
  phone VARCHAR(50),
  email VARCHAR(255),

  -- Hours
  business_hours JSONB DEFAULT '{}',

  -- Settings
  is_primary BOOLEAN DEFAULT false,
  is_pickup_location BOOLEAN DEFAULT true,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_distributor_locations_distributor ON distributor_locations(distributor_id);

-- Enable RLS
ALTER TABLE distributors ENABLE ROW LEVEL SECURITY;
ALTER TABLE distributor_locations ENABLE ROW LEVEL SECURITY;

-- RLS Policies for distributors
DROP POLICY IF EXISTS "Users can view own distributor profile" ON distributors;
CREATE POLICY "Users can view own distributor profile" ON distributors
  FOR SELECT USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Users can update own distributor profile" ON distributors;
CREATE POLICY "Users can update own distributor profile" ON distributors
  FOR UPDATE USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Anyone can create distributor profile" ON distributors;
CREATE POLICY "Anyone can create distributor profile" ON distributors
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "Active distributors visible to all" ON distributors;
CREATE POLICY "Active distributors visible to all" ON distributors
  FOR SELECT USING (status = 'active');

-- RLS Policies for locations
DROP POLICY IF EXISTS "Distributors can manage own locations" ON distributor_locations;
CREATE POLICY "Distributors can manage own locations" ON distributor_locations
  FOR ALL USING (
    distributor_id IN (SELECT id FROM distributors WHERE user_id = auth.uid())
  );

DROP POLICY IF EXISTS "Public can view active distributor locations" ON distributor_locations;
CREATE POLICY "Public can view active distributor locations" ON distributor_locations
  FOR SELECT USING (
    distributor_id IN (SELECT id FROM distributors WHERE status = 'active')
  );

-- Triggers for updated_at
DROP TRIGGER IF EXISTS trigger_distributors_updated_at ON distributors;
CREATE TRIGGER trigger_distributors_updated_at
  BEFORE UPDATE ON distributors
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

DROP TRIGGER IF EXISTS trigger_distributor_locations_updated_at ON distributor_locations;
CREATE TRIGGER trigger_distributor_locations_updated_at
  BEFORE UPDATE ON distributor_locations
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

-- Comments
COMMENT ON TABLE distributors IS 'Stone/slab distributors who list inventory on the marketplace';
COMMENT ON TABLE distributor_locations IS 'Warehouse and showroom locations for distributors';
