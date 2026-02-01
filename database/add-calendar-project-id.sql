-- Add project_id to calendar_events for project linking
-- Run this in Supabase SQL Editor

ALTER TABLE public.calendar_events
  ADD COLUMN IF NOT EXISTS project_id UUID REFERENCES public.projects(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS calendar_events_project_idx ON public.calendar_events(project_id);

-- Optional: Migrate existing job_id values to project_id if projects exist
-- UPDATE public.calendar_events
-- SET project_id = job_id
-- WHERE job_id IS NOT NULL AND project_id IS NULL;

COMMENT ON COLUMN public.calendar_events.project_id IS 'Link to project for unified project management';
