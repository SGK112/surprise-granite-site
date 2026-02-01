-- Reminder Log Table
-- Tracks which reminders have been sent to prevent duplicates

CREATE TABLE IF NOT EXISTS public.reminder_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id UUID NOT NULL,
  entity_type TEXT NOT NULL CHECK (entity_type IN ('event', 'lead', 'invoice', 'project')),
  reminder_type TEXT NOT NULL,
  sent_at TIMESTAMPTZ DEFAULT NOW(),
  channel TEXT DEFAULT 'email' CHECK (channel IN ('email', 'sms', 'both')),
  recipient TEXT,
  status TEXT DEFAULT 'sent' CHECK (status IN ('sent', 'failed', 'bounced')),
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for fast lookups
CREATE INDEX IF NOT EXISTS reminder_log_entity_idx ON public.reminder_log(entity_id, entity_type);
CREATE INDEX IF NOT EXISTS reminder_log_sent_at_idx ON public.reminder_log(sent_at);
CREATE INDEX IF NOT EXISTS reminder_log_type_idx ON public.reminder_log(reminder_type);

-- Enable RLS
ALTER TABLE public.reminder_log ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "reminder_log_service_all" ON public.reminder_log
  FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "reminder_log_admin_select" ON public.reminder_log
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.sg_users
      WHERE id = auth.uid() AND account_type IN ('admin', 'super_admin')
    )
  );

GRANT ALL ON public.reminder_log TO service_role;
GRANT SELECT ON public.reminder_log TO authenticated;

COMMENT ON TABLE public.reminder_log IS 'Tracks sent reminders to prevent duplicate notifications';
