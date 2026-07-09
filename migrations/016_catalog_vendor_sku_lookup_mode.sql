-- 016: separate the vendor's real SKU from the import artifact.
--
-- catalog_products.sku is overloaded. On drop-ship rows it holds a genuine
-- manufacturer SKU (RVA1035, VG6041CHCL6074K1, KBA1002CB). On every stone row
-- it holds an import artifact — `import-arizona-tile-calacattaumber`,
-- `scraped-silestone-whitearabesque`, `msi-abani-stak-marble-encaustic-tile`.
-- Measured 2026-07-09: ruvati 65% real, kibi 76%, vigo 32%, and msi /
-- arizona-tile / daltile / cosentino / arcsurfaces 0%.
--
-- A vendor portal can only find a product by something the vendor recognises.
-- Searching for `import-arizona-tile-calacattaumber` matches nothing and the
-- sync fails silently, which is why the stone vendors have never synced.
--
-- vendor_sku  : the real SKU, NULL when we don't have one. Never a slug.
-- lookup_mode : how a portal should search for this row. 'sku' needs
--               vendor_sku; 'name' searches the product name and requires
--               lookup.skuMatchMode = 'first_result_verify' on the portal.
--
-- `sku` is left alone — the site and existing importers key off it.
-- Run in the Supabase SQL editor. Idempotent.

ALTER TABLE catalog_products
  ADD COLUMN IF NOT EXISTS vendor_sku  text,
  ADD COLUMN IF NOT EXISTS lookup_mode text
    CHECK (lookup_mode IN ('sku', 'name'));

-- Backfill: promote the SKUs that are already real, and mark the rest for
-- name-based lookup. Mirrors isRealSku() in
-- voiceNow-crm/backend/services/vendorPortalEngine.js — keep them in step.
UPDATE catalog_products
SET vendor_sku  = sku,
    lookup_mode = 'sku'
WHERE sku ~ '^[A-Z0-9][A-Z0-9._/-]{2,24}$'
  AND sku ~ '[0-9]'
  AND vendor_sku IS DISTINCT FROM sku;

UPDATE catalog_products
SET lookup_mode = 'name'
WHERE lookup_mode IS NULL;

CREATE INDEX IF NOT EXISTS catalog_products_vendor_sku_idx
  ON catalog_products (vendor_sku) WHERE vendor_sku IS NOT NULL;

-- Expected after run (2026-07-09 counts):
--   lookup_mode='sku'  ~ ruvati 489, kibi 320, vigo 206, alfi/others
--   lookup_mode='name' ~ every stone row: msi 617, arizona-tile 233,
--                        daltile 187, cosentino 212, arcsurfaces 146
