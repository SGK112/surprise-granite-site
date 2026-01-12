-- ============================================================
-- ESTIMATES & INVOICES SYSTEM
-- Professional estimating, customer approval, and invoicing
-- Run this in Supabase SQL Editor
-- ============================================================

-- ============================================================
-- BUSINESS SETTINGS TABLE - Company branding & defaults
-- ============================================================
CREATE TABLE IF NOT EXISTS public.business_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Company Info
  company_name TEXT,
  company_logo TEXT,
  company_address TEXT,
  company_city TEXT,
  company_state TEXT,
  company_zip TEXT,
  company_phone TEXT,
  company_email TEXT,
  company_website TEXT,
  license_number TEXT,
  tax_id TEXT,

  -- Branding
  brand_color TEXT DEFAULT '#f9cb00',
  accent_color TEXT DEFAULT '#1a1a2e',

  -- Defaults
  default_tax_rate DECIMAL(5,2) DEFAULT 0,
  default_deposit_percent DECIMAL(5,2) DEFAULT 50,
  default_payment_terms TEXT DEFAULT 'Due upon completion',
  default_warranty TEXT DEFAULT '1 year workmanship warranty',

  -- Terms & Conditions
  estimate_terms TEXT,
  invoice_terms TEXT,

  -- Estimate Numbering
  estimate_prefix TEXT DEFAULT 'EST-',
  estimate_next_number INTEGER DEFAULT 1001,
  invoice_prefix TEXT DEFAULT 'INV-',
  invoice_next_number INTEGER DEFAULT 1001,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(user_id)
);

-- Enable RLS
ALTER TABLE public.business_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "business_settings_select_own" ON public.business_settings
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "business_settings_insert_own" ON public.business_settings
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "business_settings_update_own" ON public.business_settings
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "business_settings_service_all" ON public.business_settings
  FOR ALL USING (auth.role() = 'service_role');

GRANT ALL ON public.business_settings TO authenticated;
GRANT ALL ON public.business_settings TO service_role;

-- ============================================================
-- SERVICE CATALOG TABLE - Predefined services/materials
-- ============================================================
CREATE TABLE IF NOT EXISTS public.service_catalog (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Service Details
  name TEXT NOT NULL,
  description TEXT,
  category TEXT DEFAULT 'service' CHECK (category IN ('material', 'service', 'labor', 'other')),
  sku TEXT,

  -- Pricing
  unit_price DECIMAL(10,2) NOT NULL DEFAULT 0,
  unit_type TEXT DEFAULT 'each' CHECK (unit_type IN ('each', 'sqft', 'lnft', 'hour', 'day', 'job')),
  cost DECIMAL(10,2), -- Your cost (for profit tracking)

  -- Catalog Link (for materials from store)
  linked_product_id UUID,
  linked_product_slug TEXT,
  linked_product_image TEXT,

  -- Status
  is_active BOOLEAN DEFAULT true,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.service_catalog ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_catalog_select_own" ON public.service_catalog
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "service_catalog_insert_own" ON public.service_catalog
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "service_catalog_update_own" ON public.service_catalog
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "service_catalog_delete_own" ON public.service_catalog
  FOR DELETE USING (auth.uid() = user_id);

CREATE POLICY "service_catalog_service_all" ON public.service_catalog
  FOR ALL USING (auth.role() = 'service_role');

GRANT ALL ON public.service_catalog TO authenticated;
GRANT ALL ON public.service_catalog TO service_role;

CREATE INDEX IF NOT EXISTS service_catalog_user_idx ON public.service_catalog(user_id);
CREATE INDEX IF NOT EXISTS service_catalog_category_idx ON public.service_catalog(category);

-- ============================================================
-- ESTIMATES TABLE - Main estimate records
-- ============================================================
CREATE TABLE IF NOT EXISTS public.estimates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Estimate Number
  estimate_number TEXT NOT NULL,

  -- Customer Info
  customer_name TEXT NOT NULL,
  customer_email TEXT,
  customer_phone TEXT,
  customer_address TEXT,
  customer_city TEXT,
  customer_state TEXT,
  customer_zip TEXT,

  -- Project Details
  project_name TEXT,
  project_description TEXT,
  project_address TEXT, -- If different from customer address

  -- Dates
  estimate_date DATE DEFAULT CURRENT_DATE,
  valid_until DATE,

  -- Totals (calculated from line items)
  subtotal DECIMAL(10,2) DEFAULT 0,
  tax_rate DECIMAL(5,2) DEFAULT 0,
  tax_amount DECIMAL(10,2) DEFAULT 0,
  discount_type TEXT CHECK (discount_type IN ('percent', 'amount')),
  discount_value DECIMAL(10,2) DEFAULT 0,
  discount_amount DECIMAL(10,2) DEFAULT 0,
  total DECIMAL(10,2) DEFAULT 0,

  -- Deposit
  deposit_required BOOLEAN DEFAULT true,
  deposit_percent DECIMAL(5,2) DEFAULT 50,
  deposit_amount DECIMAL(10,2) DEFAULT 0,
  deposit_paid BOOLEAN DEFAULT false,
  deposit_paid_date DATE,

  -- Terms
  payment_terms TEXT,
  warranty_terms TEXT,
  notes TEXT,
  internal_notes TEXT, -- Not shown to customer
  terms_and_conditions TEXT,

  -- Status
  status TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'sent', 'viewed', 'approved', 'rejected', 'expired', 'converted')),
  sent_at TIMESTAMPTZ,
  viewed_at TIMESTAMPTZ,
  approved_at TIMESTAMPTZ,
  rejected_at TIMESTAMPTZ,
  rejection_reason TEXT,

  -- Customer Signature
  customer_signature TEXT, -- Base64 or URL
  customer_signed_at TIMESTAMPTZ,
  customer_ip_address TEXT,

  -- Converted Invoice Reference
  invoice_id UUID,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.estimates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "estimates_select_own" ON public.estimates
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "estimates_insert_own" ON public.estimates
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "estimates_update_own" ON public.estimates
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "estimates_delete_own" ON public.estimates
  FOR DELETE USING (auth.uid() = user_id);

