-- =====================================================
-- PROJECT NOTES & COMMENTS MIGRATION
-- Adds notes/comments system for projects
-- Run in Supabase SQL Editor
-- =====================================================

-- =====================================================
-- 1. PROJECT NOTES TABLE
-- =====================================================

CREATE TABLE IF NOT EXISTS public.project_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Content
  content TEXT NOT NULL,
  note_type TEXT NOT NULL DEFAULT 'general' CHECK (note_type IN (
    'general', 'internal', 'customer_communication', 'issue', 'resolution',
    'measurement', 'material', 'scheduling', 'billing', 'feedback'
  )),

  -- Visibility
  is_internal BOOLEAN DEFAULT true,
  visible_to_customer BOOLEAN DEFAULT false,
  visible_to_contractor BOOLEAN DEFAULT false,

  -- Threading (for replies)
  parent_note_id UUID REFERENCES public.project_notes(id) ON DELETE CASCADE,

  -- Attachments
  attachments JSONB DEFAULT '[]', -- Array of {name, url, type, size}

  -- Status
  is_pinned BOOLEAN DEFAULT false,
  is_resolved BOOLEAN DEFAULT false,
  resolved_at TIMESTAMPTZ,
  resolved_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,

  -- Metadata
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_project_notes_project ON public.project_notes(project_id);
CREATE INDEX IF NOT EXISTS idx_project_notes_user ON public.project_notes(user_id);
CREATE INDEX IF NOT EXISTS idx_project_notes_type ON public.project_notes(note_type);
CREATE INDEX IF NOT EXISTS idx_project_notes_parent ON public.project_notes(parent_note_id);
CREATE INDEX IF NOT EXISTS idx_project_notes_pinned ON public.project_notes(project_id, is_pinned) WHERE is_pinned = true;

-- Enable RLS
ALTER TABLE public.project_notes ENABLE ROW LEVEL SECURITY;

-- RLS Policies
DROP POLICY IF EXISTS "notes_select" ON public.project_notes;
CREATE POLICY "notes_select" ON public.project_notes
  FOR SELECT USING (
    -- Project owner can see all notes
    EXISTS (SELECT 1 FROM public.projects WHERE id = project_id AND user_id = auth.uid())
    -- Note creator can see their own
    OR user_id = auth.uid()
    -- Collaborators can see based on their access
    OR EXISTS (
      SELECT 1 FROM public.project_collaborators
      WHERE project_id = project_notes.project_id
        AND user_id = auth.uid()
        AND invitation_status = 'accepted'
    )
  );

DROP POLICY IF EXISTS "notes_insert" ON public.project_notes;
CREATE POLICY "notes_insert" ON public.project_notes
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM public.projects WHERE id = project_id AND user_id = auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.project_collaborators
      WHERE project_id = project_notes.project_id
        AND user_id = auth.uid()
        AND invitation_status = 'accepted'
        AND access_level IN ('write', 'admin')
    )
  );

DROP POLICY IF EXISTS "notes_update" ON public.project_notes;
CREATE POLICY "notes_update" ON public.project_notes
  FOR UPDATE USING (
    user_id = auth.uid()
    OR EXISTS (SELECT 1 FROM public.projects WHERE id = project_id AND user_id = auth.uid())
  );

DROP POLICY IF EXISTS "notes_delete" ON public.project_notes;
CREATE POLICY "notes_delete" ON public.project_notes
  FOR DELETE USING (
    user_id = auth.uid()
    OR EXISTS (SELECT 1 FROM public.projects WHERE id = project_id AND user_id = auth.uid())
  );

DROP POLICY IF EXISTS "notes_service" ON public.project_notes;
CREATE POLICY "notes_service" ON public.project_notes
  FOR ALL USING (auth.role() = 'service_role');

-- Updated at trigger
DROP TRIGGER IF EXISTS project_notes_updated_at ON public.project_notes;
CREATE TRIGGER project_notes_updated_at
  BEFORE UPDATE ON public.project_notes
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Grant permissions
GRANT ALL ON public.project_notes TO authenticated;
GRANT ALL ON public.project_notes TO service_role;

-- =====================================================
-- 2. NOTIFICATION FOR NOTES (optional)
-- =====================================================

-- Add note notification types if they don't exist
DO $$
BEGIN
  ALTER TABLE public.pro_notifications DROP CONSTRAINT IF EXISTS pro_notifications_notification_type_check;
  ALTER TABLE public.pro_notifications ADD CONSTRAINT pro_notifications_notification_type_check
    CHECK (notification_type IN (
      'new_customer', 'favorite_added', 'wishlist_shared',
      'estimate_requested', 'design_shared', 'customer_active',
      'weekly_summary', 'system',
      'collaborator_invited', 'collaborator_accepted',
      'design_handoff_created', 'design_handoff_stage_change',
      'fabrication_quote_ready', 'install_scheduled',
      'handoff_review_requested', 'handoff_completed',
      'project_note_added', 'project_note_reply', 'project_note_mention'
    ));
EXCEPTION
  WHEN OTHERS THEN NULL;
END $$;
