-- =============================================
-- Room Designer - Supabase Tables Setup
-- Run this in Supabase SQL Editor
-- =============================================

-- 1. Room Designs Table - Stores full design data
CREATE TABLE IF NOT EXISTS room_designs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  share_token VARCHAR(24) UNIQUE NOT NULL,
  project_name VARCHAR(255) DEFAULT 'Untitled Design',
  room_type VARCHAR(50) DEFAULT 'kitchen',
  room_width DECIMAL(10,4) DEFAULT 12,
  room_depth DECIMAL(10,4) DEFAULT 10,
  elements JSONB NOT NULL DEFAULT '[]',
  walls JSONB NOT NULL DEFAULT '[]',
  pricing_config JSONB DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_by VARCHAR(255),
  expires_at TIMESTAMP WITH TIME ZONE
);

-- Index for faster token lookups
CREATE INDEX IF NOT EXISTS idx_room_designs_token ON room_designs(share_token);
CREATE INDEX IF NOT EXISTS idx_room_designs_created ON room_designs(created_at DESC);

-- 2. Room Design Shares Table - Share links with permissions
CREATE TABLE IF NOT EXISTS room_design_shares (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  design_id UUID REFERENCES room_designs(id) ON DELETE CASCADE,
  share_token VARCHAR(24) UNIQUE NOT NULL,
  permission_level VARCHAR(20) NOT NULL DEFAULT 'quote_view',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  expires_at TIMESTAMP WITH TIME ZONE,
  access_count INTEGER DEFAULT 0,
  last_accessed_at TIMESTAMP WITH TIME ZONE,
  comments JSONB DEFAULT '[]'
);

-- Index for faster share token lookups
CREATE INDEX IF NOT EXISTS idx_room_design_shares_token ON room_design_shares(share_token);
CREATE INDEX IF NOT EXISTS idx_room_design_shares_design ON room_design_shares(design_id);

-- 3. Price Lists Table - Saved price configurations
CREATE TABLE IF NOT EXISTS price_lists (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  description TEXT,
  prices JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_by VARCHAR(255)
);

-- Index for price lists
CREATE INDEX IF NOT EXISTS idx_price_lists_created ON price_lists(created_at DESC);

-- =============================================
-- Row Level Security (RLS) Policies
-- =============================================

-- Enable RLS on all tables
ALTER TABLE room_designs ENABLE ROW LEVEL SECURITY;
ALTER TABLE room_design_shares ENABLE ROW LEVEL SECURITY;
ALTER TABLE price_lists ENABLE ROW LEVEL SECURITY;

-- Room Designs: Allow anonymous access (public tool)
CREATE POLICY "Allow anonymous read room_designs" ON room_designs
  FOR SELECT USING (true);

CREATE POLICY "Allow anonymous insert room_designs" ON room_designs
  FOR INSERT WITH CHECK (true);

CREATE POLICY "Allow anonymous update room_designs" ON room_designs
  FOR UPDATE USING (true);

-- Room Design Shares: Allow anonymous access
CREATE POLICY "Allow anonymous read room_design_shares" ON room_design_shares
  FOR SELECT USING (true);

CREATE POLICY "Allow anonymous insert room_design_shares" ON room_design_shares
  FOR INSERT WITH CHECK (true);

CREATE POLICY "Allow anonymous update room_design_shares" ON room_design_shares
  FOR UPDATE USING (true);

CREATE POLICY "Allow anonymous delete room_design_shares" ON room_design_shares
  FOR DELETE USING (true);

-- Price Lists: Allow anonymous access
CREATE POLICY "Allow anonymous read price_lists" ON price_lists
  FOR SELECT USING (true);

CREATE POLICY "Allow anonymous insert price_lists" ON price_lists
  FOR INSERT WITH CHECK (true);

CREATE POLICY "Allow anonymous update price_lists" ON price_lists
  FOR UPDATE USING (true);

CREATE POLICY "Allow anonymous delete price_lists" ON price_lists
  FOR DELETE USING (true);

-- =============================================
-- Helper Functions
-- =============================================

-- Function to auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Triggers for auto-updating timestamps
DROP TRIGGER IF EXISTS update_room_designs_updated_at ON room_designs;
CREATE TRIGGER update_room_designs_updated_at
  BEFORE UPDATE ON room_designs
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_price_lists_updated_at ON price_lists;
CREATE TRIGGER update_price_lists_updated_at
  BEFORE UPDATE ON price_lists
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- =============================================
-- Optional: Cleanup old designs (run periodically)
-- =============================================

-- Function to delete designs older than 90 days with no shares
CREATE OR REPLACE FUNCTION cleanup_old_designs()
RETURNS INTEGER AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  DELETE FROM room_designs
  WHERE created_at < NOW() - INTERVAL '90 days'
  AND id NOT IN (SELECT DISTINCT design_id FROM room_design_shares WHERE design_id IS NOT NULL);

  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- =============================================
-- Verification Queries (run after setup)
-- =============================================

-- Check tables were created
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public'
AND table_name IN ('room_designs', 'room_design_shares', 'price_lists');

-- Check RLS is enabled
SELECT tablename, rowsecurity FROM pg_tables
WHERE schemaname = 'public'
AND tablename IN ('room_designs', 'room_design_shares', 'price_lists');
