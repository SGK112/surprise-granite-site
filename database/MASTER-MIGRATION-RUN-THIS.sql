-- ============================================================
-- MASTER MIGRATION - RUN THIS IN SUPABASE SQL EDITOR
-- Creates all missing tables in the correct dependency order
-- Safe to run multiple times (uses IF NOT EXISTS)
-- ============================================================

-- ============================================================
-- STEP 1: BASE TABLES (No dependencies)
-- ============================================================

-- 1A. LEADS TABLE
CREATE TABLE IF NOT EXISTS public.leads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Lead info (multiple naming conventions for compatibility)
  name TEXT,
  full_name TEXT,
  first_name TEXT,
  last_name TEXT,
  homeowner_name TEXT,

  -- Contact
  email TEXT,
  homeowner_email TEXT,
  phone TEXT,
  homeowner_phone TEXT,

  -- Address
  address TEXT,
  project_address TEXT,
  city TEXT,
  state TEXT,
  zip TEXT,
  project_zip TEXT,

  -- Project details
  project_type TEXT,
  project_budget TEXT,
  project_timeline TEXT,
  project_details TEXT,
  description TEXT,
  message TEXT,

  -- Source
  source TEXT DEFAULT 'website',
  source_details TEXT,
  form_name TEXT DEFAULT 'website',

  -- Appointment
  appointment_date TEXT,
  appointment_time TEXT,
  appointment_status TEXT DEFAULT 'scheduled',

  -- Assignment
  assigned_to UUID REFERENCES auth.users(id),
  claimed_at TIMESTAMPTZ,

  -- Status
  status TEXT DEFAULT 'new',
  lead_price DECIMAL(10,2) DEFAULT 15,

  -- Metadata
  notes TEXT,
  raw_data JSONB,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.leads ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "leads_select_own" ON public.leads;
DROP POLICY IF EXISTS "leads_update_own" ON public.leads;
DROP POLICY IF EXISTS "leads_insert_own" ON public.leads;
DROP POLICY IF EXISTS "leads_delete_own" ON public.leads;
DROP POLICY IF EXISTS "leads_public_insert" ON public.leads;
DROP POLICY IF EXISTS "leads_service_all" ON public.leads;

CREATE POLICY "leads_select_own" ON public.leads FOR SELECT USING (
  user_id = auth.uid() OR assigned_to = auth.uid() OR user_id IS NULL
);
CREATE POLICY "leads_insert_own" ON public.leads FOR INSERT WITH CHECK (true);
CREATE POLICY "leads_update_own" ON public.leads FOR UPDATE USING (
  user_id = auth.uid() OR assigned_to = auth.uid()
);
CREATE POLICY "leads_delete_own" ON public.leads FOR DELETE USING (user_id = auth.uid());
CREATE POLICY "leads_service_all" ON public.leads FOR ALL USING (auth.role() = 'service_role');

GRANT ALL ON public.leads TO authenticated;
GRANT ALL ON public.leads TO service_role;
GRANT INSERT ON public.leads TO anon;

CREATE INDEX IF NOT EXISTS leads_user_id_idx ON public.leads(user_id);
CREATE INDEX IF NOT EXISTS leads_email_idx ON public.leads(email);
CREATE INDEX IF NOT EXISTS leads_homeowner_email_idx ON public.leads(homeowner_email);
CREATE INDEX IF NOT EXISTS leads_status_idx ON public.leads(status);
CREATE INDEX IF NOT EXISTS leads_created_at_idx ON public.leads(created_at DESC);

-- 1B. CUSTOMERS TABLE
CREATE TABLE IF NOT EXISTS public.customers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Customer Info
  name TEXT NOT NULL,
  email TEXT,
  phone TEXT,

  -- Address
  address TEXT,
  city TEXT,
  state TEXT,
  zip TEXT,

  -- Metadata
  notes TEXT,
  tags TEXT[],
  source TEXT DEFAULT 'manual',
  lead_id UUID,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "customers_select_own" ON public.customers;
