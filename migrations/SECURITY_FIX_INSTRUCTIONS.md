# Supabase Security Fixes Guide

## Overview of Issues

Your Supabase project has these security warnings:
1. **function_search_path_mutable** (24 functions) - Functions without `SET search_path = ''`
2. **rls_policy_always_true** (10 policies) - RLS policies with `USING(true)` or `WITH CHECK(true)`
3. **security_definer_view** - `project_stats` view with SECURITY DEFINER
4. **auth_leaked_password_protection** - Leaked password protection disabled

---

## Step 1: Run Migration 005_security_fixes.sql

This fixes the functions defined in your codebase. Run this in the Supabase SQL Editor:

1. Go to **Supabase Dashboard** > **SQL Editor**
2. Paste contents of `migrations/005_security_fixes.sql`
3. Click **Run**

---

## Step 2: Enable Leaked Password Protection

This must be done in the Supabase Dashboard (cannot be done via SQL):

1. Go to **Supabase Dashboard**
2. Navigate to **Authentication** > **Settings** (or **Auth** > **Providers**)
3. Find **Leaked Password Protection** or **Password Security**
4. Enable **"Check passwords against known data breaches"**
5. Save changes

This prevents users from using passwords found in data breaches.

---

## Step 3: Identify and Fix Remaining Functions

If there are more functions than the 9 fixed in migration 005, run this diagnostic query:

```sql
SELECT
  n.nspname as schema,
  p.proname as function_name
FROM pg_proc p
JOIN pg_namespace n ON p.pronamespace = n.oid
WHERE n.nspname = 'public'
  AND p.prokind = 'f'
  AND (p.proconfig IS NULL OR NOT 'search_path=' = ANY(p.proconfig))
ORDER BY p.proname;
```

For each function found, recreate it with `SET search_path = ''`:

```sql
CREATE OR REPLACE FUNCTION your_function_name(params...)
RETURNS return_type
LANGUAGE plpgsql
SECURITY DEFINER  -- or INVOKER
SET search_path = ''  -- ADD THIS LINE
AS $$
BEGIN
  -- Use fully qualified table names: public.table_name
  SELECT * FROM public.your_table;
END;
$$;
```

---

## Step 4: Fix RLS Policies with USING(true)

First, identify which policies have this issue:

```sql
SELECT tablename, policyname, cmd, qual, with_check
FROM pg_policies
WHERE schemaname = 'public'
  AND (qual = 'true' OR with_check = 'true');
```

Common patterns for fixing these policies:

### Pattern A: Public read access (SELECT)
**Bad:**
```sql
CREATE POLICY "Allow all reads" ON some_table
  FOR SELECT USING (true);
```

**Good:**
```sql
CREATE POLICY "Allow public reads for active items" ON some_table
  FOR SELECT USING (status = 'active' AND is_public = true);
```

### Pattern B: User owns the record
**Bad:**
```sql
CREATE POLICY "Users can update" ON some_table
  FOR UPDATE WITH CHECK (true);
```

**Good:**
```sql
CREATE POLICY "Users can update own records" ON some_table
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
```

### Pattern C: Service role only (admin functions)
If a policy should only allow service role access:

```sql
CREATE POLICY "Service role only" ON some_table
  FOR ALL USING (
    auth.jwt() ->> 'role' = 'service_role'
  );
```

### Pattern D: Authenticated users
```sql
CREATE POLICY "Authenticated users can read" ON some_table
  FOR SELECT USING (auth.uid() IS NOT NULL);
```

---

## Step 5: Fix Security Definer View

The `project_stats` view should not use SECURITY DEFINER. Either:

### Option A: Drop the view if unused
```sql
DROP VIEW IF EXISTS public.project_stats;
```

### Option B: Recreate without SECURITY DEFINER
```sql
DROP VIEW IF EXISTS public.project_stats;
CREATE VIEW public.project_stats
WITH (security_invoker = true)
AS
  SELECT
    -- your columns here
  FROM your_table;
```

---

## Quick Fix Template for RLS Policies

Run this to fix common patterns. Modify table/column names as needed:

```sql
-- Example: Fix a "profiles" table policy
DROP POLICY IF EXISTS "Allow all access" ON profiles;

CREATE POLICY "Users can view all profiles" ON profiles
  FOR SELECT USING (true);  -- OK for truly public data

CREATE POLICY "Users can update own profile" ON profiles
  FOR UPDATE USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can insert own profile" ON profiles
  FOR INSERT WITH CHECK (auth.uid() = user_id);
```

---

## Verification

After applying fixes, re-run the Supabase Security Advisor to confirm all issues are resolved.

In the Supabase Dashboard:
1. Go to **Database** > **Linter** (or **Security Advisor**)
2. Click **Run Security Checks**
3. Verify all warnings are cleared
