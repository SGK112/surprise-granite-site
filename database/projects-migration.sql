-- ============================================================
-- PROJECTS MANAGEMENT SYSTEM
-- Track jobs from estimate to completion
-- Run this in Supabase SQL Editor
-- ============================================================

-- ============================================================
-- PROJECTS TABLE - Main project/job records
-- ============================================================
CREATE TABLE IF NOT EXISTS public.projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Project Details
  name TEXT NOT NULL,
  description TEXT,

  -- Customer Info
  customer_name TEXT NOT NULL,
  customer_email TEXT,
  customer_phone TEXT,
  address TEXT,
  city TEXT,
  state TEXT,
  zip TEXT,

  -- Status & Priority
  status TEXT DEFAULT 'lead' CHECK (status IN ('lead', 'approved', 'scheduled', 'in_progress', 'completed', 'cancelled', 'on_hold')),
  priority TEXT DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'urgent')),

  -- Financials
  value DECIMAL(12,2) DEFAULT 0,
  cost DECIMAL(12,2) DEFAULT 0,
  profit DECIMAL(12,2) GENERATED ALWAYS AS (value - cost) STORED,

  -- Dates
  start_date DATE,
  end_date DATE,
  estimated_duration INTEGER, -- in days
  actual_duration INTEGER, -- in days

  -- Progress (0-100)
  progress INTEGER DEFAULT 0 CHECK (progress >= 0 AND progress <= 100),

  -- Related Records
  estimate_id UUID REFERENCES public.estimates(id) ON DELETE SET NULL,
  invoice_id UUID REFERENCES public.invoices(id) ON DELETE SET NULL,

  -- Notes
  notes TEXT, -- Internal notes
  customer_notes TEXT, -- Notes visible to customer

  -- Timestamps
  approved_at TIMESTAMPTZ,
  scheduled_at TIMESTAMPTZ,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "projects_select_own" ON public.projects
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "projects_insert_own" ON public.projects
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "projects_update_own" ON public.projects
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "projects_delete_own" ON public.projects
  FOR DELETE USING (auth.uid() = user_id);

CREATE POLICY "projects_service_all" ON public.projects
  FOR ALL USING (auth.role() = 'service_role');

-- Grant permissions
GRANT ALL ON public.projects TO authenticated;
GRANT ALL ON public.projects TO service_role;

-- Indexes
CREATE INDEX IF NOT EXISTS projects_user_idx ON public.projects(user_id);
CREATE INDEX IF NOT EXISTS projects_status_idx ON public.projects(status);
CREATE INDEX IF NOT EXISTS projects_customer_email_idx ON public.projects(customer_email);
CREATE INDEX IF NOT EXISTS projects_start_date_idx ON public.projects(start_date);
CREATE INDEX IF NOT EXISTS projects_estimate_idx ON public.projects(estimate_id);

-- ============================================================
-- PROJECT TASKS TABLE - Subtasks within a project
-- ============================================================
CREATE TABLE IF NOT EXISTS public.project_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,

  -- Task Details
  title TEXT NOT NULL,
  description TEXT,

  -- Status
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'completed', 'skipped')),

  -- Assignment
  assigned_to TEXT, -- Name or email of assigned person

  -- Dates
  due_date DATE,
  completed_at TIMESTAMPTZ,

  -- Ordering
  sort_order INTEGER DEFAULT 0,

  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.project_tasks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "project_tasks_select_own" ON public.project_tasks
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.projects WHERE id = project_id AND user_id = auth.uid())
  );

CREATE POLICY "project_tasks_insert_own" ON public.project_tasks
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM public.projects WHERE id = project_id AND user_id = auth.uid())
  );

CREATE POLICY "project_tasks_update_own" ON public.project_tasks
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM public.projects WHERE id = project_id AND user_id = auth.uid())
  );

CREATE POLICY "project_tasks_delete_own" ON public.project_tasks
  FOR DELETE USING (
    EXISTS (SELECT 1 FROM public.projects WHERE id = project_id AND user_id = auth.uid())
  );

CREATE POLICY "project_tasks_service_all" ON public.project_tasks
  FOR ALL USING (auth.role() = 'service_role');

GRANT ALL ON public.project_tasks TO authenticated;
GRANT ALL ON public.project_tasks TO service_role;

CREATE INDEX IF NOT EXISTS project_tasks_project_idx ON public.project_tasks(project_id);

