-- ============================================================
-- SURPRISE GRANITE - PRO-CUSTOMER LINKING SYSTEM
-- Complete schema for pro users to manage their customers
-- Run in Supabase SQL Editor
-- ============================================================

-- ============================================================
-- 1. ADD SUPER ADMIN / GOD MODE TO SG_USERS
-- ============================================================

-- Add role column if not exists
ALTER TABLE public.sg_users
ADD COLUMN IF NOT EXISTS role TEXT DEFAULT 'user'
CHECK (role IN ('user', 'pro', 'admin', 'super_admin'));

-- Add pro-specific fields
ALTER TABLE public.sg_users
ADD COLUMN IF NOT EXISTS pro_subscription_tier TEXT DEFAULT 'free'
CHECK (pro_subscription_tier IN ('free', 'pro', 'enterprise'));

ALTER TABLE public.sg_users
ADD COLUMN IF NOT EXISTS pro_subscription_expires_at TIMESTAMPTZ;

ALTER TABLE public.sg_users
ADD COLUMN IF NOT EXISTS stripe_customer_id TEXT;

-- Set Josh as SUPER ADMIN (GOD MODE)
UPDATE public.sg_users
SET role = 'super_admin',
    pro_subscription_tier = 'enterprise'
WHERE email = 'joshb@surprisegranite.com';

-- Also ensure in auth.users metadata (run after user exists)
-- This is handled via trigger below

-- ============================================================
-- 2. PRO REFERRAL CODES TABLE
-- ============================================================

CREATE TABLE IF NOT EXISTS public.pro_referral_codes (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  pro_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  code TEXT UNIQUE NOT NULL,
  name TEXT, -- Friendly name like "Kitchen Remodel Campaign"
  is_active BOOLEAN DEFAULT true,
  usage_count INTEGER DEFAULT 0,
  max_uses INTEGER, -- NULL = unlimited
  expires_at TIMESTAMPTZ,
  commission_rate DECIMAL(5,2) DEFAULT 0, -- Future: % commission
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create index for fast lookups
CREATE INDEX IF NOT EXISTS idx_pro_referral_codes_code ON public.pro_referral_codes(code);
CREATE INDEX IF NOT EXISTS idx_pro_referral_codes_pro_user ON public.pro_referral_codes(pro_user_id);

-- Enable RLS
ALTER TABLE public.pro_referral_codes ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "pro_referral_codes_select_own" ON public.pro_referral_codes
  FOR SELECT USING (auth.uid() = pro_user_id);

CREATE POLICY "pro_referral_codes_insert_own" ON public.pro_referral_codes
  FOR INSERT WITH CHECK (auth.uid() = pro_user_id);

CREATE POLICY "pro_referral_codes_update_own" ON public.pro_referral_codes
  FOR UPDATE USING (auth.uid() = pro_user_id);

CREATE POLICY "pro_referral_codes_delete_own" ON public.pro_referral_codes
  FOR DELETE USING (auth.uid() = pro_user_id);

-- Super admins can see all
CREATE POLICY "pro_referral_codes_super_admin" ON public.pro_referral_codes
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.sg_users
      WHERE id = auth.uid() AND role = 'super_admin'
    )
  );

-- Service role full access
CREATE POLICY "pro_referral_codes_service" ON public.pro_referral_codes
  FOR ALL USING (auth.role() = 'service_role');

-- ============================================================
-- 3. PRO-CUSTOMER LINKS TABLE
-- ============================================================

CREATE TABLE IF NOT EXISTS public.pro_customer_links (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  pro_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  customer_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  customer_email TEXT, -- For tracking before they create account
  referral_code_id UUID REFERENCES public.pro_referral_codes(id) ON DELETE SET NULL,
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'converted', 'archived')),
  first_visit_at TIMESTAMPTZ DEFAULT NOW(),
  last_activity_at TIMESTAMPTZ DEFAULT NOW(),
  total_visits INTEGER DEFAULT 1,
  favorites_count INTEGER DEFAULT 0,
  estimates_count INTEGER DEFAULT 0,
  jobs_count INTEGER DEFAULT 0,
  total_revenue DECIMAL(12,2) DEFAULT 0,
  notes TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- Ensure unique pro-customer pair
  UNIQUE(pro_user_id, customer_user_id),
  UNIQUE(pro_user_id, customer_email)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_pro_customer_links_pro ON public.pro_customer_links(pro_user_id);
CREATE INDEX IF NOT EXISTS idx_pro_customer_links_customer ON public.pro_customer_links(customer_user_id);
CREATE INDEX IF NOT EXISTS idx_pro_customer_links_email ON public.pro_customer_links(customer_email);
CREATE INDEX IF NOT EXISTS idx_pro_customer_links_status ON public.pro_customer_links(status);

