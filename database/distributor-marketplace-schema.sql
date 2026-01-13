-- =====================================================
-- SURPRISE GRANITE DISTRIBUTOR MARKETPLACE SCHEMA
-- Phase 1: Distributor Infrastructure
-- Run this in Supabase SQL Editor
-- =====================================================

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm"; -- For fuzzy text search

-- =====================================================
-- 1. DISTRIBUTOR PROFILES
-- Extends vendor system for large distributors/suppliers
-- =====================================================
CREATE TABLE IF NOT EXISTS distributor_profiles (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

  -- Link to auth user (optional - can have API-only distributors)
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,

  -- Company Info
  company_name TEXT NOT NULL,
  legal_name TEXT,
  slug TEXT UNIQUE,
  company_type TEXT NOT NULL CHECK (company_type IN ('distributor', 'manufacturer', 'importer', 'wholesaler', 'quarry')),

  -- Contact
  primary_contact_name TEXT NOT NULL,
  primary_contact_email TEXT NOT NULL,
  primary_contact_phone TEXT NOT NULL,
  billing_email TEXT,
  support_email TEXT,
  website TEXT,

  -- Business Details
  year_established INTEGER,
  employee_count TEXT, -- '1-10', '11-50', '51-200', '201-500', '500+'
  annual_revenue TEXT, -- 'under_1m', '1m_10m', '10m_50m', '50m_100m', '100m_plus'

  -- Branding
  logo_url TEXT,
  banner_url TEXT,
  description TEXT,
  tagline TEXT,

  -- Product Focus
  material_types TEXT[] DEFAULT '{}', -- ['quartz', 'granite', 'marble', 'quartzite', 'porcelain', 'tile']
  brands_carried TEXT[] DEFAULT '{}', -- ['MSI', 'Cambria', 'Caesarstone', etc.]
  is_manufacturer BOOLEAN DEFAULT false, -- Do they make their own products?

  -- Coverage
  service_regions TEXT[] DEFAULT '{}', -- ['AZ', 'CA', 'NV', 'TX', etc.]
  national_coverage BOOLEAN DEFAULT false,
  international_shipping BOOLEAN DEFAULT false,

  -- Integration
  api_enabled BOOLEAN DEFAULT false,
  api_key_hash TEXT, -- Hashed API key for inventory sync
  api_rate_limit INTEGER DEFAULT 1000, -- Requests per hour
  inventory_sync_url TEXT, -- Their endpoint we pull from
  last_sync_at TIMESTAMPTZ,
  sync_frequency_hours INTEGER DEFAULT 24,

  -- Marketplace Settings
  commission_rate DECIMAL(4,2) DEFAULT 5.00, -- Platform commission %
  min_order_amount DECIMAL(10,2),
  accepts_credit_cards BOOLEAN DEFAULT true,
  accepts_net_terms BOOLEAN DEFAULT false,
  net_terms_days INTEGER DEFAULT 30,

  -- Stripe Connect (for receiving payouts)
  stripe_connect_id TEXT,
  stripe_connect_status TEXT DEFAULT 'pending', -- 'pending', 'active', 'restricted', 'disabled'
  stripe_onboarding_complete BOOLEAN DEFAULT false,

  -- Verification & Status
  verification_status TEXT DEFAULT 'pending' CHECK (verification_status IN ('pending', 'in_review', 'verified', 'rejected', 'suspended')),
  verified_at TIMESTAMPTZ,
  verified_by UUID,
  rejection_reason TEXT,

  -- Account Status
  is_active BOOLEAN DEFAULT true,
  is_featured BOOLEAN DEFAULT false,
  featured_until TIMESTAMPTZ,
  onboarding_step INTEGER DEFAULT 1, -- Track setup progress
  onboarding_complete BOOLEAN DEFAULT false,

  -- Stats (denormalized for performance)
  total_products INTEGER DEFAULT 0,
  total_slabs INTEGER DEFAULT 0,
  total_orders INTEGER DEFAULT 0,
  total_revenue DECIMAL(14,2) DEFAULT 0,
  average_rating DECIMAL(2,1) DEFAULT 0,
  review_count INTEGER DEFAULT 0,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Generate slug from company name
CREATE OR REPLACE FUNCTION generate_distributor_slug()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.slug IS NULL THEN
    NEW.slug := LOWER(REGEXP_REPLACE(NEW.company_name, '[^a-zA-Z0-9]+', '-', 'g'));
    -- Add suffix if slug exists
    IF EXISTS (SELECT 1 FROM distributor_profiles WHERE slug = NEW.slug AND id != NEW.id) THEN
      NEW.slug := NEW.slug || '-' || SUBSTRING(NEW.id::TEXT, 1, 8);
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER distributor_slug_trigger
  BEFORE INSERT OR UPDATE ON distributor_profiles
  FOR EACH ROW EXECUTE FUNCTION generate_distributor_slug();

-- =====================================================
-- 2. DISTRIBUTOR LOCATIONS (Showrooms/Warehouses)
-- =====================================================
CREATE TABLE IF NOT EXISTS distributor_locations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  distributor_id UUID NOT NULL REFERENCES distributor_profiles(id) ON DELETE CASCADE,

  -- Location Info
  location_name TEXT NOT NULL, -- "Phoenix Showroom", "Tempe Warehouse"
  location_type TEXT NOT NULL CHECK (location_type IN ('showroom', 'warehouse', 'distribution_center', 'headquarters', 'slab_yard')),
  is_primary BOOLEAN DEFAULT false,

  -- Address
  address_line1 TEXT NOT NULL,
  address_line2 TEXT,
  city TEXT NOT NULL,
  state TEXT NOT NULL,
  zip_code TEXT NOT NULL,
  country TEXT DEFAULT 'US',
  latitude DECIMAL(10, 8),
  longitude DECIMAL(11, 8),

  -- Contact
  phone TEXT,
  email TEXT,
  manager_name TEXT,

  -- Hours
  hours_monday TEXT, -- "8:00 AM - 5:00 PM" or "Closed"
  hours_tuesday TEXT,
  hours_wednesday TEXT,
  hours_thursday TEXT,
  hours_friday TEXT,
  hours_saturday TEXT,
  hours_sunday TEXT,

  -- Features
  has_showroom BOOLEAN DEFAULT false,
  has_slab_yard BOOLEAN DEFAULT false,
  allows_pickup BOOLEAN DEFAULT true,
  offers_delivery BOOLEAN DEFAULT true,
  delivery_radius_miles INTEGER,

  -- Status
  is_active BOOLEAN DEFAULT true,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for location searches
CREATE INDEX IF NOT EXISTS idx_distributor_locations_zip ON distributor_locations(zip_code) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_distributor_locations_state ON distributor_locations(state) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_distributor_locations_geo ON distributor_locations(latitude, longitude) WHERE is_active = true;

-- =====================================================
-- 3. MATERIAL CATEGORIES
-- Standardized categories for filtering
-- =====================================================
CREATE TABLE IF NOT EXISTS material_categories (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

  name TEXT NOT NULL UNIQUE, -- 'Quartz', 'Granite', 'Marble', etc.
  slug TEXT NOT NULL UNIQUE,
  description TEXT,
  icon_url TEXT,

  -- Hierarchy
  parent_id UUID REFERENCES material_categories(id),
  level INTEGER DEFAULT 0, -- 0 = top level, 1 = subcategory

  -- Display
  sort_order INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT true,

  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Insert standard categories
INSERT INTO material_categories (name, slug, description, sort_order) VALUES
  ('Quartz', 'quartz', 'Engineered quartz countertops', 1),
  ('Granite', 'granite', 'Natural granite stone', 2),
  ('Marble', 'marble', 'Natural marble stone', 3),
  ('Quartzite', 'quartzite', 'Natural quartzite stone', 4),
  ('Porcelain', 'porcelain', 'Porcelain slabs and tile', 5),
  ('Soapstone', 'soapstone', 'Natural soapstone', 6),
  ('Travertine', 'travertine', 'Natural travertine stone', 7),
  ('Limestone', 'limestone', 'Natural limestone', 8),
  ('Onyx', 'onyx', 'Natural onyx stone', 9),
  ('Dolomite', 'dolomite', 'Natural dolomite stone', 10),
  ('Sintered Stone', 'sintered-stone', 'Ultra-compact sintered surfaces', 11),
  ('Solid Surface', 'solid-surface', 'Acrylic solid surface materials', 12)
ON CONFLICT (slug) DO NOTHING;

-- =====================================================
-- 4. SLAB INVENTORY
-- Individual slabs with full details
-- =====================================================
CREATE TABLE IF NOT EXISTS slab_inventory (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  distributor_id UUID NOT NULL REFERENCES distributor_profiles(id) ON DELETE CASCADE,
  location_id UUID REFERENCES distributor_locations(id) ON DELETE SET NULL,

  -- Product Identity
  product_name TEXT NOT NULL, -- "Calacatta Gold"
  product_sku TEXT, -- Distributor's SKU
  bundle_number TEXT, -- Bundle/Lot identification
  slab_number TEXT, -- Individual slab in bundle (e.g., "3 of 8")

  -- Categorization
  material_category_id UUID REFERENCES material_categories(id),
  material_type TEXT NOT NULL, -- 'quartz', 'granite', 'marble', etc.
  brand TEXT, -- 'MSI', 'Cambria', etc.
  collection TEXT, -- Product line/collection name
  origin_country TEXT, -- Where the stone is from

  -- Physical Specs
  length_inches DECIMAL(6,2), -- Length in inches
  width_inches DECIMAL(6,2), -- Width in inches
  thickness_cm DECIMAL(4,2), -- Thickness in cm (industry standard)
  thickness_inches DECIMAL(4,2), -- Thickness in inches
  weight_lbs DECIMAL(8,2), -- Weight in pounds
  square_feet DECIMAL(8,2) GENERATED ALWAYS AS (
    ROUND((length_inches * width_inches) / 144, 2)
  ) STORED,

  -- Appearance
  primary_color TEXT, -- Main color
  secondary_colors TEXT[], -- Additional colors
  vein_style TEXT, -- 'dramatic', 'subtle', 'uniform', 'bookmatched'
  finish TEXT DEFAULT 'polished', -- 'polished', 'honed', 'leathered', 'brushed', 'flamed'
  pattern TEXT, -- 'veined', 'speckled', 'solid', 'marbled'

  -- Quality
  quality_grade TEXT, -- 'premium', 'standard', 'commercial', 'remnant'
  has_defects BOOLEAN DEFAULT false,
  defect_notes TEXT,

  -- Pricing
  price_per_sqft DECIMAL(8,2), -- Price per square foot
  total_price DECIMAL(10,2), -- Total slab price
  price_tier TEXT DEFAULT 'standard', -- 'budget', 'standard', 'premium', 'luxury'
  msrp_per_sqft DECIMAL(8,2), -- Manufacturer suggested retail
  trade_price_per_sqft DECIMAL(8,2), -- Trade/contractor price
  is_on_sale BOOLEAN DEFAULT false,
  sale_price_per_sqft DECIMAL(8,2),
  sale_ends_at TIMESTAMPTZ,

  -- Availability
  quantity_available INTEGER DEFAULT 1, -- Usually 1 for slabs
  status TEXT DEFAULT 'available' CHECK (status IN ('available', 'reserved', 'sold', 'on_hold', 'damaged', 'discontinued')),
  reserved_by UUID, -- User who reserved
  reserved_until TIMESTAMPTZ,
  is_remnant BOOLEAN DEFAULT false,

  -- Images
  primary_image_url TEXT,
  images JSONB DEFAULT '[]', -- Array of {url, alt, sort_order}
  has_actual_photo BOOLEAN DEFAULT false, -- vs stock/catalog image

  -- SEO & Display
  display_name TEXT, -- Formatted name for display
  description TEXT,
  features TEXT[], -- ['Scratch Resistant', 'Heat Resistant', etc.]
  applications TEXT[], -- ['Kitchen Countertops', 'Bathroom Vanities', etc.]

  -- Sync Info (for API-synced inventory)
  external_id TEXT, -- ID in distributor's system
  external_sku TEXT,
  last_synced_at TIMESTAMPTZ,
  sync_source TEXT, -- 'api', 'csv', 'manual'
  raw_data JSONB, -- Original data from sync

  -- Analytics
  view_count INTEGER DEFAULT 0,
  inquiry_count INTEGER DEFAULT 0,
  favorite_count INTEGER DEFAULT 0,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  listed_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for slab searches
CREATE INDEX IF NOT EXISTS idx_slab_inventory_distributor ON slab_inventory(distributor_id) WHERE status = 'available';
CREATE INDEX IF NOT EXISTS idx_slab_inventory_material ON slab_inventory(material_type) WHERE status = 'available';
CREATE INDEX IF NOT EXISTS idx_slab_inventory_brand ON slab_inventory(brand) WHERE status = 'available';
CREATE INDEX IF NOT EXISTS idx_slab_inventory_color ON slab_inventory(primary_color) WHERE status = 'available';
CREATE INDEX IF NOT EXISTS idx_slab_inventory_price ON slab_inventory(price_per_sqft) WHERE status = 'available';
CREATE INDEX IF NOT EXISTS idx_slab_inventory_location ON slab_inventory(location_id) WHERE status = 'available';
CREATE INDEX IF NOT EXISTS idx_slab_inventory_external ON slab_inventory(distributor_id, external_id);

-- Full text search on product names
CREATE INDEX IF NOT EXISTS idx_slab_inventory_search ON slab_inventory
  USING gin(to_tsvector('english', product_name || ' ' || COALESCE(brand, '') || ' ' || COALESCE(collection, '')));

-- =====================================================
-- 5. PRODUCT CATALOG (Non-slab items)
-- For tile, samples, accessories, etc.
-- =====================================================
CREATE TABLE IF NOT EXISTS distributor_products (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  distributor_id UUID NOT NULL REFERENCES distributor_profiles(id) ON DELETE CASCADE,

  -- Product Info
  name TEXT NOT NULL,
  sku TEXT,
  brand TEXT,
  collection TEXT,
  material_type TEXT,

  -- Categorization
  category TEXT, -- 'tile', 'sample', 'accessory', 'adhesive', 'sealer', etc.
  subcategory TEXT,

  -- Specs
  dimensions TEXT, -- "12x24", "3x6", etc.
  thickness TEXT,
  finish TEXT,
  color TEXT,

  -- Pricing
  unit_price DECIMAL(10,2),
  unit_type TEXT DEFAULT 'sqft', -- 'sqft', 'piece', 'box', 'pallet'
  units_per_box INTEGER,
  sqft_per_box DECIMAL(6,2),
  min_order_quantity INTEGER DEFAULT 1,

  -- Stock
  in_stock BOOLEAN DEFAULT true,
  stock_quantity INTEGER,
  lead_time_days INTEGER,

  -- Images
  primary_image_url TEXT,
  images JSONB DEFAULT '[]',

  -- Details
  description TEXT,
  features TEXT[],
  specifications JSONB,

  -- Sync
  external_id TEXT,
  last_synced_at TIMESTAMPTZ,

  -- Status
  is_active BOOLEAN DEFAULT true,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- =====================================================
-- 6. INVENTORY SYNC LOGS
-- Track all sync operations for debugging
-- =====================================================
CREATE TABLE IF NOT EXISTS inventory_sync_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  distributor_id UUID NOT NULL REFERENCES distributor_profiles(id) ON DELETE CASCADE,

  -- Sync Details
  sync_type TEXT NOT NULL, -- 'full', 'incremental', 'manual'
  sync_source TEXT NOT NULL, -- 'api', 'csv_upload', 'manual_entry'

  -- Results
  status TEXT NOT NULL CHECK (status IN ('started', 'processing', 'completed', 'failed', 'partial')),
  records_processed INTEGER DEFAULT 0,
  records_created INTEGER DEFAULT 0,
  records_updated INTEGER DEFAULT 0,
  records_deleted INTEGER DEFAULT 0,
  records_failed INTEGER DEFAULT 0,

  -- Error Tracking
  error_message TEXT,
  error_details JSONB,
  failed_records JSONB, -- Array of records that failed

  -- Timing
  started_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  duration_seconds INTEGER,

  -- File Info (for CSV uploads)
  file_name TEXT,
  file_size INTEGER,
  file_url TEXT,

  -- Metadata
  initiated_by UUID, -- User who triggered sync
  api_request_id TEXT,

  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =====================================================
-- 7. API KEYS
-- For distributor inventory sync
-- =====================================================
CREATE TABLE IF NOT EXISTS distributor_api_keys (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  distributor_id UUID NOT NULL REFERENCES distributor_profiles(id) ON DELETE CASCADE,

  -- Key Info
  key_name TEXT NOT NULL, -- "Production API Key", "Test Key"
  key_prefix TEXT NOT NULL, -- First 8 chars of key for identification
  key_hash TEXT NOT NULL, -- SHA-256 hash of full key

  -- Permissions
  permissions TEXT[] DEFAULT '{"read", "write"}', -- 'read', 'write', 'delete'
  allowed_ips TEXT[], -- IP whitelist (null = all IPs)

  -- Rate Limiting
  rate_limit_per_hour INTEGER DEFAULT 1000,
  rate_limit_per_day INTEGER DEFAULT 10000,

  -- Usage Stats
  last_used_at TIMESTAMPTZ,
  total_requests INTEGER DEFAULT 0,
  requests_today INTEGER DEFAULT 0,
  requests_this_hour INTEGER DEFAULT 0,

  -- Status
  is_active BOOLEAN DEFAULT true,
  expires_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,
  revoked_reason TEXT,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID
);

-- =====================================================
-- 8. SLAB INQUIRIES
-- Track customer interest in specific slabs
-- =====================================================
CREATE TABLE IF NOT EXISTS slab_inquiries (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  slab_id UUID NOT NULL REFERENCES slab_inventory(id) ON DELETE CASCADE,
  distributor_id UUID NOT NULL REFERENCES distributor_profiles(id) ON DELETE CASCADE,

  -- Inquirer Info
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  inquirer_type TEXT NOT NULL, -- 'homeowner', 'fabricator', 'contractor', 'designer'
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT,
  company_name TEXT,

  -- Inquiry Details
  message TEXT,
  project_type TEXT, -- 'kitchen', 'bathroom', 'commercial', etc.
  project_zip TEXT,
  estimated_sqft DECIMAL(8,2),
  timeline TEXT, -- 'asap', '1_month', '1_3_months', etc.

  -- Status
  status TEXT DEFAULT 'new' CHECK (status IN ('new', 'contacted', 'quoted', 'won', 'lost', 'no_response')),
  assigned_to UUID, -- Distributor rep handling

  -- Follow-up
  notes TEXT,
  follow_up_at TIMESTAMPTZ,

  -- Outcome
  outcome_notes TEXT,
  quote_amount DECIMAL(10,2),

  -- Source
  source TEXT, -- 'marketplace', 'website', 'api'
  source_url TEXT,
  utm_source TEXT,
  utm_medium TEXT,
  utm_campaign TEXT,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- =====================================================
-- 9. SLAB FAVORITES
-- Users can save slabs they like
-- =====================================================
CREATE TABLE IF NOT EXISTS slab_favorites (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  slab_id UUID NOT NULL REFERENCES slab_inventory(id) ON DELETE CASCADE,

  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(user_id, slab_id)
);

-- =====================================================
-- 10. DISTRIBUTOR ANALYTICS (Daily rollups)
-- =====================================================
CREATE TABLE IF NOT EXISTS distributor_analytics (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  distributor_id UUID NOT NULL REFERENCES distributor_profiles(id) ON DELETE CASCADE,
  date DATE NOT NULL,

  -- Inventory
  total_slabs INTEGER DEFAULT 0,
  total_products INTEGER DEFAULT 0,
  total_value DECIMAL(14,2) DEFAULT 0,

  -- Traffic
  profile_views INTEGER DEFAULT 0,
  slab_views INTEGER DEFAULT 0,
  product_views INTEGER DEFAULT 0,
  search_appearances INTEGER DEFAULT 0,

  -- Engagement
  inquiries_received INTEGER DEFAULT 0,
  favorites_added INTEGER DEFAULT 0,

  -- Sales (through platform)
  orders_placed INTEGER DEFAULT 0,
  order_value DECIMAL(12,2) DEFAULT 0,
  commission_paid DECIMAL(10,2) DEFAULT 0,

  created_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(distributor_id, date)
);

-- =====================================================
-- 11. UPDATE TRIGGERS
-- =====================================================

-- Update timestamp trigger (reuse if exists)
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply to all tables
DO $$
BEGIN
  -- distributor_profiles
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'distributor_profiles_updated_at') THEN
    CREATE TRIGGER distributor_profiles_updated_at
      BEFORE UPDATE ON distributor_profiles
      FOR EACH ROW EXECUTE FUNCTION update_updated_at();
  END IF;

  -- distributor_locations
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'distributor_locations_updated_at') THEN
    CREATE TRIGGER distributor_locations_updated_at
      BEFORE UPDATE ON distributor_locations
      FOR EACH ROW EXECUTE FUNCTION update_updated_at();
  END IF;

  -- slab_inventory
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'slab_inventory_updated_at') THEN
    CREATE TRIGGER slab_inventory_updated_at
      BEFORE UPDATE ON slab_inventory
      FOR EACH ROW EXECUTE FUNCTION update_updated_at();
  END IF;

  -- distributor_products
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'distributor_products_updated_at') THEN
    CREATE TRIGGER distributor_products_updated_at
      BEFORE UPDATE ON distributor_products
      FOR EACH ROW EXECUTE FUNCTION update_updated_at();
  END IF;

  -- slab_inquiries
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'slab_inquiries_updated_at') THEN
    CREATE TRIGGER slab_inquiries_updated_at
      BEFORE UPDATE ON slab_inquiries
      FOR EACH ROW EXECUTE FUNCTION update_updated_at();
  END IF;
