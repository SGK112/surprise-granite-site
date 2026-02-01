-- Auto-generated flooring products insert
-- Generated: 2026-02-01T17:37:52.372Z
-- Products: 193


INSERT INTO flooring_products (
  sku, name, slug, vendor_id, brand, collection,
  type, dimensions, primary_color, wear_layer, thickness,
  sf_per_box, wholesale_cost_sf, wholesale_cost_box,
  primary_image, url, is_active, is_waterproof,
  installation_method, residential_warranty, commercial_warranty,
  last_price_update
) VALUES (
  'ANDOVER_ABINGDALE_LUXURY_VINYL_PLANKS',
  'Andover Abingdale',
  'andover-abingdale-luxury-vinyl-planks',
  'msi',
  'MSI',
  'andover',
  'Luxury Vinyl',
  '7x48',
  'Multi',
  '20mil',
  '5.5mm',
  22,
  2.29,
  50.38,
  'https://cdn.prod.website-files.com/6456ce4476abb2d4f9fbad10/6456ce4576abb20d58fbc941_msi-surfaces-surprise-granite-abingdale-luxury-vinyl-planks-close-up.jpeg',
  '/flooring/andover-abingdale-luxury-vinyl-planks',
  true,
  true,
  'Click Lock',
  'Lifetime',
  '10 Years',
  NOW()
) ON CONFLICT (sku) DO UPDATE SET
  wholesale_cost_sf = EXCLUDED.wholesale_cost_sf,
  wholesale_cost_box = EXCLUDED.wholesale_cost_box,
  last_price_update = NOW();

INSERT INTO flooring_products (
  sku, name, slug, vendor_id, brand, collection,
  type, dimensions, primary_color, wear_layer, thickness,
  sf_per_box, wholesale_cost_sf, wholesale_cost_box,
  primary_image, url, is_active, is_waterproof,
  installation_method, residential_warranty, commercial_warranty,
  last_price_update
) VALUES (
  'ANDOVER_BAYHILL_BLONDE_LUXURY_VINYL_PLANKS',
  'Andover Bayhill Blonde',
  'andover-bayhill-blonde-luxury-vinyl-planks',
  'msi',
  'MSI',
  'andover',
  'Luxury Vinyl',
  '7x48',
  'Multi',
  '20mil',
  '5.5mm',
  22,
  2.29,
  50.38,
  'https://cdn.prod.website-files.com/6456ce4476abb2d4f9fbad10/6456ce4576abb206cafbc956_msi-surfaces-surprise-granite-bayhill-blonde-luxury-vinyl-planks-close-up.jpeg',
  '/flooring/andover-bayhill-blonde-luxury-vinyl-planks',
  true,
  true,
  'Click Lock',
  'Lifetime',
  '10 Years',
  NOW()
) ON CONFLICT (sku) DO UPDATE SET
  wholesale_cost_sf = EXCLUDED.wholesale_cost_sf,
  wholesale_cost_box = EXCLUDED.wholesale_cost_box,
  last_price_update = NOW();

INSERT INTO flooring_products (
  sku, name, slug, vendor_id, brand, collection,
  type, dimensions, primary_color, wear_layer, thickness,
  sf_per_box, wholesale_cost_sf, wholesale_cost_box,
  primary_image, url, is_active, is_waterproof,
  installation_method, residential_warranty, commercial_warranty,
  last_price_update
) VALUES (
  'ANDOVER_BLYTHE_LUXURY_VINYL_PLANKS',
  'Andover Blythe',
  'andover-blythe-luxury-vinyl-planks',
  'msi',
  'MSI',
  'andover',
  'Luxury Vinyl',
  '7x48',
  'Multi',
  '20mil',
  '5.5mm',
  22,
  2.29,
  50.38,
  'https://cdn.prod.website-files.com/6456ce4476abb2d4f9fbad10/6456ce4576abb25d03fbc961_msi-surfaces-surprise-granite-blythe-luxury-vinyl-planks-close-up.jpeg',
  '/flooring/andover-blythe-luxury-vinyl-planks',
  true,
  true,
  'Click Lock',
  'Lifetime',
  '10 Years',
  NOW()
) ON CONFLICT (sku) DO UPDATE SET
  wholesale_cost_sf = EXCLUDED.wholesale_cost_sf,
  wholesale_cost_box = EXCLUDED.wholesale_cost_box,
  last_price_update = NOW();

INSERT INTO flooring_products (
  sku, name, slug, vendor_id, brand, collection,
  type, dimensions, primary_color, wear_layer, thickness,
  sf_per_box, wholesale_cost_sf, wholesale_cost_box,
  primary_image, url, is_active, is_waterproof,
  installation_method, residential_warranty, commercial_warranty,
  last_price_update
) VALUES (
  'ANDOVER_DAKWORTH_LUXURY_VINYL_PLANKS',
  'Andover Dakworth',
  'andover-dakworth-luxury-vinyl-planks',
  'msi',
  'MSI',
  'andover',
  'Luxury Vinyl',
  '7x48',
  'Multi',
  '20mil',
  '5.5mm',
  22,
  2.29,
  50.38,
  'https://cdn.prod.website-files.com/6456ce4476abb2d4f9fbad10/6456ce4576abb22b5cfbc970_msi-surfaces-surprise-granite-dakworth-luxury-vinyl-planks-close-up.jpeg',
  '/flooring/andover-dakworth-luxury-vinyl-planks',
  true,
  true,
  'Click Lock',
  'Lifetime',
  '10 Years',
  NOW()
) ON CONFLICT (sku) DO UPDATE SET
  wholesale_cost_sf = EXCLUDED.wholesale_cost_sf,
  wholesale_cost_box = EXCLUDED.wholesale_cost_box,
  last_price_update = NOW();

INSERT INTO flooring_products (
  sku, name, slug, vendor_id, brand, collection,
  type, dimensions, primary_color, wear_layer, thickness,
  sf_per_box, wholesale_cost_sf, wholesale_cost_box,
  primary_image, url, is_active, is_waterproof,
  installation_method, residential_warranty, commercial_warranty,
  last_price_update
) VALUES (
  'ANDOVER_HATFIELD_LUXURY_VINYL_PLANKS',
  'Andover Hatfield',
  'andover-hatfield-luxury-vinyl-planks',
  'msi',
  'MSI',
  'andover',
  'Luxury Vinyl',
  '7x48',
  'Multi',
  '20mil',
  '5.5mm',
  22,
  2.29,
  50.38,
  'https://cdn.prod.website-files.com/6456ce4476abb2d4f9fbad10/6456ce4576abb20130fbc97c_msi-surfaces-surprise-granite-hatfield-luxury-vinyl-planks-close-up.jpeg',
  '/flooring/andover-hatfield-luxury-vinyl-planks',
  true,
  true,
  'Click Lock',
  'Lifetime',
  '10 Years',
  NOW()
) ON CONFLICT (sku) DO UPDATE SET
  wholesale_cost_sf = EXCLUDED.wholesale_cost_sf,
  wholesale_cost_box = EXCLUDED.wholesale_cost_box,
  last_price_update = NOW();

INSERT INTO flooring_products (
  sku, name, slug, vendor_id, brand, collection,
  type, dimensions, primary_color, wear_layer, thickness,
  sf_per_box, wholesale_cost_sf, wholesale_cost_box,
  primary_image, url, is_active, is_waterproof,
  installation_method, residential_warranty, commercial_warranty,
  last_price_update
) VALUES (
  'ANDOVER_HIGHCLIFFE_GREIGE_LUXURY_VINYL_PLANKS',
  'Andover Highcliffe Greige',
  'andover-highcliffe-greige-luxury-vinyl-planks',
  'msi',
  'MSI',
  'andover',
  'Luxury Vinyl',
  '7x48',
  'Multi',
  '20mil',
  '5.5mm',
  22,
  2.29,
  50.38,
  'https://cdn.prod.website-files.com/6456ce4476abb2d4f9fbad10/6456ce4576abb24db9fbc981_msi-surfaces-surprise-granite-highcliffe-greige-luxury-vinyl-planks-close-up.jpeg',
  '/flooring/andover-highcliffe-greige-luxury-vinyl-planks',
  true,
  true,
  'Click Lock',
  'Lifetime',
  '10 Years',
  NOW()
) ON CONFLICT (sku) DO UPDATE SET
  wholesale_cost_sf = EXCLUDED.wholesale_cost_sf,
  wholesale_cost_box = EXCLUDED.wholesale_cost_box,
  last_price_update = NOW();

INSERT INTO flooring_products (
  sku, name, slug, vendor_id, brand, collection,
  type, dimensions, primary_color, wear_layer, thickness,
  sf_per_box, wholesale_cost_sf, wholesale_cost_box,
  primary_image, url, is_active, is_waterproof,
  installation_method, residential_warranty, commercial_warranty,
  last_price_update
) VALUES (
  'ANDOVER_KINGSDOWN_GRAY_LUXURY_VINYL_PLANKS',
  'Andover Kingsdown Gray',
  'andover-kingsdown-gray-luxury-vinyl-planks',
  'msi',
  'MSI',
  'andover',
  'Luxury Vinyl',
  '7x48',
  'Gray',
  '20mil',
  '5.5mm',
  22,
  2.29,
  50.38,
  'https://cdn.prod.website-files.com/6456ce4476abb2d4f9fbad10/6456ce4576abb21200fbc993_msi-surfaces-surprise-granite-kingsdown-gray-luxury-vinyl-planks-close-up.jpeg',
  '/flooring/andover-kingsdown-gray-luxury-vinyl-planks',
  true,
  true,
  'Click Lock',
  'Lifetime',
  '10 Years',
  NOW()
) ON CONFLICT (sku) DO UPDATE SET
  wholesale_cost_sf = EXCLUDED.wholesale_cost_sf,
  wholesale_cost_box = EXCLUDED.wholesale_cost_box,
  last_price_update = NOW();

INSERT INTO flooring_products (
  sku, name, slug, vendor_id, brand, collection,
  type, dimensions, primary_color, wear_layer, thickness,
  sf_per_box, wholesale_cost_sf, wholesale_cost_box,
  primary_image, url, is_active, is_waterproof,
  installation_method, residential_warranty, commercial_warranty,
  last_price_update
) VALUES (
  'ANDOVER_WHITBY_WHITE_LUXURY_VINYL_PLANKS',
  'Andover Whitby White',
  'andover-whitby-white-luxury-vinyl-planks',
  'msi',
  'MSI',
  'andover',
  'Luxury Vinyl',
  '7x48',
  'White',
  '20mil',
  '5.5mm',
  22,
  2.29,
  50.38,
  'https://cdn.prod.website-files.com/6456ce4476abb2d4f9fbad10/6456ce4576abb280eafbc99f_msi-surfaces-surprise-granite-whitby-white-luxury-vinyl-planks-close-up.jpeg',
  '/flooring/andover-whitby-white-luxury-vinyl-planks',
  true,
  true,
  'Click Lock',
  'Lifetime',
  '10 Years',
  NOW()
) ON CONFLICT (sku) DO UPDATE SET
  wholesale_cost_sf = EXCLUDED.wholesale_cost_sf,
  wholesale_cost_box = EXCLUDED.wholesale_cost_box,
  last_price_update = NOW();

INSERT INTO flooring_products (
  sku, name, slug, vendor_id, brand, collection,
  type, dimensions, primary_color, wear_layer, thickness,
  sf_per_box, wholesale_cost_sf, wholesale_cost_box,
  primary_image, url, is_active, is_waterproof,
  installation_method, residential_warranty, commercial_warranty,
  last_price_update
) VALUES (
  'ANTHRACITE',
  'Anthracite',
  'anthracite',
  'msi',
  'MSI',
  'unknown',
  'Luxury Vinyl',
  '7x48',
  'Multi',
  '20mil',
  '5.5mm',
  22,
  2.29,
  50.38,
  'https://cdn.prod.website-files.com/6456ce4476abb25581fbad0c/6456ce4476abb27beffbb16a_Surprise%20Granite%20Transparent%20Dark%20Wide.svg',
  '/flooring/anthracite',
  true,
  true,
  'Click Lock',
  'Lifetime',
  '10 Years',
  NOW()
) ON CONFLICT (sku) DO UPDATE SET
  wholesale_cost_sf = EXCLUDED.wholesale_cost_sf,
  wholesale_cost_box = EXCLUDED.wholesale_cost_box,
  last_price_update = NOW();

INSERT INTO flooring_products (
  sku, name, slug, vendor_id, brand, collection,
  type, dimensions, primary_color, wear_layer, thickness,
  sf_per_box, wholesale_cost_sf, wholesale_cost_box,
  primary_image, url, is_active, is_waterproof,
  installation_method, residential_warranty, commercial_warranty,
  last_price_update
) VALUES (
  'ASHTON_BERGEN_HILLS_LUXURY_VINYL_PLANKS',
  'Ashton Bergen Hills',
  'ashton-bergen-hills-luxury-vinyl-planks',
  'msi',
  'MSI',
  'ashton',
  'Luxury Vinyl',
  '7x48',
  'Multi',
  '20mil',
  '5.5mm',
  22,
  2.29,
  50.38,
  'https://cdn.prod.website-files.com/6456ce4476abb2d4f9fbad10/6456ce4576abb28021fbc9ab_msi-surfaces-surprise-granite-ashton-bergen-hills-luxury-vinyl-planks-close-up.jpeg',
  '/flooring/ashton-bergen-hills-luxury-vinyl-planks',
  true,
  true,
  'Click Lock',
  'Lifetime',
  '10 Years',
  NOW()
) ON CONFLICT (sku) DO UPDATE SET
  wholesale_cost_sf = EXCLUDED.wholesale_cost_sf,
  wholesale_cost_box = EXCLUDED.wholesale_cost_box,
  last_price_update = NOW();

INSERT INTO flooring_products (
  sku, name, slug, vendor_id, brand, collection,
  type, dimensions, primary_color, wear_layer, thickness,
  sf_per_box, wholesale_cost_sf, wholesale_cost_box,
  primary_image, url, is_active, is_waterproof,
  installation_method, residential_warranty, commercial_warranty,
  last_price_update
) VALUES (
  'ASHTON_COLSTON_PARK_LUXURY_VINYL_PLANKS',
  'Ashton Colston Park',
  'ashton-colston-park-luxury-vinyl-planks',
  'msi',
  'MSI',
  'ashton',
  'Luxury Vinyl',
  '7x48',
  'Multi',
  '20mil',
  '5.5mm',
  22,
  2.29,
  50.38,
  'https://cdn.prod.website-files.com/6456ce4476abb2d4f9fbad10/6456ce4576abb24633fbc9b2_msi-surfaces-surprise-granite-ashton-colston-park-luxury-vinyl-planks-close-up.jpeg',
  '/flooring/ashton-colston-park-luxury-vinyl-planks',
  true,
  true,
  'Click Lock',
  'Lifetime',
  '10 Years',
  NOW()
) ON CONFLICT (sku) DO UPDATE SET
  wholesale_cost_sf = EXCLUDED.wholesale_cost_sf,
  wholesale_cost_box = EXCLUDED.wholesale_cost_box,
  last_price_update = NOW();

INSERT INTO flooring_products (
  sku, name, slug, vendor_id, brand, collection,
  type, dimensions, primary_color, wear_layer, thickness,
  sf_per_box, wholesale_cost_sf, wholesale_cost_box,
  primary_image, url, is_active, is_waterproof,
  installation_method, residential_warranty, commercial_warranty,
  last_price_update
) VALUES (
  'ASHTON_LOTON_HILL_LUXURY_VINYL_PLANKS',
  'Ashton Loton Hill',
  'ashton-loton-hill-luxury-vinyl-planks',
  'msi',
  'MSI',
  'ashton',
  'Luxury Vinyl',
  '7x48',
  'Multi',
  '20mil',
  '5.5mm',
  22,
  2.29,
  50.38,
  'https://cdn.prod.website-files.com/6456ce4476abb2d4f9fbad10/6456ce4576abb2b83ffbc9be_msi-surfaces-surprise-granite-loton-hill-luxury-vinyl-planks-close-up.jpeg',
  '/flooring/ashton-loton-hill-luxury-vinyl-planks',
  true,
  true,
  'Click Lock',
  'Lifetime',
  '10 Years',
  NOW()
) ON CONFLICT (sku) DO UPDATE SET
  wholesale_cost_sf = EXCLUDED.wholesale_cost_sf,
  wholesale_cost_box = EXCLUDED.wholesale_cost_box,
  last_price_update = NOW();

INSERT INTO flooring_products (
  sku, name, slug, vendor_id, brand, collection,
  type, dimensions, primary_color, wear_layer, thickness,
  sf_per_box, wholesale_cost_sf, wholesale_cost_box,
  primary_image, url, is_active, is_waterproof,
  installation_method, residential_warranty, commercial_warranty,
  last_price_update
) VALUES (
  'ASHTON_MARACAY_BROWN_LUXURY_VINYL_PLANKS',
  'Ashton Maracay Brown',
  'ashton-maracay-brown-luxury-vinyl-planks',
  'msi',
  'MSI',
  'ashton',
  'Luxury Vinyl',
  '7x48',
  'Brown',
  '20mil',
  '5.5mm',
  22,
  2.29,
  50.38,
  'https://cdn.prod.website-files.com/6456ce4476abb2d4f9fbad10/6456ce4576abb27b13fbc9c8_msi-surfaces-surprise-granite-maracay-brown-luxury-vinyl-planks-close-up.jpeg',
  '/flooring/ashton-maracay-brown-luxury-vinyl-planks',
  true,
  true,
  'Click Lock',
  'Lifetime',
  '10 Years',
  NOW()
) ON CONFLICT (sku) DO UPDATE SET
  wholesale_cost_sf = EXCLUDED.wholesale_cost_sf,
  wholesale_cost_box = EXCLUDED.wholesale_cost_box,
  last_price_update = NOW();

INSERT INTO flooring_products (
  sku, name, slug, vendor_id, brand, collection,
  type, dimensions, primary_color, wear_layer, thickness,
  sf_per_box, wholesale_cost_sf, wholesale_cost_box,
  primary_image, url, is_active, is_waterproof,
  installation_method, residential_warranty, commercial_warranty,
  last_price_update
) VALUES (
  'ASHTON_YORK_GRAY_LUXURY_VINYL_PLANKS',
  'Ashton York Gray',
  'ashton-york-gray-luxury-vinyl-planks',
  'msi',
  'MSI',
  'ashton',
  'Luxury Vinyl',
  '7x48',
  'Gray',
  '20mil',
  '5.5mm',
  22,
  2.29,
  50.38,
  'https://cdn.prod.website-files.com/6456ce4476abb2d4f9fbad10/6456ce4576abb2b137fbc9d3_msi-surfaces-surprise-granite-york-gray-luxury-vinyl-planks-close-up.jpeg',
  '/flooring/ashton-york-gray-luxury-vinyl-planks',
  true,
  true,
  'Click Lock',
  'Lifetime',
  '10 Years',
  NOW()
) ON CONFLICT (sku) DO UPDATE SET
  wholesale_cost_sf = EXCLUDED.wholesale_cost_sf,
  wholesale_cost_box = EXCLUDED.wholesale_cost_box,
  last_price_update = NOW();

INSERT INTO flooring_products (
  sku, name, slug, vendor_id, brand, collection,
  type, dimensions, primary_color, wear_layer, thickness,
  sf_per_box, wholesale_cost_sf, wholesale_cost_box,
  primary_image, url, is_active, is_waterproof,
  installation_method, residential_warranty, commercial_warranty,
  last_price_update
) VALUES (
  'CYRUS_AKADIA_LUXURY_VINYL_PLANKS',
  'Cyrus Akadia',
  'cyrus-akadia-luxury-vinyl-planks',
  'msi',
  'MSI',
  'cyrus',
  'SPC',
  '7x48',
  'Multi',
  '12mil',
  '5mm',
  23.4,
  1.99,
  46.57,
  'https://cdn.prod.website-files.com/6456ce4476abb2d4f9fbad10/6456ce4576abb2754dfbc9de_msi-surfaces-surprise-granite-akadia-luxury-vinyl-planks-close-up.jpeg',
  '/flooring/cyrus-akadia-luxury-vinyl-planks',
  true,
  true,
  'Click Lock',
  'Lifetime',
  '10 Years',
  NOW()
) ON CONFLICT (sku) DO UPDATE SET
  wholesale_cost_sf = EXCLUDED.wholesale_cost_sf,
  wholesale_cost_box = EXCLUDED.wholesale_cost_box,
  last_price_update = NOW();

INSERT INTO flooring_products (
  sku, name, slug, vendor_id, brand, collection,
  type, dimensions, primary_color, wear_layer, thickness,
  sf_per_box, wholesale_cost_sf, wholesale_cost_box,
  primary_image, url, is_active, is_waterproof,
  installation_method, residential_warranty, commercial_warranty,
  last_price_update
) VALUES (
  'CYRUS_BARRELL_LUXURY_VINYL_PLANKS',
  'Cyrus Barrell',
  'cyrus-barrell-luxury-vinyl-planks',
  'msi',
  'MSI',
  'cyrus',
  'SPC',
  '7x48',
  'Multi',
  '12mil',
  '5mm',
  23.4,
  1.99,
  46.57,
  'https://cdn.prod.website-files.com/6456ce4476abb2d4f9fbad10/6456ce4576abb24c12fbc9e8_msi-surfaces-surprise-granite-barrell-luxury-vinyl-planks-close-up.jpeg',
  '/flooring/cyrus-barrell-luxury-vinyl-planks',
  true,
  true,
  'Click Lock',
  'Lifetime',
  '10 Years',
  NOW()
) ON CONFLICT (sku) DO UPDATE SET
  wholesale_cost_sf = EXCLUDED.wholesale_cost_sf,
  wholesale_cost_box = EXCLUDED.wholesale_cost_box,
  last_price_update = NOW();

INSERT INTO flooring_products (
  sku, name, slug, vendor_id, brand, collection,
  type, dimensions, primary_color, wear_layer, thickness,
  sf_per_box, wholesale_cost_sf, wholesale_cost_box,
  primary_image, url, is_active, is_waterproof,
  installation_method, residential_warranty, commercial_warranty,
  last_price_update
) VALUES (
  'CYRUS_BEMBRIDGE_LUXURY_VINYL_PLANKS',
  'Cyrus Bembridge',
  'cyrus-bembridge-luxury-vinyl-planks',
  'msi',
  'MSI',
  'cyrus',
  'SPC',
  '7x48',
  'Multi',
  '12mil',
  '5mm',
  23.4,
  1.99,
  46.57,
  'https://cdn.prod.website-files.com/6456ce4476abb2d4f9fbad10/6456ce4576abb27254fbc9f1_msi-surfaces-surprise-granite-bembridge-luxury-vinyl-planks-close-up.jpeg',
  '/flooring/cyrus-bembridge-luxury-vinyl-planks',
  true,
  true,
  'Click Lock',
  'Lifetime',
  '10 Years',
  NOW()
) ON CONFLICT (sku) DO UPDATE SET
  wholesale_cost_sf = EXCLUDED.wholesale_cost_sf,
  wholesale_cost_box = EXCLUDED.wholesale_cost_box,
  last_price_update = NOW();

INSERT INTO flooring_products (
  sku, name, slug, vendor_id, brand, collection,
  type, dimensions, primary_color, wear_layer, thickness,
  sf_per_box, wholesale_cost_sf, wholesale_cost_box,
  primary_image, url, is_active, is_waterproof,
  installation_method, residential_warranty, commercial_warranty,
  last_price_update
) VALUES (
  'CYRUS_BILLINGHAM_LUXURY_VINYL_PLANKS',
  'Cyrus Billingham',
  'cyrus-billingham-luxury-vinyl-planks',
  'msi',
  'MSI',
  'cyrus',
  'SPC',
  '7x48',
  'Multi',
  '12mil',
  '5mm',
  23.4,
  1.99,
  46.57,
  'https://cdn.prod.website-files.com/6456ce4476abb2d4f9fbad10/6456ce4576abb28456fbc9f4_msi-surfaces-surprise-granite-billingham-luxury-vinyl-planks-close-up.jpeg',
  '/flooring/cyrus-billingham-luxury-vinyl-planks',
  true,
  true,
  'Click Lock',
  'Lifetime',
  '10 Years',
  NOW()
) ON CONFLICT (sku) DO UPDATE SET
  wholesale_cost_sf = EXCLUDED.wholesale_cost_sf,
  wholesale_cost_box = EXCLUDED.wholesale_cost_box,
  last_price_update = NOW();

INSERT INTO flooring_products (
  sku, name, slug, vendor_id, brand, collection,
  type, dimensions, primary_color, wear_layer, thickness,
  sf_per_box, wholesale_cost_sf, wholesale_cost_box,
  primary_image, url, is_active, is_waterproof,
  installation_method, residential_warranty, commercial_warranty,
  last_price_update
) VALUES (
  'CYRUS_BOSWELL_LUXURY_VINYL_PLANKS',
  'Cyrus Boswell',
  'cyrus-boswell-luxury-vinyl-planks',
  'msi',
  'MSI',
  'cyrus',
  'SPC',
  '7x48',
  'Multi',
  '12mil',
  '5mm',
  23.4,
  1.99,
  46.57,
  'https://cdn.prod.website-files.com/6456ce4476abb2d4f9fbad10/6456ce4576abb2e3abfbc9ff_msi-surfaces-surprise-granite-bosewell-luxury-vinyl-planks-close-up.jpeg',
  '/flooring/cyrus-boswell-luxury-vinyl-planks',
  true,
  true,
  'Click Lock',
  'Lifetime',
  '10 Years',
  NOW()
) ON CONFLICT (sku) DO UPDATE SET
  wholesale_cost_sf = EXCLUDED.wholesale_cost_sf,
  wholesale_cost_box = EXCLUDED.wholesale_cost_box,
  last_price_update = NOW();

INSERT INTO flooring_products (
  sku, name, slug, vendor_id, brand, collection,
  type, dimensions, primary_color, wear_layer, thickness,
  sf_per_box, wholesale_cost_sf, wholesale_cost_box,
  primary_image, url, is_active, is_waterproof,
  installation_method, residential_warranty, commercial_warranty,
  last_price_update
) VALUES (
  'CYRUS_BRACKEN_HILL_LUXURY_VINYL_PLANKS',
  'Cyrus Bracken Hill',
  'cyrus-bracken-hill-luxury-vinyl-planks',
  'msi',
  'MSI',
  'cyrus',
  'SPC',
  '7x48',
  'Multi',
  '12mil',
  '5mm',
  23.4,
  1.99,
  46.57,
  'https://cdn.prod.website-files.com/6456ce4476abb2d4f9fbad10/6456ce4576abb20eb7fbca0a_msi-surfaces-surprise-granite-bracken-hill-luxury-vinyl-planks-close-up.jpeg',
  '/flooring/cyrus-bracken-hill-luxury-vinyl-planks',
  true,
  true,
  'Click Lock',
  'Lifetime',
  '10 Years',
  NOW()
) ON CONFLICT (sku) DO UPDATE SET
  wholesale_cost_sf = EXCLUDED.wholesale_cost_sf,
  wholesale_cost_box = EXCLUDED.wholesale_cost_box,
  last_price_update = NOW();

INSERT INTO flooring_products (
  sku, name, slug, vendor_id, brand, collection,
  type, dimensions, primary_color, wear_layer, thickness,
  sf_per_box, wholesale_cost_sf, wholesale_cost_box,
  primary_image, url, is_active, is_waterproof,
  installation_method, residential_warranty, commercial_warranty,
  last_price_update
) VALUES (
  'CYRUS_BRALY_LUXURY_VINYL_PLANKS',
  'Cyrus Braly',
  'cyrus-braly-luxury-vinyl-planks',
  'msi',
  'MSI',
  'wilmont',
  'SPC',
  '7x48',
  'Multi',
  '20mil',
  '6.5mm',
  22,
  2.49,
  54.78,
  'https://cdn.prod.website-files.com/6456ce4476abb2d4f9fbad10/6456ce4576abb22d08fbca16_msi-surfaces-surprise-granite-braly-luxury-vinyl-planks-close-up.jpeg',
  '/flooring/cyrus-braly-luxury-vinyl-planks',
  true,
  true,
  'Click Lock',
  'Lifetime',
  '10 Years',
  NOW()
) ON CONFLICT (sku) DO UPDATE SET
  wholesale_cost_sf = EXCLUDED.wholesale_cost_sf,
  wholesale_cost_box = EXCLUDED.wholesale_cost_box,
  last_price_update = NOW();

INSERT INTO flooring_products (
  sku, name, slug, vendor_id, brand, collection,
  type, dimensions, primary_color, wear_layer, thickness,
  sf_per_box, wholesale_cost_sf, wholesale_cost_box,
  primary_image, url, is_active, is_waterproof,
  installation_method, residential_warranty, commercial_warranty,
  last_price_update
) VALUES (
  'CYRUS_BRIANKA_LUXURY_VINYL_PLANKS',
  'Cyrus Brianka',
  'cyrus-brianka-luxury-vinyl-planks',
  'msi',
  'MSI',
  'cyrus',
  'SPC',
  '7x48',
  'Multi',
  '12mil',
  '5mm',
  23.4,
  1.99,
  46.57,
  'https://cdn.prod.website-files.com/6456ce4476abb2d4f9fbad10/6456ce4576abb203adfbca1c_msi-surfaces-surprise-granite-brianka-luxury-vinyl-planks-close-up.jpeg',
  '/flooring/cyrus-brianka-luxury-vinyl-planks',
  true,
  true,
  'Click Lock',
  'Lifetime',
  '10 Years',
  NOW()
) ON CONFLICT (sku) DO UPDATE SET
  wholesale_cost_sf = EXCLUDED.wholesale_cost_sf,
  wholesale_cost_box = EXCLUDED.wholesale_cost_box,
  last_price_update = NOW();

INSERT INTO flooring_products (
  sku, name, slug, vendor_id, brand, collection,
  type, dimensions, primary_color, wear_layer, thickness,
  sf_per_box, wholesale_cost_sf, wholesale_cost_box,
  primary_image, url, is_active, is_waterproof,
  installation_method, residential_warranty, commercial_warranty,
  last_price_update
) VALUES (
  'CYRUS_BROOKLINE_LUXURY_VINYL_PLANKS',
  'Cyrus Brookline',
  'cyrus-brookline-luxury-vinyl-planks',
  'msi',
  'MSI',
  'cyrus',
  'SPC',
  '7x48',
  'Multi',
  '12mil',
  '5mm',
  23.4,
  1.99,
  46.57,
  'https://cdn.prod.website-files.com/6456ce4476abb2d4f9fbad10/6456ce4576abb2fc10fbca22_msi-surfaces-surprise-granite-brookline-luxury-vinyl-planks-close-up.jpeg',
  '/flooring/cyrus-brookline-luxury-vinyl-planks',
  true,
  true,
  'Click Lock',
  'Lifetime',
  '10 Years',
  NOW()
) ON CONFLICT (sku) DO UPDATE SET
  wholesale_cost_sf = EXCLUDED.wholesale_cost_sf,
  wholesale_cost_box = EXCLUDED.wholesale_cost_box,
  last_price_update = NOW();

INSERT INTO flooring_products (
  sku, name, slug, vendor_id, brand, collection,
  type, dimensions, primary_color, wear_layer, thickness,
  sf_per_box, wholesale_cost_sf, wholesale_cost_box,
  primary_image, url, is_active, is_waterproof,
  installation_method, residential_warranty, commercial_warranty,
  last_price_update
) VALUES (
  'CYRUS_CRANTON_LUXURY_VINYL_PLANKS',
  'Cyrus Cranton',
  'cyrus-cranton-luxury-vinyl-planks',
  'msi',
  'MSI',
  'cyrus',
  'SPC',
  '7x48',
  'Multi',
  '12mil',
  '5mm',
  23.4,
  1.99,
  46.57,
  'https://cdn.prod.website-files.com/6456ce4476abb2d4f9fbad10/6456ce4576abb242d7fbca2d_msi-surfaces-surprise-granite-cranton-luxury-vinyl-planks-close-up.jpeg',
  '/flooring/cyrus-cranton-luxury-vinyl-planks',
  true,
  true,
  'Click Lock',
  'Lifetime',
  '10 Years',
  NOW()
) ON CONFLICT (sku) DO UPDATE SET
  wholesale_cost_sf = EXCLUDED.wholesale_cost_sf,
  wholesale_cost_box = EXCLUDED.wholesale_cost_box,
  last_price_update = NOW();

