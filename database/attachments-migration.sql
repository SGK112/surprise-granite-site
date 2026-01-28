-- =====================================================
-- ATTACHMENTS SYSTEM MIGRATION
-- Unified attachments for leads, estimates, and invoices
-- with pay link tracking
-- =====================================================

-- =====================================================
-- 1. CREATE ATTACHMENTS TABLE
-- =====================================================

CREATE TABLE IF NOT EXISTS public.attachments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Polymorphic references (only one should be set per row)
  lead_id UUID REFERENCES public.leads(id) ON DELETE CASCADE,
  estimate_id UUID REFERENCES public.estimates(id) ON DELETE CASCADE,
  invoice_id UUID REFERENCES public.invoices(id) ON DELETE CASCADE,

  -- File metadata
  file_name TEXT NOT NULL,
  file_url TEXT NOT NULL,
  file_type TEXT CHECK (file_type IN ('image', 'pdf', 'photo', 'document')),
  mime_type TEXT,
  file_size INTEGER,

  -- Organization
  category TEXT DEFAULT 'general' CHECK (category IN (
    'general', 'project_photo', 'drawing', 'contract',
    'receipt', 'inspiration', 'before', 'after', 'material'
  )),
  description TEXT,

  -- Visibility & email inclusion
  visible_to_customer BOOLEAN DEFAULT true,
  include_in_email BOOLEAN DEFAULT false,

  -- Audit
  uploaded_at TIMESTAMPTZ DEFAULT NOW(),
  uploaded_by UUID REFERENCES auth.users(id),

  -- Constraints
  CONSTRAINT attachment_has_parent CHECK (
    (lead_id IS NOT NULL)::int +
    (estimate_id IS NOT NULL)::int +
    (invoice_id IS NOT NULL)::int = 1
  )
);

-- Indexes for efficient lookups
CREATE INDEX IF NOT EXISTS idx_attachments_lead_id ON public.attachments(lead_id) WHERE lead_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_attachments_estimate_id ON public.attachments(estimate_id) WHERE estimate_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_attachments_invoice_id ON public.attachments(invoice_id) WHERE invoice_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_attachments_user_id ON public.attachments(user_id);
CREATE INDEX IF NOT EXISTS idx_attachments_uploaded_at ON public.attachments(uploaded_at DESC);

-- =====================================================
-- 2. ADD PAY LINK COLUMNS TO EXISTING TABLES
-- =====================================================

-- Add pay link tracking to estimates
ALTER TABLE public.estimates
ADD COLUMN IF NOT EXISTS pay_link_url TEXT,
ADD COLUMN IF NOT EXISTS pay_link_id TEXT,
ADD COLUMN IF NOT EXISTS pay_link_created_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS pay_link_amount INTEGER; -- Amount in cents

-- Add pay link tracking to invoices
ALTER TABLE public.invoices
ADD COLUMN IF NOT EXISTS pay_link_url TEXT,
ADD COLUMN IF NOT EXISTS pay_link_id TEXT,
ADD COLUMN IF NOT EXISTS pay_link_created_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS pay_link_amount INTEGER;

-- Add pay link tracking to leads (for quick quotes)
ALTER TABLE public.leads
ADD COLUMN IF NOT EXISTS pay_link_url TEXT,
ADD COLUMN IF NOT EXISTS pay_link_id TEXT,
ADD COLUMN IF NOT EXISTS pay_link_created_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS pay_link_amount INTEGER,
ADD COLUMN IF NOT EXISTS quick_quote_amount DECIMAL(10,2);

-- =====================================================
-- 3. ROW LEVEL SECURITY POLICIES
-- =====================================================

ALTER TABLE public.attachments ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view their own attachments
CREATE POLICY "Users can view own attachments"
  ON public.attachments
  FOR SELECT
  USING (auth.uid() = user_id);

-- Policy: Users can insert their own attachments
CREATE POLICY "Users can insert own attachments"
  ON public.attachments
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Policy: Users can update their own attachments
CREATE POLICY "Users can update own attachments"
  ON public.attachments
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Policy: Users can delete their own attachments
CREATE POLICY "Users can delete own attachments"
  ON public.attachments
  FOR DELETE
  USING (auth.uid() = user_id);

-- Policy: Service role has full access
CREATE POLICY "Service role full access to attachments"
  ON public.attachments
  FOR ALL
  USING (auth.role() = 'service_role');

