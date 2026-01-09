-- Surprise Granite User Profiles - SEPARATE TABLE
-- Run this in Supabase SQL Editor: https://supabase.com/dashboard/project/cpnqippzgcezidoorwry/sql

-- Create dedicated sg_users table for Surprise Granite
CREATE TABLE IF NOT EXISTS public.sg_users (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT UNIQUE NOT NULL,
  full_name TEXT,
  phone TEXT,
  account_type TEXT DEFAULT 'homeowner' CHECK (
    account_type IN ('homeowner', 'pro_fabricator', 'pro_contractor', 'pro_designer', 'admin')
  ),
  company_name TEXT,
  license_number TEXT,
  avatar_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable Row Level Security
ALTER TABLE public.sg_users ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view their own profile
CREATE POLICY "sg_users_select_own" ON public.sg_users
  FOR SELECT USING (auth.uid() = id);

-- Policy: Users can update their own profile
CREATE POLICY "sg_users_update_own" ON public.sg_users
  FOR UPDATE USING (auth.uid() = id);

-- Policy: Users can insert their own profile
CREATE POLICY "sg_users_insert_own" ON public.sg_users
  FOR INSERT WITH CHECK (auth.uid() = id);

-- Service role can do everything (for admin)
CREATE POLICY "sg_users_service_all" ON public.sg_users
  FOR ALL USING (auth.role() = 'service_role');

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION public.sg_users_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS sg_users_updated_at_trigger ON public.sg_users;
CREATE TRIGGER sg_users_updated_at_trigger
  BEFORE UPDATE ON public.sg_users
  FOR EACH ROW EXECUTE FUNCTION public.sg_users_updated_at();

-- Grant access
GRANT ALL ON public.sg_users TO authenticated;
GRANT ALL ON public.sg_users TO service_role;

-- Indexes
CREATE INDEX IF NOT EXISTS sg_users_email_idx ON public.sg_users(email);
CREATE INDEX IF NOT EXISTS sg_users_account_type_idx ON public.sg_users(account_type);

-- ============================================================
-- USER FAVORITES TABLE - For saved flooring/countertop products
-- ============================================================

CREATE TABLE IF NOT EXISTS public.user_favorites (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  product_type TEXT NOT NULL DEFAULT 'flooring' CHECK (product_type IN ('flooring', 'countertop')),
  product_title TEXT NOT NULL,
  product_url TEXT,
  product_image TEXT,
  product_material TEXT,
  product_color TEXT,
  product_thickness TEXT,
  product_wear_layer TEXT,
  product_shade_variations TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable Row Level Security
ALTER TABLE public.user_favorites ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view their own favorites
CREATE POLICY "user_favorites_select_own" ON public.user_favorites
  FOR SELECT USING (auth.uid() = user_id);

-- Policy: Users can insert their own favorites
CREATE POLICY "user_favorites_insert_own" ON public.user_favorites
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Policy: Users can delete their own favorites
CREATE POLICY "user_favorites_delete_own" ON public.user_favorites
  FOR DELETE USING (auth.uid() = user_id);

-- Service role can do everything
CREATE POLICY "user_favorites_service_all" ON public.user_favorites
  FOR ALL USING (auth.role() = 'service_role');

-- Grant access
GRANT ALL ON public.user_favorites TO authenticated;
GRANT ALL ON public.user_favorites TO service_role;

-- Index for fast lookups
CREATE INDEX IF NOT EXISTS user_favorites_user_id_idx ON public.user_favorites(user_id);
CREATE INDEX IF NOT EXISTS user_favorites_product_type_idx ON public.user_favorites(product_type);

-- ============================================================
-- STONE LISTINGS TABLE - Remnants Marketplace
-- ============================================================

CREATE TABLE IF NOT EXISTS public.stone_listings (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Stone identification (links to catalog)
  stone_name TEXT NOT NULL,
  stone_slug TEXT,                    -- Links to /countertops/{slug}
  material_type TEXT,                 -- granite, marble, quartz, etc.
  brand TEXT,                         -- MSI, Cambria, etc.
  color TEXT,                         -- primary color

  -- Listing details
  title TEXT NOT NULL,                -- "Calacatta Gold Remnant - 24x36"
  description TEXT,
  dimensions TEXT,                    -- "24 x 36 inches"
  thickness TEXT,                     -- "3cm"
  quantity INTEGER DEFAULT 1,
  price DECIMAL(10,2),                -- NULL = "Contact for price"

  -- Images (up to 4)
  image_url TEXT,
  image_url_2 TEXT,
  image_url_3 TEXT,
  image_url_4 TEXT,

  -- Location
  city TEXT,
  state TEXT,
  zip_code TEXT,

  -- Contact preferences
  show_phone BOOLEAN DEFAULT false,
  show_email BOOLEAN DEFAULT false,
  contact_form_only BOOLEAN DEFAULT true,

  -- Status
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'sold', 'expired', 'draft')),
  views INTEGER DEFAULT 0,
  inquiries INTEGER DEFAULT 0,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '90 days')
);

