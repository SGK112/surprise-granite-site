-- =============================================
-- USER ROLES & SUBSCRIPTION SYSTEM
-- Run this in Supabase SQL Editor
-- =============================================

-- Add role to profiles table
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS user_role TEXT DEFAULT 'customer'
  CHECK (user_role IN ('customer', 'contractor', 'vendor', 'admin'));

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS subscription_tier TEXT DEFAULT 'free'
  CHECK (subscription_tier IN ('free', 'starter', 'professional', 'enterprise'));

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS subscription_status TEXT DEFAULT 'active'
  CHECK (subscription_status IN ('active', 'trial', 'past_due', 'cancelled'));

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS trial_ends_at TIMESTAMPTZ;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS subscription_ends_at TIMESTAMPTZ;

-- Company/Business info for contractors & vendors
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS company_name TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS company_logo TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS business_type TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS license_number TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS years_in_business INTEGER;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS service_area TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS bio TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS website TEXT;

-- Trust & Reputation
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS trust_score INTEGER DEFAULT 0;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS verified BOOLEAN DEFAULT false;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS verified_at TIMESTAMPTZ;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS total_reviews INTEGER DEFAULT 0;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS average_rating DECIMAL(2,1) DEFAULT 0;

-- Feature flags per role (what they can access)
CREATE TABLE IF NOT EXISTS public.role_permissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  role TEXT NOT NULL,
  feature TEXT NOT NULL,
  enabled BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(role, feature)
);

-- Insert default permissions
INSERT INTO public.role_permissions (role, feature, enabled) VALUES
  -- Customer permissions
  ('customer', 'view_own_jobs', true),
  ('customer', 'view_estimates', true),
  ('customer', 'approve_estimates', true),
  ('customer', 'pay_invoices', true),
  ('customer', 'message_team', true),
  ('customer', 'view_calendar', true),
  ('customer', 'upload_files', true),
  ('customer', 'leave_reviews', true),
  ('customer', 'view_contractors', false),
  ('customer', 'create_jobs', false),
  ('customer', 'send_estimates', false),
  ('customer', 'ai_tools', false),

  -- Contractor permissions
  ('contractor', 'view_own_jobs', true),
  ('contractor', 'view_estimates', true),
  ('contractor', 'approve_estimates', true),
  ('contractor', 'pay_invoices', true),
  ('contractor', 'message_team', true),
  ('contractor', 'view_calendar', true),
  ('contractor', 'upload_files', true),
  ('contractor', 'leave_reviews', true),
  ('contractor', 'view_contractors', true),
  ('contractor', 'create_jobs', true),
  ('contractor', 'send_estimates', true),
  ('contractor', 'ai_tools', true),
  ('contractor', 'manage_customers', true),
  ('contractor', 'view_leads', true),
  ('contractor', 'hire_subcontractors', true),
  ('contractor', 'analytics', true),

  -- Vendor permissions
  ('vendor', 'list_products', true),
  ('vendor', 'receive_orders', true),
  ('vendor', 'view_analytics', true),
  ('vendor', 'message_team', true),
  ('vendor', 'manage_inventory', true),
  ('vendor', 'connect_contractors', true),

  -- Admin permissions (everything)
  ('admin', 'full_access', true)
ON CONFLICT (role, feature) DO NOTHING;

-- Reviews table
CREATE TABLE IF NOT EXISTS public.reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Who is being reviewed
  reviewed_user_id UUID REFERENCES auth.users(id),
  reviewed_contractor_id UUID REFERENCES public.contractors(id),

  -- Who wrote the review
  reviewer_id UUID NOT NULL REFERENCES auth.users(id),

  -- Review details
  job_id UUID REFERENCES public.jobs(id),
  rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
  title TEXT,
  content TEXT,

  -- Categories
  quality_rating INTEGER CHECK (quality_rating >= 1 AND quality_rating <= 5),
  communication_rating INTEGER CHECK (communication_rating >= 1 AND communication_rating <= 5),
  timeliness_rating INTEGER CHECK (timeliness_rating >= 1 AND timeliness_rating <= 5),
  value_rating INTEGER CHECK (value_rating >= 1 AND value_rating <= 5),

  -- Status
  status TEXT DEFAULT 'published' CHECK (status IN ('pending', 'published', 'hidden', 'flagged')),

  -- Response
  response TEXT,
  response_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.reviews ENABLE ROW LEVEL SECURITY;

CREATE POLICY "reviews_select" ON public.reviews
  FOR SELECT USING (status = 'published' OR reviewer_id = auth.uid() OR reviewed_user_id = auth.uid());

CREATE POLICY "reviews_insert" ON public.reviews
  FOR INSERT WITH CHECK (auth.uid() = reviewer_id);

CREATE POLICY "reviews_update_own" ON public.reviews
  FOR UPDATE USING (auth.uid() = reviewer_id OR auth.uid() = reviewed_user_id);

-- Function to update user's average rating
CREATE OR REPLACE FUNCTION update_user_rating()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE public.profiles
  SET
    total_reviews = (SELECT COUNT(*) FROM public.reviews WHERE reviewed_user_id = NEW.reviewed_user_id AND status = 'published'),
    average_rating = (SELECT ROUND(AVG(rating)::numeric, 1) FROM public.reviews WHERE reviewed_user_id = NEW.reviewed_user_id AND status = 'published')
  WHERE id = NEW.reviewed_user_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trigger_update_user_rating
  AFTER INSERT OR UPDATE ON public.reviews
  FOR EACH ROW EXECUTE FUNCTION update_user_rating();

-- Leads table (for contractors to receive/manage leads)
CREATE TABLE IF NOT EXISTS public.leads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Lead info
  name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  address TEXT,
  city TEXT,
  state TEXT,
  zip TEXT,

  -- Project details
  project_type TEXT,
  description TEXT,
  budget_range TEXT,
  timeline TEXT,

  -- Source
  source TEXT DEFAULT 'website' CHECK (source IN ('website', 'referral', 'google', 'social', 'other')),
  source_details TEXT,

  -- Assignment
  assigned_to UUID REFERENCES auth.users(id),
  claimed_at TIMESTAMPTZ,

  -- Status
  status TEXT DEFAULT 'new' CHECK (status IN ('new', 'contacted', 'qualified', 'proposal_sent', 'won', 'lost', 'archived')),

  -- Notes
  notes TEXT,

  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.leads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "leads_select_own" ON public.leads
  FOR SELECT USING (assigned_to = auth.uid() OR assigned_to IS NULL);

CREATE POLICY "leads_update_own" ON public.leads
  FOR UPDATE USING (assigned_to = auth.uid());

-- Indexes
CREATE INDEX IF NOT EXISTS idx_profiles_role ON public.profiles(user_role);
CREATE INDEX IF NOT EXISTS idx_profiles_subscription ON public.profiles(subscription_tier);
CREATE INDEX IF NOT EXISTS idx_reviews_reviewed ON public.reviews(reviewed_user_id);
CREATE INDEX IF NOT EXISTS idx_leads_assigned ON public.leads(assigned_to);
CREATE INDEX IF NOT EXISTS idx_leads_status ON public.leads(status);

SELECT 'User roles and subscription system migration complete!' as status;
