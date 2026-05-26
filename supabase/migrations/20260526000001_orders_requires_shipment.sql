-- Orders: separate shippable purchases from payment-only transactions
-- (deposits, balances, invoice settlements). Adds requires_shipment so the
-- "Needs Shipment" queue stops piling up with project payments that never
-- get a tracking number because they don't ship anything physical.
--
-- Generated alongside scripts/preview-requires-shipment.js — same rules.
-- Dry-run on 2026-05-26 against prod (573 orders) flipped 10 rows; verified
-- by Joshua before this migration ran.

-- 1. Add the column. Default true so new orders are conservatively treated
--    as shippable until classified otherwise.
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS requires_shipment boolean NOT NULL DEFAULT true;

-- 2. Backfill — flip to false for orders that don't ship anything physical.
--    Rules in priority order (any match flips):
--
--    a. metadata.payment_type explicitly says non-shippable
--    b. metadata.source = 'quick-pay'
--    c. metadata references an invoice / lead (project work)
--    d. kind column already says 'project'
--    e. items[] is empty AND no shipping address
--    f. item name matches the project keyword regex
--
--    Intentionally NOT matched: items named "Invoice Payment" alone — too
--    ambiguous (could be a sample mislabeled at checkout, e.g. Miranda Gaona
--    $15 on 2026-05-12). Those stay shippable so staff can resolve manually.

UPDATE public.orders
SET requires_shipment = false
WHERE requires_shipment = true
  AND (
       metadata->>'payment_type' IN ('invoice','deposit','balance','final','quick-pay','custom')
    OR metadata->>'source' = 'quick-pay'
    OR metadata ? 'invoice_ref'
    OR metadata ? 'invoice_id'
    OR metadata->>'lead_id' IS NOT NULL
    OR kind = 'project'
    OR (
         jsonb_array_length(COALESCE(items, '[]'::jsonb)) = 0
         AND shipping_address_line1 IS NULL
       )
    OR EXISTS (
         SELECT 1
         FROM jsonb_array_elements(COALESCE(items, '[]'::jsonb)) AS item
         WHERE item->>'name' ~* '(deposit|final\s*payment|balance|EST-?\d|INV-?\d|countertop|backsplash|remodel|installation|f&i\s|change\s*order|materials\s*for)'
       )
  );

-- 3. Index for the "Needs Shipment" queue.
CREATE INDEX IF NOT EXISTS idx_orders_needs_shipment
  ON public.orders(requires_shipment, status)
  WHERE requires_shipment = true;

-- 4. Verification view — useful for spot-checks post-migration.
CREATE OR REPLACE VIEW public.orders_shipment_summary AS
SELECT
  requires_shipment,
  status,
  COUNT(*) AS rows,
  ROUND(SUM(total)::numeric, 2) AS volume
FROM public.orders
GROUP BY requires_shipment, status
ORDER BY requires_shipment DESC, status;
