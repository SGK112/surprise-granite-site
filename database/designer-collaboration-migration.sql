-- =====================================================
-- DESIGNER COLLABORATION & DESIGN HANDOFF MIGRATION
-- Adds designer role, project collaborators, design
-- handoff workflow, and related permissions/policies
-- Run in Supabase SQL Editor
-- =====================================================

-- =====================================================
-- 1. UPDATE SG_USERS CONSTRAINTS
-- =====================================================

ALTER TABLE public.sg_users DROP CONSTRAINT IF EXISTS sg_users_role_check;
ALTER TABLE public.sg_users ADD CONSTRAINT sg_users_role_check
  CHECK (role IN ('user', 'pro', 'designer', 'admin', 'super_admin'));

ALTER TABLE public.sg_users DROP CONSTRAINT IF EXISTS sg_users_pro_subscription_tier_check;
ALTER TABLE public.sg_users ADD CONSTRAINT sg_users_pro_subscription_tier_check
  CHECK (pro_subscription_tier IN ('free', 'pro', 'designer', 'enterprise'));

-- =====================================================
-- 2. PROJECT COLLABORATORS TABLE
-- =====================================================

CREATE TABLE IF NOT EXISTS public.project_collaborators (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('owner', 'designer', 'fabricator', 'contractor', 'installer', 'viewer')),
  access_level TEXT NOT NULL DEFAULT 'read' CHECK (access_level IN ('read', 'write', 'admin')),
  invitation_status TEXT NOT NULL DEFAULT 'pending' CHECK (invitation_status IN ('pending', 'accepted', 'declined', 'removed')),
  invited_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  invited_at TIMESTAMPTZ DEFAULT NOW(),
  accepted_at TIMESTAMPTZ,
  removed_at TIMESTAMPTZ,
  notes TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(project_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_project_collaborators_project ON public.project_collaborators(project_id);
CREATE INDEX IF NOT EXISTS idx_project_collaborators_user ON public.project_collaborators(user_id);
CREATE INDEX IF NOT EXISTS idx_project_collaborators_status ON public.project_collaborators(invitation_status);

ALTER TABLE public.project_collaborators ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "collaborators_select_own" ON public.project_collaborators;
CREATE POLICY "collaborators_select_own" ON public.project_collaborators
  FOR SELECT USING (
    auth.uid() = user_id
    OR auth.uid() = invited_by
    OR EXISTS (SELECT 1 FROM public.projects WHERE id = project_id AND user_id = auth.uid())
  );

DROP POLICY IF EXISTS "collaborators_insert_owner" ON public.project_collaborators;
CREATE POLICY "collaborators_insert_owner" ON public.project_collaborators
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM public.projects WHERE id = project_id AND user_id = auth.uid())
  );

DROP POLICY IF EXISTS "collaborators_update" ON public.project_collaborators;
CREATE POLICY "collaborators_update" ON public.project_collaborators
  FOR UPDATE USING (
    auth.uid() = user_id
    OR EXISTS (SELECT 1 FROM public.projects WHERE id = project_id AND user_id = auth.uid())
  );

DROP POLICY IF EXISTS "collaborators_delete_owner" ON public.project_collaborators;
CREATE POLICY "collaborators_delete_owner" ON public.project_collaborators
  FOR DELETE USING (
    EXISTS (SELECT 1 FROM public.projects WHERE id = project_id AND user_id = auth.uid())
  );

DROP POLICY IF EXISTS "collaborators_service" ON public.project_collaborators;
CREATE POLICY "collaborators_service" ON public.project_collaborators
  FOR ALL USING (auth.role() = 'service_role');

DROP POLICY IF EXISTS "collaborators_super_admin" ON public.project_collaborators;
CREATE POLICY "collaborators_super_admin" ON public.project_collaborators
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.sg_users WHERE id = auth.uid() AND role = 'super_admin')
  );

DROP TRIGGER IF EXISTS project_collaborators_updated_at ON public.project_collaborators;
CREATE TRIGGER project_collaborators_updated_at
  BEFORE UPDATE ON public.project_collaborators
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

GRANT ALL ON public.project_collaborators TO authenticated;
GRANT ALL ON public.project_collaborators TO service_role;

-- =====================================================
-- 3. DESIGN HANDOFFS TABLE
-- =====================================================

CREATE TABLE IF NOT EXISTS public.design_handoffs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  designer_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  fabricator_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  contractor_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  stage TEXT NOT NULL DEFAULT 'design_created' CHECK (stage IN (
    'design_created', 'design_review', 'design_approved',
    'fabrication_quote_requested', 'fabrication_quote_received',
    'fabrication_approved', 'materials_ordered',
    'fabrication_in_progress', 'fabrication_complete',
    'install_scheduled', 'install_in_progress',
    'install_complete', 'final_review'
  )),
  title TEXT NOT NULL,
  description TEXT,
  design_file_url TEXT,
  quote_amount DECIMAL(12,2),
  scheduled_date TIMESTAMPTZ,
  stage_history JSONB DEFAULT '[]',
  is_active BOOLEAN DEFAULT true,
  completed_at TIMESTAMPTZ,
  notes TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_design_handoffs_project ON public.design_handoffs(project_id);
