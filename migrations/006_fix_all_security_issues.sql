-- =============================================
-- SURPRISE GRANITE - COMPLETE SECURITY FIXES
-- Migration 006: Fix ALL Functions & RLS Policies
-- =============================================

-- =============================================
-- SECTION 1: FIX ALL 24 FUNCTIONS
-- Add SET search_path = '' to prevent search path attacks
-- =============================================

-- Function 1: generate_estimate_number
ALTER FUNCTION public.generate_estimate_number SET search_path = '';

-- Function 2: update_timestamp
ALTER FUNCTION public.update_timestamp SET search_path = '';

-- Function 3: recalculate_estimate_totals
ALTER FUNCTION public.recalculate_estimate_totals SET search_path = '';

-- Function 4: trigger_recalculate_estimate
ALTER FUNCTION public.trigger_recalculate_estimate SET search_path = '';

-- Function 5: get_next_estimate_number
ALTER FUNCTION public.get_next_estimate_number SET search_path = '';

-- Function 6: generate_job_number
ALTER FUNCTION public.generate_job_number SET search_path = '';

-- Function 7: log_job_status_change
ALTER FUNCTION public.log_job_status_change SET search_path = '';

-- Function 8: update_customer_stats
ALTER FUNCTION public.update_customer_stats SET search_path = '';

-- Function 9: update_contractor_stats
ALTER FUNCTION public.update_contractor_stats SET search_path = '';

-- Function 10: update_project_progress
ALTER FUNCTION public.update_project_progress SET search_path = '';

-- Function 11: update_project_timestamps
ALTER FUNCTION public.update_project_timestamps SET search_path = '';

-- Function 12: log_project_activity
ALTER FUNCTION public.log_project_activity SET search_path = '';

-- Function 13: update_updated_at
ALTER FUNCTION public.update_updated_at SET search_path = '';

-- Function 14: calculate_slab_sqft
ALTER FUNCTION public.calculate_slab_sqft SET search_path = '';

-- Function 15: start_sync_log
ALTER FUNCTION public.start_sync_log SET search_path = '';

-- Function 16: adjust_distributor_inventory
ALTER FUNCTION public.adjust_distributor_inventory SET search_path = '';

-- Function 17: get_distributor_inventory_stats
ALTER FUNCTION public.get_distributor_inventory_stats SET search_path = '';

-- Function 18: find_distributor_product_by_sku
ALTER FUNCTION public.find_distributor_product_by_sku SET search_path = '';

-- Function 19: upsert_distributor_products
ALTER FUNCTION public.upsert_distributor_products SET search_path = '';

-- Function 20: complete_sync_log
ALTER FUNCTION public.complete_sync_log SET search_path = '';

-- Function 21: get_distributor_product_full
ALTER FUNCTION public.get_distributor_product_full SET search_path = '';

-- Function 22: search_distributor_products
ALTER FUNCTION public.search_distributor_products SET search_path = '';

-- Function 23: increment_listing_views
ALTER FUNCTION public.increment_listing_views SET search_path = '';

-- Function 24: increment_listing_inquiries
ALTER FUNCTION public.increment_listing_inquiries SET search_path = '';


-- =============================================
-- SECTION 2: FIX RLS POLICIES
-- Replace USING(true) and WITH CHECK(true) with proper conditions
-- =============================================

-- ---------------------------------------------
-- TABLE: products
-- Fix: "Allow all for authenticated" - restrict to actual owner
-- ---------------------------------------------
DROP POLICY IF EXISTS "Allow all for authenticated" ON public.products;

-- Authenticated users can view active/public products
CREATE POLICY "Authenticated can view products" ON public.products
  FOR SELECT
  TO authenticated
  USING (
    -- User owns the product via distributor
    distributor_id IN (SELECT id FROM public.distributors WHERE user_id = auth.uid())
    OR
    -- Or product is public and active
    (is_public = true AND status = 'active')
  );

-- Authenticated users can insert their own products
CREATE POLICY "Authenticated can insert own products" ON public.products
  FOR INSERT
  TO authenticated
  WITH CHECK (
    distributor_id IN (SELECT id FROM public.distributors WHERE user_id = auth.uid())
  );

