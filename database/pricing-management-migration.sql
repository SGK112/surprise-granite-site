-- =====================================================
-- VENDOR PRICING & PRODUCT MANAGEMENT SYSTEM
-- Migration Script
-- =====================================================

-- Enable UUID extension if not already enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =====================================================
-- 1. VENDOR PRICE SHEETS (Uploaded CSV/Excel files)
-- =====================================================
CREATE TABLE IF NOT EXISTS vendor_price_sheets (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

  -- Source identification
  vendor_id TEXT NOT NULL, -- 'msi', 'arizona_tile', 'bravo', 'cambria', etc.
  vendor_name TEXT NOT NULL,

  -- File information
  original_filename TEXT NOT NULL,
  file_url TEXT NOT NULL,
  file_size INTEGER,
  file_type TEXT CHECK (file_type IN ('csv', 'xlsx', 'xls')),

  -- Processing status workflow: pending → validating → preview → approved → applied
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'validating', 'preview', 'approved', 'applied', 'rejected', 'error')),
  validation_errors JSONB DEFAULT '[]',
  validation_warnings JSONB DEFAULT '[]',

  -- Preview data (first N rows for display)
  preview_data JSONB,
  total_rows INTEGER,
  valid_rows INTEGER,

  -- Column mapping configuration
  column_mapping JSONB,
  -- Example: {"sku": "Item Number", "name": "Product Name", "price": "Net Price"}

  -- Pricing change summary
  products_affected INTEGER DEFAULT 0,
  price_changes_summary JSONB,
  -- Example: {"increased": 10, "decreased": 5, "unchanged": 100, "new": 3, "not_found": 2}

  -- Approval workflow
  approved_at TIMESTAMPTZ,
  approved_by UUID REFERENCES auth.users(id),
  rejection_reason TEXT,
  applied_at TIMESTAMPTZ,

  -- Upload tracking
  uploaded_by UUID REFERENCES auth.users(id),
  distributor_id UUID,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for price sheets
CREATE INDEX IF NOT EXISTS idx_price_sheets_vendor ON vendor_price_sheets(vendor_id);
CREATE INDEX IF NOT EXISTS idx_price_sheets_status ON vendor_price_sheets(status);
CREATE INDEX IF NOT EXISTS idx_price_sheets_uploaded_by ON vendor_price_sheets(uploaded_by);
CREATE INDEX IF NOT EXISTS idx_price_sheets_created ON vendor_price_sheets(created_at DESC);