DROP POLICY IF EXISTS "customers_insert_own" ON public.customers;
DROP POLICY IF EXISTS "customers_update_own" ON public.customers;
DROP POLICY IF EXISTS "customers_delete_own" ON public.customers;
DROP POLICY IF EXISTS "customers_service_all" ON public.customers;

CREATE POLICY "customers_select_own" ON public.customers FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "customers_insert_own" ON public.customers FOR INSERT WITH CHECK (user_id = auth.uid());
CREATE POLICY "customers_update_own" ON public.customers FOR UPDATE USING (user_id = auth.uid());
CREATE POLICY "customers_delete_own" ON public.customers FOR DELETE USING (user_id = auth.uid());
CREATE POLICY "customers_service_all" ON public.customers FOR ALL USING (auth.role() = 'service_role');

GRANT ALL ON public.customers TO authenticated;
GRANT ALL ON public.customers TO service_role;

CREATE INDEX IF NOT EXISTS customers_user_idx ON public.customers(user_id);
CREATE INDEX IF NOT EXISTS customers_email_idx ON public.customers(email);

-- 1C. ESTIMATES TABLE
CREATE TABLE IF NOT EXISTS public.estimates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Estimate number
  estimate_number TEXT,

  -- Customer Info
  customer_id UUID,
  customer_name TEXT NOT NULL,
  customer_email TEXT,
  customer_phone TEXT,
  customer_address TEXT,

  -- Estimate Details
  title TEXT,
  description TEXT,

  -- Line items stored as JSONB
  line_items JSONB DEFAULT '[]',

  -- Totals
  subtotal DECIMAL(12,2) DEFAULT 0,
  tax_rate DECIMAL(5,2) DEFAULT 0,
  tax_amount DECIMAL(12,2) DEFAULT 0,
  discount DECIMAL(12,2) DEFAULT 0,
  total DECIMAL(12,2) DEFAULT 0,

  -- Status
  status TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'sent', 'viewed', 'approved', 'declined', 'expired')),

  -- Dates
  valid_until DATE,
  sent_at TIMESTAMPTZ,
  viewed_at TIMESTAMPTZ,
  approved_at TIMESTAMPTZ,
  declined_at TIMESTAMPTZ,

  -- Notes
  notes TEXT,
  terms TEXT,

  -- Metadata
  metadata JSONB DEFAULT '{}',

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.estimates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "estimates_select_own" ON public.estimates;
DROP POLICY IF EXISTS "estimates_insert_own" ON public.estimates;
DROP POLICY IF EXISTS "estimates_update_own" ON public.estimates;
DROP POLICY IF EXISTS "estimates_delete_own" ON public.estimates;
DROP POLICY IF EXISTS "estimates_service_all" ON public.estimates;

CREATE POLICY "estimates_select_own" ON public.estimates FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "estimates_insert_own" ON public.estimates FOR INSERT WITH CHECK (user_id = auth.uid());
CREATE POLICY "estimates_update_own" ON public.estimates FOR UPDATE USING (user_id = auth.uid());
CREATE POLICY "estimates_delete_own" ON public.estimates FOR DELETE USING (user_id = auth.uid());
CREATE POLICY "estimates_service_all" ON public.estimates FOR ALL USING (auth.role() = 'service_role');

GRANT ALL ON public.estimates TO authenticated;
GRANT ALL ON public.estimates TO service_role;

CREATE INDEX IF NOT EXISTS estimates_user_idx ON public.estimates(user_id);
CREATE INDEX IF NOT EXISTS estimates_status_idx ON public.estimates(status);
CREATE INDEX IF NOT EXISTS estimates_customer_idx ON public.estimates(customer_id);

