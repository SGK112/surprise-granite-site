-- =====================================================
-- COLLABORATION UPDATES MIGRATION
-- Adds ability to view and respond to invitations by email
-- =====================================================

-- Drop existing policies to recreate them with better logic
DROP POLICY IF EXISTS "Users can view their own collaborators" ON general_collaborators;
DROP POLICY IF EXISTS "Users can update collaborators" ON general_collaborators;

-- Policy: Users can view collaborators they invited OR invitations sent to their email
CREATE POLICY "Users can view their collaborators or invitations"
  ON general_collaborators FOR SELECT
  USING (
    invited_by = auth.uid()
    OR user_id = auth.uid()
    OR LOWER(email) = LOWER((SELECT email FROM auth.users WHERE id = auth.uid()))
  );

-- Policy: Users can update their own collaborators OR respond to their own invitations
CREATE POLICY "Users can update collaborators or respond to invitations"
  ON general_collaborators FOR UPDATE
  USING (
    invited_by = auth.uid()
    OR user_id = auth.uid()
    OR LOWER(email) = LOWER((SELECT email FROM auth.users WHERE id = auth.uid()))
  );

-- Add phone column if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name = 'general_collaborators' AND column_name = 'phone') THEN
    ALTER TABLE general_collaborators ADD COLUMN phone TEXT;
  END IF;
END $$;

-- Add company column if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name = 'general_collaborators' AND column_name = 'company') THEN
    ALTER TABLE general_collaborators ADD COLUMN company TEXT;
  END IF;
END $$;

-- Ensure project_collaborators has similar structure for project invites
-- Add token_expires_at to project_collaborators if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name = 'project_collaborators' AND column_name = 'token_expires_at') THEN
    ALTER TABLE project_collaborators ADD COLUMN token_expires_at TIMESTAMPTZ;
  END IF;
END $$;

-- Add email column to project_collaborators for inviting by email
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name = 'project_collaborators' AND column_name = 'email') THEN
    ALTER TABLE project_collaborators ADD COLUMN email TEXT;
  END IF;
END $$;

-- Update project_collaborators RLS to allow viewing invitations by email
DROP POLICY IF EXISTS "Users can view project collaborators" ON project_collaborators;
CREATE POLICY "Users can view project collaborators or own invitations"
  ON project_collaborators FOR SELECT
  USING (
    user_id = auth.uid()
    OR invited_by = auth.uid()
    OR LOWER(email) = LOWER((SELECT email FROM auth.users WHERE id = auth.uid()))
    OR EXISTS (
      SELECT 1 FROM projects
      WHERE projects.id = project_collaborators.project_id
      AND projects.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Users can update project collaborators" ON project_collaborators;
CREATE POLICY "Users can update project collaborators or respond to invitations"
  ON project_collaborators FOR UPDATE
  USING (
    user_id = auth.uid()
    OR invited_by = auth.uid()
    OR LOWER(email) = LOWER((SELECT email FROM auth.users WHERE id = auth.uid()))
    OR EXISTS (
      SELECT 1 FROM projects
      WHERE projects.id = project_collaborators.project_id
      AND projects.user_id = auth.uid()
    )
  );