-- =====================================================
-- 2. VENDOR PRICING HISTORY (Audit Log)
-- =====================================================
CREATE TABLE IF NOT EXISTS vendor_pricing_history (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

  -- Product reference
  product_id UUID,
  product_sku TEXT NOT NULL,
  product_name TEXT NOT NULL,
  vendor_id TEXT NOT NULL,

  -- Price change details
  old_price DECIMAL(10,2),
  new_price DECIMAL(10,2),
  price_type TEXT DEFAULT 'wholesale' CHECK (price_type IN ('wholesale', 'msrp', 'trade', 'retail')),
  change_percentage DECIMAL(5,2), -- Calculated: ((new - old) / old) * 100

  -- Source tracking
  price_sheet_id UUID REFERENCES vendor_price_sheets(id) ON DELETE SET NULL,
  change_source TEXT NOT NULL CHECK (change_source IN ('csv_upload', 'manual', 'scraper', 'api', 'bulk_update')),

  -- Status
  status TEXT DEFAULT 'applied' CHECK (status IN ('pending', 'applied', 'rolled_back')),
  applied_at TIMESTAMPTZ DEFAULT NOW(),
  rolled_back_at TIMESTAMPTZ,
  rolled_back_by UUID REFERENCES auth.users(id),

  -- Metadata
  changed_by UUID REFERENCES auth.users(id),
  notes TEXT,
  ip_address INET,

  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for pricing history
CREATE INDEX IF NOT EXISTS idx_pricing_history_product ON vendor_pricing_history(product_sku, vendor_id);
CREATE INDEX IF NOT EXISTS idx_pricing_history_vendor ON vendor_pricing_history(vendor_id);
CREATE INDEX IF NOT EXISTS idx_pricing_history_date ON vendor_pricing_history(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_pricing_history_sheet ON vendor_pricing_history(price_sheet_id);

-- =====================================================
-- 3. VENDOR SCRAPER CONFIGURATIONS
-- =====================================================
CREATE TABLE IF NOT EXISTS vendor_scraper_configs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

  vendor_id TEXT NOT NULL UNIQUE,
  vendor_name TEXT NOT NULL,
  vendor_website TEXT,
  vendor_logo_url TEXT,

  -- Scraper settings
  is_enabled BOOLEAN DEFAULT true,
  scraper_type TEXT DEFAULT 'puppeteer' CHECK (scraper_type IN ('puppeteer', 'http', 'api', 'sitemap')),

  -- Configuration JSON
  config JSONB NOT NULL DEFAULT '{}',
  /*
    Example config:
    {
      "base_url": "https://www.msisurfaces.com",
      "product_pages": ["/countertops/quartz", "/countertops/granite"],
      "rate_limit_ms": 1500,
      "timeout_ms": 30000,
      "selectors": {
        "product_list": ".product-grid .product-item",
        "product_name": "h2.product-title",
        "product_image": "img.product-image",
        "product_sku": "[data-sku]"
      },
      "pagination": {
        "type": "scroll", // or "click", "url"
        "max_pages": 50
      },
      "login_required": false
    }
  */

  -- Schedule settings
  schedule_enabled BOOLEAN DEFAULT false,
  schedule_cron TEXT, -- e.g., '0 2 * * 1' = Monday 2am
  last_run_at TIMESTAMPTZ,
  next_run_at TIMESTAMPTZ,

  -- Statistics
  total_runs INTEGER DEFAULT 0,
  successful_runs INTEGER DEFAULT 0,
  last_error TEXT,
  last_products_found INTEGER,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- =====================================================
-- 4. VENDOR SCRAPER RUNS (Execution History)
-- =====================================================
CREATE TABLE IF NOT EXISTS vendor_scraper_runs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

  vendor_id TEXT NOT NULL,
  config_id UUID REFERENCES vendor_scraper_configs(id) ON DELETE SET NULL,

  -- Run information
  run_type TEXT NOT NULL CHECK (run_type IN ('scheduled', 'manual', 'on_demand', 'test')),
  triggered_by UUID REFERENCES auth.users(id),

  -- Status
  status TEXT DEFAULT 'running' CHECK (status IN ('pending', 'running', 'completed', 'failed', 'cancelled')),
  started_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  duration_seconds INTEGER,

  -- Results summary
  products_found INTEGER DEFAULT 0,
  products_updated INTEGER DEFAULT 0,
  products_new INTEGER DEFAULT 0,
  products_discontinued INTEGER DEFAULT 0,
  images_downloaded INTEGER DEFAULT 0,
  images_updated INTEGER DEFAULT 0,

  -- Detailed change report
  changes_report JSONB,
  /*
    Example:
    {
      "updated": [{"sku": "ABC123", "changes": {"price": {"old": 10, "new": 12}}}],
      "new": [{"sku": "XYZ789", "name": "New Product"}],
      "discontinued": [{"sku": "OLD001", "name": "Old Product"}]
    }
  */

  -- Error tracking
  error_message TEXT,
  error_details JSONB,
  warnings JSONB DEFAULT '[]',

  -- Performance metrics
  pages_scraped INTEGER DEFAULT 0,
  requests_made INTEGER DEFAULT 0,
  bytes_downloaded BIGINT DEFAULT 0,

  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for scraper runs
CREATE INDEX IF NOT EXISTS idx_scraper_runs_vendor ON vendor_scraper_runs(vendor_id);
CREATE INDEX IF NOT EXISTS idx_scraper_runs_status ON vendor_scraper_runs(status);
CREATE INDEX IF NOT EXISTS idx_scraper_runs_started ON vendor_scraper_runs(started_at DESC);

-- =====================================================
-- 5. PRODUCT DISCONTINUATIONS
-- =====================================================
CREATE TABLE IF NOT EXISTS product_discontinuations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

  -- Product identification
  product_id UUID,
  product_sku TEXT NOT NULL,
  product_name TEXT NOT NULL,
  vendor_id TEXT NOT NULL,
  product_type TEXT, -- 'quartz', 'granite', 'tile', etc.

  -- Detection information
  detected_at TIMESTAMPTZ DEFAULT NOW(),
  detected_by TEXT NOT NULL CHECK (detected_by IN ('scraper', 'price_sheet', 'manual', 'vendor_notification')),
  scraper_run_id UUID REFERENCES vendor_scraper_runs(id) ON DELETE SET NULL,

  -- Status workflow: pending → confirmed OR false_positive
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'false_positive', 'replaced', 'reinstated')),
  confirmed_at TIMESTAMPTZ,
  confirmed_by UUID REFERENCES auth.users(id),

  -- Replacement product (if applicable)
  replacement_sku TEXT,
  replacement_product_id UUID,
  replacement_name TEXT,

  -- Additional info
  reason TEXT, -- 'out_of_stock', 'discontinued', 'replaced', 'seasonal'
  vendor_notes TEXT,
  internal_notes TEXT,

  -- Last seen data
  last_seen_url TEXT,
  last_seen_price DECIMAL(10,2),
  last_seen_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for discontinuations
