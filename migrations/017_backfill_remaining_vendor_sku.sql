-- 017: recover the vendor SKUs that 016 missed.
--
-- Three distinct gaps, all measured 2026-07-09:
--
-- 1. 016's isRealSku heuristic required a digit, so genuine digit-less SKUs were
--    demoted to name-mode: alfi's `WHUMSB`, `WHEET`, ruvati's `RVA-FAUCET`,
--    vigo's `VGSTRAINERMB`. 38 rows. A SKU is uppercase with no spaces — the
--    digit was never the distinguishing feature; a lowercase slug is.
--
-- 2. ESI's rows carry the SKU inside the name: `ESI S3118 Large Single Bowl…`.
--    Their `sku` column holds a slug (`esi-s3118-ada-compliant-sink`). 56 rows.
--
-- 3. Alfi's Whitehaus lines do the same: `Whitehaus WHUMSB Undermount Sink…`.
--    20 rows.
--
-- Name-based lookup cannot reach any of these: our `name` is merchandising copy,
-- not the vendor's product title. Without a real SKU the portal sync can never
-- find them. Run in psql. Idempotent — every UPDATE is guarded on vendor_sku IS NULL.

-- 1. Promote SKUs that are already sitting in `sku`, digit or not.
--    Uppercase, no spaces, no lowercase slug characters.
UPDATE catalog_products
SET vendor_sku  = sku,
    lookup_mode = 'sku'
WHERE active
  AND vendor_sku IS NULL
  AND sku ~ '^[A-Z][A-Z0-9._/-]{2,24}$'
  AND sku !~ '[a-z]';

-- 2. ESI: `ESI S3118 …` -> S3118
UPDATE catalog_products
SET vendor_sku  = (regexp_match(name, '^ESI +([A-Z]+[0-9][A-Z0-9-]*)'))[1],
    lookup_mode = 'sku'
WHERE active
  AND vendor_id = 'esi'
  AND vendor_sku IS NULL
  AND name ~ '^ESI +[A-Z]+[0-9]';

-- 3. Alfi / Whitehaus: `Whitehaus WHUMSB …` -> WHUMSB
UPDATE catalog_products
SET vendor_sku  = (regexp_match(name, '^Whitehaus +([A-Z0-9-]{3,})'))[1],
    lookup_mode = 'sku'
WHERE active
  AND vendor_id = 'alfi-trade'
  AND vendor_sku IS NULL
  AND name ~ '^Whitehaus +[A-Z0-9-]{3,}';

-- A slug must never reach vendor_sku. Fails loudly rather than laundering one in.
DO $$
DECLARE bad int;
BEGIN
  SELECT count(*) INTO bad FROM catalog_products
   WHERE vendor_sku IS NOT NULL AND (vendor_sku ~ '[a-z]' OR vendor_sku ~ '\s');
  IF bad > 0 THEN
    RAISE EXCEPTION 'migration 017: % vendor_sku values contain lowercase or whitespace', bad;
  END IF;
END $$;