-- 1D. INVOICES TABLE
CREATE TABLE IF NOT EXISTS public.invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Invoice number
  invoice_number TEXT,

  -- Customer Info
  customer_id UUID,
  customer_name TEXT NOT NULL,
  customer_email TEXT,
  customer_phone TEXT,
  customer_address TEXT,

  -- Invoice Details
  title TEXT,
  description TEXT,

  -- Line items stored as JSONB
  line_items JSONB DEFAULT '[]',

  -- Totals
  subtotal DECIMAL(12,2) DEFAULT 0,
  tax_rate DECIMAL(5,2) DEFAULT 0,
  tax_amount DECIMAL(12,2) DEFAULT 0,
  discount DECIMAL(12,2) DEFAULT 0,
  total DECIMAL(12,2) DEFAULT 0,
  amount_paid DECIMAL(12,2) DEFAULT 0,
  balance_due DECIMAL(12,2) GENERATED ALWAYS AS (total - amount_paid) STORED,

  -- Status
  status TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'sent', 'viewed', 'partial', 'paid', 'overdue', 'cancelled')),

  -- Dates
  issue_date DATE DEFAULT CURRENT_DATE,
  due_date DATE,
  sent_at TIMESTAMPTZ,
  viewed_at TIMESTAMPTZ,
  paid_at TIMESTAMPTZ,

  -- Payment
  payment_method TEXT,
  payment_reference TEXT,

  -- Notes
  notes TEXT,
  terms TEXT,

  -- Related records
  estimate_id UUID,
  project_id UUID,

  -- Metadata
  metadata JSONB DEFAULT '{}',

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "invoices_select_own" ON public.invoices;
DROP POLICY IF EXISTS "invoices_insert_own" ON public.invoices;
DROP POLICY IF EXISTS "invoices_update_own" ON public.invoices;
DROP POLICY IF EXISTS "invoices_delete_own" ON public.invoices;
DROP POLICY IF EXISTS "invoices_service_all" ON public.invoices;

CREATE POLICY "invoices_select_own" ON public.invoices FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "invoices_insert_own" ON public.invoices FOR INSERT WITH CHECK (user_id = auth.uid());
CREATE POLICY "invoices_update_own" ON public.invoices FOR UPDATE USING (user_id = auth.uid());
CREATE POLICY "invoices_delete_own" ON public.invoices FOR DELETE USING (user_id = auth.uid());
CREATE POLICY "invoices_service_all" ON public.invoices FOR ALL USING (auth.role() = 'service_role');

GRANT ALL ON public.invoices TO authenticated;
GRANT ALL ON public.invoices TO service_role;

CREATE INDEX IF NOT EXISTS invoices_user_idx ON public.invoices(user_id);
CREATE INDEX IF NOT EXISTS invoices_status_idx ON public.invoices(status);
CREATE INDEX IF NOT EXISTS invoices_customer_idx ON public.invoices(customer_id);

-- 1E. JOBS TABLE
CREATE TABLE IF NOT EXISTS public.jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Job Details
  name TEXT NOT NULL,
  description TEXT,

  -- Customer
  customer_id UUID REFERENCES public.customers(id) ON DELETE SET NULL,
  customer_name TEXT,

  -- Status
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'scheduled', 'in_progress', 'completed', 'cancelled')),

  -- Dates
  scheduled_date DATE,
  completed_date DATE,

  -- Financials
  value DECIMAL(12,2) DEFAULT 0,

  -- Notes
  notes TEXT,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.jobs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "jobs_select_own" ON public.jobs;
DROP POLICY IF EXISTS "jobs_insert_own" ON public.jobs;
DROP POLICY IF EXISTS "jobs_update_own" ON public.jobs;
DROP POLICY IF EXISTS "jobs_delete_own" ON public.jobs;
DROP POLICY IF EXISTS "jobs_service_all" ON public.jobs;

CREATE POLICY "jobs_select_own" ON public.jobs FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "jobs_insert_own" ON public.jobs FOR INSERT WITH CHECK (user_id = auth.uid());
CREATE POLICY "jobs_update_own" ON public.jobs FOR UPDATE USING (user_id = auth.uid());
CREATE POLICY "jobs_delete_own" ON public.jobs FOR DELETE USING (user_id = auth.uid());
CREATE POLICY "jobs_service_all" ON public.jobs FOR ALL USING (auth.role() = 'service_role');

GRANT ALL ON public.jobs TO authenticated;
GRANT ALL ON public.jobs TO service_role;

CREATE INDEX IF NOT EXISTS jobs_user_idx ON public.jobs(user_id);
CREATE INDEX IF NOT EXISTS jobs_status_idx ON public.jobs(status);

