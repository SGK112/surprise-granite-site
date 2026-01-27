-- =====================================================
-- SURPRISE GRANITE VENDOR ECOSYSTEM DATABASE SCHEMA
-- Run this in Supabase SQL Editor
-- =====================================================

-- Enable UUID extension if not already enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =====================================================
-- 1. SUBSCRIPTION PLANS
-- =====================================================
CREATE TABLE IF NOT EXISTS subscription_plans (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL UNIQUE, -- 'starter', 'basic', 'plus', 'pro'
  display_name TEXT NOT NULL,
  price_monthly DECIMAL(10,2) NOT NULL,
  price_annual DECIMAL(10,2),
  stripe_price_id_monthly TEXT,
  stripe_price_id_annual TEXT,

  -- Features
  leads_per_month INTEGER, -- NULL = unlimited (capped at 50)
  lead_cost_extra DECIMAL(6,2) DEFAULT 15.00, -- Cost per lead over limit
  directory_listing BOOLEAN DEFAULT true,
  verified_badge BOOLEAN DEFAULT false,
  featured_reviews INTEGER DEFAULT 0,
  booking_links INTEGER DEFAULT 0,
  keywords INTEGER DEFAULT 0,
  faqs INTEGER DEFAULT 0,
  products_display INTEGER DEFAULT 0,
  video_section BOOLEAN DEFAULT false,
  remove_competitor_ads BOOLEAN DEFAULT false,
  marketplace_commission DECIMAL(4,2) DEFAULT 10.00, -- Percentage
  lead_priority TEXT DEFAULT 'standard', -- 'none', 'standard', 'priority', 'first'

  is_active BOOLEAN DEFAULT true,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Insert default plans
INSERT INTO subscription_plans (name, display_name, price_monthly, price_annual, leads_per_month, lead_cost_extra, verified_badge, featured_reviews, booking_links, keywords, faqs, products_display, video_section, remove_competitor_ads, marketplace_commission, lead_priority, sort_order) VALUES
  ('starter', 'Starter', 0.00, 0.00, 0, 15.00, false, 0, 0, 0, 0, 0, false, false, 10.00, 'none', 1),
  ('basic', 'Basic', 9.99, 95.90, 3, 12.00, true, 1, 1, 10, 5, 5, false, false, 8.00, 'standard', 2),
  ('designer', 'Designer Pro', 14.99, 143.90, 5, 10.00, true, 2, 2, 15, 8, 8, false, false, 7.00, 'standard', 3),
  ('plus', 'Plus', 19.99, 191.90, 10, 8.00, true, 3, 3, 20, 10, 10, true, true, 5.00, 'priority', 4),
  ('pro', 'Pro', 29.99, 287.90, 50, 0.00, true, 6, 6, 40, 15, 20, true, true, 3.00, 'first', 5)
ON CONFLICT (name) DO NOTHING;

-- =====================================================
-- 2. VENDOR PROFILES
-- =====================================================
CREATE TABLE IF NOT EXISTS vendor_profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Business Info
  business_name TEXT NOT NULL,
  business_type TEXT NOT NULL CHECK (business_type IN ('fabricator', 'installer', 'fab_installer', 'designer', 'contractor', 'supplier', 'manufacturer', 'distributor')),
  slug TEXT UNIQUE, -- URL-friendly name

  -- Contact Info
  contact_name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT NOT NULL,
  website TEXT,

  -- Location
  address_line1 TEXT,
  address_line2 TEXT,
  city TEXT NOT NULL,
  state TEXT NOT NULL DEFAULT 'AZ',
  zip_code TEXT NOT NULL,
  latitude DECIMAL(10, 8),
  longitude DECIMAL(11, 8),

  -- Service Area
  service_radius_miles INTEGER DEFAULT 50,

  -- Verification
  license_number TEXT,
  license_state TEXT DEFAULT 'AZ',
  license_doc_url TEXT,
  insurance_doc_url TEXT,
  w9_doc_url TEXT,
  verification_status TEXT DEFAULT 'pending' CHECK (verification_status IN ('pending', 'submitted', 'verified', 'rejected', 'expired')),
  verified_at TIMESTAMPTZ,
  verified_by UUID,
  rejection_reason TEXT,

  -- Business Details
  years_in_business INTEGER,
  employees_count TEXT, -- '1-5', '6-10', '11-25', '26-50', '50+'
  logo_url TEXT,
  cover_image_url TEXT,
  description TEXT,
  tagline TEXT,
  specialties TEXT[], -- Array: ['granite', 'quartz', 'marble', 'tile']
  materials_worked TEXT[], -- Array: ['countertops', 'flooring', 'backsplash']

  -- Social & Reviews
  google_place_id TEXT,
  google_review_url TEXT,
  yelp_url TEXT,
  houzz_url TEXT,
  facebook_url TEXT,
  instagram_url TEXT,
  average_rating DECIMAL(2,1) DEFAULT 0,
  review_count INTEGER DEFAULT 0,

  -- Profile Completion
  profile_complete BOOLEAN DEFAULT false,
  onboarding_step INTEGER DEFAULT 1, -- Track onboarding progress

  -- Stats
  total_leads_received INTEGER DEFAULT 0,
  total_jobs_won INTEGER DEFAULT 0,
  total_revenue DECIMAL(12,2) DEFAULT 0,

  -- Status
  is_active BOOLEAN DEFAULT true,
  is_featured BOOLEAN DEFAULT false,
  featured_until TIMESTAMPTZ,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create slug automatically
CREATE OR REPLACE FUNCTION generate_vendor_slug()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.slug IS NULL THEN
    NEW.slug := LOWER(REGEXP_REPLACE(NEW.business_name, '[^a-zA-Z0-9]+', '-', 'g'));
    -- Add random suffix if exists
    IF EXISTS (SELECT 1 FROM vendor_profiles WHERE slug = NEW.slug AND id != NEW.id) THEN
      NEW.slug := NEW.slug || '-' || SUBSTRING(NEW.id::TEXT, 1, 8);
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER vendor_slug_trigger
  BEFORE INSERT OR UPDATE ON vendor_profiles
  FOR EACH ROW EXECUTE FUNCTION generate_vendor_slug();

-- Update timestamp trigger
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER vendor_profiles_updated_at
  BEFORE UPDATE ON vendor_profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- =====================================================
-- 3. VENDOR SUBSCRIPTIONS
-- =====================================================
CREATE TABLE IF NOT EXISTS vendor_subscriptions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  vendor_id UUID NOT NULL REFERENCES vendor_profiles(id) ON DELETE CASCADE,
  plan_id UUID NOT NULL REFERENCES subscription_plans(id),

  -- Stripe
  stripe_customer_id TEXT,
  stripe_subscription_id TEXT,
  stripe_connect_account_id TEXT, -- For receiving payouts

  -- Billing
  billing_cycle TEXT DEFAULT 'monthly' CHECK (billing_cycle IN ('monthly', 'annual')),
  current_period_start TIMESTAMPTZ,
  current_period_end TIMESTAMPTZ,

  -- Status
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'past_due', 'canceled', 'paused', 'trialing', 'incomplete')),
  trial_ends_at TIMESTAMPTZ,
  canceled_at TIMESTAMPTZ,
  cancel_reason TEXT,

  -- Usage
  leads_used_this_period INTEGER DEFAULT 0,
  leads_purchased_extra INTEGER DEFAULT 0,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(vendor_id)
);