INSERT INTO flooring_products (
  sku, name, slug, vendor_id, brand, collection,
  type, dimensions, primary_color, wear_layer, thickness,
  sf_per_box, wholesale_cost_sf, wholesale_cost_box,
  primary_image, url, is_active, is_waterproof,
  installation_method, residential_warranty, commercial_warranty,
  last_price_update
) VALUES (
  'CYRUS_DRAVEN_LUXURY_VINYL_PLANKS',
  'Cyrus Draven',
  'cyrus-draven-luxury-vinyl-planks',
  'msi',
  'MSI',
  'cyrus',
  'SPC',
  '7x48',
  'Multi',
  '12mil',
  '5mm',
  23.4,
  1.99,
  46.57,
  'https://cdn.prod.website-files.com/6456ce4476abb2d4f9fbad10/6456ce4576abb2ab23fbca39_msi-surfaces-surprise-granite-draven-luxury-vinyl-planks-close-up.jpeg',
  '/flooring/cyrus-draven-luxury-vinyl-planks',
  true,
  true,
  'Click Lock',
  'Lifetime',
  '10 Years',
  NOW()
) ON CONFLICT (sku) DO UPDATE SET
  wholesale_cost_sf = EXCLUDED.wholesale_cost_sf,
  wholesale_cost_box = EXCLUDED.wholesale_cost_box,
  last_price_update = NOW();

INSERT INTO flooring_products (
  sku, name, slug, vendor_id, brand, collection,
  type, dimensions, primary_color, wear_layer, thickness,
  sf_per_box, wholesale_cost_sf, wholesale_cost_box,
  primary_image, url, is_active, is_waterproof,
  installation_method, residential_warranty, commercial_warranty,
  last_price_update
) VALUES (
  'CYRUS_DUNITE_OAK_LUXURY_VINYL_PLANKS',
  'Cyrus Dunite Oak',
  'cyrus-dunite-oak-luxury-vinyl-planks',
  'msi',
  'MSI',
  'cyrus',
  'SPC',
  '7x48',
  'Multi',
  '12mil',
  '5mm',
  23.4,
  1.99,
  46.57,
  'https://cdn.prod.website-files.com/6456ce4476abb2d4f9fbad10/6456ce4576abb21c81fbca3f_msi-surfaces-surprise-granite-dunite-oak-luxury-vinyl-planks-close-up.jpeg',
  '/flooring/cyrus-dunite-oak-luxury-vinyl-planks',
  true,
  true,
  'Click Lock',
  'Lifetime',
  '10 Years',
  NOW()
) ON CONFLICT (sku) DO UPDATE SET
  wholesale_cost_sf = EXCLUDED.wholesale_cost_sf,
  wholesale_cost_box = EXCLUDED.wholesale_cost_box,
  last_price_update = NOW();

INSERT INTO flooring_products (
  sku, name, slug, vendor_id, brand, collection,
  type, dimensions, primary_color, wear_layer, thickness,
  sf_per_box, wholesale_cost_sf, wholesale_cost_box,
  primary_image, url, is_active, is_waterproof,
  installation_method, residential_warranty, commercial_warranty,
  last_price_update
) VALUES (
  'CYRUS_EXOTIKA_LUXURY_VINYL_PLANKS',
  'Cyrus Exotika',
  'cyrus-exotika-luxury-vinyl-planks',
  'msi',
  'MSI',
  'cyrus',
  'SPC',
  '7x48',
  'Multi',
  '12mil',
  '5mm',
  23.4,
  1.99,
  46.57,
  'https://cdn.prod.website-files.com/6456ce4476abb2d4f9fbad10/6456ce4576abb29f45fbca4a_msi-surfaces-surprise-granite-exotika-luxury-vinyl-planks-close-up.jpeg',
  '/flooring/cyrus-exotika-luxury-vinyl-planks',
  true,
  true,
  'Click Lock',
  'Lifetime',
  '10 Years',
  NOW()
) ON CONFLICT (sku) DO UPDATE SET
  wholesale_cost_sf = EXCLUDED.wholesale_cost_sf,
  wholesale_cost_box = EXCLUDED.wholesale_cost_box,
  last_price_update = NOW();

INSERT INTO flooring_products (
  sku, name, slug, vendor_id, brand, collection,
  type, dimensions, primary_color, wear_layer, thickness,
  sf_per_box, wholesale_cost_sf, wholesale_cost_box,
  primary_image, url, is_active, is_waterproof,
  installation_method, residential_warranty, commercial_warranty,
  last_price_update
) VALUES (
  'CYRUS_FAUNA_LUXURY_VINYL_PLANKS',
  'Cyrus Fauna',
  'cyrus-fauna-luxury-vinyl-planks',
  'msi',
  'MSI',
  'cyrus',
  'SPC',
  '7x48',
  'Multi',
  '12mil',
  '5mm',
  23.4,
  1.99,
  46.57,
  'https://cdn.prod.website-files.com/6456ce4476abb2d4f9fbad10/6456ce4576abb26396fbca58_msi-surfaces-surprise-granite-fauna-luxury-vinyl-planks-close-up.jpeg',
  '/flooring/cyrus-fauna-luxury-vinyl-planks',
  true,
  true,
  'Click Lock',
  'Lifetime',
  '10 Years',
  NOW()
) ON CONFLICT (sku) DO UPDATE SET
  wholesale_cost_sf = EXCLUDED.wholesale_cost_sf,
  wholesale_cost_box = EXCLUDED.wholesale_cost_box,
  last_price_update = NOW();

INSERT INTO flooring_products (
  sku, name, slug, vendor_id, brand, collection,
  type, dimensions, primary_color, wear_layer, thickness,
  sf_per_box, wholesale_cost_sf, wholesale_cost_box,
  primary_image, url, is_active, is_waterproof,
  installation_method, residential_warranty, commercial_warranty,
  last_price_update
) VALUES (
  'CYRUS_FINELY_LUXURY_VINYL_PLANKS',
  'Cyrus Finely',
  'cyrus-finely-luxury-vinyl-planks',
  'msi',
  'MSI',
  'cyrus',
  'SPC',
  '7x48',
  'Multi',
  '12mil',
  '5mm',
  23.4,
  1.99,
  46.57,
  'https://cdn.prod.website-files.com/6456ce4476abb2d4f9fbad10/6456ce4576abb27995fbca5b_msi-surfaces-surprise-granite-finely-luxury-vinyl-planks-close-up.jpeg',
  '/flooring/cyrus-finely-luxury-vinyl-planks',
  true,
  true,
  'Click Lock',
  'Lifetime',
  '10 Years',
  NOW()
) ON CONFLICT (sku) DO UPDATE SET
  wholesale_cost_sf = EXCLUDED.wholesale_cost_sf,
  wholesale_cost_box = EXCLUDED.wholesale_cost_box,
  last_price_update = NOW();

INSERT INTO flooring_products (
  sku, name, slug, vendor_id, brand, collection,
  type, dimensions, primary_color, wear_layer, thickness,
  sf_per_box, wholesale_cost_sf, wholesale_cost_box,
  primary_image, url, is_active, is_waterproof,
  installation_method, residential_warranty, commercial_warranty,
  last_price_update
) VALUES (
  'CYRUS_GRAYTON_LUXURY_VINYL_PLANKS',
  'Cyrus Grayton',
  'cyrus-grayton-luxury-vinyl-planks',
  'msi',
  'MSI',
  'cyrus',
  'SPC',
  '7x48',
  'Gray',
  '12mil',
  '5mm',
  23.4,
  1.99,
  46.57,
  'https://cdn.prod.website-files.com/6456ce4476abb2d4f9fbad10/6456ce4576abb25d6afbca69_msi-surfaces-surprise-granite-grayton-luxury-vinyl-planks-close-up.jpeg',
  '/flooring/cyrus-grayton-luxury-vinyl-planks',
  true,
  true,
  'Click Lock',
  'Lifetime',
  '10 Years',
  NOW()
) ON CONFLICT (sku) DO UPDATE SET
  wholesale_cost_sf = EXCLUDED.wholesale_cost_sf,
  wholesale_cost_box = EXCLUDED.wholesale_cost_box,
  last_price_update = NOW();

INSERT INTO flooring_products (
  sku, name, slug, vendor_id, brand, collection,
  type, dimensions, primary_color, wear_layer, thickness,
  sf_per_box, wholesale_cost_sf, wholesale_cost_box,
  primary_image, url, is_active, is_waterproof,
  installation_method, residential_warranty, commercial_warranty,
  last_price_update
) VALUES (
  'CYRUS_HAWTHORNE_LUXURY_VINYL_PLANKS',
  'Cyrus Hawthorne',
  'cyrus-hawthorne-luxury-vinyl-planks',
  'msi',
  'MSI',
  'cyrus',
  'SPC',
  '7x48',
  'Multi',
  '12mil',
  '5mm',
  23.4,
  1.99,
  46.57,
  'https://cdn.prod.website-files.com/6456ce4476abb2d4f9fbad10/6456ce4576abb2089efbca73_msi-surfaces-surprise-granite-hawthorne-luxury-vinyl-planks-close-up.jpeg',
  '/flooring/cyrus-hawthorne-luxury-vinyl-planks',
  true,
  true,
  'Click Lock',
  'Lifetime',
  '10 Years',
  NOW()
) ON CONFLICT (sku) DO UPDATE SET
  wholesale_cost_sf = EXCLUDED.wholesale_cost_sf,
  wholesale_cost_box = EXCLUDED.wholesale_cost_box,
  last_price_update = NOW();

INSERT INTO flooring_products (
  sku, name, slug, vendor_id, brand, collection,
  type, dimensions, primary_color, wear_layer, thickness,
  sf_per_box, wholesale_cost_sf, wholesale_cost_box,
  primary_image, url, is_active, is_waterproof,
  installation_method, residential_warranty, commercial_warranty,
  last_price_update
) VALUES (
  'CYRUS_JENTA_LUXURY_VINYL_PLANKS',
  'Cyrus Jenta',
  'cyrus-jenta-luxury-vinyl-planks',
  'msi',
  'MSI',
  'cyrus',
  'SPC',
  '7x48',
  'Multi',
  '12mil',
  '5mm',
  23.4,
  1.99,
  46.57,
  'https://cdn.prod.website-files.com/6456ce4476abb2d4f9fbad10/6456ce4576abb29afefbca7f_msi-surfaces-surprise-granite-jenta-luxury-vinyl-planks-close-up.jpeg',
  '/flooring/cyrus-jenta-luxury-vinyl-planks',
  true,
  true,
  'Click Lock',
  'Lifetime',
  '10 Years',
  NOW()
) ON CONFLICT (sku) DO UPDATE SET
  wholesale_cost_sf = EXCLUDED.wholesale_cost_sf,
  wholesale_cost_box = EXCLUDED.wholesale_cost_box,
  last_price_update = NOW();

INSERT INTO flooring_products (
  sku, name, slug, vendor_id, brand, collection,
  type, dimensions, primary_color, wear_layer, thickness,
  sf_per_box, wholesale_cost_sf, wholesale_cost_box,
  primary_image, url, is_active, is_waterproof,
  installation_method, residential_warranty, commercial_warranty,
  last_price_update
) VALUES (
  'CYRUS_KARDIGAN_LUXURY_VINYL_PLANKS',
  'Cyrus Kardigan',
  'cyrus-kardigan-luxury-vinyl-planks',
  'msi',
  'MSI',
  'cyrus',
  'SPC',
  '7x48',
  'Multi',
  '12mil',
  '5mm',
  23.4,
  1.99,
  46.57,
  'https://cdn.prod.website-files.com/6456ce4476abb2d4f9fbad10/6456ce4576abb2aab9fbca88_msi-surfaces-surprise-granite-kardigan-luxury-vinyl-planks-close-up.jpeg',
  '/flooring/cyrus-kardigan-luxury-vinyl-planks',
  true,
  true,
  'Click Lock',
  'Lifetime',
  '10 Years',
  NOW()
) ON CONFLICT (sku) DO UPDATE SET
  wholesale_cost_sf = EXCLUDED.wholesale_cost_sf,
  wholesale_cost_box = EXCLUDED.wholesale_cost_box,
  last_price_update = NOW();

INSERT INTO flooring_products (
  sku, name, slug, vendor_id, brand, collection,
  type, dimensions, primary_color, wear_layer, thickness,
  sf_per_box, wholesale_cost_sf, wholesale_cost_box,
  primary_image, url, is_active, is_waterproof,
  installation_method, residential_warranty, commercial_warranty,
  last_price_update
) VALUES (
  'CYRUS_KATELLA_ASH_LUXURY_VINYL_PLANKS',
  'Cyrus Katella Ash',
  'cyrus-katella-ash-luxury-vinyl-planks',
  'msi',
  'MSI',
  'cyrus',
  'SPC',
  '7x48',
  'Multi',
  '12mil',
  '5mm',
  23.4,
  1.99,
  46.57,
  'https://cdn.prod.website-files.com/6456ce4476abb2d4f9fbad10/6456ce4576abb2e412fbca94_msi-surfaces-surprise-granite-katella-luxury-vinyl-planks-close-up.jpeg',
  '/flooring/cyrus-katella-ash-luxury-vinyl-planks',
  true,
  true,
  'Click Lock',
  'Lifetime',
  '10 Years',
  NOW()
) ON CONFLICT (sku) DO UPDATE SET
  wholesale_cost_sf = EXCLUDED.wholesale_cost_sf,
  wholesale_cost_box = EXCLUDED.wholesale_cost_box,
  last_price_update = NOW();

INSERT INTO flooring_products (
  sku, name, slug, vendor_id, brand, collection,
  type, dimensions, primary_color, wear_layer, thickness,
  sf_per_box, wholesale_cost_sf, wholesale_cost_box,
  primary_image, url, is_active, is_waterproof,
  installation_method, residential_warranty, commercial_warranty,
  last_price_update
) VALUES (
  'CYRUS_LUDLOW_LUXURY_VINYL_PLANKS',
  'Cyrus Ludlow',
  'cyrus-ludlow-luxury-vinyl-planks',
  'msi',
  'MSI',
  'cyrus',
  'SPC',
  '7x48',
  'Multi',
  '12mil',
  '5mm',
  23.4,
  1.99,
  46.57,
  'https://cdn.prod.website-files.com/6456ce4476abb2d4f9fbad10/6456ce4576abb27097fbcaa0_msi-surfaces-surprise-granite-ludlow-luxury-vinyl-planks-close-up.jpeg',
  '/flooring/cyrus-ludlow-luxury-vinyl-planks',
  true,
  true,
  'Click Lock',
  'Lifetime',
  '10 Years',
  NOW()
) ON CONFLICT (sku) DO UPDATE SET
  wholesale_cost_sf = EXCLUDED.wholesale_cost_sf,
  wholesale_cost_box = EXCLUDED.wholesale_cost_box,
  last_price_update = NOW();

INSERT INTO flooring_products (
  sku, name, slug, vendor_id, brand, collection,
  type, dimensions, primary_color, wear_layer, thickness,
  sf_per_box, wholesale_cost_sf, wholesale_cost_box,
  primary_image, url, is_active, is_waterproof,
  installation_method, residential_warranty, commercial_warranty,
  last_price_update
) VALUES (
  'CYRUS_MEZCLA_LUXURY_VINYL_PLANKS',
  'Cyrus Mezcla',
  'cyrus-mezcla-luxury-vinyl-planks',
  'msi',
  'MSI',
  'cyrus',
  'SPC',
  '7x48',
  'Multi',
  '12mil',
  '5mm',
  23.4,
  1.99,
  46.57,
  'https://cdn.prod.website-files.com/6456ce4476abb2d4f9fbad10/6456ce4576abb27609fbcaac_msi-surfaces-surprise-granite-mezcla-luxury-vinyl-planks-close-up.jpeg',
  '/flooring/cyrus-mezcla-luxury-vinyl-planks',
  true,
  true,
  'Click Lock',
  'Lifetime',
  '10 Years',
  NOW()
) ON CONFLICT (sku) DO UPDATE SET
  wholesale_cost_sf = EXCLUDED.wholesale_cost_sf,
  wholesale_cost_box = EXCLUDED.wholesale_cost_box,
  last_price_update = NOW();

INSERT INTO flooring_products (
  sku, name, slug, vendor_id, brand, collection,
  type, dimensions, primary_color, wear_layer, thickness,
  sf_per_box, wholesale_cost_sf, wholesale_cost_box,
  primary_image, url, is_active, is_waterproof,
  installation_method, residential_warranty, commercial_warranty,
  last_price_update
) VALUES (
  'CYRUS_RUNMILL_ISLE_LUXURY_VINYL_PLANKS',
  'Cyrus Runmill Isle',
  'cyrus-runmill-isle-luxury-vinyl-planks',
  'msi',
  'MSI',
  'cyrus',
  'SPC',
  '7x48',
  'Multi',
  '12mil',
  '5mm',
  23.4,
  1.99,
  46.57,
  'https://cdn.prod.website-files.com/6456ce4476abb2d4f9fbad10/6456ce4576abb2681bfbcab5_msi-surfaces-surprise-granite-runmill-isle-luxury-vinyl-planks-close-up.jpeg',
  '/flooring/cyrus-runmill-isle-luxury-vinyl-planks',
  true,
  true,
  'Click Lock',
  'Lifetime',
  '10 Years',
  NOW()
) ON CONFLICT (sku) DO UPDATE SET
  wholesale_cost_sf = EXCLUDED.wholesale_cost_sf,
  wholesale_cost_box = EXCLUDED.wholesale_cost_box,
  last_price_update = NOW();

INSERT INTO flooring_products (
  sku, name, slug, vendor_id, brand, collection,
  type, dimensions, primary_color, wear_layer, thickness,
  sf_per_box, wholesale_cost_sf, wholesale_cost_box,
  primary_image, url, is_active, is_waterproof,
  installation_method, residential_warranty, commercial_warranty,
  last_price_update
) VALUES (
  'CYRUS_RYDER_LUXURY_VINYL_PLANKS',
  'Cyrus Ryder',
  'cyrus-ryder-luxury-vinyl-planks',
  'msi',
  'MSI',
  'cyrus',
  'SPC',
  '7x48',
  'Multi',
  '12mil',
  '5mm',
  23.4,
  1.99,
  46.57,
  'https://cdn.prod.website-files.com/6456ce4476abb2d4f9fbad10/6456ce4576abb226a0fbcac7_msi-surfaces-surprise-granite-ryder-luxury-vinyl-planks-close-up.jpeg',
  '/flooring/cyrus-ryder-luxury-vinyl-planks',
  true,
  true,
  'Click Lock',
  'Lifetime',
  '10 Years',
  NOW()
) ON CONFLICT (sku) DO UPDATE SET
  wholesale_cost_sf = EXCLUDED.wholesale_cost_sf,
  wholesale_cost_box = EXCLUDED.wholesale_cost_box,
  last_price_update = NOW();

INSERT INTO flooring_products (
  sku, name, slug, vendor_id, brand, collection,
  type, dimensions, primary_color, wear_layer, thickness,
  sf_per_box, wholesale_cost_sf, wholesale_cost_box,
  primary_image, url, is_active, is_waterproof,
  installation_method, residential_warranty, commercial_warranty,
  last_price_update
) VALUES (
  'CYRUS_SANDINO_LUXURY_VINYL_PLANKS',
  'Cyrus Sandino',
  'cyrus-sandino-luxury-vinyl-planks',
  'msi',
  'MSI',
  'wilmont',
  'SPC',
  '7x48',
  'Multi',
  '20mil',
  '6.5mm',
  22,
  2.49,
  54.78,
  'https://cdn.prod.website-files.com/6456ce4476abb2d4f9fbad10/6456ce4576abb2d82cfbcad3_msi-surfaces-surprise-granite-sandino-luxury-vinyl-planks-close-up.jpeg',
  '/flooring/cyrus-sandino-luxury-vinyl-planks',
  true,
  true,
  'Click Lock',
  'Lifetime',
  '10 Years',
  NOW()
) ON CONFLICT (sku) DO UPDATE SET
  wholesale_cost_sf = EXCLUDED.wholesale_cost_sf,
  wholesale_cost_box = EXCLUDED.wholesale_cost_box,
  last_price_update = NOW();

INSERT INTO flooring_products (
  sku, name, slug, vendor_id, brand, collection,
  type, dimensions, primary_color, wear_layer, thickness,
  sf_per_box, wholesale_cost_sf, wholesale_cost_box,
  primary_image, url, is_active, is_waterproof,
  installation_method, residential_warranty, commercial_warranty,
  last_price_update
) VALUES (
  'CYRUS_STABLE_LUXURY_VINYL_PLANKS',
  'Cyrus Stable',
  'cyrus-stable-luxury-vinyl-planks',
  'msi',
  'MSI',
  'cyrus',
  'SPC',
  '7x48',
  'Multi',
  '12mil',
  '5mm',
  23.4,
  1.99,
  46.57,
  'https://cdn.prod.website-files.com/6456ce4476abb2d4f9fbad10/6456ce4576abb2fb1bfbcadc_msi-surfaces-surprise-granite-stable-luxury-vinyl-planks-close-up.jpeg',
  '/flooring/cyrus-stable-luxury-vinyl-planks',
  true,
  true,
  'Click Lock',
  'Lifetime',
  '10 Years',
  NOW()
) ON CONFLICT (sku) DO UPDATE SET
  wholesale_cost_sf = EXCLUDED.wholesale_cost_sf,
  wholesale_cost_box = EXCLUDED.wholesale_cost_box,
  last_price_update = NOW();

INSERT INTO flooring_products (
  sku, name, slug, vendor_id, brand, collection,
  type, dimensions, primary_color, wear_layer, thickness,
  sf_per_box, wholesale_cost_sf, wholesale_cost_box,
  primary_image, url, is_active, is_waterproof,
  installation_method, residential_warranty, commercial_warranty,
  last_price_update
) VALUES (
  'CYRUS_WALNUT_WAVES_LUXURY_VINYL_PLANKS',
  'Cyrus Walnut Waves',
  'cyrus-walnut-waves-luxury-vinyl-planks',
  'msi',
  'MSI',
  'cyrus',
  'SPC',
  '7x48',
  'Multi',
  '12mil',
  '5mm',
  23.4,
  1.99,
  46.57,
  'https://cdn.prod.website-files.com/6456ce4476abb2d4f9fbad10/6456ce4576abb28974fbcae5_msi-surfaces-surprise-granite-walnut-waves-luxury-vinyl-planks-close-up.jpeg',
  '/flooring/cyrus-walnut-waves-luxury-vinyl-planks',
  true,
  true,
  'Click Lock',
  'Lifetime',
  '10 Years',
  NOW()
) ON CONFLICT (sku) DO UPDATE SET
  wholesale_cost_sf = EXCLUDED.wholesale_cost_sf,
  wholesale_cost_box = EXCLUDED.wholesale_cost_box,
  last_price_update = NOW();

INSERT INTO flooring_products (
  sku, name, slug, vendor_id, brand, collection,
  type, dimensions, primary_color, wear_layer, thickness,
  sf_per_box, wholesale_cost_sf, wholesale_cost_box,
  primary_image, url, is_active, is_waterproof,
  installation_method, residential_warranty, commercial_warranty,
  last_price_update
) VALUES (
  'CYRUS_WEATHERED_BRINA_LUXURY_VINYL_PLANKS',
  'Cyrus Weathered Brina',
  'cyrus-weathered-brina-luxury-vinyl-planks',
  'msi',
  'MSI',
  'cyrus',
  'SPC',
  '7x48',
  'Multi',
  '12mil',
  '5mm',
  23.4,
  1.99,
  46.57,
  'https://cdn.prod.website-files.com/6456ce4476abb2d4f9fbad10/6456ce4576abb2292cfbcaf0_msi-surfaces-surprise-granite-weathered-brina-luxury-vinyl-planks-close-up.jpeg',
  '/flooring/cyrus-weathered-brina-luxury-vinyl-planks',
  true,
  true,
  'Click Lock',
  'Lifetime',
  '10 Years',
  NOW()
) ON CONFLICT (sku) DO UPDATE SET
  wholesale_cost_sf = EXCLUDED.wholesale_cost_sf,
  wholesale_cost_box = EXCLUDED.wholesale_cost_box,
  last_price_update = NOW();

INSERT INTO flooring_products (
  sku, name, slug, vendor_id, brand, collection,
  type, dimensions, primary_color, wear_layer, thickness,
  sf_per_box, wholesale_cost_sf, wholesale_cost_box,
  primary_image, url, is_active, is_waterproof,
  installation_method, residential_warranty, commercial_warranty,
  last_price_update
) VALUES (
  'CYRUS_WHITFIELD_GRAY_LUXURY_VINYL_PLANKS',
  'Cyrus Whitfield Gray',
  'cyrus-whitfield-gray-luxury-vinyl-planks',
  'msi',
  'MSI',
  'wilmont',
  'SPC',
  '7x48',
  'Gray',
  '20mil',
  '6.5mm',
  22,
  2.49,
  54.78,
  'https://cdn.prod.website-files.com/6456ce4476abb2d4f9fbad10/6456ce4576abb280d7fbcafc_msi-surfaces-surprise-granite-whitfield-gray-luxury-vinyl-planks-close-up.jpeg',
  '/flooring/cyrus-whitfield-gray-luxury-vinyl-planks',
  true,
  true,
  'Click Lock',
  'Lifetime',
  '10 Years',
  NOW()
) ON CONFLICT (sku) DO UPDATE SET
  wholesale_cost_sf = EXCLUDED.wholesale_cost_sf,
  wholesale_cost_box = EXCLUDED.wholesale_cost_box,
  last_price_update = NOW();

INSERT INTO flooring_products (
  sku, name, slug, vendor_id, brand, collection,
  type, dimensions, primary_color, wear_layer, thickness,
  sf_per_box, wholesale_cost_sf, wholesale_cost_box,
  primary_image, url, is_active, is_waterproof,
  installation_method, residential_warranty, commercial_warranty,
  last_price_update
) VALUES (
  'CYRUS_WOBURN_ABBEY_LUXURY_VINYL_PLANKS',
  'Cyrus Woburn Abbey',
  'cyrus-woburn-abbey-luxury-vinyl-planks',
  'msi',
  'MSI',
  'cyrus',
  'SPC',
  '7x48',
  'Multi',
  '12mil',
  '5mm',
  23.4,
  1.99,
  46.57,
  'https://cdn.prod.website-files.com/6456ce4476abb2d4f9fbad10/6456ce4576abb27d2afbcb07_msi-surfaces-surprise-granite-woburn-abbey-luxury-vinyl-planks-close-up.jpeg',
  '/flooring/cyrus-woburn-abbey-luxury-vinyl-planks',
  true,
  true,
  'Click Lock',
  'Lifetime',
  '10 Years',
  NOW()
) ON CONFLICT (sku) DO UPDATE SET
  wholesale_cost_sf = EXCLUDED.wholesale_cost_sf,
  wholesale_cost_box = EXCLUDED.wholesale_cost_box,
  last_price_update = NOW();

INSERT INTO flooring_products (
  sku, name, slug, vendor_id, brand, collection,
  type, dimensions, primary_color, wear_layer, thickness,
  sf_per_box, wholesale_cost_sf, wholesale_cost_box,
  primary_image, url, is_active, is_waterproof,
  installation_method, residential_warranty, commercial_warranty,
  last_price_update
) VALUES (
  'CYRUS_WOLFEBORO_LUXURY_VINYL_PLANKS',
  'Cyrus Wolfeboro',
  'cyrus-wolfeboro-luxury-vinyl-planks',
  'msi',
  'MSI',
  'cyrus',
  'SPC',
  '7x48',
  'Multi',
  '12mil',
  '5mm',
  23.4,
  1.99,
  46.57,
  'https://cdn.prod.website-files.com/6456ce4476abb2d4f9fbad10/6456ce4576abb21d5efbcb13_msi-surfaces-surprise-granite-wolfeboro-luxury-vinyl-planks-close-up.jpeg',
  '/flooring/cyrus-wolfeboro-luxury-vinyl-planks',
  true,
  true,
  'Click Lock',
  'Lifetime',
  '10 Years',
  NOW()
) ON CONFLICT (sku) DO UPDATE SET
  wholesale_cost_sf = EXCLUDED.wholesale_cost_sf,
  wholesale_cost_box = EXCLUDED.wholesale_cost_box,
  last_price_update = NOW();

INSERT INTO flooring_products (
  sku, name, slug, vendor_id, brand, collection,
  type, dimensions, primary_color, wear_layer, thickness,
  sf_per_box, wholesale_cost_sf, wholesale_cost_box,
  primary_image, url, is_active, is_waterproof,
  installation_method, residential_warranty, commercial_warranty,
  last_price_update
) VALUES (
  'GLENRIDGE_AGED_HICKORY_LUXURY_VINYL_PLANKS',
  'Glenridge Aged Hickory',
  'glenridge-aged-hickory-luxury-vinyl-planks',
  'msi',
  'MSI',
  'unknown',
  'Luxury Vinyl',
  '7x48',
  'Multi',
  '20mil',
  '5.5mm',
  22,
  2.29,
  50.38,
  'https://cdn.prod.website-files.com/6456ce4476abb2d4f9fbad10/6456ce4576abb26159fbcb1b_msi-surfaces-surprise-granite-aged-hickory-luxury-vinyl-planks-close-up.jpeg',
  '/flooring/glenridge-aged-hickory-luxury-vinyl-planks',
  true,
  true,
  'Click Lock',
  'Lifetime',
  '10 Years',
  NOW()
) ON CONFLICT (sku) DO UPDATE SET
  wholesale_cost_sf = EXCLUDED.wholesale_cost_sf,
  wholesale_cost_box = EXCLUDED.wholesale_cost_box,
  last_price_update = NOW();

INSERT INTO flooring_products (
  sku, name, slug, vendor_id, brand, collection,
  type, dimensions, primary_color, wear_layer, thickness,
  sf_per_box, wholesale_cost_sf, wholesale_cost_box,
  primary_image, url, is_active, is_waterproof,
  installation_method, residential_warranty, commercial_warranty,
  last_price_update
) VALUES (
  'GLENRIDGE_BLEACHED_ELM_LUXURY_VINYL_PLANKS',
  'Glenridge Bleached Elm',
  'glenridge-bleached-elm-luxury-vinyl-planks',
  'msi',
  'MSI',
  'katavia',
  'Luxury Vinyl',
  '6x48',
  'Multi',
  '6mil',
  '2mm',
  22,
  1.69,
  37.18,
  'https://cdn.prod.website-files.com/6456ce4476abb2d4f9fbad10/6456ce4576abb27145fbcb22_msi-surfaces-surprise-granite-bleached-elm-luxury-vinyl-planks-close-up.jpeg',
  '/flooring/glenridge-bleached-elm-luxury-vinyl-planks',
  true,
  true,
  'Click Lock',
  'Lifetime',
  '10 Years',
  NOW()
) ON CONFLICT (sku) DO UPDATE SET
  wholesale_cost_sf = EXCLUDED.wholesale_cost_sf,
  wholesale_cost_box = EXCLUDED.wholesale_cost_box,
  last_price_update = NOW();

INSERT INTO flooring_products (
  sku, name, slug, vendor_id, brand, collection,
  type, dimensions, primary_color, wear_layer, thickness,
  sf_per_box, wholesale_cost_sf, wholesale_cost_box,
  primary_image, url, is_active, is_waterproof,
  installation_method, residential_warranty, commercial_warranty,
  last_price_update
) VALUES (
  'GLENRIDGE_BURNISHED_ACACIA_LUXURY_VINYL_PLANKS',
  'Glenridge Burnished Acacia',
  'glenridge-burnished-acacia-luxury-vinyl-planks',
  'msi',
  'MSI',
  'katavia',
  'Luxury Vinyl',
  '6x48',
  'Multi',
  '6mil',
  '2mm',
  22,
  1.69,
  37.18,
  'https://cdn.prod.website-files.com/6456ce4476abb2d4f9fbad10/6456ce4576abb27f1cfbcb23_msi-surfaces-surprise-granite-burnished-acacia-luxury-vinyl-planks-close-up.jpeg',
  '/flooring/glenridge-burnished-acacia-luxury-vinyl-planks',
  true,
  true,
  'Click Lock',
  'Lifetime',
  '10 Years',
  NOW()
) ON CONFLICT (sku) DO UPDATE SET
  wholesale_cost_sf = EXCLUDED.wholesale_cost_sf,
  wholesale_cost_box = EXCLUDED.wholesale_cost_box,
  last_price_update = NOW();

INSERT INTO flooring_products (
  sku, name, slug, vendor_id, brand, collection,
  type, dimensions, primary_color, wear_layer, thickness,
  sf_per_box, wholesale_cost_sf, wholesale_cost_box,
  primary_image, url, is_active, is_waterproof,
  installation_method, residential_warranty, commercial_warranty,
  last_price_update
) VALUES (
  'GLENRIDGE_CHARCOAL_OAK_LUXURY_VINYL_PLANKS',
  'Glenridge Charcoal Oak',
  'glenridge-charcoal-oak-luxury-vinyl-planks',
  'msi',
  'MSI',
  'wilmont',
  'SPC',
  '7x48',
  'Multi',
  '20mil',
  '6.5mm',
  22,
  2.49,
  54.78,
  'https://cdn.prod.website-files.com/6456ce4476abb2d4f9fbad10/6456ce4576abb20281fbcb2b_msi-surfaces-surprise-granite-charcoal-oak-luxury-vinyl-planks-close-up.jpeg',
  '/flooring/glenridge-charcoal-oak-luxury-vinyl-planks',
  true,
  true,
  'Click Lock',
  'Lifetime',
  '10 Years',
  NOW()
) ON CONFLICT (sku) DO UPDATE SET
  wholesale_cost_sf = EXCLUDED.wholesale_cost_sf,
  wholesale_cost_box = EXCLUDED.wholesale_cost_box,
  last_price_update = NOW();