END $$;

-- =====================================================
-- 12. ROW LEVEL SECURITY
-- =====================================================

-- Enable RLS
ALTER TABLE distributor_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE distributor_locations ENABLE ROW LEVEL SECURITY;
ALTER TABLE slab_inventory ENABLE ROW LEVEL SECURITY;
ALTER TABLE distributor_products ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_sync_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE distributor_api_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE slab_inquiries ENABLE ROW LEVEL SECURITY;
ALTER TABLE slab_favorites ENABLE ROW LEVEL SECURITY;
ALTER TABLE distributor_analytics ENABLE ROW LEVEL SECURITY;

-- Distributor Profiles: Public read for active, owners can edit
CREATE POLICY "Public can view active distributors" ON distributor_profiles
  FOR SELECT USING (is_active = true AND verification_status = 'verified');

CREATE POLICY "Distributors can view own profile" ON distributor_profiles
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "Distributors can update own profile" ON distributor_profiles
  FOR UPDATE USING (user_id = auth.uid());

CREATE POLICY "Distributors can insert own profile" ON distributor_profiles
  FOR INSERT WITH CHECK (user_id = auth.uid());

-- Locations: Public read for active distributors
CREATE POLICY "Public can view distributor locations" ON distributor_locations
  FOR SELECT USING (
    is_active = true AND
    EXISTS (SELECT 1 FROM distributor_profiles WHERE id = distributor_id AND is_active = true)
  );