CREATE INDEX IF NOT EXISTS idx_design_handoffs_designer ON public.design_handoffs(designer_id);
CREATE INDEX IF NOT EXISTS idx_design_handoffs_fabricator ON public.design_handoffs(fabricator_id);
CREATE INDEX IF NOT EXISTS idx_design_handoffs_contractor ON public.design_handoffs(contractor_id);
CREATE INDEX IF NOT EXISTS idx_design_handoffs_stage ON public.design_handoffs(stage);

ALTER TABLE public.design_handoffs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "handoffs_select_participants" ON public.design_handoffs;
CREATE POLICY "handoffs_select_participants" ON public.design_handoffs
  FOR SELECT USING (
    auth.uid() = designer_id
    OR auth.uid() = fabricator_id
    OR auth.uid() = contractor_id
    OR EXISTS (SELECT 1 FROM public.projects WHERE id = project_id AND user_id = auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.project_collaborators
      WHERE project_id = design_handoffs.project_id
        AND user_id = auth.uid()
        AND invitation_status = 'accepted'
    )
  );

DROP POLICY IF EXISTS "handoffs_insert" ON public.design_handoffs;
CREATE POLICY "handoffs_insert" ON public.design_handoffs
  FOR INSERT WITH CHECK (
    auth.uid() = designer_id
    OR EXISTS (SELECT 1 FROM public.projects WHERE id = project_id AND user_id = auth.uid())
  );

DROP POLICY IF EXISTS "handoffs_update_participants" ON public.design_handoffs;
CREATE POLICY "handoffs_update_participants" ON public.design_handoffs
  FOR UPDATE USING (
    auth.uid() = designer_id
    OR auth.uid() = fabricator_id
    OR auth.uid() = contractor_id
    OR EXISTS (SELECT 1 FROM public.projects WHERE id = project_id AND user_id = auth.uid())
  );

DROP POLICY IF EXISTS "handoffs_delete" ON public.design_handoffs;
CREATE POLICY "handoffs_delete" ON public.design_handoffs
  FOR DELETE USING (
    auth.uid() = designer_id
    OR EXISTS (SELECT 1 FROM public.projects WHERE id = project_id AND user_id = auth.uid())
  );

DROP POLICY IF EXISTS "handoffs_service" ON public.design_handoffs;
CREATE POLICY "handoffs_service" ON public.design_handoffs
  FOR ALL USING (auth.role() = 'service_role');

DROP POLICY IF EXISTS "handoffs_super_admin" ON public.design_handoffs;
CREATE POLICY "handoffs_super_admin" ON public.design_handoffs
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.sg_users WHERE id = auth.uid() AND role = 'super_admin')
  );

DROP TRIGGER IF EXISTS design_handoffs_updated_at ON public.design_handoffs;
CREATE TRIGGER design_handoffs_updated_at
  BEFORE UPDATE ON public.design_handoffs
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

GRANT ALL ON public.design_handoffs TO authenticated;
GRANT ALL ON public.design_handoffs TO service_role;

-- =====================================================
-- 4. HELPER FUNCTIONS FOR RLS
-- =====================================================

CREATE OR REPLACE FUNCTION public.is_project_collaborator(p_project_id UUID, p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.project_collaborators
    WHERE project_id = p_project_id AND user_id = p_user_id AND invitation_status = 'accepted'
  ) OR EXISTS (
    SELECT 1 FROM public.projects
    WHERE id = p_project_id AND user_id = p_user_id
  );
$$;

CREATE OR REPLACE FUNCTION public.is_project_writer(p_project_id UUID, p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.project_collaborators
    WHERE project_id = p_project_id AND user_id = p_user_id
      AND invitation_status = 'accepted' AND access_level IN ('write', 'admin')
  ) OR EXISTS (
    SELECT 1 FROM public.projects
    WHERE id = p_project_id AND user_id = p_user_id
  );
$$;

-- =====================================================
-- 5. UPDATE RLS POLICIES ON EXISTING TABLES
-- =====================================================

DROP POLICY IF EXISTS "projects_collaborator_select" ON public.projects;
CREATE POLICY "projects_collaborator_select" ON public.projects
  FOR SELECT USING (
    user_id = auth.uid()
    OR public.is_project_collaborator(id, auth.uid())
  );