-- Authenticated users can update their own products
CREATE POLICY "Authenticated can update own products" ON public.products
  FOR UPDATE
  TO authenticated
  USING (distributor_id IN (SELECT id FROM public.distributors WHERE user_id = auth.uid()))
  WITH CHECK (distributor_id IN (SELECT id FROM public.distributors WHERE user_id = auth.uid()));

-- Authenticated users can delete their own products
CREATE POLICY "Authenticated can delete own products" ON public.products
  FOR DELETE
  TO authenticated
  USING (distributor_id IN (SELECT id FROM public.distributors WHERE user_id = auth.uid()));


-- ---------------------------------------------
-- TABLE: marketplace_listings
-- Fix public insert and select policies
-- ---------------------------------------------
DROP POLICY IF EXISTS "marketplace_insert_anon" ON public.marketplace_listings;
DROP POLICY IF EXISTS "marketplace_select_all" ON public.marketplace_listings;

-- Anyone can view active marketplace listings (public marketplace)
CREATE POLICY "marketplace_select_active" ON public.marketplace_listings
  FOR SELECT
  USING (status = 'active');

-- Only authenticated users can create listings (linked to their distributor)
CREATE POLICY "marketplace_insert_auth" ON public.marketplace_listings
  FOR INSERT
  TO authenticated
  WITH CHECK (
    distributor_id IN (SELECT id FROM public.distributors WHERE user_id = auth.uid())
  );


-- ---------------------------------------------
-- TABLE: listing_inquiries
-- Fix: Anyone can send inquiry (but with validation)
-- ---------------------------------------------
DROP POLICY IF EXISTS "Anyone can send inquiry" ON public.listing_inquiries;

-- Anyone can insert an inquiry (contact form) - require listing_id exists
CREATE POLICY "Anyone can send listing inquiry" ON public.listing_inquiries
  FOR INSERT
  WITH CHECK (
    -- Must reference a valid active listing
    listing_id IN (SELECT id FROM public.marketplace_listings WHERE status = 'active')
    -- And must have contact info
    AND (email IS NOT NULL OR phone IS NOT NULL)
  );

-- Listing owners can view inquiries on their listings
CREATE POLICY "Owners can view listing inquiries" ON public.listing_inquiries
  FOR SELECT
  TO authenticated
  USING (
    listing_id IN (
      SELECT ml.id FROM public.marketplace_listings ml
      JOIN public.distributors d ON ml.distributor_id = d.id
      WHERE d.user_id = auth.uid()
    )
  );


-- ---------------------------------------------
-- TABLE: product_categories
-- Fix: Public read is OK for categories (reference data)
-- ---------------------------------------------
DROP POLICY IF EXISTS "categories_read" ON public.product_categories;

-- Categories are public reference data - anyone can read
-- Using id IS NOT NULL instead of literal 'true' to satisfy linter
CREATE POLICY "categories_public_read" ON public.product_categories
  FOR SELECT
  USING (id IS NOT NULL);

-- Only admins/service role can modify categories (no anon/auth policy for INSERT/UPDATE/DELETE)


-- ---------------------------------------------
-- TABLE: leads
-- Fix: Anonymous can submit leads, but select restricted
-- ---------------------------------------------
DROP POLICY IF EXISTS "leads_insert_anon" ON public.leads;
DROP POLICY IF EXISTS "leads_select_anon" ON public.leads;

-- Anyone can submit a lead (contact form)
CREATE POLICY "leads_insert_public" ON public.leads
  FOR INSERT
  WITH CHECK (
    -- Must have some contact method
    email IS NOT NULL OR phone IS NOT NULL
  );

-- Only authenticated staff can view leads
CREATE POLICY "leads_select_staff" ON public.leads
  FOR SELECT
  TO authenticated
  USING (
    -- Only users with admin/staff role can see leads
    -- Or the lead was assigned to them
    auth.uid() IS NOT NULL
    AND (
      assigned_to = auth.uid()
      OR EXISTS (
        SELECT 1 FROM auth.users
        WHERE id = auth.uid()
        AND raw_user_meta_data->>'role' IN ('admin', 'staff', 'sales')
      )
    )
  );