CREATE INDEX IF NOT EXISTS idx_discontinuations_status ON product_discontinuations(status);
CREATE INDEX IF NOT EXISTS idx_discontinuations_vendor ON product_discontinuations(vendor_id);
CREATE INDEX IF NOT EXISTS idx_discontinuations_sku ON product_discontinuations(product_sku);

-- =====================================================
-- 6. VENDOR IMPORT TEMPLATES
-- =====================================================
CREATE TABLE IF NOT EXISTS vendor_import_templates (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

  vendor_id TEXT NOT NULL,
  template_name TEXT NOT NULL,
  is_default BOOLEAN DEFAULT false,

  -- Column mapping
  column_mapping JSONB NOT NULL,
  /*
    Example:
    {
      "sku": {"source_column": "Item Number", "required": true},
      "name": {"source_column": "Product Name", "required": true},
      "wholesale_price": {"source_column": "Net Price", "required": true},
      "msrp": {"source_column": "Suggested Retail", "required": false},
      "category": {"source_column": "Category", "required": false},
      "material": {"source_column": "Material Type", "required": false},
      "color": {"source_column": "Color Family", "required": false},
      "thickness": {"source_column": "Thickness", "required": false}
    }
  */

  -- Data transformations
  transformations JSONB DEFAULT '{}',
  /*
    Example:
    {
      "thickness": {"type": "regex", "pattern": "(\\d+)\\s*cm", "replace": "$1"},
      "wholesale_price": {"type": "number", "remove_currency": true},
      "category": {"type": "map", "values": {"CTR": "Countertops", "TLE": "Tile"}}
    }
  */

  -- Validation rules
  validation_rules JSONB DEFAULT '{}',
  /*
    Example:
    {
      "wholesale_price": {"min": 0.01, "max": 10000},
      "sku": {"pattern": "^[A-Z0-9-]+$"}
    }
  */

  -- Metadata
  description TEXT,
  created_by UUID REFERENCES auth.users(id),
  last_used_at TIMESTAMPTZ,
  use_count INTEGER DEFAULT 0,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(vendor_id, template_name)
);

-- Index for templates
CREATE INDEX IF NOT EXISTS idx_import_templates_vendor ON vendor_import_templates(vendor_id);

-- =====================================================
-- 7. EXTEND EXISTING TABLES
-- =====================================================

-- Add pricing fields to distributor_products (if table exists)
DO $$
BEGIN
  -- Check if distributor_products table exists
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'distributor_products') THEN
    -- Add wholesale_cost column
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'distributor_products' AND column_name = 'wholesale_cost') THEN
      ALTER TABLE distributor_products ADD COLUMN wholesale_cost DECIMAL(10,2);
    END IF;

    -- Add msrp column
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'distributor_products' AND column_name = 'msrp') THEN
      ALTER TABLE distributor_products ADD COLUMN msrp DECIMAL(10,2);
    END IF;

    -- Add last_price_update column
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'distributor_products' AND column_name = 'last_price_update') THEN
      ALTER TABLE distributor_products ADD COLUMN last_price_update TIMESTAMPTZ;
    END IF;

    -- Add price_source column
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'distributor_products' AND column_name = 'price_source') THEN
      ALTER TABLE distributor_products ADD COLUMN price_source TEXT;
    END IF;

    -- Add is_discontinued column
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'distributor_products' AND column_name = 'is_discontinued') THEN
      ALTER TABLE distributor_products ADD COLUMN is_discontinued BOOLEAN DEFAULT false;
    END IF;

    -- Add discontinued_at column
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'distributor_products' AND column_name = 'discontinued_at') THEN
      ALTER TABLE distributor_products ADD COLUMN discontinued_at TIMESTAMPTZ;
    END IF;

    -- Add last_scraped_at column
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'distributor_products' AND column_name = 'last_scraped_at') THEN
      ALTER TABLE distributor_products ADD COLUMN last_scraped_at TIMESTAMPTZ;
    END IF;
  END IF;
END $$;