DROP POLICY IF EXISTS "project_tasks_collaborator_select" ON public.project_tasks;
CREATE POLICY "project_tasks_collaborator_select" ON public.project_tasks
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.projects
      WHERE id = project_tasks.project_id
        AND (user_id = auth.uid() OR public.is_project_collaborator(id, auth.uid()))
    )
  );

DROP POLICY IF EXISTS "project_tasks_collaborator_insert" ON public.project_tasks;
CREATE POLICY "project_tasks_collaborator_insert" ON public.project_tasks
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.projects
      WHERE id = project_tasks.project_id
        AND (user_id = auth.uid() OR public.is_project_writer(id, auth.uid()))
    )
  );

DROP POLICY IF EXISTS "project_activity_collaborator_select" ON public.project_activity;
CREATE POLICY "project_activity_collaborator_select" ON public.project_activity
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.projects
      WHERE id = project_activity.project_id
        AND (user_id = auth.uid() OR public.is_project_collaborator(id, auth.uid()))
    )
  );

DROP POLICY IF EXISTS "project_activity_collaborator_insert" ON public.project_activity;
CREATE POLICY "project_activity_collaborator_insert" ON public.project_activity
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.projects
      WHERE id = project_activity.project_id
        AND (user_id = auth.uid() OR public.is_project_writer(id, auth.uid()))
    )
  );

DROP POLICY IF EXISTS "project_files_collaborator_select" ON public.project_files;
CREATE POLICY "project_files_collaborator_select" ON public.project_files
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.projects
      WHERE id = project_files.project_id
        AND (user_id = auth.uid() OR public.is_project_collaborator(id, auth.uid()))
    )
  );

DROP POLICY IF EXISTS "project_files_collaborator_insert" ON public.project_files;
CREATE POLICY "project_files_collaborator_insert" ON public.project_files
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.projects
      WHERE id = project_files.project_id
        AND (user_id = auth.uid() OR public.is_project_writer(id, auth.uid()))
    )
  );

DROP POLICY IF EXISTS "project_crew_collaborator_select" ON public.project_crew;
CREATE POLICY "project_crew_collaborator_select" ON public.project_crew
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.projects
      WHERE id = project_crew.project_id
        AND (user_id = auth.uid() OR public.is_project_collaborator(id, auth.uid()))
    )
  );

-- =====================================================
-- 6. EXPAND NOTIFICATION TYPES
-- =====================================================

ALTER TABLE public.pro_notifications DROP CONSTRAINT IF EXISTS pro_notifications_notification_type_check;
ALTER TABLE public.pro_notifications ADD CONSTRAINT pro_notifications_notification_type_check
  CHECK (notification_type IN (
    'new_customer', 'favorite_added', 'wishlist_shared',
    'estimate_requested', 'design_shared', 'customer_active',
    'weekly_summary', 'system',
    'collaborator_invited', 'collaborator_accepted',
    'design_handoff_created', 'design_handoff_stage_change',
    'fabrication_quote_ready', 'install_scheduled',
    'handoff_review_requested', 'handoff_completed'
  ));

-- =====================================================
-- 7. NOTIFICATION PREFERENCES - HANDOFF COLUMNS
-- =====================================================

ALTER TABLE public.pro_notification_preferences
  ADD COLUMN IF NOT EXISTS email_collaborator_invited BOOLEAN DEFAULT true;
ALTER TABLE public.pro_notification_preferences
  ADD COLUMN IF NOT EXISTS email_collaborator_accepted BOOLEAN DEFAULT true;
ALTER TABLE public.pro_notification_preferences
  ADD COLUMN IF NOT EXISTS email_design_handoff_created BOOLEAN DEFAULT true;
ALTER TABLE public.pro_notification_preferences
  ADD COLUMN IF NOT EXISTS email_design_handoff_stage_change BOOLEAN DEFAULT true;
ALTER TABLE public.pro_notification_preferences
  ADD COLUMN IF NOT EXISTS email_fabrication_quote_ready BOOLEAN DEFAULT true;
ALTER TABLE public.pro_notification_preferences
  ADD COLUMN IF NOT EXISTS email_install_scheduled BOOLEAN DEFAULT true;
ALTER TABLE public.pro_notification_preferences
  ADD COLUMN IF NOT EXISTS email_handoff_review_requested BOOLEAN DEFAULT true;
ALTER TABLE public.pro_notification_preferences
  ADD COLUMN IF NOT EXISTS email_handoff_completed BOOLEAN DEFAULT true;

-- =====================================================
-- 8. DESIGNER SUBSCRIPTION PLAN
-- =====================================================

