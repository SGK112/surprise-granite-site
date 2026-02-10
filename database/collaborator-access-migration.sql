-- =====================================================
-- COLLABORATOR ACCESS MIGRATION
-- Allow collaborators to view projects they're assigned to
-- =====================================================

-- Add scope_of_work column to projects if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name = 'projects' AND column_name = 'scope_of_work') THEN
    ALTER TABLE projects ADD COLUMN scope_of_work TEXT;
  END IF;
END $$;

COMMENT ON COLUMN projects.scope_of_work IS 'Detailed scope of work/statement of work for the project';

-- Drop existing select policy for projects and recreate with collaborator access
DROP POLICY IF EXISTS "projects_select_own" ON projects;
DROP POLICY IF EXISTS "projects_select_collaborator" ON projects;

-- Create policy: Owners can view their own projects
CREATE POLICY "projects_select_own" ON projects
  FOR SELECT USING (auth.uid() = user_id);

-- Create policy: Collaborators can view projects they're assigned to
CREATE POLICY "projects_select_collaborator" ON projects
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM project_contractors
      WHERE project_contractors.project_id = projects.id
      AND project_contractors.contractor_id = auth.uid()
    )
  );

-- Allow collaborators to view project_tasks
DROP POLICY IF EXISTS "project_tasks_select_collaborator" ON project_tasks;
CREATE POLICY "project_tasks_select_collaborator" ON project_tasks
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM project_contractors
      WHERE project_contractors.project_id = project_tasks.project_id
      AND project_contractors.contractor_id = auth.uid()
    )
  );

-- Allow collaborators to update their assigned tasks
DROP POLICY IF EXISTS "project_tasks_update_collaborator" ON project_tasks;
CREATE POLICY "project_tasks_update_collaborator" ON project_tasks
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM project_contractors
      WHERE project_contractors.project_id = project_tasks.project_id
      AND project_contractors.contractor_id = auth.uid()
    )
  );

-- Allow collaborators to view project_activity
DROP POLICY IF EXISTS "project_activity_select_collaborator" ON project_activity;
CREATE POLICY "project_activity_select_collaborator" ON project_activity
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM project_contractors
      WHERE project_contractors.project_id = project_activity.project_id
      AND project_contractors.contractor_id = auth.uid()
    )
  );

-- Allow collaborators to log activity
DROP POLICY IF EXISTS "project_activity_insert_collaborator" ON project_activity;
CREATE POLICY "project_activity_insert_collaborator" ON project_activity
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM project_contractors
      WHERE project_contractors.project_id = project_activity.project_id
      AND project_contractors.contractor_id = auth.uid()
    )
  );

-- Allow collaborators to view project_files (if marked visible_to_customer or they're assigned)
DROP POLICY IF EXISTS "project_files_select_collaborator" ON project_files;
CREATE POLICY "project_files_select_collaborator" ON project_files
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM project_contractors
      WHERE project_contractors.project_id = project_files.project_id
      AND project_contractors.contractor_id = auth.uid()
    )
  );

-- Allow collaborators to upload files to their assigned projects
DROP POLICY IF EXISTS "project_files_insert_collaborator" ON project_files;
CREATE POLICY "project_files_insert_collaborator" ON project_files
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM project_contractors
      WHERE project_contractors.project_id = project_files.project_id
      AND project_contractors.contractor_id = auth.uid()
    )
  );

-- Allow collaborators to view project_crew (team info)
DROP POLICY IF EXISTS "project_crew_select_collaborator" ON project_crew;
CREATE POLICY "project_crew_select_collaborator" ON project_crew
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM project_contractors
      WHERE project_contractors.project_id = project_crew.project_id
      AND project_contractors.contractor_id = auth.uid()
    )
  );

-- Also allow viewing via general_collaborators for network members assigned to projects
DROP POLICY IF EXISTS "projects_select_network_collaborator" ON projects;
CREATE POLICY "projects_select_network_collaborator" ON projects
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM project_collaborators pc
      JOIN general_collaborators gc ON gc.user_id = auth.uid() AND gc.status = 'accepted'
      WHERE pc.project_id = projects.id
      AND (pc.user_id = auth.uid() OR pc.invited_by = gc.invited_by)
      AND pc.invitation_status = 'accepted'
    )
  );
