-- =============================================
-- Room Designs Schema Fixes
-- Run this in Supabase SQL Editor
-- =============================================

-- 1. Add user_id column if missing (references auth.users)
ALTER TABLE room_designs
ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL;

-- 2. Add rooms column for multi-room support
ALTER TABLE room_designs
ADD COLUMN IF NOT EXISTS rooms JSONB DEFAULT '[]'::jsonb;

-- 3. Add comments_count column
ALTER TABLE room_designs
ADD COLUMN IF NOT EXISTS comments_count INTEGER DEFAULT 0;

-- 4. Add preview_url as alias for thumbnail_url (code uses both)
-- If thumbnail_url exists, rename it; otherwise create preview_url
DO $$
BEGIN
  -- Check if thumbnail_url exists
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_name = 'room_designs' AND column_name = 'thumbnail_url') THEN
    -- Add preview_url as new column if it doesn't exist
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_name = 'room_designs' AND column_name = 'preview_url') THEN
      ALTER TABLE room_designs ADD COLUMN preview_url TEXT;
    END IF;
  ELSE
    -- Neither exists, create both
    ALTER TABLE room_designs ADD COLUMN IF NOT EXISTS thumbnail_url TEXT;
    ALTER TABLE room_designs ADD COLUMN IF NOT EXISTS preview_url TEXT;
  END IF;
END $$;

-- 5. Create index on user_id for faster queries
CREATE INDEX IF NOT EXISTS room_designs_user_id_idx ON room_designs(user_id);

-- 6. Update RLS policies to allow users to read their own designs
DROP POLICY IF EXISTS "room_designs_owner_select" ON room_designs;
CREATE POLICY "room_designs_owner_select" ON room_designs
  FOR SELECT USING (
    auth.uid() = user_id
    OR share_token IS NOT NULL
    OR is_public = true
  );

-- 7. Allow users to insert their own designs
DROP POLICY IF EXISTS "room_designs_owner_insert" ON room_designs;
CREATE POLICY "room_designs_owner_insert" ON room_designs
  FOR INSERT WITH CHECK (auth.uid() = user_id OR user_id IS NULL);

-- 8. Allow users to update their own designs
DROP POLICY IF EXISTS "room_designs_owner_update" ON room_designs;
CREATE POLICY "room_designs_owner_update" ON room_designs
  FOR UPDATE USING (auth.uid() = user_id);

-- 9. Allow users to delete their own designs
DROP POLICY IF EXISTS "room_designs_owner_delete" ON room_designs;
CREATE POLICY "room_designs_owner_delete" ON room_designs
  FOR DELETE USING (auth.uid() = user_id);

-- =============================================
-- VERIFY CHANGES
-- =============================================
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'room_designs'
ORDER BY ordinal_position;
