-- =====================================================
-- COMBINED MIGRATIONS: Run all new tables
-- Run this in Supabase SQL Editor or via psql
-- Project: ypeypgwsycxcagncgdur
-- =====================================================

-- Start transaction
BEGIN;

-- =====================================================
-- 1. GENERAL COLLABORATORS
-- =====================================================
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

-- =====================================================
-- 2. CALENDAR EVENTS
-- =====================================================
-- =====================================================
-- CALENDAR EVENTS MIGRATION
-- Multi-participant calendar events with notifications
-- =====================================================

-- Calendar events table
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
  location_coordinates JSONB, -- {lat, lng}

  -- Related entities (optional)
  lead_id UUID REFERENCES leads(id) ON DELETE SET NULL,
  customer_id UUID REFERENCES customers(id) ON DELETE SET NULL,
  job_id UUID REFERENCES jobs(id) ON DELETE SET NULL,
  project_id UUID REFERENCES projects(id) ON DELETE SET NULL,

  -- Recurrence (for recurring events)
  recurrence_rule TEXT, -- iCal RRULE format
  recurrence_end_date TIMESTAMPTZ,
  parent_event_id UUID REFERENCES calendar_events(id) ON DELETE CASCADE,

  -- Reminder settings
  reminder_minutes INTEGER[] DEFAULT '{1440, 60}', -- 24hr and 1hr before
  reminders_sent JSONB DEFAULT '{}', -- Track which reminders were sent

  -- Status
  status TEXT DEFAULT 'scheduled' CHECK (status IN (
    'scheduled', 'confirmed', 'completed', 'cancelled', 'rescheduled', 'no_show'
  )),

  -- Colors and display
  color TEXT DEFAULT '#3b82f6',

  -- Metadata
  metadata JSONB DEFAULT '{}',
  notes TEXT,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  CONSTRAINT valid_time_range CHECK (end_time > start_time)
);

-- Calendar event participants
CREATE TABLE IF NOT EXISTS public.calendar_event_participants (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  event_id UUID NOT NULL REFERENCES calendar_events(id) ON DELETE CASCADE,
  participant_type TEXT NOT NULL CHECK (participant_type IN ('organizer', 'attendee', 'optional', 'resource')),
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  email TEXT NOT NULL,
  name TEXT,
  phone TEXT,
  role TEXT, -- customer, contractor, fabricator, designer, etc.
  response_status TEXT DEFAULT 'pending' CHECK (response_status IN (
    'pending', 'accepted', 'declined', 'tentative', 'needs_action'
  )),
  notified_at TIMESTAMPTZ,
  responded_at TIMESTAMPTZ,
  reminder_preferences JSONB DEFAULT '{}', -- Per-participant reminder settings
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(event_id, email)
);

-- Indexes for efficient queries
CREATE INDEX IF NOT EXISTS idx_calendar_events_start ON calendar_events(start_time);
CREATE INDEX IF NOT EXISTS idx_calendar_events_end ON calendar_events(end_time);
CREATE INDEX IF NOT EXISTS idx_calendar_events_created_by ON calendar_events(created_by);
CREATE INDEX IF NOT EXISTS idx_calendar_events_status ON calendar_events(status) WHERE status != 'cancelled';
CREATE INDEX IF NOT EXISTS idx_calendar_events_type ON calendar_events(event_type);
CREATE INDEX IF NOT EXISTS idx_calendar_events_lead ON calendar_events(lead_id) WHERE lead_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_calendar_events_customer ON calendar_events(customer_id) WHERE customer_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_calendar_events_job ON calendar_events(job_id) WHERE job_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_calendar_events_project ON calendar_events(project_id) WHERE project_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_event_participants_event ON calendar_event_participants(event_id);
CREATE INDEX IF NOT EXISTS idx_event_participants_user ON calendar_event_participants(user_id) WHERE user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_event_participants_email ON calendar_event_participants(LOWER(email));
CREATE INDEX IF NOT EXISTS idx_event_participants_response ON calendar_event_participants(response_status);