-- ============================================================
-- STEP 2: PROJECTS TABLE (depends on estimates, invoices)
-- ============================================================

CREATE TABLE IF NOT EXISTS public.projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Project Details
  name TEXT NOT NULL,
  description TEXT,

  -- Customer Info
  customer_id UUID REFERENCES public.customers(id) ON DELETE SET NULL,
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

  -- Dates
  start_date DATE,
  end_date DATE,
  estimated_duration INTEGER,
  actual_duration INTEGER,

  -- Progress (0-100)
  progress INTEGER DEFAULT 0 CHECK (progress >= 0 AND progress <= 100),

  -- Related Records
  lead_id UUID REFERENCES public.leads(id) ON DELETE SET NULL,
  estimate_id UUID REFERENCES public.estimates(id) ON DELETE SET NULL,
  invoice_id UUID REFERENCES public.invoices(id) ON DELETE SET NULL,

  -- Notes
  notes TEXT,
  customer_notes TEXT,

  -- Timestamps
  approved_at TIMESTAMPTZ,
  scheduled_at TIMESTAMPTZ,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "projects_select_own" ON public.projects;
DROP POLICY IF EXISTS "projects_insert_own" ON public.projects;
DROP POLICY IF EXISTS "projects_update_own" ON public.projects;
DROP POLICY IF EXISTS "projects_delete_own" ON public.projects;
DROP POLICY IF EXISTS "projects_service_all" ON public.projects;

CREATE POLICY "projects_select_own" ON public.projects FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "projects_insert_own" ON public.projects FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "projects_update_own" ON public.projects FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "projects_delete_own" ON public.projects FOR DELETE USING (auth.uid() = user_id);
CREATE POLICY "projects_service_all" ON public.projects FOR ALL USING (auth.role() = 'service_role');

GRANT ALL ON public.projects TO authenticated;
GRANT ALL ON public.projects TO service_role;

CREATE INDEX IF NOT EXISTS projects_user_idx ON public.projects(user_id);
CREATE INDEX IF NOT EXISTS projects_status_idx ON public.projects(status);
CREATE INDEX IF NOT EXISTS projects_customer_email_idx ON public.projects(customer_email);
CREATE INDEX IF NOT EXISTS projects_start_date_idx ON public.projects(start_date);
CREATE INDEX IF NOT EXISTS projects_lead_idx ON public.projects(lead_id);

-- ============================================================
-- STEP 3: PROJECT RELATED TABLES
-- ============================================================

-- 3A. PROJECT TASKS
CREATE TABLE IF NOT EXISTS public.project_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,

  -- Task Details
  title TEXT NOT NULL,
  description TEXT,

  -- Status
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'completed', 'skipped')),

  -- Assignment
  assigned_to TEXT,

  -- Dates
  due_date DATE,
  completed_at TIMESTAMPTZ,

  -- Ordering
  sort_order INTEGER DEFAULT 0,

  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.project_tasks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "project_tasks_select_own" ON public.project_tasks;
DROP POLICY IF EXISTS "project_tasks_insert_own" ON public.project_tasks;
DROP POLICY IF EXISTS "project_tasks_update_own" ON public.project_tasks;
DROP POLICY IF EXISTS "project_tasks_delete_own" ON public.project_tasks;
DROP POLICY IF EXISTS "project_tasks_service_all" ON public.project_tasks;

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

