-- =====================================================
-- BRAVO TILE AND STONE - PRODUCT INSERT SCRIPT
-- Run this in Supabase SQL Editor after running the
-- distributor-marketplace-schema.sql
-- =====================================================

-- Step 1: Create Distributor Profile for Bravo Tile
INSERT INTO distributor_profiles (
  company_name,
  legal_name,
  slug,
  company_type,
  primary_contact_name,
  primary_contact_email,
  primary_contact_phone,
  website,
  description,
  tagline,
  material_types,
  brands_carried,
  service_regions,
  national_coverage,
  verification_status,
  is_active,
  onboarding_complete
) VALUES (
  'Bravo Tile and Stone',
  'Bravo Tile and Stone LLC',
  'bravo-tile-stone',
  'distributor',
  'Sales Team',
  'sales@bravotileandstone.com',
  '+1 (714) 363-3153',
  'https://www.bravotilestone.com',
  'Premium quality tile and natural stone flooring sourced from around the world. Over 15 years in the tile and stone industry.',
  'Premium Tile & Natural Stone',
  ARRAY['porcelain', 'travertine', 'marble', 'limestone', 'tile'],
  ARRAY['Bravo Tile'],
  ARRAY['AZ', 'CA', 'NV'],
  false,
  'verified',
  true,
  true
)
ON CONFLICT (slug) DO UPDATE SET
  company_name = EXCLUDED.company_name,
  primary_contact_email = EXCLUDED.primary_contact_email,
  primary_contact_phone = EXCLUDED.primary_contact_phone,
  description = EXCLUDED.description,
  updated_at = NOW()
RETURNING id;

-- Get the distributor ID for inserts
DO $$
DECLARE
  bravo_distributor_id UUID;