-- Enable Row Level Security
ALTER TABLE public.stone_listings ENABLE ROW LEVEL SECURITY;

-- Policy: Anyone can view active listings
CREATE POLICY "stone_listings_public_view" ON public.stone_listings
  FOR SELECT USING (status = 'active');

-- Policy: Users can view their own listings (any status)
CREATE POLICY "stone_listings_owner_view" ON public.stone_listings
  FOR SELECT USING (auth.uid() = user_id);

-- Policy: Users can insert their own listings
CREATE POLICY "stone_listings_insert_own" ON public.stone_listings
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Policy: Users can update their own listings
CREATE POLICY "stone_listings_update_own" ON public.stone_listings
  FOR UPDATE USING (auth.uid() = user_id);

-- Policy: Users can delete their own listings
CREATE POLICY "stone_listings_delete_own" ON public.stone_listings
  FOR DELETE USING (auth.uid() = user_id);

-- Service role can do everything
CREATE POLICY "stone_listings_service_all" ON public.stone_listings
  FOR ALL USING (auth.role() = 'service_role');

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION public.stone_listings_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS stone_listings_updated_at_trigger ON public.stone_listings;
CREATE TRIGGER stone_listings_updated_at_trigger
  BEFORE UPDATE ON public.stone_listings
  FOR EACH ROW EXECUTE FUNCTION public.stone_listings_updated_at();

-- Grant access
GRANT ALL ON public.stone_listings TO authenticated;
GRANT ALL ON public.stone_listings TO service_role;
GRANT SELECT ON public.stone_listings TO anon;

-- Indexes for search performance
CREATE INDEX IF NOT EXISTS stone_listings_user_idx ON public.stone_listings(user_id);
CREATE INDEX IF NOT EXISTS stone_listings_stone_slug_idx ON public.stone_listings(stone_slug);
CREATE INDEX IF NOT EXISTS stone_listings_material_idx ON public.stone_listings(material_type);
CREATE INDEX IF NOT EXISTS stone_listings_color_idx ON public.stone_listings(color);
CREATE INDEX IF NOT EXISTS stone_listings_brand_idx ON public.stone_listings(brand);
CREATE INDEX IF NOT EXISTS stone_listings_status_idx ON public.stone_listings(status);
CREATE INDEX IF NOT EXISTS stone_listings_location_idx ON public.stone_listings(state, city);

-- ============================================================
-- LISTING INQUIRIES TABLE - Contact requests for listings
-- ============================================================

CREATE TABLE IF NOT EXISTS public.listing_inquiries (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  listing_id UUID NOT NULL REFERENCES public.stone_listings(id) ON DELETE CASCADE,
  sender_id UUID REFERENCES auth.users(id),  -- NULL if anonymous
  sender_name TEXT NOT NULL,
  sender_email TEXT NOT NULL,
  sender_phone TEXT,
  message TEXT NOT NULL,
  read BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable Row Level Security
ALTER TABLE public.listing_inquiries ENABLE ROW LEVEL SECURITY;

-- Policy: Listing owners can view inquiries for their listings
CREATE POLICY "listing_inquiries_owner_view" ON public.listing_inquiries
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.stone_listings
      WHERE id = listing_id AND user_id = auth.uid()
    )
  );