INSERT INTO flooring_products (
  sku, name, slug, vendor_id, brand, collection,
  type, dimensions, primary_color, wear_layer, thickness,
  sf_per_box, wholesale_cost_sf, wholesale_cost_box,
  primary_image, url, is_active, is_waterproof,
  installation_method, residential_warranty, commercial_warranty,
  last_price_update
) VALUES (
  'GLENRIDGE_COASTAL_MIX_LUXURY_VINYL_PLANKS',
  'Glenridge Coastal Mix',
  'glenridge-coastal-mix-luxury-vinyl-planks',
  'msi',
  'MSI',
  'katavia',
  'Luxury Vinyl',
  '6x48',
  'Multi',
  '6mil',
  '2mm',
  22,
  1.69,
  37.18,
  'https://cdn.prod.website-files.com/6456ce4476abb2d4f9fbad10/6456ce4576abb24870fbcb2d_msi-surfaces-surprise-granite-coastal-mix-luxury-vinyl-planks-close-up.jpeg',
  '/flooring/glenridge-coastal-mix-luxury-vinyl-planks',
  true,
  true,
  'Click Lock',
  'Lifetime',
  '10 Years',
  NOW()
) ON CONFLICT (sku) DO UPDATE SET
  wholesale_cost_sf = EXCLUDED.wholesale_cost_sf,
  wholesale_cost_box = EXCLUDED.wholesale_cost_box,
  last_price_update = NOW();

INSERT INTO flooring_products (
  sku, name, slug, vendor_id, brand, collection,
  type, dimensions, primary_color, wear_layer, thickness,
  sf_per_box, wholesale_cost_sf, wholesale_cost_box,
  primary_image, url, is_active, is_waterproof,
  installation_method, residential_warranty, commercial_warranty,
  last_price_update
) VALUES (
  'GLENRIDGE_ELMWOOD_ASH_LUXURY_VINYL_PLANKS',
  'Glenridge Elmwood Ash',
  'glenridge-elmwood-ash-luxury-vinyl-planks',
  'msi',
  'MSI',
  'unknown',
  'Luxury Vinyl',
  '7x48',
  'Multi',
  '20mil',
  '5.5mm',
  22,
  2.29,
  50.38,
  'https://cdn.prod.website-files.com/6456ce4476abb2d4f9fbad10/6456ce4576abb2a733fbcb2f_msi-surfaces-surprise-granite-elmwood-ash-luxury-vinyl-planks-close-up.jpeg',
  '/flooring/glenridge-elmwood-ash-luxury-vinyl-planks',
  true,
  true,
  'Click Lock',
  'Lifetime',
  '10 Years',
  NOW()
) ON CONFLICT (sku) DO UPDATE SET
  wholesale_cost_sf = EXCLUDED.wholesale_cost_sf,
  wholesale_cost_box = EXCLUDED.wholesale_cost_box,
  last_price_update = NOW();

INSERT INTO flooring_products (
  sku, name, slug, vendor_id, brand, collection,
  type, dimensions, primary_color, wear_layer, thickness,
  sf_per_box, wholesale_cost_sf, wholesale_cost_box,
  primary_image, url, is_active, is_waterproof,
  installation_method, residential_warranty, commercial_warranty,
  last_price_update
) VALUES (
  'GLENRIDGE_JATOBA_LUXURY_VINYL_PLANKS',
  'Glenridge Jatoba',
  'glenridge-jatoba-luxury-vinyl-planks',
  'msi',
  'MSI',
  'unknown',
  'Luxury Vinyl',
  '7x48',
  'Multi',
  '20mil',
  '5.5mm',
  22,
  2.29,
  50.38,
  'https://cdn.prod.website-files.com/6456ce4476abb2d4f9fbad10/6456ce4576abb277d1fbcb35_msi-surfaces-surprise-granite-jatoba-luxury-vinyl-planks-close-up.jpeg',
  '/flooring/glenridge-jatoba-luxury-vinyl-planks',
  true,
  true,
  'Click Lock',
  'Lifetime',
  '10 Years',
  NOW()
) ON CONFLICT (sku) DO UPDATE SET
  wholesale_cost_sf = EXCLUDED.wholesale_cost_sf,
  wholesale_cost_box = EXCLUDED.wholesale_cost_box,
  last_price_update = NOW();

INSERT INTO flooring_products (
  sku, name, slug, vendor_id, brand, collection,
  type, dimensions, primary_color, wear_layer, thickness,
  sf_per_box, wholesale_cost_sf, wholesale_cost_box,
  primary_image, url, is_active, is_waterproof,
  installation_method, residential_warranty, commercial_warranty,
  last_price_update
) VALUES (
  'GLENRIDGE_LIME_WASHED_OAK_LUXURY_VINYL_PLANKS',
  'Glenridge Lime Washed Oak',
  'glenridge-lime-washed-oak-luxury-vinyl-planks',
  'msi',
  'MSI',
  'unknown',
  'Luxury Vinyl',
  '7x48',
  'Multi',
  '20mil',
  '5.5mm',
  22,
  2.29,
  50.38,
  'https://cdn.prod.website-files.com/6456ce4476abb2d4f9fbad10/6456ce4576abb2dc33fbcb37_msi-surfaces-surprise-granite-lime-washed-oak-luxury-vinyl-planks-close-up.jpeg',
  '/flooring/glenridge-lime-washed-oak-luxury-vinyl-planks',
  true,
  true,
  'Click Lock',
  'Lifetime',
  '10 Years',
  NOW()
) ON CONFLICT (sku) DO UPDATE SET
  wholesale_cost_sf = EXCLUDED.wholesale_cost_sf,
  wholesale_cost_box = EXCLUDED.wholesale_cost_box,
  last_price_update = NOW();

INSERT INTO flooring_products (
  sku, name, slug, vendor_id, brand, collection,
  type, dimensions, primary_color, wear_layer, thickness,
  sf_per_box, wholesale_cost_sf, wholesale_cost_box,
  primary_image, url, is_active, is_waterproof,
  installation_method, residential_warranty, commercial_warranty,
  last_price_update
) VALUES (
  'GLENRIDGE_MIDNIGHT_MAPLE_LUXURY_VINYL_PLANKS',
  'Glenridge Midnight Maple',
  'glenridge-midnight-maple-luxury-vinyl-planks',
  'msi',
  'MSI',
  'unknown',
  'Luxury Vinyl',
  '7x48',
  'Multi',
  '20mil',
  '5.5mm',
  22,
  2.29,
  50.38,
  'https://cdn.prod.website-files.com/6456ce4476abb2d4f9fbad10/6456ce4576abb23409fbcb3d_msi-surfaces-surprise-granite-midnight-maple-luxury-vinyl-planks-close-up.jpeg',
  '/flooring/glenridge-midnight-maple-luxury-vinyl-planks',
  true,
  true,
  'Click Lock',
  'Lifetime',
  '10 Years',
  NOW()
) ON CONFLICT (sku) DO UPDATE SET
  wholesale_cost_sf = EXCLUDED.wholesale_cost_sf,
  wholesale_cost_box = EXCLUDED.wholesale_cost_box,
  last_price_update = NOW();

INSERT INTO flooring_products (
  sku, name, slug, vendor_id, brand, collection,
  type, dimensions, primary_color, wear_layer, thickness,
  sf_per_box, wholesale_cost_sf, wholesale_cost_box,
  primary_image, url, is_active, is_waterproof,
  installation_method, residential_warranty, commercial_warranty,
  last_price_update
) VALUES (
  'GLENRIDGE_RECLAIMED_OAK_LUXURY_VINYL_PLANKS',
  'Glenridge Reclaimed Oak',
  'glenridge-reclaimed-oak-luxury-vinyl-planks',
  'msi',
  'MSI',
  'wilmont',
  'SPC',
  '7x48',
  'Multi',
  '20mil',
  '6.5mm',
  22,
  2.49,
  54.78,
  'https://cdn.prod.website-files.com/6456ce4476abb2d4f9fbad10/6456ce4576abb2052cfbcb45_msi-surfaces-surprise-granite-reclaimed-oak-luxury-vinyl-planks-close-up.jpeg',
  '/flooring/glenridge-reclaimed-oak-luxury-vinyl-planks',
  true,
  true,
  'Click Lock',
  'Lifetime',
  '10 Years',
  NOW()
) ON CONFLICT (sku) DO UPDATE SET
  wholesale_cost_sf = EXCLUDED.wholesale_cost_sf,
  wholesale_cost_box = EXCLUDED.wholesale_cost_box,
  last_price_update = NOW();

INSERT INTO flooring_products (
  sku, name, slug, vendor_id, brand, collection,
  type, dimensions, primary_color, wear_layer, thickness,
  sf_per_box, wholesale_cost_sf, wholesale_cost_box,
  primary_image, url, is_active, is_waterproof,
  installation_method, residential_warranty, commercial_warranty,
  last_price_update
) VALUES (
  'GLENRIDGE_SADDLE_OAK_LUXURY_VINYL_PLANKS',
  'Glenridge Saddle Oak',
  'glenridge-saddle-oak-luxury-vinyl-planks',
  'msi',
  'MSI',
  'katavia',
  'Luxury Vinyl',
  '6x48',
  'Multi',
  '6mil',
  '2mm',
  22,
  1.69,
  37.18,
  'https://cdn.prod.website-files.com/6456ce4476abb2d4f9fbad10/6456ce4576abb2402efbcb4d_msi-surfaces-surprise-granite-saddle-oak-luxury-vinyl-planks-close-up.jpeg',
  '/flooring/glenridge-saddle-oak-luxury-vinyl-planks',
  true,
  true,
  'Click Lock',
  'Lifetime',
  '10 Years',
  NOW()
) ON CONFLICT (sku) DO UPDATE SET
  wholesale_cost_sf = EXCLUDED.wholesale_cost_sf,
  wholesale_cost_box = EXCLUDED.wholesale_cost_box,
  last_price_update = NOW();

INSERT INTO flooring_products (
  sku, name, slug, vendor_id, brand, collection,
  type, dimensions, primary_color, wear_layer, thickness,
  sf_per_box, wholesale_cost_sf, wholesale_cost_box,
  primary_image, url, is_active, is_waterproof,
  installation_method, residential_warranty, commercial_warranty,
  last_price_update
) VALUES (
  'GLENRIDGE_TAWNY_BIRCH_LUXURY_VINYL_PLANKS',
  'Glenridge Tawny Birch',
  'glenridge-tawny-birch-luxury-vinyl-planks',
  'msi',
  'MSI',
  'unknown',
  'Luxury Vinyl',
  '7x48',
  'Multi',
  '20mil',
  '5.5mm',
  22,
  2.29,
  50.38,
  'https://cdn.prod.website-files.com/6456ce4476abb2d4f9fbad10/6456ce4576abb27ee6fbcb55_msi-surfaces-surprise-granite-tawny-birch-luxury-vinyl-planks-close-up.jpeg',
  '/flooring/glenridge-tawny-birch-luxury-vinyl-planks',
  true,
  true,
  'Click Lock',
  'Lifetime',
  '10 Years',
  NOW()
) ON CONFLICT (sku) DO UPDATE SET
  wholesale_cost_sf = EXCLUDED.wholesale_cost_sf,
  wholesale_cost_box = EXCLUDED.wholesale_cost_box,
  last_price_update = NOW();

INSERT INTO flooring_products (
  sku, name, slug, vendor_id, brand, collection,
  type, dimensions, primary_color, wear_layer, thickness,
  sf_per_box, wholesale_cost_sf, wholesale_cost_box,
  primary_image, url, is_active, is_waterproof,
  installation_method, residential_warranty, commercial_warranty,
  last_price_update
) VALUES (
  'GLENRIDGE_TWILIGHT_OAK_LUXURY_VINYL_PLANKS',
  'Glenridge Twilight Oak',
  'glenridge-twilight-oak-luxury-vinyl-planks',
  'msi',
  'MSI',
  'cyrus',
  'SPC',
  '7x48',
  'Multi',
  '12mil',
  '5mm',
  23.4,
  1.99,
  46.57,
  'https://cdn.prod.website-files.com/6456ce4476abb2d4f9fbad10/6456ce4576abb26773fbcb58_msi-surfaces-surprise-granite-twilight-oak-luxury-vinyl-planks-close-up.jpeg',
  '/flooring/glenridge-twilight-oak-luxury-vinyl-planks',
  true,
  true,
  'Click Lock',
  'Lifetime',
  '10 Years',
  NOW()
) ON CONFLICT (sku) DO UPDATE SET
  wholesale_cost_sf = EXCLUDED.wholesale_cost_sf,
  wholesale_cost_box = EXCLUDED.wholesale_cost_box,
  last_price_update = NOW();

INSERT INTO flooring_products (
  sku, name, slug, vendor_id, brand, collection,
  type, dimensions, primary_color, wear_layer, thickness,
  sf_per_box, wholesale_cost_sf, wholesale_cost_box,
  primary_image, url, is_active, is_waterproof,
  installation_method, residential_warranty, commercial_warranty,
  last_price_update
) VALUES (
  'GLENRIDGE_WOODRIFT_GRAY_LUXURY_VINYL_PLANKS',
  'Glenridge Woodrift Gray',
  'glenridge-woodrift-gray-luxury-vinyl-planks',
  'msi',
  'MSI',
  'unknown',
  'Luxury Vinyl',
  '7x48',
  'Gray',
  '20mil',
  '5.5mm',
  22,
  2.29,
  50.38,
  'https://cdn.prod.website-files.com/6456ce4476abb2d4f9fbad10/6456ce4576abb27f74fbcb5b_msi-surfaces-surprise-granite-woodrift-gray-luxury-vinyl-planks-close-up.jpeg',
  '/flooring/glenridge-woodrift-gray-luxury-vinyl-planks',
  true,
  true,
  'Click Lock',
  'Lifetime',
  '10 Years',
  NOW()
) ON CONFLICT (sku) DO UPDATE SET
  wholesale_cost_sf = EXCLUDED.wholesale_cost_sf,
  wholesale_cost_box = EXCLUDED.wholesale_cost_box,
  last_price_update = NOW();

INSERT INTO flooring_products (
  sku, name, slug, vendor_id, brand, collection,
  type, dimensions, primary_color, wear_layer, thickness,
  sf_per_box, wholesale_cost_sf, wholesale_cost_box,
  primary_image, url, is_active, is_waterproof,
  installation_method, residential_warranty, commercial_warranty,
  last_price_update
) VALUES (
  'KATAVIA_BLEACHED_ELM_LUXURY_VINYL_PLANKS',
  'Katavia Bleached Elm',
  'katavia-bleached-elm-luxury-vinyl-planks',
  'msi',
  'MSI',
  'katavia',
  'Luxury Vinyl',
  '6x48',
  'Multi',
  '6mil',
  '2mm',
  22,
  1.69,
  37.18,
  'https://cdn.prod.website-files.com/6456ce4476abb2d4f9fbad10/6456ce4576abb27145fbcb22_msi-surfaces-surprise-granite-bleached-elm-luxury-vinyl-planks-close-up.jpeg',
  '/flooring/katavia-bleached-elm-luxury-vinyl-planks',
  true,
  true,
  'Click Lock',
  'Lifetime',
  '10 Years',
  NOW()
) ON CONFLICT (sku) DO UPDATE SET
  wholesale_cost_sf = EXCLUDED.wholesale_cost_sf,
  wholesale_cost_box = EXCLUDED.wholesale_cost_box,
  last_price_update = NOW();

INSERT INTO flooring_products (
  sku, name, slug, vendor_id, brand, collection,
  type, dimensions, primary_color, wear_layer, thickness,
  sf_per_box, wholesale_cost_sf, wholesale_cost_box,
  primary_image, url, is_active, is_waterproof,
  installation_method, residential_warranty, commercial_warranty,
  last_price_update
) VALUES (
  'KATAVIA_BURNISHED_ACACIA_LUXURY_VINYL_PLANKS',
  'Katavia Burnished Acacia',
  'katavia-burnished-acacia-luxury-vinyl-planks',
  'msi',
  'MSI',
  'katavia',
  'Luxury Vinyl',
  '6x48',
  'Multi',
  '6mil',
  '2mm',
  22,
  1.69,
  37.18,
  'https://cdn.prod.website-files.com/6456ce4476abb2d4f9fbad10/6456ce4576abb27f1cfbcb23_msi-surfaces-surprise-granite-burnished-acacia-luxury-vinyl-planks-close-up.jpeg',
  '/flooring/katavia-burnished-acacia-luxury-vinyl-planks',
  true,
  true,
  'Click Lock',
  'Lifetime',
  '10 Years',
  NOW()
) ON CONFLICT (sku) DO UPDATE SET
  wholesale_cost_sf = EXCLUDED.wholesale_cost_sf,
  wholesale_cost_box = EXCLUDED.wholesale_cost_box,
  last_price_update = NOW();

INSERT INTO flooring_products (
  sku, name, slug, vendor_id, brand, collection,
  type, dimensions, primary_color, wear_layer, thickness,
  sf_per_box, wholesale_cost_sf, wholesale_cost_box,
  primary_image, url, is_active, is_waterproof,
  installation_method, residential_warranty, commercial_warranty,
  last_price_update
) VALUES (
  'KATAVIA_CHARCOAL_OAK_LUXURY_VINYL_PLANKS',
  'Katavia Charcoal Oak',
  'katavia-charcoal-oak-luxury-vinyl-planks',
  'msi',
  'MSI',
  'wilmont',
  'SPC',
  '7x48',
  'Multi',
  '20mil',
  '6.5mm',
  22,
  2.49,
  54.78,
  'https://cdn.prod.website-files.com/6456ce4476abb2d4f9fbad10/6456ce4576abb20281fbcb2b_msi-surfaces-surprise-granite-charcoal-oak-luxury-vinyl-planks-close-up.jpeg',
  '/flooring/katavia-charcoal-oak-luxury-vinyl-planks',
  true,
  true,
  'Click Lock',
  'Lifetime',
  '10 Years',
  NOW()
) ON CONFLICT (sku) DO UPDATE SET
  wholesale_cost_sf = EXCLUDED.wholesale_cost_sf,
  wholesale_cost_box = EXCLUDED.wholesale_cost_box,
  last_price_update = NOW();

INSERT INTO flooring_products (
  sku, name, slug, vendor_id, brand, collection,
  type, dimensions, primary_color, wear_layer, thickness,
  sf_per_box, wholesale_cost_sf, wholesale_cost_box,
  primary_image, url, is_active, is_waterproof,
  installation_method, residential_warranty, commercial_warranty,
  last_price_update
) VALUES (
  'KATAVIA_ELMWOOD_ASH_LUXURY_VINYL_PLANKS',
  'Katavia Elmwood Ash',
  'katavia-elmwood-ash-luxury-vinyl-planks',
  'msi',
  'MSI',
  'katavia',
  'Luxury Vinyl',
  '6x48',
  'Multi',
  '6mil',
  '2mm',
  22,
  1.69,
  37.18,
  'https://cdn.prod.website-files.com/6456ce4476abb2d4f9fbad10/6456ce4576abb2a733fbcb2f_msi-surfaces-surprise-granite-elmwood-ash-luxury-vinyl-planks-close-up.jpeg',
  '/flooring/katavia-elmwood-ash-luxury-vinyl-planks',
  true,
  true,
  'Click Lock',
  'Lifetime',
  '10 Years',
  NOW()
) ON CONFLICT (sku) DO UPDATE SET
  wholesale_cost_sf = EXCLUDED.wholesale_cost_sf,
  wholesale_cost_box = EXCLUDED.wholesale_cost_box,
  last_price_update = NOW();

INSERT INTO flooring_products (
  sku, name, slug, vendor_id, brand, collection,
  type, dimensions, primary_color, wear_layer, thickness,
  sf_per_box, wholesale_cost_sf, wholesale_cost_box,
  primary_image, url, is_active, is_waterproof,
  installation_method, residential_warranty, commercial_warranty,
  last_price_update
) VALUES (
  'KATAVIA_RECLAIMED_OAK_LUXURY_VINYL_PLANKS',
  'Katavia Reclaimed Oak',
  'katavia-reclaimed-oak-luxury-vinyl-planks',
  'msi',
  'MSI',
  'wilmont',
  'SPC',
  '7x48',
  'Multi',
  '20mil',
  '6.5mm',
  22,
  2.49,
  54.78,
  'https://cdn.prod.website-files.com/6456ce4476abb2d4f9fbad10/6456ce4576abb2052cfbcb45_msi-surfaces-surprise-granite-reclaimed-oak-luxury-vinyl-planks-close-up.jpeg',
  '/flooring/katavia-reclaimed-oak-luxury-vinyl-planks',
  true,
  true,
  'Click Lock',
  'Lifetime',
  '10 Years',
  NOW()
) ON CONFLICT (sku) DO UPDATE SET
  wholesale_cost_sf = EXCLUDED.wholesale_cost_sf,
  wholesale_cost_box = EXCLUDED.wholesale_cost_box,
  last_price_update = NOW();

INSERT INTO flooring_products (
  sku, name, slug, vendor_id, brand, collection,
  type, dimensions, primary_color, wear_layer, thickness,
  sf_per_box, wholesale_cost_sf, wholesale_cost_box,
  primary_image, url, is_active, is_waterproof,
  installation_method, residential_warranty, commercial_warranty,
  last_price_update
) VALUES (
  'KATAVIA_TWILIGHT_OAK_LUXURY_VINYL_PLANKS',
  'Katavia Twilight Oak',
  'katavia-twilight-oak-luxury-vinyl-planks',
  'msi',
  'MSI',
  'cyrus',
  'SPC',
  '7x48',
  'Multi',
  '12mil',
  '5mm',
  23.4,
  1.99,
  46.57,
  'https://cdn.prod.website-files.com/6456ce4476abb2d4f9fbad10/6456ce4576abb26773fbcb58_msi-surfaces-surprise-granite-twilight-oak-luxury-vinyl-planks-close-up.jpeg',
  '/flooring/katavia-twilight-oak-luxury-vinyl-planks',
  true,
  true,
  'Click Lock',
  'Lifetime',
  '10 Years',
  NOW()
) ON CONFLICT (sku) DO UPDATE SET
  wholesale_cost_sf = EXCLUDED.wholesale_cost_sf,
  wholesale_cost_box = EXCLUDED.wholesale_cost_box,
  last_price_update = NOW();

INSERT INTO flooring_products (
  sku, name, slug, vendor_id, brand, collection,
  type, dimensions, primary_color, wear_layer, thickness,
  sf_per_box, wholesale_cost_sf, wholesale_cost_box,
  primary_image, url, is_active, is_waterproof,
  installation_method, residential_warranty, commercial_warranty,
  last_price_update
) VALUES (
  'KATAVIA_WOODRIFT_GRAY_LUXURY_VINYL_PLANKS',
  'Katavia Woodrift Gray',
  'katavia-woodrift-gray-luxury-vinyl-planks',
  'msi',
  'MSI',
  'katavia',
  'Luxury Vinyl',
  '6x48',
  'Gray',
  '6mil',
  '2mm',
  22,
  1.69,
  37.18,
  'https://cdn.prod.website-files.com/6456ce4476abb2d4f9fbad10/6456ce4576abb27f74fbcb5b_msi-surfaces-surprise-granite-woodrift-gray-luxury-vinyl-planks-close-up.jpeg',
  '/flooring/katavia-woodrift-gray-luxury-vinyl-planks',
  true,
  true,
  'Click Lock',
  'Lifetime',
  '10 Years',
  NOW()
) ON CONFLICT (sku) DO UPDATE SET
  wholesale_cost_sf = EXCLUDED.wholesale_cost_sf,
  wholesale_cost_box = EXCLUDED.wholesale_cost_box,
  last_price_update = NOW();

INSERT INTO flooring_products (
  sku, name, slug, vendor_id, brand, collection,
  type, dimensions, primary_color, wear_layer, thickness,
  sf_per_box, wholesale_cost_sf, wholesale_cost_box,
  primary_image, url, is_active, is_waterproof,
  installation_method, residential_warranty, commercial_warranty,
  last_price_update
) VALUES (
  'LIVINGSTYLE_PEARL_ARTERRA',
  'Livingstyle Pearl Arterra',
  'livingstyle-pearl-arterra',
  'msi',
  'MSI',
  'unknown',
  'Luxury Vinyl',
  '7x48',
  'Multi',
  '20mil',
  '5.5mm',
  22,
  2.29,
  50.38,
  'https://cdn.prod.website-files.com/6456ce4476abb25581fbad0c/6456ce4476abb27beffbb16a_Surprise%20Granite%20Transparent%20Dark%20Wide.svg',
  '/flooring/livingstyle-pearl-arterra',
  true,
  true,
  'Click Lock',
  'Lifetime',
  '10 Years',
  NOW()
) ON CONFLICT (sku) DO UPDATE SET
  wholesale_cost_sf = EXCLUDED.wholesale_cost_sf,
  wholesale_cost_box = EXCLUDED.wholesale_cost_box,
  last_price_update = NOW();

INSERT INTO flooring_products (
  sku, name, slug, vendor_id, brand, collection,
  type, dimensions, primary_color, wear_layer, thickness,
  sf_per_box, wholesale_cost_sf, wholesale_cost_box,
  primary_image, url, is_active, is_waterproof,
  installation_method, residential_warranty, commercial_warranty,
  last_price_update
) VALUES (
  'PRESCOTT_AKADIA_LUXURY_VINYL_PLANKS',
  'Prescott Akadia',
  'prescott-akadia-luxury-vinyl-planks',
  'msi',
  'MSI',
  'cyrus',
  'SPC',
  '7x48',
  'Multi',
  '12mil',
  '5mm',
  23.4,
  1.99,
  46.57,
  'https://cdn.prod.website-files.com/6456ce4476abb2d4f9fbad10/6456ce4576abb2754dfbc9de_msi-surfaces-surprise-granite-akadia-luxury-vinyl-planks-close-up.jpeg',
  '/flooring/prescott-akadia-luxury-vinyl-planks',
  true,
  true,
  'Click Lock',
  'Lifetime',
  '10 Years',
  NOW()
) ON CONFLICT (sku) DO UPDATE SET
  wholesale_cost_sf = EXCLUDED.wholesale_cost_sf,
  wholesale_cost_box = EXCLUDED.wholesale_cost_box,
  last_price_update = NOW();

INSERT INTO flooring_products (
  sku, name, slug, vendor_id, brand, collection,
  type, dimensions, primary_color, wear_layer, thickness,
  sf_per_box, wholesale_cost_sf, wholesale_cost_box,
  primary_image, url, is_active, is_waterproof,
  installation_method, residential_warranty, commercial_warranty,
  last_price_update
) VALUES (
  'PRESCOTT_BARRELL_LUXURY_VINYL_PLANKS',
  'Prescott Barrell',
  'prescott-barrell-luxury-vinyl-planks',
  'msi',
  'MSI',
  'prescott',
  'SPC',
  '7x48',
  'Multi',
  '20mil',
  '6mm',
  23.4,
  2.69,
  62.95,
  'https://cdn.prod.website-files.com/6456ce4476abb2d4f9fbad10/6456ce4576abb24c12fbc9e8_msi-surfaces-surprise-granite-barrell-luxury-vinyl-planks-close-up.jpeg',
  '/flooring/prescott-barrell-luxury-vinyl-planks',
  true,
  true,
  'Click Lock',
  'Lifetime',
  '10 Years',
  NOW()
) ON CONFLICT (sku) DO UPDATE SET
  wholesale_cost_sf = EXCLUDED.wholesale_cost_sf,
  wholesale_cost_box = EXCLUDED.wholesale_cost_box,
  last_price_update = NOW();

INSERT INTO flooring_products (
  sku, name, slug, vendor_id, brand, collection,
  type, dimensions, primary_color, wear_layer, thickness,
  sf_per_box, wholesale_cost_sf, wholesale_cost_box,
  primary_image, url, is_active, is_waterproof,
  installation_method, residential_warranty, commercial_warranty,
  last_price_update
) VALUES (
  'PRESCOTT_BEMBRIDGE_LUXURY_VINYL_PLANKS',
  'Prescott Bembridge',
  'prescott-bembridge-luxury-vinyl-planks',
  'msi',
  'MSI',
  'cyrus',
  'SPC',
  '7x48',
  'Multi',
  '12mil',
  '5mm',
  23.4,
  1.99,
  46.57,
  'https://cdn.prod.website-files.com/6456ce4476abb2d4f9fbad10/6456ce4576abb27254fbc9f1_msi-surfaces-surprise-granite-bembridge-luxury-vinyl-planks-close-up.jpeg',
  '/flooring/prescott-bembridge-luxury-vinyl-planks',
  true,
  true,
  'Click Lock',
  'Lifetime',
  '10 Years',
  NOW()
) ON CONFLICT (sku) DO UPDATE SET
  wholesale_cost_sf = EXCLUDED.wholesale_cost_sf,
  wholesale_cost_box = EXCLUDED.wholesale_cost_box,
  last_price_update = NOW();

INSERT INTO flooring_products (
  sku, name, slug, vendor_id, brand, collection,
  type, dimensions, primary_color, wear_layer, thickness,
  sf_per_box, wholesale_cost_sf, wholesale_cost_box,
  primary_image, url, is_active, is_waterproof,
  installation_method, residential_warranty, commercial_warranty,
  last_price_update
) VALUES (
  'PRESCOTT_BILLINGHAM_LUXURY_VINYL_PLANKS',
  'Prescott Billingham',
  'prescott-billingham-luxury-vinyl-planks',
  'msi',
  'MSI',
  'cyrus',
  'SPC',
  '7x48',
  'Multi',
  '12mil',
  '5mm',
  23.4,
  1.99,
  46.57,
  'https://cdn.prod.website-files.com/6456ce4476abb2d4f9fbad10/6456ce4576abb28456fbc9f4_msi-surfaces-surprise-granite-billingham-luxury-vinyl-planks-close-up.jpeg',
  '/flooring/prescott-billingham-luxury-vinyl-planks',
  true,
  true,
  'Click Lock',
  'Lifetime',
  '10 Years',
  NOW()
) ON CONFLICT (sku) DO UPDATE SET
  wholesale_cost_sf = EXCLUDED.wholesale_cost_sf,
  wholesale_cost_box = EXCLUDED.wholesale_cost_box,
  last_price_update = NOW();

INSERT INTO flooring_products (
  sku, name, slug, vendor_id, brand, collection,
  type, dimensions, primary_color, wear_layer, thickness,
  sf_per_box, wholesale_cost_sf, wholesale_cost_box,
  primary_image, url, is_active, is_waterproof,
  installation_method, residential_warranty, commercial_warranty,
  last_price_update
) VALUES (
  'PRESCOTT_BOSWELL_LUXURY_VINYL_PLANKS',
  'Prescott Boswell',
  'prescott-boswell-luxury-vinyl-planks',
  'msi',
  'MSI',
  'prescott',
  'SPC',
  '7x48',
  'Multi',
  '20mil',
  '6mm',
  23.4,
  2.69,
  62.95,
  'https://cdn.prod.website-files.com/6456ce4476abb2d4f9fbad10/6456ce4576abb2e3abfbc9ff_msi-surfaces-surprise-granite-bosewell-luxury-vinyl-planks-close-up.jpeg',
  '/flooring/prescott-boswell-luxury-vinyl-planks',
  true,
  true,
  'Click Lock',
  'Lifetime',
  '10 Years',
  NOW()
) ON CONFLICT (sku) DO UPDATE SET
  wholesale_cost_sf = EXCLUDED.wholesale_cost_sf,
  wholesale_cost_box = EXCLUDED.wholesale_cost_box,
  last_price_update = NOW();

INSERT INTO flooring_products (
  sku, name, slug, vendor_id, brand, collection,
  type, dimensions, primary_color, wear_layer, thickness,
  sf_per_box, wholesale_cost_sf, wholesale_cost_box,
  primary_image, url, is_active, is_waterproof,
  installation_method, residential_warranty, commercial_warranty,
  last_price_update
) VALUES (
  'PRESCOTT_BRACKEN_HILL_LUXURY_VINYL_PLANKS',
  'Prescott Bracken Hill',
  'prescott-bracken-hill-luxury-vinyl-planks',
  'msi',
  'MSI',
  'cyrus',
  'SPC',
  '7x48',
  'Multi',
  '12mil',
  '5mm',
  23.4,
  1.99,
  46.57,
  'https://cdn.prod.website-files.com/6456ce4476abb2d4f9fbad10/6456ce4576abb20eb7fbca0a_msi-surfaces-surprise-granite-bracken-hill-luxury-vinyl-planks-close-up.jpeg',
  '/flooring/prescott-bracken-hill-luxury-vinyl-planks',
  true,
  true,
  'Click Lock',
  'Lifetime',
  '10 Years',
  NOW()
) ON CONFLICT (sku) DO UPDATE SET
  wholesale_cost_sf = EXCLUDED.wholesale_cost_sf,
  wholesale_cost_box = EXCLUDED.wholesale_cost_box,
  last_price_update = NOW();