-- 3B. PROJECT ACTIVITY LOG
CREATE TABLE IF NOT EXISTS public.project_activity (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,

  -- Activity Details
  action TEXT NOT NULL,
  description TEXT,

  -- What changed
  old_value TEXT,
  new_value TEXT,

  -- Who did it
  user_id UUID REFERENCES auth.users(id),
  user_name TEXT,

  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.project_activity ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "project_activity_select_own" ON public.project_activity;
DROP POLICY IF EXISTS "project_activity_insert_own" ON public.project_activity;
DROP POLICY IF EXISTS "project_activity_service_all" ON public.project_activity;

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

-- 3C. PROJECT CONTRACTORS (for assigning collaborators)
CREATE TABLE IF NOT EXISTS public.project_contractors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,

  -- Contractor Info
  name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  role TEXT DEFAULT 'contractor',

  -- Assignment
  assigned_at TIMESTAMPTZ DEFAULT NOW(),
  notes TEXT,

  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.project_contractors ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "project_contractors_select_own" ON public.project_contractors;
DROP POLICY IF EXISTS "project_contractors_insert_own" ON public.project_contractors;
DROP POLICY IF EXISTS "project_contractors_update_own" ON public.project_contractors;
DROP POLICY IF EXISTS "project_contractors_delete_own" ON public.project_contractors;
DROP POLICY IF EXISTS "project_contractors_service_all" ON public.project_contractors;

CREATE POLICY "project_contractors_select_own" ON public.project_contractors
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.projects WHERE id = project_id AND user_id = auth.uid())
  );
CREATE POLICY "project_contractors_insert_own" ON public.project_contractors
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM public.projects WHERE id = project_id AND user_id = auth.uid())
  );
CREATE POLICY "project_contractors_update_own" ON public.project_contractors
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM public.projects WHERE id = project_id AND user_id = auth.uid())
  );
CREATE POLICY "project_contractors_delete_own" ON public.project_contractors
  FOR DELETE USING (
    EXISTS (SELECT 1 FROM public.projects WHERE id = project_id AND user_id = auth.uid())
  );
CREATE POLICY "project_contractors_service_all" ON public.project_contractors
  FOR ALL USING (auth.role() = 'service_role');

GRANT ALL ON public.project_contractors TO authenticated;
GRANT ALL ON public.project_contractors TO service_role;

CREATE INDEX IF NOT EXISTS project_contractors_project_idx ON public.project_contractors(project_id);

-- ============================================================
-- STEP 4: CALENDAR EVENTS (depends on leads, customers, jobs, projects)
-- ============================================================

CREATE TABLE IF NOT EXISTS public.calendar_events (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  event_type TEXT NOT NULL CHECK (event_type IN (
    'appointment', 'measurement', 'installation', 'delivery',
    'meeting', 'follow_up', 'consultation', 'site_visit', 'other'
  )),
  start_time TIMESTAMPTZ NOT NULL,
  end_time TIMESTAMPTZ NOT NULL,
  all_day BOOLEAN DEFAULT false,
  location TEXT,
  location_address TEXT,
  location_coordinates JSONB,

  -- Related entities (optional)
  lead_id UUID REFERENCES public.leads(id) ON DELETE SET NULL,
  customer_id UUID REFERENCES public.customers(id) ON DELETE SET NULL,
  job_id UUID REFERENCES public.jobs(id) ON DELETE SET NULL,
  project_id UUID REFERENCES public.projects(id) ON DELETE SET NULL,

  -- Recurrence
  recurrence_rule TEXT,
  recurrence_end_date TIMESTAMPTZ,
  parent_event_id UUID REFERENCES public.calendar_events(id) ON DELETE CASCADE,

  -- Reminders
  reminder_minutes INTEGER[] DEFAULT '{1440, 60}',
  reminders_sent JSONB DEFAULT '{}',

  -- Status
  status TEXT DEFAULT 'scheduled' CHECK (status IN (
    'scheduled', 'confirmed', 'completed', 'cancelled', 'rescheduled', 'no_show'
  )),

  -- Display
  color TEXT DEFAULT '#3b82f6',

  -- Metadata
  metadata JSONB DEFAULT '{}',
  notes TEXT,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  CONSTRAINT valid_time_range CHECK (end_time > start_time)
);

ALTER TABLE public.calendar_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own events" ON public.calendar_events;
DROP POLICY IF EXISTS "Users can create events" ON public.calendar_events;
DROP POLICY IF EXISTS "Users can update own events" ON public.calendar_events;
DROP POLICY IF EXISTS "Users can delete own events" ON public.calendar_events;
DROP POLICY IF EXISTS "calendar_events_service_all" ON public.calendar_events;