-- Add pricing fields to slab_inventory (if table exists)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'slab_inventory') THEN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'slab_inventory' AND column_name = 'wholesale_cost') THEN
      ALTER TABLE slab_inventory ADD COLUMN wholesale_cost DECIMAL(10,2);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'slab_inventory' AND column_name = 'msrp') THEN
      ALTER TABLE slab_inventory ADD COLUMN msrp DECIMAL(10,2);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'slab_inventory' AND column_name = 'last_price_update') THEN
      ALTER TABLE slab_inventory ADD COLUMN last_price_update TIMESTAMPTZ;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'slab_inventory' AND column_name = 'price_source') THEN
      ALTER TABLE slab_inventory ADD COLUMN price_source TEXT;
    END IF;
  END IF;
END $$;

-- =====================================================
-- 8. ROW LEVEL SECURITY POLICIES
-- =====================================================

-- Enable RLS on new tables
ALTER TABLE vendor_price_sheets ENABLE ROW LEVEL SECURITY;
ALTER TABLE vendor_pricing_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE vendor_scraper_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE vendor_scraper_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_discontinuations ENABLE ROW LEVEL SECURITY;
ALTER TABLE vendor_import_templates ENABLE ROW LEVEL SECURITY;

-- Price sheets: Users can see their own uploads, admins see all
CREATE POLICY "Users can view own price sheets" ON vendor_price_sheets
  FOR SELECT USING (
    uploaded_by = auth.uid() OR
    EXISTS (SELECT 1 FROM sg_users WHERE id = auth.uid() AND account_type IN ('admin', 'super_admin'))
  );

CREATE POLICY "Users can insert price sheets" ON vendor_price_sheets
  FOR INSERT WITH CHECK (uploaded_by = auth.uid());

CREATE POLICY "Admins can update price sheets" ON vendor_price_sheets
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM sg_users WHERE id = auth.uid() AND account_type IN ('admin', 'super_admin'))
  );

-- Pricing history: Admins only for full access
CREATE POLICY "Admins can view pricing history" ON vendor_pricing_history
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM sg_users WHERE id = auth.uid() AND account_type IN ('admin', 'super_admin'))
  );

-- Scraper configs: Admins only
CREATE POLICY "Admins can manage scraper configs" ON vendor_scraper_configs
  FOR ALL USING (
    EXISTS (SELECT 1 FROM sg_users WHERE id = auth.uid() AND account_type IN ('admin', 'super_admin'))
  );

-- Scraper runs: Admins can view and manage
CREATE POLICY "Admins can view scraper runs" ON vendor_scraper_runs
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM sg_users WHERE id = auth.uid() AND account_type IN ('admin', 'super_admin'))
  );

-- Discontinuations: Admins can view and manage
CREATE POLICY "Admins can manage discontinuations" ON product_discontinuations
  FOR ALL USING (
    EXISTS (SELECT 1 FROM sg_users WHERE id = auth.uid() AND account_type IN ('admin', 'super_admin'))
  );

-- Import templates: Users can see templates, admins can edit
CREATE POLICY "Users can view import templates" ON vendor_import_templates
  FOR SELECT USING (true);

CREATE POLICY "Admins can manage import templates" ON vendor_import_templates
  FOR ALL USING (
    EXISTS (SELECT 1 FROM sg_users WHERE id = auth.uid() AND account_type IN ('admin', 'super_admin'))
  );

-- =====================================================
-- 9. HELPER FUNCTIONS
-- =====================================================

-- Function to calculate price change percentage
CREATE OR REPLACE FUNCTION calculate_price_change_percentage(old_price DECIMAL, new_price DECIMAL)
RETURNS DECIMAL AS $$
BEGIN
  IF old_price IS NULL OR old_price = 0 THEN
    RETURN NULL;
  END IF;
  RETURN ROUND(((new_price - old_price) / old_price) * 100, 2);
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Function to update timestamps
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Add triggers for updated_at
CREATE TRIGGER update_vendor_price_sheets_updated_at
  BEFORE UPDATE ON vendor_price_sheets
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_vendor_scraper_configs_updated_at
  BEFORE UPDATE ON vendor_scraper_configs
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_product_discontinuations_updated_at
  BEFORE UPDATE ON product_discontinuations
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_vendor_import_templates_updated_at
  BEFORE UPDATE ON vendor_import_templates
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- =====================================================
-- 10. SEED DEFAULT SCRAPER CONFIGS
-- =====================================================