INSERT INTO flooring_products (
  sku, name, slug, vendor_id, brand, collection,
  type, dimensions, primary_color, wear_layer, thickness,
  sf_per_box, wholesale_cost_sf, wholesale_cost_box,
  primary_image, url, is_active, is_waterproof,
  installation_method, residential_warranty, commercial_warranty,
  last_price_update
) VALUES (
  'PRESCOTT_BRALY_LUXURY_VINYL_PLANKS',
  'Prescott Braly',
  'prescott-braly-luxury-vinyl-planks',
  'msi',
  'MSI',
  'wilmont',
  'SPC',
  '7x48',
  'Multi',
  '20mil',
  '6.5mm',
  22,
  2.49,
  54.78,
  'https://cdn.prod.website-files.com/6456ce4476abb2d4f9fbad10/6456ce4576abb2be08fbcb61_msi-surfaces-surprise-granite-prescott-braly-luxury-vinyl-planks-close-up.jpeg',
  '/flooring/prescott-braly-luxury-vinyl-planks',
  true,
  true,
  'Click Lock',
  'Lifetime',
  '10 Years',
  NOW()
) ON CONFLICT (sku) DO UPDATE SET
  wholesale_cost_sf = EXCLUDED.wholesale_cost_sf,
  wholesale_cost_box = EXCLUDED.wholesale_cost_box,
  last_price_update = NOW();

INSERT INTO flooring_products (
  sku, name, slug, vendor_id, brand, collection,
  type, dimensions, primary_color, wear_layer, thickness,
  sf_per_box, wholesale_cost_sf, wholesale_cost_box,
  primary_image, url, is_active, is_waterproof,
  installation_method, residential_warranty, commercial_warranty,
  last_price_update
) VALUES (
  'PRESCOTT_BRIANKA_LUXURY_VINYL_PLANKS',
  'Prescott Brianka',
  'prescott-brianka-luxury-vinyl-planks',
  'msi',
  'MSI',
  'cyrus',
  'SPC',
  '7x48',
  'Multi',
  '12mil',
  '5mm',
  23.4,
  1.99,
  46.57,
  'https://cdn.prod.website-files.com/6456ce4476abb2d4f9fbad10/6456ce4576abb203adfbca1c_msi-surfaces-surprise-granite-brianka-luxury-vinyl-planks-close-up.jpeg',
  '/flooring/prescott-brianka-luxury-vinyl-planks',
  true,
  true,
  'Click Lock',
  'Lifetime',
  '10 Years',
  NOW()
) ON CONFLICT (sku) DO UPDATE SET
  wholesale_cost_sf = EXCLUDED.wholesale_cost_sf,
  wholesale_cost_box = EXCLUDED.wholesale_cost_box,
  last_price_update = NOW();

INSERT INTO flooring_products (
  sku, name, slug, vendor_id, brand, collection,
  type, dimensions, primary_color, wear_layer, thickness,
  sf_per_box, wholesale_cost_sf, wholesale_cost_box,
  primary_image, url, is_active, is_waterproof,
  installation_method, residential_warranty, commercial_warranty,
  last_price_update
) VALUES (
  'PRESCOTT_BROOKLINE_LUXURY_VINYL_PLANKS',
  'Prescott Brookline',
  'prescott-brookline-luxury-vinyl-planks',
  'msi',
  'MSI',
  'prescott',
  'SPC',
  '7x48',
  'Multi',
  '20mil',
  '6mm',
  23.4,
  2.69,
  62.95,
  'https://cdn.prod.website-files.com/6456ce4476abb2d4f9fbad10/6456ce4576abb2fc10fbca22_msi-surfaces-surprise-granite-brookline-luxury-vinyl-planks-close-up.jpeg',
  '/flooring/prescott-brookline-luxury-vinyl-planks',
  true,
  true,
  'Click Lock',
  'Lifetime',
  '10 Years',
  NOW()
) ON CONFLICT (sku) DO UPDATE SET
  wholesale_cost_sf = EXCLUDED.wholesale_cost_sf,
  wholesale_cost_box = EXCLUDED.wholesale_cost_box,
  last_price_update = NOW();

INSERT INTO flooring_products (
  sku, name, slug, vendor_id, brand, collection,
  type, dimensions, primary_color, wear_layer, thickness,
  sf_per_box, wholesale_cost_sf, wholesale_cost_box,
  primary_image, url, is_active, is_waterproof,
  installation_method, residential_warranty, commercial_warranty,
  last_price_update
) VALUES (
  'PRESCOTT_CRANTON_LUXURY_VINYL_PLANKS',
  'Prescott Cranton',
  'prescott-cranton-luxury-vinyl-planks',
  'msi',
  'MSI',
  'prescott',
  'SPC',
  '7x48',
  'Multi',
  '20mil',
  '6mm',
  23.4,
  2.69,
  62.95,
  'https://cdn.prod.website-files.com/6456ce4476abb2d4f9fbad10/6456ce4576abb242d7fbca2d_msi-surfaces-surprise-granite-cranton-luxury-vinyl-planks-close-up.jpeg',
  '/flooring/prescott-cranton-luxury-vinyl-planks',
  true,
  true,
  'Click Lock',
  'Lifetime',
  '10 Years',
  NOW()
) ON CONFLICT (sku) DO UPDATE SET
  wholesale_cost_sf = EXCLUDED.wholesale_cost_sf,
  wholesale_cost_box = EXCLUDED.wholesale_cost_box,
  last_price_update = NOW();

INSERT INTO flooring_products (
  sku, name, slug, vendor_id, brand, collection,
  type, dimensions, primary_color, wear_layer, thickness,
  sf_per_box, wholesale_cost_sf, wholesale_cost_box,
  primary_image, url, is_active, is_waterproof,
  installation_method, residential_warranty, commercial_warranty,
  last_price_update
) VALUES (
  'PRESCOTT_DRAVEN_LUXURY_VINYL_PLANKS',
  'Prescott Draven',
  'prescott-draven-luxury-vinyl-planks',
  'msi',
  'MSI',
  'cyrus',
  'SPC',
  '7x48',
  'Multi',
  '12mil',
  '5mm',
  23.4,
  1.99,
  46.57,
  'https://cdn.prod.website-files.com/6456ce4476abb2d4f9fbad10/6456ce4576abb2ab23fbca39_msi-surfaces-surprise-granite-draven-luxury-vinyl-planks-close-up.jpeg',
  '/flooring/prescott-draven-luxury-vinyl-planks',
  true,
  true,
  'Click Lock',
  'Lifetime',
  '10 Years',
  NOW()
) ON CONFLICT (sku) DO UPDATE SET
  wholesale_cost_sf = EXCLUDED.wholesale_cost_sf,
  wholesale_cost_box = EXCLUDED.wholesale_cost_box,
  last_price_update = NOW();

INSERT INTO flooring_products (
  sku, name, slug, vendor_id, brand, collection,
  type, dimensions, primary_color, wear_layer, thickness,
  sf_per_box, wholesale_cost_sf, wholesale_cost_box,
  primary_image, url, is_active, is_waterproof,
  installation_method, residential_warranty, commercial_warranty,
  last_price_update
) VALUES (
  'PRESCOTT_DUNITE_OAK_LUXURY_VINYL_PLANKS',
  'Prescott Dunite Oak',
  'prescott-dunite-oak-luxury-vinyl-planks',
  'msi',
  'MSI',
  'cyrus',
  'SPC',
  '7x48',
  'Multi',
  '12mil',
  '5mm',
  23.4,
  1.99,
  46.57,
  'https://cdn.prod.website-files.com/6456ce4476abb2d4f9fbad10/6456ce4576abb21c81fbca3f_msi-surfaces-surprise-granite-dunite-oak-luxury-vinyl-planks-close-up.jpeg',
  '/flooring/prescott-dunite-oak-luxury-vinyl-planks',
  true,
  true,
  'Click Lock',
  'Lifetime',
  '10 Years',
  NOW()
) ON CONFLICT (sku) DO UPDATE SET
  wholesale_cost_sf = EXCLUDED.wholesale_cost_sf,
  wholesale_cost_box = EXCLUDED.wholesale_cost_box,
  last_price_update = NOW();

INSERT INTO flooring_products (
  sku, name, slug, vendor_id, brand, collection,
  type, dimensions, primary_color, wear_layer, thickness,
  sf_per_box, wholesale_cost_sf, wholesale_cost_box,
  primary_image, url, is_active, is_waterproof,
  installation_method, residential_warranty, commercial_warranty,
  last_price_update
) VALUES (
  'PRESCOTT_EXOTIKA_LUXURY_VINYL_PLANKS',
  'Prescott Exotika',
  'prescott-exotika-luxury-vinyl-planks',
  'msi',
  'MSI',
  'cyrus',
  'SPC',
  '7x48',
  'Multi',
  '12mil',
  '5mm',
  23.4,
  1.99,
  46.57,
  'https://cdn.prod.website-files.com/6456ce4476abb2d4f9fbad10/6456ce4576abb29f45fbca4a_msi-surfaces-surprise-granite-exotika-luxury-vinyl-planks-close-up.jpeg',
  '/flooring/prescott-exotika-luxury-vinyl-planks',
  true,
  true,
  'Click Lock',
  'Lifetime',
  '10 Years',
  NOW()
) ON CONFLICT (sku) DO UPDATE SET
  wholesale_cost_sf = EXCLUDED.wholesale_cost_sf,
  wholesale_cost_box = EXCLUDED.wholesale_cost_box,
  last_price_update = NOW();

INSERT INTO flooring_products (
  sku, name, slug, vendor_id, brand, collection,
  type, dimensions, primary_color, wear_layer, thickness,
  sf_per_box, wholesale_cost_sf, wholesale_cost_box,
  primary_image, url, is_active, is_waterproof,
  installation_method, residential_warranty, commercial_warranty,
  last_price_update
) VALUES (
  'PRESCOTT_FAUNA_LUXURY_VINYL_PLANKS',
  'Prescott Fauna',
  'prescott-fauna-luxury-vinyl-planks',
  'msi',
  'MSI',
  'cyrus',
  'SPC',
  '7x48',
  'Multi',
  '12mil',
  '5mm',
  23.4,
  1.99,
  46.57,
  'https://cdn.prod.website-files.com/6456ce4476abb2d4f9fbad10/6456ce4576abb2eaebfbcca4_msi-surfaces-surprise-granite-prescott-fauna-luxury-vinyl-planks-close-up.jpeg',
  '/flooring/prescott-fauna-luxury-vinyl-planks',
  true,
  true,
  'Click Lock',
  'Lifetime',
  '10 Years',
  NOW()
) ON CONFLICT (sku) DO UPDATE SET
  wholesale_cost_sf = EXCLUDED.wholesale_cost_sf,
  wholesale_cost_box = EXCLUDED.wholesale_cost_box,
  last_price_update = NOW();

INSERT INTO flooring_products (
  sku, name, slug, vendor_id, brand, collection,
  type, dimensions, primary_color, wear_layer, thickness,
  sf_per_box, wholesale_cost_sf, wholesale_cost_box,
  primary_image, url, is_active, is_waterproof,
  installation_method, residential_warranty, commercial_warranty,
  last_price_update
) VALUES (
  'PRESCOTT_FINELY_LUXURY_VINYL_PLANKS',
  'Prescott Finely',
  'prescott-finely-luxury-vinyl-planks',
  'msi',
  'MSI',
  'cyrus',
  'SPC',
  '7x48',
  'Multi',
  '12mil',
  '5mm',
  23.4,
  1.99,
  46.57,
  'https://cdn.prod.website-files.com/6456ce4476abb2d4f9fbad10/6456ce4576abb27995fbca5b_msi-surfaces-surprise-granite-finely-luxury-vinyl-planks-close-up.jpeg',
  '/flooring/prescott-finely-luxury-vinyl-planks',
  true,
  true,
  'Click Lock',
  'Lifetime',
  '10 Years',
  NOW()
) ON CONFLICT (sku) DO UPDATE SET
  wholesale_cost_sf = EXCLUDED.wholesale_cost_sf,
  wholesale_cost_box = EXCLUDED.wholesale_cost_box,
  last_price_update = NOW();

INSERT INTO flooring_products (
  sku, name, slug, vendor_id, brand, collection,
  type, dimensions, primary_color, wear_layer, thickness,
  sf_per_box, wholesale_cost_sf, wholesale_cost_box,
  primary_image, url, is_active, is_waterproof,
  installation_method, residential_warranty, commercial_warranty,
  last_price_update
) VALUES (
  'PRESCOTT_GRAYTON_LUXURY_VINYL_PLANKS',
  'Prescott Grayton',
  'prescott-grayton-luxury-vinyl-planks',
  'msi',
  'MSI',
  'prescott',
  'SPC',
  '7x48',
  'Gray',
  '20mil',
  '6mm',
  23.4,
  2.69,
  62.95,
  'https://cdn.prod.website-files.com/6456ce4476abb2d4f9fbad10/6456ce4576abb25d6afbca69_msi-surfaces-surprise-granite-grayton-luxury-vinyl-planks-close-up.jpeg',
  '/flooring/prescott-grayton-luxury-vinyl-planks',
  true,
  true,
  'Click Lock',
  'Lifetime',
  '10 Years',
  NOW()
) ON CONFLICT (sku) DO UPDATE SET
  wholesale_cost_sf = EXCLUDED.wholesale_cost_sf,
  wholesale_cost_box = EXCLUDED.wholesale_cost_box,
  last_price_update = NOW();

INSERT INTO flooring_products (
  sku, name, slug, vendor_id, brand, collection,
  type, dimensions, primary_color, wear_layer, thickness,
  sf_per_box, wholesale_cost_sf, wholesale_cost_box,
  primary_image, url, is_active, is_waterproof,
  installation_method, residential_warranty, commercial_warranty,
  last_price_update
) VALUES (
  'PRESCOTT_HAWTHORNE_LUXURY_VINYL_PLANKS',
  'Prescott Hawthorne',
  'prescott-hawthorne-luxury-vinyl-planks',
  'msi',
  'MSI',
  'prescott',
  'SPC',
  '7x48',
  'Multi',
  '20mil',
  '6mm',
  23.4,
  2.69,
  62.95,
  'https://cdn.prod.website-files.com/6456ce4476abb2d4f9fbad10/6456ce4576abb2b755fbcb64_msi-surfaces-surprise-granite-prescott-hawthorne-luxury-vinyl-planks-close-up.jpeg',
  '/flooring/prescott-hawthorne-luxury-vinyl-planks',
  true,
  true,
  'Click Lock',
  'Lifetime',
  '10 Years',
  NOW()
) ON CONFLICT (sku) DO UPDATE SET
  wholesale_cost_sf = EXCLUDED.wholesale_cost_sf,
  wholesale_cost_box = EXCLUDED.wholesale_cost_box,
  last_price_update = NOW();

INSERT INTO flooring_products (
  sku, name, slug, vendor_id, brand, collection,
  type, dimensions, primary_color, wear_layer, thickness,
  sf_per_box, wholesale_cost_sf, wholesale_cost_box,
  primary_image, url, is_active, is_waterproof,
  installation_method, residential_warranty, commercial_warranty,
  last_price_update
) VALUES (
  'PRESCOTT_JENTA_LUXURY_VINYL_PLANKS',
  'Prescott Jenta',
  'prescott-jenta-luxury-vinyl-planks',
  'msi',
  'MSI',
  'prescott',
  'SPC',
  '7x48',
  'Multi',
  '20mil',
  '6mm',
  23.4,
  2.69,
  62.95,
  'https://cdn.prod.website-files.com/6456ce4476abb2d4f9fbad10/6456ce4576abb2d9a9fbcb66_msi-surfaces-surprise-granite-prescott-jenta-luxury-vinyl-planks-close-up.jpeg',
  '/flooring/prescott-jenta-luxury-vinyl-planks',
  true,
  true,
  'Click Lock',
  'Lifetime',
  '10 Years',
  NOW()
) ON CONFLICT (sku) DO UPDATE SET
  wholesale_cost_sf = EXCLUDED.wholesale_cost_sf,
  wholesale_cost_box = EXCLUDED.wholesale_cost_box,
  last_price_update = NOW();

INSERT INTO flooring_products (
  sku, name, slug, vendor_id, brand, collection,
  type, dimensions, primary_color, wear_layer, thickness,
  sf_per_box, wholesale_cost_sf, wholesale_cost_box,
  primary_image, url, is_active, is_waterproof,
  installation_method, residential_warranty, commercial_warranty,
  last_price_update
) VALUES (
  'PRESCOTT_KARDIGAN_LUXURY_VINYL_PLANKS',
  'Prescott Kardigan',
  'prescott-kardigan-luxury-vinyl-planks',
  'msi',
  'MSI',
  'prescott',
  'SPC',
  '7x48',
  'Multi',
  '20mil',
  '6mm',
  23.4,
  2.69,
  62.95,
  'https://cdn.prod.website-files.com/6456ce4476abb2d4f9fbad10/6456ce4576abb2aab9fbca88_msi-surfaces-surprise-granite-kardigan-luxury-vinyl-planks-close-up.jpeg',
  '/flooring/prescott-kardigan-luxury-vinyl-planks',
  true,
  true,
  'Click Lock',
  'Lifetime',
  '10 Years',
  NOW()
) ON CONFLICT (sku) DO UPDATE SET
  wholesale_cost_sf = EXCLUDED.wholesale_cost_sf,
  wholesale_cost_box = EXCLUDED.wholesale_cost_box,
  last_price_update = NOW();

INSERT INTO flooring_products (
  sku, name, slug, vendor_id, brand, collection,
  type, dimensions, primary_color, wear_layer, thickness,
  sf_per_box, wholesale_cost_sf, wholesale_cost_box,
  primary_image, url, is_active, is_waterproof,
  installation_method, residential_warranty, commercial_warranty,
  last_price_update
) VALUES (
  'PRESCOTT_KATELLA_ASH_LUXURY_VINYL_PLANKS',
  'Prescott Katella Ash',
  'prescott-katella-ash-luxury-vinyl-planks',
  'msi',
  'MSI',
  'prescott',
  'SPC',
  '7x48',
  'Multi',
  '20mil',
  '6mm',
  23.4,
  2.69,
  62.95,
  'https://cdn.prod.website-files.com/6456ce4476abb2d4f9fbad10/6456ce4576abb2e412fbca94_msi-surfaces-surprise-granite-katella-luxury-vinyl-planks-close-up.jpeg',
  '/flooring/prescott-katella-ash-luxury-vinyl-planks',
  true,
  true,
  'Click Lock',
  'Lifetime',
  '10 Years',
  NOW()
) ON CONFLICT (sku) DO UPDATE SET
  wholesale_cost_sf = EXCLUDED.wholesale_cost_sf,
  wholesale_cost_box = EXCLUDED.wholesale_cost_box,
  last_price_update = NOW();

INSERT INTO flooring_products (
  sku, name, slug, vendor_id, brand, collection,
  type, dimensions, primary_color, wear_layer, thickness,
  sf_per_box, wholesale_cost_sf, wholesale_cost_box,
  primary_image, url, is_active, is_waterproof,
  installation_method, residential_warranty, commercial_warranty,
  last_price_update
) VALUES (
  'PRESCOTT_LUDLOW_LUXURY_VINYL_PLANKS',
  'Prescott Ludlow',
  'prescott-ludlow-luxury-vinyl-planks',
  'msi',
  'MSI',
  'cyrus',
  'SPC',
  '7x48',
  'Multi',
  '12mil',
  '5mm',
  23.4,
  1.99,
  46.57,
  'https://cdn.prod.website-files.com/6456ce4476abb2d4f9fbad10/6456ce4576abb2105cfbcb6a_msi-surfaces-surprise-granite-prescott-ludlow-luxury-vinyl-planks-close-up.jpeg',
  '/flooring/prescott-ludlow-luxury-vinyl-planks',
  true,
  true,
  'Click Lock',
  'Lifetime',
  '10 Years',
  NOW()
) ON CONFLICT (sku) DO UPDATE SET
  wholesale_cost_sf = EXCLUDED.wholesale_cost_sf,
  wholesale_cost_box = EXCLUDED.wholesale_cost_box,
  last_price_update = NOW();

INSERT INTO flooring_products (
  sku, name, slug, vendor_id, brand, collection,
  type, dimensions, primary_color, wear_layer, thickness,
  sf_per_box, wholesale_cost_sf, wholesale_cost_box,
  primary_image, url, is_active, is_waterproof,
  installation_method, residential_warranty, commercial_warranty,
  last_price_update
) VALUES (
  'PRESCOTT_MEZCLA_LUXURY_VINYL_PLANKS',
  'Prescott Mezcla',
  'prescott-mezcla-luxury-vinyl-planks',
  'msi',
  'MSI',
  'cyrus',
  'SPC',
  '7x48',
  'Multi',
  '12mil',
  '5mm',
  23.4,
  1.99,
  46.57,
  'https://cdn.prod.website-files.com/6456ce4476abb2d4f9fbad10/6456ce4576abb27609fbcaac_msi-surfaces-surprise-granite-mezcla-luxury-vinyl-planks-close-up.jpeg',
  '/flooring/prescott-mezcla-luxury-vinyl-planks',
  true,
  true,
  'Click Lock',
  'Lifetime',
  '10 Years',
  NOW()
) ON CONFLICT (sku) DO UPDATE SET
  wholesale_cost_sf = EXCLUDED.wholesale_cost_sf,
  wholesale_cost_box = EXCLUDED.wholesale_cost_box,
  last_price_update = NOW();

INSERT INTO flooring_products (
  sku, name, slug, vendor_id, brand, collection,
  type, dimensions, primary_color, wear_layer, thickness,
  sf_per_box, wholesale_cost_sf, wholesale_cost_box,
  primary_image, url, is_active, is_waterproof,
  installation_method, residential_warranty, commercial_warranty,
  last_price_update
) VALUES (
  'PRESCOTT_RUNMILL_ISLE_LUXURY_VINYL_PLANKS',
  'Prescott Runmill Isle',
  'prescott-runmill-isle-luxury-vinyl-planks',
  'msi',
  'MSI',
  'prescott',
  'SPC',
  '7x48',
  'Multi',
  '20mil',
  '6mm',
  23.4,
  2.69,
  62.95,
  'https://cdn.prod.website-files.com/6456ce4476abb2d4f9fbad10/6456ce4576abb2681bfbcab5_msi-surfaces-surprise-granite-runmill-isle-luxury-vinyl-planks-close-up.jpeg',
  '/flooring/prescott-runmill-isle-luxury-vinyl-planks',
  true,
  true,
  'Click Lock',
  'Lifetime',
  '10 Years',
  NOW()
) ON CONFLICT (sku) DO UPDATE SET
  wholesale_cost_sf = EXCLUDED.wholesale_cost_sf,
  wholesale_cost_box = EXCLUDED.wholesale_cost_box,
  last_price_update = NOW();

INSERT INTO flooring_products (
  sku, name, slug, vendor_id, brand, collection,
  type, dimensions, primary_color, wear_layer, thickness,
  sf_per_box, wholesale_cost_sf, wholesale_cost_box,
  primary_image, url, is_active, is_waterproof,
  installation_method, residential_warranty, commercial_warranty,
  last_price_update
) VALUES (
  'PRESCOTT_RYDER_LUXURY_VINYL_PLANKS',
  'Prescott Ryder',
  'prescott-ryder-luxury-vinyl-planks',
  'msi',
  'MSI',
  'cyrus',
  'SPC',
  '7x48',
  'Multi',
  '12mil',
  '5mm',
  23.4,
  1.99,
  46.57,
  'https://cdn.prod.website-files.com/6456ce4476abb2d4f9fbad10/6456ce4576abb226a0fbcac7_msi-surfaces-surprise-granite-ryder-luxury-vinyl-planks-close-up.jpeg',
  '/flooring/prescott-ryder-luxury-vinyl-planks',
  true,
  true,
  'Click Lock',
  'Lifetime',
  '10 Years',
  NOW()
) ON CONFLICT (sku) DO UPDATE SET
  wholesale_cost_sf = EXCLUDED.wholesale_cost_sf,
  wholesale_cost_box = EXCLUDED.wholesale_cost_box,
  last_price_update = NOW();

INSERT INTO flooring_products (
  sku, name, slug, vendor_id, brand, collection,
  type, dimensions, primary_color, wear_layer, thickness,
  sf_per_box, wholesale_cost_sf, wholesale_cost_box,
  primary_image, url, is_active, is_waterproof,
  installation_method, residential_warranty, commercial_warranty,
  last_price_update
) VALUES (
  'PRESCOTT_SANDINO_LUXURY_VINYL_PLANKS',
  'Prescott Sandino',
  'prescott-sandino-luxury-vinyl-planks',
  'msi',
  'MSI',
  'wilmont',
  'SPC',
  '7x48',
  'Multi',
  '20mil',
  '6.5mm',
  22,
  2.49,
  54.78,
  'https://cdn.prod.website-files.com/6456ce4476abb2d4f9fbad10/6456ce4576abb2d82cfbcad3_msi-surfaces-surprise-granite-sandino-luxury-vinyl-planks-close-up.jpeg',
  '/flooring/prescott-sandino-luxury-vinyl-planks',
  true,
  true,
  'Click Lock',
  'Lifetime',
  '10 Years',
  NOW()
) ON CONFLICT (sku) DO UPDATE SET
  wholesale_cost_sf = EXCLUDED.wholesale_cost_sf,
  wholesale_cost_box = EXCLUDED.wholesale_cost_box,
  last_price_update = NOW();

INSERT INTO flooring_products (
  sku, name, slug, vendor_id, brand, collection,
  type, dimensions, primary_color, wear_layer, thickness,
  sf_per_box, wholesale_cost_sf, wholesale_cost_box,
  primary_image, url, is_active, is_waterproof,
  installation_method, residential_warranty, commercial_warranty,
  last_price_update
) VALUES (
  'PRESCOTT_STABLE_LUXURY_VINYL_PLANKS',
  'Prescott Stable',
  'prescott-stable-luxury-vinyl-planks',
  'msi',
  'MSI',
  'prescott',
  'SPC',
  '7x48',
  'Multi',
  '20mil',
  '6mm',
  23.4,
  2.69,
  62.95,
  'https://cdn.prod.website-files.com/6456ce4476abb2d4f9fbad10/6456ce4576abb2fb1bfbcadc_msi-surfaces-surprise-granite-stable-luxury-vinyl-planks-close-up.jpeg',
  '/flooring/prescott-stable-luxury-vinyl-planks',
  true,
  true,
  'Click Lock',
  'Lifetime',
  '10 Years',
  NOW()
) ON CONFLICT (sku) DO UPDATE SET
  wholesale_cost_sf = EXCLUDED.wholesale_cost_sf,
  wholesale_cost_box = EXCLUDED.wholesale_cost_box,
  last_price_update = NOW();

INSERT INTO flooring_products (
  sku, name, slug, vendor_id, brand, collection,
  type, dimensions, primary_color, wear_layer, thickness,
  sf_per_box, wholesale_cost_sf, wholesale_cost_box,
  primary_image, url, is_active, is_waterproof,
  installation_method, residential_warranty, commercial_warranty,
  last_price_update
) VALUES (
  'PRESCOTT_WALNUT_WAVES_LUXURY_VINYL_PLANKS',
  'Prescott Walnut Waves',
  'prescott-walnut-waves-luxury-vinyl-planks',
  'msi',
  'MSI',
  'prescott',
  'SPC',
  '7x48',
  'Multi',
  '20mil',
  '6mm',
  23.4,
  2.69,
  62.95,
  'https://cdn.prod.website-files.com/6456ce4476abb2d4f9fbad10/6456ce4576abb28974fbcae5_msi-surfaces-surprise-granite-walnut-waves-luxury-vinyl-planks-close-up.jpeg',
  '/flooring/prescott-walnut-waves-luxury-vinyl-planks',
  true,
  true,
  'Click Lock',
  'Lifetime',
  '10 Years',
  NOW()
) ON CONFLICT (sku) DO UPDATE SET
  wholesale_cost_sf = EXCLUDED.wholesale_cost_sf,
  wholesale_cost_box = EXCLUDED.wholesale_cost_box,
  last_price_update = NOW();

INSERT INTO flooring_products (
  sku, name, slug, vendor_id, brand, collection,
  type, dimensions, primary_color, wear_layer, thickness,
  sf_per_box, wholesale_cost_sf, wholesale_cost_box,
  primary_image, url, is_active, is_waterproof,
  installation_method, residential_warranty, commercial_warranty,
  last_price_update
) VALUES (
  'PRESCOTT_WEATHERED_BRINA_LUXURY_VINYL_PLANKS',
  'Prescott Weathered Brina',
  'prescott-weathered-brina-luxury-vinyl-planks',
  'msi',
  'MSI',
  'prescott',
  'SPC',
  '7x48',
  'Multi',
  '20mil',
  '6mm',
  23.4,
  2.69,
  62.95,
  'https://cdn.prod.website-files.com/6456ce4476abb2d4f9fbad10/6456ce4576abb2292cfbcaf0_msi-surfaces-surprise-granite-weathered-brina-luxury-vinyl-planks-close-up.jpeg',
  '/flooring/prescott-weathered-brina-luxury-vinyl-planks',
  true,
  true,
  'Click Lock',
  'Lifetime',
  '10 Years',
  NOW()
) ON CONFLICT (sku) DO UPDATE SET
  wholesale_cost_sf = EXCLUDED.wholesale_cost_sf,
  wholesale_cost_box = EXCLUDED.wholesale_cost_box,
  last_price_update = NOW();

INSERT INTO flooring_products (
  sku, name, slug, vendor_id, brand, collection,
  type, dimensions, primary_color, wear_layer, thickness,
  sf_per_box, wholesale_cost_sf, wholesale_cost_box,
  primary_image, url, is_active, is_waterproof,
  installation_method, residential_warranty, commercial_warranty,
  last_price_update
) VALUES (
  'PRESCOTT_WHITFIELD_GRAY_LUXURY_VINYL_PLANKS',
  'Prescott Whitfield Gray',
  'prescott-whitfield-gray-luxury-vinyl-planks',
  'msi',
  'MSI',
  'wilmont',
  'SPC',
  '7x48',
  'Gray',
  '20mil',
  '6.5mm',
  22,
  2.49,
  54.78,
  'https://cdn.prod.website-files.com/6456ce4476abb2d4f9fbad10/6456ce4576abb280d7fbcafc_msi-surfaces-surprise-granite-whitfield-gray-luxury-vinyl-planks-close-up.jpeg',
  '/flooring/prescott-whitfield-gray-luxury-vinyl-planks',
  true,
  true,
  'Click Lock',
  'Lifetime',
  '10 Years',
  NOW()
) ON CONFLICT (sku) DO UPDATE SET
  wholesale_cost_sf = EXCLUDED.wholesale_cost_sf,
  wholesale_cost_box = EXCLUDED.wholesale_cost_box,
  last_price_update = NOW();

INSERT INTO flooring_products (
  sku, name, slug, vendor_id, brand, collection,
  type, dimensions, primary_color, wear_layer, thickness,
  sf_per_box, wholesale_cost_sf, wholesale_cost_box,
  primary_image, url, is_active, is_waterproof,
  installation_method, residential_warranty, commercial_warranty,
  last_price_update
) VALUES (
  'PRESCOTT_WOBURN_ABBEY_LUXURY_VINYL_PLANKS',
  'Prescott Woburn Abbey',
  'prescott-woburn-abbey-luxury-vinyl-planks',
  'msi',
  'MSI',
  'prescott',
  'SPC',
  '7x48',
  'Multi',
  '20mil',
  '6mm',
  23.4,
  2.69,
  62.95,
  'https://cdn.prod.website-files.com/6456ce4476abb2d4f9fbad10/6456ce4576abb27d2afbcb07_msi-surfaces-surprise-granite-woburn-abbey-luxury-vinyl-planks-close-up.jpeg',
  '/flooring/prescott-woburn-abbey-luxury-vinyl-planks',
  true,
  true,
  'Click Lock',
  'Lifetime',
  '10 Years',
  NOW()
) ON CONFLICT (sku) DO UPDATE SET
  wholesale_cost_sf = EXCLUDED.wholesale_cost_sf,
  wholesale_cost_box = EXCLUDED.wholesale_cost_box,
  last_price_update = NOW();

INSERT INTO flooring_products (
  sku, name, slug, vendor_id, brand, collection,
  type, dimensions, primary_color, wear_layer, thickness,
  sf_per_box, wholesale_cost_sf, wholesale_cost_box,
  primary_image, url, is_active, is_waterproof,
  installation_method, residential_warranty, commercial_warranty,
  last_price_update
) VALUES (
  'PRESCOTT_WOLFEBORO_LUXURY_VINYL_PLANKS',
  'Prescott Wolfeboro',
  'prescott-wolfeboro-luxury-vinyl-planks',
  'msi',
  'MSI',
  'cyrus',
  'SPC',
  '7x48',
  'Multi',
  '12mil',
  '5mm',
  23.4,
  1.99,
  46.57,
  'https://cdn.prod.website-files.com/6456ce4476abb2d4f9fbad10/6456ce4576abb21d5efbcb13_msi-surfaces-surprise-granite-wolfeboro-luxury-vinyl-planks-close-up.jpeg',
  '/flooring/prescott-wolfeboro-luxury-vinyl-planks',
  true,
  true,
  'Click Lock',
  'Lifetime',
  '10 Years',
  NOW()
) ON CONFLICT (sku) DO UPDATE SET
  wholesale_cost_sf = EXCLUDED.wholesale_cost_sf,
  wholesale_cost_box = EXCLUDED.wholesale_cost_box,
  last_price_update = NOW();

