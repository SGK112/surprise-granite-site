-- ============================================================
-- APPOINTMENTS TABLE - Booking system for Free Estimates
-- Run this in Supabase SQL Editor
-- ============================================================

CREATE TABLE IF NOT EXISTS public.appointments (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,

  -- Contact Information
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT NOT NULL,

  -- Appointment Details
  appointment_type TEXT DEFAULT 'free_estimate' CHECK (
    appointment_type IN ('free_estimate', 'showroom_visit', 'design_consultation', 'measurement', 'installation')
  ),
  preferred_date DATE NOT NULL,
  preferred_time TEXT NOT NULL,  -- '9:00 AM', '10:00 AM', etc.
  alternate_date DATE,
  alternate_time TEXT,

  -- Project Information
  project_type TEXT,              -- kitchen, bathroom, outdoor, etc.
  project_address TEXT,
  project_city TEXT,
  project_zip TEXT,
  estimated_sqft TEXT,
  material_interest TEXT,         -- granite, quartz, marble, etc.

  -- Additional Info
  message TEXT,
  how_heard TEXT,                 -- Google, referral, etc.

  -- Status Management
  status TEXT DEFAULT 'pending' CHECK (
    status IN ('pending', 'confirmed', 'rescheduled', 'completed', 'cancelled', 'no_show')
  ),
  confirmed_date DATE,
  confirmed_time TEXT,
  admin_notes TEXT,

  -- Notification tracking
  confirmation_sent BOOLEAN DEFAULT false,
  reminder_sent BOOLEAN DEFAULT false,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable Row Level Security
ALTER TABLE public.appointments ENABLE ROW LEVEL SECURITY;

-- Policy: Admins can view all appointments
CREATE POLICY "appointments_admin_view" ON public.appointments
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.sg_users
      WHERE id = auth.uid() AND account_type = 'admin'
    )
  );

-- Policy: Admins can update appointments
CREATE POLICY "appointments_admin_update" ON public.appointments
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM public.sg_users
      WHERE id = auth.uid() AND account_type = 'admin'
    )
  );

-- Policy: Admins can delete appointments
CREATE POLICY "appointments_admin_delete" ON public.appointments
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM public.sg_users
      WHERE id = auth.uid() AND account_type = 'admin'
    )
  );

-- Policy: Anyone can create an appointment (website form)
CREATE POLICY "appointments_insert_any" ON public.appointments
  FOR INSERT WITH CHECK (true);

-- Policy: Service role can do everything
CREATE POLICY "appointments_service_all" ON public.appointments
  FOR ALL USING (auth.role() = 'service_role');

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION public.appointments_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS appointments_updated_at_trigger ON public.appointments;
CREATE TRIGGER appointments_updated_at_trigger
  BEFORE UPDATE ON public.appointments
  FOR EACH ROW EXECUTE FUNCTION public.appointments_updated_at();

-- Grant access
GRANT ALL ON public.appointments TO authenticated;
GRANT ALL ON public.appointments TO service_role;
GRANT INSERT ON public.appointments TO anon;

-- Indexes for performance
CREATE INDEX IF NOT EXISTS appointments_email_idx ON public.appointments(email);
CREATE INDEX IF NOT EXISTS appointments_status_idx ON public.appointments(status);
CREATE INDEX IF NOT EXISTS appointments_date_idx ON public.appointments(preferred_date);
CREATE INDEX IF NOT EXISTS appointments_created_idx ON public.appointments(created_at DESC);

-- ============================================================
-- EMAIL NOTIFICATION FUNCTION
-- This can be called via webhook or Edge Function
-- ============================================================

CREATE OR REPLACE FUNCTION public.notify_new_appointment()
RETURNS TRIGGER AS $$
BEGIN
  -- This function creates a record that can be picked up by a webhook
  -- to send email notifications
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
      'appointment_id', NEW.id,
      'name', NEW.name,
      'email', NEW.email,
      'phone', NEW.phone,
      'date', NEW.preferred_date,
      'time', NEW.preferred_time,
      'type', NEW.appointment_type,
      'project_type', NEW.project_type,
      'message', NEW.message
    )
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create notification queue table
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
CREATE POLICY "notification_queue_service_all" ON public.notification_queue
  FOR ALL USING (auth.role() = 'service_role');

GRANT ALL ON public.notification_queue TO service_role;

-- Create trigger for new appointments
DROP TRIGGER IF EXISTS appointment_notification_trigger ON public.appointments;
CREATE TRIGGER appointment_notification_trigger
  AFTER INSERT ON public.appointments
  FOR EACH ROW EXECUTE FUNCTION public.notify_new_appointment();