CREATE TABLE IF NOT EXISTS public.subscription_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  price_monthly DECIMAL(10,2) NOT NULL,
  price_annual DECIMAL(10,2),
  stripe_price_id_monthly TEXT,
  stripe_price_id_annual TEXT,
  leads_per_month INTEGER,
  lead_cost_extra DECIMAL(6,2) DEFAULT 15.00,
  directory_listing BOOLEAN DEFAULT true,
  verified_badge BOOLEAN DEFAULT false,
  featured_reviews INTEGER DEFAULT 0,
  booking_links INTEGER DEFAULT 0,
  keywords INTEGER DEFAULT 0,
  faqs INTEGER DEFAULT 0,
  products_display INTEGER DEFAULT 0,
  video_section BOOLEAN DEFAULT false,
  remove_competitor_ads BOOLEAN DEFAULT false,
  marketplace_commission DECIMAL(4,2) DEFAULT 10.00,
  lead_priority TEXT DEFAULT 'standard',
  is_active BOOLEAN DEFAULT true,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO subscription_plans (
  name, display_name, price_monthly, price_annual,
  leads_per_month, lead_cost_extra, verified_badge,
  featured_reviews, booking_links, keywords, faqs,
  products_display, video_section, remove_competitor_ads,
  marketplace_commission, lead_priority, sort_order
) VALUES (
  'designer', 'Designer Pro', 14.99, 143.90,
  5, 10.00, true,
  2, 2, 15, 8,
  8, false, false,
  7.00, 'standard', 5
) ON CONFLICT (name) DO NOTHING;

-- =====================================================
-- 9. VENDOR PROFILE COLUMNS FOR DESIGNERS
-- (only runs if vendor_profiles table exists)
-- =====================================================

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'vendor_profiles') THEN
    ALTER TABLE vendor_profiles ADD COLUMN IF NOT EXISTS commission_rate DECIMAL(5,2) DEFAULT 0;
    ALTER TABLE vendor_profiles ADD COLUMN IF NOT EXISTS total_commissions_earned DECIMAL(12,2) DEFAULT 0;
    ALTER TABLE vendor_profiles ADD COLUMN IF NOT EXISTS sample_requests_count INTEGER DEFAULT 0;
    ALTER TABLE vendor_profiles ADD COLUMN IF NOT EXISTS active_design_projects INTEGER DEFAULT 0;
  END IF;
END $$;

-- =====================================================
-- 10. DESIGNER PERMISSIONS
-- =====================================================

CREATE TABLE IF NOT EXISTS public.role_permissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  role TEXT NOT NULL,
  feature TEXT NOT NULL,
  enabled BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(role, feature)
);

INSERT INTO public.role_permissions (role, feature, enabled) VALUES
  ('designer', 'view_own_jobs', true),
  ('designer', 'view_estimates', true),
  ('designer', 'approve_estimates', true),
  ('designer', 'message_team', true),
  ('designer', 'view_calendar', true),
  ('designer', 'upload_files', true),
  ('designer', 'leave_reviews', true),
  ('designer', 'view_contractors', true),
  ('designer', 'create_designs', true),
  ('designer', 'share_designs', true),
  ('designer', 'room_designer_tools', true),
  ('designer', 'design_handoff', true),
  ('designer', 'commission_tracking', true),
  ('designer', 'request_samples', true),
  ('designer', 'view_leads', true),
  ('designer', 'analytics', true),
  ('designer', 'manage_customers', true),
  ('designer', 'send_estimates', true),
  ('designer', 'ai_tools', true),
  ('designer', 'pay_invoices', true),
  ('designer', 'connect_contractors', true),
  ('designer', 'list_products', true)
ON CONFLICT (role, feature) DO NOTHING;

-- =====================================================
-- 11. AUTO-LOG HANDOFF STAGE CHANGES
-- =====================================================

CREATE OR REPLACE FUNCTION log_handoff_stage_change()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.stage IS DISTINCT FROM NEW.stage THEN
    NEW.stage_history = COALESCE(OLD.stage_history, '[]'::jsonb) || jsonb_build_object(
      'from_stage', OLD.stage,
      'to_stage', NEW.stage,
      'changed_by', auth.uid(),
      'changed_at', NOW()
    );

    INSERT INTO public.project_activity (
      project_id, user_id, activity_type, description, metadata
    ) VALUES (
      NEW.project_id,
      auth.uid(),
      'handoff_stage_change',
      'Design handoff advanced from ' || REPLACE(OLD.stage, '_', ' ') || ' to ' || REPLACE(NEW.stage, '_', ' '),
      jsonb_build_object(
        'handoff_id', NEW.id,
        'from_stage', OLD.stage,
        'to_stage', NEW.stage,
        'title', NEW.title
      )
    );

    IF NEW.stage = 'final_review' THEN
      NEW.completed_at = NOW();
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS handoff_stage_change_trigger ON public.design_handoffs;
CREATE TRIGGER handoff_stage_change_trigger
  BEFORE UPDATE ON public.design_handoffs
  FOR EACH ROW EXECUTE FUNCTION log_handoff_stage_change();
