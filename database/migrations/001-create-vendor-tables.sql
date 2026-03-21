-- =====================================================
-- VENDOR ECOSYSTEM TABLES MIGRATION
-- Run this in Supabase SQL Editor: https://supabase.com/dashboard
-- Project: ypeypgwsycxcagncgdur
-- =====================================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =====================================================
-- 1. VENDOR PROFILES
-- =====================================================
CREATE TABLE IF NOT EXISTS vendor_profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  business_name TEXT NOT NULL,
  business_type TEXT NOT NULL CHECK (business_type IN ('fabricator', 'installer', 'fab_installer', 'designer', 'contractor', 'supplier', 'manufacturer', 'distributor')),
  slug TEXT UNIQUE,
  contact_name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT NOT NULL,
  website TEXT,
  address_line1 TEXT,
  address_line2 TEXT,
  city TEXT NOT NULL,
  state TEXT NOT NULL DEFAULT 'AZ',
  zip_code TEXT NOT NULL,
  latitude DECIMAL(10, 8),
  longitude DECIMAL(11, 8),
  service_radius_miles INTEGER DEFAULT 50,
  license_number TEXT,
  license_state TEXT DEFAULT 'AZ',
  license_doc_url TEXT,
  insurance_doc_url TEXT,
  w9_doc_url TEXT,
  verification_status TEXT DEFAULT 'pending' CHECK (verification_status IN ('pending', 'submitted', 'verified', 'rejected', 'expired')),
  verified_at TIMESTAMPTZ,
  verified_by UUID,
  rejection_reason TEXT,
  years_in_business INTEGER,
  employees_count TEXT,
  logo_url TEXT,
  cover_image_url TEXT,
  description TEXT,
  tagline TEXT,
  specialties TEXT[],
  materials_worked TEXT[],
  google_place_id TEXT,
  google_review_url TEXT,
  yelp_url TEXT,
  houzz_url TEXT,
  facebook_url TEXT,
  instagram_url TEXT,
  average_rating DECIMAL(2,1) DEFAULT 0,
  review_count INTEGER DEFAULT 0,
  profile_complete BOOLEAN DEFAULT false,
  onboarding_step INTEGER DEFAULT 1,
  total_leads_received INTEGER DEFAULT 0,
  total_jobs_won INTEGER DEFAULT 0,
  total_revenue DECIMAL(12,2) DEFAULT 0,
  is_active BOOLEAN DEFAULT false,
  is_featured BOOLEAN DEFAULT false,
  featured_until TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Auto-generate slug
CREATE OR REPLACE FUNCTION generate_vendor_slug()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.slug IS NULL THEN
    NEW.slug := LOWER(REGEXP_REPLACE(NEW.business_name, '[^a-zA-Z0-9]+', '-', 'g'));
    IF EXISTS (SELECT 1 FROM vendor_profiles WHERE slug = NEW.slug AND id != NEW.id) THEN
      NEW.slug := NEW.slug || '-' || SUBSTRING(NEW.id::TEXT, 1, 8);
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'vendor_slug_trigger') THEN
    CREATE TRIGGER vendor_slug_trigger
      BEFORE INSERT OR UPDATE ON vendor_profiles
      FOR EACH ROW EXECUTE FUNCTION generate_vendor_slug();
  END IF;
END $$;

-- Updated_at trigger (safe — won't fail if function already exists)
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'vendor_profiles_updated_at') THEN
    CREATE TRIGGER vendor_profiles_updated_at
      BEFORE UPDATE ON vendor_profiles
      FOR EACH ROW EXECUTE FUNCTION update_updated_at();
  END IF;
END $$;

-- =====================================================
-- 2. SERVICE AREAS
-- =====================================================
CREATE TABLE IF NOT EXISTS service_areas (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  vendor_id UUID NOT NULL REFERENCES vendor_profiles(id) ON DELETE CASCADE,
  zip_code TEXT NOT NULL,
  city TEXT,
  county TEXT,
  state TEXT DEFAULT 'AZ',
  priority INTEGER DEFAULT 1,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(vendor_id, zip_code)
);

CREATE INDEX IF NOT EXISTS idx_service_areas_zip ON service_areas(zip_code) WHERE is_active = true;

-- =====================================================
-- 3. VENDOR SUBSCRIPTIONS
-- =====================================================
CREATE TABLE IF NOT EXISTS vendor_subscriptions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  vendor_id UUID NOT NULL REFERENCES vendor_profiles(id) ON DELETE CASCADE,
  plan_id UUID NOT NULL REFERENCES subscription_plans(id),
  stripe_customer_id TEXT,
  stripe_subscription_id TEXT,
  stripe_connect_account_id TEXT,
  billing_cycle TEXT DEFAULT 'monthly' CHECK (billing_cycle IN ('monthly', 'annual')),
  current_period_start TIMESTAMPTZ,
  current_period_end TIMESTAMPTZ,
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'past_due', 'canceled', 'paused', 'trialing', 'incomplete')),
  trial_ends_at TIMESTAMPTZ,
  canceled_at TIMESTAMPTZ,
  cancel_reason TEXT,
  leads_used_this_period INTEGER DEFAULT 0,
  leads_purchased_extra INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(vendor_id)
);

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'vendor_subscriptions_updated_at') THEN
    CREATE TRIGGER vendor_subscriptions_updated_at
      BEFORE UPDATE ON vendor_subscriptions
      FOR EACH ROW EXECUTE FUNCTION update_updated_at();
  END IF;
END $$;