-- Enable RLS
ALTER TABLE calendar_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE calendar_event_participants ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view events they created or are participants in
CREATE POLICY "Users can view own events"
  ON calendar_events FOR SELECT
  USING (
    created_by = auth.uid()
    OR id IN (
      SELECT event_id FROM calendar_event_participants
      WHERE user_id = auth.uid() OR LOWER(email) = LOWER(auth.jwt()->>'email')
    )
  );

-- Policy: Users can create events
CREATE POLICY "Users can create events"
  ON calendar_events FOR INSERT
  WITH CHECK (created_by = auth.uid());

-- Policy: Users can update their own events
CREATE POLICY "Users can update own events"
  ON calendar_events FOR UPDATE
  USING (created_by = auth.uid());

-- Policy: Users can delete their own events
CREATE POLICY "Users can delete own events"
  ON calendar_events FOR DELETE
  USING (created_by = auth.uid());

-- Policy: Users can view participants for events they have access to
CREATE POLICY "Users can view event participants"
  ON calendar_event_participants FOR SELECT
  USING (
    event_id IN (
      SELECT id FROM calendar_events WHERE created_by = auth.uid()
    )
    OR user_id = auth.uid()
    OR LOWER(email) = LOWER(auth.jwt()->>'email')
  );

-- Policy: Event creators can manage participants
CREATE POLICY "Event creators can manage participants"
  ON calendar_event_participants FOR ALL
  USING (
    event_id IN (SELECT id FROM calendar_events WHERE created_by = auth.uid())
  );

-- Policy: Participants can update their own response
CREATE POLICY "Participants can update response"
  ON calendar_event_participants FOR UPDATE
  USING (user_id = auth.uid() OR LOWER(email) = LOWER(auth.jwt()->>'email'))
  WITH CHECK (user_id = auth.uid() OR LOWER(email) = LOWER(auth.jwt()->>'email'));

-- Update timestamp trigger for events
CREATE OR REPLACE FUNCTION update_calendar_events_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_calendar_events_timestamp
  BEFORE UPDATE ON calendar_events
  FOR EACH ROW
  EXECUTE FUNCTION update_calendar_events_timestamp();

-- Update timestamp trigger for participants
CREATE TRIGGER trigger_update_event_participants_timestamp
  BEFORE UPDATE ON calendar_event_participants
  FOR EACH ROW
  EXECUTE FUNCTION update_calendar_events_timestamp();

-- Function to check availability
CREATE OR REPLACE FUNCTION check_calendar_availability(
  p_user_id UUID,
  p_date DATE,
  p_duration_minutes INTEGER DEFAULT 60
)
RETURNS TABLE (
  slot_start TIMESTAMPTZ,
  slot_end TIMESTAMPTZ,
  available BOOLEAN
) AS $$
DECLARE
  v_start_hour INTEGER := 8; -- Business hours start
  v_end_hour INTEGER := 18;  -- Business hours end
  v_slot_duration INTERVAL;
  v_current_slot TIMESTAMPTZ;
BEGIN
  v_slot_duration := (p_duration_minutes || ' minutes')::INTERVAL;

  -- Generate slots for the day
  FOR hour IN v_start_hour..(v_end_hour - 1) LOOP
    v_current_slot := (p_date || ' ' || hour || ':00:00')::TIMESTAMPTZ;

    slot_start := v_current_slot;
    slot_end := v_current_slot + v_slot_duration;

    -- Check if slot conflicts with existing events
    available := NOT EXISTS (
      SELECT 1 FROM calendar_events e
      JOIN calendar_event_participants p ON e.id = p.event_id
      WHERE (p.user_id = p_user_id OR e.created_by = p_user_id)
        AND e.status NOT IN ('cancelled', 'declined')
        AND (
          (e.start_time, e.end_time) OVERLAPS (v_current_slot, v_current_slot + v_slot_duration)
        )
    );

    RETURN NEXT;
  END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get upcoming events with participants
