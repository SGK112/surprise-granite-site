-- =====================================================
-- RECURRING CALENDAR EVENTS MIGRATION
-- Adds support for recurring/repeating events
-- Run in Supabase SQL Editor
-- =====================================================

-- =====================================================
-- 1. ADD RECURRENCE COLUMNS TO CALENDAR_EVENTS
-- =====================================================

-- Add recurrence columns if they don't exist
DO $$
BEGIN
  -- Is this a recurring event series master?
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_name = 'calendar_events' AND column_name = 'is_recurring') THEN
    ALTER TABLE public.calendar_events ADD COLUMN is_recurring BOOLEAN DEFAULT false;
  END IF;

  -- Recurrence rule (RRULE format)
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_name = 'calendar_events' AND column_name = 'recurrence_rule') THEN
    ALTER TABLE public.calendar_events ADD COLUMN recurrence_rule JSONB DEFAULT NULL;
  END IF;

  -- Parent event ID for instances
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_name = 'calendar_events' AND column_name = 'recurring_event_id') THEN
    ALTER TABLE public.calendar_events ADD COLUMN recurring_event_id UUID REFERENCES public.calendar_events(id) ON DELETE CASCADE;
  END IF;

  -- Original occurrence date (for tracking modified instances)
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_name = 'calendar_events' AND column_name = 'original_start_time') THEN
    ALTER TABLE public.calendar_events ADD COLUMN original_start_time TIMESTAMPTZ;
  END IF;

  -- Is this instance modified from the series?
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_name = 'calendar_events' AND column_name = 'is_exception') THEN
    ALTER TABLE public.calendar_events ADD COLUMN is_exception BOOLEAN DEFAULT false;
  END IF;

  -- Excluded dates for the recurring series
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_name = 'calendar_events' AND column_name = 'excluded_dates') THEN
    ALTER TABLE public.calendar_events ADD COLUMN excluded_dates TIMESTAMPTZ[] DEFAULT '{}';
  END IF;
END $$;

-- Index for recurring event queries
CREATE INDEX IF NOT EXISTS idx_calendar_events_recurring ON public.calendar_events(recurring_event_id);
CREATE INDEX IF NOT EXISTS idx_calendar_events_is_recurring ON public.calendar_events(is_recurring) WHERE is_recurring = true;

-- =====================================================
-- 2. RECURRENCE RULE STRUCTURE DOCUMENTATION
-- =====================================================
-- The recurrence_rule JSONB follows a simplified RRULE format:
-- {
--   "frequency": "daily" | "weekly" | "monthly" | "yearly",
--   "interval": 1,  -- Every N frequency (1 = every, 2 = every other, etc.)
--   "daysOfWeek": [0,1,2,3,4,5,6],  -- 0=Sunday, 6=Saturday (for weekly)
--   "dayOfMonth": 15,  -- Day of month (for monthly)
--   "monthOfYear": 6,  -- Month (for yearly, 1-12)
--   "weekOfMonth": 2,  -- 1st, 2nd, 3rd, 4th, -1=last (for monthly)
--   "endType": "never" | "count" | "until",
--   "count": 10,  -- Number of occurrences (if endType = count)
--   "until": "2024-12-31",  -- End date (if endType = until)
-- }

-- =====================================================
-- 3. HELPER FUNCTION: Generate Occurrence Dates
-- =====================================================

CREATE OR REPLACE FUNCTION generate_recurrence_dates(
  p_start_time TIMESTAMPTZ,
  p_recurrence_rule JSONB,
  p_range_start TIMESTAMPTZ,
  p_range_end TIMESTAMPTZ,
  p_excluded_dates TIMESTAMPTZ[] DEFAULT '{}'
)
RETURNS TABLE(occurrence_date TIMESTAMPTZ) AS $$
DECLARE
  v_frequency TEXT;
  v_interval INT;
  v_end_type TEXT;
  v_count INT;
  v_until TIMESTAMPTZ;
  v_current TIMESTAMPTZ;
  v_occurrence_count INT := 0;
  v_days_of_week INT[];
  v_max_occurrences INT := 365; -- Safety limit