BEGIN
  SELECT id INTO bravo_distributor_id FROM distributor_profiles WHERE slug = 'bravo-tile-stone';

  -- Step 2: Create Location
  INSERT INTO distributor_locations (
    distributor_id,
    location_name,
    location_type,
    is_primary,
    address_line1,
    city,
    state,
    zip_code,
    country,
    phone,
    email,
    is_active
  ) VALUES (
    bravo_distributor_id,
    'Bravo Tile Headquarters',
    'warehouse',
    true,
    '1604 W Collins Ave',
    'Orange',
    'CA',
    '92867',
    'US',
    '+1 (714) 363-3153',
    'sales@bravotileandstone.com',
    true
  )
  ON CONFLICT DO NOTHING;

  -- Step 3: Insert Products
  -- Delete existing Bravo products to avoid duplicates
  DELETE FROM distributor_products WHERE distributor_id = bravo_distributor_id;

  -- =====================================================
  -- PORCELAIN - WOOD LOOK
  -- =====================================================
  INSERT INTO distributor_products (distributor_id, name, sku, brand, collection, material_type, category, subcategory, dimensions, finish, color, unit_price, unit_type, sqft_per_box, description, is_active) VALUES
  (bravo_distributor_id, 'Listone Noce', 'BT-LN-936', 'Bravo Tile', 'Wood Look', 'porcelain', 'tile', 'Wood Look', '9x36', 'Pressed', 'Brown', 2.99, 'sqft', 13.5, 'Italian pressed porcelain with natural wood grain texture', true),
  (bravo_distributor_id, 'Listone Iroko', 'BT-LI-936', 'Bravo Tile', 'Wood Look', 'porcelain', 'tile', 'Wood Look', '9x36', 'Pressed', 'Brown', 2.99, 'sqft', 13.5, 'Italian pressed porcelain with natural wood grain texture', true),
  (bravo_distributor_id, 'Amalfi Gris', 'BT-AG-848', 'Bravo Tile', 'Wood Look', 'porcelain', 'tile', 'Wood Look', '8x48', 'Rectified', 'Gray', 4.25, 'sqft', 13.33, 'Italian rectified porcelain plank tile', true),
  (bravo_distributor_id, 'Rango Americano', 'BT-RA-848', 'Bravo Tile', 'Wood Look', 'porcelain', 'tile', 'Wood Look', '8x48', 'Rectified', 'Brown', 4.25, 'sqft', 13.33, 'Italian rectified porcelain plank tile', true),
  (bravo_distributor_id, 'Avana Brown', 'BT-AB-848', 'Bravo Tile', 'Wood Look', 'porcelain', 'tile', 'Wood Look', '8x48', 'Rectified', 'Brown', 4.25, 'sqft', 13.33, 'Italian rectified porcelain plank tile', true),
  (bravo_distributor_id, 'Bianca Sabbia', 'BT-BS-848', 'Bravo Tile', 'Wood Look', 'porcelain', 'tile', 'Wood Look', '8x48', 'Rectified', 'Beige', 4.25, 'sqft', 13.35, 'Italian rectified porcelain plank tile', true),
  (bravo_distributor_id, 'Montana Marrone', 'BT-MM-848', 'Bravo Tile', 'Wood Look', 'porcelain', 'tile', 'Wood Look', '8x48', 'Rectified', 'Brown', 4.25, 'sqft', 13.33, 'Italian rectified porcelain plank tile', true),
  (bravo_distributor_id, 'Sequoia White', 'BT-SW-848', 'Bravo Tile', 'Wood Look', 'porcelain', 'tile', 'Wood Look', '8x48', 'Rectified', 'White', 4.25, 'sqft', 10.68, 'Italian rectified porcelain plank tile', true),
  (bravo_distributor_id, 'Sequoia Nut', 'BT-SN-848', 'Bravo Tile', 'Wood Look', 'porcelain', 'tile', 'Wood Look', '8x48', 'Rectified', 'Brown', 4.25, 'sqft', 10.68, 'Italian rectified porcelain plank tile', true),
  (bravo_distributor_id, 'Sequoia Brown', 'BT-SB-848', 'Bravo Tile', 'Wood Look', 'porcelain', 'tile', 'Wood Look', '8x48', 'Rectified', 'Brown', 4.25, 'sqft', 10.68, 'Italian rectified porcelain plank tile', true);

  -- =====================================================
  -- PORCELAIN - STONE & CONCRETE LOOK
  -- =====================================================
  INSERT INTO distributor_products (distributor_id, name, sku, brand, collection, material_type, category, subcategory, dimensions, finish, color, unit_price, unit_type, sqft_per_box, description, is_active) VALUES
  (bravo_distributor_id, 'Antique White Polished', 'BT-AWP-2448', 'Bravo Tile', 'Stone Look', 'porcelain', 'tile', 'Stone & Concrete Look', '24x48', 'Rectified/Polished', 'White', 5.49, 'sqft', 15.5, 'Large format Italian porcelain with marble look', true),
  (bravo_distributor_id, 'Antique White Matte', 'BT-AWM-2448', 'Bravo Tile', 'Stone Look', 'porcelain', 'tile', 'Stone & Concrete Look', '24x48', 'Matte', 'White', 4.99, 'sqft', 15.5, 'Large format Italian porcelain with marble look', true),
  (bravo_distributor_id, 'Calacatta Extra Polished', 'BT-CEP-2448', 'Bravo Tile', 'Stone Look', 'porcelain', 'tile', 'Stone & Concrete Look', '24x48', 'Polished', 'White', 5.25, 'sqft', 15.5, 'Large format Italian Calacatta-style porcelain', true),
  (bravo_distributor_id, 'Calacatta Extra Matte', 'BT-CEM-2448', 'Bravo Tile', 'Stone Look', 'porcelain', 'tile', 'Stone & Concrete Look', '24x48', 'Matte', 'White', 4.99, 'sqft', 15.5, 'Large format Italian Calacatta-style porcelain', true),
  (bravo_distributor_id, 'Bellagio Polished', 'BT-BP-2448', 'Bravo Tile', 'Stone Look', 'porcelain', 'tile', 'Stone & Concrete Look', '24x48', 'Polished', 'Multi', 4.99, 'sqft', 15.5, 'Large format Italian porcelain', true),
  (bravo_distributor_id, 'Lakestone Grey', 'BT-LG-2448', 'Bravo Tile', 'Stone Look', 'porcelain', 'tile', 'Stone & Concrete Look', '24x48', 'Matte', 'Gray', 4.75, 'sqft', 15.5, 'Large format Spanish porcelain with stone texture', true),
  (bravo_distributor_id, 'Lakestone Beige', 'BT-LB-2448', 'Bravo Tile', 'Stone Look', 'porcelain', 'tile', 'Stone & Concrete Look', '24x48', 'Matte', 'Beige', 4.75, 'sqft', 15.5, 'Large format Spanish porcelain with stone texture', true),
  (bravo_distributor_id, 'Lakestone White', 'BT-LW-2448', 'Bravo Tile', 'Stone Look', 'porcelain', 'tile', 'Stone & Concrete Look', '24x48', 'Matte', 'White', 4.75, 'sqft', 15.5, 'Large format Spanish porcelain with stone texture', true),
  (bravo_distributor_id, 'Medici Blue Polished', 'BT-MBP-2448', 'Bravo Tile', 'Stone Look', 'porcelain', 'tile', 'Stone & Concrete Look', '24x48', 'Polished', 'Blue', 5.25, 'sqft', 15.5, 'Large format Spanish polished porcelain', true),
  (bravo_distributor_id, 'Medici Gold Polished', 'BT-MGP-2448', 'Bravo Tile', 'Stone Look', 'porcelain', 'tile', 'Stone & Concrete Look', '24x48', 'Polished', 'Gold', 5.25, 'sqft', 15.5, 'Large format Spanish polished porcelain', true),
  (bravo_distributor_id, 'Medici White Polished', 'BT-MWP-2448', 'Bravo Tile', 'Stone Look', 'porcelain', 'tile', 'Stone & Concrete Look', '24x48', 'Polished', 'White', 5.25, 'sqft', 15.5, 'Large format Spanish polished porcelain', true),
  (bravo_distributor_id, 'Statuario Qua Polished', 'BT-SQP-2448', 'Bravo Tile', 'Stone Look', 'porcelain', 'tile', 'Stone & Concrete Look', '24x48', 'Rectified/Polished', 'White', 4.25, 'sqft', 15.5, 'Large format Turkish polished porcelain', true),
  (bravo_distributor_id, 'Pure Covelano Polished', 'BT-PCP-2448', 'Bravo Tile', 'Stone Look', 'porcelain', 'tile', 'Stone & Concrete Look', '24x48', 'Rectified/Polished', 'White', 5.25, 'sqft', 15.5, 'Large format Italian polished porcelain', true),
  (bravo_distributor_id, 'Noir Laurent Lux', 'BT-NLL-2448', 'Bravo Tile', 'Stone Look', 'porcelain', 'tile', 'Stone & Concrete Look', '24x48', 'Rectified/Polished', 'Black', 5.25, 'sqft', 15.5, 'Large format Italian polished porcelain', true),
  (bravo_distributor_id, 'Verde Alpine Polished', 'BT-VAP-2448', 'Bravo Tile', 'Stone Look', 'porcelain', 'tile', 'Stone & Concrete Look', '24x48', 'Polished', 'Green', 5.25, 'sqft', 15.5, 'Large format Italian polished porcelain', true);

  -- =====================================================
  -- TRAVERTINE
  -- =====================================================
  INSERT INTO distributor_products (distributor_id, name, sku, brand, collection, material_type, category, subcategory, dimensions, finish, color, unit_price, unit_type, description, is_active) VALUES
  (bravo_distributor_id, 'Autumn Leaves 12x12 Tumbled', 'BT-AL-1212T', 'Bravo Tile', 'Autumn Leaves', 'travertine', 'tile', 'Tiles', '12x12', 'Tumbled', 'Multi', 5.49, 'sqft', 'Natural travertine with autumn coloring', true),
  (bravo_distributor_id, 'Autumn Leaves 18x18 Tumbled', 'BT-AL-1818T', 'Bravo Tile', 'Autumn Leaves', 'travertine', 'tile', 'Tiles', '18x18', 'Tumbled', 'Multi', 5.99, 'sqft', 'Natural travertine with autumn coloring', true),
  (bravo_distributor_id, 'Autumn Leaves Versailles Pattern', 'BT-AL-VP', 'Bravo Tile', 'Autumn Leaves', 'travertine', 'tile', 'Tiles', 'Versailles Pattern', 'Unfilled/Brushed/Chiseled Edge', 'Multi', 5.69, 'sqft', 'Natural travertine Versailles pattern set', true),
  (bravo_distributor_id, 'Autumn Leaves Paver 16x24', 'BT-AL-1624P', 'Bravo Tile', 'Autumn Leaves', 'travertine', 'paver', 'Pavers', '16x24', 'Tumbled 3cm', 'Multi', 7.49, 'sqft', 'Natural travertine 3cm paver', true),
  (bravo_distributor_id, 'Autumn Leaves Pool Coping 12x24 3cm', 'BT-AL-PC', 'Bravo Tile', 'Autumn Leaves', 'travertine', 'pool_coping', 'Pool Copings', '12x24', 'Unfilled/Honed/Bullnose Edge 3cm', 'Multi', 11.99, 'sqft', 'Natural travertine pool coping with bullnose edge', true),
  (bravo_distributor_id, 'Noce 12x12 Tumbled', 'BT-NC-1212T', 'Bravo Tile', 'Noce', 'travertine', 'tile', 'Tiles', '12x12', 'Tumbled', 'Brown', 4.99, 'sqft', 'Natural Noce travertine', true),
  (bravo_distributor_id, 'Noce 18x18 Tumbled', 'BT-NC-1818T', 'Bravo Tile', 'Noce', 'travertine', 'tile', 'Tiles', '18x18', 'Tumbled', 'Brown', 5.99, 'sqft', 'Natural Noce travertine', true),
  (bravo_distributor_id, 'Noce Versailles Pattern', 'BT-NC-VP', 'Bravo Tile', 'Noce', 'travertine', 'tile', 'Tiles', 'Versailles Pattern', 'Unfilled/Brushed/Chiseled Edge', 'Brown', 4.99, 'sqft', 'Natural Noce travertine Versailles pattern set', true),
  (bravo_distributor_id, 'Crema Classico 12x12 Tumbled', 'BT-CC-1212T', 'Bravo Tile', 'Crema Classico', 'travertine', 'tile', 'Tiles', '12x12', 'Tumbled', 'Cream', 5.49, 'sqft', 'Natural Crema Classico travertine', true),
  (bravo_distributor_id, 'Crema Classico Versailles Pattern', 'BT-CC-VP', 'Bravo Tile', 'Crema Classico', 'travertine', 'tile', 'Tiles', 'Versailles Pattern', 'Unfilled/Brushed/Chiseled Edge', 'Cream', 4.99, 'sqft', 'Natural Crema Classico travertine Versailles set', true),
  (bravo_distributor_id, 'Ivory Platinum 12x12 Filled & Honed', 'BT-IP-1212H', 'Bravo Tile', 'Ivory Platinum', 'travertine', 'tile', 'Tiles', '12x12', 'Filled & Honed', 'Ivory', 4.99, 'sqft', 'Natural Ivory Platinum travertine filled and honed', true),
  (bravo_distributor_id, 'Ivory Platinum 18x18 Filled & Honed', 'BT-IP-1818H', 'Bravo Tile', 'Ivory Platinum', 'travertine', 'tile', 'Tiles', '18x18', 'Filled & Honed', 'Ivory', 5.49, 'sqft', 'Natural Ivory Platinum travertine filled and honed', true),
  (bravo_distributor_id, 'Silver 12x12 Tumbled', 'BT-SV-1212T', 'Bravo Tile', 'Silver', 'travertine', 'tile', 'Tiles', '12x12', 'Tumbled', 'Silver', 5.75, 'sqft', 'Natural Silver travertine', true),
  (bravo_distributor_id, 'Silver Versailles Pattern', 'BT-SV-VP', 'Bravo Tile', 'Silver', 'travertine', 'tile', 'Tiles', 'Versailles Pattern', 'Unfilled/Brushed/Chiseled Edge', 'Silver', 5.75, 'sqft', 'Natural Silver travertine Versailles pattern set', true),
  (bravo_distributor_id, 'Gold 12x12 Tumbled', 'BT-GD-1212T', 'Bravo Tile', 'Gold', 'travertine', 'tile', 'Tiles', '12x12', 'Tumbled', 'Gold', 6.25, 'sqft', 'Natural Gold travertine', true),
  (bravo_distributor_id, 'Walnut Versailles Pattern', 'BT-WN-VP', 'Bravo Tile', 'Walnut', 'travertine', 'tile', 'Tiles', 'Versailles Pattern', 'Unfilled/Brushed/Chiseled Edge', 'Brown', 4.99, 'sqft', 'Natural Walnut travertine Versailles pattern set', true);

  -- =====================================================
  -- MARBLE
  -- =====================================================
  INSERT INTO distributor_products (distributor_id, name, sku, brand, collection, material_type, category, subcategory, dimensions, finish, color, unit_price, unit_type, description, is_active) VALUES
  (bravo_distributor_id, 'Italian White Carrara 12x12 Polished', 'BT-WC-1212P', 'Bravo Tile', 'White Carrara', 'marble', 'tile', 'Tiles', '12x12', 'Polished', 'White', 8.49, 'sqft', 'Premium Italian White Carrara marble polished', true),
  (bravo_distributor_id, 'Italian White Carrara 18x18 Polished', 'BT-WC-1818P', 'Bravo Tile', 'White Carrara', 'marble', 'tile', 'Tiles', '18x18', 'Polished', 'White', 9.25, 'sqft', 'Premium Italian White Carrara marble polished', true),
  (bravo_distributor_id, 'Italian White Carrara 12x24 Polished', 'BT-WC-1224P', 'Bravo Tile', 'White Carrara', 'marble', 'tile', 'Tiles', '12x24', 'Polished', 'White', 9.49, 'sqft', 'Premium Italian White Carrara marble polished', true),
  (bravo_distributor_id, 'Crema Marfil Select 12x12 Polished', 'BT-CM-1212P', 'Bravo Tile', 'Crema Marfil', 'marble', 'tile', 'Tiles', '12x12', 'Polished', 'Cream', 9.30, 'sqft', 'Premium Crema Marfil Select marble polished', true),
  (bravo_distributor_id, 'Crema Marfil Select 18x18 Polished', 'BT-CM-1818P', 'Bravo Tile', 'Crema Marfil', 'marble', 'tile', 'Tiles', '18x18', 'Polished', 'Cream', 9.54, 'sqft', 'Premium Crema Marfil Select marble polished', true),
  (bravo_distributor_id, 'Calacatta Gold 12x12 Polished', 'BT-CG-1212P', 'Bravo Tile', 'Calacatta Gold', 'marble', 'tile', 'Tiles', '12x12', 'Polished/Honed', 'White', 19.99, 'sqft', 'Premium Italian Calacatta Gold marble', true),
  (bravo_distributor_id, 'Calacatta Gold 12x24 Polished', 'BT-CG-1224P', 'Bravo Tile', 'Calacatta Gold', 'marble', 'tile', 'Tiles', '12x24', 'Polished/Honed', 'White', 22.99, 'sqft', 'Premium Italian Calacatta Gold marble', true),
  (bravo_distributor_id, 'Thassos 12x12 Polished', 'BT-TH-1212P', 'Bravo Tile', 'Thassos', 'marble', 'tile', 'Tiles', '12x12', 'Polished', 'White', 20.49, 'sqft', 'Premium Greek Thassos white marble', true),
  (bravo_distributor_id, 'Emperador Dark 12x12 Polished', 'BT-ED-1212P', 'Bravo Tile', 'Emperador', 'marble', 'tile', 'Tiles', '12x12', 'Polished', 'Brown', 9.99, 'sqft', 'Premium Emperador Dark marble polished', true),
  (bravo_distributor_id, 'Emperador Light 12x12 Polished', 'BT-EL-1212P', 'Bravo Tile', 'Emperador', 'marble', 'tile', 'Tiles', '12x12', 'Polished', 'Brown', 7.99, 'sqft', 'Premium Emperador Light marble polished', true),
  (bravo_distributor_id, 'Diana Royal 12x12 Polished', 'BT-DR-1212P', 'Bravo Tile', 'Diana Royal', 'marble', 'tile', 'Tiles', '12x12', 'Polished', 'Beige', 7.99, 'sqft', 'Premium Diana Royal marble polished', true),
  (bravo_distributor_id, 'Tundra Grey 12x12 Polished', 'BT-TG-1212P', 'Bravo Tile', 'Tundra Grey', 'marble', 'tile', 'Tiles', '12x12', 'Polished', 'Gray', 6.99, 'sqft', 'Premium Tundra Grey marble polished', true),
  (bravo_distributor_id, 'Statuary 12x12 Polished', 'BT-ST-1212P', 'Bravo Tile', 'Statuary', 'marble', 'tile', 'Tiles', '12x12', 'Polished', 'White', 23.50, 'sqft', 'Premium Italian Statuary marble polished', true),
  (bravo_distributor_id, 'Cappuccino 12x12 Polished', 'BT-CP-1212P', 'Bravo Tile', 'Cappuccino', 'marble', 'tile', 'Tiles', '12x12', 'Polished', 'Brown', 6.39, 'sqft', 'Premium Cappuccino marble polished', true);

  -- =====================================================
  -- LIMESTONE
  -- =====================================================
  INSERT INTO distributor_products (distributor_id, name, sku, brand, collection, material_type, category, subcategory, dimensions, finish, color, unit_price, unit_type, description, is_active) VALUES
  (bravo_distributor_id, 'Desert Pearl 12x12 Filled & Honed', 'BT-DP-1212H', 'Bravo Tile', 'Desert Pearl', 'limestone', 'tile', 'Tiles', '12x12', 'Filled & Honed', 'Beige', 5.49, 'sqft', 'Natural Desert Pearl limestone filled and honed', true),
  (bravo_distributor_id, 'Desert Pearl 18x18 Filled & Honed', 'BT-DP-1818H', 'Bravo Tile', 'Desert Pearl', 'limestone', 'tile', 'Tiles', '18x18', 'Filled & Honed', 'Beige', 5.49, 'sqft', 'Natural Desert Pearl limestone filled and honed', true),
  (bravo_distributor_id, 'Haisa Light 12x24 Honed', 'BT-HL-1224H', 'Bravo Tile', 'Haisa Light', 'limestone', 'tile', 'Tiles', '12x24', 'Honed', 'Gray', 7.49, 'sqft', 'Natural Haisa Light limestone honed', true),
  (bravo_distributor_id, 'Lagos Blue 12x24 Honed', 'BT-LBL-1224H', 'Bravo Tile', 'Lagos Blue', 'limestone', 'tile', 'Tiles', '12x24', 'Honed', 'Blue', 7.59, 'sqft', 'Natural Lagos Blue limestone honed', true),
  (bravo_distributor_id, 'Black Basalt French Pattern Paver', 'BT-BB-FP', 'Bravo Tile', 'Black Basalt', 'limestone', 'paver', 'Pavers', 'French Pattern', 'Tumbled', 'Black', 8.99, 'sqft', 'Natural Black Basalt limestone paver tumbled', true);

  -- =====================================================
  -- MOSAICS
  -- =====================================================
  INSERT INTO distributor_products (distributor_id, name, sku, brand, collection, material_type, category, subcategory, dimensions, finish, color, unit_price, unit_type, description, is_active) VALUES
  (bravo_distributor_id, 'White Carrara 2x2 Mosaic', 'BT-WCM-22', 'Bravo Tile', 'White Carrara Mosaics', 'marble', 'mosaic', 'Marble', '2x2', 'Polished/Honed', 'White', 9.75, 'piece', 'Italian White Carrara marble mosaic sheet', true),
  (bravo_distributor_id, 'White Carrara Herringbone Mosaic', 'BT-WCM-HB', 'Bravo Tile', 'White Carrara Mosaics', 'marble', 'mosaic', 'Marble', '1x2 Herringbone', 'Polished/Honed', 'White', 9.75, 'piece', 'Italian White Carrara marble herringbone mosaic', true),
  (bravo_distributor_id, 'White Carrara Hexagon Mosaic', 'BT-WCM-HX', 'Bravo Tile', 'White Carrara Mosaics', 'marble', 'mosaic', 'Marble', '2x2 Hexagon', 'Polished/Honed', 'White', 9.49, 'piece', 'Italian White Carrara marble hexagon mosaic', true),
  (bravo_distributor_id, 'White Carrara Basketweave Mosaic', 'BT-WCM-BW', 'Bravo Tile', 'White Carrara Mosaics', 'marble', 'mosaic', 'Marble', 'Basketweave', 'Polished', 'White', 9.99, 'piece', 'Italian White Carrara marble basketweave mosaic', true),
  (bravo_distributor_id, 'White Carrara Penny Round Mosaic', 'BT-WCM-PR', 'Bravo Tile', 'White Carrara Mosaics', 'marble', 'mosaic', 'Marble', 'Penny Round', 'Polished', 'White', 12.99, 'piece', 'Italian White Carrara marble penny round mosaic', true),
  (bravo_distributor_id, 'Calacatta Gold 2x2 Mosaic', 'BT-CGM-22', 'Bravo Tile', 'Calacatta Gold Mosaics', 'marble', 'mosaic', 'Marble', '2x2', 'Polished/Honed', 'White', 16.00, 'piece', 'Italian Calacatta Gold marble mosaic sheet', true),
  (bravo_distributor_id, 'Thassos White 2x2 Hexagon Mosaic', 'BT-THM-HX', 'Bravo Tile', 'Thassos Mosaics', 'marble', 'mosaic', 'Marble', '2x2 Hexagon', 'Polished', 'White', 16.25, 'piece', 'Greek Thassos white marble hexagon mosaic', true),
  (bravo_distributor_id, 'Crema Classico 2x2 Tumbled Mosaic', 'BT-CCM-22T', 'Bravo Tile', 'Travertine Mosaics', 'travertine', 'mosaic', 'Travertine', '2x2', 'Tumbled', 'Cream', 6.60, 'piece', 'Natural Crema Classico travertine mosaic', true),
  (bravo_distributor_id, 'Noce 2x2 Tumbled Mosaic', 'BT-NCM-22T', 'Bravo Tile', 'Travertine Mosaics', 'travertine', 'mosaic', 'Travertine', '2x2', 'Tumbled', 'Brown', 6.60, 'piece', 'Natural Noce travertine mosaic', true);

  -- =====================================================
  -- LEDGER PANELS
  -- =====================================================
  INSERT INTO distributor_products (distributor_id, name, sku, brand, collection, material_type, category, subcategory, dimensions, finish, color, unit_price, unit_type, description, is_active) VALUES
  (bravo_distributor_id, 'Alaska Grey Ledger Panel', 'BT-AG-LP', 'Bravo Tile', 'Ledger Panels', 'stone', 'ledger_panel', 'Panels', '6x24', 'Split Face', 'Gray', 6.49, 'sqft', 'Natural stone ledger panel for accent walls', true),
  (bravo_distributor_id, 'Arctic White Ledger Panel', 'BT-AW-LP', 'Bravo Tile', 'Ledger Panels', 'stone', 'ledger_panel', 'Panels', '6x24', 'Split Face', 'White', 6.49, 'sqft', 'Natural stone ledger panel for accent walls', true),
  (bravo_distributor_id, 'Autumn Leaves Ledger Panel', 'BT-AL-LP', 'Bravo Tile', 'Ledger Panels', 'stone', 'ledger_panel', 'Panels', '6x24', 'Split Face', 'Multi', 6.49, 'sqft', 'Natural stone ledger panel for accent walls', true),
  (bravo_distributor_id, 'Coal Canyon Ledger Panel', 'BT-CC-LP', 'Bravo Tile', 'Ledger Panels', 'stone', 'ledger_panel', 'Panels', '6x24', 'Split Face', 'Gray', 6.52, 'sqft', 'Natural stone ledger panel for accent walls', true),
  (bravo_distributor_id, 'Golden Honey Ledger Panel', 'BT-GH-LP', 'Bravo Tile', 'Ledger Panels', 'stone', 'ledger_panel', 'Panels', '6x24', 'Split Face', 'Gold', 6.50, 'sqft', 'Natural stone ledger panel for accent walls', true),
  (bravo_distributor_id, 'Sierra Blue Ledger Panel', 'BT-SBL-LP', 'Bravo Tile', 'Ledger Panels', 'stone', 'ledger_panel', 'Panels', '6x24', 'Split Face', 'Blue', 7.25, 'sqft', 'Natural stone ledger panel for accent walls', true);

  -- =====================================================
  -- PORCELAIN PAVERS
  -- =====================================================
  INSERT INTO distributor_products (distributor_id, name, sku, brand, collection, material_type, category, subcategory, dimensions, thickness, finish, color, unit_price, unit_type, sqft_per_box, description, is_active) VALUES
  (bravo_distributor_id, 'Quartz Bone Paver 24x24', 'BT-QBP-2424', 'Bravo Tile', 'Porcelain Pavers', 'porcelain', 'paver', 'Pavers', '24x24', '2cm', 'Rough/Rectified', 'Beige', 4.99, 'sqft', 8, 'Durable 2cm porcelain paver for outdoor use', true),
  (bravo_distributor_id, 'Quartz Grey Paver 24x24', 'BT-QGP-2424', 'Bravo Tile', 'Porcelain Pavers', 'porcelain', 'paver', 'Pavers', '24x24', '2cm', 'Rough/Rectified', 'Gray', 4.99, 'sqft', 8, 'Durable 2cm porcelain paver for outdoor use', true),
  (bravo_distributor_id, 'Manhattan Beige Paver 24x24', 'BT-MBP-2424', 'Bravo Tile', 'Porcelain Pavers', 'porcelain', 'paver', 'Pavers', '24x24', '2cm', 'Rough/Rectified', 'Beige', 4.99, 'sqft', 8, 'Durable 2cm porcelain paver for outdoor use', true);

  -- =====================================================
  -- MOLDINGS & TRIM
  -- =====================================================
  INSERT INTO distributor_products (distributor_id, name, sku, brand, collection, material_type, category, subcategory, dimensions, finish, color, unit_price, unit_type, description, is_active) VALUES
  (bravo_distributor_id, 'Autumn Leaves Pencil Molding', 'BT-AL-PM', 'Bravo Tile', 'Travertine Moldings', 'travertine', 'molding', 'Travertine', '3/4x12', 'Tumbled', 'Multi', 4.99, 'piece', 'Natural travertine pencil molding trim', true),
  (bravo_distributor_id, 'White Carrara Pencil Molding', 'BT-WC-PM', 'Bravo Tile', 'Marble Moldings', 'marble', 'molding', 'Marble', '3/4x12', 'Polished', 'White', 7.49, 'piece', 'Italian White Carrara marble pencil molding', true),
  (bravo_distributor_id, 'White Carrara Chair Rail Molding', 'BT-WC-CR', 'Bravo Tile', 'Marble Moldings', 'marble', 'molding', 'Marble', '2x12', 'Polished', 'White', 8.75, 'piece', 'Italian White Carrara marble chair rail', true),
  (bravo_distributor_id, 'Calacatta Gold Chair Rail Molding', 'BT-CG-CR', 'Bravo Tile', 'Marble Moldings', 'marble', 'molding', 'Marble', '2x12', 'Polished', 'White', 16.75, 'piece', 'Italian Calacatta Gold marble chair rail', true);

  -- Update distributor stats
  PERFORM update_distributor_stats(bravo_distributor_id);

  RAISE NOTICE 'Bravo Tile and Stone products inserted successfully!';
  RAISE NOTICE 'Distributor ID: %', bravo_distributor_id;
END $$;

-- Verify the insert
SELECT
  dp.company_name,
  COUNT(p.id) as product_count,
  MIN(p.unit_price) as min_price,
  MAX(p.unit_price) as max_price
FROM distributor_profiles dp
LEFT JOIN distributor_products p ON p.distributor_id = dp.id
WHERE dp.slug = 'bravo-tile-stone'
GROUP BY dp.company_name;

-- Show products by category
SELECT
  category,
  subcategory,
  COUNT(*) as count,
  MIN(unit_price) as min_price,
  MAX(unit_price) as max_price
FROM distributor_products p
JOIN distributor_profiles dp ON dp.id = p.distributor_id
WHERE dp.slug = 'bravo-tile-stone'
GROUP BY category, subcategory
ORDER BY category, subcategory;
