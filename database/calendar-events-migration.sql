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
