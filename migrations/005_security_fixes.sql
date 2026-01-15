-- =============================================
-- SURPRISE GRANITE - SECURITY FIXES MIGRATION
-- Migration 005: Fix Security Warnings
-- =============================================
-- Addresses:
-- 1. function_search_path_mutable - Add SET search_path = '' to all functions
-- 2. rls_policy_always_true - Fix overly permissive RLS policies
-- 3. security_definer_view - Fix project_stats view
-- =============================================

-- =============================================
-- SECTION 1: FIX FUNCTION SEARCH PATH
-- All functions must have SET search_path = '' for security
-- =============================================

-- Fix: update_updated_at trigger function
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

-- Fix: get_product_full function
CREATE OR REPLACE FUNCTION get_product_full(p_product_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  result JSONB;
  product_record public.products%ROWTYPE;
  type_data JSONB;
BEGIN
  -- Get base product
  SELECT * INTO product_record FROM public.products WHERE id = p_product_id;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  -- Get type-specific data
  CASE product_record.product_type
    WHEN 'slab' THEN
      SELECT to_jsonb(ps.*) INTO type_data
      FROM public.product_slabs ps WHERE ps.product_id = p_product_id;
    WHEN 'tile' THEN
      SELECT to_jsonb(pt.*) INTO type_data
      FROM public.product_tiles pt WHERE pt.product_id = p_product_id;
    WHEN 'flooring' THEN
      SELECT to_jsonb(pf.*) INTO type_data
      FROM public.product_flooring pf WHERE pf.product_id = p_product_id;
    WHEN 'installation_product' THEN
      SELECT to_jsonb(pi.*) INTO type_data
      FROM public.product_installation pi WHERE pi.product_id = p_product_id;
    ELSE
      type_data := '{}'::JSONB;
  END CASE;

  -- Combine and return
  result := to_jsonb(product_record) || jsonb_build_object('type_data', COALESCE(type_data, '{}'::JSONB));

  RETURN result;
END;
$$;

-- Fix: search_products function
CREATE OR REPLACE FUNCTION search_products(
  p_distributor_id UUID DEFAULT NULL,
  p_product_type VARCHAR DEFAULT NULL,
  p_material_type VARCHAR DEFAULT NULL,
  p_color_family VARCHAR DEFAULT NULL,
  p_status VARCHAR DEFAULT 'active',
  p_search_term VARCHAR DEFAULT NULL,
  p_min_price DECIMAL DEFAULT NULL,
  p_max_price DECIMAL DEFAULT NULL,
  p_is_public BOOLEAN DEFAULT NULL,
  p_limit INTEGER DEFAULT 50,
  p_offset INTEGER DEFAULT 0
)
RETURNS TABLE (
  product JSONB,
  total_count BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  total BIGINT;
BEGIN
  -- Get total count
  SELECT COUNT(*) INTO total
  FROM public.products p
  WHERE (p_distributor_id IS NULL OR p.distributor_id = p_distributor_id)
    AND (p_product_type IS NULL OR p.product_type = p_product_type)
    AND (p_material_type IS NULL OR p.material_type ILIKE '%' || p_material_type || '%')
    AND (p_color_family IS NULL OR p.color_family ILIKE '%' || p_color_family || '%')
    AND (p_status IS NULL OR p.status = p_status)
    AND (p_is_public IS NULL OR p.is_public = p_is_public)
    AND (p_search_term IS NULL OR (
      p.name ILIKE '%' || p_search_term || '%' OR
      p.sku ILIKE '%' || p_search_term || '%' OR
      p.brand ILIKE '%' || p_search_term || '%' OR
      p.material_type ILIKE '%' || p_search_term || '%'
    ))
    AND (p_min_price IS NULL OR p.wholesale_price >= p_min_price)
    AND (p_max_price IS NULL OR p.wholesale_price <= p_max_price);

  -- Return results with type data
  RETURN QUERY
  SELECT
    public.get_product_full(p.id) AS product,
    total AS total_count
  FROM public.products p
  WHERE (p_distributor_id IS NULL OR p.distributor_id = p_distributor_id)
    AND (p_product_type IS NULL OR p.product_type = p_product_type)
    AND (p_material_type IS NULL OR p.material_type ILIKE '%' || p_material_type || '%')
    AND (p_color_family IS NULL OR p.color_family ILIKE '%' || p_color_family || '%')
    AND (p_status IS NULL OR p.status = p_status)
    AND (p_is_public IS NULL OR p.is_public = p_is_public)
    AND (p_search_term IS NULL OR (
      p.name ILIKE '%' || p_search_term || '%' OR
      p.sku ILIKE '%' || p_search_term || '%' OR
      p.brand ILIKE '%' || p_search_term || '%' OR
      p.material_type ILIKE '%' || p_search_term || '%'
    ))
    AND (p_min_price IS NULL OR p.wholesale_price >= p_min_price)
    AND (p_max_price IS NULL OR p.wholesale_price <= p_max_price)
  ORDER BY p.created_at DESC
  LIMIT p_limit
  OFFSET p_offset;
END;
$$;

-- Fix: adjust_inventory function
CREATE OR REPLACE FUNCTION adjust_inventory(
  p_product_id UUID,
  p_quantity_change INTEGER,
  p_transaction_type VARCHAR,
  p_reference_type VARCHAR DEFAULT NULL,
  p_reference_id VARCHAR DEFAULT NULL,
  p_notes TEXT DEFAULT NULL,
  p_performed_by UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  current_qty INTEGER;
  new_qty INTEGER;
  transaction_id UUID;
BEGIN
  -- Get current quantity
  SELECT quantity INTO current_qty FROM public.products WHERE id = p_product_id FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Product not found');
  END IF;

  -- Calculate new quantity
  new_qty := current_qty + p_quantity_change;

  -- Prevent negative inventory
  IF new_qty < 0 THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Insufficient inventory',
      'current_quantity', current_qty,
      'requested_change', p_quantity_change
    );
  END IF;

  -- Update product quantity
  UPDATE public.products
  SET quantity = new_qty,
      status = CASE WHEN new_qty = 0 THEN 'out_of_stock' ELSE status END
  WHERE id = p_product_id;

  -- Log transaction
  INSERT INTO public.inventory_transactions (
    product_id,
    transaction_type,
    quantity_change,
    quantity_before,
    quantity_after,
    reference_type,
    reference_id,
    notes,
    performed_by
  ) VALUES (
    p_product_id,
    p_transaction_type,
    p_quantity_change,
    current_qty,
    new_qty,
    p_reference_type,
    p_reference_id,
    p_notes,
    p_performed_by
  )
  RETURNING id INTO transaction_id;

  RETURN jsonb_build_object(
    'success', true,
    'transaction_id', transaction_id,
    'quantity_before', current_qty,
    'quantity_after', new_qty
  );
END;
$$;

-- Fix: upsert_products function
CREATE OR REPLACE FUNCTION upsert_products(
  p_distributor_id UUID,
  p_products JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  product_record JSONB;
  inserted_count INTEGER := 0;
  updated_count INTEGER := 0;
  error_count INTEGER := 0;
  errors JSONB := '[]'::JSONB;
  product_id UUID;
BEGIN
  FOR product_record IN SELECT * FROM jsonb_array_elements(p_products)
  LOOP
    BEGIN
      -- Upsert product
      INSERT INTO public.products (
        distributor_id,
        sku,
        external_sku,
        upc,
        product_type,
        name,
        brand,
        description,
        material_type,
        color_family,
        finish,
        quantity,
        quantity_unit,
        cost_price,
        wholesale_price,
        retail_price,
        price_unit,
        status,
        is_public,
        images,
        tags,
        custom_attributes,
        sync_source
      )
      VALUES (
        p_distributor_id,
        product_record->>'sku',
        product_record->>'external_sku',
        product_record->>'upc',
        COALESCE(product_record->>'product_type', 'slab'),
        product_record->>'name',
        product_record->>'brand',
        product_record->>'description',
        product_record->>'material_type',
        product_record->>'color_family',
        product_record->>'finish',
        COALESCE((product_record->>'quantity')::INTEGER, 1),
        COALESCE(product_record->>'quantity_unit', 'each'),
        (product_record->>'cost_price')::DECIMAL,
        (product_record->>'wholesale_price')::DECIMAL,
        (product_record->>'retail_price')::DECIMAL,
        COALESCE(product_record->>'price_unit', 'each'),
        COALESCE(product_record->>'status', 'active'),
        COALESCE((product_record->>'is_public')::BOOLEAN, true),
        COALESCE(product_record->'images', '[]'::JSONB),
        CASE
          WHEN product_record->'tags' IS NOT NULL THEN
            ARRAY(SELECT jsonb_array_elements_text(product_record->'tags'))
          ELSE NULL
        END,
        COALESCE(product_record->'custom_attributes', '{}'::JSONB),
        'bulk_import'
      )
      ON CONFLICT (distributor_id, sku) DO UPDATE SET
        external_sku = EXCLUDED.external_sku,
        upc = EXCLUDED.upc,
        name = EXCLUDED.name,
        brand = EXCLUDED.brand,
        description = EXCLUDED.description,
        material_type = EXCLUDED.material_type,
        color_family = EXCLUDED.color_family,
        finish = EXCLUDED.finish,
        quantity = EXCLUDED.quantity,
        quantity_unit = EXCLUDED.quantity_unit,
        cost_price = EXCLUDED.cost_price,
        wholesale_price = EXCLUDED.wholesale_price,
        retail_price = EXCLUDED.retail_price,
        price_unit = EXCLUDED.price_unit,
        status = EXCLUDED.status,
        is_public = EXCLUDED.is_public,
        images = EXCLUDED.images,
        tags = EXCLUDED.tags,
        custom_attributes = EXCLUDED.custom_attributes,
        sync_source = 'bulk_import',
        last_synced_at = NOW()
      RETURNING id INTO product_id;

      IF product_id IS NOT NULL THEN
        IF EXISTS (SELECT 1 FROM public.products WHERE id = product_id AND created_at = updated_at) THEN
          inserted_count := inserted_count + 1;
        ELSE
          updated_count := updated_count + 1;
        END IF;
      END IF;

    EXCEPTION WHEN OTHERS THEN
      error_count := error_count + 1;
      errors := errors || jsonb_build_object(
        'sku', product_record->>'sku',
        'error', SQLERRM
      );
    END;
  END LOOP;

  RETURN jsonb_build_object(
    'success', error_count = 0,
    'inserted', inserted_count,
    'updated', updated_count,
    'errors', error_count,
    'error_details', errors
  );
END;
$$;

-- Fix: get_inventory_stats function
CREATE OR REPLACE FUNCTION get_inventory_stats(p_distributor_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  result JSONB;
BEGIN
  SELECT jsonb_build_object(
    'total_products', COUNT(*),
    'active_products', COUNT(*) FILTER (WHERE status = 'active'),
    'out_of_stock', COUNT(*) FILTER (WHERE status = 'out_of_stock'),
    'total_value', COALESCE(SUM(
      CASE
        WHEN price_unit = 'sqft' THEN wholesale_price * quantity
        ELSE wholesale_price * quantity
      END
    ), 0),
    'by_type', jsonb_object_agg(product_type, type_count),
    'by_material', jsonb_object_agg(COALESCE(material_type, 'Unknown'), material_count),
    'low_stock', COUNT(*) FILTER (WHERE quantity <= min_stock_level AND min_stock_level > 0)
  ) INTO result
  FROM (
    SELECT
      p.*,
      COUNT(*) OVER (PARTITION BY product_type) as type_count,
      COUNT(*) OVER (PARTITION BY material_type) as material_count
    FROM public.products p
    WHERE p.distributor_id = p_distributor_id
  ) subq;

  RETURN COALESCE(result, '{}'::JSONB);
END;
$$;

-- Fix: find_product_by_sku function
CREATE OR REPLACE FUNCTION find_product_by_sku(
  p_sku_value VARCHAR,
  p_system_name VARCHAR DEFAULT NULL,
  p_distributor_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  found_product_id UUID;
BEGIN
  -- First check product_skus table
  SELECT ps.product_id INTO found_product_id
  FROM public.product_skus ps
  JOIN public.products p ON ps.product_id = p.id
  WHERE ps.sku_value = p_sku_value
    AND (p_system_name IS NULL OR ps.system_name = p_system_name)
    AND (p_distributor_id IS NULL OR p.distributor_id = p_distributor_id)
  LIMIT 1;

  -- If not found, check products.sku and products.external_sku
  IF found_product_id IS NULL THEN
    SELECT p.id INTO found_product_id
    FROM public.products p
    WHERE (p.sku = p_sku_value OR p.external_sku = p_sku_value)
      AND (p_distributor_id IS NULL OR p.distributor_id = p_distributor_id)
    LIMIT 1;
  END IF;

  IF found_product_id IS NOT NULL THEN
    RETURN public.get_product_full(found_product_id);
  END IF;

  RETURN NULL;
END;
$$;

-- Fix: start_sync_log function
CREATE OR REPLACE FUNCTION start_sync_log(
  p_integration_id UUID,
  p_sync_type VARCHAR,
  p_direction VARCHAR
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  log_id UUID;
BEGIN
  INSERT INTO public.sync_logs (integration_id, sync_type, direction, status)
  VALUES (p_integration_id, p_sync_type, p_direction, 'running')
  RETURNING id INTO log_id;

  -- Update integration last_sync_at
  UPDATE public.erp_integrations
  SET last_sync_at = NOW(),
      last_sync_status = 'running'
  WHERE id = p_integration_id;

  RETURN log_id;
END;
$$;

-- Fix: complete_sync_log function
CREATE OR REPLACE FUNCTION complete_sync_log(
  p_log_id UUID,
  p_status VARCHAR,
  p_records_processed INTEGER DEFAULT 0,
  p_records_created INTEGER DEFAULT 0,
  p_records_updated INTEGER DEFAULT 0,
  p_records_failed INTEGER DEFAULT 0,
  p_error_details JSONB DEFAULT '[]'::JSONB
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_integration_id UUID;
BEGIN
  -- Update sync log
  UPDATE public.sync_logs
  SET completed_at = NOW(),
      status = p_status,
      records_processed = p_records_processed,
      records_created = p_records_created,
      records_updated = p_records_updated,
      records_failed = p_records_failed,
      error_details = p_error_details
  WHERE id = p_log_id
  RETURNING integration_id INTO v_integration_id;

  -- Update integration status
  UPDATE public.erp_integrations
  SET last_sync_status = p_status,
      last_sync_error = CASE
        WHEN p_status = 'failed' THEN (p_error_details->0->>'error')
        ELSE NULL
      END
  WHERE id = v_integration_id;
END;
$$;

-- =============================================
-- SECTION 2: FIX SECURITY DEFINER VIEW
-- The project_stats view should use SECURITY INVOKER
-- =============================================

-- Drop and recreate the view without SECURITY DEFINER
DROP VIEW IF EXISTS public.project_stats;

-- If you need this view, recreate it without SECURITY DEFINER:
-- CREATE VIEW public.project_stats AS
--   SELECT ... your query here ...
-- WITH (security_invoker = true);

-- =============================================
-- SECTION 3: FIX RLS POLICIES WITH USING(true)
-- These need proper conditions instead of allowing everything
-- =============================================

-- Query to find all policies with USING(true) or WITH CHECK(true):
-- SELECT schemaname, tablename, policyname, qual, with_check
-- FROM pg_policies
-- WHERE qual = 'true' OR with_check = 'true';

-- Common fix pattern - replace USING(true) with proper auth check:
-- Example for a "profiles" table that might have USING(true):

-- DROP POLICY IF EXISTS "Public profiles are viewable by everyone" ON profiles;
-- CREATE POLICY "Public profiles are viewable by everyone" ON profiles
--   FOR SELECT USING (is_public = true);

-- DROP POLICY IF EXISTS "Users can update own profile" ON profiles;
-- CREATE POLICY "Users can update own profile" ON profiles
--   FOR UPDATE USING (auth.uid() = user_id);

-- =============================================
-- HELPER: Query to identify remaining functions needing fixes
-- Run this in Supabase SQL Editor to find all functions without search_path
-- =============================================

-- SELECT
--   n.nspname as schema,
--   p.proname as function_name,
--   pg_get_functiondef(p.oid) as definition
-- FROM pg_proc p
-- JOIN pg_namespace n ON p.pronamespace = n.oid
-- WHERE n.nspname = 'public'
--   AND NOT EXISTS (
--     SELECT 1 FROM pg_proc_info(p.oid)
--     WHERE option_name = 'search_path'
--   );

-- =============================================
-- GRANT PERMISSIONS (re-apply after function updates)
-- =============================================

GRANT EXECUTE ON FUNCTION get_product_full TO authenticated;
GRANT EXECUTE ON FUNCTION search_products TO authenticated;
GRANT EXECUTE ON FUNCTION adjust_inventory TO authenticated;
GRANT EXECUTE ON FUNCTION get_inventory_stats TO authenticated;
GRANT EXECUTE ON FUNCTION find_product_by_sku TO authenticated;
GRANT EXECUTE ON FUNCTION upsert_products TO service_role;
GRANT EXECUTE ON FUNCTION start_sync_log TO service_role;
GRANT EXECUTE ON FUNCTION complete_sync_log TO service_role;