INSERT INTO vendor_scraper_configs (vendor_id, vendor_name, vendor_website, scraper_type, config, is_enabled)
VALUES
  ('msi', 'MSI Surfaces', 'https://www.msisurfaces.com', 'puppeteer', '{
    "base_url": "https://www.msisurfaces.com",
    "product_pages": ["/countertops/quartz", "/countertops/granite", "/countertops/marble", "/countertops/quartzite"],
    "rate_limit_ms": 1500,
    "timeout_ms": 30000,
    "image_cdn": "https://cdn.msisurfaces.com"
  }', true),

  ('arizona_tile', 'Arizona Tile', 'https://www.arizonatile.com', 'puppeteer', '{
    "base_url": "https://www.arizonatile.com",
    "product_pages": ["/slab-gallery", "/quartz", "/natural-stone"],
    "rate_limit_ms": 1500,
    "timeout_ms": 30000
  }', true),

  ('bravo', 'Bravo Tile & Stone', 'https://bravotileandstone.com', 'http', '{
    "base_url": "https://bravotileandstone.com",
    "sitemap_url": "https://bravotileandstone.com/sitemap.xml",
    "rate_limit_ms": 1000,
    "timeout_ms": 15000
  }', true),

  ('cambria', 'Cambria', 'https://www.cambriausa.com', 'puppeteer', '{
    "base_url": "https://www.cambriausa.com",
    "product_pages": ["/quartz-countertops/colors"],
    "rate_limit_ms": 2000,
    "timeout_ms": 30000
  }', true),

  ('caesarstone', 'Caesarstone', 'https://www.caesarstoneus.com', 'puppeteer', '{
    "base_url": "https://www.caesarstoneus.com",
    "product_pages": ["/countertops"],
    "rate_limit_ms": 1500,
    "timeout_ms": 30000
  }', true),

  ('silestone', 'Silestone', 'https://www.silestoneusa.com', 'puppeteer', '{
    "base_url": "https://www.silestoneusa.com",
    "product_pages": ["/colors"],
    "rate_limit_ms": 1500,
    "timeout_ms": 30000
  }', true),

  ('daltile', 'Daltile', 'https://www.daltile.com', 'puppeteer', '{
    "base_url": "https://www.daltile.com",
    "product_pages": ["/products"],
    "rate_limit_ms": 1500,
    "timeout_ms": 30000
  }', true),

  ('hanstone', 'Hanstone Quartz', 'https://www.hanstoneusa.com', 'puppeteer', '{
    "base_url": "https://www.hanstoneusa.com",
    "product_pages": ["/colors"],
    "rate_limit_ms": 1500,
    "timeout_ms": 30000
  }', true)

ON CONFLICT (vendor_id) DO UPDATE SET
  vendor_name = EXCLUDED.vendor_name,
  vendor_website = EXCLUDED.vendor_website,
  config = EXCLUDED.config,
  updated_at = NOW();

-- =====================================================
-- 11. SEED DEFAULT IMPORT TEMPLATES
-- =====================================================

INSERT INTO vendor_import_templates (vendor_id, template_name, is_default, column_mapping, transformations)
VALUES
  ('msi', 'MSI Standard Price List', true, '{
    "sku": {"source_column": "Item ID", "required": true},
    "name": {"source_column": "Color", "required": true},
    "wholesale_price": {"source_column": "PRICE PER SF", "required": true},
    "box_price": {"source_column": "PRICE PER BOX", "required": false},
    "category": {"source_column": "Series", "required": false}
  }', '{
    "wholesale_price": {"type": "number", "remove_currency": true},
    "box_price": {"type": "number", "remove_currency": true}
  }'),

  ('generic', 'Generic CSV Template', true, '{
    "sku": {"source_column": "SKU", "required": true, "aliases": ["Item Number", "Product ID", "Item ID", "Code"]},
    "name": {"source_column": "Name", "required": true, "aliases": ["Product Name", "Title", "Description", "Color"]},
    "wholesale_price": {"source_column": "Price", "required": true, "aliases": ["Wholesale", "Cost", "Net Price", "Unit Price", "PRICE PER SF"]},
    "msrp": {"source_column": "MSRP", "required": false, "aliases": ["Retail", "List Price", "Suggested Retail"]},
    "category": {"source_column": "Category", "required": false, "aliases": ["Type", "Material", "Product Type"]},
    "color": {"source_column": "Color", "required": false, "aliases": ["Color Family", "Shade"]},
    "material": {"source_column": "Material", "required": false, "aliases": ["Material Type", "Stone Type"]}
  }', '{
    "wholesale_price": {"type": "number", "remove_currency": true},
    "msrp": {"type": "number", "remove_currency": true}
  }')

ON CONFLICT (vendor_id, template_name) DO UPDATE SET
  column_mapping = EXCLUDED.column_mapping,
  transformations = EXCLUDED.transformations,
  updated_at = NOW();

-- =====================================================
-- MIGRATION COMPLETE
-- =====================================================
-- Run this with: psql $DATABASE_URL -f pricing-management-migration.sql
-- Or execute via Supabase SQL editor
