-- =====================================================
-- SECURITY ADVISOR FIXES (2026-05-05)
-- Resolves the 7 errors from Supabase Security Advisor:
--   • 4 SECURITY DEFINER views — switch to SECURITY INVOKER so
--     calling user's RLS applies (no privilege escalation).
--   • 3 RLS-disabled tables in public schema — enable RLS + add
--     read-only-for-authenticated, write-for-service-role policies.
--
-- Apply via Supabase SQL editor → run as one transaction.
-- All operations are idempotent — safe to re-run.
-- =====================================================

BEGIN;

-- =====================================================
-- PART 1 — Convert SECURITY DEFINER views to SECURITY INVOKER
-- =====================================================
-- Postgres 15+ supports security_invoker reloption on views.
-- This makes the view execute with the calling user's privileges
-- and RLS policies, instead of the view owner's. Required when
-- the view exposes RLS-protected data through a public schema.

ALTER VIEW IF EXISTS public.unified_project_stats        SET (security_invoker = true);
ALTER VIEW IF EXISTS public.orders_summary               SET (security_invoker = true);
ALTER VIEW IF EXISTS public.pro_dashboard_customers      SET (security_invoker = true);
ALTER VIEW IF EXISTS public.user_profile_with_shopify    SET (security_invoker = true);


-- =====================================================
-- PART 2 — Enable RLS on three public reference tables
-- =====================================================
-- These tables are reference/config data that:
--   • All authenticated users may READ (so the app can render
--     plan tiers, role labels, permission templates)
--   • Only the service_role (server-side admin code) may WRITE
--
-- Anon (unauthenticated) users get no access. If you want to
-- expose subscription_plans publicly (pricing page), add an
-- additional policy `FOR SELECT TO anon USING (true)`.

-- ── subscription_plans ──────────────────────────────
ALTER TABLE IF EXISTS public.subscription_plans ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "subscription_plans_read_authenticated" ON public.subscription_plans;
CREATE POLICY "subscription_plans_read_authenticated"
  ON public.subscription_plans
  FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "subscription_plans_write_service_role" ON public.subscription_plans;
CREATE POLICY "subscription_plans_write_service_role"
  ON public.subscription_plans
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- ── role_permissions ────────────────────────────────
ALTER TABLE IF EXISTS public.role_permissions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "role_permissions_read_authenticated" ON public.role_permissions;
CREATE POLICY "role_permissions_read_authenticated"
  ON public.role_permissions
  FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "role_permissions_write_service_role" ON public.role_permissions;
CREATE POLICY "role_permissions_write_service_role"
  ON public.role_permissions
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- ── role_permission_templates ───────────────────────
ALTER TABLE IF EXISTS public.role_permission_templates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "role_permission_templates_read_authenticated" ON public.role_permission_templates;
CREATE POLICY "role_permission_templates_read_authenticated"
  ON public.role_permission_templates
  FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "role_permission_templates_write_service_role" ON public.role_permission_templates;
CREATE POLICY "role_permission_templates_write_service_role"
  ON public.role_permission_templates
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);


-- =====================================================
-- VERIFICATION
-- After running, query the advisor again — all 7 errors should clear.
-- Spot-check the views still return rows for an authenticated user:
--
--   SELECT count(*) FROM public.orders_summary;
--   SELECT count(*) FROM public.unified_project_stats;
--   SELECT count(*) FROM public.pro_dashboard_customers;
--   SELECT count(*) FROM public.user_profile_with_shopify;
--
-- And check RLS is on:
--
--   SELECT tablename, rowsecurity FROM pg_tables
--    WHERE schemaname = 'public'
--      AND tablename IN ('subscription_plans','role_permissions','role_permission_templates');
--
-- Expected: rowsecurity = true for all three.
-- =====================================================

COMMIT;
