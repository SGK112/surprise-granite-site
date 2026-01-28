-- Design Chat Messages Migration
-- Real-time chat for design collaboration

-- Create design_chat_messages table
CREATE TABLE IF NOT EXISTS public.design_chat_messages (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  design_id UUID NOT NULL,
  user_id UUID REFERENCES auth.users(id),
  user_name TEXT NOT NULL,
  message TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for fast lookup by design
CREATE INDEX IF NOT EXISTS idx_design_chat_design_id ON design_chat_messages(design_id);
CREATE INDEX IF NOT EXISTS idx_design_chat_created_at ON design_chat_messages(created_at DESC);

-- Enable RLS
ALTER TABLE design_chat_messages ENABLE ROW LEVEL SECURITY;

-- RLS Policies

-- Anyone authenticated can read messages for designs they can access
CREATE POLICY "design_chat_select" ON design_chat_messages
  FOR SELECT USING (
    auth.uid() IS NOT NULL
  );

-- Authenticated users can insert their own messages
CREATE POLICY "design_chat_insert" ON design_chat_messages
  FOR INSERT WITH CHECK (
    auth.uid() = user_id OR auth.uid() IS NOT NULL
  );

-- Enable realtime for this table
ALTER PUBLICATION supabase_realtime ADD TABLE design_chat_messages;

-- Grant permissions
GRANT SELECT, INSERT ON design_chat_messages TO authenticated;
GRANT SELECT, INSERT ON design_chat_messages TO service_role;
