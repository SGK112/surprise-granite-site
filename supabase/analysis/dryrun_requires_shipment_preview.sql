-- DRY RUN — read-only preview of the requires_shipment backfill.
-- Run in Supabase SQL editor. NO WRITES.
--
-- Rules in priority order (first match wins):
--   1. metadata.payment_type explicitly says non-shippable
--   2. metadata.source = 'quick-pay'                 -> non-shippable
--   3. metadata has invoice_ref / invoice_id / lead_id pointing to project work
--   4. orders.kind already = 'project' (from prior migration)
--   5. items[] empty AND no shipping address          -> non-shippable
--   6. any item name matches the project regex
--   7. items only contain "Invoice Payment" / "Customer" / generic labels
--   8. otherwise -> shippable (default true)

-- =====================================================================
-- QUERY 1 — Summary: how many rows flip, grouped by rule
-- =====================================================================
WITH classified AS (
  SELECT
    o.id,
    o.order_number,
    o.customer_name,
    o.customer_email,
    o.total,
    o.status,
    o.kind,
    o.created_at,
    o.shipping_address_line1,
    o.metadata,
    o.items,
    CASE
      WHEN o.metadata->>'payment_type' IN ('invoice','deposit','balance','final','quick-pay','custom')
        THEN 'rule1_metadata_payment_type'
      WHEN o.metadata->>'source' = 'quick-pay'
        THEN 'rule2_metadata_source_quickpay'
      WHEN o.metadata ? 'invoice_ref' OR o.metadata ? 'invoice_id' OR o.metadata->>'lead_id' IS NOT NULL
        THEN 'rule3_metadata_project_ref'
      WHEN o.kind = 'project'
        THEN 'rule4_kind_project'
      WHEN jsonb_array_length(COALESCE(o.items, '[]'::jsonb)) = 0 AND o.shipping_address_line1 IS NULL
        THEN 'rule5_no_items_no_address'
      WHEN EXISTS (
        SELECT 1 FROM jsonb_array_elements(COALESCE(o.items, '[]'::jsonb)) AS item
        WHERE item->>'name' ~* '(deposit|final\s*payment|balance|EST-?\d|INV-?\d|countertop|backsplash|remodel|installation|f&i\s|change\s*order|materials\s*for|invoice\s*payment)'
      )
        THEN 'rule6_item_matches_project_regex'
      WHEN EXISTS (
        SELECT 1 FROM jsonb_array_elements(COALESCE(o.items, '[]'::jsonb)) AS item
        WHERE item->>'name' ~* '^(customer|payment|order|charge)\s*$'
      )
        THEN 'rule7_generic_item_label'
      ELSE 'default_shippable'
    END AS reason
  FROM public.orders o
)
SELECT
  CASE WHEN reason = 'default_shippable' THEN 'SHIPPABLE' ELSE 'NON-SHIPPABLE' END AS classification,
  reason,
  COUNT(*) AS rows,
  ROUND(SUM(total)::numeric, 2) AS total_volume
FROM classified
GROUP BY classification, reason
ORDER BY classification DESC, rows DESC;


-- =====================================================================
-- QUERY 2 — Detail: every row that would flip to NON-SHIPPABLE
-- Sanity-check this list. If any row should still ship, flag it.
-- =====================================================================
WITH classified AS (
  SELECT
    o.*,
    CASE
      WHEN o.metadata->>'payment_type' IN ('invoice','deposit','balance','final','quick-pay','custom')
        THEN 'rule1_metadata_payment_type'
      WHEN o.metadata->>'source' = 'quick-pay'
        THEN 'rule2_metadata_source_quickpay'
      WHEN o.metadata ? 'invoice_ref' OR o.metadata ? 'invoice_id' OR o.metadata->>'lead_id' IS NOT NULL
        THEN 'rule3_metadata_project_ref'
      WHEN o.kind = 'project'
        THEN 'rule4_kind_project'
      WHEN jsonb_array_length(COALESCE(o.items, '[]'::jsonb)) = 0 AND o.shipping_address_line1 IS NULL
        THEN 'rule5_no_items_no_address'
      WHEN EXISTS (
        SELECT 1 FROM jsonb_array_elements(COALESCE(o.items, '[]'::jsonb)) AS item
        WHERE item->>'name' ~* '(deposit|final\s*payment|balance|EST-?\d|INV-?\d|countertop|backsplash|remodel|installation|f&i\s|change\s*order|materials\s*for|invoice\s*payment)'
      )
        THEN 'rule6_item_matches_project_regex'
      WHEN EXISTS (
        SELECT 1 FROM jsonb_array_elements(COALESCE(o.items, '[]'::jsonb)) AS item
        WHERE item->>'name' ~* '^(customer|payment|order|charge)\s*$'
      )
        THEN 'rule7_generic_item_label'
      ELSE NULL
    END AS reason
  FROM public.orders o
)
SELECT
  order_number,
  customer_name,
  customer_email,
  ROUND(total::numeric, 2) AS total,
  status,
  kind,
  reason,
  COALESCE(
    (SELECT string_agg(item->>'name', ' | ')
     FROM jsonb_array_elements(COALESCE(items, '[]'::jsonb)) AS item),
    '(no items)'
  ) AS items_preview,
  shipping_address_line1,
  created_at::date AS created
FROM classified
WHERE reason IS NOT NULL
ORDER BY created_at DESC;


-- =====================================================================
-- QUERY 3 — Sanity-check the rows STAYING shippable.
-- These will still need tracking. Confirm none of them are deposits/invoices
-- that the rules missed.
-- =====================================================================
WITH classified AS (
  SELECT
    o.*,
    CASE
      WHEN o.metadata->>'payment_type' IN ('invoice','deposit','balance','final','quick-pay','custom') THEN false
      WHEN o.metadata->>'source' = 'quick-pay' THEN false
      WHEN o.metadata ? 'invoice_ref' OR o.metadata ? 'invoice_id' OR o.metadata->>'lead_id' IS NOT NULL THEN false
      WHEN o.kind = 'project' THEN false
      WHEN jsonb_array_length(COALESCE(o.items, '[]'::jsonb)) = 0 AND o.shipping_address_line1 IS NULL THEN false
      WHEN EXISTS (
        SELECT 1 FROM jsonb_array_elements(COALESCE(o.items, '[]'::jsonb)) AS item
        WHERE item->>'name' ~* '(deposit|final\s*payment|balance|EST-?\d|INV-?\d|countertop|backsplash|remodel|installation|f&i\s|change\s*order|materials\s*for|invoice\s*payment)'
      ) THEN false
      WHEN EXISTS (
        SELECT 1 FROM jsonb_array_elements(COALESCE(o.items, '[]'::jsonb)) AS item
        WHERE item->>'name' ~* '^(customer|payment|order|charge)\s*$'
      ) THEN false
      ELSE true
    END AS proposed_requires_shipment
  FROM public.orders o
)
SELECT
  order_number,
  customer_name,
  ROUND(total::numeric, 2) AS total,
  status,
  COALESCE(
    (SELECT string_agg(item->>'name', ' | ')
     FROM jsonb_array_elements(COALESCE(items, '[]'::jsonb)) AS item),
    '(no items)'
  ) AS items_preview,
  shipping_address_line1,
  created_at::date AS created
FROM classified
WHERE proposed_requires_shipment = true
  AND (status IS NULL OR status NOT IN ('shipped','delivered','fulfilled','cancelled','refunded'))
ORDER BY created_at DESC;