BEGIN
  -- Extract rule parameters
  v_frequency := p_recurrence_rule->>'frequency';
  v_interval := COALESCE((p_recurrence_rule->>'interval')::INT, 1);
  v_end_type := COALESCE(p_recurrence_rule->>'endType', 'never');
  v_count := (p_recurrence_rule->>'count')::INT;
  v_until := (p_recurrence_rule->>'until')::TIMESTAMPTZ;

  -- Handle days of week for weekly
  IF p_recurrence_rule->'daysOfWeek' IS NOT NULL THEN
    SELECT array_agg(elem::INT)
    INTO v_days_of_week
    FROM jsonb_array_elements_text(p_recurrence_rule->'daysOfWeek') AS elem;
  END IF;

  v_current := p_start_time;

  -- Generate occurrences
  WHILE v_occurrence_count < v_max_occurrences LOOP
    -- Check termination conditions
    IF v_end_type = 'count' AND v_occurrence_count >= v_count THEN
      EXIT;
    END IF;

    IF v_end_type = 'until' AND v_current > v_until THEN
      EXIT;
    END IF;

    IF v_current > p_range_end THEN
      EXIT;
    END IF;

    -- Yield if within range and not excluded
    IF v_current >= p_range_start AND v_current <= p_range_end THEN
      IF NOT (v_current = ANY(p_excluded_dates)) THEN
        -- For weekly with specific days, check if day matches
        IF v_frequency = 'weekly' AND v_days_of_week IS NOT NULL THEN
          IF EXTRACT(DOW FROM v_current)::INT = ANY(v_days_of_week) THEN
            occurrence_date := v_current;
            RETURN NEXT;
          END IF;
        ELSE
          occurrence_date := v_current;
          RETURN NEXT;
        END IF;
      END IF;
    END IF;

    v_occurrence_count := v_occurrence_count + 1;

    -- Calculate next occurrence
    CASE v_frequency
      WHEN 'daily' THEN
        v_current := v_current + (v_interval || ' days')::INTERVAL;
      WHEN 'weekly' THEN
        IF v_days_of_week IS NOT NULL THEN
          -- Move to next day, will check in next iteration
          v_current := v_current + '1 day'::INTERVAL;
        ELSE
          v_current := v_current + (v_interval * 7 || ' days')::INTERVAL;
        END IF;
      WHEN 'monthly' THEN
        v_current := v_current + (v_interval || ' months')::INTERVAL;
      WHEN 'yearly' THEN
        v_current := v_current + (v_interval || ' years')::INTERVAL;
      ELSE
        EXIT; -- Unknown frequency
    END CASE;
  END LOOP;

  RETURN;
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- 4. VIEW: Expanded Recurring Events
-- =====================================================

CREATE OR REPLACE VIEW calendar_events_expanded AS
SELECT
  e.*,
  COALESCE(e.recurring_event_id, e.id) as series_id
FROM public.calendar_events e
WHERE e.is_recurring = false OR e.recurring_event_id IS NOT NULL;

COMMENT ON VIEW calendar_events_expanded IS 'View that shows all calendar event instances, excluding recurring master events';

-- =====================================================
-- 5. GRANT PERMISSIONS
-- =====================================================

GRANT EXECUTE ON FUNCTION generate_recurrence_dates TO authenticated;
GRANT EXECUTE ON FUNCTION generate_recurrence_dates TO service_role;
GRANT SELECT ON calendar_events_expanded TO authenticated;
GRANT SELECT ON calendar_events_expanded TO service_role;

COMMENT ON COLUMN public.calendar_events.is_recurring IS 'True if this is a recurring event master';
COMMENT ON COLUMN public.calendar_events.recurrence_rule IS 'RRULE-like recurrence pattern as JSONB';
COMMENT ON COLUMN public.calendar_events.recurring_event_id IS 'Reference to parent recurring event';
COMMENT ON COLUMN public.calendar_events.original_start_time IS 'Original occurrence time for exceptions';
COMMENT ON COLUMN public.calendar_events.is_exception IS 'True if this instance differs from the series';
COMMENT ON COLUMN public.calendar_events.excluded_dates IS 'Dates to skip in the recurrence series';