-- ============================================================
-- PROJECT ACTIVITY LOG - Track all project events
-- ============================================================
CREATE TABLE IF NOT EXISTS public.project_activity (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,

  -- Activity Details
  action TEXT NOT NULL, -- 'created', 'status_changed', 'note_added', 'task_completed', etc.
  description TEXT,

  -- What changed
  old_value TEXT,
  new_value TEXT,

  -- Who did it
  user_id UUID REFERENCES auth.users(id),
  user_name TEXT,

  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.project_activity ENABLE ROW LEVEL SECURITY;

CREATE POLICY "project_activity_select_own" ON public.project_activity
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.projects WHERE id = project_id AND user_id = auth.uid())
  );

CREATE POLICY "project_activity_insert_own" ON public.project_activity
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM public.projects WHERE id = project_id AND user_id = auth.uid())
  );

CREATE POLICY "project_activity_service_all" ON public.project_activity
  FOR ALL USING (auth.role() = 'service_role');

GRANT ALL ON public.project_activity TO authenticated;
GRANT ALL ON public.project_activity TO service_role;

CREATE INDEX IF NOT EXISTS project_activity_project_idx ON public.project_activity(project_id);
CREATE INDEX IF NOT EXISTS project_activity_created_idx ON public.project_activity(created_at);

-- ============================================================
-- PROJECT FILES/DOCUMENTS
-- ============================================================
CREATE TABLE IF NOT EXISTS public.project_files (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,

  -- File Details
  name TEXT NOT NULL,
  file_type TEXT, -- 'image', 'document', 'contract', 'invoice', 'other'
  mime_type TEXT,
  file_size INTEGER,
  file_url TEXT NOT NULL,

  -- Metadata
  description TEXT,
  uploaded_by TEXT,

  -- Visibility
  visible_to_customer BOOLEAN DEFAULT false,

  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.project_files ENABLE ROW LEVEL SECURITY;

CREATE POLICY "project_files_select_own" ON public.project_files
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.projects WHERE id = project_id AND user_id = auth.uid())
  );

CREATE POLICY "project_files_insert_own" ON public.project_files
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM public.projects WHERE id = project_id AND user_id = auth.uid())
  );

CREATE POLICY "project_files_update_own" ON public.project_files
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM public.projects WHERE id = project_id AND user_id = auth.uid())
  );

CREATE POLICY "project_files_delete_own" ON public.project_files
  FOR DELETE USING (
    EXISTS (SELECT 1 FROM public.projects WHERE id = project_id AND user_id = auth.uid())
  );

CREATE POLICY "project_files_service_all" ON public.project_files
  FOR ALL USING (auth.role() = 'service_role');

GRANT ALL ON public.project_files TO authenticated;
GRANT ALL ON public.project_files TO service_role;

CREATE INDEX IF NOT EXISTS project_files_project_idx ON public.project_files(project_id);

-- ============================================================
-- PROJECT CREW/TEAM ASSIGNMENTS
-- ============================================================
CREATE TABLE IF NOT EXISTS public.project_crew (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,

  -- Crew Member
  name TEXT NOT NULL,
  role TEXT, -- 'lead', 'installer', 'helper', 'subcontractor'
  phone TEXT,
  email TEXT,

  -- Assignment Details
  hourly_rate DECIMAL(10,2),
  estimated_hours DECIMAL(10,2),
  actual_hours DECIMAL(10,2),

  -- Notes
  notes TEXT,

  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.project_crew ENABLE ROW LEVEL SECURITY;

CREATE POLICY "project_crew_select_own" ON public.project_crew
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.projects WHERE id = project_id AND user_id = auth.uid())
  );

CREATE POLICY "project_crew_insert_own" ON public.project_crew
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM public.projects WHERE id = project_id AND user_id = auth.uid())
  );

CREATE POLICY "project_crew_update_own" ON public.project_crew
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM public.projects WHERE id = project_id AND user_id = auth.uid())
  );

CREATE POLICY "project_crew_delete_own" ON public.project_crew
  FOR DELETE USING (
    EXISTS (SELECT 1 FROM public.projects WHERE id = project_id AND user_id = auth.uid())
  );

CREATE POLICY "project_crew_service_all" ON public.project_crew
  FOR ALL USING (auth.role() = 'service_role');

GRANT ALL ON public.project_crew TO authenticated;
GRANT ALL ON public.project_crew TO service_role;

CREATE INDEX IF NOT EXISTS project_crew_project_idx ON public.project_crew(project_id);

-- ============================================================
-- FUNCTIONS
-- ============================================================

-- Auto-update project progress based on completed tasks
CREATE OR REPLACE FUNCTION update_project_progress()
RETURNS TRIGGER AS $$
DECLARE
  v_total INTEGER;
  v_completed INTEGER;
  v_progress INTEGER;
