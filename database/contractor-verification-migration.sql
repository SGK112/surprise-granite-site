-- =============================================
-- CONTRACTOR VERIFICATION & INVITE SYSTEM
-- Run this in Supabase SQL Editor
-- =============================================

-- Add verification fields to contractors table
ALTER TABLE public.contractors ADD COLUMN IF NOT EXISTS invite_token TEXT UNIQUE;
ALTER TABLE public.contractors ADD COLUMN IF NOT EXISTS invite_sent_at TIMESTAMPTZ;
ALTER TABLE public.contractors ADD COLUMN IF NOT EXISTS claimed_by UUID REFERENCES auth.users(id);
ALTER TABLE public.contractors ADD COLUMN IF NOT EXISTS claimed_at TIMESTAMPTZ;
ALTER TABLE public.contractors ADD COLUMN IF NOT EXISTS profile_completed BOOLEAN DEFAULT false;
ALTER TABLE public.contractors ADD COLUMN IF NOT EXISTS verified BOOLEAN DEFAULT false;
ALTER TABLE public.contractors ADD COLUMN IF NOT EXISTS verified_at TIMESTAMPTZ;
ALTER TABLE public.contractors ADD COLUMN IF NOT EXISTS trust_score INTEGER DEFAULT 0;
ALTER TABLE public.contractors ADD COLUMN IF NOT EXISTS business_address TEXT;
ALTER TABLE public.contractors ADD COLUMN IF NOT EXISTS business_city TEXT;
ALTER TABLE public.contractors ADD COLUMN IF NOT EXISTS business_state TEXT;
ALTER TABLE public.contractors ADD COLUMN IF NOT EXISTS business_zip TEXT;
ALTER TABLE public.contractors ADD COLUMN IF NOT EXISTS years_in_business INTEGER;
ALTER TABLE public.contractors ADD COLUMN IF NOT EXISTS service_area TEXT;
ALTER TABLE public.contractors ADD COLUMN IF NOT EXISTS bio TEXT;
ALTER TABLE public.contractors ADD COLUMN IF NOT EXISTS website TEXT;
ALTER TABLE public.contractors ADD COLUMN IF NOT EXISTS profile_image TEXT;

-- Contractor Documents Table
CREATE TABLE IF NOT EXISTS public.contractor_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contractor_id UUID NOT NULL REFERENCES public.contractors(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  document_type TEXT NOT NULL CHECK (document_type IN (
    'insurance_general_liability',
    'insurance_workers_comp',
    'insurance_auto',
    'license_contractor',
    'license_trade',
    'w9',
    'certification',
    'bond',
    'other'
  )),

  document_name TEXT NOT NULL,
  file_url TEXT NOT NULL,
  file_type TEXT, -- pdf, image, etc

  -- Document details
  policy_number TEXT,
  issuing_company TEXT,
  coverage_amount DECIMAL(12,2),
  issue_date DATE,
  expiration_date DATE,

  -- Verification
  verified BOOLEAN DEFAULT false,
  verified_by UUID REFERENCES auth.users(id),
  verified_at TIMESTAMPTZ,
  verification_notes TEXT,

  -- Status
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'expired')),

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.contractor_documents ENABLE ROW LEVEL SECURITY;

-- Policies for contractor_documents
CREATE POLICY "contractor_docs_select" ON public.contractor_documents
  FOR SELECT USING (
    auth.uid() = user_id OR
    auth.uid() IN (SELECT user_id FROM public.contractors WHERE id = contractor_id)
  );

CREATE POLICY "contractor_docs_insert" ON public.contractor_documents
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "contractor_docs_update" ON public.contractor_documents
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "contractor_docs_delete" ON public.contractor_documents
  FOR DELETE USING (auth.uid() = user_id);

-- Contractor Invites Table (for tracking)
CREATE TABLE IF NOT EXISTS public.contractor_invites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contractor_id UUID NOT NULL REFERENCES public.contractors(id) ON DELETE CASCADE,
  invited_by UUID NOT NULL REFERENCES auth.users(id),

  invite_token TEXT UNIQUE NOT NULL,
  invite_email TEXT,
  invite_phone TEXT,

  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'viewed', 'claimed', 'expired')),

  viewed_at TIMESTAMPTZ,
  claimed_at TIMESTAMPTZ,
  claimed_by UUID REFERENCES auth.users(id),

  expires_at TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '30 days'),

  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.contractor_invites ENABLE ROW LEVEL SECURITY;

