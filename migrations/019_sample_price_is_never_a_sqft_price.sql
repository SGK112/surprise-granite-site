-- 019: `sample_price` must be the flat sample fee, never a per-sqft slab price.
--
-- Migration 018 flattened the 288 `<colour>-sample` rows to $12.99. It left the
-- PARENT slab rows alone, and those still carry the per-sqft figure from the
-- retired "sample price = the colour's $/sqft" scheme. After sync-vendor-cost.js
-- populated vendor_cost from the price library, that figure became *identical to
-- dealer cost* on 842 rows:
--
--   biancocarrarapatinato-marble-cactus  vendor_cost 39.95  sample_price 39.95
--   misty-carrera-caesarstone            vendor_cost 38.01  sample_price 38.01
--
-- GET /api/catalog returns sample_price, and marketplace/index.html renders any
-- value other than 12.99 as "$39.95 /sqft" on the storefront grid. So we removed
-- dealer cost from retail_price, then from specs.sqft_price, and were still
-- publishing it here. This is the third channel.
--
-- After this: a colour we sample carries the flat fee; everything else carries
-- nothing. A per-sqft number can never again reach a `sample_price` column.
--
-- retail_price and vendor_cost are untouched.
-- Idempotent. Run in psql.

UPDATE catalog_products
   SET sample_price = CASE WHEN sample_eligible THEN 12.99 ELSE NULL END
 WHERE active
   AND sample_price IS DISTINCT FROM (CASE WHEN sample_eligible THEN 12.99 ELSE NULL END)
   AND slug !~ '-sample$';

-- The `-sample` SKUs themselves are always the flat fee (migration 018).
UPDATE catalog_products
   SET sample_price = 12.99
 WHERE active AND slug ~ '-sample$' AND sample_price IS DISTINCT FROM 12.99;

DO $$
DECLARE leaked int; odd int;
BEGIN
  SELECT count(*) INTO leaked FROM catalog_products
   WHERE active AND sample_price IS NOT NULL AND vendor_cost IS NOT NULL
     AND sample_price = vendor_cost AND vendor_cost <> 12.99;
  IF leaked > 0 THEN
    RAISE EXCEPTION 'migration 019: % rows still publish dealer cost as sample_price', leaked;
  END IF;

  SELECT count(*) INTO odd FROM catalog_products
   WHERE active AND sample_price IS NOT NULL AND sample_price <> 12.99;
  IF odd > 0 THEN
    RAISE EXCEPTION 'migration 019: % rows carry a sample_price that is not the flat fee', odd;
  END IF;
END $$;
