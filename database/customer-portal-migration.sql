-- ============================================================
-- CUSTOMER PORTAL SYSTEM
-- Secure token-based access for leads/customers to view their project
-- Run in Supabase SQL Editor
-- ============================================================

-- Portal access tokens for leads/customers
CREATE TABLE IF NOT EXISTS public.portal_tokens (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,

  -- Link to lead OR customer (one must be set)
  lead_id UUID REFERENCES public.leads(id) ON DELETE CASCADE,
  customer_id UUID REFERENCES public.customers(id) ON DELETE CASCADE,

  -- The business user who owns this customer relationship
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Secure token for URL access (e.g., /portal/abc123xyz)
  token TEXT NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(16), 'hex'),

  -- Optional PIN for extra security (4-6 digits)
  pin_code TEXT,

  -- Contact info for verification
  email TEXT,
  phone TEXT,

  -- Access tracking
  is_active BOOLEAN DEFAULT true,
  last_accessed_at TIMESTAMPTZ,
  access_count INTEGER DEFAULT 0,

  -- Expiration (null = never expires)
  expires_at TIMESTAMPTZ,

  -- What this token grants access to
  permissions JSONB DEFAULT '{
    "view_project": true,
    "view_estimates": true,
    "approve_estimates": true,
    "view_invoices": true,
    "pay_invoices": true,
    "upload_photos": true,
    "send_messages": true,
    "view_appointments": true
  }',

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- Ensure at least one link exists
  CONSTRAINT portal_tokens_link_check CHECK (lead_id IS NOT NULL OR customer_id IS NOT NULL)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_portal_tokens_token ON public.portal_tokens(token);
CREATE INDEX IF NOT EXISTS idx_portal_tokens_lead ON public.portal_tokens(lead_id);
CREATE INDEX IF NOT EXISTS idx_portal_tokens_customer ON public.portal_tokens(customer_id);
CREATE INDEX IF NOT EXISTS idx_portal_tokens_owner ON public.portal_tokens(owner_id);
CREATE INDEX IF NOT EXISTS idx_portal_tokens_email ON public.portal_tokens(email);

-- Enable RLS
ALTER TABLE public.portal_tokens ENABLE ROW LEVEL SECURITY;

-- Business users can manage their own tokens
CREATE POLICY "portal_tokens_owner_all" ON public.portal_tokens
  FOR ALL USING (owner_id = auth.uid());

-- Public can read tokens by token value (for portal access)
CREATE POLICY "portal_tokens_public_read" ON public.portal_tokens
  FOR SELECT USING (true);

-- Service role full access
CREATE POLICY "portal_tokens_service" ON public.portal_tokens
  FOR ALL USING (auth.role() = 'service_role');

-- Trigger to update updated_at
CREATE OR REPLACE FUNCTION update_portal_token_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS portal_tokens_updated_at ON public.portal_tokens;
CREATE TRIGGER portal_tokens_updated_at
  BEFORE UPDATE ON public.portal_tokens
  FOR EACH ROW EXECUTE FUNCTION update_portal_token_timestamp();

-- Function to record portal access
CREATE OR REPLACE FUNCTION record_portal_access(p_token TEXT)
RETURNS TABLE(
  token_id UUID,
  lead_data JSONB,
  customer_data JSONB,
  permissions JSONB
) AS $$
DECLARE
  v_token_record RECORD;
BEGIN
  -- Get and update the token
  UPDATE public.portal_tokens
  SET
    last_accessed_at = NOW(),
    access_count = access_count + 1
  WHERE token = p_token
    AND is_active = true
    AND (expires_at IS NULL OR expires_at > NOW())
  RETURNING * INTO v_token_record;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  -- Return token with related data
  RETURN QUERY
  SELECT
    v_token_record.id,
    CASE WHEN v_token_record.lead_id IS NOT NULL THEN
      (SELECT to_jsonb(l) FROM public.leads l WHERE l.id = v_token_record.lead_id)
    ELSE NULL END,
    CASE WHEN v_token_record.customer_id IS NOT NULL THEN
      (SELECT to_jsonb(c) FROM public.customers c WHERE c.id = v_token_record.customer_id)
    ELSE NULL END,
    v_token_record.permissions;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant permissions
GRANT ALL ON public.portal_tokens TO authenticated;
GRANT ALL ON public.portal_tokens TO service_role;
GRANT EXECUTE ON FUNCTION record_portal_access TO anon;
GRANT EXECUTE ON FUNCTION record_portal_access TO authenticated;

-- ============================================================
-- PORTAL ACTIVITY LOG
-- Track customer actions in their portal
-- ============================================================

CREATE TABLE IF NOT EXISTS public.portal_activity (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  portal_token_id UUID NOT NULL REFERENCES public.portal_tokens(id) ON DELETE CASCADE,

  -- Activity type
  activity_type TEXT NOT NULL CHECK (activity_type IN (
    'portal_viewed', 'estimate_viewed', 'estimate_approved', 'estimate_rejected',
    'invoice_viewed', 'payment_initiated', 'payment_completed',
    'photo_uploaded', 'message_sent', 'appointment_confirmed',
    'document_downloaded', 'design_viewed', 'design_approved'
  )),

  -- Related record
  related_type TEXT, -- 'estimate', 'invoice', 'appointment', etc.
  related_id UUID,

  -- Activity details
  details JSONB DEFAULT '{}',

  -- Client info
  ip_address TEXT,
  user_agent TEXT,

  -- Timestamp
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_portal_activity_token ON public.portal_activity(portal_token_id);
CREATE INDEX IF NOT EXISTS idx_portal_activity_type ON public.portal_activity(activity_type);
CREATE INDEX IF NOT EXISTS idx_portal_activity_created ON public.portal_activity(created_at DESC);

-- Enable RLS
ALTER TABLE public.portal_activity ENABLE ROW LEVEL SECURITY;

-- Business users can see activity for their tokens
CREATE POLICY "portal_activity_owner_read" ON public.portal_activity
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.portal_tokens pt
      WHERE pt.id = portal_token_id AND pt.owner_id = auth.uid()
    )
  );

-- Anyone can insert activity (for portal usage)
CREATE POLICY "portal_activity_insert" ON public.portal_activity
  FOR INSERT WITH CHECK (true);

-- Grant permissions
GRANT ALL ON public.portal_activity TO authenticated;
GRANT ALL ON public.portal_activity TO service_role;
GRANT INSERT ON public.portal_activity TO anon;

-- ============================================================
-- DONE! Run this in Supabase SQL Editor
-- ============================================================
