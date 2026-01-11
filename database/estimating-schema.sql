-- ============================================================
-- ESTIMATING & PRICE SHEET MANAGEMENT SCHEMA
-- Run this in Supabase SQL Editor
-- ============================================================

-- ============================================================
-- PRODUCT CATEGORIES
-- ============================================================
CREATE TABLE IF NOT EXISTS public.product_categories (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  description TEXT,
  parent_id UUID REFERENCES public.product_categories(id),
  sort_order INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Default categories
INSERT INTO public.product_categories (name, slug, sort_order) VALUES
  ('Countertops', 'countertops', 1),
  ('Tile', 'tile', 2),
  ('Flooring', 'flooring', 3),
  ('Cabinets', 'cabinets', 4),
  ('Sinks', 'sinks', 5),
  ('Faucets', 'faucets', 6),
  ('Installation Labor', 'labor', 7),
  ('Fabrication', 'fabrication', 8),
  ('Edges', 'edges', 9),
  ('Backsplash', 'backsplash', 10),
  ('Demolition', 'demolition', 11),
  ('Plumbing', 'plumbing', 12),
  ('Miscellaneous', 'misc', 99)
ON CONFLICT (slug) DO NOTHING;

-- ============================================================
-- PRICE SHEETS (Imported PDF/Excel files)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.price_sheets (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  vendor_name TEXT,
  file_url TEXT,
  file_type TEXT, -- 'pdf', 'csv', 'xlsx', 'manual'
  status TEXT DEFAULT 'pending' CHECK (
    status IN ('pending', 'processing', 'completed', 'failed')
  ),
  raw_data JSONB, -- Extracted raw data from PDF
  processed_items INTEGER DEFAULT 0,
  total_items INTEGER DEFAULT 0,
  error_message TEXT,
  uploaded_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- PRODUCTS & SERVICES
-- ============================================================
CREATE TABLE IF NOT EXISTS public.products (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,

  -- Basic Info
  sku TEXT,
  name TEXT NOT NULL,
  description TEXT,
  category_id UUID REFERENCES public.product_categories(id),

  -- Pricing
  unit_type TEXT DEFAULT 'sqft' CHECK (
    unit_type IN ('sqft', 'lnft', 'each', 'hour', 'job', 'slab', 'piece', 'box', 'pallet')
  ),
  cost_price DECIMAL(10,2), -- What we pay
  retail_price DECIMAL(10,2), -- MSRP
  our_price DECIMAL(10,2) NOT NULL, -- What we charge
  min_price DECIMAL(10,2), -- Minimum allowed price

  -- Markup/Margin
  markup_percent DECIMAL(5,2),
  margin_percent DECIMAL(5,2),

  -- Inventory
  track_inventory BOOLEAN DEFAULT false,
  stock_quantity INTEGER DEFAULT 0,
  low_stock_alert INTEGER DEFAULT 5,

  -- Vendor/Source
  vendor_name TEXT,
  vendor_sku TEXT,
  price_sheet_id UUID REFERENCES public.price_sheets(id),

  -- Display
  image_url TEXT,
  is_active BOOLEAN DEFAULT true,
  is_featured BOOLEAN DEFAULT false,
  show_on_website BOOLEAN DEFAULT false,
  sort_order INTEGER DEFAULT 0,

  -- Metadata
  tags TEXT[],
  attributes JSONB, -- color, material, thickness, etc.

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes
CREATE INDEX IF NOT EXISTS products_category_idx ON public.products(category_id);
CREATE INDEX IF NOT EXISTS products_sku_idx ON public.products(sku);
CREATE INDEX IF NOT EXISTS products_active_idx ON public.products(is_active);
CREATE INDEX IF NOT EXISTS products_price_sheet_idx ON public.products(price_sheet_id);

-- ============================================================
-- ESTIMATES
-- ============================================================
CREATE TABLE IF NOT EXISTS public.estimates (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  estimate_number TEXT UNIQUE,

  -- Customer Info
  customer_name TEXT NOT NULL,
  customer_email TEXT,
  customer_phone TEXT,
  customer_address TEXT,
  customer_city TEXT,
  customer_state TEXT DEFAULT 'AZ',
  customer_zip TEXT,

  -- Project Info
  project_name TEXT,
  project_type TEXT,
  project_address TEXT,
  project_notes TEXT,

  -- Financials
  subtotal DECIMAL(12,2) DEFAULT 0,
  tax_rate DECIMAL(5,3) DEFAULT 0,
  tax_amount DECIMAL(12,2) DEFAULT 0,
  discount_type TEXT CHECK (discount_type IN ('percent', 'fixed')),
  discount_value DECIMAL(12,2) DEFAULT 0,
  discount_amount DECIMAL(12,2) DEFAULT 0,
  total DECIMAL(12,2) DEFAULT 0,
  deposit_required DECIMAL(12,2) DEFAULT 0,

  -- Cost tracking
  total_cost DECIMAL(12,2) DEFAULT 0,
  profit_margin DECIMAL(5,2) DEFAULT 0,

  -- Status
  status TEXT DEFAULT 'draft' CHECK (
    status IN ('draft', 'sent', 'viewed', 'accepted', 'declined', 'expired', 'invoiced', 'converted')
  ),
  valid_until DATE,
  sent_at TIMESTAMPTZ,
  viewed_at TIMESTAMPTZ,
  accepted_at TIMESTAMPTZ,
  converted_to_invoice UUID, -- Reference to invoice if converted

  -- Assignment
  created_by UUID REFERENCES auth.users(id),
  assigned_to UUID REFERENCES auth.users(id),

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Generate estimate number
CREATE OR REPLACE FUNCTION generate_estimate_number()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.estimate_number IS NULL THEN
    NEW.estimate_number := 'EST-' || TO_CHAR(NOW(), 'YYYYMMDD') || '-' ||
      LPAD(NEXTVAL('estimate_number_seq')::TEXT, 4, '0');
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE SEQUENCE IF NOT EXISTS estimate_number_seq START 1;

DROP TRIGGER IF EXISTS set_estimate_number ON public.estimates;
CREATE TRIGGER set_estimate_number
  BEFORE INSERT ON public.estimates
  FOR EACH ROW EXECUTE FUNCTION generate_estimate_number();

-- ============================================================
-- ESTIMATE LINE ITEMS
-- ============================================================
CREATE TABLE IF NOT EXISTS public.estimate_line_items (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  estimate_id UUID NOT NULL REFERENCES public.estimates(id) ON DELETE CASCADE,

  -- Product reference (optional - can be custom item)
  product_id UUID REFERENCES public.products(id),

  -- Item details
  name TEXT NOT NULL,
  description TEXT,
  category TEXT,

  -- Quantity & Pricing
  quantity DECIMAL(10,2) NOT NULL DEFAULT 1,
  unit_type TEXT DEFAULT 'each',
  unit_price DECIMAL(10,2) NOT NULL,
  unit_cost DECIMAL(10,2) DEFAULT 0,

  -- Calculated
  line_total DECIMAL(12,2) GENERATED ALWAYS AS (quantity * unit_price) STORED,
  line_cost DECIMAL(12,2) GENERATED ALWAYS AS (quantity * unit_cost) STORED,

  -- Display
  sort_order INTEGER DEFAULT 0,
  is_optional BOOLEAN DEFAULT false,
  notes TEXT,

  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS estimate_items_estimate_idx ON public.estimate_line_items(estimate_id);

-- ============================================================
-- JOB COSTING
-- ============================================================
CREATE TABLE IF NOT EXISTS public.job_costs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,

  -- Link to estimate/invoice
  estimate_id UUID REFERENCES public.estimates(id),
  invoice_id TEXT, -- Stripe invoice ID

  -- Job Info
  job_name TEXT NOT NULL,
  job_number TEXT,
  customer_name TEXT,

  -- Cost Categories
  material_cost DECIMAL(12,2) DEFAULT 0,
  labor_cost DECIMAL(12,2) DEFAULT 0,
  subcontractor_cost DECIMAL(12,2) DEFAULT 0,
  equipment_cost DECIMAL(12,2) DEFAULT 0,
  overhead_cost DECIMAL(12,2) DEFAULT 0,
  other_cost DECIMAL(12,2) DEFAULT 0,

  -- Totals
  total_cost DECIMAL(12,2) GENERATED ALWAYS AS (
    material_cost + labor_cost + subcontractor_cost +
    equipment_cost + overhead_cost + other_cost
  ) STORED,
  revenue DECIMAL(12,2) DEFAULT 0,
  profit DECIMAL(12,2) GENERATED ALWAYS AS (
    revenue - (material_cost + labor_cost + subcontractor_cost +
    equipment_cost + overhead_cost + other_cost)
  ) STORED,

  -- Status
  status TEXT DEFAULT 'in_progress' CHECK (
    status IN ('in_progress', 'completed', 'cancelled')
  ),

  -- Timestamps
  start_date DATE,
  end_date DATE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- JOB COST ENTRIES (Individual cost items)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.job_cost_entries (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  job_id UUID NOT NULL REFERENCES public.job_costs(id) ON DELETE CASCADE,

  category TEXT NOT NULL CHECK (
    category IN ('material', 'labor', 'subcontractor', 'equipment', 'overhead', 'other')
  ),
  description TEXT NOT NULL,
  vendor TEXT,
  reference_number TEXT, -- PO#, Invoice#, etc.

  quantity DECIMAL(10,2) DEFAULT 1,
  unit_cost DECIMAL(10,2) NOT NULL,
  total_cost DECIMAL(12,2) GENERATED ALWAYS AS (quantity * unit_cost) STORED,

  date_incurred DATE DEFAULT CURRENT_DATE,
  notes TEXT,
  receipt_url TEXT,

  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS job_cost_entries_job_idx ON public.job_cost_entries(job_id);

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================

-- Enable RLS
ALTER TABLE public.product_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.price_sheets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.estimates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.estimate_line_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.job_costs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.job_cost_entries ENABLE ROW LEVEL SECURITY;

-- Categories - everyone can read, admins can write
CREATE POLICY "categories_read" ON public.product_categories FOR SELECT USING (true);
CREATE POLICY "categories_admin" ON public.product_categories FOR ALL USING (
  EXISTS (SELECT 1 FROM public.sg_users WHERE id = auth.uid() AND account_type = 'admin')
);

-- Price sheets - admins only
CREATE POLICY "price_sheets_admin" ON public.price_sheets FOR ALL USING (
  EXISTS (SELECT 1 FROM public.sg_users WHERE id = auth.uid() AND account_type = 'admin')
);

-- Products - everyone can read active, admins can write
CREATE POLICY "products_read" ON public.products FOR SELECT USING (is_active = true OR
  EXISTS (SELECT 1 FROM public.sg_users WHERE id = auth.uid() AND account_type = 'admin')
);
CREATE POLICY "products_admin" ON public.products FOR ALL USING (
  EXISTS (SELECT 1 FROM public.sg_users WHERE id = auth.uid() AND account_type = 'admin')
);

-- Estimates - admins can do everything
CREATE POLICY "estimates_admin" ON public.estimates FOR ALL USING (
  EXISTS (SELECT 1 FROM public.sg_users WHERE id = auth.uid() AND account_type = 'admin')
);

-- Estimate line items - inherit from estimate
CREATE POLICY "estimate_items_admin" ON public.estimate_line_items FOR ALL USING (
  EXISTS (SELECT 1 FROM public.sg_users WHERE id = auth.uid() AND account_type = 'admin')
);

-- Job costs - admins only
CREATE POLICY "job_costs_admin" ON public.job_costs FOR ALL USING (
  EXISTS (SELECT 1 FROM public.sg_users WHERE id = auth.uid() AND account_type = 'admin')
);
CREATE POLICY "job_cost_entries_admin" ON public.job_cost_entries FOR ALL USING (
  EXISTS (SELECT 1 FROM public.sg_users WHERE id = auth.uid() AND account_type = 'admin')
);

-- Service role bypass
CREATE POLICY "service_categories" ON public.product_categories FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "service_price_sheets" ON public.price_sheets FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "service_products" ON public.products FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "service_estimates" ON public.estimates FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "service_estimate_items" ON public.estimate_line_items FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "service_job_costs" ON public.job_costs FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "service_job_cost_entries" ON public.job_cost_entries FOR ALL USING (auth.role() = 'service_role');

-- ============================================================
-- GRANTS
-- ============================================================
GRANT ALL ON public.product_categories TO authenticated;
GRANT ALL ON public.price_sheets TO authenticated;
GRANT ALL ON public.products TO authenticated;
GRANT ALL ON public.estimates TO authenticated;
GRANT ALL ON public.estimate_line_items TO authenticated;
GRANT ALL ON public.job_costs TO authenticated;
GRANT ALL ON public.job_cost_entries TO authenticated;
GRANT ALL ON public.product_categories TO service_role;
GRANT ALL ON public.price_sheets TO service_role;
GRANT ALL ON public.products TO service_role;
GRANT ALL ON public.estimates TO service_role;
GRANT ALL ON public.estimate_line_items TO service_role;
GRANT ALL ON public.job_costs TO service_role;
GRANT ALL ON public.job_cost_entries TO service_role;
GRANT USAGE ON SEQUENCE estimate_number_seq TO authenticated;
GRANT USAGE ON SEQUENCE estimate_number_seq TO service_role;

-- ============================================================
-- UPDATE TRIGGERS
-- ============================================================
CREATE OR REPLACE FUNCTION update_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_product_categories_timestamp ON public.product_categories;
CREATE TRIGGER update_product_categories_timestamp BEFORE UPDATE ON public.product_categories
  FOR EACH ROW EXECUTE FUNCTION update_timestamp();

DROP TRIGGER IF EXISTS update_price_sheets_timestamp ON public.price_sheets;
CREATE TRIGGER update_price_sheets_timestamp BEFORE UPDATE ON public.price_sheets
  FOR EACH ROW EXECUTE FUNCTION update_timestamp();

DROP TRIGGER IF EXISTS update_products_timestamp ON public.products;
CREATE TRIGGER update_products_timestamp BEFORE UPDATE ON public.products
  FOR EACH ROW EXECUTE FUNCTION update_timestamp();

DROP TRIGGER IF EXISTS update_estimates_timestamp ON public.estimates;
CREATE TRIGGER update_estimates_timestamp BEFORE UPDATE ON public.estimates
  FOR EACH ROW EXECUTE FUNCTION update_timestamp();

DROP TRIGGER IF EXISTS update_job_costs_timestamp ON public.job_costs;
CREATE TRIGGER update_job_costs_timestamp BEFORE UPDATE ON public.job_costs
  FOR EACH ROW EXECUTE FUNCTION update_timestamp();

-- ============================================================
-- HELPER FUNCTION: Recalculate estimate totals
-- ============================================================
CREATE OR REPLACE FUNCTION recalculate_estimate_totals(estimate_uuid UUID)
RETURNS void AS $$
DECLARE
  v_subtotal DECIMAL(12,2);
  v_total_cost DECIMAL(12,2);
  v_discount_amount DECIMAL(12,2);
  v_tax_amount DECIMAL(12,2);
  v_total DECIMAL(12,2);
  v_discount_type TEXT;
  v_discount_value DECIMAL(12,2);
  v_tax_rate DECIMAL(5,3);
BEGIN
  -- Get line item totals
  SELECT COALESCE(SUM(line_total), 0), COALESCE(SUM(line_cost), 0)
  INTO v_subtotal, v_total_cost
  FROM public.estimate_line_items
  WHERE estimate_id = estimate_uuid AND is_optional = false;

  -- Get discount info
  SELECT discount_type, discount_value, tax_rate
  INTO v_discount_type, v_discount_value, v_tax_rate
  FROM public.estimates WHERE id = estimate_uuid;

  -- Calculate discount
  IF v_discount_type = 'percent' THEN
    v_discount_amount := v_subtotal * (v_discount_value / 100);
  ELSE
    v_discount_amount := COALESCE(v_discount_value, 0);
  END IF;

  -- Calculate tax and total
  v_tax_amount := (v_subtotal - v_discount_amount) * (v_tax_rate / 100);
  v_total := v_subtotal - v_discount_amount + v_tax_amount;

  -- Update estimate
  UPDATE public.estimates SET
    subtotal = v_subtotal,
    total_cost = v_total_cost,
    discount_amount = v_discount_amount,
    tax_amount = v_tax_amount,
    total = v_total,
    profit_margin = CASE WHEN v_total > 0 THEN ((v_total - v_total_cost) / v_total * 100) ELSE 0 END
  WHERE id = estimate_uuid;
END;
$$ LANGUAGE plpgsql;

-- Trigger to recalculate on line item changes
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

DROP TRIGGER IF EXISTS recalc_estimate_on_item_change ON public.estimate_line_items;
CREATE TRIGGER recalc_estimate_on_item_change
  AFTER INSERT OR UPDATE OR DELETE ON public.estimate_line_items
  FOR EACH ROW EXECUTE FUNCTION trigger_recalculate_estimate();

SELECT 'Estimating schema created successfully!' as status;
