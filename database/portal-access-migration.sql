-- =============================================
-- CUSTOMER & CONTRACTOR PORTAL ACCESS
-- Run this in Supabase SQL Editor
-- =============================================

-- Add portal access fields to customers table
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS portal_token TEXT UNIQUE;
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS portal_enabled BOOLEAN DEFAULT true;
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS last_portal_login TIMESTAMPTZ;
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS portal_notifications BOOLEAN DEFAULT true;

-- Add more fields to contractors for portal
ALTER TABLE public.contractors ADD COLUMN IF NOT EXISTS portal_enabled BOOLEAN DEFAULT true;
ALTER TABLE public.contractors ADD COLUMN IF NOT EXISTS last_portal_login TIMESTAMPTZ;
ALTER TABLE public.contractors ADD COLUMN IF NOT EXISTS portal_notifications BOOLEAN DEFAULT true;
ALTER TABLE public.contractors ADD COLUMN IF NOT EXISTS can_see_customer_info BOOLEAN DEFAULT false;
ALTER TABLE public.contractors ADD COLUMN IF NOT EXISTS can_upload_files BOOLEAN DEFAULT true;
ALTER TABLE public.contractors ADD COLUMN IF NOT EXISTS can_update_status BOOLEAN DEFAULT true;

-- Job Comments/Activity Table
CREATE TABLE IF NOT EXISTS public.job_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,

  -- Who posted
  user_id UUID REFERENCES auth.users(id),
  customer_id UUID REFERENCES public.customers(id),
  contractor_id UUID REFERENCES public.contractors(id),

  comment_type TEXT DEFAULT 'comment' CHECK (comment_type IN (
    'comment', 'status_update', 'file_upload', 'system'
  )),

  content TEXT NOT NULL,

  -- Visibility
  visible_to_customer BOOLEAN DEFAULT true,
  visible_to_contractors BOOLEAN DEFAULT true,
  visible_to_admin BOOLEAN DEFAULT true,
  internal_only BOOLEAN DEFAULT false, -- Admin only

  -- Attachments
  attachments JSONB DEFAULT '[]',

  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.job_comments ENABLE ROW LEVEL SECURITY;

-- Policies for job_comments
CREATE POLICY "comments_select" ON public.job_comments
  FOR SELECT USING (
    visible_to_admin = true AND auth.uid() IN (SELECT user_id FROM public.jobs WHERE id = job_id)
    OR (visible_to_customer = true AND auth.uid() IN (SELECT claimed_by FROM public.customers WHERE id = customer_id))
    OR (visible_to_contractors = true AND auth.uid() IN (SELECT claimed_by FROM public.contractors WHERE id = contractor_id))
  );

CREATE POLICY "comments_insert" ON public.job_comments
  FOR INSERT WITH CHECK (true);

-- Contractor Job Status Updates
ALTER TABLE public.job_contractors ADD COLUMN IF NOT EXISTS contractor_status TEXT DEFAULT 'pending'
  CHECK (contractor_status IN ('pending', 'accepted', 'declined', 'en_route', 'on_site', 'working', 'completed', 'issue'));
ALTER TABLE public.job_contractors ADD COLUMN IF NOT EXISTS status_updated_at TIMESTAMPTZ;
ALTER TABLE public.job_contractors ADD COLUMN IF NOT EXISTS contractor_notes TEXT;
ALTER TABLE public.job_contractors ADD COLUMN IF NOT EXISTS check_in_time TIMESTAMPTZ;
ALTER TABLE public.job_contractors ADD COLUMN IF NOT EXISTS check_out_time TIMESTAMPTZ;
ALTER TABLE public.job_contractors ADD COLUMN IF NOT EXISTS actual_hours DECIMAL(5,2);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_customers_portal_token ON public.customers(portal_token);
CREATE INDEX IF NOT EXISTS idx_job_comments_job ON public.job_comments(job_id);

-- Function to generate customer portal token
CREATE OR REPLACE FUNCTION generate_customer_portal_token(customer_uuid UUID)
RETURNS TEXT AS $$
DECLARE
  token TEXT;
BEGIN
  token := encode(gen_random_bytes(24), 'base64');
  token := replace(replace(replace(token, '+', ''), '/', ''), '=', '');

  UPDATE public.customers SET portal_token = token WHERE id = customer_uuid;

  RETURN token;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION generate_customer_portal_token TO authenticated;

SELECT 'Portal access migration complete!' as status;
