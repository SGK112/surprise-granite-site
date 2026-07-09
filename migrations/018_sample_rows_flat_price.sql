-- 018: sample SKUs must carry the flat sample price, not a slab price.
--
-- 174 of the 288 `<colour>-sample` rows still hold the per-sqft slab figure in
-- retail_price AND sample_price — `ethereal-noctis-quartz-sample` at $61.77 —
-- left over from the retired "sample price = the colour's $/sqft" scheme.
--
-- The server charges a flat $12.99 for any sample
-- (api/validators/price-validator.js, SAMPLE_PRICE_CENTS), and
-- marketplace/product/index.html renders retail_price as the product price. So
-- those pages advertise $61.77 and bill $12.99. Whichever way a customer reads
-- that, it is wrong.
--
-- vendor_cost is left alone: it is the real dealer cost of the parent slab and
-- is not shown to anyone.
--
-- Idempotent. Run in psql.

UPDATE catalog_products
   SET retail_price = 12.99,
       sample_price = 12.99
 WHERE active
   AND slug ~ '-sample$'
   AND (retail_price IS DISTINCT FROM 12.99 OR sample_price IS DISTINCT FROM 12.99);

DO $$
DECLARE bad int;
BEGIN
  SELECT count(*) INTO bad FROM catalog_products
   WHERE active AND slug ~ '-sample$'
     AND (retail_price IS DISTINCT FROM 12.99 OR sample_price IS DISTINCT FROM 12.99);
  IF bad > 0 THEN
    RAISE EXCEPTION 'migration 018: % sample rows still off the flat price', bad;
  END IF;
END $$;
