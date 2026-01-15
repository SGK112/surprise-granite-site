-- =============================================
-- SURPRISE GRANITE - ENTERPRISE PRODUCT MANAGEMENT
-- Migration 003: Migrate Existing Slab Inventory
-- =============================================

-- This migration converts existing slab_inventory data to the new products schema
-- Run this AFTER the core schema and RLS policies are in place

-- =============================================
-- Step 1: Insert products from slab_inventory
-- =============================================

INSERT INTO products (
  id,
  distributor_id,
  sku,
  external_sku,
  product_type,
  name,
  brand,
  description,
  material_type,
  color_family,
  finish,
  quantity,
  quantity_unit,
  wholesale_price,
  price_unit,
  location_id,
  status,
  is_featured,
  is_public,
  images,
  tags,
  sync_source,
  created_at,
  updated_at
)
SELECT
  si.id,
  si.distributor_id,
  COALESCE(si.lot_number, 'SLAB-' || SUBSTRING(si.id::text, 1, 8)),
  NULL,
  'slab',
  si.slab_name,
  NULL,
  si.description,
  si.material_type,
  si.color,
  si.finish,
  1, -- Each slab is quantity 1
  'each',
  si.price_per_sqft,
  'sqft',
  si.location_id,
  CASE
    WHEN si.status = 'available' THEN 'active'
    WHEN si.status = 'sold' THEN 'inactive'
    WHEN si.status = 'reserved' THEN 'active'
    WHEN si.status = 'hold' THEN 'active'
    ELSE 'active'
  END,
  COALESCE(si.is_featured, false),
  true,
  CASE
    WHEN si.image_url IS NOT NULL AND si.image_url != '' THEN
      jsonb_build_array(si.image_url)
    ELSE
      '[]'::jsonb
  END,
  CASE
    WHEN si.quality_grade IS NOT NULL THEN
      ARRAY[si.quality_grade]
    ELSE
      NULL
  END,
  'migration',
  COALESCE(si.created_at, NOW()),
  COALESCE(si.updated_at, NOW())
FROM slab_inventory si
WHERE NOT EXISTS (
  SELECT 1 FROM products p WHERE p.id = si.id
)
ON CONFLICT (id) DO NOTHING;

-- =============================================
-- Step 2: Insert slab-specific data
-- =============================================

INSERT INTO product_slabs (
  product_id,
  length_inches,
  width_inches,
  thickness_cm,
  lot_number,
  block_number,
  bundle_number,
  slab_number,
  slabs_in_bundle,
  quality_grade,
  origin_country,
  quarry_name,
  created_at,
  updated_at
)
SELECT
  si.id,
  si.length_inches,
  si.width_inches,
  si.thickness_cm,
  si.lot_number,
  si.block_number,
  si.bundle_number,
  si.slab_number,
  si.slabs_in_bundle,
  si.quality_grade,
  si.origin_country,
  si.quarry_name,
  COALESCE(si.created_at, NOW()),
  COALESCE(si.updated_at, NOW())
FROM slab_inventory si
WHERE EXISTS (
  SELECT 1 FROM products p WHERE p.id = si.id
)
AND NOT EXISTS (
  SELECT 1 FROM product_slabs ps WHERE ps.product_id = si.id
)
ON CONFLICT (product_id) DO NOTHING;

-- =============================================
-- Step 3: Update type_specific_id in products
-- =============================================

UPDATE products p
SET type_specific_id = ps.id
FROM product_slabs ps
WHERE p.id = ps.product_id
AND p.product_type = 'slab'
AND p.type_specific_id IS NULL;

-- =============================================
-- Step 4: Create inventory transactions for initial stock
-- =============================================

INSERT INTO inventory_transactions (
  product_id,
  transaction_type,
  quantity_change,
  quantity_before,
  quantity_after,
  reference_type,
  reference_id,
  notes,
  performed_at
)
SELECT
  p.id,
  'receive',
  p.quantity,
  0,
  p.quantity,
  'migration',
  'initial_import',
  'Initial inventory from slab_inventory migration',
  p.created_at
FROM products p
WHERE p.sync_source = 'migration'
AND NOT EXISTS (
  SELECT 1 FROM inventory_transactions it
  WHERE it.product_id = p.id
  AND it.reference_type = 'migration'
);

-- =============================================
-- Step 5: Verify migration counts
-- =============================================

DO $$
DECLARE
  slab_count INTEGER;
  product_count INTEGER;
  product_slab_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO slab_count FROM slab_inventory;
  SELECT COUNT(*) INTO product_count FROM products WHERE product_type = 'slab';
  SELECT COUNT(*) INTO product_slab_count FROM product_slabs;

  RAISE NOTICE 'Migration Summary:';
  RAISE NOTICE '  Original slab_inventory records: %', slab_count;
  RAISE NOTICE '  Migrated to products table: %', product_count;
  RAISE NOTICE '  Product_slabs records created: %', product_slab_count;

  IF slab_count != product_count THEN
    RAISE WARNING 'Some records may not have been migrated. Check for duplicates or constraints.';
  END IF;
END $$;

-- =============================================
-- ROLLBACK SCRIPT (if needed)
-- Uncomment and run to revert migration
-- =============================================

/*
-- Delete migrated data
DELETE FROM inventory_transactions WHERE reference_type = 'migration';
DELETE FROM product_slabs WHERE product_id IN (SELECT id FROM products WHERE sync_source = 'migration');
DELETE FROM products WHERE sync_source = 'migration';
*/