CREATE POLICY "Distributors can manage own locations" ON distributor_locations
  FOR ALL USING (
    EXISTS (SELECT 1 FROM distributor_profiles WHERE id = distributor_id AND user_id = auth.uid())
  );

-- Slab Inventory: Public read for available slabs
CREATE POLICY "Public can view available slabs" ON slab_inventory
  FOR SELECT USING (status = 'available');

CREATE POLICY "Distributors can manage own inventory" ON slab_inventory
  FOR ALL USING (
    EXISTS (SELECT 1 FROM distributor_profiles WHERE id = distributor_id AND user_id = auth.uid())
  );

-- Products: Public read, owners manage
CREATE POLICY "Public can view active products" ON distributor_products
  FOR SELECT USING (is_active = true);

CREATE POLICY "Distributors can manage own products" ON distributor_products
  FOR ALL USING (
    EXISTS (SELECT 1 FROM distributor_profiles WHERE id = distributor_id AND user_id = auth.uid())
  );

-- Sync Logs: Only owner can see
CREATE POLICY "Distributors can view own sync logs" ON inventory_sync_logs
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM distributor_profiles WHERE id = distributor_id AND user_id = auth.uid())
  );

-- API Keys: Only owner can see
CREATE POLICY "Distributors can manage own API keys" ON distributor_api_keys
  FOR ALL USING (
    EXISTS (SELECT 1 FROM distributor_profiles WHERE id = distributor_id AND user_id = auth.uid())
  );