-- Enable RLS
ALTER TABLE public.pro_customer_links ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "pro_customer_links_select_own" ON public.pro_customer_links
  FOR SELECT USING (auth.uid() = pro_user_id OR auth.uid() = customer_user_id);

CREATE POLICY "pro_customer_links_insert_pro" ON public.pro_customer_links
  FOR INSERT WITH CHECK (auth.uid() = pro_user_id);

CREATE POLICY "pro_customer_links_update_pro" ON public.pro_customer_links
  FOR UPDATE USING (auth.uid() = pro_user_id);

-- Super admins can see all
CREATE POLICY "pro_customer_links_super_admin" ON public.pro_customer_links
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.sg_users
      WHERE id = auth.uid() AND role = 'super_admin'
    )
  );

-- Service role full access
CREATE POLICY "pro_customer_links_service" ON public.pro_customer_links
  FOR ALL USING (auth.role() = 'service_role');

-- ============================================================
-- 4. CUSTOMER ACTIVITY LOG
-- ============================================================

CREATE TABLE IF NOT EXISTS public.customer_activity_log (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  customer_user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  customer_email TEXT, -- For anonymous tracking
  pro_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  activity_type TEXT NOT NULL CHECK (activity_type IN (
    'page_view', 'tool_use', 'favorite_add', 'favorite_remove',
    'wishlist_share', 'estimate_request', 'account_created',
    'design_saved', 'design_shared', 'contact_form', 'phone_click'
  )),
  activity_data JSONB DEFAULT '{}', -- Details about the activity
  page_url TEXT,
  referrer_url TEXT,
  user_agent TEXT,
  ip_address INET,
  session_id TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for fast queries
CREATE INDEX IF NOT EXISTS idx_activity_log_customer ON public.customer_activity_log(customer_user_id);
CREATE INDEX IF NOT EXISTS idx_activity_log_pro ON public.customer_activity_log(pro_user_id);
CREATE INDEX IF NOT EXISTS idx_activity_log_type ON public.customer_activity_log(activity_type);
CREATE INDEX IF NOT EXISTS idx_activity_log_created ON public.customer_activity_log(created_at DESC);

-- Enable RLS
ALTER TABLE public.customer_activity_log ENABLE ROW LEVEL SECURITY;

-- Pros can see their customers' activity
CREATE POLICY "activity_log_pro_select" ON public.customer_activity_log
  FOR SELECT USING (auth.uid() = pro_user_id);

-- Customers can see their own activity
CREATE POLICY "activity_log_customer_select" ON public.customer_activity_log
  FOR SELECT USING (auth.uid() = customer_user_id);

-- Service role for inserting
CREATE POLICY "activity_log_service" ON public.customer_activity_log
  FOR ALL USING (auth.role() = 'service_role');

-- Super admins can see all
CREATE POLICY "activity_log_super_admin" ON public.customer_activity_log
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.sg_users
      WHERE id = auth.uid() AND role = 'super_admin'
    )
  );

-- ============================================================
-- 5. PRO NOTIFICATIONS TABLE
-- ============================================================

CREATE TABLE IF NOT EXISTS public.pro_notifications (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  pro_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  customer_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  notification_type TEXT NOT NULL CHECK (notification_type IN (
    'new_customer', 'favorite_added', 'wishlist_shared',
    'estimate_requested', 'design_shared', 'customer_active',
    'weekly_summary', 'system'
  )),
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  data JSONB DEFAULT '{}',
  is_read BOOLEAN DEFAULT false,
  is_emailed BOOLEAN DEFAULT false,
  email_sent_at TIMESTAMPTZ,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_pro_notifications_pro ON public.pro_notifications(pro_user_id);
CREATE INDEX IF NOT EXISTS idx_pro_notifications_unread ON public.pro_notifications(pro_user_id, is_read) WHERE is_read = false;
CREATE INDEX IF NOT EXISTS idx_pro_notifications_created ON public.pro_notifications(created_at DESC);

-- Enable RLS
ALTER TABLE public.pro_notifications ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "pro_notifications_select_own" ON public.pro_notifications
  FOR SELECT USING (auth.uid() = pro_user_id);

CREATE POLICY "pro_notifications_update_own" ON public.pro_notifications
  FOR UPDATE USING (auth.uid() = pro_user_id);

-- Service role for inserting
CREATE POLICY "pro_notifications_service" ON public.pro_notifications
  FOR ALL USING (auth.role() = 'service_role');

-- Super admins
CREATE POLICY "pro_notifications_super_admin" ON public.pro_notifications
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.sg_users
      WHERE id = auth.uid() AND role = 'super_admin'
    )
  );

-- ============================================================
-- 6. PRO NOTIFICATION PREFERENCES
-- ============================================================