CREATE POLICY "invites_select_own" ON public.contractor_invites
  FOR SELECT USING (auth.uid() = invited_by);

CREATE POLICY "invites_insert_own" ON public.contractor_invites
  FOR INSERT WITH CHECK (auth.uid() = invited_by);

-- Function to calculate trust score
CREATE OR REPLACE FUNCTION calculate_contractor_trust_score(contractor_uuid UUID)
RETURNS INTEGER AS $$
DECLARE
  score INTEGER := 0;
  doc_count INTEGER;
  has_insurance BOOLEAN;
  has_license BOOLEAN;
  has_w9 BOOLEAN;
  contractor_record RECORD;
BEGIN
  -- Get contractor info
  SELECT * INTO contractor_record FROM public.contractors WHERE id = contractor_uuid;

  IF NOT FOUND THEN
    RETURN 0;
  END IF;

  -- Base points for profile completion
  IF contractor_record.email IS NOT NULL THEN score := score + 5; END IF;
  IF contractor_record.phone IS NOT NULL THEN score := score + 5; END IF;
  IF contractor_record.company IS NOT NULL THEN score := score + 5; END IF;
  IF contractor_record.license_number IS NOT NULL THEN score := score + 10; END IF;
  IF contractor_record.business_address IS NOT NULL THEN score := score + 5; END IF;
  IF contractor_record.bio IS NOT NULL THEN score := score + 5; END IF;
  IF contractor_record.profile_image IS NOT NULL THEN score := score + 5; END IF;
  IF contractor_record.claimed_by IS NOT NULL THEN score := score + 10; END IF;

  -- Points for verified documents
  SELECT COUNT(*) INTO doc_count
  FROM public.contractor_documents
  WHERE contractor_id = contractor_uuid AND status = 'approved';

  score := score + (doc_count * 10);

  -- Check for specific important documents
  SELECT EXISTS(
    SELECT 1 FROM public.contractor_documents
    WHERE contractor_id = contractor_uuid
    AND document_type = 'insurance_general_liability'
    AND status = 'approved'
  ) INTO has_insurance;

  SELECT EXISTS(
    SELECT 1 FROM public.contractor_documents
    WHERE contractor_id = contractor_uuid
    AND document_type IN ('license_contractor', 'license_trade')
    AND status = 'approved'
  ) INTO has_license;

  SELECT EXISTS(
    SELECT 1 FROM public.contractor_documents
    WHERE contractor_id = contractor_uuid
    AND document_type = 'w9'
    AND status = 'approved'
  ) INTO has_w9;

  -- Bonus for having key documents
  IF has_insurance THEN score := score + 15; END IF;
  IF has_license THEN score := score + 15; END IF;
  IF has_w9 THEN score := score + 10; END IF;

  -- Cap at 100
  IF score > 100 THEN score := 100; END IF;

  -- Update the contractor's trust score
  UPDATE public.contractors SET trust_score = score WHERE id = contractor_uuid;

  RETURN score;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to generate invite token
CREATE OR REPLACE FUNCTION generate_invite_token()
RETURNS TEXT AS $$
BEGIN
  RETURN encode(gen_random_bytes(24), 'base64');
END;
$$ LANGUAGE plpgsql;

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_contractor_invite_token ON public.contractors(invite_token);
CREATE INDEX IF NOT EXISTS idx_contractor_documents_contractor ON public.contractor_documents(contractor_id);
CREATE INDEX IF NOT EXISTS idx_contractor_invites_token ON public.contractor_invites(invite_token);

-- Grant execute on functions
GRANT EXECUTE ON FUNCTION calculate_contractor_trust_score TO authenticated;
GRANT EXECUTE ON FUNCTION generate_invite_token TO authenticated;

SELECT 'Contractor verification system migration complete!' as status;
