-- Room Designs Table - For Room Designer Pro Tool
-- Run this in Supabase SQL Editor to enable save/share functionality
-- ============================================================

CREATE TABLE IF NOT EXISTS public.room_designs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,

  -- Project Details
  name TEXT NOT NULL DEFAULT 'Untitled Design',
  room_type TEXT DEFAULT 'kitchen',
  room_width NUMERIC DEFAULT 12,
  room_depth NUMERIC DEFAULT 10,

  -- Design Data (stored as JSON)
  elements JSONB DEFAULT '[]'::jsonb,
  settings JSONB DEFAULT '{}'::jsonb,

  -- Quote Data
  quote_total NUMERIC(10,2),
  quote_breakdown JSONB,

  -- Sharing
  share_token TEXT UNIQUE,
  share_mode TEXT DEFAULT 'view' CHECK (share_mode IN ('view', 'edit')),
  is_public BOOLEAN DEFAULT false,

  -- Collaboration
  collaborators JSONB DEFAULT '[]'::jsonb,  -- Array of {email, permission, invited_at}

  -- Metadata
  thumbnail_url TEXT,
  tags TEXT[],

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable Row Level Security
ALTER TABLE public.room_designs ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view their own designs
CREATE POLICY "room_designs_owner_select" ON public.room_designs
  FOR SELECT USING (auth.uid() = user_id);

-- Policy: Anyone can view public designs or designs with share token
CREATE POLICY "room_designs_public_view" ON public.room_designs
  FOR SELECT USING (is_public = true OR share_token IS NOT NULL);

-- Policy: Users can insert their own designs
CREATE POLICY "room_designs_owner_insert" ON public.room_designs
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Policy: Users can update their own designs
CREATE POLICY "room_designs_owner_update" ON public.room_designs
  FOR UPDATE USING (auth.uid() = user_id);

-- Policy: Users can delete their own designs
CREATE POLICY "room_designs_owner_delete" ON public.room_designs
  FOR DELETE USING (auth.uid() = user_id);

-- Policy: Collaborators with edit permission can update designs
CREATE POLICY "room_designs_collaborator_edit" ON public.room_designs
  FOR UPDATE USING (
    collaborators @> json_build_array(json_build_object('email', auth.email(), 'permission', 'edit'))::jsonb
  );

-- Service role can do everything
CREATE POLICY "room_designs_service_all" ON public.room_designs
  FOR ALL USING (auth.role() = 'service_role');

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION public.room_designs_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS room_designs_updated_at_trigger ON public.room_designs;
CREATE TRIGGER room_designs_updated_at_trigger
  BEFORE UPDATE ON public.room_designs
  FOR EACH ROW EXECUTE FUNCTION public.room_designs_updated_at();

-- Grant access
GRANT ALL ON public.room_designs TO authenticated;
GRANT ALL ON public.room_designs TO service_role;
GRANT SELECT ON public.room_designs TO anon;  -- For viewing shared designs

-- Indexes for performance
CREATE INDEX IF NOT EXISTS room_designs_user_id_idx ON public.room_designs(user_id);
CREATE INDEX IF NOT EXISTS room_designs_share_token_idx ON public.room_designs(share_token);
CREATE INDEX IF NOT EXISTS room_designs_room_type_idx ON public.room_designs(room_type);
CREATE INDEX IF NOT EXISTS room_designs_created_idx ON public.room_designs(created_at DESC);

-- Function to generate unique share token
CREATE OR REPLACE FUNCTION public.generate_share_token()
RETURNS TEXT AS $$
DECLARE
  chars TEXT := 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  result TEXT := '';
  i INTEGER;
BEGIN
  FOR i IN 1..12 LOOP
    result := result || substr(chars, floor(random() * length(chars) + 1)::int, 1);
  END LOOP;
  RETURN result;
END;
$$ LANGUAGE plpgsql;

-- RPC function to get design by share token (bypasses RLS for anonymous access)
CREATE OR REPLACE FUNCTION public.get_shared_design(token TEXT)
RETURNS SETOF public.room_designs AS $$
BEGIN
  RETURN QUERY
  SELECT * FROM public.room_designs
  WHERE share_token = token;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.get_shared_design(TEXT) TO anon;
GRANT EXECUTE ON FUNCTION public.get_shared_design(TEXT) TO authenticated;

-- ============================================================
-- VERIFY SETUP
-- ============================================================
SELECT 'room_designs table created successfully!' as status;