-- Policy: Users can view inquiries they sent
CREATE POLICY "listing_inquiries_sender_view" ON public.listing_inquiries
  FOR SELECT USING (auth.uid() = sender_id);

-- Policy: Anyone can send an inquiry (authenticated or anonymous)
CREATE POLICY "listing_inquiries_insert_any" ON public.listing_inquiries
  FOR INSERT WITH CHECK (true);

-- Policy: Listing owners can update (mark as read)
CREATE POLICY "listing_inquiries_owner_update" ON public.listing_inquiries
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM public.stone_listings
      WHERE id = listing_id AND user_id = auth.uid()
    )
  );

-- Service role can do everything
CREATE POLICY "listing_inquiries_service_all" ON public.listing_inquiries
  FOR ALL USING (auth.role() = 'service_role');

-- Grant access
GRANT ALL ON public.listing_inquiries TO authenticated;
GRANT ALL ON public.listing_inquiries TO service_role;
GRANT INSERT ON public.listing_inquiries TO anon;

-- Indexes
CREATE INDEX IF NOT EXISTS listing_inquiries_listing_idx ON public.listing_inquiries(listing_id);
CREATE INDEX IF NOT EXISTS listing_inquiries_sender_idx ON public.listing_inquiries(sender_id);
CREATE INDEX IF NOT EXISTS listing_inquiries_read_idx ON public.listing_inquiries(read);

-- ============================================================
-- RPC FUNCTIONS - For incrementing listing stats
-- ============================================================

-- Function to increment listing views
CREATE OR REPLACE FUNCTION public.increment_listing_views(listing_id UUID)
RETURNS void AS $$
BEGIN
  UPDATE public.stone_listings
  SET views = COALESCE(views, 0) + 1
  WHERE id = listing_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to increment listing inquiries count
CREATE OR REPLACE FUNCTION public.increment_listing_inquiries(listing_id UUID)
RETURNS void AS $$
BEGIN
  UPDATE public.stone_listings
  SET inquiries = COALESCE(inquiries, 0) + 1
  WHERE id = listing_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION public.increment_listing_views(UUID) TO anon;
GRANT EXECUTE ON FUNCTION public.increment_listing_views(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.increment_listing_inquiries(UUID) TO anon;
GRANT EXECUTE ON FUNCTION public.increment_listing_inquiries(UUID) TO authenticated;

-- ============================================================
-- USER ACTIVITY TABLE - Track user behavior and engagement
-- ============================================================

CREATE TABLE IF NOT EXISTS public.user_activity (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  activity_type TEXT NOT NULL,  -- page_view, product_view, cta_click, favorite_add, etc.
  page_url TEXT,
  page_title TEXT,
  referrer TEXT,
  device_info JSONB,
  metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable Row Level Security
ALTER TABLE public.user_activity ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view their own activity
CREATE POLICY "user_activity_select_own" ON public.user_activity
  FOR SELECT USING (auth.uid() = user_id);

-- Policy: Users can insert their own activity
CREATE POLICY "user_activity_insert_own" ON public.user_activity
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Service role can do everything (for analytics)
CREATE POLICY "user_activity_service_all" ON public.user_activity
  FOR ALL USING (auth.role() = 'service_role');

-- Grant access
GRANT ALL ON public.user_activity TO authenticated;
GRANT ALL ON public.user_activity TO service_role;

-- Indexes for analytics queries
CREATE INDEX IF NOT EXISTS user_activity_user_id_idx ON public.user_activity(user_id);
CREATE INDEX IF NOT EXISTS user_activity_type_idx ON public.user_activity(activity_type);
CREATE INDEX IF NOT EXISTS user_activity_created_idx ON public.user_activity(created_at DESC);
CREATE INDEX IF NOT EXISTS user_activity_page_url_idx ON public.user_activity(page_url);

-- Add last_seen column to sg_users if not exists
ALTER TABLE public.sg_users ADD COLUMN IF NOT EXISTS last_seen TIMESTAMPTZ;
