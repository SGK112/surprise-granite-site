-- =====================================================
-- EMAIL-BASED INVITATION FLOW MIGRATION
-- Enables inviting collaborators by email address
-- Run in Supabase SQL Editor
-- =====================================================

-- =====================================================
-- 1. PENDING EMAIL INVITATIONS TABLE
-- =====================================================

CREATE TABLE IF NOT EXISTS public.pending_email_invitations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Invitation context
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('designer', 'fabricator', 'contractor', 'installer', 'viewer')),
  access_level TEXT NOT NULL DEFAULT 'read' CHECK (access_level IN ('read', 'write', 'admin')),
  notes TEXT,

  -- Token for secure acceptance (SHA-256 hash only, never store raw)
  token_hash TEXT NOT NULL,
  token_expires_at TIMESTAMPTZ NOT NULL,

  -- Tracking
  invited_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'expired', 'cancelled')),

  -- Metadata
  metadata JSONB DEFAULT '{}',

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  accepted_at TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ
);

-- =====================================================
-- 2. INDEXES
-- =====================================================

-- Lookup by lowercase email (pending only)
CREATE INDEX IF NOT EXISTS idx_pending_invitations_email
  ON public.pending_email_invitations(LOWER(email)) WHERE status = 'pending';

-- Token lookup (pending only)
CREATE INDEX IF NOT EXISTS idx_pending_invitations_token_hash
  ON public.pending_email_invitations(token_hash) WHERE status = 'pending';

-- Project lookup
CREATE INDEX IF NOT EXISTS idx_pending_invitations_project
  ON public.pending_email_invitations(project_id);

-- Expiration cleanup
CREATE INDEX IF NOT EXISTS idx_pending_invitations_expires
  ON public.pending_email_invitations(token_expires_at) WHERE status = 'pending';

-- Unique: only one pending invite per project+email
CREATE UNIQUE INDEX IF NOT EXISTS idx_pending_invitations_unique_pending
  ON public.pending_email_invitations(project_id, LOWER(email)) WHERE status = 'pending';

-- =====================================================
-- 3. ROW LEVEL SECURITY
-- =====================================================

ALTER TABLE public.pending_email_invitations ENABLE ROW LEVEL SECURITY;

-- Service role full access
DROP POLICY IF EXISTS "pending_invitations_service" ON public.pending_email_invitations;
CREATE POLICY "pending_invitations_service" ON public.pending_email_invitations
  FOR ALL USING (auth.role() = 'service_role');

-- Users can view invitations they sent
DROP POLICY IF EXISTS "pending_invitations_select_own" ON public.pending_email_invitations;
CREATE POLICY "pending_invitations_select_own" ON public.pending_email_invitations
  FOR SELECT USING (invited_by = auth.uid());

-- Users can insert invitations they send
DROP POLICY IF EXISTS "pending_invitations_insert_own" ON public.pending_email_invitations;
CREATE POLICY "pending_invitations_insert_own" ON public.pending_email_invitations
  FOR INSERT WITH CHECK (invited_by = auth.uid());

-- Users can update invitations they sent (cancel)
DROP POLICY IF EXISTS "pending_invitations_update_own" ON public.pending_email_invitations;
CREATE POLICY "pending_invitations_update_own" ON public.pending_email_invitations
  FOR UPDATE USING (invited_by = auth.uid());

-- Super admin full access
DROP POLICY IF EXISTS "pending_invitations_super_admin" ON public.pending_email_invitations;
CREATE POLICY "pending_invitations_super_admin" ON public.pending_email_invitations
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.sg_users WHERE id = auth.uid() AND role = 'super_admin')
  );

-- Grants
GRANT ALL ON public.pending_email_invitations TO authenticated;
GRANT ALL ON public.pending_email_invitations TO service_role;

-- =====================================================
-- 4. CLAIM PENDING INVITATIONS FUNCTION
-- Atomically claims all pending invitations for an email
-- =====================================================

CREATE OR REPLACE FUNCTION public.claim_pending_invitations(p_user_id UUID, p_email TEXT)
RETURNS INTEGER AS $$
DECLARE
  claimed_count INTEGER := 0;
  inv RECORD;
BEGIN
  FOR inv IN
    SELECT * FROM public.pending_email_invitations
    WHERE LOWER(email) = LOWER(p_email)
      AND status = 'pending'
      AND token_expires_at > NOW()
  LOOP
    -- Create project_collaborators record as accepted
    INSERT INTO public.project_collaborators (
      project_id, user_id, role, access_level, notes,
      invited_by, invitation_status, accepted_at
    ) VALUES (
      inv.project_id, p_user_id, inv.role, inv.access_level, inv.notes,
      inv.invited_by, 'accepted', NOW()
    )
    ON CONFLICT (project_id, user_id) DO UPDATE SET
      invitation_status = 'accepted',
      accepted_at = NOW(),
      role = EXCLUDED.role,
      access_level = EXCLUDED.access_level;

    -- Mark invitation as accepted
    UPDATE public.pending_email_invitations
    SET status = 'accepted', accepted_at = NOW()
    WHERE id = inv.id;

    claimed_count := claimed_count + 1;
  END LOOP;

  RETURN claimed_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.claim_pending_invitations TO authenticated;
GRANT EXECUTE ON FUNCTION public.claim_pending_invitations TO service_role;

-- =====================================================
-- 5. AUTO-CLAIM TRIGGER ON SG_USERS INSERT
-- When a new user signs up, auto-claim any pending invitations
-- =====================================================

CREATE OR REPLACE FUNCTION public.trigger_claim_invitations_on_signup()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.email IS NOT NULL THEN
    PERFORM public.claim_pending_invitations(NEW.id, NEW.email);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_user_created_claim_invitations ON public.sg_users;
CREATE TRIGGER on_user_created_claim_invitations
  AFTER INSERT ON public.sg_users
  FOR EACH ROW
  EXECUTE FUNCTION public.trigger_claim_invitations_on_signup();
