-- =====================================================
-- COLLABORATOR MESSAGES MIGRATION
-- Enable direct messaging between collaborators
-- =====================================================

-- Create collaborator_messages table
CREATE TABLE IF NOT EXISTS public.collaborator_messages (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  sender_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  recipient_id UUID NOT NULL, -- Can be user_id or collaborator_id
  message TEXT NOT NULL,
  channel TEXT DEFAULT 'in_app' CHECK (channel IN ('in_app', 'email', 'sms')),
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_collab_messages_sender ON collaborator_messages(sender_id);
CREATE INDEX IF NOT EXISTS idx_collab_messages_recipient ON collaborator_messages(recipient_id);
CREATE INDEX IF NOT EXISTS idx_collab_messages_unread ON collaborator_messages(recipient_id, read_at) WHERE read_at IS NULL;

-- Enable RLS
ALTER TABLE collaborator_messages ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view messages they sent or received
CREATE POLICY "Users can view their messages"
  ON collaborator_messages FOR SELECT
  USING (sender_id = auth.uid() OR recipient_id = auth.uid());

-- Policy: Users can insert messages they send
CREATE POLICY "Users can send messages"
  ON collaborator_messages FOR INSERT
  WITH CHECK (sender_id = auth.uid());

-- Policy: Recipients can mark messages as read
CREATE POLICY "Recipients can update message read status"
  ON collaborator_messages FOR UPDATE
  USING (recipient_id = auth.uid())
  WITH CHECK (recipient_id = auth.uid());

-- Updated at trigger
CREATE OR REPLACE FUNCTION update_collaborator_messages_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_collaborator_messages_timestamp ON collaborator_messages;
CREATE TRIGGER trigger_update_collaborator_messages_timestamp
  BEFORE UPDATE ON collaborator_messages
  FOR EACH ROW
  EXECUTE FUNCTION update_collaborator_messages_updated_at();

COMMENT ON TABLE collaborator_messages IS 'Direct messages between collaborators in the network';