CREATE TABLE IF NOT EXISTS public.pro_notification_preferences (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  pro_user_id UUID UNIQUE NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Email notifications
  email_new_customer BOOLEAN DEFAULT true,
  email_favorite_added BOOLEAN DEFAULT true,
  email_wishlist_shared BOOLEAN DEFAULT true,
  email_estimate_requested BOOLEAN DEFAULT true,
  email_design_shared BOOLEAN DEFAULT true,
  email_weekly_summary BOOLEAN DEFAULT true,

  -- Digest settings
  email_digest_frequency TEXT DEFAULT 'instant'
    CHECK (email_digest_frequency IN ('instant', 'hourly', 'daily', 'weekly')),

  -- Quiet hours (don't send emails during these times)
  quiet_hours_start TIME,
  quiet_hours_end TIME,
  timezone TEXT DEFAULT 'America/Phoenix',

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.pro_notification_preferences ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "notification_prefs_select_own" ON public.pro_notification_preferences
  FOR SELECT USING (auth.uid() = pro_user_id);

CREATE POLICY "notification_prefs_insert_own" ON public.pro_notification_preferences
  FOR INSERT WITH CHECK (auth.uid() = pro_user_id);

CREATE POLICY "notification_prefs_update_own" ON public.pro_notification_preferences
  FOR UPDATE USING (auth.uid() = pro_user_id);

-- Service role
CREATE POLICY "notification_prefs_service" ON public.pro_notification_preferences
  FOR ALL USING (auth.role() = 'service_role');

-- ============================================================
-- 7. SHARED WISHLISTS TABLE
-- ============================================================

CREATE TABLE IF NOT EXISTS public.shared_wishlists (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  share_token TEXT UNIQUE NOT NULL,
  customer_user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  customer_email TEXT,
  customer_name TEXT,
  pro_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,

  -- Wishlist content (snapshot at time of sharing)
  items JSONB NOT NULL DEFAULT '[]',
  item_count INTEGER DEFAULT 0,

  -- Sharing settings
  is_active BOOLEAN DEFAULT true,
  allow_pro_edit BOOLEAN DEFAULT false,
  expires_at TIMESTAMPTZ,

  -- Tracking
  view_count INTEGER DEFAULT 0,
  last_viewed_at TIMESTAMPTZ,
  converted_to_estimate_id UUID,

  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_shared_wishlists_token ON public.shared_wishlists(share_token);
CREATE INDEX IF NOT EXISTS idx_shared_wishlists_customer ON public.shared_wishlists(customer_user_id);
CREATE INDEX IF NOT EXISTS idx_shared_wishlists_pro ON public.shared_wishlists(pro_user_id);

-- Enable RLS
ALTER TABLE public.shared_wishlists ENABLE ROW LEVEL SECURITY;

-- Anyone with token can view (handled in API)
CREATE POLICY "shared_wishlists_select_own" ON public.shared_wishlists
  FOR SELECT USING (
    auth.uid() = customer_user_id OR
    auth.uid() = pro_user_id
  );

CREATE POLICY "shared_wishlists_insert_customer" ON public.shared_wishlists
  FOR INSERT WITH CHECK (auth.uid() = customer_user_id);

CREATE POLICY "shared_wishlists_update" ON public.shared_wishlists
  FOR UPDATE USING (
    auth.uid() = customer_user_id OR
    auth.uid() = pro_user_id
  );

-- Service role
CREATE POLICY "shared_wishlists_service" ON public.shared_wishlists
  FOR ALL USING (auth.role() = 'service_role');

-- Super admins
CREATE POLICY "shared_wishlists_super_admin" ON public.shared_wishlists
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.sg_users
      WHERE id = auth.uid() AND role = 'super_admin'
    )
  );

-- ============================================================
-- 8. HELPER FUNCTIONS
-- ============================================================

-- Generate unique referral code
CREATE OR REPLACE FUNCTION generate_referral_code(length INTEGER DEFAULT 8)
RETURNS TEXT AS $$
DECLARE
  chars TEXT := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  result TEXT := '';
  i INTEGER;
BEGIN
  FOR i IN 1..length LOOP
    result := result || substr(chars, floor(random() * length(chars) + 1)::INTEGER, 1);
  END LOOP;
  RETURN result;
END;
$$ LANGUAGE plpgsql;

-- Generate share token
CREATE OR REPLACE FUNCTION generate_share_token()
RETURNS TEXT AS $$
BEGIN
  RETURN encode(gen_random_bytes(18), 'base64');
END;
$$ LANGUAGE plpgsql;

-- Auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create triggers for updated_at
DROP TRIGGER IF EXISTS pro_referral_codes_updated_at ON public.pro_referral_codes;
CREATE TRIGGER pro_referral_codes_updated_at
  BEFORE UPDATE ON public.pro_referral_codes
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS pro_customer_links_updated_at ON public.pro_customer_links;
CREATE TRIGGER pro_customer_links_updated_at
  BEFORE UPDATE ON public.pro_customer_links
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS shared_wishlists_updated_at ON public.shared_wishlists;
CREATE TRIGGER shared_wishlists_updated_at
  BEFORE UPDATE ON public.shared_wishlists
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS pro_notification_prefs_updated_at ON public.pro_notification_preferences;
CREATE TRIGGER pro_notification_prefs_updated_at
  BEFORE UPDATE ON public.pro_notification_preferences
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================
-- 9. NOTIFICATION TRIGGER FUNCTION
-- ============================================================

-- Function to create notification when customer adds favorite
CREATE OR REPLACE FUNCTION notify_pro_on_favorite()
RETURNS TRIGGER AS $$
DECLARE
  linked_pro UUID;
  customer_name TEXT;
BEGIN
  -- Find linked pro for this customer
  SELECT pro_user_id INTO linked_pro
  FROM public.pro_customer_links
  WHERE customer_user_id = NEW.user_id
    AND status = 'active'
  LIMIT 1;

  IF linked_pro IS NOT NULL THEN
    -- Get customer name
    SELECT COALESCE(full_name, email) INTO customer_name
    FROM public.sg_users
    WHERE id = NEW.user_id;

    -- Create notification
    INSERT INTO public.pro_notifications (
      pro_user_id,
      customer_user_id,
      notification_type,
      title,
      message,
      data
    ) VALUES (
      linked_pro,
      NEW.user_id,
      'favorite_added',
      'New Favorite Added',
      customer_name || ' added "' || NEW.product_title || '" to their wishlist',
      jsonb_build_object(
        'product_title', NEW.product_title,
        'product_type', NEW.product_type,
        'product_url', NEW.product_url,
        'product_image', NEW.product_image
      )
    );

    -- Update customer link stats
    UPDATE public.pro_customer_links
    SET favorites_count = favorites_count + 1,
        last_activity_at = NOW()
    WHERE pro_user_id = linked_pro
      AND customer_user_id = NEW.user_id;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger on user_favorites
DROP TRIGGER IF EXISTS notify_pro_favorite_trigger ON public.user_favorites;
CREATE TRIGGER notify_pro_favorite_trigger
  AFTER INSERT ON public.user_favorites
  FOR EACH ROW EXECUTE FUNCTION notify_pro_on_favorite();

-- ============================================================
-- 10. GRANTS
-- ============================================================

GRANT ALL ON public.pro_referral_codes TO authenticated;
GRANT ALL ON public.pro_referral_codes TO service_role;

GRANT ALL ON public.pro_customer_links TO authenticated;
GRANT ALL ON public.pro_customer_links TO service_role;

GRANT ALL ON public.customer_activity_log TO authenticated;
GRANT ALL ON public.customer_activity_log TO service_role;

GRANT ALL ON public.pro_notifications TO authenticated;
GRANT ALL ON public.pro_notifications TO service_role;

GRANT ALL ON public.pro_notification_preferences TO authenticated;
GRANT ALL ON public.pro_notification_preferences TO service_role;

GRANT ALL ON public.shared_wishlists TO authenticated;
GRANT ALL ON public.shared_wishlists TO service_role;

-- ============================================================
-- 11. INSERT DEFAULT REFERRAL CODE FOR JOSH (SUPER ADMIN)
-- ============================================================

-- This will be executed after Josh's account exists
-- Run manually or via API after account creation:
/*
INSERT INTO public.pro_referral_codes (pro_user_id, code, name, is_active)
SELECT id, 'SURPRISE', 'Main Company Code', true
FROM auth.users
WHERE email = 'joshb@surprisegranite.com'
ON CONFLICT (code) DO NOTHING;
*/

-- ============================================================
-- 12. VIEW FOR PRO DASHBOARD
-- ============================================================

CREATE OR REPLACE VIEW public.pro_dashboard_customers AS
SELECT
  pcl.id as link_id,
  pcl.pro_user_id,
  pcl.customer_user_id,
  pcl.customer_email,
  pcl.status,
  pcl.first_visit_at,
  pcl.last_activity_at,
  pcl.favorites_count,
  pcl.estimates_count,
  pcl.total_revenue,
  pcl.notes,
  su.full_name as customer_name,
  su.phone as customer_phone,
  su.avatar_url as customer_avatar,
  prc.code as referral_code,
  prc.name as referral_campaign
FROM public.pro_customer_links pcl
LEFT JOIN public.sg_users su ON pcl.customer_user_id = su.id
LEFT JOIN public.pro_referral_codes prc ON pcl.referral_code_id = prc.id;

-- Grant access to view
GRANT SELECT ON public.pro_dashboard_customers TO authenticated;

-- ============================================================
-- DONE! Run this entire script in Supabase SQL Editor
-- ============================================================