INSERT INTO flooring_products (
  sku, name, slug, vendor_id, brand, collection,
  type, dimensions, primary_color, wear_layer, thickness,
  sf_per_box, wholesale_cost_sf, wholesale_cost_box,
  primary_image, url, is_active, is_waterproof,
  installation_method, residential_warranty, commercial_warranty,
  last_price_update
) VALUES (
  'SORENO_TAUPE',
  'Soreno Taupe',
  'soreno-taupe',
  'msi',
  'MSI',
  'unknown',
  'Luxury Vinyl',
  '7x48',
  'Taupe',
  '20mil',
  '5.5mm',
  22,
  2.29,
  50.38,
  'https://cdn.prod.website-files.com/6456ce4476abb25581fbad0c/6456ce4476abb27beffbb16a_Surprise%20Granite%20Transparent%20Dark%20Wide.svg',
  '/flooring/soreno-taupe',
  true,
  true,
  'Click Lock',
  'Lifetime',
  '10 Years',
  NOW()
) ON CONFLICT (sku) DO UPDATE SET
  wholesale_cost_sf = EXCLUDED.wholesale_cost_sf,
  wholesale_cost_box = EXCLUDED.wholesale_cost_box,
  last_price_update = NOW();

INSERT INTO flooring_products (
  sku, name, slug, vendor_id, brand, collection,
  type, dimensions, primary_color, wear_layer, thickness,
  sf_per_box, wholesale_cost_sf, wholesale_cost_box,
  primary_image, url, is_active, is_waterproof,
  installation_method, residential_warranty, commercial_warranty,
  last_price_update
) VALUES (
  'TRECENTO_CALACATTA_LEGEND_LUXURY_VINYL_TILE',
  'Trecento Calacatta Legend',
  'trecento-calacatta-legend-luxury-vinyl-tile',
  'msi',
  'MSI',
  'unknown',
  'Luxury Vinyl',
  '7x48',
  'Multi',
  '20mil',
  '5.5mm',
  22,
  2.29,
  50.38,
  'https://cdn.prod.website-files.com/6456ce4476abb2d4f9fbad10/6456ce4576abb234dafbcb6f_msi-surfaces-surprise-granite-calacatta-legend-luxury-vinyl-planks-close-up.jpeg',
  '/flooring/trecento-calacatta-legend-luxury-vinyl-tile',
  true,
  true,
  'Click Lock',
  'Lifetime',
  '10 Years',
  NOW()
) ON CONFLICT (sku) DO UPDATE SET
  wholesale_cost_sf = EXCLUDED.wholesale_cost_sf,
  wholesale_cost_box = EXCLUDED.wholesale_cost_box,
  last_price_update = NOW();

INSERT INTO flooring_products (
  sku, name, slug, vendor_id, brand, collection,
  type, dimensions, primary_color, wear_layer, thickness,
  sf_per_box, wholesale_cost_sf, wholesale_cost_box,
  primary_image, url, is_active, is_waterproof,
  installation_method, residential_warranty, commercial_warranty,
  last_price_update
) VALUES (
  'TRECENTO_CALACATTA_MARBELLO_LUXURY_VINYL_TILE',
  'Trecento Calacatta Marbello',
  'trecento-calacatta-marbello-luxury-vinyl-tile',
  'msi',
  'MSI',
  'unknown',
  'Luxury Vinyl',
  '7x48',
  'Multi',
  '20mil',
  '5.5mm',
  22,
  2.29,
  50.38,
  'https://cdn.prod.website-files.com/6456ce4476abb2d4f9fbad10/6456ce4576abb24da7fbcb7c_msi-surfaces-surprise-granite-calacatta-marbello-luxury-vinyl-planks-close-up.jpeg',
  '/flooring/trecento-calacatta-marbello-luxury-vinyl-tile',
  true,
  true,
  'Click Lock',
  'Lifetime',
  '10 Years',
  NOW()
) ON CONFLICT (sku) DO UPDATE SET
  wholesale_cost_sf = EXCLUDED.wholesale_cost_sf,
  wholesale_cost_box = EXCLUDED.wholesale_cost_box,
  last_price_update = NOW();

INSERT INTO flooring_products (
  sku, name, slug, vendor_id, brand, collection,
  type, dimensions, primary_color, wear_layer, thickness,
  sf_per_box, wholesale_cost_sf, wholesale_cost_box,
  primary_image, url, is_active, is_waterproof,
  installation_method, residential_warranty, commercial_warranty,
  last_price_update
) VALUES (
  'TRECENTO_CALACATTA_SERRA_LUXURY_VINYL_TILE',
  'Trecento Calacatta Serra',
  'trecento-calacatta-serra-luxury-vinyl-tile',
  'msi',
  'MSI',
  'unknown',
  'Luxury Vinyl',
  '7x48',
  'Multi',
  '20mil',
  '5.5mm',
  22,
  2.29,
  50.38,
  'https://cdn.prod.website-files.com/6456ce4476abb2d4f9fbad10/6456ce4576abb2cc25fbcb7f_msi-surfaces-surprise-granite-calacatta-serra-luxury-vinyl-planks-close-up.jpeg',
  '/flooring/trecento-calacatta-serra-luxury-vinyl-tile',
  true,
  true,
  'Click Lock',
  'Lifetime',
  '10 Years',
  NOW()
) ON CONFLICT (sku) DO UPDATE SET
  wholesale_cost_sf = EXCLUDED.wholesale_cost_sf,
  wholesale_cost_box = EXCLUDED.wholesale_cost_box,
  last_price_update = NOW();

INSERT INTO flooring_products (
  sku, name, slug, vendor_id, brand, collection,
  type, dimensions, primary_color, wear_layer, thickness,
  sf_per_box, wholesale_cost_sf, wholesale_cost_box,
  primary_image, url, is_active, is_waterproof,
  installation_method, residential_warranty, commercial_warranty,
  last_price_update
) VALUES (
  'TRECENTO_CALACATTA_VENOSA_GOLD_LUXURY_VINYL_TILE',
  'Trecento Calacatta Venosa Gold',
  'trecento-calacatta-venosa-gold-luxury-vinyl-tile',
  'msi',
  'MSI',
  'unknown',
  'Luxury Vinyl',
  '7x48',
  'Gold',
  '20mil',
  '5.5mm',
  22,
  2.29,
  50.38,
  'https://cdn.prod.website-files.com/6456ce4476abb2d4f9fbad10/6456ce4576abb233dbfbcb80_msi-surfaces-surprise-granite-calacatta-venosa-gold-luxury-vinyl-planks-close-up.jpeg',
  '/flooring/trecento-calacatta-venosa-gold-luxury-vinyl-tile',
  true,
  true,
  'Click Lock',
  'Lifetime',
  '10 Years',
  NOW()
) ON CONFLICT (sku) DO UPDATE SET
  wholesale_cost_sf = EXCLUDED.wholesale_cost_sf,
  wholesale_cost_box = EXCLUDED.wholesale_cost_box,
  last_price_update = NOW();

INSERT INTO flooring_products (
  sku, name, slug, vendor_id, brand, collection,
  type, dimensions, primary_color, wear_layer, thickness,
  sf_per_box, wholesale_cost_sf, wholesale_cost_box,
  primary_image, url, is_active, is_waterproof,
  installation_method, residential_warranty, commercial_warranty,
  last_price_update
) VALUES (
  'TRECENTO_CARRARA_AVELL_LUXURY_VINYL_TILE',
  'Trecento Carrara Avell',
  'trecento-carrara-avell-luxury-vinyl-tile',
  'msi',
  'MSI',
  'unknown',
  'Luxury Vinyl',
  '7x48',
  'Multi',
  '20mil',
  '5.5mm',
  22,
  2.29,
  50.38,
  'https://cdn.prod.website-files.com/6456ce4476abb2d4f9fbad10/6456ce4576abb2324bfbcb86_msi-surfaces-surprise-granite-carrara-avell-luxury-vinyl-tile-close-up.jpeg',
  '/flooring/trecento-carrara-avell-luxury-vinyl-tile',
  true,
  true,
  'Click Lock',
  'Lifetime',
  '10 Years',
  NOW()
) ON CONFLICT (sku) DO UPDATE SET
  wholesale_cost_sf = EXCLUDED.wholesale_cost_sf,
  wholesale_cost_box = EXCLUDED.wholesale_cost_box,
  last_price_update = NOW();

INSERT INTO flooring_products (
  sku, name, slug, vendor_id, brand, collection,
  type, dimensions, primary_color, wear_layer, thickness,
  sf_per_box, wholesale_cost_sf, wholesale_cost_box,
  primary_image, url, is_active, is_waterproof,
  installation_method, residential_warranty, commercial_warranty,
  last_price_update
) VALUES (
  'TRECENTO_MOUNTAINS_GRAY_LUXURY_VINYL_TILE',
  'Trecento Mountains Gray',
  'trecento-mountains-gray-luxury-vinyl-tile',
  'msi',
  'MSI',
  'unknown',
  'Luxury Vinyl',
  '7x48',
  'Gray',
  '20mil',
  '5.5mm',
  22,
  2.29,
  50.38,
  'https://cdn.prod.website-files.com/6456ce4476abb2d4f9fbad10/6456ce4576abb216c4fbcb91_msi-surfaces-surprise-granite-mountains-gray-luxury-vinyl-planks-close-up.jpeg',
  '/flooring/trecento-mountains-gray-luxury-vinyl-tile',
  true,
  true,
  'Click Lock',
  'Lifetime',
  '10 Years',
  NOW()
) ON CONFLICT (sku) DO UPDATE SET
  wholesale_cost_sf = EXCLUDED.wholesale_cost_sf,
  wholesale_cost_box = EXCLUDED.wholesale_cost_box,
  last_price_update = NOW();

INSERT INTO flooring_products (
  sku, name, slug, vendor_id, brand, collection,
  type, dimensions, primary_color, wear_layer, thickness,
  sf_per_box, wholesale_cost_sf, wholesale_cost_box,
  primary_image, url, is_active, is_waterproof,
  installation_method, residential_warranty, commercial_warranty,
  last_price_update
) VALUES (
  'TRECENTO_QUARZO_TAJ_LUXURY_VINYL_TILE',
  'Trecento Quarzo Taj',
  'trecento-quarzo-taj-luxury-vinyl-tile',
  'msi',
  'MSI',
  'unknown',
  'Luxury Vinyl',
  '7x48',
  'Multi',
  '20mil',
  '5.5mm',
  22,
  2.29,
  50.38,
  'https://cdn.prod.website-files.com/6456ce4476abb2d4f9fbad10/6456ce4576abb26667fbcb95_msi-surfaces-surprise-granite-quarzo-taj-luxury-vinyl-planks-close-up.jpeg',
  '/flooring/trecento-quarzo-taj-luxury-vinyl-tile',
  true,
  true,
  'Click Lock',
  'Lifetime',
  '10 Years',
  NOW()
) ON CONFLICT (sku) DO UPDATE SET
  wholesale_cost_sf = EXCLUDED.wholesale_cost_sf,
  wholesale_cost_box = EXCLUDED.wholesale_cost_box,
  last_price_update = NOW();

INSERT INTO flooring_products (
  sku, name, slug, vendor_id, brand, collection,
  type, dimensions, primary_color, wear_layer, thickness,
  sf_per_box, wholesale_cost_sf, wholesale_cost_box,
  primary_image, url, is_active, is_waterproof,
  installation_method, residential_warranty, commercial_warranty,
  last_price_update
) VALUES (
  'TRECENTO_WHITE_OCEAN_LUXURY_VINYL_TILE',
  'Trecento White Ocean',
  'trecento-white-ocean-luxury-vinyl-tile',
  'msi',
  'MSI',
  'unknown',
  'Luxury Vinyl',
  '7x48',
  'White',
  '20mil',
  '5.5mm',
  22,
  2.29,
  50.38,
  'https://cdn.prod.website-files.com/6456ce4476abb2d4f9fbad10/6456ce4576abb258a3fbcba1_msi-surfaces-surprise-granite-white-ocean-luxury-vinyl-tile-close-up.jpeg',
  '/flooring/trecento-white-ocean-luxury-vinyl-tile',
  true,
  true,
  'Click Lock',
  'Lifetime',
  '10 Years',
  NOW()
) ON CONFLICT (sku) DO UPDATE SET
  wholesale_cost_sf = EXCLUDED.wholesale_cost_sf,
  wholesale_cost_box = EXCLUDED.wholesale_cost_box,
  last_price_update = NOW();

INSERT INTO flooring_products (
  sku, name, slug, vendor_id, brand, collection,
  type, dimensions, primary_color, wear_layer, thickness,
  sf_per_box, wholesale_cost_sf, wholesale_cost_box,
  primary_image, url, is_active, is_waterproof,
  installation_method, residential_warranty, commercial_warranty,
  last_price_update
) VALUES (
  'TRECENTO_WINDSOR_CREST_LUXURY_VINYL_TILE',
  'Trecento Windsor Crest',
  'trecento-windsor-crest-luxury-vinyl-tile',
  'msi',
  'MSI',
  'unknown',
  'Luxury Vinyl',
  '7x48',
  'Multi',
  '20mil',
  '5.5mm',
  22,
  2.29,
  50.38,
  'https://cdn.prod.website-files.com/6456ce4476abb2d4f9fbad10/6456ce4576abb20774fbcba4_msi-surfaces-surprise-granite-windsor-crest-luxury-vinyl-tile-close-up.jpeg',
  '/flooring/trecento-windsor-crest-luxury-vinyl-tile',
  true,
  true,
  'Click Lock',
  'Lifetime',
  '10 Years',
  NOW()
) ON CONFLICT (sku) DO UPDATE SET
  wholesale_cost_sf = EXCLUDED.wholesale_cost_sf,
  wholesale_cost_box = EXCLUDED.wholesale_cost_box,
  last_price_update = NOW();

INSERT INTO flooring_products (
  sku, name, slug, vendor_id, brand, collection,
  type, dimensions, primary_color, wear_layer, thickness,
  sf_per_box, wholesale_cost_sf, wholesale_cost_box,
  primary_image, url, is_active, is_waterproof,
  installation_method, residential_warranty, commercial_warranty,
  last_price_update
) VALUES (
  'TRECENTO_WINDSOR_ISLE_LUXURY_VINYL_PLANKS',
  'Trecento Windsor Isle',
  'trecento-windsor-isle-luxury-vinyl-planks',
  'msi',
  'MSI',
  'unknown',
  'Luxury Vinyl',
  '7x48',
  'Multi',
  '20mil',
  '5.5mm',
  22,
  2.29,
  50.38,
  'https://cdn.prod.website-files.com/6456ce4476abb2d4f9fbad10/6456ce4576abb22819fbcba5_msi-surfaces-surprise-granite-windsor-isle-luxury-vinyl-tile-close-up.jpeg',
  '/flooring/trecento-windsor-isle-luxury-vinyl-planks',
  true,
  true,
  'Click Lock',
  'Lifetime',
  '10 Years',
  NOW()
) ON CONFLICT (sku) DO UPDATE SET
  wholesale_cost_sf = EXCLUDED.wholesale_cost_sf,
  wholesale_cost_box = EXCLUDED.wholesale_cost_box,
  last_price_update = NOW();

INSERT INTO flooring_products (
  sku, name, slug, vendor_id, brand, collection,
  type, dimensions, primary_color, wear_layer, thickness,
  sf_per_box, wholesale_cost_sf, wholesale_cost_box,
  primary_image, url, is_active, is_waterproof,
  installation_method, residential_warranty, commercial_warranty,
  last_price_update
) VALUES (
  'TUNDRA_MARBLE_GREY',
  'Tundra Marble Grey',
  'tundra-marble-grey',
  'msi',
  'MSI',
  'unknown',
  'Luxury Vinyl',
  '7x48',
  'Grey',
  '20mil',
  '5.5mm',
  22,
  2.29,
  50.38,
  'https://cdn.prod.website-files.com/6456ce4476abb25581fbad0c/6456ce4476abb27beffbb16a_Surprise%20Granite%20Transparent%20Dark%20Wide.svg',
  '/flooring/tundra-marble-grey',
  true,
  true,
  'Click Lock',
  'Lifetime',
  '10 Years',
  NOW()
) ON CONFLICT (sku) DO UPDATE SET
  wholesale_cost_sf = EXCLUDED.wholesale_cost_sf,
  wholesale_cost_box = EXCLUDED.wholesale_cost_box,
  last_price_update = NOW();

INSERT INTO flooring_products (
  sku, name, slug, vendor_id, brand, collection,
  type, dimensions, primary_color, wear_layer, thickness,
  sf_per_box, wholesale_cost_sf, wholesale_cost_box,
  primary_image, url, is_active, is_waterproof,
  installation_method, residential_warranty, commercial_warranty,
  last_price_update
) VALUES (
  'TUSCANY_PLATINUM_TRAVERTINE',
  'Tuscany Platinum Travertine',
  'tuscany-platinum-travertine',
  'msi',
  'MSI',
  'unknown',
  'Luxury Vinyl',
  '7x48',
  'Multi',
  '20mil',
  '5.5mm',
  22,
  2.29,
  50.38,
  'https://cdn.prod.website-files.com/6456ce4476abb25581fbad0c/6456ce4476abb27beffbb16a_Surprise%20Granite%20Transparent%20Dark%20Wide.svg',
  '/flooring/tuscany-platinum-travertine',
  true,
  true,
  'Click Lock',
  'Lifetime',
  '10 Years',
  NOW()
) ON CONFLICT (sku) DO UPDATE SET
  wholesale_cost_sf = EXCLUDED.wholesale_cost_sf,
  wholesale_cost_box = EXCLUDED.wholesale_cost_box,
  last_price_update = NOW();

INSERT INTO flooring_products (
  sku, name, slug, vendor_id, brand, collection,
  type, dimensions, primary_color, wear_layer, thickness,
  sf_per_box, wholesale_cost_sf, wholesale_cost_box,
  primary_image, url, is_active, is_waterproof,
  installation_method, residential_warranty, commercial_warranty,
  last_price_update
) VALUES (
  'WILMONT_BURNISHED_ACACIA_LUXURY_VINYL_PLANKS',
  'Wilmont Burnished Acacia',
  'wilmont-burnished-acacia-luxury-vinyl-planks',
  'msi',
  'MSI',
  'wilmont',
  'SPC',
  '7x48',
  'Multi',
  '20mil',
  '6.5mm',
  22,
  2.49,
  54.78,
  'https://cdn.prod.website-files.com/6456ce4476abb2d4f9fbad10/6456ce4576abb27f1cfbcb23_msi-surfaces-surprise-granite-burnished-acacia-luxury-vinyl-planks-close-up.jpeg',
  '/flooring/wilmont-burnished-acacia-luxury-vinyl-planks',
  true,
  true,
  'Click Lock',
  'Lifetime',
  '10 Years',
  NOW()
) ON CONFLICT (sku) DO UPDATE SET
  wholesale_cost_sf = EXCLUDED.wholesale_cost_sf,
  wholesale_cost_box = EXCLUDED.wholesale_cost_box,
  last_price_update = NOW();

INSERT INTO flooring_products (
  sku, name, slug, vendor_id, brand, collection,
  type, dimensions, primary_color, wear_layer, thickness,
  sf_per_box, wholesale_cost_sf, wholesale_cost_box,
  primary_image, url, is_active, is_waterproof,
  installation_method, residential_warranty, commercial_warranty,
  last_price_update
) VALUES (
  'WILMONT_CHARCOAL_OAK_LUXURY_VINYL_PLANKS',
  'Wilmont Charcoal Oak',
  'wilmont-charcoal-oak-luxury-vinyl-planks',
  'msi',
  'MSI',
  'wilmont',
  'SPC',
  '7x48',
  'Multi',
  '20mil',
  '6.5mm',
  22,
  2.49,
  54.78,
  'https://cdn.prod.website-files.com/6456ce4476abb2d4f9fbad10/6456ce4576abb20281fbcb2b_msi-surfaces-surprise-granite-charcoal-oak-luxury-vinyl-planks-close-up.jpeg',
  '/flooring/wilmont-charcoal-oak-luxury-vinyl-planks',
  true,
  true,
  'Click Lock',
  'Lifetime',
  '10 Years',
  NOW()
) ON CONFLICT (sku) DO UPDATE SET
  wholesale_cost_sf = EXCLUDED.wholesale_cost_sf,
  wholesale_cost_box = EXCLUDED.wholesale_cost_box,
  last_price_update = NOW();

INSERT INTO flooring_products (
  sku, name, slug, vendor_id, brand, collection,
  type, dimensions, primary_color, wear_layer, thickness,
  sf_per_box, wholesale_cost_sf, wholesale_cost_box,
  primary_image, url, is_active, is_waterproof,
  installation_method, residential_warranty, commercial_warranty,
  last_price_update
) VALUES (
  'WILMONT_ELMWOOD_ASH_LUXURY_VINYL_PLANKS',
  'Wilmont Elmwood Ash',
  'wilmont-elmwood-ash-luxury-vinyl-planks',
  'msi',
  'MSI',
  'wilmont',
  'SPC',
  '7x48',
  'Multi',
  '20mil',
  '6.5mm',
  22,
  2.49,
  54.78,
  'https://cdn.prod.website-files.com/6456ce4476abb2d4f9fbad10/6456ce4576abb2e5dcfbcba9_msi-surfaces-surprise-granite-wilmont-elmwood-ash-luxury-vinyl-planks-close-up.jpeg',
  '/flooring/wilmont-elmwood-ash-luxury-vinyl-planks',
  true,
  true,
  'Click Lock',
  'Lifetime',
  '10 Years',
  NOW()
) ON CONFLICT (sku) DO UPDATE SET
  wholesale_cost_sf = EXCLUDED.wholesale_cost_sf,
  wholesale_cost_box = EXCLUDED.wholesale_cost_box,
  last_price_update = NOW();

INSERT INTO flooring_products (
  sku, name, slug, vendor_id, brand, collection,
  type, dimensions, primary_color, wear_layer, thickness,
  sf_per_box, wholesale_cost_sf, wholesale_cost_box,
  primary_image, url, is_active, is_waterproof,
  installation_method, residential_warranty, commercial_warranty,
  last_price_update
) VALUES (
  'WILMONT_LIME_WASHED_OAK_LUXURY_VINYL_PLANKS',
  'Wilmont Lime Washed Oak',
  'wilmont-lime-washed-oak-luxury-vinyl-planks',
  'msi',
  'MSI',
  'wilmont',
  'SPC',
  '7x48',
  'Multi',
  '20mil',
  '6.5mm',
  22,
  2.49,
  54.78,
  'https://cdn.prod.website-files.com/6456ce4476abb2d4f9fbad10/6456ce4576abb2ea02fbcbab_msi-surfaces-surprise-granite-wilmont-lime-washed-oak-luxury-vinyl-planks-close-up.jpeg',
  '/flooring/wilmont-lime-washed-oak-luxury-vinyl-planks',
  true,
  true,
  'Click Lock',
  'Lifetime',
  '10 Years',
  NOW()
) ON CONFLICT (sku) DO UPDATE SET
  wholesale_cost_sf = EXCLUDED.wholesale_cost_sf,
  wholesale_cost_box = EXCLUDED.wholesale_cost_box,
  last_price_update = NOW();

INSERT INTO flooring_products (
  sku, name, slug, vendor_id, brand, collection,
  type, dimensions, primary_color, wear_layer, thickness,
  sf_per_box, wholesale_cost_sf, wholesale_cost_box,
  primary_image, url, is_active, is_waterproof,
  installation_method, residential_warranty, commercial_warranty,
  last_price_update
) VALUES (
  'WILMONT_RECLAIMED_OAK_LUXURY_VINYL_PLANKS',
  'Wilmont Reclaimed Oak',
  'wilmont-reclaimed-oak-luxury-vinyl-planks',
  'msi',
  'MSI',
  'wilmont',
  'SPC',
  '7x48',
  'Multi',
  '20mil',
  '6.5mm',
  22,
  2.49,
  54.78,
  'https://cdn.prod.website-files.com/6456ce4476abb2d4f9fbad10/6456ce4576abb21e0cfbcbad_msi-surfaces-surprise-granite-wilmont-reclaimed-oak-luxury-vinyl-planks-close-up.jpeg',
  '/flooring/wilmont-reclaimed-oak-luxury-vinyl-planks',
  true,
  true,
  'Click Lock',
  'Lifetime',
  '10 Years',
  NOW()
) ON CONFLICT (sku) DO UPDATE SET
  wholesale_cost_sf = EXCLUDED.wholesale_cost_sf,
  wholesale_cost_box = EXCLUDED.wholesale_cost_box,
  last_price_update = NOW();

INSERT INTO flooring_products (
  sku, name, slug, vendor_id, brand, collection,
  type, dimensions, primary_color, wear_layer, thickness,
  sf_per_box, wholesale_cost_sf, wholesale_cost_box,
  primary_image, url, is_active, is_waterproof,
  installation_method, residential_warranty, commercial_warranty,
  last_price_update
) VALUES (
  'WILMONT_TWILIGHT_OAK_LUXURY_VINYL_PLANKS',
  'Wilmont Twilight Oak',
  'wilmont-twilight-oak-luxury-vinyl-planks',
  'msi',
  'MSI',
  'wilmont',
  'SPC',
  '7x48',
  'Multi',
  '20mil',
  '6.5mm',
  22,
  2.49,
  54.78,
  'https://cdn.prod.website-files.com/6456ce4476abb2d4f9fbad10/6456ce4576abb26773fbcb58_msi-surfaces-surprise-granite-twilight-oak-luxury-vinyl-planks-close-up.jpeg',
  '/flooring/wilmont-twilight-oak-luxury-vinyl-planks',
  true,
  true,
  'Click Lock',
  'Lifetime',
  '10 Years',
  NOW()
) ON CONFLICT (sku) DO UPDATE SET
  wholesale_cost_sf = EXCLUDED.wholesale_cost_sf,
  wholesale_cost_box = EXCLUDED.wholesale_cost_box,
  last_price_update = NOW();

INSERT INTO flooring_products (
  sku, name, slug, vendor_id, brand, collection,
  type, dimensions, primary_color, wear_layer, thickness,
  sf_per_box, wholesale_cost_sf, wholesale_cost_box,
  primary_image, url, is_active, is_waterproof,
  installation_method, residential_warranty, commercial_warranty,
  last_price_update
) VALUES (
  'WILMONT_WOODRIFT_GRAY_LUXURY_VINYL_PLANKS',
  'Wilmont Woodrift Gray',
  'wilmont-woodrift-gray-luxury-vinyl-planks',
  'msi',
  'MSI',
  'wilmont',
  'SPC',
  '7x48',
  'Gray',
  '20mil',
  '6.5mm',
  22,
  2.49,
  54.78,
  'https://cdn.prod.website-files.com/6456ce4476abb2d4f9fbad10/6456ce4576abb28d35fbcbaf_msi-surfaces-surprise-granite-wilmont-woodrift-gray-luxury-vinyl-planks-close-up.jpeg',
  '/flooring/wilmont-woodrift-gray-luxury-vinyl-planks',
  true,
  true,
  'Click Lock',
  'Lifetime',
  '10 Years',
  NOW()
) ON CONFLICT (sku) DO UPDATE SET
  wholesale_cost_sf = EXCLUDED.wholesale_cost_sf,
  wholesale_cost_box = EXCLUDED.wholesale_cost_box,
  last_price_update = NOW();

INSERT INTO flooring_products (
  sku, name, slug, vendor_id, brand, collection,
  type, dimensions, primary_color, wear_layer, thickness,
  sf_per_box, wholesale_cost_sf, wholesale_cost_box,
  primary_image, url, is_active, is_waterproof,
  installation_method, residential_warranty, commercial_warranty,
  last_price_update
) VALUES (
  'XL_ASHTON_BERGEN_HILLS_LUXURY_VINYL_PLANK',
  'XL Ashton Bergen Hills',
  'xl-ashton-bergen-hills-luxury-vinyl-plank',
  'msi',
  'MSI',
  'ashton',
  'Luxury Vinyl',
  '7x48',
  'Multi',
  '20mil',
  '5.5mm',
  22,
  2.29,
  50.38,
  'https://cdn.prod.website-files.com/6456ce4476abb2d4f9fbad10/6456ce4576abb2b8d5fbcbb1_msi-surfaces-surprise-granite-xl-ashton-bergen-hills-luxury-vinyl-planks-close-up.jpeg',
  '/flooring/xl-ashton-bergen-hills-luxury-vinyl-plank',
  true,
  true,
  'Click Lock',
  'Lifetime',
  '10 Years',
  NOW()
) ON CONFLICT (sku) DO UPDATE SET
  wholesale_cost_sf = EXCLUDED.wholesale_cost_sf,
  wholesale_cost_box = EXCLUDED.wholesale_cost_box,
  last_price_update = NOW();

INSERT INTO flooring_products (
  sku, name, slug, vendor_id, brand, collection,
  type, dimensions, primary_color, wear_layer, thickness,
  sf_per_box, wholesale_cost_sf, wholesale_cost_box,
  primary_image, url, is_active, is_waterproof,
  installation_method, residential_warranty, commercial_warranty,
  last_price_update
) VALUES (
  'XL_ASHTON_COLSTON_PARK_LUXURY_VINYL_PLANKS',
  'XL Ashton Colston Park',
  'xl-ashton-colston-park-luxury-vinyl-planks',
  'msi',
  'MSI',
  'ashton',
  'Luxury Vinyl',
  '7x48',
  'Multi',
  '20mil',
  '5.5mm',
  22,
  2.29,
  50.38,
  'https://cdn.prod.website-files.com/6456ce4476abb2d4f9fbad10/6456ce4576abb2a2e4fbcbb4_msi-surfaces-surprise-granite-xl-ashton-colston-park-luxury-vinyl-planks-close-up.jpeg',
  '/flooring/xl-ashton-colston-park-luxury-vinyl-planks',
  true,
  true,
  'Click Lock',
  'Lifetime',
  '10 Years',
  NOW()
) ON CONFLICT (sku) DO UPDATE SET
  wholesale_cost_sf = EXCLUDED.wholesale_cost_sf,
  wholesale_cost_box = EXCLUDED.wholesale_cost_box,
  last_price_update = NOW();

INSERT INTO flooring_products (
  sku, name, slug, vendor_id, brand, collection,
  type, dimensions, primary_color, wear_layer, thickness,
  sf_per_box, wholesale_cost_sf, wholesale_cost_box,
  primary_image, url, is_active, is_waterproof,
  installation_method, residential_warranty, commercial_warranty,
  last_price_update
) VALUES (
  'XL_ASHTON_LOTON_HILL_LUXURY_VINYL_PLANKS',
  'XL Ashton Loton Hill',
  'xl-ashton-loton-hill-luxury-vinyl-planks',
  'msi',
  'MSI',
  'ashton',
  'Luxury Vinyl',
  '7x48',
  'Multi',
  '20mil',
  '5.5mm',
  22,
  2.29,
  50.38,
  'https://cdn.prod.website-files.com/6456ce4476abb2d4f9fbad10/6456ce4576abb273bdfbcbb7_msi-surfaces-surprise-granite-xl-ashton-loton-hill-luxury-vinyl-planks-close-up.jpeg',
  '/flooring/xl-ashton-loton-hill-luxury-vinyl-planks',
  true,
  true,
  'Click Lock',
  'Lifetime',
  '10 Years',
  NOW()
) ON CONFLICT (sku) DO UPDATE SET
  wholesale_cost_sf = EXCLUDED.wholesale_cost_sf,
  wholesale_cost_box = EXCLUDED.wholesale_cost_box,
  last_price_update = NOW();

INSERT INTO flooring_products (
  sku, name, slug, vendor_id, brand, collection,
  type, dimensions, primary_color, wear_layer, thickness,
  sf_per_box, wholesale_cost_sf, wholesale_cost_box,
  primary_image, url, is_active, is_waterproof,
  installation_method, residential_warranty, commercial_warranty,
  last_price_update
) VALUES (
  'XL_ASHTON_MARACAY_BROWN_LUXURY_VINYL_PLANKS',
  'XL Ashton Maracay Brown',
  'xl-ashton-maracay-brown-luxury-vinyl-planks',
  'msi',
  'MSI',
  'ashton',
  'Luxury Vinyl',
  '7x48',
  'Brown',
  '20mil',
  '5.5mm',
  22,
  2.29,
  50.38,
  'https://cdn.prod.website-files.com/6456ce4476abb2d4f9fbad10/6456ce4576abb21b40fbcbbc_msi-surfaces-surprise-granite-xl-ashton-maracay-brown-luxury-vinyl-planks-close-up.jpeg',
  '/flooring/xl-ashton-maracay-brown-luxury-vinyl-planks',
  true,
  true,
  'Click Lock',
  'Lifetime',
  '10 Years',
  NOW()
) ON CONFLICT (sku) DO UPDATE SET
  wholesale_cost_sf = EXCLUDED.wholesale_cost_sf,
  wholesale_cost_box = EXCLUDED.wholesale_cost_box,
  last_price_update = NOW();

