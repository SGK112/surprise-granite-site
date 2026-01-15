-- =============================================
-- SURPRISE GRANITE - SECURITY DIAGNOSTIC QUERIES
-- Run these in Supabase SQL Editor to identify issues
-- =============================================

-- =============================================
-- 1. FIND ALL FUNCTIONS WITHOUT search_path SET
-- =============================================

SELECT
  n.nspname as schema,
  p.proname as function_name,
  CASE
    WHEN p.prosecdef THEN 'SECURITY DEFINER'
    ELSE 'SECURITY INVOKER'
  END as security_type,
  array_to_string(p.proconfig, ', ') as config_options
FROM pg_proc p
JOIN pg_namespace n ON p.pronamespace = n.oid
WHERE n.nspname = 'public'
  AND p.prokind = 'f'  -- only functions, not procedures
  AND (p.proconfig IS NULL OR NOT 'search_path=' = ANY(p.proconfig))
ORDER BY p.proname;

-- =============================================
-- 2. FIND ALL RLS POLICIES WITH USING(true) OR WITH CHECK(true)
-- =============================================

SELECT
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  CASE WHEN qual = 'true' THEN 'USING(true) - NEEDS FIX' ELSE qual END as using_clause,
  CASE WHEN with_check = 'true' THEN 'WITH CHECK(true) - NEEDS FIX' ELSE with_check END as with_check_clause
FROM pg_policies
WHERE schemaname = 'public'
  AND (qual = 'true' OR with_check = 'true')
ORDER BY tablename, policyname;

-- =============================================
-- 3. FIND ALL SECURITY DEFINER VIEWS
-- =============================================

SELECT
  schemaname,
  viewname,
  viewowner,
  'SECURITY DEFINER - Consider removing' as warning
FROM pg_views
WHERE schemaname = 'public'
  AND viewname IN (
    SELECT c.relname
    FROM pg_class c
    JOIN pg_reloptions_all r ON r.oid = c.oid
    WHERE r.option_name = 'security_invoker'
      AND r.option_value = 'false'
  );

-- Alternative check for security definer views:
SELECT
  n.nspname as schema,
  c.relname as view_name,
  pg_get_viewdef(c.oid, true) as definition
FROM pg_class c
JOIN pg_namespace n ON c.relnamespace = n.oid
WHERE c.relkind = 'v'
  AND n.nspname = 'public'
  AND EXISTS (
    SELECT 1 FROM pg_depend d
    JOIN pg_rewrite r ON d.objid = r.oid
    WHERE r.ev_class = c.oid
  );

-- =============================================
-- 4. LIST ALL TABLES WITH RLS ENABLED
-- =============================================

SELECT
  schemaname,
  tablename,
  rowsecurity as rls_enabled
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY tablename;

-- =============================================
-- 5. COMPREHENSIVE POLICY AUDIT
-- =============================================

SELECT
  tablename,
  COUNT(*) as total_policies,
  COUNT(*) FILTER (WHERE qual = 'true') as using_true_count,
  COUNT(*) FILTER (WHERE with_check = 'true') as with_check_true_count
FROM pg_policies
WHERE schemaname = 'public'
GROUP BY tablename
HAVING COUNT(*) FILTER (WHERE qual = 'true' OR with_check = 'true') > 0
ORDER BY tablename;