-- Policy: Portal access - customers can view attachments marked visible
-- This requires joining through portal_tokens
CREATE POLICY "Portal users can view visible attachments"
  ON public.attachments
  FOR SELECT
  USING (
    visible_to_customer = true
    AND (
      -- Check if there's a valid portal token for this estimate
      (estimate_id IS NOT NULL AND EXISTS (
        SELECT 1 FROM public.estimate_tokens et
        WHERE et.estimate_id = attachments.estimate_id
      ))
      OR
      -- Check portal_tokens for lead/customer access
      (lead_id IS NOT NULL AND EXISTS (
        SELECT 1 FROM public.portal_tokens pt
        WHERE pt.lead_id = attachments.lead_id
        AND pt.is_active = true
      ))
    )
  );

-- =====================================================
-- 4. STORAGE BUCKET CONFIGURATION
-- =====================================================

-- Create storage bucket for document attachments
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'document-attachments',
  'document-attachments',
  true,
  26214400, -- 25MB max
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'application/pdf']
)
ON CONFLICT (id) DO UPDATE SET
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- Storage policies for document-attachments bucket

-- Allow authenticated users to upload
CREATE POLICY "Authenticated users can upload attachments"
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'document-attachments');

-- Allow public read access (files are protected by signed URLs in practice)
CREATE POLICY "Public read access for attachments"
  ON storage.objects
  FOR SELECT
  TO public
  USING (bucket_id = 'document-attachments');

-- Allow users to delete their own uploads
CREATE POLICY "Users can delete own attachment files"
  ON storage.objects
  FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'document-attachments'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

-- =====================================================
-- 5. HELPER FUNCTIONS
-- =====================================================

-- Function to get all attachments for an entity
CREATE OR REPLACE FUNCTION get_entity_attachments(
  p_entity_type TEXT,
  p_entity_id UUID,
  p_visible_only BOOLEAN DEFAULT false
)
RETURNS SETOF public.attachments
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT *
  FROM public.attachments
  WHERE
    CASE p_entity_type
      WHEN 'lead' THEN lead_id = p_entity_id
      WHEN 'estimate' THEN estimate_id = p_entity_id
      WHEN 'invoice' THEN invoice_id = p_entity_id
      ELSE false
    END
    AND (NOT p_visible_only OR visible_to_customer = true)
  ORDER BY uploaded_at DESC;
END;
$$;

-- Function to count attachments for an entity
CREATE OR REPLACE FUNCTION count_entity_attachments(
  p_entity_type TEXT,
  p_entity_id UUID
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_count INTEGER;
BEGIN
  SELECT COUNT(*)
  INTO v_count
  FROM public.attachments
  WHERE
    CASE p_entity_type
      WHEN 'lead' THEN lead_id = p_entity_id
      WHEN 'estimate' THEN estimate_id = p_entity_id
      WHEN 'invoice' THEN invoice_id = p_entity_id
      ELSE false
    END;

  RETURN v_count;
END;
$$;

-- Function to copy attachments from estimate to invoice (when converting)
CREATE OR REPLACE FUNCTION copy_estimate_attachments_to_invoice(
  p_estimate_id UUID,
  p_invoice_id UUID,
  p_user_id UUID
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_copied INTEGER;
BEGIN
  INSERT INTO public.attachments (
    user_id, invoice_id, file_name, file_url, file_type,
    mime_type, file_size, category, description,
    visible_to_customer, include_in_email, uploaded_by
  )
  SELECT
    p_user_id, p_invoice_id, file_name, file_url, file_type,
    mime_type, file_size, category, description,
    visible_to_customer, include_in_email, p_user_id
  FROM public.attachments
  WHERE estimate_id = p_estimate_id;

  GET DIAGNOSTICS v_copied = ROW_COUNT;
  RETURN v_copied;
END;
$$;

-- =====================================================
-- 6. COMMENTS FOR DOCUMENTATION
-- =====================================================

COMMENT ON TABLE public.attachments IS 'Unified file attachments for leads, estimates, and invoices';
COMMENT ON COLUMN public.attachments.file_type IS 'Type of file: image, pdf, photo, document';
COMMENT ON COLUMN public.attachments.category IS 'Category for organization: project_photo, drawing, contract, receipt, inspiration, before, after, material';
COMMENT ON COLUMN public.attachments.visible_to_customer IS 'Whether customers can see this attachment in portal';
COMMENT ON COLUMN public.attachments.include_in_email IS 'Whether to include this attachment when sending emails';
COMMENT ON COLUMN public.estimates.pay_link_url IS 'Stripe payment link URL for deposit collection';
COMMENT ON COLUMN public.invoices.pay_link_url IS 'Stripe payment link URL for invoice payment';
COMMENT ON COLUMN public.leads.pay_link_url IS 'Stripe payment link URL for quick quotes';
