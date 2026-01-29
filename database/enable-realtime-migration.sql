-- Enable Realtime for room_design_shares table
-- This allows designers to receive instant notifications when customers add comments

-- Add table to realtime publication
ALTER PUBLICATION supabase_realtime ADD TABLE room_design_shares;

-- Also enable for other tables that benefit from realtime updates
-- (only if they exist and aren't already added)

-- Design chat messages for team collaboration
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'design_chat_messages') THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE design_chat_messages';
  END IF;
EXCEPTION WHEN duplicate_object THEN
  -- Table already in publication, ignore
  NULL;
END $$;

-- Customer messages for unified messaging
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'customer_messages') THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE customer_messages';
  END IF;
EXCEPTION WHEN duplicate_object THEN
  NULL;
END $$;

-- Room designs for live collaboration sync
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'room_designs') THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE room_designs';
  END IF;
EXCEPTION WHEN duplicate_object THEN
  NULL;
END $$;

-- Verify what's enabled
SELECT schemaname, tablename
FROM pg_publication_tables
WHERE pubname = 'supabase_realtime';
