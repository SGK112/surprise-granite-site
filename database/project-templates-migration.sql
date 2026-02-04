-- =====================================================
-- PROJECT TEMPLATES MIGRATION
-- Allows users to save reusable project configurations
-- Run in Supabase SQL Editor
-- =====================================================

-- =====================================================
-- 1. PROJECT TEMPLATES TABLE
-- =====================================================

CREATE TABLE IF NOT EXISTS public.project_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Template info
  name TEXT NOT NULL,
  description TEXT,
  category TEXT CHECK (category IN (
    'kitchen', 'bathroom', 'flooring', 'outdoor', 'commercial', 'custom'
  )),

  -- Template visibility
  is_public BOOLEAN DEFAULT false,  -- Allow sharing with other users
  is_default BOOLEAN DEFAULT false, -- Mark as a default template

  -- Template data (stores project field defaults)
  template_data JSONB NOT NULL DEFAULT '{}'::JSONB,
  -- Expected structure:
  -- {
  --   project_type: 'countertop',
  --   status: 'quote',
  --   material_preferences: {},
  --   default_tasks: [],
  --   default_stages: [],
  --   pricing_defaults: {},
  --   notes_template: '',
  --   checklist: [],
  --   tags: []
  -- }

  -- Default tasks to create with project
  default_tasks JSONB DEFAULT '[]'::JSONB,
  -- Array of { title, description, priority, category }

  -- Default checklist items
  checklist_items JSONB DEFAULT '[]'::JSONB,
  -- Array of { item, required, category }

  -- Usage tracking
  times_used INTEGER DEFAULT 0,
  last_used_at TIMESTAMPTZ,

  -- Metadata
  tags TEXT[] DEFAULT '{}',
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_project_templates_user ON public.project_templates(user_id);
CREATE INDEX IF NOT EXISTS idx_project_templates_category ON public.project_templates(category);
CREATE INDEX IF NOT EXISTS idx_project_templates_public ON public.project_templates(is_public) WHERE is_public = true;
CREATE INDEX IF NOT EXISTS idx_project_templates_name ON public.project_templates(user_id, name);

-- Enable RLS
ALTER TABLE public.project_templates ENABLE ROW LEVEL SECURITY;

-- RLS Policies
DROP POLICY IF EXISTS "templates_select" ON public.project_templates;
CREATE POLICY "templates_select" ON public.project_templates
  FOR SELECT USING (
    -- Owner can see their templates
    user_id = auth.uid()
    -- Anyone can see public templates
    OR is_public = true
    -- Admins can see all
    OR EXISTS (
      SELECT 1 FROM public.sg_users
      WHERE id = auth.uid() AND account_type IN ('admin', 'super_admin')
    )
  );

DROP POLICY IF EXISTS "templates_insert" ON public.project_templates;
CREATE POLICY "templates_insert" ON public.project_templates
  FOR INSERT WITH CHECK (
    user_id = auth.uid()
  );

DROP POLICY IF EXISTS "templates_update" ON public.project_templates;
CREATE POLICY "templates_update" ON public.project_templates
  FOR UPDATE USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.sg_users
      WHERE id = auth.uid() AND account_type IN ('admin', 'super_admin')
    )
  );

DROP POLICY IF EXISTS "templates_delete" ON public.project_templates;
CREATE POLICY "templates_delete" ON public.project_templates
  FOR DELETE USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.sg_users
      WHERE id = auth.uid() AND account_type IN ('admin', 'super_admin')
    )
  );

DROP POLICY IF EXISTS "templates_service" ON public.project_templates;
CREATE POLICY "templates_service" ON public.project_templates
  FOR ALL USING (auth.role() = 'service_role');

-- Updated at trigger
DROP TRIGGER IF EXISTS project_templates_updated_at ON public.project_templates;
CREATE TRIGGER project_templates_updated_at
  BEFORE UPDATE ON public.project_templates
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Grant permissions
GRANT ALL ON public.project_templates TO authenticated;
GRANT ALL ON public.project_templates TO service_role;

-- =====================================================
-- 2. SYSTEM DEFAULT TEMPLATES (optional seed data)
-- =====================================================

