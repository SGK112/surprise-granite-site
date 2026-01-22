-- =====================================================
-- SHOP ORDERS MIGRATION
-- Creates orders table for cart/shop checkout flow
-- Run this in Supabase SQL Editor
-- =====================================================

-- 1. Create orders table for shop purchases
CREATE TABLE IF NOT EXISTS public.orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Order identification
  order_number TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled', 'refunded')),

  -- Customer information
  customer_email TEXT NOT NULL,
  customer_name TEXT,
  customer_phone TEXT,

  -- Shipping address
  shipping_address_line1 TEXT,
  shipping_address_line2 TEXT,
  shipping_city TEXT,
  shipping_state TEXT,
  shipping_zip TEXT,
  shipping_country TEXT DEFAULT 'US',

  -- Billing address (if different)
  billing_address_line1 TEXT,
  billing_address_line2 TEXT,
  billing_city TEXT,
  billing_state TEXT,
  billing_zip TEXT,
  billing_country TEXT DEFAULT 'US',

  -- Order totals (in dollars)
  subtotal DECIMAL(10, 2) NOT NULL DEFAULT 0,
  shipping_amount DECIMAL(10, 2) NOT NULL DEFAULT 0,
  tax_amount DECIMAL(10, 2) NOT NULL DEFAULT 0,
  discount_amount DECIMAL(10, 2) NOT NULL DEFAULT 0,
  total DECIMAL(10, 2) NOT NULL DEFAULT 0,

  -- Order items (stored as JSONB array)
  items JSONB NOT NULL DEFAULT '[]'::jsonb,

  -- Payment information
  stripe_session_id TEXT UNIQUE,
  stripe_payment_intent_id TEXT,
  stripe_customer_id TEXT,
  payment_status TEXT DEFAULT 'unpaid' CHECK (payment_status IN ('unpaid', 'paid', 'failed', 'refunded')),
  paid_at TIMESTAMPTZ,

  -- Fulfillment
  shipped_at TIMESTAMPTZ,
  tracking_number TEXT,
  tracking_carrier TEXT,
  delivered_at TIMESTAMPTZ,

  -- Promo/discount
  promo_code TEXT,
  promo_discount_type TEXT,
  promo_discount_value DECIMAL(10, 2),

  -- Notes
  customer_notes TEXT,
  internal_notes TEXT,

  -- Metadata
  metadata JSONB DEFAULT '{}'::jsonb,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Create order items table for detailed line items (optional normalization)
CREATE TABLE IF NOT EXISTS public.order_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,

  -- Product information
  product_id TEXT,
  product_name TEXT NOT NULL,
  product_variant TEXT,
  product_image TEXT,
  product_sku TEXT,

  -- Pricing
  unit_price DECIMAL(10, 2) NOT NULL,
  quantity INTEGER NOT NULL DEFAULT 1,
  line_total DECIMAL(10, 2) NOT NULL,

  -- Metadata
  metadata JSONB DEFAULT '{}'::jsonb,

  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Create indexes for common queries
CREATE INDEX IF NOT EXISTS idx_orders_order_number ON public.orders(order_number);
CREATE INDEX IF NOT EXISTS idx_orders_customer_email ON public.orders(customer_email);
CREATE INDEX IF NOT EXISTS idx_orders_stripe_session ON public.orders(stripe_session_id);
CREATE INDEX IF NOT EXISTS idx_orders_status ON public.orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_payment_status ON public.orders(payment_status);
CREATE INDEX IF NOT EXISTS idx_orders_created_at ON public.orders(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_order_items_order_id ON public.order_items(order_id);

-- 4. Create updated_at trigger
CREATE OR REPLACE FUNCTION update_orders_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS orders_updated_at ON public.orders;
CREATE TRIGGER orders_updated_at
  BEFORE UPDATE ON public.orders
  FOR EACH ROW
  EXECUTE FUNCTION update_orders_updated_at();

-- 5. Enable Row Level Security
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;

-- 6. RLS Policies - Allow service role full access
CREATE POLICY "Service role full access to orders"
  ON public.orders FOR ALL
  USING (auth.role() = 'service_role');

CREATE POLICY "Service role full access to order_items"
  ON public.order_items FOR ALL
  USING (auth.role() = 'service_role');

-- 7. Allow anon insert for webhook processing
CREATE POLICY "Allow anon insert orders"
  ON public.orders FOR INSERT
  TO anon
  WITH CHECK (true);

CREATE POLICY "Allow anon insert order_items"
  ON public.order_items FOR INSERT
  TO anon
  WITH CHECK (true);

-- 8. Allow authenticated users to view their own orders
CREATE POLICY "Users can view their orders"
  ON public.orders FOR SELECT
  TO authenticated
  USING (customer_email = auth.jwt() ->> 'email');

CREATE POLICY "Users can view their order items"
  ON public.order_items FOR SELECT
  TO authenticated
  USING (
    order_id IN (
      SELECT id FROM public.orders
      WHERE customer_email = auth.jwt() ->> 'email'
    )
  );

-- 9. Create function to get order by order number or session ID
CREATE OR REPLACE FUNCTION get_order_details(p_identifier TEXT)
RETURNS TABLE (
  id UUID,
  order_number TEXT,
  status TEXT,
  customer_name TEXT,
  customer_email TEXT,
  subtotal DECIMAL,
  shipping_amount DECIMAL,
  tax_amount DECIMAL,
  discount_amount DECIMAL,
  total DECIMAL,
  items JSONB,
  payment_status TEXT,
  paid_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    o.id,
    o.order_number,
    o.status,
    o.customer_name,
    o.customer_email,
    o.subtotal,
    o.shipping_amount,
    o.tax_amount,
    o.discount_amount,
    o.total,
    o.items,
    o.payment_status,
    o.paid_at,
    o.created_at
  FROM public.orders o
  WHERE o.order_number = p_identifier
     OR o.stripe_session_id = p_identifier
     OR o.stripe_payment_intent_id = p_identifier
  LIMIT 1;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 10. Grant execute permissions
GRANT EXECUTE ON FUNCTION get_order_details(TEXT) TO anon;
GRANT EXECUTE ON FUNCTION get_order_details(TEXT) TO authenticated;

-- =====================================================
-- DONE! Orders table created
-- =====================================================
