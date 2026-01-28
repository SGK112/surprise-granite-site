-- =====================================================
-- GENERAL COLLABORATORS MIGRATION
-- Project-independent collaboration invites
-- Allows inviting collaborators without requiring a project
-- =====================================================

-- General collaborators (not tied to specific projects)
CREATE TABLE IF NOT EXISTS public.general_collaborators (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  invited_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  email TEXT NOT NULL,
  name TEXT,
  role TEXT NOT NULL CHECK (role IN ('designer', 'fabricator', 'contractor', 'installer', 'vendor', 'partner')),
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'declined', 'removed')),
  notes TEXT,
  token_hash TEXT,
  token_expires_at TIMESTAMPTZ,
  invited_at TIMESTAMPTZ DEFAULT NOW(),
  accepted_at TIMESTAMPTZ,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(invited_by, email)
);

-- Indexes for efficient queries
CREATE INDEX IF NOT EXISTS idx_general_collaborators_email ON general_collaborators(LOWER(email)) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_general_collaborators_invited_by ON general_collaborators(invited_by);
CREATE INDEX IF NOT EXISTS idx_general_collaborators_user_id ON general_collaborators(user_id) WHERE user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_general_collaborators_status ON general_collaborators(status);

-- Enable RLS
ALTER TABLE general_collaborators ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view collaborators they invited
CREATE POLICY "Users can view their own collaborators"
  ON general_collaborators FOR SELECT
  USING (invited_by = auth.uid() OR user_id = auth.uid());

-- Policy: Users can insert collaborators
CREATE POLICY "Users can invite collaborators"
  ON general_collaborators FOR INSERT
  WITH CHECK (invited_by = auth.uid());

-- Policy: Users can update their own collaborators (or respond to invitations)
CREATE POLICY "Users can update collaborators"
  ON general_collaborators FOR UPDATE
  USING (invited_by = auth.uid() OR user_id = auth.uid());

-- Policy: Users can delete (remove) their own collaborators
CREATE POLICY "Users can remove collaborators"
  ON general_collaborators FOR DELETE
  USING (invited_by = auth.uid());

-- Update timestamp trigger
CREATE OR REPLACE FUNCTION update_general_collaborators_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_general_collaborators_timestamp
  BEFORE UPDATE ON general_collaborators
  FOR EACH ROW
  EXECUTE FUNCTION update_general_collaborators_updated_at();

-- Function to assign a general collaborator to a project
CREATE OR REPLACE FUNCTION assign_collaborator_to_project(
  p_collaborator_id UUID,
  p_project_id UUID,
  p_access_level TEXT DEFAULT 'read'
)
RETURNS UUID AS $$
DECLARE
  v_collab RECORD;
  v_new_id UUID;
BEGIN
  -- Get the collaborator
  SELECT * INTO v_collab FROM general_collaborators WHERE id = p_collaborator_id AND status = 'accepted';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Collaborator not found or not accepted';
  END IF;

  -- Insert into project_collaborators
  INSERT INTO project_collaborators (
    project_id,
    user_id,
    role,
    access_level,
    invitation_status,
    invited_by,
    accepted_at,
    notes
  ) VALUES (
    p_project_id,
    v_collab.user_id,
    v_collab.role,
    p_access_level,
    'accepted',
    v_collab.invited_by,
    NOW(),
    v_collab.notes
  )
  ON CONFLICT (project_id, user_id) DO UPDATE SET
    role = EXCLUDED.role,
    access_level = EXCLUDED.access_level,
    invitation_status = 'accepted',
    updated_at = NOW()
  RETURNING id INTO v_new_id;

  RETURN v_new_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON TABLE general_collaborators IS 'Stores project-independent collaboration relationships. Collaborators can later be assigned to specific projects.';
