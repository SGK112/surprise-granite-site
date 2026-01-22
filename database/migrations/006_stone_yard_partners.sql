-- =====================================================
-- STONE YARD PARTNERS MIGRATION
-- Adds stone_yard company type and seeds existing partners
-- Run this in Supabase SQL Editor
-- =====================================================

-- 1. Add 'stone_yard' to company_type constraint
ALTER TABLE distributor_profiles
DROP CONSTRAINT IF EXISTS distributor_profiles_company_type_check;

ALTER TABLE distributor_profiles
ADD CONSTRAINT distributor_profiles_company_type_check
CHECK (company_type IN ('distributor', 'manufacturer', 'importer', 'wholesaler', 'quarry', 'stone_yard'));

-- 2. Add 'is_stone_yard_partner' flag for easy filtering
ALTER TABLE distributor_profiles
ADD COLUMN IF NOT EXISTS is_stone_yard_partner BOOLEAN DEFAULT false;

-- 3. Add claim token for partners to claim their accounts
ALTER TABLE distributor_profiles
ADD COLUMN IF NOT EXISTS claim_token TEXT UNIQUE;

ALTER TABLE distributor_profiles
ADD COLUMN IF NOT EXISTS claimed_at TIMESTAMPTZ;

-- 4. Seed the 10 existing stone yard partners
-- These are pre-verified partners without user accounts (can be claimed later)

INSERT INTO distributor_profiles (
  company_name,
  company_type,
  primary_contact_name,
  primary_contact_email,
  primary_contact_phone,
  website,
  material_types,
  service_regions,
  is_stone_yard_partner,
  verification_status,
  is_active,
  onboarding_complete,
  claim_token
) VALUES
  -- 1. MSI Surfaces
  (
    'MSI Surfaces',
    'distributor',
    'Sales Team',
    'phoenix@msisurfaces.com',
    '(602) 393-6330',
    'https://www.msisurfaces.com',
    ARRAY['granite', 'quartz', 'porcelain', 'marble', 'quartzite'],
    ARRAY['AZ', 'CA', 'NV', 'TX'],
    true,
    'verified',
    true,
    true,
    'claim_msi_' || encode(gen_random_bytes(16), 'hex')
  ),
  -- 2. Arizona Tile
  (
    'Arizona Tile',
    'distributor',
    'Sales Team',
    'tempe@arizonatile.com',
    '(480) 893-9393',
    'https://www.arizonatile.com',
    ARRAY['granite', 'quartz', 'marble', 'quartzite', 'porcelain', 'travertine'],
    ARRAY['AZ', 'CA', 'NV', 'CO', 'TX'],
    true,
    'verified',
    true,
    true,
    'claim_aztile_' || encode(gen_random_bytes(16), 'hex')
  ),
  -- 3. Cactus Stone & Tile
  (
    'Cactus Stone & Tile',
    'stone_yard',
    'Sales Team',
    'info@cactustile.com',
    '(602) 275-6400',
    'https://cactustile.com',
    ARRAY['granite', 'marble', 'travertine', 'limestone'],
    ARRAY['AZ'],
    true,
    'verified',
    true,
    true,
    'claim_cactus_' || encode(gen_random_bytes(16), 'hex')
  ),
  -- 4. Cosentino Center
  (
    'Cosentino Center',
    'manufacturer',
    'Sales Team',
    'tempe@cosentino.com',
    '(480) 763-9400',
    'https://www.cosentino.com',
    ARRAY['quartz', 'sintered'],
    ARRAY['AZ', 'CA', 'NV', 'TX'],
    true,
    'verified',
    true,
    true,
    'claim_cosentino_' || encode(gen_random_bytes(16), 'hex')
  ),
  -- 5. Cambria Gallery
  (
    'Cambria Gallery',
    'manufacturer',
    'Sales Team',
    'phoenix@cambriausa.com',
    '(623) 932-1482',
    'https://www.cambriausa.com',
    ARRAY['quartz'],
    ARRAY['AZ'],
    true,
    'verified',
    true,
    true,
    'claim_cambria_' || encode(gen_random_bytes(16), 'hex')
  ),
  -- 6. Daltile
  (
    'Daltile Stone & Slab',
    'distributor',
    'Sales Team',
    'tempe@daltile.com',
    '(602) 243-2772',
    'https://www.daltile.com',
    ARRAY['granite', 'quartz', 'marble', 'porcelain'],
    ARRAY['AZ', 'CA', 'NV', 'TX'],
    true,
    'verified',
    true,
    true,
    'claim_daltile_' || encode(gen_random_bytes(16), 'hex')
  ),
  -- 7. Bolder Image Stone
  (
    'Bolder Image Stone',
    'stone_yard',
    'Sales Team',
    'info@bolderimagestone.com',
    '(602) 484-7700',
    'https://bolderimagestone.com',
    ARRAY['granite', 'quartzite', 'marble'],
    ARRAY['AZ'],
    true,
    'verified',
    true,
    true,
    'claim_bolder_' || encode(gen_random_bytes(16), 'hex')
  ),
  -- 8. Aracruz Granite
  (
    'Aracruz Granite',
    'importer',
    'Sales Team',
    'info@aracruzgranite.com',
    '(602) 252-1171',
    'http://aracruzgranite.com',
    ARRAY['granite', 'quartzite', 'marble'],
    ARRAY['AZ'],
    true,
    'verified',
    true,
    true,
    'claim_aracruz_' || encode(gen_random_bytes(16), 'hex')
  ),
  -- 9. Classic Surfaces
  (
    'Classic Surfaces',
    'wholesaler',
    'Sales Team',
    'info@classic-surfaces.com',
    '(219) 213-4239',
    'https://www.classic-surfaces.com',
    ARRAY['granite', 'quartz', 'marble', 'quartzite'],
    ARRAY['AZ'],
    true,
    'verified',
    true,
    true,
    'claim_classic_' || encode(gen_random_bytes(16), 'hex')
  ),
  -- 10. Architectural Surfaces
  (
    'Architectural Surfaces',
    'distributor',
    'Sales Team',
    'scottsdale@arcsurfaces.com',
    '(480) 210-3570',
    'https://arcsurfaces.com',
    ARRAY['granite', 'quartz', 'marble', 'quartzite', 'porcelain'],
    ARRAY['AZ'],
    true,
    'verified',
    true,
    true,
    'claim_arcsurfaces_' || encode(gen_random_bytes(16), 'hex')
  )