-- Inquiries: Distributor can see inquiries about their slabs
CREATE POLICY "Distributors can view own inquiries" ON slab_inquiries
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM distributor_profiles WHERE id = distributor_id AND user_id = auth.uid())
  );

CREATE POLICY "Anyone can create inquiries" ON slab_inquiries
  FOR INSERT WITH CHECK (true);

-- Favorites: Users can manage their own
CREATE POLICY "Users can manage own favorites" ON slab_favorites
  FOR ALL USING (user_id = auth.uid());

-- Analytics: Only owner can see
CREATE POLICY "Distributors can view own analytics" ON distributor_analytics
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM distributor_profiles WHERE id = distributor_id AND user_id = auth.uid())
  );

-- =====================================================
-- 13. SERVICE ROLE POLICIES (Backend access)
-- =====================================================

CREATE POLICY "Service role full access distributor_profiles" ON distributor_profiles
  FOR ALL USING (auth.jwt() ->> 'role' = 'service_role');

CREATE POLICY "Service role full access distributor_locations" ON distributor_locations
  FOR ALL USING (auth.jwt() ->> 'role' = 'service_role');

CREATE POLICY "Service role full access slab_inventory" ON slab_inventory
  FOR ALL USING (auth.jwt() ->> 'role' = 'service_role');