CREATE OR REPLACE FUNCTION get_upcoming_events(
  p_user_id UUID,
  p_days INTEGER DEFAULT 7
)
RETURNS TABLE (
  event_id UUID,
  title TEXT,
  event_type TEXT,
  start_time TIMESTAMPTZ,
  end_time TIMESTAMPTZ,
  location TEXT,
  status TEXT,
  participant_count INTEGER,
  confirmed_count INTEGER
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    e.id,
    e.title,
    e.event_type,
    e.start_time,
    e.end_time,
    e.location,
    e.status,
    COUNT(p.id)::INTEGER as participant_count,
    COUNT(p.id) FILTER (WHERE p.response_status = 'accepted')::INTEGER as confirmed_count
  FROM calendar_events e
  LEFT JOIN calendar_event_participants p ON e.id = p.event_id
  WHERE e.created_by = p_user_id
    AND e.start_time >= NOW()
    AND e.start_time < NOW() + (p_days || ' days')::INTERVAL
    AND e.status NOT IN ('cancelled')
  GROUP BY e.id
  ORDER BY e.start_time;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON TABLE calendar_events IS 'Calendar events with support for multiple participants, reminders, and related entity linking';
COMMENT ON TABLE calendar_event_participants IS 'Participants for calendar events with RSVP tracking';

-- =====================================================
-- 3. AUTOMATION SEQUENCES
-- =====================================================
-- =====================================================
-- AUTOMATION SEQUENCES MIGRATION
-- Lead nurturing and client retention automation
-- =====================================================

-- Automation sequences/workflows
CREATE TABLE IF NOT EXISTS public.automation_sequences (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  trigger_type TEXT NOT NULL CHECK (trigger_type IN (
    'new_lead', 'lead_no_response', 'lead_qualified', 'lead_unqualified',
    'estimate_sent', 'estimate_approved', 'estimate_declined', 'estimate_expired',
    'job_started', 'job_completed', 'job_cancelled',
    'appointment_booked', 'appointment_reminder', 'appointment_completed', 'appointment_no_show',
    'payment_received', 'payment_overdue',
    'anniversary', 'inactive_customer', 'review_request',
    'manual'
  )),
  trigger_conditions JSONB DEFAULT '{}', -- Additional conditions for trigger
  is_active BOOLEAN DEFAULT true,
  is_system BOOLEAN DEFAULT false, -- System-level sequences can't be deleted

  -- Sequence steps (array of actions)
  steps JSONB NOT NULL DEFAULT '[]',
  -- Each step: {
  --   step_number: 1,
  --   delay_hours: 24,
  --   delay_type: 'hours' | 'days' | 'business_days',
  --   action_type: 'email' | 'sms' | 'notification' | 'task' | 'webhook',
  --   template_id: UUID,
  --   template_override: { subject, body }, -- Optional override
  --   conditions: {}, -- Conditions to execute this step
  --   stop_on_reply: true/false
  -- }

  -- Statistics
  total_enrolled INTEGER DEFAULT 0,
  total_completed INTEGER DEFAULT 0,
  total_converted INTEGER DEFAULT 0, -- E.g., lead became customer

  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Track sequence enrollments
CREATE TABLE IF NOT EXISTS public.automation_enrollments (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  sequence_id UUID NOT NULL REFERENCES automation_sequences(id) ON DELETE CASCADE,

  -- Enrolled entity (one of these will be set)
  lead_id UUID REFERENCES leads(id) ON DELETE CASCADE,
  customer_id UUID REFERENCES customers(id) ON DELETE CASCADE,
  contact_email TEXT,
  contact_phone TEXT,
  contact_name TEXT,

  -- Progress tracking
  current_step INTEGER DEFAULT 0,
  status TEXT DEFAULT 'active' CHECK (status IN (
    'active', 'paused', 'completed', 'cancelled', 'failed', 'converted'
  )),

  -- Timing
  enrolled_at TIMESTAMPTZ DEFAULT NOW(),
  next_action_at TIMESTAMPTZ,
  last_action_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  paused_at TIMESTAMPTZ,

  -- History of executed steps
  step_history JSONB DEFAULT '[]',
  -- Each entry: {
  --   step_number: 1,
  --   executed_at: timestamp,
  --   action_type: 'email',
  --   result: 'success' | 'failed' | 'skipped',
  --   details: {}
  -- }

  -- Metadata
  enrolled_by TEXT DEFAULT 'system', -- 'system', 'manual', 'api'
  metadata JSONB DEFAULT '{}',

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Message templates for automation
CREATE TABLE IF NOT EXISTS public.automation_templates (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  channel TEXT NOT NULL CHECK (channel IN ('email', 'sms', 'both', 'notification')),

  -- Email fields
  email_subject TEXT,
  email_body TEXT, -- HTML body
  email_preheader TEXT,

  -- SMS fields
  sms_body TEXT,

  -- Notification fields (in-app)
  notification_title TEXT,
  notification_body TEXT,
  notification_type TEXT,

  -- Template variables (for documentation/validation)
  variables TEXT[] DEFAULT '{}', -- e.g., {first_name}, {company_name}, {project_type}

  -- Categorization
  category TEXT CHECK (category IN (
    'welcome', 'follow_up', 'reminder', 'thank_you', 'review_request',
    'promotional', 'educational', 'retention', 'win_back', 'other'
  )),

  is_system BOOLEAN DEFAULT false, -- System templates can't be deleted
  is_active BOOLEAN DEFAULT true,

  -- Usage statistics
  times_used INTEGER DEFAULT 0,
  last_used_at TIMESTAMPTZ,

  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Automation execution log for debugging/analytics
CREATE TABLE IF NOT EXISTS public.automation_logs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  enrollment_id UUID REFERENCES automation_enrollments(id) ON DELETE CASCADE,
  sequence_id UUID REFERENCES automation_sequences(id) ON DELETE SET NULL,
  step_number INTEGER,
  action_type TEXT,

  -- Result
  status TEXT CHECK (status IN ('success', 'failed', 'skipped', 'pending')),
  error_message TEXT,

  -- Details
  recipient_email TEXT,
  recipient_phone TEXT,
  template_id UUID REFERENCES automation_templates(id) ON DELETE SET NULL,
  message_preview TEXT, -- First 500 chars of sent message

  -- External IDs (for tracking)
  external_id TEXT, -- e.g., SendGrid message ID, Twilio SID

  executed_at TIMESTAMPTZ DEFAULT NOW(),
  metadata JSONB DEFAULT '{}'
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_automation_sequences_user ON automation_sequences(user_id);
CREATE INDEX IF NOT EXISTS idx_automation_sequences_trigger ON automation_sequences(trigger_type) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_automation_sequences_active ON automation_sequences(is_active) WHERE is_active = true;

CREATE INDEX IF NOT EXISTS idx_automation_enrollments_sequence ON automation_enrollments(sequence_id);
CREATE INDEX IF NOT EXISTS idx_automation_enrollments_status ON automation_enrollments(status) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_automation_enrollments_next_action ON automation_enrollments(next_action_at)
  WHERE status = 'active' AND next_action_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_automation_enrollments_lead ON automation_enrollments(lead_id) WHERE lead_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_automation_enrollments_customer ON automation_enrollments(customer_id) WHERE customer_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_automation_templates_user ON automation_templates(user_id);
CREATE INDEX IF NOT EXISTS idx_automation_templates_channel ON automation_templates(channel);
CREATE INDEX IF NOT EXISTS idx_automation_templates_category ON automation_templates(category);

CREATE INDEX IF NOT EXISTS idx_automation_logs_enrollment ON automation_logs(enrollment_id);
CREATE INDEX IF NOT EXISTS idx_automation_logs_executed ON automation_logs(executed_at);

-- Enable RLS
ALTER TABLE automation_sequences ENABLE ROW LEVEL SECURITY;
ALTER TABLE automation_enrollments ENABLE ROW LEVEL SECURITY;
ALTER TABLE automation_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE automation_logs ENABLE ROW LEVEL SECURITY;

-- RLS Policies for sequences
CREATE POLICY "Users can view own sequences"
  ON automation_sequences FOR SELECT
  USING (user_id = auth.uid() OR is_system = true);

CREATE POLICY "Users can create sequences"
  ON automation_sequences FOR INSERT
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update own sequences"
  ON automation_sequences FOR UPDATE
  USING (user_id = auth.uid() AND is_system = false);

CREATE POLICY "Users can delete own sequences"
  ON automation_sequences FOR DELETE
  USING (user_id = auth.uid() AND is_system = false);

-- RLS Policies for enrollments (via sequence ownership)
CREATE POLICY "Users can view enrollments for own sequences"
  ON automation_enrollments FOR SELECT
  USING (
    sequence_id IN (SELECT id FROM automation_sequences WHERE user_id = auth.uid())
  );

CREATE POLICY "Users can manage enrollments for own sequences"
  ON automation_enrollments FOR ALL
  USING (
    sequence_id IN (SELECT id FROM automation_sequences WHERE user_id = auth.uid())
  );

-- RLS Policies for templates
CREATE POLICY "Users can view own templates and system templates"
  ON automation_templates FOR SELECT
  USING (user_id = auth.uid() OR is_system = true OR user_id IS NULL);

CREATE POLICY "Users can create templates"
  ON automation_templates FOR INSERT
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update own templates"
  ON automation_templates FOR UPDATE
  USING (user_id = auth.uid() AND is_system = false);

CREATE POLICY "Users can delete own templates"
  ON automation_templates FOR DELETE
  USING (user_id = auth.uid() AND is_system = false);

-- RLS Policies for logs
CREATE POLICY "Users can view logs for own sequences"
  ON automation_logs FOR SELECT
  USING (
    sequence_id IN (SELECT id FROM automation_sequences WHERE user_id = auth.uid())
  );

-- Update timestamp triggers
CREATE TRIGGER trigger_update_automation_sequences_timestamp
  BEFORE UPDATE ON automation_sequences
  FOR EACH ROW
  EXECUTE FUNCTION update_calendar_events_timestamp();

CREATE TRIGGER trigger_update_automation_enrollments_timestamp
  BEFORE UPDATE ON automation_enrollments
  FOR EACH ROW
  EXECUTE FUNCTION update_calendar_events_timestamp();

CREATE TRIGGER trigger_update_automation_templates_timestamp
  BEFORE UPDATE ON automation_templates
  FOR EACH ROW
  EXECUTE FUNCTION update_calendar_events_timestamp();

-- Function to enroll in a sequence
CREATE OR REPLACE FUNCTION enroll_in_sequence(
  p_sequence_id UUID,
  p_lead_id UUID DEFAULT NULL,
  p_customer_id UUID DEFAULT NULL,
  p_email TEXT DEFAULT NULL,
  p_phone TEXT DEFAULT NULL,
  p_name TEXT DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
  v_sequence RECORD;
  v_first_step JSONB;
  v_delay_hours INTEGER;
  v_enrollment_id UUID;
BEGIN
  -- Get sequence
  SELECT * INTO v_sequence FROM automation_sequences WHERE id = p_sequence_id AND is_active = true;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Sequence not found or inactive';
  END IF;

  -- Get first step delay
  v_first_step := v_sequence.steps->0;
  v_delay_hours := COALESCE((v_first_step->>'delay_hours')::INTEGER, 0);

  -- Create enrollment
  INSERT INTO automation_enrollments (
    sequence_id,
    lead_id,
    customer_id,
    contact_email,
    contact_phone,
    contact_name,
    current_step,
    status,
    next_action_at
  ) VALUES (
    p_sequence_id,
    p_lead_id,
    p_customer_id,
    p_email,
    p_phone,
    p_name,
    0,
    'active',
    NOW() + (v_delay_hours || ' hours')::INTERVAL
  )
  RETURNING id INTO v_enrollment_id;

  -- Update sequence stats
  UPDATE automation_sequences
  SET total_enrolled = total_enrolled + 1
  WHERE id = p_sequence_id;

  RETURN v_enrollment_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get pending automation actions
CREATE OR REPLACE FUNCTION get_pending_automations(
  p_limit INTEGER DEFAULT 100
)
RETURNS TABLE (
  enrollment_id UUID,
  sequence_id UUID,
  sequence_name TEXT,
  current_step INTEGER,
  step_config JSONB,
  lead_id UUID,
  customer_id UUID,
  contact_email TEXT,
  contact_phone TEXT,
  contact_name TEXT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    e.id as enrollment_id,
    e.sequence_id,
    s.name as sequence_name,
    e.current_step,
    s.steps->e.current_step as step_config,
    e.lead_id,
    e.customer_id,
    e.contact_email,
    e.contact_phone,
    e.contact_name
  FROM automation_enrollments e
  JOIN automation_sequences s ON e.sequence_id = s.id
  WHERE e.status = 'active'
    AND e.next_action_at <= NOW()
    AND s.is_active = true
  ORDER BY e.next_action_at
  LIMIT p_limit;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Insert default system templates
INSERT INTO automation_templates (
  id, name, description, channel, category, is_system,
  email_subject, email_body, sms_body, variables
) VALUES
(
  'a0000000-0000-0000-0000-000000000001',
  'Welcome - New Lead',
  'Welcome message for new leads',
  'both',
  'welcome',
  true,
  'Welcome to {business_name}!',
  '<p>Hi {first_name},</p><p>Thank you for your interest in {business_name}! We specialize in beautiful countertops, tile, and flooring.</p><p>One of our team members will be in touch shortly to discuss your project.</p><p>In the meantime, feel free to browse our portfolio at {website_url}.</p>',
  'Hi {first_name}! Thanks for contacting {business_name}. We''ll be in touch soon about your project!',
  ARRAY['first_name', 'business_name', 'website_url']
),
(
  'a0000000-0000-0000-0000-000000000002',
  'Follow-up - No Response',
  'Follow-up message when lead hasn''t responded',
  'both',
  'follow_up',
  true,
  'Just checking in - {business_name}',
  '<p>Hi {first_name},</p><p>I wanted to follow up on your inquiry about {project_type}. Do you have any questions I can help answer?</p><p>We''d love to schedule a free estimate at your convenience.</p>',
  'Hi {first_name}, just following up on your {project_type} inquiry. Still interested? Reply or call us at {phone}!',
  ARRAY['first_name', 'project_type', 'business_name', 'phone']
),
(
  'a0000000-0000-0000-0000-000000000003',
  'Appointment Reminder - 24hr',
  '24 hour appointment reminder',
  'both',
  'reminder',
  true,
  'Reminder: Your appointment tomorrow - {business_name}',
  '<p>Hi {first_name},</p><p>This is a reminder that you have an appointment scheduled for <strong>{appointment_date}</strong> at <strong>{appointment_time}</strong>.</p><p>Location: {location}</p><p>If you need to reschedule, please call us at {phone}.</p>',
  'Reminder: Your {business_name} appointment is tomorrow at {appointment_time}. Location: {location}. Call {phone} to reschedule.',
  ARRAY['first_name', 'appointment_date', 'appointment_time', 'location', 'business_name', 'phone']
),
(
  'a0000000-0000-0000-0000-000000000004',
  'Job Complete - Thank You',
  'Thank you message after job completion',
  'email',
  'thank_you',
  true,
  'Thank you for choosing {business_name}!',
  '<p>Hi {first_name},</p><p>Thank you for choosing {business_name} for your {project_type} project! We hope you''re enjoying your new space.</p><p>If you have any questions or concerns, please don''t hesitate to reach out.</p>',
  NULL,
  ARRAY['first_name', 'project_type', 'business_name']
),
(
  'a0000000-0000-0000-0000-000000000005',
  'Review Request',
  'Request for customer review',
  'email',
  'review_request',
  true,
  'How did we do? - {business_name}',
  '<p>Hi {first_name},</p><p>We hope you''re loving your new {project_type}! Your feedback helps us improve and helps other homeowners find quality contractors.</p><p>Would you mind taking a moment to share your experience?</p><p><a href="{review_url}" style="display:inline-block;background:#f9cb00;color:#1a1a2e;padding:12px 24px;text-decoration:none;border-radius:6px;font-weight:600;">Leave a Review</a></p>',
  NULL,
  ARRAY['first_name', 'project_type', 'business_name', 'review_url']
)
ON CONFLICT (id) DO NOTHING;

-- Insert default automation sequences
INSERT INTO automation_sequences (
  id, user_id, name, description, trigger_type, is_system, is_active, steps
) VALUES
(
  'b0000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-000000000000', -- Will need to update with actual user
  'New Lead Follow-up',
  'Automated follow-up sequence for new leads',
  'new_lead',
  true,
  true,
  '[
    {"step_number": 1, "delay_hours": 0, "action_type": "email", "template_id": "a0000000-0000-0000-0000-000000000001"},
    {"step_number": 2, "delay_hours": 24, "action_type": "sms", "template_id": "a0000000-0000-0000-0000-000000000002", "stop_on_reply": true},
    {"step_number": 3, "delay_hours": 72, "action_type": "email", "template_id": "a0000000-0000-0000-0000-000000000002", "stop_on_reply": true},
    {"step_number": 4, "delay_hours": 168, "action_type": "email", "template_id": "a0000000-0000-0000-0000-000000000002"}
  ]'::JSONB
),
(
  'b0000000-0000-0000-0000-000000000002',
  '00000000-0000-0000-0000-000000000000',
  'Appointment Reminders',
  'Automatic reminders before scheduled appointments',
  'appointment_booked',
  true,
  true,
  '[
    {"step_number": 1, "delay_hours": -24, "action_type": "email", "template_id": "a0000000-0000-0000-0000-000000000003"},
    {"step_number": 2, "delay_hours": -1, "action_type": "sms", "template_id": "a0000000-0000-0000-0000-000000000003"}
  ]'::JSONB
),
(
  'b0000000-0000-0000-0000-000000000003',
  '00000000-0000-0000-0000-000000000000',
  'Job Completion - Retention',
  'Post-job thank you and review request sequence',
  'job_completed',
  true,
  true,
  '[
    {"step_number": 1, "delay_hours": 24, "action_type": "email", "template_id": "a0000000-0000-0000-0000-000000000004"},
    {"step_number": 2, "delay_hours": 168, "action_type": "email", "template_id": "a0000000-0000-0000-0000-000000000005"}
  ]'::JSONB
)
ON CONFLICT (id) DO NOTHING;

COMMENT ON TABLE automation_sequences IS 'Defines automated workflows for lead nurturing and customer retention';
COMMENT ON TABLE automation_enrollments IS 'Tracks individual entities enrolled in automation sequences';
COMMENT ON TABLE automation_templates IS 'Message templates used by automation sequences';
COMMENT ON TABLE automation_logs IS 'Execution log for automation actions';

-- Commit all changes
COMMIT;

-- Verify tables were created
SELECT table_name FROM information_schema.tables 
WHERE table_schema = 'public' 
AND table_name IN (
  'general_collaborators',
  'calendar_events', 
  'calendar_event_participants',
  'automation_sequences',
  'automation_enrollments',
  'automation_templates',
  'automation_logs'
)
ORDER BY table_name;