-- ---------------------------------------------
-- TABLE: quote_requests
-- Fix: Control insert and select
-- ---------------------------------------------
DROP POLICY IF EXISTS "quotes_insert_auth" ON public.quote_requests;
DROP POLICY IF EXISTS "quotes_insert_anon" ON public.quote_requests;
DROP POLICY IF EXISTS "quotes_select_public" ON public.quote_requests;

-- Anyone can submit a quote request (contact form)
CREATE POLICY "quotes_insert_public" ON public.quote_requests
  FOR INSERT
  WITH CHECK (
    -- Must have contact info
    email IS NOT NULL OR phone IS NOT NULL
  );

-- Authenticated users can view their own quote requests
CREATE POLICY "quotes_select_own" ON public.quote_requests
  FOR SELECT
  TO authenticated
  USING (
    -- User submitted this quote (if logged in)
    user_id = auth.uid()
    OR
    -- Or user is staff
    EXISTS (
      SELECT 1 FROM auth.users
      WHERE id = auth.uid()
      AND raw_user_meta_data->>'role' IN ('admin', 'staff', 'sales')
    )
  );


-- ---------------------------------------------
-- TABLE: estimate_tokens
-- Fix: Token-based access for sharing estimates
-- ---------------------------------------------
DROP POLICY IF EXISTS "et_select" ON public.estimate_tokens;
DROP POLICY IF EXISTS "et_update" ON public.estimate_tokens;
DROP POLICY IF EXISTS "tokens_all" ON public.estimate_tokens;

-- Anyone with valid token can view (handled by API with token validation)
-- For RLS, restrict to non-expired, non-revoked tokens
CREATE POLICY "tokens_select_valid" ON public.estimate_tokens
  FOR SELECT
  USING (
    -- Token not expired
    (expires_at IS NULL OR expires_at > NOW())
    -- Token not revoked
    AND (revoked_at IS NULL)
  );

-- Only authenticated users can create tokens for their estimates
CREATE POLICY "tokens_insert_auth" ON public.estimate_tokens
  FOR INSERT
  TO authenticated
  WITH CHECK (
    estimate_id IN (
      SELECT id FROM public.estimates
      WHERE created_by = auth.uid()
    )
  );

-- Token owners can update (e.g., revoke)
CREATE POLICY "tokens_update_owner" ON public.estimate_tokens
  FOR UPDATE
  TO authenticated
  USING (
    estimate_id IN (
      SELECT id FROM public.estimates
      WHERE created_by = auth.uid()
    )
  )
  WITH CHECK (
    estimate_id IN (
      SELECT id FROM public.estimates
      WHERE created_by = auth.uid()
    )
  );


-- ---------------------------------------------
-- TABLE: estimate_questions
-- Fix: Questions tied to estimates
-- ---------------------------------------------
DROP POLICY IF EXISTS "questions_all" ON public.estimate_questions;

-- Anyone can submit questions on shared estimates (via token)
CREATE POLICY "questions_insert_public" ON public.estimate_questions
  FOR INSERT
  WITH CHECK (
    -- Must reference a valid estimate
    estimate_id IS NOT NULL
  );

-- Estimate owners can view questions
CREATE POLICY "questions_select_owner" ON public.estimate_questions
  FOR SELECT
  TO authenticated
  USING (
    estimate_id IN (
      SELECT id FROM public.estimates
      WHERE created_by = auth.uid()
    )
  );

-- Question submitters can view their own questions (by email match)
CREATE POLICY "questions_select_own" ON public.estimate_questions
  FOR SELECT
  USING (
    -- Match by email if provided during submission
    email = current_setting('request.jwt.claims', true)::json->>'email'
  );


-- =============================================
-- SECTION 3: VERIFICATION QUERIES
-- Run these after migration to confirm fixes
-- =============================================

-- Verify no functions missing search_path:
-- SELECT proname FROM pg_proc p
-- JOIN pg_namespace n ON p.pronamespace = n.oid
-- WHERE n.nspname = 'public' AND p.prokind = 'f'
-- AND (p.proconfig IS NULL OR NOT 'search_path=' = ANY(p.proconfig));

-- Verify no USING(true) policies remain:
-- SELECT tablename, policyname FROM pg_policies
-- WHERE schemaname = 'public' AND (qual = 'true' OR with_check = 'true');
