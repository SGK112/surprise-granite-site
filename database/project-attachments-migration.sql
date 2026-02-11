-- =====================================================
-- PROJECT ATTACHMENTS & COLLABORATOR DOCUMENTS MIGRATION
-- Extends the attachments system to support projects
-- Allows collaborators to upload documents to assigned projects
-- =====================================================

-- 1. Add project_id to attachments table
ALTER TABLE public.attachments
ADD COLUMN IF NOT EXISTS project_id UUID REFERENCES public.projects(id) ON DELETE CASCADE;

-- 2. Add customer_id for direct customer attachments
ALTER TABLE public.attachments
ADD COLUMN IF NOT EXISTS customer_id UUID REFERENCES public.customers(id) ON DELETE CASCADE;

-- 3. Add collaborator visibility flag
ALTER TABLE public.attachments
ADD COLUMN IF NOT EXISTS visible_to_collaborators BOOLEAN DEFAULT true;

-- 4. Add uploaded_by_collaborator to track external uploads
ALTER TABLE public.attachments
ADD COLUMN IF NOT EXISTS uploaded_by_collaborator UUID REFERENCES public.project_collaborators(id);

-- 5. Add collaborator_email for uploads by email-invited collaborators
ALTER TABLE public.attachments
ADD COLUMN IF NOT EXISTS collaborator_email TEXT;

-- 6. Create index for project attachments
CREATE INDEX IF NOT EXISTS idx_attachments_project_id ON public.attachments(project_id) WHERE project_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_attachments_customer_id ON public.attachments(customer_id) WHERE customer_id IS NOT NULL;

-- 7. RLS Policies for project attachments

-- Allow project owner to view all project attachments
DROP POLICY IF EXISTS "project_owner_view_attachments" ON public.attachments;
CREATE POLICY "project_owner_view_attachments" ON public.attachments
  FOR SELECT USING (
    project_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.projects p WHERE p.id = attachments.project_id AND p.user_id = auth.uid()
    )
  );

-- Allow project owner to insert project attachments
DROP POLICY IF EXISTS "project_owner_insert_attachments" ON public.attachments;
CREATE POLICY "project_owner_insert_attachments" ON public.attachments
  FOR INSERT WITH CHECK (
    project_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.projects p WHERE p.id = attachments.project_id AND p.user_id = auth.uid()
    )
  );

-- Allow project owner to delete project attachments
DROP POLICY IF EXISTS "project_owner_delete_attachments" ON public.attachments;
CREATE POLICY "project_owner_delete_attachments" ON public.attachments
  FOR DELETE USING (
    project_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.projects p WHERE p.id = attachments.project_id AND p.user_id = auth.uid()
    )
  );

-- Allow collaborators with write access to view attachments on their assigned projects
DROP POLICY IF EXISTS "collaborators_view_project_attachments" ON public.attachments;
CREATE POLICY "collaborators_view_project_attachments" ON public.attachments
  FOR SELECT USING (
    project_id IS NOT NULL
    AND visible_to_collaborators = true
    AND EXISTS (
      SELECT 1 FROM public.project_collaborators pc
      WHERE pc.project_id = attachments.project_id
      AND pc.user_id = auth.uid()
      AND pc.status = 'accepted'
    )
  );

-- Allow collaborators with write/admin access to upload attachments
DROP POLICY IF EXISTS "collaborators_upload_project_attachments" ON public.attachments;
CREATE POLICY "collaborators_upload_project_attachments" ON public.attachments
  FOR INSERT WITH CHECK (
    project_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.project_collaborators pc
      WHERE pc.project_id = attachments.project_id
      AND pc.user_id = auth.uid()
      AND pc.status = 'accepted'
      AND pc.access_level IN ('write', 'admin')
    )
  );

-- Allow collaborators to delete their own uploads
DROP POLICY IF EXISTS "collaborators_delete_own_attachments" ON public.attachments;
CREATE POLICY "collaborators_delete_own_attachments" ON public.attachments
  FOR DELETE USING (
    uploaded_by = auth.uid() OR uploaded_by_collaborator IN (
      SELECT id FROM public.project_collaborators WHERE user_id = auth.uid()
    )
  );

-- 8. Customer attachments policies

