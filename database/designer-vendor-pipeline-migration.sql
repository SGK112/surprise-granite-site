-- Designer Vendor Pipeline Migration
-- Adds room designer integration columns to distributor_products table
-- Phase 3A: Allows distributors to map their products to designer element types

-- Add designer-specific columns to distributor_products
ALTER TABLE distributor_products
  ADD COLUMN IF NOT EXISTS designer_element_type TEXT,
  ADD COLUMN IF NOT EXISTS designer_visible BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS designer_category TEXT,
  ADD COLUMN IF NOT EXISTS designer_default_width DECIMAL,
  ADD COLUMN IF NOT EXISTS designer_default_height DECIMAL,
  ADD COLUMN IF NOT EXISTS designer_color TEXT;

-- Add comments for documentation
COMMENT ON COLUMN distributor_products.designer_element_type IS 'Maps to ELEMENT_TYPES key in room designer (e.g., base-cabinet, vanity-36, countertop)';
COMMENT ON COLUMN distributor_products.designer_visible IS 'Whether this product appears in the room designer sidebar';
COMMENT ON COLUMN distributor_products.designer_category IS 'Room designer sidebar tab: cabinets, bathroom, appliances, surfaces';
COMMENT ON COLUMN distributor_products.designer_default_width IS 'Default width in feet when placed on canvas';
COMMENT ON COLUMN distributor_products.designer_default_height IS 'Default height/depth in feet when placed on canvas';
COMMENT ON COLUMN distributor_products.designer_color IS 'Hex color override for canvas rendering (e.g., #8B4513)';

-- Index for efficient querying of designer-visible products
CREATE INDEX IF NOT EXISTS idx_distributor_products_designer_visible
  ON distributor_products (designer_visible)
  WHERE designer_visible = true;

-- Composite index for category filtering
CREATE INDEX IF NOT EXISTS idx_distributor_products_designer_category
  ON distributor_products (designer_category, designer_element_type)
  WHERE designer_visible = true;