CREATE POLICY "Users can view own events" ON public.calendar_events FOR SELECT
  USING (created_by = auth.uid());
CREATE POLICY "Users can create events" ON public.calendar_events FOR INSERT
  WITH CHECK (created_by = auth.uid());
CREATE POLICY "Users can update own events" ON public.calendar_events FOR UPDATE
  USING (created_by = auth.uid());
CREATE POLICY "Users can delete own events" ON public.calendar_events FOR DELETE
  USING (created_by = auth.uid());
CREATE POLICY "calendar_events_service_all" ON public.calendar_events
  FOR ALL USING (auth.role() = 'service_role');

GRANT ALL ON public.calendar_events TO authenticated;
GRANT ALL ON public.calendar_events TO service_role;

CREATE INDEX IF NOT EXISTS idx_calendar_events_start ON public.calendar_events(start_time);
CREATE INDEX IF NOT EXISTS idx_calendar_events_created_by ON public.calendar_events(created_by);
CREATE INDEX IF NOT EXISTS idx_calendar_events_status ON public.calendar_events(status);

-- Calendar Event Participants
CREATE TABLE IF NOT EXISTS public.calendar_event_participants (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  event_id UUID NOT NULL REFERENCES public.calendar_events(id) ON DELETE CASCADE,
  participant_type TEXT NOT NULL CHECK (participant_type IN ('organizer', 'attendee', 'optional', 'resource')),
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  email TEXT NOT NULL,
  name TEXT,
  phone TEXT,
  role TEXT,
  response_status TEXT DEFAULT 'pending' CHECK (response_status IN (
    'pending', 'accepted', 'declined', 'tentative', 'needs_action'
  )),
  notified_at TIMESTAMPTZ,
  responded_at TIMESTAMPTZ,
  reminder_preferences JSONB DEFAULT '{}',
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(event_id, email)
);

ALTER TABLE public.calendar_event_participants ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view event participants" ON public.calendar_event_participants;
DROP POLICY IF EXISTS "Event creators can manage participants" ON public.calendar_event_participants;
DROP POLICY IF EXISTS "calendar_event_participants_service_all" ON public.calendar_event_participants;

CREATE POLICY "Users can view event participants" ON public.calendar_event_participants FOR SELECT
  USING (
    event_id IN (SELECT id FROM public.calendar_events WHERE created_by = auth.uid())
    OR user_id = auth.uid()
  );
CREATE POLICY "Event creators can manage participants" ON public.calendar_event_participants FOR ALL
  USING (
    event_id IN (SELECT id FROM public.calendar_events WHERE created_by = auth.uid())
  );
CREATE POLICY "calendar_event_participants_service_all" ON public.calendar_event_participants
  FOR ALL USING (auth.role() = 'service_role');

GRANT ALL ON public.calendar_event_participants TO authenticated;
GRANT ALL ON public.calendar_event_participants TO service_role;

CREATE INDEX IF NOT EXISTS idx_event_participants_event ON public.calendar_event_participants(event_id);

