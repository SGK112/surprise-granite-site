-- Fix: Supabase security advisor "rls_disabled_in_public" (critical, 2026-07-20)
--
-- product_reviews was created ad-hoc (no migration) and shipped without RLS, so
-- anyone holding the public anon key — which is embedded in the site's JS by
-- design — could read, insert, edit and delete every row. The practical risk was
-- review fraud: injecting `status='approved'` 5-star rows straight into the
-- table, which the PDP feeds into Product/aggregateRating JSON-LD. Caught at 0
-- rows, so nothing was tampered with.
--
-- RLS is enabled with NO policies: deny-all for anon and authenticated. Every
-- legitimate read/write goes through api/routes/reviews.js using the
-- service-role key, which bypasses RLS entirely, so the app is unaffected.
ALTER TABLE public.product_reviews ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.product_reviews IS
  'RLS enabled with NO policies = deny-all for anon/authenticated. All access is server-side via api/routes/reviews.js using the service-role key, which bypasses RLS. Do NOT add a public policy: only status=''approved'' rows may ever be exposed, and that filtering is enforced in the API. Adding a client-readable policy would leak pending/rejected reviews.';

-- Same sweep: orders_shipment_summary was the only view in `public` left without
-- security_invoker, so it ran with its owner's rights and bypassed RLS on
-- `orders`. anon could read order counts and revenue totals from it. Aggregate
-- only (no PII), and nothing in the codebase reads it, but it's a real metrics
-- leak. security_invoker makes it respect the caller's RLS like the other views.
ALTER VIEW public.orders_shipment_summary SET (security_invoker = true);
