-- Products Table for Surprise Granite Marketplace
-- Run this SQL in your Supabase SQL Editor

-- Create products table
CREATE TABLE IF NOT EXISTS products (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  vendor_id UUID REFERENCES auth.users(id),
  vendor_email TEXT,
  name TEXT NOT NULL,
  description TEXT,
  category TEXT,
  price DECIMAL(10,2) NOT NULL DEFAULT 0,
  dimensions TEXT,
  material_type TEXT,
  color TEXT,
  image_url TEXT,
  stock_quantity INTEGER DEFAULT 1,
  status TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'sold')),
  stripe_product_id TEXT,
  stripe_price_id TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create index for faster queries
CREATE INDEX IF NOT EXISTS idx_products_vendor_id ON products(vendor_id);
CREATE INDEX IF NOT EXISTS idx_products_status ON products(status);
CREATE INDEX IF NOT EXISTS idx_products_category ON products(category);

-- Enable Row Level Security
ALTER TABLE products ENABLE ROW LEVEL SECURITY;

-- Policy: Anyone can view active products (for public shop)
CREATE POLICY "Public can view active products"
  ON products FOR SELECT
  USING (status = 'active');

-- Policy: Authenticated users can view their own products
CREATE POLICY "Users can view own products"
  ON products FOR SELECT
  TO authenticated
  USING (vendor_id = auth.uid());

-- Policy: Authenticated users can insert their own products
CREATE POLICY "Users can insert own products"
  ON products FOR INSERT
  TO authenticated
  WITH CHECK (vendor_id = auth.uid());

-- Policy: Users can update their own products
CREATE POLICY "Users can update own products"
  ON products FOR UPDATE
  TO authenticated
  USING (vendor_id = auth.uid())
  WITH CHECK (vendor_id = auth.uid());

-- Policy: Users can delete their own products
CREATE POLICY "Users can delete own products"
  ON products FOR DELETE
  TO authenticated
  USING (vendor_id = auth.uid());

-- Policy: Super admins can do everything (based on email)
-- Note: You may need to create a function to check admin status
CREATE POLICY "Admins can view all products"
  ON products FOR SELECT
  TO authenticated
  USING (
    auth.jwt() ->> 'email' IN ('joshb@surprisegranite.com', 'info@surprisegranite.com')
    OR vendor_id = auth.uid()
    OR status = 'active'
  );

CREATE POLICY "Admins can update all products"
  ON products FOR UPDATE
  TO authenticated
  USING (
    auth.jwt() ->> 'email' IN ('joshb@surprisegranite.com', 'info@surprisegranite.com')
    OR vendor_id = auth.uid()
  );

CREATE POLICY "Admins can delete all products"
  ON products FOR DELETE
  TO authenticated
  USING (
    auth.jwt() ->> 'email' IN ('joshb@surprisegranite.com', 'info@surprisegranite.com')
    OR vendor_id = auth.uid()
  );

-- Grant necessary permissions
GRANT ALL ON products TO authenticated;
GRANT SELECT ON products TO anon;