CREATE POLICY "estimates_service_all" ON public.estimates
  FOR ALL USING (auth.role() = 'service_role');

GRANT ALL ON public.estimates TO authenticated;
GRANT ALL ON public.estimates TO service_role;

CREATE INDEX IF NOT EXISTS estimates_user_idx ON public.estimates(user_id);
CREATE INDEX IF NOT EXISTS estimates_status_idx ON public.estimates(status);
CREATE INDEX IF NOT EXISTS estimates_number_idx ON public.estimates(estimate_number);
CREATE INDEX IF NOT EXISTS estimates_customer_email_idx ON public.estimates(customer_email);

-- ============================================================
-- ESTIMATE LINE ITEMS TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS public.estimate_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  estimate_id UUID NOT NULL REFERENCES public.estimates(id) ON DELETE CASCADE,

  -- Item Details
  name TEXT NOT NULL,
  description TEXT,
  category TEXT DEFAULT 'service',

  -- Pricing
  quantity DECIMAL(10,2) DEFAULT 1,
  unit_type TEXT DEFAULT 'each',
  unit_price DECIMAL(10,2) DEFAULT 0,
  total DECIMAL(10,2) DEFAULT 0,

  -- Cost tracking (for profit calculation)
  cost DECIMAL(10,2),

  -- Linked catalog item
  service_catalog_id UUID REFERENCES public.service_catalog(id),
  linked_product_slug TEXT,
  linked_product_image TEXT,

  -- Ordering
  sort_order INTEGER DEFAULT 0,

  -- Optional grouping
  group_name TEXT,

  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.estimate_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "estimate_items_select_own" ON public.estimate_items
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.estimates WHERE id = estimate_id AND user_id = auth.uid())
  );

CREATE POLICY "estimate_items_insert_own" ON public.estimate_items
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM public.estimates WHERE id = estimate_id AND user_id = auth.uid())
  );

CREATE POLICY "estimate_items_update_own" ON public.estimate_items
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM public.estimates WHERE id = estimate_id AND user_id = auth.uid())
  );

CREATE POLICY "estimate_items_delete_own" ON public.estimate_items
  FOR DELETE USING (
    EXISTS (SELECT 1 FROM public.estimates WHERE id = estimate_id AND user_id = auth.uid())
  );

