-- =====================================================
-- CALENDAR EVENTS - ADMIN ACCESS POLICY
-- Allows admins to view all calendar events
-- Run this in Supabase SQL Editor
-- =====================================================

-- Drop existing restrictive policy if it exists
DROP POLICY IF EXISTS "Users can view own events" ON calendar_events;

-- Create new policy that allows:
-- 1. Users to view events they created
-- 2. Users to view events where they're participants
-- 3. Admins/Super Admins to view ALL events
CREATE POLICY "Users can view own events or admins view all"
  ON calendar_events FOR SELECT
  USING (
    created_by = auth.uid()
    OR id IN (
      SELECT event_id FROM calendar_event_participants
      WHERE user_id = auth.uid() OR LOWER(email) = LOWER(auth.jwt()->>'email')
    )
    OR EXISTS (
      SELECT 1 FROM sg_users
      WHERE id = auth.uid()
      AND (account_type = 'admin' OR account_type = 'super_admin' OR role = 'admin' OR role = 'super_admin')
    )
  );

-- Also allow admins to update any event
DROP POLICY IF EXISTS "Users can update own events" ON calendar_events;
CREATE POLICY "Users can update own events or admins update all"
  ON calendar_events FOR UPDATE
  USING (
    created_by = auth.uid()
    OR EXISTS (
      SELECT 1 FROM sg_users
      WHERE id = auth.uid()
      AND (account_type = 'admin' OR account_type = 'super_admin' OR role = 'admin' OR role = 'super_admin')
    )
  );

-- Allow admins to delete any event
DROP POLICY IF EXISTS "Users can delete own events" ON calendar_events;
CREATE POLICY "Users can delete own events or admins delete all"
  ON calendar_events FOR DELETE
  USING (
    created_by = auth.uid()
    OR EXISTS (
      SELECT 1 FROM sg_users
      WHERE id = auth.uid()
      AND (account_type = 'admin' OR account_type = 'super_admin' OR role = 'admin' OR role = 'super_admin')
    )
  );

-- Similar policies for calendar_event_participants
DROP POLICY IF EXISTS "Users can view event participants" ON calendar_event_participants;
CREATE POLICY "Users can view event participants"
  ON calendar_event_participants FOR SELECT
  USING (
    event_id IN (
      SELECT id FROM calendar_events WHERE created_by = auth.uid()
    )
    OR user_id = auth.uid()
    OR LOWER(email) = LOWER(auth.jwt()->>'email')
    OR EXISTS (
      SELECT 1 FROM sg_users
      WHERE id = auth.uid()
      AND (account_type = 'admin' OR account_type = 'super_admin' OR role = 'admin' OR role = 'super_admin')
    )
  );

-- Grant service role full access (for API operations)
DROP POLICY IF EXISTS "Service role full access to calendar_events" ON calendar_events;
CREATE POLICY "Service role full access to calendar_events"
  ON calendar_events FOR ALL
  USING (auth.role() = 'service_role');

DROP POLICY IF EXISTS "Service role full access to participants" ON calendar_event_participants;
CREATE POLICY "Service role full access to participants"
  ON calendar_event_participants FOR ALL
  USING (auth.role() = 'service_role');