ON CONFLICT (slug) DO UPDATE SET
  is_stone_yard_partner = true,
  verification_status = 'verified',
  updated_at = NOW();

-- 5. Now add their locations
-- First, get the distributor IDs and insert locations

INSERT INTO distributor_locations (
  distributor_id,
  location_name,
  location_type,
  is_primary,
  address_line1,
  city,
  state,
  zip_code,
  phone,
  latitude,
  longitude,
  has_showroom,
  has_slab_yard,
  is_active
)
SELECT
  dp.id,
  loc.location_name,
  loc.location_type,
  true,
  loc.address,
  loc.city,
  'AZ',
  loc.zip,
  loc.phone,
  loc.lat,
  loc.lng,
  true,
  true,
  true
FROM distributor_profiles dp
JOIN (VALUES
  ('MSI Surfaces', 'MSI Phoenix', 'slab_yard', '4405 W Roosevelt St', 'Phoenix', '85043', '(602) 393-6330', 33.4583, -112.1407),
  ('Arizona Tile', 'Arizona Tile Tempe', 'showroom', '8829 S Priest Dr', 'Tempe', '85284', '(480) 893-9393', 33.3456, -111.9606),
  ('Cactus Stone & Tile', 'Cactus Stone Phoenix', 'slab_yard', '401 S 50th St', 'Phoenix', '85034', '(602) 275-6400', 33.4438, -111.9811),
  ('Cosentino Center', 'Cosentino Tempe', 'showroom', '8307 S Priest Dr', 'Tempe', '85284', '(480) 763-9400', 33.3511, -111.9606),
  ('Cambria Gallery', 'Cambria Avondale', 'showroom', '1250 N Fairway Dr Bldg C #103', 'Avondale', '85323', '(623) 932-1482', 33.4536, -112.3234),
  ('Daltile Stone & Slab', 'Daltile Tempe', 'showroom', '2040 W Rio Salado Pkwy', 'Tempe', '85281', '(602) 243-2772', 33.4317, -111.9642),
  ('Bolder Image Stone', 'Bolder Image Phoenix', 'slab_yard', '4101 W Van Buren St #3', 'Phoenix', '85009', '(602) 484-7700', 33.4516, -112.1306),
  ('Aracruz Granite', 'Aracruz Phoenix', 'slab_yard', '2310 W Sherman St', 'Phoenix', '85009', '(602) 252-1171', 33.4283, -112.0964),
  ('Classic Surfaces', 'Classic Surfaces Phoenix', 'warehouse', '4645 W McDowell Rd #101', 'Phoenix', '85035', '(219) 213-4239', 33.4650, -112.1378),
  ('Architectural Surfaces', 'Architectural Surfaces Scottsdale', 'showroom', '9175 E Pima Center Pkwy A-1', 'Scottsdale', '85258', '(480) 210-3570', 33.6114, -111.8867)
) AS loc(company_name, location_name, location_type, address, city, zip, phone, lat, lng)
ON dp.company_name = loc.company_name
WHERE dp.is_stone_yard_partner = true
ON CONFLICT DO NOTHING;

-- 6. Create index for stone yard partner queries
CREATE INDEX IF NOT EXISTS idx_distributor_stone_yard_partners
ON distributor_profiles(is_stone_yard_partner)
WHERE is_stone_yard_partner = true AND is_active = true;

-- 7. Create function to get stone yard partners with locations
CREATE OR REPLACE FUNCTION get_stone_yard_partners()
RETURNS TABLE (
  id UUID,
  company_name TEXT,
  company_type TEXT,
  phone TEXT,
  website TEXT,
  material_types TEXT[],
  location_name TEXT,
  address TEXT,
  city TEXT,
  state TEXT,
  zip_code TEXT,
  latitude DECIMAL,
  longitude DECIMAL,
  has_showroom BOOLEAN,
  has_slab_yard BOOLEAN
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    dp.id,
    dp.company_name,
    dp.company_type,
    dp.primary_contact_phone as phone,
    dp.website,
    dp.material_types,
    dl.location_name,
    dl.address_line1 as address,
    dl.city,
    dl.state,
    dl.zip_code,
    dl.latitude,
    dl.longitude,
    dl.has_showroom,
    dl.has_slab_yard
  FROM distributor_profiles dp
  JOIN distributor_locations dl ON dl.distributor_id = dp.id AND dl.is_primary = true
  WHERE dp.is_stone_yard_partner = true
    AND dp.is_active = true
    AND dp.verification_status = 'verified'
  ORDER BY dp.company_name;
END;
$$ LANGUAGE plpgsql;

-- 8. Grant execute to anon and authenticated roles
GRANT EXECUTE ON FUNCTION get_stone_yard_partners() TO anon;
GRANT EXECUTE ON FUNCTION get_stone_yard_partners() TO authenticated;

-- =====================================================
-- DONE! Partners seeded with claimable accounts
-- =====================================================