CREATE POLICY "estimate_items_service_all" ON public.estimate_items
  FOR ALL USING (auth.role() = 'service_role');

GRANT ALL ON public.estimate_items TO authenticated;
GRANT ALL ON public.estimate_items TO service_role;

CREATE INDEX IF NOT EXISTS estimate_items_estimate_idx ON public.estimate_items(estimate_id);

-- ============================================================
-- INVOICES TABLE - Created from estimates or standalone
-- ============================================================
CREATE TABLE IF NOT EXISTS public.invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Invoice Number
  invoice_number TEXT NOT NULL,

  -- Source Estimate
  estimate_id UUID REFERENCES public.estimates(id),

  -- Customer Info
  customer_name TEXT NOT NULL,
  customer_email TEXT,
  customer_phone TEXT,
  customer_address TEXT,
  customer_city TEXT,
  customer_state TEXT,
  customer_zip TEXT,

  -- Project Details
  project_name TEXT,
  project_description TEXT,

  -- Dates
  invoice_date DATE DEFAULT CURRENT_DATE,
  due_date DATE,

  -- Totals
  subtotal DECIMAL(10,2) DEFAULT 0,
  tax_rate DECIMAL(5,2) DEFAULT 0,
  tax_amount DECIMAL(10,2) DEFAULT 0,
  discount_type TEXT CHECK (discount_type IN ('percent', 'amount')),
  discount_value DECIMAL(10,2) DEFAULT 0,
  discount_amount DECIMAL(10,2) DEFAULT 0,
  total DECIMAL(10,2) DEFAULT 0,

  -- Payments
  amount_paid DECIMAL(10,2) DEFAULT 0,
  balance_due DECIMAL(10,2) DEFAULT 0,

  -- Terms
  payment_terms TEXT,
  notes TEXT,
  internal_notes TEXT,

  -- Status
  status TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'sent', 'viewed', 'partial', 'paid', 'overdue', 'cancelled')),
  sent_at TIMESTAMPTZ,
  viewed_at TIMESTAMPTZ,
  paid_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "invoices_select_own" ON public.invoices
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "invoices_insert_own" ON public.invoices
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "invoices_update_own" ON public.invoices
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "invoices_delete_own" ON public.invoices
  FOR DELETE USING (auth.uid() = user_id);

CREATE POLICY "invoices_service_all" ON public.invoices
  FOR ALL USING (auth.role() = 'service_role');

GRANT ALL ON public.invoices TO authenticated;
GRANT ALL ON public.invoices TO service_role;

CREATE INDEX IF NOT EXISTS invoices_user_idx ON public.invoices(user_id);
CREATE INDEX IF NOT EXISTS invoices_status_idx ON public.invoices(status);
CREATE INDEX IF NOT EXISTS invoices_estimate_idx ON public.invoices(estimate_id);

-- ============================================================
-- INVOICE LINE ITEMS TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS public.invoice_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id UUID NOT NULL REFERENCES public.invoices(id) ON DELETE CASCADE,

  -- Item Details
  name TEXT NOT NULL,
  description TEXT,
  category TEXT DEFAULT 'service',

  -- Pricing
  quantity DECIMAL(10,2) DEFAULT 1,
  unit_type TEXT DEFAULT 'each',
  unit_price DECIMAL(10,2) DEFAULT 0,
  total DECIMAL(10,2) DEFAULT 0,

  -- Ordering
  sort_order INTEGER DEFAULT 0,

  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.invoice_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "invoice_items_select_own" ON public.invoice_items
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.invoices WHERE id = invoice_id AND user_id = auth.uid())
  );

CREATE POLICY "invoice_items_insert_own" ON public.invoice_items
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM public.invoices WHERE id = invoice_id AND user_id = auth.uid())
  );

CREATE POLICY "invoice_items_update_own" ON public.invoice_items
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM public.invoices WHERE id = invoice_id AND user_id = auth.uid())
  );

CREATE POLICY "invoice_items_delete_own" ON public.invoice_items
  FOR DELETE USING (
    EXISTS (SELECT 1 FROM public.invoices WHERE id = invoice_id AND user_id = auth.uid())
  );

CREATE POLICY "invoice_items_service_all" ON public.invoice_items
  FOR ALL USING (auth.role() = 'service_role');