CREATE TRIGGER vendor_subscriptions_updated_at
  BEFORE UPDATE ON vendor_subscriptions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- =====================================================
-- 4. SERVICE AREAS (ZIP Code Coverage)
-- =====================================================
CREATE TABLE IF NOT EXISTS service_areas (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  vendor_id UUID NOT NULL REFERENCES vendor_profiles(id) ON DELETE CASCADE,
  zip_code TEXT NOT NULL,
  city TEXT,
  county TEXT,
  state TEXT DEFAULT 'AZ',
  priority INTEGER DEFAULT 1, -- Higher = preferred area
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(vendor_id, zip_code)
);

-- Index for fast ZIP lookup
CREATE INDEX IF NOT EXISTS idx_service_areas_zip ON service_areas(zip_code) WHERE is_active = true;

-- =====================================================
-- 5. LEADS
-- =====================================================
CREATE TABLE IF NOT EXISTS vendor_leads (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

  -- Homeowner Info
  homeowner_name TEXT NOT NULL,
  homeowner_email TEXT NOT NULL,
  homeowner_phone TEXT,

  -- Project Details
  project_type TEXT NOT NULL, -- 'countertop', 'flooring', 'bathroom', 'kitchen', 'full_remodel'
  project_subtype TEXT, -- 'granite', 'quartz', 'lvp', etc.
  project_description TEXT,
  project_budget TEXT, -- '$2k-5k', '$5k-10k', '$10k-20k', '$20k-50k', '$50k+'
  project_timeline TEXT, -- 'asap', '1_month', '1_3_months', '3_6_months', 'planning'

  -- Location
  project_zip TEXT NOT NULL,
  project_city TEXT,
  project_state TEXT DEFAULT 'AZ',
  project_address TEXT,

  -- Lead Source
  source TEXT, -- 'estimate_form', 'calculator', 'contact', 'chat', 'marketplace', 'referral'
  source_page TEXT,
  source_url TEXT,
  utm_source TEXT,
  utm_medium TEXT,
  utm_campaign TEXT,
  referrer_url TEXT,

  -- Distribution
  status TEXT DEFAULT 'new' CHECK (status IN ('new', 'processing', 'distributed', 'sold', 'expired', 'invalid', 'duplicate')),
  quality_score INTEGER DEFAULT 50 CHECK (quality_score BETWEEN 1 AND 100),

  -- Pricing
  lead_price DECIMAL(8,2),
  lead_tier TEXT DEFAULT 'standard', -- 'standard', 'premium', 'exclusive'

  -- Matching
  matched_vendor_count INTEGER DEFAULT 0,
  distributed_at TIMESTAMPTZ,

  -- Validation
  email_valid BOOLEAN,
  phone_valid BOOLEAN,
  is_duplicate BOOLEAN DEFAULT false,
  duplicate_of UUID REFERENCES vendor_leads(id),

  created_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ DEFAULT NOW() + INTERVAL '72 hours',

  -- Indexes
  CONSTRAINT valid_lead CHECK (homeowner_email IS NOT NULL OR homeowner_phone IS NOT NULL)
);

