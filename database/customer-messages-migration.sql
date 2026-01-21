-- ============================================================
-- CUSTOMER MESSAGES TABLE
-- For tracking correspondence between contractors and customers
-- Run in Supabase SQL Editor
-- ============================================================

-- Create the customer_messages table
CREATE TABLE IF NOT EXISTS public.customer_messages (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  customer_id UUID REFERENCES public.customers(id) ON DELETE CASCADE,
  sender_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  direction TEXT NOT NULL CHECK (direction IN ('inbound', 'outbound')),
  channel TEXT NOT NULL CHECK (channel IN ('email', 'sms', 'phone', 'in_app', 'other')),
  message TEXT NOT NULL,
  subject TEXT, -- For emails
  sent_to TEXT, -- Email or phone number
  sent_from TEXT, -- Email or phone number
  status TEXT DEFAULT 'sent' CHECK (status IN ('draft', 'sent', 'delivered', 'read', 'failed', 'bounced')),

  -- Tracking
  read_at TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ,

  -- Metadata
  metadata JSONB DEFAULT '{}',

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for fast queries
CREATE INDEX IF NOT EXISTS idx_customer_messages_customer ON public.customer_messages(customer_id);
CREATE INDEX IF NOT EXISTS idx_customer_messages_sender ON public.customer_messages(sender_id);
CREATE INDEX IF NOT EXISTS idx_customer_messages_direction ON public.customer_messages(direction);
CREATE INDEX IF NOT EXISTS idx_customer_messages_channel ON public.customer_messages(channel);
CREATE INDEX IF NOT EXISTS idx_customer_messages_created ON public.customer_messages(created_at DESC);

-- Enable RLS
ALTER TABLE public.customer_messages ENABLE ROW LEVEL SECURITY;

-- Policy: Users can see messages for customers they have access to
CREATE POLICY "customer_messages_select" ON public.customer_messages
  FOR SELECT USING (
    sender_id = auth.uid() OR
    EXISTS (
      SELECT 1 FROM public.customers c
      WHERE c.id = customer_id
      AND (c.created_by = auth.uid() OR c.assigned_to = auth.uid())
    )
  );

-- Policy: Users can insert messages
CREATE POLICY "customer_messages_insert" ON public.customer_messages
  FOR INSERT WITH CHECK (sender_id = auth.uid());

-- Policy: Users can update their own messages
CREATE POLICY "customer_messages_update" ON public.customer_messages
  FOR UPDATE USING (sender_id = auth.uid());

-- Policy: Super admins can see all messages
CREATE POLICY "customer_messages_super_admin" ON public.customer_messages
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.sg_users
      WHERE id = auth.uid() AND role IN ('admin', 'super_admin')
    )
  );

-- Policy: Service role full access
CREATE POLICY "customer_messages_service" ON public.customer_messages
  FOR ALL USING (auth.role() = 'service_role');

-- Trigger to update updated_at
DROP TRIGGER IF EXISTS customer_messages_updated_at ON public.customer_messages;
CREATE TRIGGER customer_messages_updated_at
  BEFORE UPDATE ON public.customer_messages
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Grant permissions
GRANT ALL ON public.customer_messages TO authenticated;
GRANT ALL ON public.customer_messages TO service_role;

-- ============================================================
-- DONE! Run this script in Supabase SQL Editor
-- ============================================================