GRANT ALL ON public.invoice_items TO authenticated;
GRANT ALL ON public.invoice_items TO service_role;

CREATE INDEX IF NOT EXISTS invoice_items_invoice_idx ON public.invoice_items(invoice_id);

-- ============================================================
-- PAYMENTS TABLE - Track all payments
-- ============================================================
CREATE TABLE IF NOT EXISTS public.payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  invoice_id UUID REFERENCES public.invoices(id),
  estimate_id UUID REFERENCES public.estimates(id), -- For deposit payments

  -- Payment Details
  amount DECIMAL(10,2) NOT NULL,
  payment_type TEXT DEFAULT 'payment' CHECK (payment_type IN ('deposit', 'payment', 'refund')),
  payment_method TEXT CHECK (payment_method IN ('cash', 'check', 'card', 'bank_transfer', 'other')),

  -- Reference
  reference_number TEXT,
  notes TEXT,

  -- Status
  status TEXT DEFAULT 'completed' CHECK (status IN ('pending', 'completed', 'failed', 'refunded')),

  payment_date DATE DEFAULT CURRENT_DATE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "payments_select_own" ON public.payments
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "payments_insert_own" ON public.payments
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "payments_update_own" ON public.payments
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "payments_service_all" ON public.payments
  FOR ALL USING (auth.role() = 'service_role');

GRANT ALL ON public.payments TO authenticated;
GRANT ALL ON public.payments TO service_role;

CREATE INDEX IF NOT EXISTS payments_user_idx ON public.payments(user_id);
CREATE INDEX IF NOT EXISTS payments_invoice_idx ON public.payments(invoice_id);
CREATE INDEX IF NOT EXISTS payments_estimate_idx ON public.payments(estimate_id);

-- ============================================================
-- ESTIMATE ACCESS TOKENS - For customer viewing/approval
-- ============================================================
CREATE TABLE IF NOT EXISTS public.estimate_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  estimate_id UUID NOT NULL REFERENCES public.estimates(id) ON DELETE CASCADE,

  token TEXT UNIQUE NOT NULL DEFAULT encode(gen_random_bytes(32), 'hex'),

  -- Access tracking
  views INTEGER DEFAULT 0,
  last_viewed_at TIMESTAMPTZ,

  -- Expiration
  expires_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Public access for token lookup (no auth required)
ALTER TABLE public.estimate_tokens ENABLE ROW LEVEL SECURITY;

CREATE POLICY "estimate_tokens_public_select" ON public.estimate_tokens
  FOR SELECT USING (true);

CREATE POLICY "estimate_tokens_insert_own" ON public.estimate_tokens
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM public.estimates WHERE id = estimate_id AND user_id = auth.uid())
  );

CREATE POLICY "estimate_tokens_service_all" ON public.estimate_tokens
  FOR ALL USING (auth.role() = 'service_role');

GRANT SELECT ON public.estimate_tokens TO anon;
GRANT ALL ON public.estimate_tokens TO authenticated;
GRANT ALL ON public.estimate_tokens TO service_role;

CREATE INDEX IF NOT EXISTS estimate_tokens_token_idx ON public.estimate_tokens(token);
CREATE INDEX IF NOT EXISTS estimate_tokens_estimate_idx ON public.estimate_tokens(estimate_id);

-- ============================================================
-- FUNCTIONS
-- ============================================================

-- Function to get next estimate number
CREATE OR REPLACE FUNCTION get_next_estimate_number(p_user_id UUID)
RETURNS TEXT AS $$
DECLARE
  v_prefix TEXT;
  v_number INTEGER;
  v_result TEXT;
BEGIN
  -- Get or create business settings
  INSERT INTO public.business_settings (user_id)
  VALUES (p_user_id)
  ON CONFLICT (user_id) DO NOTHING;

  -- Get prefix and number, then increment
  UPDATE public.business_settings
  SET estimate_next_number = estimate_next_number + 1
  WHERE user_id = p_user_id
  RETURNING estimate_prefix, estimate_next_number - 1 INTO v_prefix, v_number;

  RETURN COALESCE(v_prefix, 'EST-') || LPAD(v_number::TEXT, 4, '0');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get next invoice number