-- Indexes for lead routing
CREATE INDEX IF NOT EXISTS idx_vendor_leads_zip ON vendor_leads(project_zip) WHERE status = 'new';
CREATE INDEX IF NOT EXISTS idx_vendor_leads_status ON vendor_leads(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_vendor_leads_type ON vendor_leads(project_type, project_zip);

-- =====================================================
-- 6. LEAD DISTRIBUTION (Which vendors got which leads)
-- =====================================================
CREATE TABLE IF NOT EXISTS lead_distributions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  lead_id UUID NOT NULL REFERENCES vendor_leads(id) ON DELETE CASCADE,
  vendor_id UUID NOT NULL REFERENCES vendor_profiles(id) ON DELETE CASCADE,

  -- Distribution Details
  distribution_type TEXT NOT NULL CHECK (distribution_type IN ('subscription', 'purchased', 'exclusive')),
  priority_rank INTEGER, -- 1 = first access

  -- Pricing
  price_charged DECIMAL(8,2) NOT NULL DEFAULT 0,
  from_subscription BOOLEAN DEFAULT false,

  -- Status Tracking
  status TEXT DEFAULT 'delivered' CHECK (status IN ('delivered', 'viewed', 'contacted', 'quoted', 'won', 'lost', 'no_response', 'invalid')),

  -- Vendor Actions
  viewed_at TIMESTAMPTZ,
  first_contact_at TIMESTAMPTZ,
  quote_sent_at TIMESTAMPTZ,
  outcome_at TIMESTAMPTZ,

  -- Outcome Details
  vendor_notes TEXT,
  job_value DECIMAL(12,2), -- If won, what was the job worth
  feedback TEXT,
  rating INTEGER CHECK (rating BETWEEN 1 AND 5), -- Lead quality rating

  -- Notifications
  email_sent BOOLEAN DEFAULT false,
  email_sent_at TIMESTAMPTZ,
  sms_sent BOOLEAN DEFAULT false,
  sms_sent_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(lead_id, vendor_id)
);

