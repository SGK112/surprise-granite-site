-- =====================================================
-- FIX CALENDAR EVENTS RLS - Removes infinite recursion
-- Run this in Supabase SQL Editor
-- =====================================================

-- Drop ALL existing policies on calendar_events to start fresh
DROP POLICY IF EXISTS "Users can view own events" ON calendar_events;
DROP POLICY IF EXISTS "Users can view own events or admins view all" ON calendar_events;
DROP POLICY IF EXISTS "Users can update own events" ON calendar_events;
DROP POLICY IF EXISTS "Users can update own events or admins update all" ON calendar_events;
DROP POLICY IF EXISTS "Users can delete own events" ON calendar_events;
DROP POLICY IF EXISTS "Users can delete own events or admins delete all" ON calendar_events;
DROP POLICY IF EXISTS "Users can insert events" ON calendar_events;
DROP POLICY IF EXISTS "Service role full access to calendar_events" ON calendar_events;
DROP POLICY IF EXISTS "Enable all access for authenticated users" ON calendar_events;

-- Drop policies on participants table too
DROP POLICY IF EXISTS "Users can view event participants" ON calendar_event_participants;
DROP POLICY IF EXISTS "Service role full access to participants" ON calendar_event_participants;

-- Simple policy: Allow all authenticated users to CRUD calendar_events
-- This avoids recursion issues with complex joins
CREATE POLICY "Authenticated users full access"
  ON calendar_events FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- Allow anon for reading (for public calendar views if any)
CREATE POLICY "Anon read access"
  ON calendar_events FOR SELECT
  TO anon
  USING (true);

-- Service role always has access
CREATE POLICY "Service role access"
  ON calendar_events FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Same for participants
CREATE POLICY "Authenticated users full access to participants"
  ON calendar_event_participants FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Service role access to participants"
  ON calendar_event_participants FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Verify RLS is enabled
ALTER TABLE calendar_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE calendar_event_participants ENABLE ROW LEVEL SECURITY;