CREATE POLICY "Service role full access distributor_products" ON distributor_products
  FOR ALL USING (auth.jwt() ->> 'role' = 'service_role');

CREATE POLICY "Service role full access inventory_sync_logs" ON inventory_sync_logs
  FOR ALL USING (auth.jwt() ->> 'role' = 'service_role');

CREATE POLICY "Service role full access distributor_api_keys" ON distributor_api_keys
  FOR ALL USING (auth.jwt() ->> 'role' = 'service_role');

CREATE POLICY "Service role full access slab_inquiries" ON slab_inquiries
  FOR ALL USING (auth.jwt() ->> 'role' = 'service_role');

CREATE POLICY "Service role full access distributor_analytics" ON distributor_analytics
  FOR ALL USING (auth.jwt() ->> 'role' = 'service_role');

-- =====================================================
-- 14. HELPER FUNCTIONS
-- =====================================================

-- Search slabs with filters
CREATE OR REPLACE FUNCTION search_slabs(
  p_material_type TEXT DEFAULT NULL,
  p_brand TEXT DEFAULT NULL,
  p_color TEXT DEFAULT NULL,
  p_min_price DECIMAL DEFAULT NULL,
  p_max_price DECIMAL DEFAULT NULL,
  p_min_sqft DECIMAL DEFAULT NULL,
  p_max_sqft DECIMAL DEFAULT NULL,
  p_location_state TEXT DEFAULT NULL,
  p_search_term TEXT DEFAULT NULL,
  p_limit INTEGER DEFAULT 50,
  p_offset INTEGER DEFAULT 0
)
RETURNS TABLE (
  slab_id UUID,
  product_name TEXT,
  brand TEXT,
  material_type TEXT,
  primary_color TEXT,
  price_per_sqft DECIMAL,
  square_feet DECIMAL,
  primary_image_url TEXT,
  distributor_name TEXT,
  location_city TEXT,
  location_state TEXT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    s.id as slab_id,
    s.product_name,
    s.brand,
    s.material_type,
    s.primary_color,
    s.price_per_sqft,
    s.square_feet,
    s.primary_image_url,
    d.company_name as distributor_name,
    l.city as location_city,
    l.state as location_state
  FROM slab_inventory s
  JOIN distributor_profiles d ON d.id = s.distributor_id
  LEFT JOIN distributor_locations l ON l.id = s.location_id
  WHERE s.status = 'available'
    AND d.is_active = true
    AND (p_material_type IS NULL OR s.material_type = p_material_type)
    AND (p_brand IS NULL OR s.brand ILIKE p_brand)
    AND (p_color IS NULL OR s.primary_color ILIKE '%' || p_color || '%')
    AND (p_min_price IS NULL OR s.price_per_sqft >= p_min_price)
    AND (p_max_price IS NULL OR s.price_per_sqft <= p_max_price)
    AND (p_min_sqft IS NULL OR s.square_feet >= p_min_sqft)
    AND (p_max_sqft IS NULL OR s.square_feet <= p_max_sqft)
    AND (p_location_state IS NULL OR l.state = p_location_state)
    AND (p_search_term IS NULL OR
         to_tsvector('english', s.product_name || ' ' || COALESCE(s.brand, '') || ' ' || COALESCE(s.collection, ''))
         @@ plainto_tsquery('english', p_search_term))
  ORDER BY s.is_remnant ASC, s.created_at DESC
  LIMIT p_limit
  OFFSET p_offset;
END;
$$ LANGUAGE plpgsql;

-- Update distributor stats
CREATE OR REPLACE FUNCTION update_distributor_stats(p_distributor_id UUID)
RETURNS VOID AS $$
BEGIN
  UPDATE distributor_profiles
  SET
    total_slabs = (SELECT COUNT(*) FROM slab_inventory WHERE distributor_id = p_distributor_id AND status = 'available'),
    total_products = (SELECT COUNT(*) FROM distributor_products WHERE distributor_id = p_distributor_id AND is_active = true),
    updated_at = NOW()
  WHERE id = p_distributor_id;
END;
$$ LANGUAGE plpgsql;

-- Increment slab view count
CREATE OR REPLACE FUNCTION increment_slab_view(p_slab_id UUID)
RETURNS VOID AS $$
BEGIN
  UPDATE slab_inventory
  SET view_count = view_count + 1
  WHERE id = p_slab_id;
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- DONE! Run this in Supabase SQL Editor
-- =====================================================
