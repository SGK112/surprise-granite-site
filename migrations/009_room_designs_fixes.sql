-- =============================================
-- Room Designs Schema Fixes
-- Run this in Supabase SQL Editor
-- =============================================

-- First, let's see what columns exist
-- SELECT column_name, data_type FROM information_schema.columns
-- WHERE table_name = 'room_designs' ORDER BY ordinal_position;

-- =============================================
-- STEP 1: Add ALL potentially missing columns
-- =============================================

-- Core columns
ALTER TABLE room_designs
ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE room_designs
ADD COLUMN IF NOT EXISTS name TEXT DEFAULT 'Untitled Design';

ALTER TABLE room_designs
ADD COLUMN IF NOT EXISTS room_type TEXT DEFAULT 'kitchen';

ALTER TABLE room_designs
ADD COLUMN IF NOT EXISTS room_width NUMERIC DEFAULT 12;

ALTER TABLE room_designs
ADD COLUMN IF NOT EXISTS room_depth NUMERIC DEFAULT 10;

ALTER TABLE room_designs
ADD COLUMN IF NOT EXISTS elements JSONB DEFAULT '[]'::jsonb;

ALTER TABLE room_designs
ADD COLUMN IF NOT EXISTS settings JSONB DEFAULT '{}'::jsonb;

-- Multi-room support
ALTER TABLE room_designs
ADD COLUMN IF NOT EXISTS rooms JSONB DEFAULT '[]'::jsonb;

-- Quote data
ALTER TABLE room_designs
ADD COLUMN IF NOT EXISTS quote_total NUMERIC(10,2);

ALTER TABLE room_designs
ADD COLUMN IF NOT EXISTS quote_breakdown JSONB;

-- Sharing columns
ALTER TABLE room_designs
ADD COLUMN IF NOT EXISTS share_token TEXT;

ALTER TABLE room_designs
ADD COLUMN IF NOT EXISTS share_mode TEXT DEFAULT 'view';

ALTER TABLE room_designs
ADD COLUMN IF NOT EXISTS is_public BOOLEAN DEFAULT false;

-- Collaboration
ALTER TABLE room_designs
ADD COLUMN IF NOT EXISTS collaborators JSONB DEFAULT '[]'::jsonb;

-- Preview/thumbnail
ALTER TABLE room_designs
ADD COLUMN IF NOT EXISTS thumbnail_url TEXT;

ALTER TABLE room_designs
ADD COLUMN IF NOT EXISTS preview_url TEXT;

-- Metadata
ALTER TABLE room_designs
ADD COLUMN IF NOT EXISTS tags TEXT[];

ALTER TABLE room_designs
ADD COLUMN IF NOT EXISTS comments_count INTEGER DEFAULT 0;

-- Timestamps (if missing)
ALTER TABLE room_designs
ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();

ALTER TABLE room_designs
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- =============================================
-- STEP 2: Create unique constraint on share_token if not exists
-- =============================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'room_designs_share_token_key'
  ) THEN
    ALTER TABLE room_designs ADD CONSTRAINT room_designs_share_token_key UNIQUE (share_token);
  END IF;
EXCEPTION WHEN others THEN
  RAISE NOTICE 'Constraint may already exist or share_token has duplicates';
END $$;

-- =============================================
-- STEP 3: Create indexes for performance
-- =============================================
CREATE INDEX IF NOT EXISTS room_designs_user_id_idx ON room_designs(user_id);
CREATE INDEX IF NOT EXISTS room_designs_share_token_idx ON room_designs(share_token);
CREATE INDEX IF NOT EXISTS room_designs_created_idx ON room_designs(created_at DESC);

-- =============================================
-- STEP 4: Enable RLS
-- =============================================
ALTER TABLE room_designs ENABLE ROW LEVEL SECURITY;

-- =============================================
-- STEP 5: Create RLS policies
-- =============================================

-- Drop existing policies first
DROP POLICY IF EXISTS "room_designs_owner_select" ON room_designs;
DROP POLICY IF EXISTS "room_designs_owner_insert" ON room_designs;
DROP POLICY IF EXISTS "room_designs_owner_update" ON room_designs;
DROP POLICY IF EXISTS "room_designs_owner_delete" ON room_designs;
DROP POLICY IF EXISTS "room_designs_public_view" ON room_designs;
DROP POLICY IF EXISTS "Allow anonymous read room_designs" ON room_designs;
DROP POLICY IF EXISTS "Allow anonymous insert room_designs" ON room_designs;
DROP POLICY IF EXISTS "Allow anonymous update room_designs" ON room_designs;

-- Users can view their own designs, public designs, or shared designs
CREATE POLICY "room_designs_owner_select" ON room_designs
  FOR SELECT USING (
    auth.uid() = user_id
    OR share_token IS NOT NULL
    OR is_public = true
  );

-- Users can insert designs (with their user_id or anonymous)
CREATE POLICY "room_designs_owner_insert" ON room_designs
  FOR INSERT WITH CHECK (auth.uid() = user_id OR user_id IS NULL);

-- Users can update their own designs
CREATE POLICY "room_designs_owner_update" ON room_designs
  FOR UPDATE USING (auth.uid() = user_id);

-- Users can delete their own designs
CREATE POLICY "room_designs_owner_delete" ON room_designs
  FOR DELETE USING (auth.uid() = user_id);

-- =============================================
-- STEP 6: Create trigger for updated_at
-- =============================================
CREATE OR REPLACE FUNCTION update_room_designs_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS room_designs_updated_at_trigger ON room_designs;
CREATE TRIGGER room_designs_updated_at_trigger
  BEFORE UPDATE ON room_designs
  FOR EACH ROW EXECUTE FUNCTION update_room_designs_updated_at();

-- =============================================
-- STEP 7: Grant permissions
-- =============================================
GRANT ALL ON room_designs TO authenticated;
GRANT ALL ON room_designs TO service_role;
GRANT SELECT ON room_designs TO anon;

-- =============================================
-- VERIFY: Show final table structure
-- =============================================
SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_name = 'room_designs'
ORDER BY ordinal_position;