CREATE OR REPLACE FUNCTION get_next_invoice_number(p_user_id UUID)
RETURNS TEXT AS $$
DECLARE
  v_prefix TEXT;
  v_number INTEGER;
BEGIN
  INSERT INTO public.business_settings (user_id)
  VALUES (p_user_id)
  ON CONFLICT (user_id) DO NOTHING;

  UPDATE public.business_settings
  SET invoice_next_number = invoice_next_number + 1
  WHERE user_id = p_user_id
  RETURNING invoice_prefix, invoice_next_number - 1 INTO v_prefix, v_number;

  RETURN COALESCE(v_prefix, 'INV-') || LPAD(v_number::TEXT, 4, '0');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to recalculate estimate totals
CREATE OR REPLACE FUNCTION recalculate_estimate_totals(p_estimate_id UUID)
RETURNS void AS $$
DECLARE
  v_subtotal DECIMAL(10,2);
  v_tax_rate DECIMAL(5,2);
  v_discount_type TEXT;
  v_discount_value DECIMAL(10,2);
  v_discount_amount DECIMAL(10,2);
  v_tax_amount DECIMAL(10,2);
  v_total DECIMAL(10,2);
  v_deposit_percent DECIMAL(5,2);
BEGIN
  -- Get current settings
  SELECT tax_rate, discount_type, discount_value, deposit_percent
  INTO v_tax_rate, v_discount_type, v_discount_value, v_deposit_percent
  FROM public.estimates WHERE id = p_estimate_id;

  -- Calculate subtotal from line items
  SELECT COALESCE(SUM(total), 0) INTO v_subtotal
  FROM public.estimate_items WHERE estimate_id = p_estimate_id;

  -- Calculate discount
  IF v_discount_type = 'percent' THEN
    v_discount_amount := v_subtotal * (COALESCE(v_discount_value, 0) / 100);
  ELSE
    v_discount_amount := COALESCE(v_discount_value, 0);
  END IF;

  -- Calculate tax (after discount)
  v_tax_amount := (v_subtotal - v_discount_amount) * (COALESCE(v_tax_rate, 0) / 100);

  -- Calculate total
  v_total := v_subtotal - v_discount_amount + v_tax_amount;

  -- Update estimate
  UPDATE public.estimates SET
    subtotal = v_subtotal,
    discount_amount = v_discount_amount,
    tax_amount = v_tax_amount,
    total = v_total,
    deposit_amount = v_total * (COALESCE(v_deposit_percent, 0) / 100),
    updated_at = NOW()
  WHERE id = p_estimate_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute
GRANT EXECUTE ON FUNCTION get_next_estimate_number(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION get_next_invoice_number(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION recalculate_estimate_totals(UUID) TO authenticated;

-- ============================================================
-- TRIGGERS
-- ============================================================

-- Auto-update line item total
CREATE OR REPLACE FUNCTION update_estimate_item_total()
RETURNS TRIGGER AS $$
BEGIN
  NEW.total := NEW.quantity * NEW.unit_price;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER estimate_item_total_trigger
  BEFORE INSERT OR UPDATE ON public.estimate_items
  FOR EACH ROW EXECUTE FUNCTION update_estimate_item_total();

-- Auto-recalculate estimate after item changes
CREATE OR REPLACE FUNCTION trigger_recalculate_estimate()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM recalculate_estimate_totals(OLD.estimate_id);
    RETURN OLD;
  ELSE
    PERFORM recalculate_estimate_totals(NEW.estimate_id);
    RETURN NEW;
  END IF;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER estimate_items_recalc_trigger
  AFTER INSERT OR UPDATE OR DELETE ON public.estimate_items
  FOR EACH ROW EXECUTE FUNCTION trigger_recalculate_estimate();

-- ============================================================
-- DONE
-- ============================================================
COMMENT ON TABLE public.estimates IS 'Customer estimates/quotes with line items and approval workflow';
COMMENT ON TABLE public.invoices IS 'Invoices generated from estimates or created standalone';
COMMENT ON TABLE public.service_catalog IS 'User-defined services and materials catalog for quick estimate creation';
COMMENT ON TABLE public.business_settings IS 'Company branding, defaults, and numbering settings';
