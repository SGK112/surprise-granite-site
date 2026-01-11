-- ============================================================
-- ADD APPOINTMENT FIELDS TO LEADS TABLE
-- Run this in Supabase SQL Editor to enable calendar booking
-- ============================================================

-- Add appointment/scheduling fields to leads table
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS preferred_date DATE;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS preferred_time TEXT;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS alternate_date DATE;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS alternate_time TEXT;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS appointment_type TEXT DEFAULT 'estimate' CHECK (
  appointment_type IN ('estimate', 'showroom_visit', 'design_consultation', 'measurement', 'installation', 'callback')
);
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS appointment_status TEXT DEFAULT 'pending' CHECK (
  appointment_status IN ('pending', 'confirmed', 'rescheduled', 'completed', 'cancelled', 'no_show')
);
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS confirmed_date DATE;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS confirmed_time TEXT;

-- Add address fields for in-home estimates
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS project_address TEXT;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS project_city TEXT;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS project_zip TEXT;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS estimated_sqft TEXT;

-- Add notification tracking
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS confirmation_sent BOOLEAN DEFAULT false;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS reminder_sent BOOLEAN DEFAULT false;

-- Add how_heard field for marketing tracking
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS how_heard TEXT;

-- Create indexes for appointment queries
CREATE INDEX IF NOT EXISTS leads_preferred_date_idx ON public.leads(preferred_date);
CREATE INDEX IF NOT EXISTS leads_appointment_status_idx ON public.leads(appointment_status);
CREATE INDEX IF NOT EXISTS leads_appointment_type_idx ON public.leads(appointment_type);

-- ============================================================
-- NOTIFICATION QUEUE TABLE (for email automation)
-- ============================================================

CREATE TABLE IF NOT EXISTS public.notification_queue (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  notification_type TEXT NOT NULL,
  recipient_email TEXT NOT NULL,
  subject TEXT,
  data JSONB,
  sent BOOLEAN DEFAULT false,
  sent_at TIMESTAMPTZ,
  error TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS on notification queue
ALTER TABLE public.notification_queue ENABLE ROW LEVEL SECURITY;

-- Only service role can access notification queue
DROP POLICY IF EXISTS "notification_queue_service_all" ON public.notification_queue;
CREATE POLICY "notification_queue_service_all" ON public.notification_queue
  FOR ALL USING (auth.role() = 'service_role');

-- Allow authenticated users to view their own notifications (for admin dashboard)
DROP POLICY IF EXISTS "notification_queue_admin_view" ON public.notification_queue;
CREATE POLICY "notification_queue_admin_view" ON public.notification_queue
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.sg_users
      WHERE id = auth.uid() AND account_type = 'admin'
    )
  );

GRANT ALL ON public.notification_queue TO service_role;
GRANT SELECT ON public.notification_queue TO authenticated;

-- ============================================================
-- TRIGGER: Auto-create notification on new lead with appointment
-- ============================================================

CREATE OR REPLACE FUNCTION public.notify_new_lead()
RETURNS TRIGGER AS $$
BEGIN
  -- Only create notification if it's an appointment request
  IF NEW.preferred_date IS NOT NULL THEN
    INSERT INTO public.notification_queue (
      notification_type,
      recipient_email,
      subject,
      data
    ) VALUES (
      'new_appointment',
      'info@surprisegranite.com',
      'New Appointment Request: ' || NEW.name,
      jsonb_build_object(
        'lead_id', NEW.id,
        'name', NEW.name,
        'email', NEW.email,
        'phone', NEW.phone,
        'date', NEW.preferred_date,
        'time', NEW.preferred_time,
        'type', NEW.appointment_type,
        'project_type', NEW.project_type,
        'address', NEW.project_address,
        'message', NEW.message
      )
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger for new leads
DROP TRIGGER IF EXISTS lead_notification_trigger ON public.leads;
CREATE TRIGGER lead_notification_trigger
  AFTER INSERT ON public.leads
  FOR EACH ROW EXECUTE FUNCTION public.notify_new_lead();

-- ============================================================
-- SUCCESS MESSAGE
-- ============================================================
SELECT 'Appointment fields added successfully! The leads table now supports calendar booking.' as status;
