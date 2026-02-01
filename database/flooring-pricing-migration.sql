-- =====================================================
-- FLOORING PRICING INTEGRATION
-- Migration Script for LVP/Flooring Products
-- =====================================================

-- Enable UUID extension if not already enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =====================================================
-- 1. FLOORING PRODUCTS TABLE
-- =====================================================
CREATE TABLE IF NOT EXISTS flooring_products (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

  -- Product identification
  sku TEXT UNIQUE,
  name TEXT NOT NULL,
  slug TEXT UNIQUE,

  -- Vendor/Brand info
  vendor_id TEXT NOT NULL DEFAULT 'msi',
  brand TEXT NOT NULL DEFAULT 'MSI',
  collection TEXT, -- 'andover', 'ashton', 'cyrus', etc.

  -- Product details
  type TEXT DEFAULT 'Luxury Vinyl', -- 'Luxury Vinyl', 'SPC', 'WPC', 'Laminate'
  format TEXT DEFAULT 'Plank', -- 'Plank', 'Tile'
  dimensions TEXT, -- '7x48', '9x60', etc.

  -- Visual attributes
  primary_color TEXT,
  color_family TEXT,
  style TEXT, -- 'Wood Look', 'Stone Look', 'Concrete'
  finish TEXT, -- 'Matte', 'Embossed', 'Wire Brushed'

  -- Technical specs
  thickness TEXT, -- '5mm', '6mm', '8mm'
  wear_layer TEXT, -- '12mil', '20mil', '22mil'
  backing TEXT, -- 'Cork', 'IXPE', 'EVA'
  is_waterproof BOOLEAN DEFAULT true,
  is_scratch_resistant BOOLEAN DEFAULT true,

  -- Coverage
  sf_per_box DECIMAL(6,2),
  sf_per_pallet DECIMAL(8,2),
  boxes_per_pallet INTEGER,

  -- Pricing (wholesale costs)
  wholesale_cost_sf DECIMAL(8,4), -- Cost per sq ft
  wholesale_cost_box DECIMAL(10,2), -- Cost per box
  msrp_sf DECIMAL(8,4), -- MSRP per sq ft
  last_price_update TIMESTAMPTZ,
  price_source TEXT, -- 'csv_upload', 'manual', 'scraper'

  -- Images
  primary_image TEXT,
  secondary_image TEXT,
  room_scene_image TEXT,
  images JSONB DEFAULT '[]',

  -- URLs
  url TEXT,
  vendor_url TEXT,

  -- Availability
  is_active BOOLEAN DEFAULT true,
  is_discontinued BOOLEAN DEFAULT false,
  discontinued_at TIMESTAMPTZ,
  in_stock BOOLEAN DEFAULT true,
  lead_time_days INTEGER,

  -- Installation
  installation_method TEXT, -- 'Click Lock', 'Glue Down', 'Loose Lay'
  recommended_underlayment TEXT,
  can_install_over_radiant_heat BOOLEAN,

  -- Warranty
  residential_warranty TEXT, -- 'Lifetime', '25 Years'
  commercial_warranty TEXT, -- '10 Years', '15 Years'

  -- Search/Filter
  tags TEXT[],
  features JSONB DEFAULT '{}',

  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  last_scraped_at TIMESTAMPTZ
);