-- ============================================================
-- STEP 5: GENERAL COLLABORATORS (user's network)
-- ============================================================

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

ALTER TABLE public.general_collaborators ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their own collaborators" ON public.general_collaborators;
DROP POLICY IF EXISTS "Users can invite collaborators" ON public.general_collaborators;
DROP POLICY IF EXISTS "Users can update collaborators" ON public.general_collaborators;
DROP POLICY IF EXISTS "Users can remove collaborators" ON public.general_collaborators;
DROP POLICY IF EXISTS "general_collaborators_service_all" ON public.general_collaborators;

CREATE POLICY "Users can view their own collaborators" ON public.general_collaborators FOR SELECT
  USING (invited_by = auth.uid() OR user_id = auth.uid());
CREATE POLICY "Users can invite collaborators" ON public.general_collaborators FOR INSERT
  WITH CHECK (invited_by = auth.uid());
CREATE POLICY "Users can update collaborators" ON public.general_collaborators FOR UPDATE
  USING (invited_by = auth.uid() OR user_id = auth.uid());
CREATE POLICY "Users can remove collaborators" ON public.general_collaborators FOR DELETE
  USING (invited_by = auth.uid());
CREATE POLICY "general_collaborators_service_all" ON public.general_collaborators
  FOR ALL USING (auth.role() = 'service_role');

GRANT ALL ON public.general_collaborators TO authenticated;
GRANT ALL ON public.general_collaborators TO service_role;

CREATE INDEX IF NOT EXISTS idx_general_collaborators_invited_by ON public.general_collaborators(invited_by);

-- ============================================================
-- STEP 6: NOTIFICATIONS TABLE
-- ============================================================

CREATE TABLE IF NOT EXISTS public.notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Notification content
  title TEXT NOT NULL,
  message TEXT,
  type TEXT DEFAULT 'info' CHECK (type IN ('info', 'success', 'warning', 'error', 'lead', 'appointment', 'task', 'project')),

  -- Action (for actionable notifications)
  action_type TEXT,
  action_data JSONB,

  -- Related entities
  lead_id UUID REFERENCES public.leads(id) ON DELETE SET NULL,
  project_id UUID REFERENCES public.projects(id) ON DELETE SET NULL,

  -- Status
  read BOOLEAN DEFAULT false,
  read_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "notifications_select_own" ON public.notifications;
DROP POLICY IF EXISTS "notifications_insert_own" ON public.notifications;
DROP POLICY IF EXISTS "notifications_update_own" ON public.notifications;
DROP POLICY IF EXISTS "notifications_delete_own" ON public.notifications;
DROP POLICY IF EXISTS "notifications_service_all" ON public.notifications;

CREATE POLICY "notifications_select_own" ON public.notifications FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "notifications_insert_own" ON public.notifications FOR INSERT WITH CHECK (true);
CREATE POLICY "notifications_update_own" ON public.notifications FOR UPDATE USING (user_id = auth.uid());
CREATE POLICY "notifications_delete_own" ON public.notifications FOR DELETE USING (user_id = auth.uid());
CREATE POLICY "notifications_service_all" ON public.notifications FOR ALL USING (auth.role() = 'service_role');

GRANT ALL ON public.notifications TO authenticated;
GRANT ALL ON public.notifications TO service_role;

CREATE INDEX IF NOT EXISTS notifications_user_idx ON public.notifications(user_id);
CREATE INDEX IF NOT EXISTS notifications_read_idx ON public.notifications(read) WHERE read = false;
CREATE INDEX IF NOT EXISTS notifications_created_idx ON public.notifications(created_at DESC);

-- ============================================================
-- STEP 7: HELPER FUNCTIONS
-- ============================================================

-- Update timestamp function
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply to tables that need it
DROP TRIGGER IF EXISTS update_leads_updated_at ON public.leads;
CREATE TRIGGER update_leads_updated_at BEFORE UPDATE ON public.leads
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_customers_updated_at ON public.customers;
CREATE TRIGGER update_customers_updated_at BEFORE UPDATE ON public.customers
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_estimates_updated_at ON public.estimates;
CREATE TRIGGER update_estimates_updated_at BEFORE UPDATE ON public.estimates
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_invoices_updated_at ON public.invoices;
CREATE TRIGGER update_invoices_updated_at BEFORE UPDATE ON public.invoices
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_projects_updated_at ON public.projects;
CREATE TRIGGER update_projects_updated_at BEFORE UPDATE ON public.projects
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_calendar_events_updated_at ON public.calendar_events;
CREATE TRIGGER update_calendar_events_updated_at BEFORE UPDATE ON public.calendar_events
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================
-- VERIFICATION QUERY
-- ============================================================

SELECT
  'Tables created successfully!' as status,
  (SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'leads') as leads_exists,
  (SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'customers') as customers_exists,
  (SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'estimates') as estimates_exists,
  (SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'invoices') as invoices_exists,
  (SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'jobs') as jobs_exists,
  (SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'projects') as projects_exists,
  (SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'project_tasks') as project_tasks_exists,
  (SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'project_activity') as project_activity_exists,
  (SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'calendar_events') as calendar_events_exists,
  (SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'notifications') as notifications_exists;