-- Insert some default templates for common project types
INSERT INTO public.project_templates (
  user_id, name, description, category, is_public, is_default, template_data, default_tasks, checklist_items, tags
) VALUES
(
  (SELECT id FROM auth.users WHERE email = 'joshb@surprisegranite.com' LIMIT 1),
  'Kitchen Countertop - Standard',
  'Standard kitchen countertop project with typical measurements and tasks',
  'kitchen',
  true,
  true,
  '{
    "project_type": "countertop",
    "status": "quote",
    "material_preferences": {
      "primary": "granite",
      "edge_profile": "eased",
      "thickness": "3cm"
    },
    "pricing_defaults": {
      "include_sink_cutout": true,
      "include_faucet_holes": true,
      "include_sealer": true
    }
  }'::JSONB,
  '[
    {"title": "Initial consultation", "description": "Meet with customer to discuss options", "priority": "high", "category": "consultation"},
    {"title": "Take measurements", "description": "Measure existing countertops", "priority": "high", "category": "measurement"},
    {"title": "Create quote", "description": "Generate detailed quote for customer", "priority": "high", "category": "quote"},
    {"title": "Material selection", "description": "Customer selects slab at yard", "priority": "medium", "category": "material"},
    {"title": "Template creation", "description": "Create physical templates", "priority": "high", "category": "fabrication"},
    {"title": "Fabrication", "description": "Cut and polish countertops", "priority": "high", "category": "fabrication"},
    {"title": "Installation", "description": "Install countertops", "priority": "high", "category": "installation"},
    {"title": "Final walkthrough", "description": "Inspect work with customer", "priority": "medium", "category": "completion"}
  ]'::JSONB,
  '[
    {"item": "Measurements verified", "required": true, "category": "pre-install"},
    {"item": "Material approved", "required": true, "category": "pre-install"},
    {"item": "Plumbing disconnected", "required": true, "category": "pre-install"},
    {"item": "Old countertops removed", "required": false, "category": "pre-install"},
    {"item": "Cabinets level and secure", "required": true, "category": "pre-install"},
    {"item": "Countertops installed", "required": true, "category": "install"},
    {"item": "Sink cut and mounted", "required": true, "category": "install"},
    {"item": "Seams polished", "required": true, "category": "install"},
    {"item": "Sealer applied", "required": true, "category": "post-install"},
    {"item": "Plumbing reconnected", "required": true, "category": "post-install"},
    {"item": "Customer signed off", "required": true, "category": "completion"}
  ]'::JSONB,
  ARRAY['kitchen', 'countertop', 'standard']
),
(
  (SELECT id FROM auth.users WHERE email = 'joshb@surprisegranite.com' LIMIT 1),
  'Bathroom Vanity - Standard',
  'Standard bathroom vanity project',
  'bathroom',
  true,
  true,
  '{
    "project_type": "countertop",
    "status": "quote",
    "material_preferences": {
      "primary": "quartz",
      "edge_profile": "beveled",
      "thickness": "3cm"
    },
    "pricing_defaults": {
      "include_sink_cutout": true,
      "include_faucet_holes": true,
      "include_backsplash": true
    }
  }'::JSONB,
  '[
    {"title": "Initial consultation", "description": "Discuss bathroom options", "priority": "high", "category": "consultation"},
    {"title": "Take measurements", "description": "Measure vanity area", "priority": "high", "category": "measurement"},
    {"title": "Create quote", "description": "Generate quote", "priority": "high", "category": "quote"},
    {"title": "Material selection", "description": "Select material", "priority": "medium", "category": "material"},
    {"title": "Fabrication", "description": "Fabricate vanity top", "priority": "high", "category": "fabrication"},
    {"title": "Installation", "description": "Install vanity top", "priority": "high", "category": "installation"}
  ]'::JSONB,
  '[
    {"item": "Measurements verified", "required": true, "category": "pre-install"},
    {"item": "Material approved", "required": true, "category": "pre-install"},
    {"item": "Plumbing accessible", "required": true, "category": "pre-install"},
    {"item": "Vanity top installed", "required": true, "category": "install"},
    {"item": "Sink and faucet installed", "required": true, "category": "install"},
    {"item": "Backsplash installed", "required": false, "category": "install"},
    {"item": "Customer signed off", "required": true, "category": "completion"}
  ]'::JSONB,
  ARRAY['bathroom', 'vanity', 'standard']
),
(
  (SELECT id FROM auth.users WHERE email = 'joshb@surprisegranite.com' LIMIT 1),
  'Flooring Project - Standard',
  'Standard flooring installation project',
  'flooring',
  true,
  true,
  '{
    "project_type": "flooring",
    "status": "quote",
    "material_preferences": {
      "type": "tile",
      "pattern": "standard"
    },
    "pricing_defaults": {
      "include_removal": false,
      "include_leveling": true
    }
  }'::JSONB,
  '[
    {"title": "Initial consultation", "description": "Discuss flooring options", "priority": "high", "category": "consultation"},
    {"title": "Measure area", "description": "Calculate square footage", "priority": "high", "category": "measurement"},
    {"title": "Create quote", "description": "Generate flooring quote", "priority": "high", "category": "quote"},
    {"title": "Material selection", "description": "Customer selects flooring", "priority": "medium", "category": "material"},
    {"title": "Subfloor prep", "description": "Prepare subfloor", "priority": "high", "category": "prep"},
    {"title": "Installation", "description": "Install flooring", "priority": "high", "category": "installation"},
    {"title": "Finishing", "description": "Install transitions and trim", "priority": "medium", "category": "completion"}
  ]'::JSONB,
  '[
    {"item": "Area measured", "required": true, "category": "pre-install"},
    {"item": "Material delivered", "required": true, "category": "pre-install"},
    {"item": "Furniture moved", "required": true, "category": "pre-install"},
    {"item": "Old flooring removed", "required": false, "category": "prep"},
    {"item": "Subfloor leveled", "required": true, "category": "prep"},
    {"item": "Flooring installed", "required": true, "category": "install"},
    {"item": "Transitions installed", "required": true, "category": "completion"},
    {"item": "Area cleaned", "required": true, "category": "completion"}
  ]'::JSONB,
  ARRAY['flooring', 'tile', 'standard']
)
ON CONFLICT DO NOTHING;

COMMENT ON TABLE public.project_templates IS 'Reusable project templates for quick project creation';