-- Indexes for flooring products
CREATE INDEX IF NOT EXISTS idx_flooring_vendor ON flooring_products(vendor_id);
CREATE INDEX IF NOT EXISTS idx_flooring_collection ON flooring_products(collection);
CREATE INDEX IF NOT EXISTS idx_flooring_type ON flooring_products(type);
CREATE INDEX IF NOT EXISTS idx_flooring_color ON flooring_products(primary_color);
CREATE INDEX IF NOT EXISTS idx_flooring_active ON flooring_products(is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_flooring_slug ON flooring_products(slug);
CREATE INDEX IF NOT EXISTS idx_flooring_sku ON flooring_products(sku);

-- Full text search index
CREATE INDEX IF NOT EXISTS idx_flooring_search ON flooring_products
  USING gin(to_tsvector('english', coalesce(name, '') || ' ' || coalesce(collection, '') || ' ' || coalesce(primary_color, '')));

-- =====================================================
-- 2. ADD MSI FLOORING VENDOR TEMPLATE
-- =====================================================
INSERT INTO vendor_import_templates (vendor_id, template_name, is_default, column_mapping, transformations, validation_rules, description)
VALUES
  ('msi_flooring', 'MSI Flooring Price List', true, '{
    "sku": {"source_column": "Item ID", "required": true, "aliases": ["SKU", "Product ID", "Item Number"]},
    "name": {"source_column": "Color", "required": true, "aliases": ["Product Name", "Name", "Description"]},
    "collection": {"source_column": "Series", "required": false, "aliases": ["Collection", "Line"]},
    "wholesale_price_sf": {"source_column": "PRICE PER SF", "required": true, "aliases": ["Price/SF", "Cost per SF", "Unit Price"]},
    "wholesale_price_box": {"source_column": "PRICE PER BOX", "required": false, "aliases": ["Price/Box", "Box Price", "Carton Price"]},
    "sf_per_box": {"source_column": "SF PER BOX", "required": false, "aliases": ["Coverage", "SF/Box", "Box Coverage"]},
    "dimensions": {"source_column": "Size", "required": false, "aliases": ["Dimensions", "Format"]},
    "thickness": {"source_column": "Thickness", "required": false, "aliases": ["Thick", "Total Thickness"]},
    "wear_layer": {"source_column": "Wear Layer", "required": false, "aliases": ["Wear", "Surface Layer"]}
  }', '{
    "wholesale_price_sf": {"type": "number", "remove_currency": true},
    "wholesale_price_box": {"type": "number", "remove_currency": true},
    "sf_per_box": {"type": "number"},
    "collection": {"type": "lowercase_slug"}
  }', '{
    "wholesale_price_sf": {"min": 0.50, "max": 20.00},
    "wholesale_price_box": {"min": 10.00, "max": 500.00},
    "sf_per_box": {"min": 10, "max": 50}
  }', 'Standard MSI LVP/SPC flooring price list format with per-SF and per-box pricing')

ON CONFLICT (vendor_id, template_name) DO UPDATE SET
  column_mapping = EXCLUDED.column_mapping,
  transformations = EXCLUDED.transformations,
  validation_rules = EXCLUDED.validation_rules,
  description = EXCLUDED.description,
  updated_at = NOW();

-- =====================================================
-- 3. ADD MSI FLOORING SCRAPER CONFIG
-- =====================================================
INSERT INTO vendor_scraper_configs (vendor_id, vendor_name, vendor_website, scraper_type, config, is_enabled)
VALUES
  ('msi_flooring', 'MSI Flooring', 'https://www.msisurfaces.com/lvt-flooring/', 'puppeteer', '{
    "base_url": "https://www.msisurfaces.com",
    "product_pages": [
      "/lvt-flooring/luxury-vinyl-plank/",
      "/lvt-flooring/rigid-core-luxury-vinyl/",
      "/lvt-flooring/waterproof-flooring/"
    ],
    "rate_limit_ms": 1500,
    "timeout_ms": 30000,
    "selectors": {
      "product_list": ".product-list-item",
      "product_name": ".product-name",
      "product_image": ".product-image img",
      "product_link": "a.product-link",
      "collection": ".product-collection",
      "specs": ".product-specs"
    },
    "image_cdn": "https://images.msisurfaces.com"
  }', true)

ON CONFLICT (vendor_id) DO UPDATE SET
  vendor_name = EXCLUDED.vendor_name,
  vendor_website = EXCLUDED.vendor_website,
  config = EXCLUDED.config,
  updated_at = NOW();

-- =====================================================
-- 4. ROW LEVEL SECURITY
-- =====================================================
ALTER TABLE flooring_products ENABLE ROW LEVEL SECURITY;

-- Public read access for active products
CREATE POLICY "Public can view active flooring" ON flooring_products
  FOR SELECT USING (is_active = true AND is_discontinued = false);

-- Admins can manage all flooring products
CREATE POLICY "Admins can manage flooring" ON flooring_products
  FOR ALL USING (
    EXISTS (SELECT 1 FROM sg_users WHERE id = auth.uid() AND account_type IN ('admin', 'super_admin'))
  );

-- =====================================================
-- 5. UPDATED_AT TRIGGER
-- =====================================================
CREATE TRIGGER update_flooring_products_updated_at
  BEFORE UPDATE ON flooring_products
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- =====================================================
-- 6. SEED INITIAL FLOORING DATA FROM EXISTING JSON
-- =====================================================
-- This can be populated via the import script or manually

-- =====================================================
-- 7. VIEW FOR FLOORING WITH CALCULATED RETAIL PRICES
-- =====================================================
CREATE OR REPLACE VIEW flooring_products_with_pricing AS
SELECT
  f.*,
  -- Guest pricing (55% markup)
  ROUND(f.wholesale_cost_sf * 1.55, 2) as guest_price_sf,
  ROUND(f.wholesale_cost_box * 1.55, 2) as guest_price_box,
  -- Homeowner pricing (50% markup)
  ROUND(f.wholesale_cost_sf * 1.50, 2) as homeowner_price_sf,
  ROUND(f.wholesale_cost_box * 1.50, 2) as homeowner_price_box,
  -- Pro pricing (35% markup)
  ROUND(f.wholesale_cost_sf * 1.35, 2) as pro_price_sf,
  ROUND(f.wholesale_cost_box * 1.35, 2) as pro_price_box,
  -- Contractor pricing (25% markup)
  ROUND(f.wholesale_cost_sf * 1.25, 2) as contractor_price_sf,
  ROUND(f.wholesale_cost_box * 1.25, 2) as contractor_price_box,
  -- Fabricator pricing (15% markup)
  ROUND(f.wholesale_cost_sf * 1.15, 2) as fabricator_price_sf,
  ROUND(f.wholesale_cost_box * 1.15, 2) as fabricator_price_box
FROM flooring_products f
WHERE f.is_active = true;

-- =====================================================
-- MIGRATION COMPLETE
-- =====================================================
-- Run: psql $DATABASE_URL -f flooring-pricing-migration.sql