INSERT INTO flooring_products (
  sku, name, slug, vendor_id, brand, collection,
  type, dimensions, primary_color, wear_layer, thickness,
  sf_per_box, wholesale_cost_sf, wholesale_cost_box,
  primary_image, url, is_active, is_waterproof,
  installation_method, residential_warranty, commercial_warranty,
  last_price_update
) VALUES (
  'XL_ASHTON_YORK_GRAY_LUXURY_VINYL_PLANKS',
  'XL Ashton York Gray',
  'xl-ashton-york-gray-luxury-vinyl-planks',
  'msi',
  'MSI',
  'ashton',
  'Luxury Vinyl',
  '7x48',
  'Gray',
  '20mil',
  '5.5mm',
  22,
  2.29,
  50.38,
  'https://cdn.prod.website-files.com/6456ce4476abb2d4f9fbad10/6456ce4576abb2cdeefbcbbd_msi-surfaces-surprise-granite-xl-ashton-york-gray-luxury-vinyl-planks-close-up.jpeg',
  '/flooring/xl-ashton-york-gray-luxury-vinyl-planks',
  true,
  true,
  'Click Lock',
  'Lifetime',
  '10 Years',
  NOW()
) ON CONFLICT (sku) DO UPDATE SET
  wholesale_cost_sf = EXCLUDED.wholesale_cost_sf,
  wholesale_cost_box = EXCLUDED.wholesale_cost_box,
  last_price_update = NOW();

INSERT INTO flooring_products (
  sku, name, slug, vendor_id, brand, collection,
  type, dimensions, primary_color, wear_layer, thickness,
  sf_per_box, wholesale_cost_sf, wholesale_cost_box,
  primary_image, url, is_active, is_waterproof,
  installation_method, residential_warranty, commercial_warranty,
  last_price_update
) VALUES (
  'XL_CYRUS_AKADIA_LUXURY_VINYL_PLANKS',
  'XL Cyrus Akadia',
  'xl-cyrus-akadia-luxury-vinyl-planks',
  'msi',
  'MSI',
  'cyrus',
  'SPC',
  '7x48',
  'Multi',
  '12mil',
  '5mm',
  23.4,
  1.99,
  46.57,
  'https://cdn.prod.website-files.com/6456ce4476abb2d4f9fbad10/6456ce4576abb26f51fbcbc2_msi-surfaces-surprise-granite-xl-cyrus-akadia-luxury-vinyl-planks-close-up.jpeg',
  '/flooring/xl-cyrus-akadia-luxury-vinyl-planks',
  true,
  true,
  'Click Lock',
  'Lifetime',
  '10 Years',
  NOW()
) ON CONFLICT (sku) DO UPDATE SET
  wholesale_cost_sf = EXCLUDED.wholesale_cost_sf,
  wholesale_cost_box = EXCLUDED.wholesale_cost_box,
  last_price_update = NOW();

INSERT INTO flooring_products (
  sku, name, slug, vendor_id, brand, collection,
  type, dimensions, primary_color, wear_layer, thickness,
  sf_per_box, wholesale_cost_sf, wholesale_cost_box,
  primary_image, url, is_active, is_waterproof,
  installation_method, residential_warranty, commercial_warranty,
  last_price_update
) VALUES (
  'XL_CYRUS_BARRELL_LUXURY_VINYL_PLANKS',
  'XL Cyrus Barrell',
  'xl-cyrus-barrell-luxury-vinyl-planks',
  'msi',
  'MSI',
  'cyrus',
  'SPC',
  '7x48',
  'Multi',
  '12mil',
  '5mm',
  23.4,
  1.99,
  46.57,
  'https://cdn.prod.website-files.com/6456ce4476abb2d4f9fbad10/6456ce4576abb2696afbcbc8_msi-surfaces-surprise-granite-xl-cyrus-barrell-luxury-vinyl-planks-close-up.jpeg',
  '/flooring/xl-cyrus-barrell-luxury-vinyl-planks',
  true,
  true,
  'Click Lock',
  'Lifetime',
  '10 Years',
  NOW()
) ON CONFLICT (sku) DO UPDATE SET
  wholesale_cost_sf = EXCLUDED.wholesale_cost_sf,
  wholesale_cost_box = EXCLUDED.wholesale_cost_box,
  last_price_update = NOW();

INSERT INTO flooring_products (
  sku, name, slug, vendor_id, brand, collection,
  type, dimensions, primary_color, wear_layer, thickness,
  sf_per_box, wholesale_cost_sf, wholesale_cost_box,
  primary_image, url, is_active, is_waterproof,
  installation_method, residential_warranty, commercial_warranty,
  last_price_update
) VALUES (
  'XL_CYRUS_BEMBRIDGE_LUXURY_VINYL_PLANKS',
  'XL Cyrus Bembridge',
  'xl-cyrus-bembridge-luxury-vinyl-planks',
  'msi',
  'MSI',
  'cyrus',
  'SPC',
  '7x48',
  'Multi',
  '12mil',
  '5mm',
  23.4,
  1.99,
  46.57,
  'https://cdn.prod.website-files.com/6456ce4476abb2d4f9fbad10/6456ce4576abb20cb5fbcbcd_msi-surfaces-surprise-granite-xl-cyrus-bembridge-luxury-vinyl-planks-close-up.jpeg',
  '/flooring/xl-cyrus-bembridge-luxury-vinyl-planks',
  true,
  true,
  'Click Lock',
  'Lifetime',
  '10 Years',
  NOW()
) ON CONFLICT (sku) DO UPDATE SET
  wholesale_cost_sf = EXCLUDED.wholesale_cost_sf,
  wholesale_cost_box = EXCLUDED.wholesale_cost_box,
  last_price_update = NOW();

INSERT INTO flooring_products (
  sku, name, slug, vendor_id, brand, collection,
  type, dimensions, primary_color, wear_layer, thickness,
  sf_per_box, wholesale_cost_sf, wholesale_cost_box,
  primary_image, url, is_active, is_waterproof,
  installation_method, residential_warranty, commercial_warranty,
  last_price_update
) VALUES (
  'XL_CYRUS_BILLINGHAM_LUXURY_VINYL_PLANKS',
  'XL Cyrus Billingham',
  'xl-cyrus-billingham-luxury-vinyl-planks',
  'msi',
  'MSI',
  'cyrus',
  'SPC',
  '7x48',
  'Multi',
  '12mil',
  '5mm',
  23.4,
  1.99,
  46.57,
  'https://cdn.prod.website-files.com/6456ce4476abb2d4f9fbad10/6456ce4576abb20f4bfbcbd2_msi-surfaces-surprise-granite-xl-cyrus-billingham-luxury-vinyl-planks-close-up.jpeg',
  '/flooring/xl-cyrus-billingham-luxury-vinyl-planks',
  true,
  true,
  'Click Lock',
  'Lifetime',
  '10 Years',
  NOW()
) ON CONFLICT (sku) DO UPDATE SET
  wholesale_cost_sf = EXCLUDED.wholesale_cost_sf,
  wholesale_cost_box = EXCLUDED.wholesale_cost_box,
  last_price_update = NOW();

INSERT INTO flooring_products (
  sku, name, slug, vendor_id, brand, collection,
  type, dimensions, primary_color, wear_layer, thickness,
  sf_per_box, wholesale_cost_sf, wholesale_cost_box,
  primary_image, url, is_active, is_waterproof,
  installation_method, residential_warranty, commercial_warranty,
  last_price_update
) VALUES (
  'XL_CYRUS_BOSWELL_LUXURY_VINYL_PLANKS',
  'XL Cyrus Boswell',
  'xl-cyrus-boswell-luxury-vinyl-planks',
  'msi',
  'MSI',
  'cyrus',
  'SPC',
  '7x48',
  'Multi',
  '12mil',
  '5mm',
  23.4,
  1.99,
  46.57,
  'https://cdn.prod.website-files.com/6456ce4476abb2d4f9fbad10/6456ce4576abb27f82fbcc02_msi-surfaces-surprise-granite-xl-cyrus-boswell-luxury-vinyl-planks-close-up.jpeg',
  '/flooring/xl-cyrus-boswell-luxury-vinyl-planks',
  true,
  true,
  'Click Lock',
  'Lifetime',
  '10 Years',
  NOW()
) ON CONFLICT (sku) DO UPDATE SET
  wholesale_cost_sf = EXCLUDED.wholesale_cost_sf,
  wholesale_cost_box = EXCLUDED.wholesale_cost_box,
  last_price_update = NOW();

INSERT INTO flooring_products (
  sku, name, slug, vendor_id, brand, collection,
  type, dimensions, primary_color, wear_layer, thickness,
  sf_per_box, wholesale_cost_sf, wholesale_cost_box,
  primary_image, url, is_active, is_waterproof,
  installation_method, residential_warranty, commercial_warranty,
  last_price_update
) VALUES (
  'XL_CYRUS_BRACKEN_HILL_LUXURY_VINYL_PLANKS',
  'XL Cyrus Bracken Hill',
  'xl-cyrus-bracken-hill-luxury-vinyl-planks',
  'msi',
  'MSI',
  'cyrus',
  'SPC',
  '7x48',
  'Multi',
  '12mil',
  '5mm',
  23.4,
  1.99,
  46.57,
  'https://cdn.prod.website-files.com/6456ce4476abb2d4f9fbad10/6456ce4576abb223f9fbcc08_msi-surfaces-surprise-granite-xl-cyrus-bracken-hill-luxury-vinyl-planks-close-up.jpeg',
  '/flooring/xl-cyrus-bracken-hill-luxury-vinyl-planks',
  true,
  true,
  'Click Lock',
  'Lifetime',
  '10 Years',
  NOW()
) ON CONFLICT (sku) DO UPDATE SET
  wholesale_cost_sf = EXCLUDED.wholesale_cost_sf,
  wholesale_cost_box = EXCLUDED.wholesale_cost_box,
  last_price_update = NOW();

INSERT INTO flooring_products (
  sku, name, slug, vendor_id, brand, collection,
  type, dimensions, primary_color, wear_layer, thickness,
  sf_per_box, wholesale_cost_sf, wholesale_cost_box,
  primary_image, url, is_active, is_waterproof,
  installation_method, residential_warranty, commercial_warranty,
  last_price_update
) VALUES (
  'XL_CYRUS_BRALY_LUXURY_VINYL_PLANKS',
  'XL Cyrus Braly',
  'xl-cyrus-braly-luxury-vinyl-planks',
  'msi',
  'MSI',
  'wilmont',
  'SPC',
  '7x48',
  'Multi',
  '20mil',
  '6.5mm',
  22,
  2.49,
  54.78,
  'https://cdn.prod.website-files.com/6456ce4476abb2d4f9fbad10/6456ce4576abb2861dfbcc10_msi-surfaces-surprise-granite-xl-cyrus-braly-luxury-vinyl-planks-close-up.jpeg',
  '/flooring/xl-cyrus-braly-luxury-vinyl-planks',
  true,
  true,
  'Click Lock',
  'Lifetime',
  '10 Years',
  NOW()
) ON CONFLICT (sku) DO UPDATE SET
  wholesale_cost_sf = EXCLUDED.wholesale_cost_sf,
  wholesale_cost_box = EXCLUDED.wholesale_cost_box,
  last_price_update = NOW();

INSERT INTO flooring_products (
  sku, name, slug, vendor_id, brand, collection,
  type, dimensions, primary_color, wear_layer, thickness,
  sf_per_box, wholesale_cost_sf, wholesale_cost_box,
  primary_image, url, is_active, is_waterproof,
  installation_method, residential_warranty, commercial_warranty,
  last_price_update
) VALUES (
  'XL_CYRUS_BRIANKA_LUXURY_VINYL_PLANKS',
  'XL Cyrus Brianka',
  'xl-cyrus-brianka-luxury-vinyl-planks',
  'msi',
  'MSI',
  'cyrus',
  'SPC',
  '7x48',
  'Multi',
  '12mil',
  '5mm',
  23.4,
  1.99,
  46.57,
  'https://cdn.prod.website-files.com/6456ce4476abb2d4f9fbad10/6456ce4576abb251a7fbcc14_msi-surfaces-surprise-granite-xl-cyrus-brianka-luxury-vinyl-planks-close-up.jpeg',
  '/flooring/xl-cyrus-brianka-luxury-vinyl-planks',
  true,
  true,
  'Click Lock',
  'Lifetime',
  '10 Years',
  NOW()
) ON CONFLICT (sku) DO UPDATE SET
  wholesale_cost_sf = EXCLUDED.wholesale_cost_sf,
  wholesale_cost_box = EXCLUDED.wholesale_cost_box,
  last_price_update = NOW();

INSERT INTO flooring_products (
  sku, name, slug, vendor_id, brand, collection,
  type, dimensions, primary_color, wear_layer, thickness,
  sf_per_box, wholesale_cost_sf, wholesale_cost_box,
  primary_image, url, is_active, is_waterproof,
  installation_method, residential_warranty, commercial_warranty,
  last_price_update
) VALUES (
  'XL_CYRUS_BROOKLINE_LUXURY_VINYL_PLANKS',
  'XL Cyrus Brookline',
  'xl-cyrus-brookline-luxury-vinyl-planks',
  'msi',
  'MSI',
  'cyrus',
  'SPC',
  '7x48',
  'Multi',
  '12mil',
  '5mm',
  23.4,
  1.99,
  46.57,
  'https://cdn.prod.website-files.com/6456ce4476abb2d4f9fbad10/6456ce4576abb27cfbfbcc16_msi-surfaces-surprise-granite-xl-cyrus-brookline-luxury-vinyl-planks-close-up.jpeg',
  '/flooring/xl-cyrus-brookline-luxury-vinyl-planks',
  true,
  true,
  'Click Lock',
  'Lifetime',
  '10 Years',
  NOW()
) ON CONFLICT (sku) DO UPDATE SET
  wholesale_cost_sf = EXCLUDED.wholesale_cost_sf,
  wholesale_cost_box = EXCLUDED.wholesale_cost_box,
  last_price_update = NOW();

INSERT INTO flooring_products (
  sku, name, slug, vendor_id, brand, collection,
  type, dimensions, primary_color, wear_layer, thickness,
  sf_per_box, wholesale_cost_sf, wholesale_cost_box,
  primary_image, url, is_active, is_waterproof,
  installation_method, residential_warranty, commercial_warranty,
  last_price_update
) VALUES (
  'XL_CYRUS_CRANTON_LUXURY_VINYL_PLANKS',
  'XL Cyrus Cranton',
  'xl-cyrus-cranton-luxury-vinyl-planks',
  'msi',
  'MSI',
  'cyrus',
  'SPC',
  '7x48',
  'Multi',
  '12mil',
  '5mm',
  23.4,
  1.99,
  46.57,
  'https://cdn.prod.website-files.com/6456ce4476abb2d4f9fbad10/6456ce4576abb24325fbcc1b_msi-surfaces-surprise-granite-xl-cyrus-cranton-luxury-vinyl-planks-close-up.jpeg',
  '/flooring/xl-cyrus-cranton-luxury-vinyl-planks',
  true,
  true,
  'Click Lock',
  'Lifetime',
  '10 Years',
  NOW()
) ON CONFLICT (sku) DO UPDATE SET
  wholesale_cost_sf = EXCLUDED.wholesale_cost_sf,
  wholesale_cost_box = EXCLUDED.wholesale_cost_box,
  last_price_update = NOW();

INSERT INTO flooring_products (
  sku, name, slug, vendor_id, brand, collection,
  type, dimensions, primary_color, wear_layer, thickness,
  sf_per_box, wholesale_cost_sf, wholesale_cost_box,
  primary_image, url, is_active, is_waterproof,
  installation_method, residential_warranty, commercial_warranty,
  last_price_update
) VALUES (
  'XL_CYRUS_DRAVEN_LUXURY_VINYL_PLANKS',
  'XL Cyrus Draven',
  'xl-cyrus-draven-luxury-vinyl-planks',
  'msi',
  'MSI',
  'cyrus',
  'SPC',
  '7x48',
  'Multi',
  '12mil',
  '5mm',
  23.4,
  1.99,
  46.57,
  'https://cdn.prod.website-files.com/6456ce4476abb2d4f9fbad10/6456ce4576abb28125fbcc1d_msi-surfaces-surprise-granite-xl-cyrus-draven-luxury-vinyl-planks-close-up.jpeg',
  '/flooring/xl-cyrus-draven-luxury-vinyl-planks',
  true,
  true,
  'Click Lock',
  'Lifetime',
  '10 Years',
  NOW()
) ON CONFLICT (sku) DO UPDATE SET
  wholesale_cost_sf = EXCLUDED.wholesale_cost_sf,
  wholesale_cost_box = EXCLUDED.wholesale_cost_box,
  last_price_update = NOW();

INSERT INTO flooring_products (
  sku, name, slug, vendor_id, brand, collection,
  type, dimensions, primary_color, wear_layer, thickness,
  sf_per_box, wholesale_cost_sf, wholesale_cost_box,
  primary_image, url, is_active, is_waterproof,
  installation_method, residential_warranty, commercial_warranty,
  last_price_update
) VALUES (
  'XL_CYRUS_DUNITE_OAK_LUXURY_VINYL_PLANKS',
  'XL Cyrus Dunite Oak',
  'xl-cyrus-dunite-oak-luxury-vinyl-planks',
  'msi',
  'MSI',
  'cyrus',
  'SPC',
  '7x48',
  'Multi',
  '12mil',
  '5mm',
  23.4,
  1.99,
  46.57,
  'https://cdn.prod.website-files.com/6456ce4476abb2d4f9fbad10/6456ce4576abb2f391fbcc22_msi-surfaces-surprise-granite-xl-cyrus-dunite-oak-luxury-vinyl-planks-close-up.jpeg',
  '/flooring/xl-cyrus-dunite-oak-luxury-vinyl-planks',
  true,
  true,
  'Click Lock',
  'Lifetime',
  '10 Years',
  NOW()
) ON CONFLICT (sku) DO UPDATE SET
  wholesale_cost_sf = EXCLUDED.wholesale_cost_sf,
  wholesale_cost_box = EXCLUDED.wholesale_cost_box,
  last_price_update = NOW();

INSERT INTO flooring_products (
  sku, name, slug, vendor_id, brand, collection,
  type, dimensions, primary_color, wear_layer, thickness,
  sf_per_box, wholesale_cost_sf, wholesale_cost_box,
  primary_image, url, is_active, is_waterproof,
  installation_method, residential_warranty, commercial_warranty,
  last_price_update
) VALUES (
  'XL_CYRUS_EXOTIKA_LUXURY_VINYL_PLANKS',
  'XL Cyrus Exotika',
  'xl-cyrus-exotika-luxury-vinyl-planks',
  'msi',
  'MSI',
  'cyrus',
  'SPC',
  '7x48',
  'Multi',
  '12mil',
  '5mm',
  23.4,
  1.99,
  46.57,
  'https://cdn.prod.website-files.com/6456ce4476abb2d4f9fbad10/6456ce4576abb23531fbcc29_msi-surfaces-surprise-granite-xl-cyrus-exotika-luxury-vinyl-planks-close-up.jpeg',
  '/flooring/xl-cyrus-exotika-luxury-vinyl-planks',
  true,
  true,
  'Click Lock',
  'Lifetime',
  '10 Years',
  NOW()
) ON CONFLICT (sku) DO UPDATE SET
  wholesale_cost_sf = EXCLUDED.wholesale_cost_sf,
  wholesale_cost_box = EXCLUDED.wholesale_cost_box,
  last_price_update = NOW();

INSERT INTO flooring_products (
  sku, name, slug, vendor_id, brand, collection,
  type, dimensions, primary_color, wear_layer, thickness,
  sf_per_box, wholesale_cost_sf, wholesale_cost_box,
  primary_image, url, is_active, is_waterproof,
  installation_method, residential_warranty, commercial_warranty,
  last_price_update
) VALUES (
  'XL_CYRUS_FAUNA_LUXURY_VINYL_PLANKS',
  'XL Cyrus Fauna',
  'xl-cyrus-fauna-luxury-vinyl-planks',
  'msi',
  'MSI',
  'cyrus',
  'SPC',
  '7x48',
  'Multi',
  '12mil',
  '5mm',
  23.4,
  1.99,
  46.57,
  'https://cdn.prod.website-files.com/6456ce4476abb2d4f9fbad10/6456ce4576abb29503fbcc2d_msi-surfaces-surprise-granite-xl-cyrus-fauna-luxury-vinyl-planks-close-up.jpeg',
  '/flooring/xl-cyrus-fauna-luxury-vinyl-planks',
  true,
  true,
  'Click Lock',
  'Lifetime',
  '10 Years',
  NOW()
) ON CONFLICT (sku) DO UPDATE SET
  wholesale_cost_sf = EXCLUDED.wholesale_cost_sf,
  wholesale_cost_box = EXCLUDED.wholesale_cost_box,
  last_price_update = NOW();

INSERT INTO flooring_products (
  sku, name, slug, vendor_id, brand, collection,
  type, dimensions, primary_color, wear_layer, thickness,
  sf_per_box, wholesale_cost_sf, wholesale_cost_box,
  primary_image, url, is_active, is_waterproof,
  installation_method, residential_warranty, commercial_warranty,
  last_price_update
) VALUES (
  'XL_CYRUS_FINELY_LUXURY_VINYL_PLANKS',
  'XL Cyrus Finely',
  'xl-cyrus-finely-luxury-vinyl-planks',
  'msi',
  'MSI',
  'cyrus',
  'SPC',
  '7x48',
  'Multi',
  '12mil',
  '5mm',
  23.4,
  1.99,
  46.57,
  'https://cdn.prod.website-files.com/6456ce4476abb2d4f9fbad10/6456ce4576abb28758fbcc30_msi-surfaces-surprise-granite-xl-cyrus-finely-luxury-vinyl-planks-close-up.jpeg',
  '/flooring/xl-cyrus-finely-luxury-vinyl-planks',
  true,
  true,
  'Click Lock',
  'Lifetime',
  '10 Years',
  NOW()
) ON CONFLICT (sku) DO UPDATE SET
  wholesale_cost_sf = EXCLUDED.wholesale_cost_sf,
  wholesale_cost_box = EXCLUDED.wholesale_cost_box,
  last_price_update = NOW();

INSERT INTO flooring_products (
  sku, name, slug, vendor_id, brand, collection,
  type, dimensions, primary_color, wear_layer, thickness,
  sf_per_box, wholesale_cost_sf, wholesale_cost_box,
  primary_image, url, is_active, is_waterproof,
  installation_method, residential_warranty, commercial_warranty,
  last_price_update
) VALUES (
  'XL_CYRUS_GRAYTON_LUXURY_VINYL_PLANKS',
  'XL Cyrus Grayton',
  'xl-cyrus-grayton-luxury-vinyl-planks',
  'msi',
  'MSI',
  'cyrus',
  'SPC',
  '7x48',
  'Gray',
  '12mil',
  '5mm',
  23.4,
  1.99,
  46.57,
  'https://cdn.prod.website-files.com/6456ce4476abb2d4f9fbad10/6456ce4576abb22d85fbcc34_msi-surfaces-surprise-granite-xl-cyrus-grayton-luxury-vinyl-planks-close-up.jpeg',
  '/flooring/xl-cyrus-grayton-luxury-vinyl-planks',
  true,
  true,
  'Click Lock',
  'Lifetime',
  '10 Years',
  NOW()
) ON CONFLICT (sku) DO UPDATE SET
  wholesale_cost_sf = EXCLUDED.wholesale_cost_sf,
  wholesale_cost_box = EXCLUDED.wholesale_cost_box,
  last_price_update = NOW();

INSERT INTO flooring_products (
  sku, name, slug, vendor_id, brand, collection,
  type, dimensions, primary_color, wear_layer, thickness,
  sf_per_box, wholesale_cost_sf, wholesale_cost_box,
  primary_image, url, is_active, is_waterproof,
  installation_method, residential_warranty, commercial_warranty,
  last_price_update
) VALUES (
  'XL_CYRUS_HAWTHORNE_LUXURY_VINYL_PLANKS',
  'XL Cyrus Hawthorne',
  'xl-cyrus-hawthorne-luxury-vinyl-planks',
  'msi',
  'MSI',
  'cyrus',
  'SPC',
  '7x48',
  'Multi',
  '12mil',
  '5mm',
  23.4,
  1.99,
  46.57,
  'https://cdn.prod.website-files.com/6456ce4476abb2d4f9fbad10/6456ce4576abb2df6cfbcc39_msi-surfaces-surprise-granite-xl-cyrus-hawthorne-luxury-vinyl-planks-close-up.jpeg',
  '/flooring/xl-cyrus-hawthorne-luxury-vinyl-planks',
  true,
  true,
  'Click Lock',
  'Lifetime',
  '10 Years',
  NOW()
) ON CONFLICT (sku) DO UPDATE SET
  wholesale_cost_sf = EXCLUDED.wholesale_cost_sf,
  wholesale_cost_box = EXCLUDED.wholesale_cost_box,
  last_price_update = NOW();

INSERT INTO flooring_products (
  sku, name, slug, vendor_id, brand, collection,
  type, dimensions, primary_color, wear_layer, thickness,
  sf_per_box, wholesale_cost_sf, wholesale_cost_box,
  primary_image, url, is_active, is_waterproof,
  installation_method, residential_warranty, commercial_warranty,
  last_price_update
) VALUES (
  'XL_CYRUS_JENTA_LUXURY_VINYL_PLANKS',
  'XL Cyrus Jenta',
  'xl-cyrus-jenta-luxury-vinyl-planks',
  'msi',
  'MSI',
  'cyrus',
  'SPC',
  '7x48',
  'Multi',
  '12mil',
  '5mm',
  23.4,
  1.99,
  46.57,
  'https://cdn.prod.website-files.com/6456ce4476abb2d4f9fbad10/6456ce4576abb2eeb0fbcc3c_msi-surfaces-surprise-granite-xl-cyrus-jenta-luxury-vinyl-planks-close-up.jpeg',
  '/flooring/xl-cyrus-jenta-luxury-vinyl-planks',
  true,
  true,
  'Click Lock',
  'Lifetime',
  '10 Years',
  NOW()
) ON CONFLICT (sku) DO UPDATE SET
  wholesale_cost_sf = EXCLUDED.wholesale_cost_sf,
  wholesale_cost_box = EXCLUDED.wholesale_cost_box,
  last_price_update = NOW();

INSERT INTO flooring_products (
  sku, name, slug, vendor_id, brand, collection,
  type, dimensions, primary_color, wear_layer, thickness,
  sf_per_box, wholesale_cost_sf, wholesale_cost_box,
  primary_image, url, is_active, is_waterproof,
  installation_method, residential_warranty, commercial_warranty,
  last_price_update
) VALUES (
  'XL_CYRUS_KARDIGAN_LUXURY_VINYL_PLANKS',
  'XL Cyrus Kardigan',
  'xl-cyrus-kardigan-luxury-vinyl-planks',
  'msi',
  'MSI',
  'cyrus',
  'SPC',
  '7x48',
  'Multi',
  '12mil',
  '5mm',
  23.4,
  1.99,
  46.57,
  'https://cdn.prod.website-files.com/6456ce4476abb2d4f9fbad10/6456ce4576abb28c78fbcc58_msi-surfaces-surprise-granite-xl-cyrus-kardigan-luxury-vinyl-planks-close-up.jpeg',
  '/flooring/xl-cyrus-kardigan-luxury-vinyl-planks',
  true,
  true,
  'Click Lock',
  'Lifetime',
  '10 Years',
  NOW()
) ON CONFLICT (sku) DO UPDATE SET
  wholesale_cost_sf = EXCLUDED.wholesale_cost_sf,
  wholesale_cost_box = EXCLUDED.wholesale_cost_box,
  last_price_update = NOW();

INSERT INTO flooring_products (
  sku, name, slug, vendor_id, brand, collection,
  type, dimensions, primary_color, wear_layer, thickness,
  sf_per_box, wholesale_cost_sf, wholesale_cost_box,
  primary_image, url, is_active, is_waterproof,
  installation_method, residential_warranty, commercial_warranty,
  last_price_update
) VALUES (
  'XL_CYRUS_KATELLA_ASH_LUXURY_VINYL_PLANKS',
  'XL Cyrus Katella Ash',
  'xl-cyrus-katella-ash-luxury-vinyl-planks',
  'msi',
  'MSI',
  'cyrus',
  'SPC',
  '7x48',
  'Multi',
  '12mil',
  '5mm',
  23.4,
  1.99,
  46.57,
  'https://cdn.prod.website-files.com/6456ce4476abb2d4f9fbad10/6456ce4576abb28bd9fbcc5d_msi-surfaces-surprise-granite-xl-cyrus-katella-ash-luxury-vinyl-planks-close-up.jpeg',
  '/flooring/xl-cyrus-katella-ash-luxury-vinyl-planks',
  true,
  true,
  'Click Lock',
  'Lifetime',
  '10 Years',
  NOW()
) ON CONFLICT (sku) DO UPDATE SET
  wholesale_cost_sf = EXCLUDED.wholesale_cost_sf,
  wholesale_cost_box = EXCLUDED.wholesale_cost_box,
  last_price_update = NOW();

INSERT INTO flooring_products (
  sku, name, slug, vendor_id, brand, collection,
  type, dimensions, primary_color, wear_layer, thickness,
  sf_per_box, wholesale_cost_sf, wholesale_cost_box,
  primary_image, url, is_active, is_waterproof,
  installation_method, residential_warranty, commercial_warranty,
  last_price_update
) VALUES (
  'XL_CYRUS_LUDLOW_LUXURY_VINYL_PLANKS',
  'XL Cyrus Ludlow',
  'xl-cyrus-ludlow-luxury-vinyl-planks',
  'msi',
  'MSI',
  'cyrus',
  'SPC',
  '7x48',
  'Multi',
  '12mil',
  '5mm',
  23.4,
  1.99,
  46.57,
  'https://cdn.prod.website-files.com/6456ce4476abb2d4f9fbad10/6456ce4576abb241bcfbcc61_msi-surfaces-surprise-granite-xl-cyrus-ludlow-luxury-vinyl-planks-close-up.jpeg',
  '/flooring/xl-cyrus-ludlow-luxury-vinyl-planks',
  true,
  true,
  'Click Lock',
  'Lifetime',
  '10 Years',
  NOW()
) ON CONFLICT (sku) DO UPDATE SET
  wholesale_cost_sf = EXCLUDED.wholesale_cost_sf,
  wholesale_cost_box = EXCLUDED.wholesale_cost_box,
  last_price_update = NOW();

INSERT INTO flooring_products (
  sku, name, slug, vendor_id, brand, collection,
  type, dimensions, primary_color, wear_layer, thickness,
  sf_per_box, wholesale_cost_sf, wholesale_cost_box,
  primary_image, url, is_active, is_waterproof,
  installation_method, residential_warranty, commercial_warranty,
  last_price_update
) VALUES (
  'XL_CYRUS_MEZCLA_LUXURY_VINYL_PLANKS',
  'XL Cyrus Mezcla',
  'xl-cyrus-mezcla-luxury-vinyl-planks',
  'msi',
  'MSI',
  'cyrus',
  'SPC',
  '7x48',
  'Multi',
  '12mil',
  '5mm',
  23.4,
  1.99,
  46.57,
  'https://cdn.prod.website-files.com/6456ce4476abb2d4f9fbad10/6456ce4576abb24ba9fbcc65_msi-surfaces-surprise-granite-xl-cyrus-mezcla-luxury-vinyl-planks-close-up.jpeg',
  '/flooring/xl-cyrus-mezcla-luxury-vinyl-planks',
  true,
  true,
  'Click Lock',
  'Lifetime',
  '10 Years',
  NOW()
) ON CONFLICT (sku) DO UPDATE SET
  wholesale_cost_sf = EXCLUDED.wholesale_cost_sf,
  wholesale_cost_box = EXCLUDED.wholesale_cost_box,
  last_price_update = NOW();

INSERT INTO flooring_products (
  sku, name, slug, vendor_id, brand, collection,
  type, dimensions, primary_color, wear_layer, thickness,
  sf_per_box, wholesale_cost_sf, wholesale_cost_box,
  primary_image, url, is_active, is_waterproof,
  installation_method, residential_warranty, commercial_warranty,
  last_price_update
) VALUES (
  'XL_CYRUS_RUNMILL_ISLE_LUXURY_VINYL_PLANKS',
  'XL Cyrus Runmill Isle',
  'xl-cyrus-runmill-isle-luxury-vinyl-planks',
  'msi',
  'MSI',
  'cyrus',
  'SPC',
  '7x48',
  'Multi',
  '12mil',
  '5mm',
  23.4,
  1.99,
  46.57,
  'https://cdn.prod.website-files.com/6456ce4476abb2d4f9fbad10/6456ce4576abb22350fbcc66_msi-surfaces-surprise-granite-xl-cyrus-runmill-isle-luxury-vinyl-planks-close-up.jpeg',
  '/flooring/xl-cyrus-runmill-isle-luxury-vinyl-planks',
  true,
  true,
  'Click Lock',
  'Lifetime',
  '10 Years',
  NOW()
) ON CONFLICT (sku) DO UPDATE SET
  wholesale_cost_sf = EXCLUDED.wholesale_cost_sf,
  wholesale_cost_box = EXCLUDED.wholesale_cost_box,
  last_price_update = NOW();

