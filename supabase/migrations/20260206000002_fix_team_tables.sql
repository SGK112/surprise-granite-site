-- =====================================================
-- FIX TEAM/COLLABORATOR TABLES
-- Aligns schema with frontend code expectations
-- =====================================================

-- Add missing columns to general_collaborators
ALTER TABLE IF EXISTS general_collaborators
  ADD COLUMN IF NOT EXISTS phone TEXT,
  ADD COLUMN IF NOT EXISTS company TEXT;

-- Create project_contractors table (links projects to collaborators)
CREATE TABLE IF NOT EXISTS public.project_contractors (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  contractor_id UUID NOT NULL REFERENCES general_collaborators(id) ON DELETE CASCADE,
  role TEXT DEFAULT 'contractor',
  status TEXT DEFAULT 'assigned' CHECK (status IN ('assigned', 'active', 'completed', 'removed')),
  assigned_at TIMESTAMPTZ DEFAULT NOW(),
  assigned_by UUID REFERENCES auth.users(id),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(project_id, contractor_id)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_project_contractors_project ON project_contractors(project_id);
CREATE INDEX IF NOT EXISTS idx_project_contractors_contractor ON project_contractors(contractor_id);

-- Enable RLS
ALTER TABLE project_contractors ENABLE ROW LEVEL SECURITY;

-- RLS Policies for project_contractors
CREATE POLICY "Users can view project contractors for their projects"
  ON project_contractors FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM projects p
      WHERE p.id = project_contractors.project_id
      AND p.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can assign contractors to their projects"
  ON project_contractors FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM projects p
      WHERE p.id = project_contractors.project_id
      AND p.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update contractors on their projects"
  ON project_contractors FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM projects p
      WHERE p.id = project_contractors.project_id
      AND p.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can remove contractors from their projects"
  ON project_contractors FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM projects p
      WHERE p.id = project_contractors.project_id
      AND p.user_id = auth.uid()
    )
  );

-- Update trigger
CREATE OR REPLACE FUNCTION update_project_contractors_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_project_contractors_timestamp ON project_contractors;
CREATE TRIGGER trigger_update_project_contractors_timestamp
  BEFORE UPDATE ON project_contractors
  FOR EACH ROW
  EXECUTE FUNCTION update_project_contractors_timestamp();