CREATE TRIGGER lead_distributions_updated_at
  BEFORE UPDATE ON lead_distributions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- =====================================================
-- 7. VENDOR DOCUMENTS
-- =====================================================
CREATE TABLE IF NOT EXISTS vendor_documents (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  vendor_id UUID NOT NULL REFERENCES vendor_profiles(id) ON DELETE CASCADE,
  document_type TEXT NOT NULL CHECK (document_type IN ('license', 'insurance', 'w9', 'portfolio', 'certification', 'bond', 'other')),

  -- File Info
  file_name TEXT NOT NULL,
  file_url TEXT NOT NULL,
  file_size INTEGER,
  mime_type TEXT,

  -- Verification
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'expired')),
  reviewed_by UUID,
  reviewed_at TIMESTAMPTZ,
  rejection_reason TEXT,

  -- Expiration
  issue_date DATE,
  expires_at DATE,
  expiry_notified BOOLEAN DEFAULT false,

  uploaded_at TIMESTAMPTZ DEFAULT NOW()
);

-- =====================================================
-- 8. TRANSACTIONS
-- =====================================================
CREATE TABLE IF NOT EXISTS vendor_transactions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  vendor_id UUID REFERENCES vendor_profiles(id),

  -- Transaction Type
  type TEXT NOT NULL CHECK (type IN ('subscription', 'lead_purchase', 'marketplace_sale', 'marketplace_commission', 'featured_listing', 'payout', 'refund')),
  direction TEXT NOT NULL CHECK (direction IN ('credit', 'debit')), -- credit = money in, debit = money out

  -- Amounts
  amount DECIMAL(10,2) NOT NULL,
  platform_fee DECIMAL(10,2) DEFAULT 0,
  net_amount DECIMAL(10,2) NOT NULL,
  currency TEXT DEFAULT 'usd',

  -- References
  reference_type TEXT, -- 'subscription', 'lead', 'listing', 'plan'
  reference_id UUID,

  -- Stripe
  stripe_payment_intent_id TEXT,
  stripe_charge_id TEXT,
  stripe_invoice_id TEXT,
  stripe_transfer_id TEXT,

  -- Status
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'failed', 'refunded', 'disputed')),

  description TEXT,
  metadata JSONB,

  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for vendor transaction history
CREATE INDEX IF NOT EXISTS idx_vendor_transactions_vendor ON vendor_transactions(vendor_id, created_at DESC);

-- =====================================================
-- 9. ROW LEVEL SECURITY POLICIES
-- =====================================================

-- Enable RLS
ALTER TABLE vendor_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE vendor_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE service_areas ENABLE ROW LEVEL SECURITY;
ALTER TABLE vendor_leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE lead_distributions ENABLE ROW LEVEL SECURITY;
ALTER TABLE vendor_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE vendor_transactions ENABLE ROW LEVEL SECURITY;

-- Vendor Profiles: Vendors can view/edit their own, public can view active verified
CREATE POLICY "Vendors can view own profile" ON vendor_profiles
  FOR SELECT USING (auth.uid() = id);

CREATE POLICY "Vendors can update own profile" ON vendor_profiles
  FOR UPDATE USING (auth.uid() = id);

CREATE POLICY "Public can view active verified vendors" ON vendor_profiles
  FOR SELECT USING (is_active = true AND verification_status = 'verified');

CREATE POLICY "Vendors can insert own profile" ON vendor_profiles
  FOR INSERT WITH CHECK (auth.uid() = id);

-- Vendor Subscriptions: Vendors see their own
CREATE POLICY "Vendors can view own subscription" ON vendor_subscriptions
  FOR SELECT USING (vendor_id = auth.uid());

CREATE POLICY "Vendors can update own subscription" ON vendor_subscriptions
  FOR UPDATE USING (vendor_id = auth.uid());

-- Service Areas: Vendors manage their own
CREATE POLICY "Vendors manage own service areas" ON service_areas
  FOR ALL USING (vendor_id = auth.uid());

-- Leads: Vendors only see leads distributed to them
CREATE POLICY "Vendors see distributed leads" ON vendor_leads
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM lead_distributions
      WHERE lead_id = vendor_leads.id
      AND vendor_id = auth.uid()
    )
  );