INSERT INTO flooring_products (
  sku, name, slug, vendor_id, brand, collection,
  type, dimensions, primary_color, wear_layer, thickness,
  sf_per_box, wholesale_cost_sf, wholesale_cost_box,
  primary_image, url, is_active, is_waterproof,
  installation_method, residential_warranty, commercial_warranty,
  last_price_update
) VALUES (
  'XL_CYRUS_RYDER_LUXURY_VINYL_PLANKS',
  'XL Cyrus Ryder',
  'xl-cyrus-ryder-luxury-vinyl-planks',
  'msi',
  'MSI',
  'cyrus',
  'SPC',
  '7x48',
  'Multi',
  '12mil',
  '5mm',
  23.4,
  1.99,
  46.57,
  'https://cdn.prod.website-files.com/6456ce4476abb2d4f9fbad10/6456ce4576abb2e9f0fbcc6a_msi-surfaces-surprise-granite-xl-cyrus-ryder-luxury-vinyl-planks-close-up.jpeg',
  '/flooring/xl-cyrus-ryder-luxury-vinyl-planks',
  true,
  true,
  'Click Lock',
  'Lifetime',
  '10 Years',
  NOW()
) ON CONFLICT (sku) DO UPDATE SET
  wholesale_cost_sf = EXCLUDED.wholesale_cost_sf,
  wholesale_cost_box = EXCLUDED.wholesale_cost_box,
  last_price_update = NOW();

INSERT INTO flooring_products (
  sku, name, slug, vendor_id, brand, collection,
  type, dimensions, primary_color, wear_layer, thickness,
  sf_per_box, wholesale_cost_sf, wholesale_cost_box,
  primary_image, url, is_active, is_waterproof,
  installation_method, residential_warranty, commercial_warranty,
  last_price_update
) VALUES (
  'XL_CYRUS_SANDINO_LUXURY_VINYL_PLANKS',
  'XL Cyrus Sandino',
  'xl-cyrus-sandino-luxury-vinyl-planks',
  'msi',
  'MSI',
  'wilmont',
  'SPC',
  '7x48',
  'Multi',
  '20mil',
  '6.5mm',
  22,
  2.49,
  54.78,
  'https://cdn.prod.website-files.com/6456ce4476abb2d4f9fbad10/6456ce4576abb264f5fbcc6c_msi-surfaces-surprise-granite-xl-cyrus-sandino-luxury-vinyl-planks-close-up.jpeg',
  '/flooring/xl-cyrus-sandino-luxury-vinyl-planks',
  true,
  true,
  'Click Lock',
  'Lifetime',
  '10 Years',
  NOW()
) ON CONFLICT (sku) DO UPDATE SET
  wholesale_cost_sf = EXCLUDED.wholesale_cost_sf,
  wholesale_cost_box = EXCLUDED.wholesale_cost_box,
  last_price_update = NOW();

INSERT INTO flooring_products (
  sku, name, slug, vendor_id, brand, collection,
  type, dimensions, primary_color, wear_layer, thickness,
  sf_per_box, wholesale_cost_sf, wholesale_cost_box,
  primary_image, url, is_active, is_waterproof,
  installation_method, residential_warranty, commercial_warranty,
  last_price_update
) VALUES (
  'XL_CYRUS_STABLE_LUXURY_VINYL_PLANKS',
  'XL Cyrus Stable',
  'xl-cyrus-stable-luxury-vinyl-planks',
  'msi',
  'MSI',
  'cyrus',
  'SPC',
  '7x48',
  'Multi',
  '12mil',
  '5mm',
  23.4,
  1.99,
  46.57,
  'https://cdn.prod.website-files.com/6456ce4476abb2d4f9fbad10/6456ce4576abb2bd6bfbcc74_msi-surfaces-surprise-granite-xl-cyrus-stable-luxury-vinyl-planks-close-up.jpeg',
  '/flooring/xl-cyrus-stable-luxury-vinyl-planks',
  true,
  true,
  'Click Lock',
  'Lifetime',
  '10 Years',
  NOW()
) ON CONFLICT (sku) DO UPDATE SET
  wholesale_cost_sf = EXCLUDED.wholesale_cost_sf,
  wholesale_cost_box = EXCLUDED.wholesale_cost_box,
  last_price_update = NOW();

INSERT INTO flooring_products (
  sku, name, slug, vendor_id, brand, collection,
  type, dimensions, primary_color, wear_layer, thickness,
  sf_per_box, wholesale_cost_sf, wholesale_cost_box,
  primary_image, url, is_active, is_waterproof,
  installation_method, residential_warranty, commercial_warranty,
  last_price_update
) VALUES (
  'XL_CYRUS_WALNUT_WAVES_LUXURY_VINYL_PLANKS',
  'XL Cyrus Walnut Waves',
  'xl-cyrus-walnut-waves-luxury-vinyl-planks',
  'msi',
  'MSI',
  'cyrus',
  'SPC',
  '7x48',
  'Multi',
  '12mil',
  '5mm',
  23.4,
  1.99,
  46.57,
  'https://cdn.prod.website-files.com/6456ce4476abb2d4f9fbad10/6456ce4576abb23ae1fbcc76_msi-surfaces-surprise-granite-xl-cyrus-walnut-waves-luxury-vinyl-planks-close-up.jpeg',
  '/flooring/xl-cyrus-walnut-waves-luxury-vinyl-planks',
  true,
  true,
  'Click Lock',
  'Lifetime',
  '10 Years',
  NOW()
) ON CONFLICT (sku) DO UPDATE SET
  wholesale_cost_sf = EXCLUDED.wholesale_cost_sf,
  wholesale_cost_box = EXCLUDED.wholesale_cost_box,
  last_price_update = NOW();

INSERT INTO flooring_products (
  sku, name, slug, vendor_id, brand, collection,
  type, dimensions, primary_color, wear_layer, thickness,
  sf_per_box, wholesale_cost_sf, wholesale_cost_box,
  primary_image, url, is_active, is_waterproof,
  installation_method, residential_warranty, commercial_warranty,
  last_price_update
) VALUES (
  'XL_CYRUS_WEATHERED_BRINA_LUXURY_VINYL_PLANKS',
  'XL Cyrus Weathered Brina',
  'xl-cyrus-weathered-brina-luxury-vinyl-planks',
  'msi',
  'MSI',
  'cyrus',
  'SPC',
  '7x48',
  'Multi',
  '12mil',
  '5mm',
  23.4,
  1.99,
  46.57,
  'https://cdn.prod.website-files.com/6456ce4476abb2d4f9fbad10/6456ce4576abb29814fbcc7b_msi-surfaces-surprise-granite-xl-cyrus-weathered-brina-luxury-vinyl-planks-close-up.jpeg',
  '/flooring/xl-cyrus-weathered-brina-luxury-vinyl-planks',
  true,
  true,
  'Click Lock',
  'Lifetime',
  '10 Years',
  NOW()
) ON CONFLICT (sku) DO UPDATE SET
  wholesale_cost_sf = EXCLUDED.wholesale_cost_sf,
  wholesale_cost_box = EXCLUDED.wholesale_cost_box,
  last_price_update = NOW();

INSERT INTO flooring_products (
  sku, name, slug, vendor_id, brand, collection,
  type, dimensions, primary_color, wear_layer, thickness,
  sf_per_box, wholesale_cost_sf, wholesale_cost_box,
  primary_image, url, is_active, is_waterproof,
  installation_method, residential_warranty, commercial_warranty,
  last_price_update
) VALUES (
  'XL_CYRUS_WHITFIELD_GRAY_LUXURY_VINYL_PLANKS',
  'XL Cyrus Whitfield Gray',
  'xl-cyrus-whitfield-gray-luxury-vinyl-planks',
  'msi',
  'MSI',
  'wilmont',
  'SPC',
  '7x48',
  'Gray',
  '20mil',
  '6.5mm',
  22,
  2.49,
  54.78,
  'https://cdn.prod.website-files.com/6456ce4476abb2d4f9fbad10/6456ce4576abb271cefbcc7d_msi-surfaces-surprise-granite-xl-cyrus-whitfield-gray-luxury-vinyl-planks-close-up.jpeg',
  '/flooring/xl-cyrus-whitfield-gray-luxury-vinyl-planks',
  true,
  true,
  'Click Lock',
  'Lifetime',
  '10 Years',
  NOW()
) ON CONFLICT (sku) DO UPDATE SET
  wholesale_cost_sf = EXCLUDED.wholesale_cost_sf,
  wholesale_cost_box = EXCLUDED.wholesale_cost_box,
  last_price_update = NOW();

INSERT INTO flooring_products (
  sku, name, slug, vendor_id, brand, collection,
  type, dimensions, primary_color, wear_layer, thickness,
  sf_per_box, wholesale_cost_sf, wholesale_cost_box,
  primary_image, url, is_active, is_waterproof,
  installation_method, residential_warranty, commercial_warranty,
  last_price_update
) VALUES (
  'XL_CYRUS_WOBURN_ABBEY_LUXURY_VINYL_PLANKS',
  'XL Cyrus Woburn Abbey',
  'xl-cyrus-woburn-abbey-luxury-vinyl-planks',
  'msi',
  'MSI',
  'cyrus',
  'SPC',
  '7x48',
  'Multi',
  '12mil',
  '5mm',
  23.4,
  1.99,
  46.57,
  'https://cdn.prod.website-files.com/6456ce4476abb2d4f9fbad10/6456ce4576abb2aadafbcc83_msi-surfaces-surprise-granite-xl-cyrus-woburn-abbey-luxury-vinyl-planks-close-up.jpeg',
  '/flooring/xl-cyrus-woburn-abbey-luxury-vinyl-planks',
  true,
  true,
  'Click Lock',
  'Lifetime',
  '10 Years',
  NOW()
) ON CONFLICT (sku) DO UPDATE SET
  wholesale_cost_sf = EXCLUDED.wholesale_cost_sf,
  wholesale_cost_box = EXCLUDED.wholesale_cost_box,
  last_price_update = NOW();

INSERT INTO flooring_products (
  sku, name, slug, vendor_id, brand, collection,
  type, dimensions, primary_color, wear_layer, thickness,
  sf_per_box, wholesale_cost_sf, wholesale_cost_box,
  primary_image, url, is_active, is_waterproof,
  installation_method, residential_warranty, commercial_warranty,
  last_price_update
) VALUES (
  'XL_CYRUS_WOLFEBORO_LUXURY_VINYL_PLANKS',
  'XL Cyrus Wolfeboro',
  'xl-cyrus-wolfeboro-luxury-vinyl-planks',
  'msi',
  'MSI',
  'cyrus',
  'SPC',
  '7x48',
  'Multi',
  '12mil',
  '5mm',
  23.4,
  1.99,
  46.57,
  'https://cdn.prod.website-files.com/6456ce4476abb2d4f9fbad10/6456ce4576abb2bba3fbcc85_msi-surfaces-surprise-granite-xl-cyrus-wolfeboro-luxury-vinyl-planks-close-up.jpeg',
  '/flooring/xl-cyrus-wolfeboro-luxury-vinyl-planks',
  true,
  true,
  'Click Lock',
  'Lifetime',
  '10 Years',
  NOW()
) ON CONFLICT (sku) DO UPDATE SET
  wholesale_cost_sf = EXCLUDED.wholesale_cost_sf,
  wholesale_cost_box = EXCLUDED.wholesale_cost_box,
  last_price_update = NOW();

INSERT INTO flooring_products (
  sku, name, slug, vendor_id, brand, collection,
  type, dimensions, primary_color, wear_layer, thickness,
  sf_per_box, wholesale_cost_sf, wholesale_cost_box,
  primary_image, url, is_active, is_waterproof,
  installation_method, residential_warranty, commercial_warranty,
  last_price_update
) VALUES (
  'XL_PRESCOTT_AKADIA_LUXURY_VINYL_PLANKS',
  'XL Prescott Akadia',
  'xl-prescott-akadia-luxury-vinyl-planks',
  'msi',
  'MSI',
  'cyrus',
  'SPC',
  '7x48',
  'Multi',
  '12mil',
  '5mm',
  23.4,
  1.99,
  46.57,
  'https://cdn.prod.website-files.com/6456ce4476abb2d4f9fbad10/6456ce4576abb26bedfbcc8a_msi-surfaces-surprise-granite-xl-prescott-akadia-luxury-vinyl-planks-close-up.jpeg',
  '/flooring/xl-prescott-akadia-luxury-vinyl-planks',
  true,
  true,
  'Click Lock',
  'Lifetime',
  '10 Years',
  NOW()
) ON CONFLICT (sku) DO UPDATE SET
  wholesale_cost_sf = EXCLUDED.wholesale_cost_sf,
  wholesale_cost_box = EXCLUDED.wholesale_cost_box,
  last_price_update = NOW();

INSERT INTO flooring_products (
  sku, name, slug, vendor_id, brand, collection,
  type, dimensions, primary_color, wear_layer, thickness,
  sf_per_box, wholesale_cost_sf, wholesale_cost_box,
  primary_image, url, is_active, is_waterproof,
  installation_method, residential_warranty, commercial_warranty,
  last_price_update
) VALUES (
  'XL_PRESCOTT_BARRELL_LUXURY_VINYL_PLANKS',
  'XL Prescott Barrell',
  'xl-prescott-barrell-luxury-vinyl-planks',
  'msi',
  'MSI',
  'prescott',
  'SPC',
  '7x48',
  'Multi',
  '20mil',
  '6mm',
  23.4,
  2.69,
  62.95,
  'https://cdn.prod.website-files.com/6456ce4476abb2d4f9fbad10/6456ce4576abb276c2fbcc8b_msi-surfaces-surprise-granite-xl-prescott-barrell-luxury-vinyl-planks-close-up.jpeg',
  '/flooring/xl-prescott-barrell-luxury-vinyl-planks',
  true,
  true,
  'Click Lock',
  'Lifetime',
  '10 Years',
  NOW()
) ON CONFLICT (sku) DO UPDATE SET
  wholesale_cost_sf = EXCLUDED.wholesale_cost_sf,
  wholesale_cost_box = EXCLUDED.wholesale_cost_box,
  last_price_update = NOW();

INSERT INTO flooring_products (
  sku, name, slug, vendor_id, brand, collection,
  type, dimensions, primary_color, wear_layer, thickness,
  sf_per_box, wholesale_cost_sf, wholesale_cost_box,
  primary_image, url, is_active, is_waterproof,
  installation_method, residential_warranty, commercial_warranty,
  last_price_update
) VALUES (
  'XL_PRESCOTT_BEMBRIDGE_LUXURY_VINYL_PLANKS',
  'XL Prescott Bembridge',
  'xl-prescott-bembridge-luxury-vinyl-planks',
  'msi',
  'MSI',
  'cyrus',
  'SPC',
  '7x48',
  'Multi',
  '12mil',
  '5mm',
  23.4,
  1.99,
  46.57,
  'https://cdn.prod.website-files.com/6456ce4476abb2d4f9fbad10/6456ce4576abb2562ffbcc8e_msi-surfaces-surprise-granite-xl-prescott-bembridge-luxury-vinyl-planks-close-up.jpeg',
  '/flooring/xl-prescott-bembridge-luxury-vinyl-planks',
  true,
  true,
  'Click Lock',
  'Lifetime',
  '10 Years',
  NOW()
) ON CONFLICT (sku) DO UPDATE SET
  wholesale_cost_sf = EXCLUDED.wholesale_cost_sf,
  wholesale_cost_box = EXCLUDED.wholesale_cost_box,
  last_price_update = NOW();

INSERT INTO flooring_products (
  sku, name, slug, vendor_id, brand, collection,
  type, dimensions, primary_color, wear_layer, thickness,
  sf_per_box, wholesale_cost_sf, wholesale_cost_box,
  primary_image, url, is_active, is_waterproof,
  installation_method, residential_warranty, commercial_warranty,
  last_price_update
) VALUES (
  'XL_PRESCOTT_BILLINGHAM_LUXURY_VINYL_PLANKS',
  'XL Prescott Billingham',
  'xl-prescott-billingham-luxury-vinyl-planks',
  'msi',
  'MSI',
  'cyrus',
  'SPC',
  '7x48',
  'Multi',
  '12mil',
  '5mm',
  23.4,
  1.99,
  46.57,
  'https://cdn.prod.website-files.com/6456ce4476abb2d4f9fbad10/6456ce4576abb255c9fbcc8f_msi-surfaces-surprise-granite-xl-prescott-billingham-luxury-vinyl-planks-close-up.jpeg',
  '/flooring/xl-prescott-billingham-luxury-vinyl-planks',
  true,
  true,
  'Click Lock',
  'Lifetime',
  '10 Years',
  NOW()
) ON CONFLICT (sku) DO UPDATE SET
  wholesale_cost_sf = EXCLUDED.wholesale_cost_sf,
  wholesale_cost_box = EXCLUDED.wholesale_cost_box,
  last_price_update = NOW();

INSERT INTO flooring_products (
  sku, name, slug, vendor_id, brand, collection,
  type, dimensions, primary_color, wear_layer, thickness,
  sf_per_box, wholesale_cost_sf, wholesale_cost_box,
  primary_image, url, is_active, is_waterproof,
  installation_method, residential_warranty, commercial_warranty,
  last_price_update
) VALUES (
  'XL_PRESCOTT_BOSWELL_LUXURY_VINYL_PLANKS',
  'XL Prescott Boswell',
  'xl-prescott-boswell-luxury-vinyl-planks',
  'msi',
  'MSI',
  'prescott',
  'SPC',
  '7x48',
  'Multi',
  '20mil',
  '6mm',
  23.4,
  2.69,
  62.95,
  'https://cdn.prod.website-files.com/6456ce4476abb2d4f9fbad10/6456ce4576abb20370fbcc92_msi-surfaces-surprise-granite-xl-prescott-boswell-luxury-vinyl-planks-close-up.jpeg',
  '/flooring/xl-prescott-boswell-luxury-vinyl-planks',
  true,
  true,
  'Click Lock',
  'Lifetime',
  '10 Years',
  NOW()
) ON CONFLICT (sku) DO UPDATE SET
  wholesale_cost_sf = EXCLUDED.wholesale_cost_sf,
  wholesale_cost_box = EXCLUDED.wholesale_cost_box,
  last_price_update = NOW();

INSERT INTO flooring_products (
  sku, name, slug, vendor_id, brand, collection,
  type, dimensions, primary_color, wear_layer, thickness,
  sf_per_box, wholesale_cost_sf, wholesale_cost_box,
  primary_image, url, is_active, is_waterproof,
  installation_method, residential_warranty, commercial_warranty,
  last_price_update
) VALUES (
  'XL_PRESCOTT_BRACKEN_HILL_LUXURY_VINYL_PLANKS',
  'XL Prescott Bracken Hill',
  'xl-prescott-bracken-hill-luxury-vinyl-planks',
  'msi',
  'MSI',
  'cyrus',
  'SPC',
  '7x48',
  'Multi',
  '12mil',
  '5mm',
  23.4,
  1.99,
  46.57,
  'https://cdn.prod.website-files.com/6456ce4476abb2d4f9fbad10/6456ce4576abb21265fbcc93_msi-surfaces-surprise-granite-xl-prescott-bracken-hill-luxury-vinyl-planks-close-up.jpeg',
  '/flooring/xl-prescott-bracken-hill-luxury-vinyl-planks',
  true,
  true,
  'Click Lock',
  'Lifetime',
  '10 Years',
  NOW()
) ON CONFLICT (sku) DO UPDATE SET
  wholesale_cost_sf = EXCLUDED.wholesale_cost_sf,
  wholesale_cost_box = EXCLUDED.wholesale_cost_box,
  last_price_update = NOW();

INSERT INTO flooring_products (
  sku, name, slug, vendor_id, brand, collection,
  type, dimensions, primary_color, wear_layer, thickness,
  sf_per_box, wholesale_cost_sf, wholesale_cost_box,
  primary_image, url, is_active, is_waterproof,
  installation_method, residential_warranty, commercial_warranty,
  last_price_update
) VALUES (
  'XL_PRESCOTT_BRALY_LUXURY_VINYL_PLANKS',
  'XL Prescott Braly',
  'xl-prescott-braly-luxury-vinyl-planks',
  'msi',
  'MSI',
  'wilmont',
  'SPC',
  '7x48',
  'Multi',
  '20mil',
  '6.5mm',
  22,
  2.49,
  54.78,
  'https://cdn.prod.website-files.com/6456ce4476abb2d4f9fbad10/6456ce4576abb25e29fbcc96_msi-surfaces-surprise-granite-xl-prescott-braly-luxury-vinyl-planks-close-up.jpeg',
  '/flooring/xl-prescott-braly-luxury-vinyl-planks',
  true,
  true,
  'Click Lock',
  'Lifetime',
  '10 Years',
  NOW()
) ON CONFLICT (sku) DO UPDATE SET
  wholesale_cost_sf = EXCLUDED.wholesale_cost_sf,
  wholesale_cost_box = EXCLUDED.wholesale_cost_box,
  last_price_update = NOW();

INSERT INTO flooring_products (
  sku, name, slug, vendor_id, brand, collection,
  type, dimensions, primary_color, wear_layer, thickness,
  sf_per_box, wholesale_cost_sf, wholesale_cost_box,
  primary_image, url, is_active, is_waterproof,
  installation_method, residential_warranty, commercial_warranty,
  last_price_update
) VALUES (
  'XL_PRESCOTT_BRIANKA_LUXURY_VINYL_PLANKS',
  'XL Prescott Brianka',
  'xl-prescott-brianka-luxury-vinyl-planks',
  'msi',
  'MSI',
  'cyrus',
  'SPC',
  '7x48',
  'Multi',
  '12mil',
  '5mm',
  23.4,
  1.99,
  46.57,
  'https://cdn.prod.website-files.com/6456ce4476abb2d4f9fbad10/6456ce4576abb249e0fbcc97_msi-surfaces-surprise-granite-xl-prescott-brianka-luxury-vinyl-planks-close-up.jpeg',
  '/flooring/xl-prescott-brianka-luxury-vinyl-planks',
  true,
  true,
  'Click Lock',
  'Lifetime',
  '10 Years',
  NOW()
) ON CONFLICT (sku) DO UPDATE SET
  wholesale_cost_sf = EXCLUDED.wholesale_cost_sf,
  wholesale_cost_box = EXCLUDED.wholesale_cost_box,
  last_price_update = NOW();

INSERT INTO flooring_products (
  sku, name, slug, vendor_id, brand, collection,
  type, dimensions, primary_color, wear_layer, thickness,
  sf_per_box, wholesale_cost_sf, wholesale_cost_box,
  primary_image, url, is_active, is_waterproof,
  installation_method, residential_warranty, commercial_warranty,
  last_price_update
) VALUES (
  'XL_PRESCOTT_BROOKLINE_LUXURY_VINYL_PLANKS',
  'XL Prescott Brookline',
  'xl-prescott-brookline-luxury-vinyl-planks',
  'msi',
  'MSI',
  'prescott',
  'SPC',
  '7x48',
  'Multi',
  '20mil',
  '6mm',
  23.4,
  2.69,
  62.95,
  'https://cdn.prod.website-files.com/6456ce4476abb2d4f9fbad10/6456ce4576abb25e44fbcc99_msi-surfaces-surprise-granite-xl-prescott-brookline-luxury-vinyl-planks-close-up.jpeg',
  '/flooring/xl-prescott-brookline-luxury-vinyl-planks',
  true,
  true,
  'Click Lock',
  'Lifetime',
  '10 Years',
  NOW()
) ON CONFLICT (sku) DO UPDATE SET
  wholesale_cost_sf = EXCLUDED.wholesale_cost_sf,
  wholesale_cost_box = EXCLUDED.wholesale_cost_box,
  last_price_update = NOW();

INSERT INTO flooring_products (
  sku, name, slug, vendor_id, brand, collection,
  type, dimensions, primary_color, wear_layer, thickness,
  sf_per_box, wholesale_cost_sf, wholesale_cost_box,
  primary_image, url, is_active, is_waterproof,
  installation_method, residential_warranty, commercial_warranty,
  last_price_update
) VALUES (
  'XL_PRESCOTT_CRANTON_LUXURY_VINYL_PLANKS',
  'XL Prescott Cranton',
  'xl-prescott-cranton-luxury-vinyl-planks',
  'msi',
  'MSI',
  'prescott',
  'SPC',
  '7x48',
  'Multi',
  '20mil',
  '6mm',
  23.4,
  2.69,
  62.95,
  'https://cdn.prod.website-files.com/6456ce4476abb2d4f9fbad10/6456ce4576abb25bb5fbcc9a_msi-surfaces-surprise-granite-xl-prescott-cranton-luxury-vinyl-planks-close-up.jpeg',
  '/flooring/xl-prescott-cranton-luxury-vinyl-planks',
  true,
  true,
  'Click Lock',
  'Lifetime',
  '10 Years',
  NOW()
) ON CONFLICT (sku) DO UPDATE SET
  wholesale_cost_sf = EXCLUDED.wholesale_cost_sf,
  wholesale_cost_box = EXCLUDED.wholesale_cost_box,
  last_price_update = NOW();

INSERT INTO flooring_products (
  sku, name, slug, vendor_id, brand, collection,
  type, dimensions, primary_color, wear_layer, thickness,
  sf_per_box, wholesale_cost_sf, wholesale_cost_box,
  primary_image, url, is_active, is_waterproof,
  installation_method, residential_warranty, commercial_warranty,
  last_price_update
) VALUES (
  'XL_PRESCOTT_DRAVEN_LUXURY_VINYL_PLANKS',
  'XL Prescott Draven',
  'xl-prescott-draven-luxury-vinyl-planks',
  'msi',
  'MSI',
  'cyrus',
  'SPC',
  '7x48',
  'Multi',
  '12mil',
  '5mm',
  23.4,
  1.99,
  46.57,
  'https://cdn.prod.website-files.com/6456ce4476abb2d4f9fbad10/6456ce4576abb25e9dfbcc9c_msi-surfaces-surprise-granite-xl-prescott-draven-luxury-vinyl-planks-close-up.jpeg',
  '/flooring/xl-prescott-draven-luxury-vinyl-planks',
  true,
  true,
  'Click Lock',
  'Lifetime',
  '10 Years',
  NOW()
) ON CONFLICT (sku) DO UPDATE SET
  wholesale_cost_sf = EXCLUDED.wholesale_cost_sf,
  wholesale_cost_box = EXCLUDED.wholesale_cost_box,
  last_price_update = NOW();

INSERT INTO flooring_products (
  sku, name, slug, vendor_id, brand, collection,
  type, dimensions, primary_color, wear_layer, thickness,
  sf_per_box, wholesale_cost_sf, wholesale_cost_box,
  primary_image, url, is_active, is_waterproof,
  installation_method, residential_warranty, commercial_warranty,
  last_price_update
) VALUES (
  'XL_PRESCOTT_DUNITE_OAK_LUXURY_VINYL_PLANKS',
  'XL Prescott Dunite Oak',
  'xl-prescott-dunite-oak-luxury-vinyl-planks',
  'msi',
  'MSI',
  'cyrus',
  'SPC',
  '7x48',
  'Multi',
  '12mil',
  '5mm',
  23.4,
  1.99,
  46.57,
  'https://cdn.prod.website-files.com/6456ce4476abb2d4f9fbad10/6456ce4576abb2222cfbcc9e_msi-surfaces-surprise-granite-xl-prescott-dunite-oak-luxury-vinyl-planks-close-up.jpeg',
  '/flooring/xl-prescott-dunite-oak-luxury-vinyl-planks',
  true,
  true,
  'Click Lock',
  'Lifetime',
  '10 Years',
  NOW()
) ON CONFLICT (sku) DO UPDATE SET
  wholesale_cost_sf = EXCLUDED.wholesale_cost_sf,
  wholesale_cost_box = EXCLUDED.wholesale_cost_box,
  last_price_update = NOW();

INSERT INTO flooring_products (
  sku, name, slug, vendor_id, brand, collection,
  type, dimensions, primary_color, wear_layer, thickness,
  sf_per_box, wholesale_cost_sf, wholesale_cost_box,
  primary_image, url, is_active, is_waterproof,
  installation_method, residential_warranty, commercial_warranty,
  last_price_update
) VALUES (
  'XL_PRESCOTT_EXOTIKA_LUXURY_VINYL_PLANKS',
  'XL Prescott Exotika',
  'xl-prescott-exotika-luxury-vinyl-planks',
  'msi',
  'MSI',
  'cyrus',
  'SPC',
  '7x48',
  'Multi',
  '12mil',
  '5mm',
  23.4,
  1.99,
  46.57,
  'https://cdn.prod.website-files.com/6456ce4476abb2d4f9fbad10/6456ce4576abb28867fbcca0_msi-surfaces-surprise-granite-xl-prescott-exotika-luxury-vinyl-planks-close-up.jpeg',
  '/flooring/xl-prescott-exotika-luxury-vinyl-planks',
  true,
  true,
  'Click Lock',
  'Lifetime',
  '10 Years',
  NOW()
) ON CONFLICT (sku) DO UPDATE SET
  wholesale_cost_sf = EXCLUDED.wholesale_cost_sf,
  wholesale_cost_box = EXCLUDED.wholesale_cost_box,
  last_price_update = NOW();

INSERT INTO flooring_products (
  sku, name, slug, vendor_id, brand, collection,
  type, dimensions, primary_color, wear_layer, thickness,
  sf_per_box, wholesale_cost_sf, wholesale_cost_box,
  primary_image, url, is_active, is_waterproof,
  installation_method, residential_warranty, commercial_warranty,
  last_price_update
) VALUES (
  'XL_PRESCOTT_FAUNA_LUXURY_VINYL_PLANKS',
  'XL Prescott Fauna',
  'xl-prescott-fauna-luxury-vinyl-planks',
  'msi',
  'MSI',
  'cyrus',
  'SPC',
  '7x48',
  'Multi',
  '12mil',
  '5mm',
  23.4,
  1.99,
  46.57,
  'https://cdn.prod.website-files.com/6456ce4476abb2d4f9fbad10/6456ce4576abb267ddfbcca2_msi-surfaces-surprise-granite-xl-prescott-fauna-luxury-vinyl-planks-close-up.jpeg',
  '/flooring/xl-prescott-fauna-luxury-vinyl-planks',
  true,
  true,
  'Click Lock',
  'Lifetime',
  '10 Years',
  NOW()
) ON CONFLICT (sku) DO UPDATE SET
  wholesale_cost_sf = EXCLUDED.wholesale_cost_sf,
  wholesale_cost_box = EXCLUDED.wholesale_cost_box,
  last_price_update = NOW();

INSERT INTO flooring_products (
  sku, name, slug, vendor_id, brand, collection,
  type, dimensions, primary_color, wear_layer, thickness,
  sf_per_box, wholesale_cost_sf, wholesale_cost_box,
  primary_image, url, is_active, is_waterproof,
  installation_method, residential_warranty, commercial_warranty,
  last_price_update
) VALUES (
  'XL_PRESCOTT_FINELY_LUXURY_VINYL_PLANKS',
  'XL Prescott Finely',
  'xl-prescott-finely-luxury-vinyl-planks',
  'msi',
  'MSI',
  'cyrus',
  'SPC',
  '7x48',
  'Multi',
  '12mil',
  '5mm',
  23.4,
  1.99,
  46.57,
  'https://cdn.prod.website-files.com/6456ce4476abb2d4f9fbad10/6456ce4576abb2300dfbcca9_msi-surfaces-surprise-granite-xl-prescott-finely-luxury-vinyl-planks-close-up.jpeg',
  '/flooring/xl-prescott-finely-luxury-vinyl-planks',
  true,
  true,
  'Click Lock',
  'Lifetime',
  '10 Years',
  NOW()
) ON CONFLICT (sku) DO UPDATE SET
  wholesale_cost_sf = EXCLUDED.wholesale_cost_sf,
  wholesale_cost_box = EXCLUDED.wholesale_cost_box,
  last_price_update = NOW();

