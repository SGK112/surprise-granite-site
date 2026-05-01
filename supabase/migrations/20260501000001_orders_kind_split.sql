-- Orders: separate ecommerce orders (samples, sinks, tile) from project payments
-- (countertop deposits, balance payments, change orders) so each gets its own
-- workflow. Ecommerce orders need fulfillment / shipping / tracking. Project
-- payments need to be linked to estimates/invoices/projects and update the
-- project balance.

-- 1. Add classification + linkage columns
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS kind text DEFAULT 'store',
  ADD COLUMN IF NOT EXISTS project_id uuid,
  ADD COLUMN IF NOT EXISTS invoice_id uuid,
  ADD COLUMN IF NOT EXISTS estimate_id uuid,
  ADD COLUMN IF NOT EXISTS lead_id uuid;

-- 2. Backfill — classify the 564 existing orders by inspecting items + metadata.
--    Heuristic: if any item name mentions deposit / final payment / balance /
--    EST-/INV-/refers to work, OR metadata has invoice_ref/lead_id/source=quick-pay,
--    treat as project. Otherwise store (default).
UPDATE public.orders
SET kind = 'project'
WHERE kind = 'store'
  AND (
    -- item names that signal project work
    EXISTS (
      SELECT 1 FROM jsonb_array_elements(COALESCE(items, '[]'::jsonb)) AS item
      WHERE item->>'name' ~* '(deposit|final\s*payment|balance|EST-?\d|INV-?\d|countertop|backsplash|remodel|installation|f&i\s|change\s*order|materials\s*for)'
    )
    -- or metadata flags it
    OR metadata ? 'invoice_ref'
    OR metadata->>'source' = 'quick-pay'
    OR metadata->>'lead_id' IS NOT NULL
  );

-- 3. Match project orders to leads by customer_email (best-effort link)
UPDATE public.orders o
SET lead_id = l.id
FROM public.leads l
WHERE o.kind = 'project'
  AND o.lead_id IS NULL
  AND lower(o.customer_email) = lower(l.email)
  AND l.email IS NOT NULL;

-- 4. Match project orders to invoices by customer_email + balance proximity
UPDATE public.orders o
SET invoice_id = i.id
FROM public.invoices i
WHERE o.kind = 'project'
  AND o.invoice_id IS NULL
  AND lower(o.customer_email) = lower(i.customer_email)
  AND i.customer_email IS NOT NULL;

-- 5. Indexes for the new admin filters
CREATE INDEX IF NOT EXISTS idx_orders_kind ON public.orders(kind);
CREATE INDEX IF NOT EXISTS idx_orders_kind_status ON public.orders(kind, status);
CREATE INDEX IF NOT EXISTS idx_orders_project_id ON public.orders(project_id) WHERE project_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_orders_invoice_id ON public.orders(invoice_id) WHERE invoice_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_orders_lead_id    ON public.orders(lead_id)    WHERE lead_id    IS NOT NULL;

-- 6. Make kind NOT NULL after backfill (default already 'store' for new rows)
ALTER TABLE public.orders ALTER COLUMN kind SET NOT NULL;

-- 7. Optional CHECK constraint to keep values sane
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'orders_kind_check'
  ) THEN
    ALTER TABLE public.orders ADD CONSTRAINT orders_kind_check
      CHECK (kind IN ('store', 'project', 'subscription', 'donation', 'other'));
  END IF;
END $$;

-- 8. Verification view — quick way to see the split
CREATE OR REPLACE VIEW public.orders_summary AS
SELECT
  kind,
  status,
  COUNT(*) AS count,
  ROUND(SUM(total)::numeric, 2) AS total_volume
FROM public.orders
GROUP BY kind, status
ORDER BY kind, status;