-- Lead Distributions: Vendors see their own distributions
CREATE POLICY "Vendors see own lead distributions" ON lead_distributions
  FOR SELECT USING (vendor_id = auth.uid());

CREATE POLICY "Vendors update own lead distributions" ON lead_distributions
  FOR UPDATE USING (vendor_id = auth.uid());

-- Documents: Vendors manage their own
CREATE POLICY "Vendors manage own documents" ON vendor_documents
  FOR ALL USING (vendor_id = auth.uid());

-- Transactions: Vendors see their own
CREATE POLICY "Vendors see own transactions" ON vendor_transactions
  FOR SELECT USING (vendor_id = auth.uid());

-- =====================================================
-- 10. SERVICE ROLE POLICIES (for admin/backend)
-- =====================================================

-- Allow service role full access (for backend operations)
CREATE POLICY "Service role full access to vendor_profiles" ON vendor_profiles
  FOR ALL USING (auth.jwt() ->> 'role' = 'service_role');

CREATE POLICY "Service role full access to vendor_subscriptions" ON vendor_subscriptions
  FOR ALL USING (auth.jwt() ->> 'role' = 'service_role');

CREATE POLICY "Service role full access to vendor_leads" ON vendor_leads
  FOR ALL USING (auth.jwt() ->> 'role' = 'service_role');

CREATE POLICY "Service role full access to lead_distributions" ON lead_distributions
  FOR ALL USING (auth.jwt() ->> 'role' = 'service_role');

CREATE POLICY "Service role full access to vendor_transactions" ON vendor_transactions
  FOR ALL USING (auth.jwt() ->> 'role' = 'service_role');

-- =====================================================
-- 11. HELPER FUNCTIONS
-- =====================================================

-- Get vendors serving a ZIP code
CREATE OR REPLACE FUNCTION get_vendors_for_zip(target_zip TEXT)
RETURNS TABLE (
  vendor_id UUID,
  business_name TEXT,
  plan_name TEXT,
  lead_priority TEXT,
  leads_remaining INTEGER
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    vp.id as vendor_id,
    vp.business_name,
    sp.name as plan_name,
    sp.lead_priority,
    CASE
      WHEN sp.leads_per_month IS NULL THEN 999
      ELSE sp.leads_per_month - COALESCE(vs.leads_used_this_period, 0)
    END as leads_remaining
  FROM vendor_profiles vp
  JOIN service_areas sa ON sa.vendor_id = vp.id
  JOIN vendor_subscriptions vs ON vs.vendor_id = vp.id
  JOIN subscription_plans sp ON sp.id = vs.plan_id
  WHERE sa.zip_code = target_zip
    AND sa.is_active = true
    AND vp.is_active = true
    AND vs.status = 'active'
    AND (sp.leads_per_month IS NULL OR vs.leads_used_this_period < sp.leads_per_month)
  ORDER BY
    CASE sp.lead_priority
      WHEN 'first' THEN 1
      WHEN 'priority' THEN 2
      WHEN 'standard' THEN 3
      ELSE 4
    END,
    sa.priority DESC;
END;
$$ LANGUAGE plpgsql;

-- Increment lead usage for subscription
CREATE OR REPLACE FUNCTION increment_lead_usage(p_vendor_id UUID)
RETURNS VOID AS $$
BEGIN
  UPDATE vendor_subscriptions
  SET leads_used_this_period = leads_used_this_period + 1,
      updated_at = NOW()
  WHERE vendor_id = p_vendor_id;

  UPDATE vendor_profiles
  SET total_leads_received = total_leads_received + 1,
      updated_at = NOW()
  WHERE id = p_vendor_id;
END;
$$ LANGUAGE plpgsql;

-- Reset monthly lead counts (run via cron)
CREATE OR REPLACE FUNCTION reset_monthly_lead_counts()
RETURNS VOID AS $$
BEGIN
  UPDATE vendor_subscriptions
  SET leads_used_this_period = 0,
      leads_purchased_extra = 0,
      updated_at = NOW()
  WHERE status = 'active';
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- DONE! Run this in Supabase SQL Editor
-- =====================================================