INSERT INTO flooring_products (
  sku, name, slug, vendor_id, brand, collection,
  type, dimensions, primary_color, wear_layer, thickness,
  sf_per_box, wholesale_cost_sf, wholesale_cost_box,
  primary_image, url, is_active, is_waterproof,
  installation_method, residential_warranty, commercial_warranty,
  last_price_update
) VALUES (
  'XL_PRESCOTT_GRAYTON_LUXURY_VINYL_PLANKS',
  'XL Prescott Grayton',
  'xl-prescott-grayton-luxury-vinyl-planks',
  'msi',
  'MSI',
  'prescott',
  'SPC',
  '7x48',
  'Gray',
  '20mil',
  '6mm',
  23.4,
  2.69,
  62.95,
  'https://cdn.prod.website-files.com/6456ce4476abb2d4f9fbad10/6456ce4576abb23822fbccac_msi-surfaces-surprise-granite-xl-prescott-grayton-luxury-vinyl-planks-close-up.jpeg',
  '/flooring/xl-prescott-grayton-luxury-vinyl-planks',
  true,
  true,
  'Click Lock',
  'Lifetime',
  '10 Years',
  NOW()
) ON CONFLICT (sku) DO UPDATE SET
  wholesale_cost_sf = EXCLUDED.wholesale_cost_sf,
  wholesale_cost_box = EXCLUDED.wholesale_cost_box,
  last_price_update = NOW();

INSERT INTO flooring_products (
  sku, name, slug, vendor_id, brand, collection,
  type, dimensions, primary_color, wear_layer, thickness,
  sf_per_box, wholesale_cost_sf, wholesale_cost_box,
  primary_image, url, is_active, is_waterproof,
  installation_method, residential_warranty, commercial_warranty,
  last_price_update
) VALUES (
  'XL_PRESCOTT_HAWTHORNE_LUXURY_VINYL_PLANKS',
  'XL Prescott Hawthorne',
  'xl-prescott-hawthorne-luxury-vinyl-planks',
  'msi',
  'MSI',
  'prescott',
  'SPC',
  '7x48',
  'Multi',
  '20mil',
  '6mm',
  23.4,
  2.69,
  62.95,
  'https://cdn.prod.website-files.com/6456ce4476abb2d4f9fbad10/6456ce4576abb26eb5fbccad_msi-surfaces-surprise-granite-xl-prescott-hawthorne-luxury-vinyl-planks-close-up.jpeg',
  '/flooring/xl-prescott-hawthorne-luxury-vinyl-planks',
  true,
  true,
  'Click Lock',
  'Lifetime',
  '10 Years',
  NOW()
) ON CONFLICT (sku) DO UPDATE SET
  wholesale_cost_sf = EXCLUDED.wholesale_cost_sf,
  wholesale_cost_box = EXCLUDED.wholesale_cost_box,
  last_price_update = NOW();

INSERT INTO flooring_products (
  sku, name, slug, vendor_id, brand, collection,
  type, dimensions, primary_color, wear_layer, thickness,
  sf_per_box, wholesale_cost_sf, wholesale_cost_box,
  primary_image, url, is_active, is_waterproof,
  installation_method, residential_warranty, commercial_warranty,
  last_price_update
) VALUES (
  'XL_PRESCOTT_JENTA_LUXURY_VINYL_PLANKS',
  'XL Prescott Jenta',
  'xl-prescott-jenta-luxury-vinyl-planks',
  'msi',
  'MSI',
  'prescott',
  'SPC',
  '7x48',
  'Multi',
  '20mil',
  '6mm',
  23.4,
  2.69,
  62.95,
  'https://cdn.prod.website-files.com/6456ce4476abb2d4f9fbad10/6456ce4576abb21b21fbccb4_msi-surfaces-surprise-granite-xl-prescott-jenta-luxury-vinyl-planks-close-up.jpeg',
  '/flooring/xl-prescott-jenta-luxury-vinyl-planks',
  true,
  true,
  'Click Lock',
  'Lifetime',
  '10 Years',
  NOW()
) ON CONFLICT (sku) DO UPDATE SET
  wholesale_cost_sf = EXCLUDED.wholesale_cost_sf,
  wholesale_cost_box = EXCLUDED.wholesale_cost_box,
  last_price_update = NOW();

INSERT INTO flooring_products (
  sku, name, slug, vendor_id, brand, collection,
  type, dimensions, primary_color, wear_layer, thickness,
  sf_per_box, wholesale_cost_sf, wholesale_cost_box,
  primary_image, url, is_active, is_waterproof,
  installation_method, residential_warranty, commercial_warranty,
  last_price_update
) VALUES (
  'XL_PRESCOTT_KARDIGAN_LUXURY_VINYL_PLANKS',
  'XL Prescott Kardigan',
  'xl-prescott-kardigan-luxury-vinyl-planks',
  'msi',
  'MSI',
  'prescott',
  'SPC',
  '7x48',
  'Multi',
  '20mil',
  '6mm',
  23.4,
  2.69,
  62.95,
  'https://cdn.prod.website-files.com/6456ce4476abb2d4f9fbad10/6456ce4576abb212fafbccb6_msi-surfaces-surprise-granite-xl-prescott--kardigan-luxury-vinyl-planks-close-up.jpeg',
  '/flooring/xl-prescott-kardigan-luxury-vinyl-planks',
  true,
  true,
  'Click Lock',
  'Lifetime',
  '10 Years',
  NOW()
) ON CONFLICT (sku) DO UPDATE SET
  wholesale_cost_sf = EXCLUDED.wholesale_cost_sf,
  wholesale_cost_box = EXCLUDED.wholesale_cost_box,
  last_price_update = NOW();

INSERT INTO flooring_products (
  sku, name, slug, vendor_id, brand, collection,
  type, dimensions, primary_color, wear_layer, thickness,
  sf_per_box, wholesale_cost_sf, wholesale_cost_box,
  primary_image, url, is_active, is_waterproof,
  installation_method, residential_warranty, commercial_warranty,
  last_price_update
) VALUES (
  'XL_PRESCOTT_KATELLA_ASH_LUXURY_VINYL_PLANKS',
  'XL Prescott Katella Ash',
  'xl-prescott-katella-ash-luxury-vinyl-planks',
  'msi',
  'MSI',
  'prescott',
  'SPC',
  '7x48',
  'Multi',
  '20mil',
  '6mm',
  23.4,
  2.69,
  62.95,
  'https://cdn.prod.website-files.com/6456ce4476abb2d4f9fbad10/6456ce4576abb2311efbccb9_msi-surfaces-surprise-granite-xl-prescott-katella-luxury-vinyl-planks-close-up.jpeg',
  '/flooring/xl-prescott-katella-ash-luxury-vinyl-planks',
  true,
  true,
  'Click Lock',
  'Lifetime',
  '10 Years',
  NOW()
) ON CONFLICT (sku) DO UPDATE SET
  wholesale_cost_sf = EXCLUDED.wholesale_cost_sf,
  wholesale_cost_box = EXCLUDED.wholesale_cost_box,
  last_price_update = NOW();

INSERT INTO flooring_products (
  sku, name, slug, vendor_id, brand, collection,
  type, dimensions, primary_color, wear_layer, thickness,
  sf_per_box, wholesale_cost_sf, wholesale_cost_box,
  primary_image, url, is_active, is_waterproof,
  installation_method, residential_warranty, commercial_warranty,
  last_price_update
) VALUES (
  'XL_PRESCOTT_LUDLOW_LUXURY_VINYL_PLANKS',
  'XL Prescott Ludlow',
  'xl-prescott-ludlow-luxury-vinyl-planks',
  'msi',
  'MSI',
  'cyrus',
  'SPC',
  '7x48',
  'Multi',
  '12mil',
  '5mm',
  23.4,
  1.99,
  46.57,
  'https://cdn.prod.website-files.com/6456ce4476abb2d4f9fbad10/6456ce4576abb22a16fbccba_msi-surfaces-surprise-granite-xl-prescott-ludlow-luxury-vinyl-planks-close-up.jpeg',
  '/flooring/xl-prescott-ludlow-luxury-vinyl-planks',
  true,
  true,
  'Click Lock',
  'Lifetime',
  '10 Years',
  NOW()
) ON CONFLICT (sku) DO UPDATE SET
  wholesale_cost_sf = EXCLUDED.wholesale_cost_sf,
  wholesale_cost_box = EXCLUDED.wholesale_cost_box,
  last_price_update = NOW();

INSERT INTO flooring_products (
  sku, name, slug, vendor_id, brand, collection,
  type, dimensions, primary_color, wear_layer, thickness,
  sf_per_box, wholesale_cost_sf, wholesale_cost_box,
  primary_image, url, is_active, is_waterproof,
  installation_method, residential_warranty, commercial_warranty,
  last_price_update
) VALUES (
  'XL_PRESCOTT_MEZCLA_LUXURY_VINYL_PLANKS',
  'XL Prescott Mezcla',
  'xl-prescott-mezcla-luxury-vinyl-planks',
  'msi',
  'MSI',
  'cyrus',
  'SPC',
  '7x48',
  'Multi',
  '12mil',
  '5mm',
  23.4,
  1.99,
  46.57,
  'https://cdn.prod.website-files.com/6456ce4476abb2d4f9fbad10/6456ce4576abb22ef2fbccbc_msi-surfaces-surprise-granite-xl-prescott-mezcla-luxury-vinyl-planks-close-up.jpeg',
  '/flooring/xl-prescott-mezcla-luxury-vinyl-planks',
  true,
  true,
  'Click Lock',
  'Lifetime',
  '10 Years',
  NOW()
) ON CONFLICT (sku) DO UPDATE SET
  wholesale_cost_sf = EXCLUDED.wholesale_cost_sf,
  wholesale_cost_box = EXCLUDED.wholesale_cost_box,
  last_price_update = NOW();

INSERT INTO flooring_products (
  sku, name, slug, vendor_id, brand, collection,
  type, dimensions, primary_color, wear_layer, thickness,
  sf_per_box, wholesale_cost_sf, wholesale_cost_box,
  primary_image, url, is_active, is_waterproof,
  installation_method, residential_warranty, commercial_warranty,
  last_price_update
) VALUES (
  'XL_PRESCOTT_RUNMILL_ISLE_LUXURY_VINYL_PLANKS',
  'XL Prescott Runmill Isle',
  'xl-prescott-runmill-isle-luxury-vinyl-planks',
  'msi',
  'MSI',
  'prescott',
  'SPC',
  '7x48',
  'Multi',
  '20mil',
  '6mm',
  23.4,
  2.69,
  62.95,
  'https://cdn.prod.website-files.com/6456ce4476abb2d4f9fbad10/6456ce4576abb22350fbcc66_msi-surfaces-surprise-granite-xl-cyrus-runmill-isle-luxury-vinyl-planks-close-up.jpeg',
  '/flooring/xl-prescott-runmill-isle-luxury-vinyl-planks',
  true,
  true,
  'Click Lock',
  'Lifetime',
  '10 Years',
  NOW()
) ON CONFLICT (sku) DO UPDATE SET
  wholesale_cost_sf = EXCLUDED.wholesale_cost_sf,
  wholesale_cost_box = EXCLUDED.wholesale_cost_box,
  last_price_update = NOW();

INSERT INTO flooring_products (
  sku, name, slug, vendor_id, brand, collection,
  type, dimensions, primary_color, wear_layer, thickness,
  sf_per_box, wholesale_cost_sf, wholesale_cost_box,
  primary_image, url, is_active, is_waterproof,
  installation_method, residential_warranty, commercial_warranty,
  last_price_update
) VALUES (
  'XL_PRESCOTT_RYDER_LUXURY_VINYL_PLANKS',
  'XL Prescott Ryder',
  'xl-prescott-ryder-luxury-vinyl-planks',
  'msi',
  'MSI',
  'cyrus',
  'SPC',
  '7x48',
  'Multi',
  '12mil',
  '5mm',
  23.4,
  1.99,
  46.57,
  'https://cdn.prod.website-files.com/6456ce4476abb2d4f9fbad10/6456ce4576abb20aa2fbccc0_msi-surfaces-surprise-granite-xl-prescott-ryder-luxury-vinyl-planks-close-up.jpeg',
  '/flooring/xl-prescott-ryder-luxury-vinyl-planks',
  true,
  true,
  'Click Lock',
  'Lifetime',
  '10 Years',
  NOW()
) ON CONFLICT (sku) DO UPDATE SET
  wholesale_cost_sf = EXCLUDED.wholesale_cost_sf,
  wholesale_cost_box = EXCLUDED.wholesale_cost_box,
  last_price_update = NOW();

INSERT INTO flooring_products (
  sku, name, slug, vendor_id, brand, collection,
  type, dimensions, primary_color, wear_layer, thickness,
  sf_per_box, wholesale_cost_sf, wholesale_cost_box,
  primary_image, url, is_active, is_waterproof,
  installation_method, residential_warranty, commercial_warranty,
  last_price_update
) VALUES (
  'XL_PRESCOTT_SANDINO_LUXURY_VINYL_PLANKS',
  'XL Prescott Sandino',
  'xl-prescott-sandino-luxury-vinyl-planks',
  'msi',
  'MSI',
  'wilmont',
  'SPC',
  '7x48',
  'Multi',
  '20mil',
  '6.5mm',
  22,
  2.49,
  54.78,
  'https://cdn.prod.website-files.com/6456ce4476abb2d4f9fbad10/6456ce4576abb27bd4fbccc1_msi-surfaces-surprise-granite-xl-prescott-sandino-luxury-vinyl-planks-close-up.jpeg',
  '/flooring/xl-prescott-sandino-luxury-vinyl-planks',
  true,
  true,
  'Click Lock',
  'Lifetime',
  '10 Years',
  NOW()
) ON CONFLICT (sku) DO UPDATE SET
  wholesale_cost_sf = EXCLUDED.wholesale_cost_sf,
  wholesale_cost_box = EXCLUDED.wholesale_cost_box,
  last_price_update = NOW();

INSERT INTO flooring_products (
  sku, name, slug, vendor_id, brand, collection,
  type, dimensions, primary_color, wear_layer, thickness,
  sf_per_box, wholesale_cost_sf, wholesale_cost_box,
  primary_image, url, is_active, is_waterproof,
  installation_method, residential_warranty, commercial_warranty,
  last_price_update
) VALUES (
  'XL_PRESCOTT_STABLE_LUXURY_VINYL_PLANKS',
  'XL Prescott Stable',
  'xl-prescott-stable-luxury-vinyl-planks',
  'msi',
  'MSI',
  'prescott',
  'SPC',
  '7x48',
  'Multi',
  '20mil',
  '6mm',
  23.4,
  2.69,
  62.95,
  'https://cdn.prod.website-files.com/6456ce4476abb2d4f9fbad10/6456ce4576abb2489dfbccc3_msi-surfaces-surprise-granite-xl-prescott-stable-luxury-vinyl-planks-close-up.jpeg',
  '/flooring/xl-prescott-stable-luxury-vinyl-planks',
  true,
  true,
  'Click Lock',
  'Lifetime',
  '10 Years',
  NOW()
) ON CONFLICT (sku) DO UPDATE SET
  wholesale_cost_sf = EXCLUDED.wholesale_cost_sf,
  wholesale_cost_box = EXCLUDED.wholesale_cost_box,
  last_price_update = NOW();

INSERT INTO flooring_products (
  sku, name, slug, vendor_id, brand, collection,
  type, dimensions, primary_color, wear_layer, thickness,
  sf_per_box, wholesale_cost_sf, wholesale_cost_box,
  primary_image, url, is_active, is_waterproof,
  installation_method, residential_warranty, commercial_warranty,
  last_price_update
) VALUES (
  'XL_PRESCOTT_WALNUT_WAVES_LUXURY_VINYL_PLANKS',
  'XL Prescott Walnut Waves',
  'xl-prescott-walnut-waves-luxury-vinyl-planks',
  'msi',
  'MSI',
  'prescott',
  'SPC',
  '7x48',
  'Multi',
  '20mil',
  '6mm',
  23.4,
  2.69,
  62.95,
  'https://cdn.prod.website-files.com/6456ce4476abb2d4f9fbad10/6456ce4576abb25ef6fbccc6_msi-surfaces-surprise-granite-xl-prescott-walnut-waves-luxury-vinyl-planks-close-up.jpeg',
  '/flooring/xl-prescott-walnut-waves-luxury-vinyl-planks',
  true,
  true,
  'Click Lock',
  'Lifetime',
  '10 Years',
  NOW()
) ON CONFLICT (sku) DO UPDATE SET
  wholesale_cost_sf = EXCLUDED.wholesale_cost_sf,
  wholesale_cost_box = EXCLUDED.wholesale_cost_box,
  last_price_update = NOW();

INSERT INTO flooring_products (
  sku, name, slug, vendor_id, brand, collection,
  type, dimensions, primary_color, wear_layer, thickness,
  sf_per_box, wholesale_cost_sf, wholesale_cost_box,
  primary_image, url, is_active, is_waterproof,
  installation_method, residential_warranty, commercial_warranty,
  last_price_update
) VALUES (
  'XL_PRESCOTT_WEATHERED_BRINA_LUXURY_VINYL_PLANKS',
  'XL Prescott Weathered Brina',
  'xl-prescott-weathered-brina-luxury-vinyl-planks',
  'msi',
  'MSI',
  'prescott',
  'SPC',
  '7x48',
  'Multi',
  '20mil',
  '6mm',
  23.4,
  2.69,
  62.95,
  'https://cdn.prod.website-files.com/6456ce4476abb2d4f9fbad10/6456ce4576abb26a50fbccc8_msi-surfaces-surprise-granite-xl-prescott-weathered-brina-luxury-vinyl-planks-close-up.jpeg',
  '/flooring/xl-prescott-weathered-brina-luxury-vinyl-planks',
  true,
  true,
  'Click Lock',
  'Lifetime',
  '10 Years',
  NOW()
) ON CONFLICT (sku) DO UPDATE SET
  wholesale_cost_sf = EXCLUDED.wholesale_cost_sf,
  wholesale_cost_box = EXCLUDED.wholesale_cost_box,
  last_price_update = NOW();

INSERT INTO flooring_products (
  sku, name, slug, vendor_id, brand, collection,
  type, dimensions, primary_color, wear_layer, thickness,
  sf_per_box, wholesale_cost_sf, wholesale_cost_box,
  primary_image, url, is_active, is_waterproof,
  installation_method, residential_warranty, commercial_warranty,
  last_price_update
) VALUES (
  'XL_PRESCOTT_WHITFIELD_GRAY_LUXURY_VINYL_PLANKS',
  'XL Prescott Whitfield Gray',
  'xl-prescott-whitfield-gray-luxury-vinyl-planks',
  'msi',
  'MSI',
  'wilmont',
  'SPC',
  '7x48',
  'Gray',
  '20mil',
  '6.5mm',
  22,
  2.49,
  54.78,
  'https://cdn.prod.website-files.com/6456ce4476abb2d4f9fbad10/6456ce4576abb2302afbccc9_msi-surfaces-surprise-granite-xl-prescott-whitfield-gray-luxury-vinyl-planks-close-up.jpeg',
  '/flooring/xl-prescott-whitfield-gray-luxury-vinyl-planks',
  true,
  true,
  'Click Lock',
  'Lifetime',
  '10 Years',
  NOW()
) ON CONFLICT (sku) DO UPDATE SET
  wholesale_cost_sf = EXCLUDED.wholesale_cost_sf,
  wholesale_cost_box = EXCLUDED.wholesale_cost_box,
  last_price_update = NOW();

INSERT INTO flooring_products (
  sku, name, slug, vendor_id, brand, collection,
  type, dimensions, primary_color, wear_layer, thickness,
  sf_per_box, wholesale_cost_sf, wholesale_cost_box,
  primary_image, url, is_active, is_waterproof,
  installation_method, residential_warranty, commercial_warranty,
  last_price_update
) VALUES (
  'XL_PRESCOTT_WOBURN_ABBEY_LUXURY_VINYL_PLANKS',
  'XL Prescott Woburn Abbey',
  'xl-prescott-woburn-abbey-luxury-vinyl-planks',
  'msi',
  'MSI',
  'prescott',
  'SPC',
  '7x48',
  'Multi',
  '20mil',
  '6mm',
  23.4,
  2.69,
  62.95,
  'https://cdn.prod.website-files.com/6456ce4476abb2d4f9fbad10/6456ce4576abb2f28ffbcccb_msi-surfaces-surprise-granite-xl-prescott-woburn-abbey-luxury-vinyl-planks-close-up.jpeg',
  '/flooring/xl-prescott-woburn-abbey-luxury-vinyl-planks',
  true,
  true,
  'Click Lock',
  'Lifetime',
  '10 Years',
  NOW()
) ON CONFLICT (sku) DO UPDATE SET
  wholesale_cost_sf = EXCLUDED.wholesale_cost_sf,
  wholesale_cost_box = EXCLUDED.wholesale_cost_box,
  last_price_update = NOW();

INSERT INTO flooring_products (
  sku, name, slug, vendor_id, brand, collection,
  type, dimensions, primary_color, wear_layer, thickness,
  sf_per_box, wholesale_cost_sf, wholesale_cost_box,
  primary_image, url, is_active, is_waterproof,
  installation_method, residential_warranty, commercial_warranty,
  last_price_update
) VALUES (
  'XL_PRESCOTT_WOLFEBORO_LUXURY_VINYL_PLANKS',
  'XL Prescott Wolfeboro',
  'xl-prescott-wolfeboro-luxury-vinyl-planks',
  'msi',
  'MSI',
  'cyrus',
  'SPC',
  '7x48',
  'Multi',
  '12mil',
  '5mm',
  23.4,
  1.99,
  46.57,
  'https://cdn.prod.website-files.com/6456ce4476abb2d4f9fbad10/6456ce4576abb20845fbcccd_msi-surfaces-surprise-granite-xl-prescott-wolfeboro-luxury-vinyl-planks-close-up.jpeg',
  '/flooring/xl-prescott-wolfeboro-luxury-vinyl-planks',
  true,
  true,
  'Click Lock',
  'Lifetime',
  '10 Years',
  NOW()
) ON CONFLICT (sku) DO UPDATE SET
  wholesale_cost_sf = EXCLUDED.wholesale_cost_sf,
  wholesale_cost_box = EXCLUDED.wholesale_cost_box,
  last_price_update = NOW();

INSERT INTO flooring_products (
  sku, name, slug, vendor_id, brand, collection,
  type, dimensions, primary_color, wear_layer, thickness,
  sf_per_box, wholesale_cost_sf, wholesale_cost_box,
  primary_image, url, is_active, is_waterproof,
  installation_method, residential_warranty, commercial_warranty,
  last_price_update
) VALUES (
  'XL_TRECENTO_CALACATTA_LEGEND_LUXURY_VINYL_TILE',
  'XL Trecento Calacatta Legend',
  'xl-trecento-calacatta-legend-luxury-vinyl-tile',
  'msi',
  'MSI',
  'unknown',
  'Luxury Vinyl',
  '7x48',
  'Multi',
  '20mil',
  '5.5mm',
  22,
  2.29,
  50.38,
  'https://cdn.prod.website-files.com/6456ce4476abb2d4f9fbad10/6456ce4576abb234dafbcb6f_msi-surfaces-surprise-granite-calacatta-legend-luxury-vinyl-planks-close-up.jpeg',
  '/flooring/xl-trecento-calacatta-legend-luxury-vinyl-tile',
  true,
  true,
  'Click Lock',
  'Lifetime',
  '10 Years',
  NOW()
) ON CONFLICT (sku) DO UPDATE SET
  wholesale_cost_sf = EXCLUDED.wholesale_cost_sf,
  wholesale_cost_box = EXCLUDED.wholesale_cost_box,
  last_price_update = NOW();

INSERT INTO flooring_products (
  sku, name, slug, vendor_id, brand, collection,
  type, dimensions, primary_color, wear_layer, thickness,
  sf_per_box, wholesale_cost_sf, wholesale_cost_box,
  primary_image, url, is_active, is_waterproof,
  installation_method, residential_warranty, commercial_warranty,
  last_price_update
) VALUES (
  'XL_TRECENTO_CALACATTA_MARBELLO_LUXURY_VINYL_TILE',
  'XL Trecento Calacatta Marbello',
  'xl-trecento-calacatta-marbello-luxury-vinyl-tile',
  'msi',
  'MSI',
  'unknown',
  'Luxury Vinyl',
  '7x48',
  'Multi',
  '20mil',
  '5.5mm',
  22,
  2.29,
  50.38,
  'https://cdn.prod.website-files.com/6456ce4476abb2d4f9fbad10/6456ce4576abb24dabfbccd0_msi-surfaces-surprise-granite-xl-trecento-calacatta-marbello-luxury-vinyl-planks-close-up.jpeg',
  '/flooring/xl-trecento-calacatta-marbello-luxury-vinyl-tile',
  true,
  true,
  'Click Lock',
  'Lifetime',
  '10 Years',
  NOW()
) ON CONFLICT (sku) DO UPDATE SET
  wholesale_cost_sf = EXCLUDED.wholesale_cost_sf,
  wholesale_cost_box = EXCLUDED.wholesale_cost_box,
  last_price_update = NOW();

INSERT INTO flooring_products (
  sku, name, slug, vendor_id, brand, collection,
  type, dimensions, primary_color, wear_layer, thickness,
  sf_per_box, wholesale_cost_sf, wholesale_cost_box,
  primary_image, url, is_active, is_waterproof,
  installation_method, residential_warranty, commercial_warranty,
  last_price_update
) VALUES (
  'XL_TRECENTO_CALACATTA_SERRA_LUXURY_VINYL_TILE',
  'XL Trecento Calacatta Serra',
  'xl-trecento-calacatta-serra-luxury-vinyl-tile',
  'msi',
  'MSI',
  'unknown',
  'Luxury Vinyl',
  '7x48',
  'Multi',
  '20mil',
  '5.5mm',
  22,
  2.29,
  50.38,
  'https://cdn.prod.website-files.com/6456ce4476abb2d4f9fbad10/6456ce4576abb2cc25fbcb7f_msi-surfaces-surprise-granite-calacatta-serra-luxury-vinyl-planks-close-up.jpeg',
  '/flooring/xl-trecento-calacatta-serra-luxury-vinyl-tile',
  true,
  true,
  'Click Lock',
  'Lifetime',
  '10 Years',
  NOW()
) ON CONFLICT (sku) DO UPDATE SET
  wholesale_cost_sf = EXCLUDED.wholesale_cost_sf,
  wholesale_cost_box = EXCLUDED.wholesale_cost_box,
  last_price_update = NOW();

INSERT INTO flooring_products (
  sku, name, slug, vendor_id, brand, collection,
  type, dimensions, primary_color, wear_layer, thickness,
  sf_per_box, wholesale_cost_sf, wholesale_cost_box,
  primary_image, url, is_active, is_waterproof,
  installation_method, residential_warranty, commercial_warranty,
  last_price_update
) VALUES (
  'XL_TRECENTO_CALACATTA_VENOSA_GOLD_LUXURY_VINYL_TILE',
  'XL Trecento Calacatta Venosa Gold',
  'xl-trecento-calacatta-venosa-gold-luxury-vinyl-tile',
  'msi',
  'MSI',
  'unknown',
  'Luxury Vinyl',
  '7x48',
  'Gold',
  '20mil',
  '5.5mm',
  22,
  2.29,
  50.38,
  'https://cdn.prod.website-files.com/6456ce4476abb2d4f9fbad10/6456ce4576abb233dbfbcb80_msi-surfaces-surprise-granite-calacatta-venosa-gold-luxury-vinyl-planks-close-up.jpeg',
  '/flooring/xl-trecento-calacatta-venosa-gold-luxury-vinyl-tile',
  true,
  true,
  'Click Lock',
  'Lifetime',
  '10 Years',
  NOW()
) ON CONFLICT (sku) DO UPDATE SET
  wholesale_cost_sf = EXCLUDED.wholesale_cost_sf,
  wholesale_cost_box = EXCLUDED.wholesale_cost_box,
  last_price_update = NOW();

INSERT INTO flooring_products (
  sku, name, slug, vendor_id, brand, collection,
  type, dimensions, primary_color, wear_layer, thickness,
  sf_per_box, wholesale_cost_sf, wholesale_cost_box,
  primary_image, url, is_active, is_waterproof,
  installation_method, residential_warranty, commercial_warranty,
  last_price_update
) VALUES (
  'XL_TRECENTO_CARRARA_AVELL_LUXURY_VINYL_TILE',
  'XL Trecento Carrara Avell',
  'xl-trecento-carrara-avell-luxury-vinyl-tile',
  'msi',
  'MSI',
  'unknown',
  'Luxury Vinyl',
  '7x48',
  'Multi',
  '20mil',
  '5.5mm',
  22,
  2.29,
  50.38,
  'https://cdn.prod.website-files.com/6456ce4476abb2d4f9fbad10/6456ce4576abb2ebb6fbccd4_msi-surfaces-surprise-granite-xl-trecento-carrara-avell-luxury-vinyl-tile-close-up.jpeg',
  '/flooring/xl-trecento-carrara-avell-luxury-vinyl-tile',
  true,
  true,
  'Click Lock',
  'Lifetime',
  '10 Years',
  NOW()
) ON CONFLICT (sku) DO UPDATE SET
  wholesale_cost_sf = EXCLUDED.wholesale_cost_sf,
  wholesale_cost_box = EXCLUDED.wholesale_cost_box,
  last_price_update = NOW();

INSERT INTO flooring_products (
  sku, name, slug, vendor_id, brand, collection,
  type, dimensions, primary_color, wear_layer, thickness,
  sf_per_box, wholesale_cost_sf, wholesale_cost_box,
  primary_image, url, is_active, is_waterproof,
  installation_method, residential_warranty, commercial_warranty,
  last_price_update
) VALUES (
  'XL_TRECENTO_MOUNTAINS_GRAY_LUXURY_VINYL_TILE',
  'XL Trecento Mountains Gray',
  'xl-trecento-mountains-gray-luxury-vinyl-tile',
  'msi',
  'MSI',
  'unknown',
  'Luxury Vinyl',
  '7x48',
  'Gray',
  '20mil',
  '5.5mm',
  22,
  2.29,
  50.38,
  'https://cdn.prod.website-files.com/6456ce4476abb2d4f9fbad10/6456ce4576abb201fafbccd6_msi-surfaces-surprise-granite-xl-trecento-mountains-gray-luxury-vinyl-planks-close-up.jpeg',
  '/flooring/xl-trecento-mountains-gray-luxury-vinyl-tile',
  true,
  true,
  'Click Lock',
  'Lifetime',
  '10 Years',
  NOW()
) ON CONFLICT (sku) DO UPDATE SET
  wholesale_cost_sf = EXCLUDED.wholesale_cost_sf,
  wholesale_cost_box = EXCLUDED.wholesale_cost_box,
  last_price_update = NOW();

INSERT INTO flooring_products (
  sku, name, slug, vendor_id, brand, collection,
  type, dimensions, primary_color, wear_layer, thickness,
  sf_per_box, wholesale_cost_sf, wholesale_cost_box,
  primary_image, url, is_active, is_waterproof,
  installation_method, residential_warranty, commercial_warranty,
  last_price_update
) VALUES (
  'XL_TRECENTO_QUARZO_TAJ_LUXURY_VINYL_TILE',
  'XL Trecento Quarzo Taj',
  'xl-trecento-quarzo-taj-luxury-vinyl-tile',
  'msi',
  'MSI',
  'unknown',
  'Luxury Vinyl',
  '7x48',
  'Multi',
  '20mil',
  '5.5mm',
  22,
  2.29,
  50.38,
  'https://cdn.prod.website-files.com/6456ce4476abb2d4f9fbad10/6456ce4576abb26667fbcb95_msi-surfaces-surprise-granite-quarzo-taj-luxury-vinyl-planks-close-up.jpeg',
  '/flooring/xl-trecento-quarzo-taj-luxury-vinyl-tile',
  true,
  true,
  'Click Lock',
  'Lifetime',
  '10 Years',
  NOW()
) ON CONFLICT (sku) DO UPDATE SET
  wholesale_cost_sf = EXCLUDED.wholesale_cost_sf,
  wholesale_cost_box = EXCLUDED.wholesale_cost_box,
  last_price_update = NOW();

INSERT INTO flooring_products (
  sku, name, slug, vendor_id, brand, collection,
  type, dimensions, primary_color, wear_layer, thickness,
  sf_per_box, wholesale_cost_sf, wholesale_cost_box,
  primary_image, url, is_active, is_waterproof,
  installation_method, residential_warranty, commercial_warranty,
  last_price_update
) VALUES (
  'XL_TRECENTO_WHITE_OCEAN_LUXURY_VINYL_TILE',
  'XL Trecento White Ocean',
  'xl-trecento-white-ocean-luxury-vinyl-tile',
  'msi',
  'MSI',
  'unknown',
  'Luxury Vinyl',
  '7x48',
  'White',
  '20mil',
  '5.5mm',
  22,
  2.29,
  50.38,
  'https://cdn.prod.website-files.com/6456ce4476abb2d4f9fbad10/6456ce4576abb27db9fbccd8_msi-surfaces-surprise-granite-xl-trecento-white-ocean-luxury-vinyl-tile-close-up.jpeg',
  '/flooring/xl-trecento-white-ocean-luxury-vinyl-tile',
  true,
  true,
  'Click Lock',
  'Lifetime',
  '10 Years',
  NOW()
) ON CONFLICT (sku) DO UPDATE SET
  wholesale_cost_sf = EXCLUDED.wholesale_cost_sf,
  wholesale_cost_box = EXCLUDED.wholesale_cost_box,
  last_price_update = NOW();