BEGIN
  SELECT
    COUNT(*),
    COUNT(*) FILTER (WHERE status = 'completed')
  INTO v_total, v_completed
  FROM public.project_tasks
  WHERE project_id = COALESCE(NEW.project_id, OLD.project_id);

  IF v_total > 0 THEN
    v_progress := ROUND((v_completed::DECIMAL / v_total) * 100);
  ELSE
    v_progress := 0;
  END IF;

  UPDATE public.projects
  SET progress = v_progress, updated_at = NOW()
  WHERE id = COALESCE(NEW.project_id, OLD.project_id);

  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER project_tasks_progress_trigger
  AFTER INSERT OR UPDATE OR DELETE ON public.project_tasks
  FOR EACH ROW EXECUTE FUNCTION update_project_progress();

-- Auto-update timestamps on status change
CREATE OR REPLACE FUNCTION update_project_timestamps()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at := NOW();

  -- Set timestamp based on status change
  IF OLD.status IS DISTINCT FROM NEW.status THEN
    CASE NEW.status
      WHEN 'approved' THEN NEW.approved_at := NOW();
      WHEN 'scheduled' THEN NEW.scheduled_at := NOW();
      WHEN 'in_progress' THEN NEW.started_at := NOW();
      WHEN 'completed' THEN
        NEW.completed_at := NOW();
        NEW.progress := 100;
        IF NEW.start_date IS NOT NULL THEN
          NEW.actual_duration := CURRENT_DATE - NEW.start_date;
        END IF;
      ELSE NULL;
    END CASE;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER projects_timestamp_trigger
  BEFORE UPDATE ON public.projects
  FOR EACH ROW EXECUTE FUNCTION update_project_timestamps();

-- Log activity on project changes
CREATE OR REPLACE FUNCTION log_project_activity()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.project_activity (project_id, action, description, user_id)
    VALUES (NEW.id, 'created', 'Project created: ' || NEW.name, NEW.user_id);
  ELSIF TG_OP = 'UPDATE' THEN
    -- Log status changes
    IF OLD.status IS DISTINCT FROM NEW.status THEN
      INSERT INTO public.project_activity (project_id, action, description, old_value, new_value, user_id)
      VALUES (NEW.id, 'status_changed', 'Status changed', OLD.status, NEW.status, NEW.user_id);
    END IF;

    -- Log priority changes
    IF OLD.priority IS DISTINCT FROM NEW.priority THEN
      INSERT INTO public.project_activity (project_id, action, description, old_value, new_value, user_id)
      VALUES (NEW.id, 'priority_changed', 'Priority changed', OLD.priority, NEW.priority, NEW.user_id);
    END IF;
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER projects_activity_trigger
  AFTER INSERT OR UPDATE ON public.projects
  FOR EACH ROW EXECUTE FUNCTION log_project_activity();

-- ============================================================
-- VIEWS FOR DASHBOARD
-- ============================================================

-- Project summary by status
CREATE OR REPLACE VIEW public.project_stats AS
SELECT
  user_id,
  COUNT(*) FILTER (WHERE status = 'lead') AS leads,
  COUNT(*) FILTER (WHERE status = 'approved') AS approved,
  COUNT(*) FILTER (WHERE status = 'scheduled') AS scheduled,
  COUNT(*) FILTER (WHERE status = 'in_progress') AS in_progress,
  COUNT(*) FILTER (WHERE status = 'completed') AS completed,
  COUNT(*) AS total,
  COALESCE(SUM(value) FILTER (WHERE status = 'completed'), 0) AS revenue,
  COALESCE(SUM(value) FILTER (WHERE status IN ('lead', 'approved', 'scheduled', 'in_progress')), 0) AS pipeline_value
FROM public.projects
GROUP BY user_id;

GRANT SELECT ON public.project_stats TO authenticated;

-- ============================================================
-- COMMENTS
-- ============================================================
COMMENT ON TABLE public.projects IS 'Main projects/jobs table tracking work from estimate to completion';
COMMENT ON TABLE public.project_tasks IS 'Subtasks within a project for tracking progress';
COMMENT ON TABLE public.project_activity IS 'Activity log for all project events and changes';
COMMENT ON TABLE public.project_files IS 'Files and documents attached to projects';
COMMENT ON TABLE public.project_crew IS 'Crew members assigned to projects';

COMMENT ON COLUMN public.projects.status IS 'Project status: lead, approved, scheduled, in_progress, completed, cancelled, on_hold';
COMMENT ON COLUMN public.projects.priority IS 'Priority level: low, medium, high, urgent';
COMMENT ON COLUMN public.projects.progress IS 'Completion percentage 0-100, auto-calculated from tasks';
COMMENT ON COLUMN public.projects.profit IS 'Auto-calculated as value - cost';
