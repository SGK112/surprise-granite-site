-- Orders: enforce one order per Stripe Checkout session (idempotent webhooks).
--
-- WHY: the stripe-webhook handler did check-then-insert on stripe_session_id
-- (server.js ~2413). Stripe delivers events at-least-once and can fan out
-- concurrent retries, so two deliveries could both pass the "does it exist?"
-- check and both insert — producing duplicate orders, double inventory
-- deduction, and double promo redemption. A DB-level unique constraint is the
-- only race-proof guard; the handler now also treats a 23505 unique_violation
-- as a successful duplicate (server.js — orderErr.code === '23505').
--
-- ⚠️ NOT auto-applied. Migrations in this repo are run manually against prod
--    (see the header of 20260526000001_orders_requires_shipment.sql). Review
--    the duplicate report below, then run this with the service role.
--
-- The unique index is PARTIAL (WHERE stripe_session_id IS NOT NULL) so that
-- payment-only / manually-created orders without a session id are unaffected.

BEGIN;

-- 1. Report how many duplicate sessions exist before we touch anything. If this
--    raises a NOTICE with a non-zero count, inspect those rows before the dedup
--    step — they represent the SAME payment recorded more than once.
DO $$
DECLARE
  dup_sessions integer;
  dup_rows integer;
BEGIN
  SELECT count(*), COALESCE(sum(c) - count(*), 0)
    INTO dup_sessions, dup_rows
  FROM (
    SELECT stripe_session_id, count(*) AS c
    FROM public.orders
    WHERE stripe_session_id IS NOT NULL
    GROUP BY stripe_session_id
    HAVING count(*) > 1
  ) d;
  RAISE NOTICE 'orders dedup: % session(s) with duplicates, % redundant row(s) to remove', dup_sessions, dup_rows;
END $$;

-- 2. Remove redundant duplicate orders, keeping the EARLIEST row per session
--    (lowest created_at, then id as a tiebreak). Duplicates of the same
--    stripe_session_id are erroneous re-records of one payment, so the extra
--    rows are safe to delete. Dependent order_items go first to satisfy the FK
--    (the FK may or may not cascade — delete explicitly to be safe).
WITH ranked AS (
  SELECT id,
         row_number() OVER (
           PARTITION BY stripe_session_id
           ORDER BY created_at ASC, id ASC
         ) AS rn
  FROM public.orders
  WHERE stripe_session_id IS NOT NULL
),
doomed AS (
  SELECT id FROM ranked WHERE rn > 1
)
DELETE FROM public.order_items WHERE order_id IN (SELECT id FROM doomed);

WITH ranked AS (
  SELECT id,
         row_number() OVER (
           PARTITION BY stripe_session_id
           ORDER BY created_at ASC, id ASC
         ) AS rn
  FROM public.orders
  WHERE stripe_session_id IS NOT NULL
)
DELETE FROM public.orders
WHERE id IN (SELECT id FROM ranked WHERE rn > 1);

-- 3. Enforce uniqueness going forward.
CREATE UNIQUE INDEX IF NOT EXISTS orders_stripe_session_id_unique
  ON public.orders (stripe_session_id)
  WHERE stripe_session_id IS NOT NULL;

COMMIT;
