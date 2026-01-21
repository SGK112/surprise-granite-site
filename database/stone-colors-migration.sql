-- Stone Tags Migration
-- Updates stone_listings for stone tagging (linking remnants to catalog stones)

-- Add color_tags array column to stone_listings (stores stone slugs from catalog)
-- These slugs reference stones in the catalog JSON files (countertops.json, flooring.json, tile.json)
ALTER TABLE stone_listings
  ADD COLUMN IF NOT EXISTS color_tags TEXT[] DEFAULT '{}';

-- Create GIN index for efficient array searches
CREATE INDEX IF NOT EXISTS idx_stone_listings_color_tags ON stone_listings USING GIN(color_tags);

-- Add primary_color column (stores the primary stone slug)
-- Named primary_color for backward compatibility but stores stone slug
ALTER TABLE stone_listings
  ADD COLUMN IF NOT EXISTS primary_color TEXT;

-- Create index for primary color/stone filtering
CREATE INDEX IF NOT EXISTS idx_stone_listings_primary_color ON stone_listings(primary_color);

-- Ensure stone_slug column exists (links to catalog)
ALTER TABLE stone_listings
  ADD COLUMN IF NOT EXISTS stone_slug TEXT;

-- Create index for stone_slug lookups
CREATE INDEX IF NOT EXISTS idx_stone_listings_stone_slug ON stone_listings(stone_slug);

-- Comment for documentation
COMMENT ON COLUMN stone_listings.color_tags IS 'Array of stone slugs from catalog (countertops.json, etc.) - used for tagging remnants with similar stones';
COMMENT ON COLUMN stone_listings.primary_color IS 'Primary stone slug from catalog - the main stone this remnant is tagged as';
COMMENT ON COLUMN stone_listings.stone_slug IS 'Direct link to a specific catalog stone product';