-- =====================================================
-- 4. VENDOR LEADS
-- =====================================================
CREATE TABLE IF NOT EXISTS vendor_leads (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  homeowner_name TEXT NOT NULL,
  homeowner_email TEXT NOT NULL,
  homeowner_phone TEXT,
  project_type TEXT NOT NULL,
  project_subtype TEXT,
  project_description TEXT,
  project_budget TEXT,
  project_timeline TEXT,
  project_zip TEXT NOT NULL,
  project_city TEXT,
  project_state TEXT DEFAULT 'AZ',
  project_address TEXT,
  source TEXT,
  source_page TEXT,
  source_url TEXT,
  utm_source TEXT,
  utm_medium TEXT,
  utm_campaign TEXT,
  referrer_url TEXT,
  status TEXT DEFAULT 'new' CHECK (status IN ('new', 'processing', 'distributed', 'sold', 'expired', 'invalid', 'duplicate')),
  quality_score INTEGER DEFAULT 50 CHECK (quality_score BETWEEN 1 AND 100),
  lead_price DECIMAL(8,2),
  lead_tier TEXT DEFAULT 'standard',
  matched_vendor_count INTEGER DEFAULT 0,
  distributed_at TIMESTAMPTZ,
  email_valid BOOLEAN,
  phone_valid BOOLEAN,
  is_duplicate BOOLEAN DEFAULT false,
  duplicate_of UUID REFERENCES vendor_leads(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ DEFAULT NOW() + INTERVAL '72 hours',
  CONSTRAINT valid_lead CHECK (homeowner_email IS NOT NULL OR homeowner_phone IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS idx_vendor_leads_zip ON vendor_leads(project_zip) WHERE status = 'new';
CREATE INDEX IF NOT EXISTS idx_vendor_leads_status ON vendor_leads(status, created_at DESC);

-- =====================================================
-- 5. LEAD DISTRIBUTIONS
-- =====================================================
CREATE TABLE IF NOT EXISTS lead_distributions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  lead_id UUID NOT NULL REFERENCES vendor_leads(id) ON DELETE CASCADE,
  vendor_id UUID NOT NULL REFERENCES vendor_profiles(id) ON DELETE CASCADE,
  distribution_type TEXT NOT NULL CHECK (distribution_type IN ('subscription', 'purchased', 'exclusive')),
  priority_rank INTEGER,
  price_charged DECIMAL(8,2) NOT NULL DEFAULT 0,
  from_subscription BOOLEAN DEFAULT false,
  status TEXT DEFAULT 'delivered' CHECK (status IN ('delivered', 'viewed', 'contacted', 'quoted', 'won', 'lost', 'no_response', 'invalid')),
  viewed_at TIMESTAMPTZ,
  first_contact_at TIMESTAMPTZ,
  quote_sent_at TIMESTAMPTZ,
  outcome_at TIMESTAMPTZ,
  vendor_notes TEXT,
  job_value DECIMAL(12,2),
  feedback TEXT,
  rating INTEGER CHECK (rating BETWEEN 1 AND 5),
  email_sent BOOLEAN DEFAULT false,
  email_sent_at TIMESTAMPTZ,
  sms_sent BOOLEAN DEFAULT false,
  sms_sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(lead_id, vendor_id)
);

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'lead_distributions_updated_at') THEN
    CREATE TRIGGER lead_distributions_updated_at
      BEFORE UPDATE ON lead_distributions
      FOR EACH ROW EXECUTE FUNCTION update_updated_at();
  END IF;
END $$;

-- =====================================================
-- 6. ROW LEVEL SECURITY
-- =====================================================

ALTER TABLE vendor_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE vendor_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE service_areas ENABLE ROW LEVEL SECURITY;
ALTER TABLE vendor_leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE lead_distributions ENABLE ROW LEVEL SECURITY;

-- Vendor Profiles
CREATE POLICY "Vendors can view own profile" ON vendor_profiles
  FOR SELECT USING (auth.uid() = id);

CREATE POLICY "Vendors can update own profile" ON vendor_profiles
  FOR UPDATE USING (auth.uid() = id);

CREATE POLICY "Public can view active verified vendors" ON vendor_profiles
  FOR SELECT USING (is_active = true AND verification_status = 'verified');

CREATE POLICY "Vendors can insert own profile" ON vendor_profiles
  FOR INSERT WITH CHECK (auth.uid() = id);

-- Service role full access
CREATE POLICY "Service role full access to vendor_profiles" ON vendor_profiles
  FOR ALL USING (auth.jwt() ->> 'role' = 'service_role');

-- Subscriptions
CREATE POLICY "Vendors can view own subscription" ON vendor_subscriptions
  FOR SELECT USING (vendor_id = auth.uid());

CREATE POLICY "Vendors can update own subscription" ON vendor_subscriptions
  FOR UPDATE USING (vendor_id = auth.uid());

CREATE POLICY "Service role full access to vendor_subscriptions" ON vendor_subscriptions
  FOR ALL USING (auth.jwt() ->> 'role' = 'service_role');

-- Service Areas
CREATE POLICY "Vendors manage own service areas" ON service_areas
  FOR ALL USING (vendor_id = auth.uid());

-- Leads
CREATE POLICY "Vendors see distributed leads" ON vendor_leads
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM lead_distributions
      WHERE lead_id = vendor_leads.id
      AND vendor_id = auth.uid()
    )
  );

CREATE POLICY "Service role full access to vendor_leads" ON vendor_leads
  FOR ALL USING (auth.jwt() ->> 'role' = 'service_role');

-- Lead Distributions
CREATE POLICY "Vendors see own lead distributions" ON lead_distributions
  FOR SELECT USING (vendor_id = auth.uid());

CREATE POLICY "Vendors update own lead distributions" ON lead_distributions
  FOR UPDATE USING (vendor_id = auth.uid());

CREATE POLICY "Service role full access to lead_distributions" ON lead_distributions
  FOR ALL USING (auth.jwt() ->> 'role' = 'service_role');