-- Allow owner to view customer attachments
DROP POLICY IF EXISTS "owner_view_customer_attachments" ON public.attachments;
CREATE POLICY "owner_view_customer_attachments" ON public.attachments
  FOR SELECT USING (
    customer_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.customers c WHERE c.id = attachments.customer_id AND c.user_id = auth.uid()
    )
  );

-- Allow owner to manage customer attachments
DROP POLICY IF EXISTS "owner_manage_customer_attachments" ON public.attachments;
CREATE POLICY "owner_manage_customer_attachments" ON public.attachments
  FOR ALL USING (
    customer_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.customers c WHERE c.id = attachments.customer_id AND c.user_id = auth.uid()
    )
  );

-- 9. Helper function to get project attachments with collaborator info
CREATE OR REPLACE FUNCTION get_project_attachments(p_project_id UUID)
RETURNS TABLE (
  id UUID,
  file_name TEXT,
  file_url TEXT,
  file_type TEXT,
  mime_type TEXT,
  file_size BIGINT,
  category TEXT,
  description TEXT,
  uploaded_at TIMESTAMPTZ,
  uploaded_by UUID,
  uploaded_by_name TEXT,
  is_collaborator_upload BOOLEAN,
  visible_to_customer BOOLEAN,
  visible_to_collaborators BOOLEAN
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    a.id,
    a.file_name,
    a.file_url,
    a.file_type,
    a.mime_type,
    a.file_size,
    a.category,
    a.description,
    a.uploaded_at,
    a.uploaded_by,
    COALESCE(
      (SELECT gc.name FROM public.general_collaborators gc WHERE gc.id = a.uploaded_by_collaborator),
      (SELECT u.email FROM auth.users u WHERE u.id = a.uploaded_by),
      a.collaborator_email
    ) as uploaded_by_name,
    (a.uploaded_by_collaborator IS NOT NULL OR a.collaborator_email IS NOT NULL) as is_collaborator_upload,
    COALESCE(a.visible_to_customer, false),
    COALESCE(a.visible_to_collaborators, true)
  FROM public.attachments a
  WHERE a.project_id = p_project_id
  ORDER BY a.uploaded_at DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 10. Helper function to get lead attachments
CREATE OR REPLACE FUNCTION get_lead_attachments(p_lead_id UUID)
RETURNS TABLE (
  id UUID,
  file_name TEXT,
  file_url TEXT,
  file_type TEXT,
  mime_type TEXT,
  file_size BIGINT,
  category TEXT,
  description TEXT,
  uploaded_at TIMESTAMPTZ,
  visible_to_customer BOOLEAN
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    a.id,
    a.file_name,
    a.file_url,
    a.file_type,
    a.mime_type,
    a.file_size,
    a.category,
    a.description,
    a.uploaded_at,
    COALESCE(a.visible_to_customer, false)
  FROM public.attachments a
  WHERE a.lead_id = p_lead_id
  ORDER BY a.uploaded_at DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 11. Helper function to get customer attachments
CREATE OR REPLACE FUNCTION get_customer_attachments(p_customer_id UUID)
RETURNS TABLE (
  id UUID,
  file_name TEXT,
  file_url TEXT,
  file_type TEXT,
  mime_type TEXT,
  file_size BIGINT,
  category TEXT,
  description TEXT,
  uploaded_at TIMESTAMPTZ,
  visible_to_customer BOOLEAN
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    a.id,
    a.file_name,
    a.file_url,
    a.file_type,
    a.mime_type,
    a.file_size,
    a.category,
    a.description,
    a.uploaded_at,
    COALESCE(a.visible_to_customer, false)
  FROM public.attachments a
  WHERE a.customer_id = p_customer_id
  ORDER BY a.uploaded_at DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 12. Add comment
COMMENT ON COLUMN public.attachments.project_id IS 'Link to project for project-level documents';
COMMENT ON COLUMN public.attachments.customer_id IS 'Link to customer for customer-level documents';
COMMENT ON COLUMN public.attachments.visible_to_collaborators IS 'Whether collaborators on the project can see this document';
COMMENT ON COLUMN public.attachments.uploaded_by_collaborator IS 'If uploaded by a collaborator, links to their project_collaborators record';
COMMENT ON COLUMN public.attachments.collaborator_email IS 'Email of collaborator who uploaded (for email-invited collaborators without accounts)';
