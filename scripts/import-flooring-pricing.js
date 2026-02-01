#!/usr/bin/env node
/**
 * Import Flooring Pricing Script
 *
 * Imports flooring products from JSON and adds wholesale pricing
 * based on collection/color matching.
 *
 * Usage:
 *   node scripts/import-flooring-pricing.js [--dry-run] [--update-json]
 *
 * Options:
 *   --dry-run      Show what would be imported without making changes
 *   --update-json  Update the flooring.json file with pricing data
 *   --to-supabase  Import directly to Supabase database
 */

const fs = require('fs');
const path = require('path');

// Flooring pricing data (from MSI AZPH price list)
const FLOORING_PRICING = {
  // Andover Collection - 7x48, 20mil wear layer
  andover: {
    cost_per_sf: 2.29,
    cost_per_box: 50.38,
    sf_per_box: 22,
    wear_layer: '20mil',
    dimensions: '7x48',
    thickness: '5.5mm',
    type: 'Luxury Vinyl',
    colors: [
      'abingdale', 'bayhill-blonde', 'blythe', 'dakworth', 'hatfield',
      'highcliffe-greige', 'kingsdown-gray', 'whitby-white'
    ]
  },

  // Ashton Collection - 7x48, 20mil wear layer
  ashton: {
    cost_per_sf: 2.29,
    cost_per_box: 50.38,
    sf_per_box: 22,
    wear_layer: '20mil',
    dimensions: '7x48',
    thickness: '5.5mm',
    type: 'Luxury Vinyl',
    colors: [
      'bergen-hills', 'colston-park', 'daybell', 'griese', 'hadley',
      'milledge', 'roscoe', 'sandbridge', 'silas'
    ]
  },

  // Wilmont Collection - 7x48, 20mil wear layer, SPC
  wilmont: {
    cost_per_sf: 2.49,
    cost_per_box: 54.78,
    sf_per_box: 22,
    wear_layer: '20mil',
    dimensions: '7x48',
    thickness: '6.5mm',
    type: 'SPC',
    colors: [
      'braly', 'burnaby', 'charcoal-oak', 'dusk-cherry', 'fawn-oak',
      'reclaimed-oak', 'sandino', 'smokey-maple', 'whitfield-gray'
    ]
  },

  // Cyrus Collection - 7x48, 12mil wear layer, SPC
  cyrus: {
    cost_per_sf: 1.99,
    cost_per_box: 46.57,
    sf_per_box: 23.4,
    wear_layer: '12mil',
    dimensions: '7x48',
    thickness: '5mm',
    type: 'SPC',
    colors: [
      'akadia', 'bembridge', 'billingham', 'bracken-hill', 'brianka',
      'draven', 'dunite-oak', 'exotika', 'fauna', 'finely', 'ludlow',
      'mezcla', 'ryder', 'sienna-oak', 'twilight-oak', 'wolfeboro'
    ]
  },

  // Prescott Collection - 7x48, 20mil wear layer, SPC
  prescott: {
    cost_per_sf: 2.69,
    cost_per_box: 62.95,
    sf_per_box: 23.4,
    wear_layer: '20mil',
    dimensions: '7x48',
    thickness: '6mm',
    type: 'SPC',
    colors: [
      'brookline', 'cloudcroft', 'draper', 'dunmore', 'fauna', 'jenta',
      'katella-ash', 'ludlow', 'ryder', 'sandino', 'whitewater', 'wolfeboro'
    ]
  },

  // Katavia Collection - Budget-friendly
  katavia: {
    cost_per_sf: 1.69,
    cost_per_box: 37.18,
    sf_per_box: 22,
    wear_layer: '6mil',
    dimensions: '6x48',
    thickness: '2mm',
    type: 'Luxury Vinyl',
    colors: [
      'bleached-elm', 'burnished-acacia', 'charred-oak', 'coastal-mix',
      'heartwood', 'hickory-mist', 'licorice', 'reclaimed-teak',
      'saddle', 'woodland'
    ]
  },

  // Lowcountry Collection - Wide plank 9x48
  lowcountry: {
    cost_per_sf: 2.79,
    cost_per_box: 65.23,
    sf_per_box: 23.4,
    wear_layer: '20mil',
    dimensions: '9x48',
    thickness: '6.5mm',
    type: 'SPC',
    colors: [
      'bluff', 'burlap', 'driftwood', 'heron', 'oyster', 'tide'
    ]
  },

  // XL Cyrus Collection - 9x60 planks
  xl_cyrus: {
    cost_per_sf: 2.59,
    cost_per_box: 60.61,
    sf_per_box: 23.4,
    wear_layer: '12mil',
    dimensions: '9x60',
    thickness: '5mm',
    type: 'SPC',
    colors: [
      'xl-akadia', 'xl-bembridge', 'xl-cyrus', 'xl-dunite', 'xl-exotika',
      'xl-finely', 'xl-mezcla', 'xl-ryder', 'xl-twilight'
    ]
  },

  // XL Prescott Collection - 9x60 planks
  xl_prescott: {
    cost_per_sf: 2.99,
    cost_per_box: 69.97,
    sf_per_box: 23.4,
    wear_layer: '20mil',
    dimensions: '9x60',
    thickness: '6mm',
    type: 'SPC',
    colors: [
      'xl-brookline', 'xl-draper', 'xl-fauna', 'xl-jenta', 'xl-katella',
      'xl-ludlow', 'xl-whitewater', 'xl-wolfeboro'
    ]
  },

  // Everlife Rigid Core - Premium SPC
  everlife: {
    cost_per_sf: 2.89,
    cost_per_box: 67.63,
    sf_per_box: 23.4,
    wear_layer: '22mil',
    dimensions: '7x48',
    thickness: '6.5mm',
    type: 'SPC',
    colors: []
  }
};

// Default pricing for unmatched products
const DEFAULT_PRICING = {
  cost_per_sf: 2.29,
  cost_per_box: 50.38,
  sf_per_box: 22,
  wear_layer: '20mil',
  dimensions: '7x48',
  thickness: '5.5mm',
  type: 'Luxury Vinyl'
};

// Tier markups
const TIER_MARKUPS = {
  guest: 1.55,
  homeowner: 1.50,
  pro: 1.35,
  designer: 1.30,
  contractor: 1.25,
  fabricator: 1.15
};

/**
 * Detect collection and pricing from product name
 */
function detectCollection(productName) {
  const name = productName.toLowerCase().replace(/\s+/g, '-');

  for (const [collectionName, collection] of Object.entries(FLOORING_PRICING)) {
    // Check collection name in product name
    const searchName = collectionName.replace(/_/g, '-');
    if (name.includes(searchName)) {
      return { collection: collectionName, ...collection };
    }

    // Check colors
    if (collection.colors) {
      for (const color of collection.colors) {
        if (name.includes(color)) {
          return { collection: collectionName, ...collection };
        }
      }
    }
  }

  return { collection: 'unknown', ...DEFAULT_PRICING };
}

/**
 * Calculate retail price from wholesale
 */
function calculateRetailPrice(wholesaleCost, tier = 'guest') {
  const markup = TIER_MARKUPS[tier] || TIER_MARKUPS.guest;
  return Math.round(wholesaleCost * markup * 100) / 100;
}

/**
 * Process flooring JSON and add pricing
 */
function processFlooringData(flooringData) {
  const processed = [];
  const stats = {
    total: 0,
    withPricing: 0,
    byCollection: {}
  };

  for (const product of flooringData) {
    stats.total++;

    const pricing = detectCollection(product.name);

    // Track stats by collection
    stats.byCollection[pricing.collection] = (stats.byCollection[pricing.collection] || 0) + 1;

    if (pricing.collection !== 'unknown') {
      stats.withPricing++;
    }

    const enrichedProduct = {
      ...product,
      // Pricing
      collection: pricing.collection,
      wholesale_cost_sf: pricing.cost_per_sf,
      wholesale_cost_box: pricing.cost_per_box,
      sf_per_box: pricing.sf_per_box,

      // Retail prices by tier
      price_sf: {
        guest: calculateRetailPrice(pricing.cost_per_sf, 'guest'),
        homeowner: calculateRetailPrice(pricing.cost_per_sf, 'homeowner'),
        pro: calculateRetailPrice(pricing.cost_per_sf, 'pro'),
        contractor: calculateRetailPrice(pricing.cost_per_sf, 'contractor'),
        fabricator: calculateRetailPrice(pricing.cost_per_sf, 'fabricator')
      },
      price_box: {
        guest: calculateRetailPrice(pricing.cost_per_box, 'guest'),
        homeowner: calculateRetailPrice(pricing.cost_per_box, 'homeowner'),
        pro: calculateRetailPrice(pricing.cost_per_box, 'pro'),
        contractor: calculateRetailPrice(pricing.cost_per_box, 'contractor'),
        fabricator: calculateRetailPrice(pricing.cost_per_box, 'fabricator')
      },

      // Technical specs
      wear_layer: pricing.wear_layer,
      dimensions: pricing.dimensions,
      thickness: pricing.thickness,
      product_type: pricing.type,

      // Additional fields
      is_waterproof: true,
      installation_method: 'Click Lock',
      residential_warranty: 'Lifetime',
      commercial_warranty: '10 Years',

      // Timestamps
      price_updated_at: new Date().toISOString()
    };

    processed.push(enrichedProduct);
  }

  return { products: processed, stats };
}

/**
 * Generate SQL insert statements
 */
function generateSQLInserts(products) {
  const inserts = [];

  for (const p of products) {
    const sku = p.slug.toUpperCase().replace(/-/g, '_');
    const sql = `
INSERT INTO flooring_products (
  sku, name, slug, vendor_id, brand, collection,
  type, dimensions, primary_color, wear_layer, thickness,
  sf_per_box, wholesale_cost_sf, wholesale_cost_box,
  primary_image, url, is_active, is_waterproof,
  installation_method, residential_warranty, commercial_warranty,
  last_price_update
) VALUES (
  '${sku}',
  '${p.name.replace(/'/g, "''")}',
  '${p.slug}',
  'msi',
  'MSI',
  '${p.collection}',
  '${p.product_type || 'Luxury Vinyl'}',
  '${p.dimensions || '7x48'}',
  '${p.primaryColor || 'Multi'}',
  '${p.wear_layer || '20mil'}',
  '${p.thickness || '5.5mm'}',
  ${p.sf_per_box || 22},
  ${p.wholesale_cost_sf},
  ${p.wholesale_cost_box},
  '${p.primaryImage || ''}',
  '/flooring/${p.slug}',
  true,
  true,
  'Click Lock',
  'Lifetime',
  '10 Years',
  NOW()
) ON CONFLICT (sku) DO UPDATE SET
  wholesale_cost_sf = EXCLUDED.wholesale_cost_sf,
  wholesale_cost_box = EXCLUDED.wholesale_cost_box,
  last_price_update = NOW();`;

    inserts.push(sql);
  }

  return inserts.join('\n');
}

/**
 * Main execution
 */
async function main() {
  const args = process.argv.slice(2);
  const isDryRun = args.includes('--dry-run');
  const updateJson = args.includes('--update-json');
  const toSupabase = args.includes('--to-supabase');

  console.log('🚀 MSI Flooring Pricing Import\n');
  console.log(`   Mode: ${isDryRun ? 'DRY RUN' : 'LIVE'}`);
  console.log(`   Update JSON: ${updateJson ? 'Yes' : 'No'}`);
  console.log(`   To Supabase: ${toSupabase ? 'Yes' : 'No'}\n`);

  // Load flooring data
  const dataPath = path.join(__dirname, '../data/flooring.json');

  if (!fs.existsSync(dataPath)) {
    console.error('❌ flooring.json not found at:', dataPath);
    process.exit(1);
  }

  const rawData = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
  const flooringData = rawData.flooring || rawData;

  console.log(`📦 Loaded ${flooringData.length} flooring products\n`);

  // Process data
  const { products, stats } = processFlooringData(flooringData);

  // Show stats
  console.log('📊 Processing Stats:');
  console.log(`   Total products: ${stats.total}`);
  console.log(`   With pricing: ${stats.withPricing} (${Math.round(stats.withPricing/stats.total*100)}%)`);
  console.log(`   Unknown collection: ${stats.byCollection.unknown || 0}\n`);

  console.log('📁 By Collection:');
  for (const [collection, count] of Object.entries(stats.byCollection).sort((a,b) => b[1] - a[1])) {
    const pricing = FLOORING_PRICING[collection] || DEFAULT_PRICING;
    console.log(`   ${collection}: ${count} products @ $${pricing.cost_per_sf}/sf`);
  }

  // Sample output
  console.log('\n📝 Sample Product (with pricing):');
  const sample = products[0];
  console.log(JSON.stringify({
    name: sample.name,
    collection: sample.collection,
    wholesale_cost_sf: sample.wholesale_cost_sf,
    price_sf: sample.price_sf,
    sf_per_box: sample.sf_per_box
  }, null, 2));

  if (isDryRun) {
    console.log('\n✅ Dry run complete. No changes made.');
    return;
  }

  // Update JSON file
  if (updateJson) {
    const outputPath = path.join(__dirname, '../data/flooring-with-pricing.json');
    fs.writeFileSync(outputPath, JSON.stringify({ flooring: products }, null, 2));
    console.log(`\n✅ Saved to: ${outputPath}`);

    // Also update original
    const updatedOriginal = { flooring: products };
    fs.writeFileSync(dataPath, JSON.stringify(updatedOriginal, null, 2));
    console.log(`✅ Updated original: ${dataPath}`);
  }

  // Generate SQL
  const sqlPath = path.join(__dirname, '../database/flooring-products-insert.sql');
  const sql = `-- Auto-generated flooring products insert
-- Generated: ${new Date().toISOString()}
-- Products: ${products.length}

${generateSQLInserts(products)}
`;
  fs.writeFileSync(sqlPath, sql);
  console.log(`\n✅ SQL generated: ${sqlPath}`);

  // Import to Supabase
  if (toSupabase) {
    console.log('\n📤 Importing to Supabase...');

    try {
      const { createClient } = require('@supabase/supabase-js');

      const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
      const supabaseKey = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY;

      if (!supabaseUrl || !supabaseKey) {
        console.error('❌ Missing Supabase credentials. Set SUPABASE_URL and SUPABASE_SERVICE_KEY');
        return;
      }

      const supabase = createClient(supabaseUrl, supabaseKey);

      // Upsert products
      const { data, error } = await supabase
        .from('flooring_products')
        .upsert(products.map(p => ({
          sku: p.slug.toUpperCase().replace(/-/g, '_'),
          name: p.name,
          slug: p.slug,
          vendor_id: 'msi',
          brand: 'MSI',
          collection: p.collection,
          type: p.product_type || 'Luxury Vinyl',
          dimensions: p.dimensions,
          primary_color: p.primaryColor,
          wear_layer: p.wear_layer,
          thickness: p.thickness,
          sf_per_box: p.sf_per_box,
          wholesale_cost_sf: p.wholesale_cost_sf,
          wholesale_cost_box: p.wholesale_cost_box,
          primary_image: p.primaryImage,
          url: `/flooring/${p.slug}`,
          is_active: true,
          is_waterproof: true,
          installation_method: 'Click Lock',
          residential_warranty: 'Lifetime',
          commercial_warranty: '10 Years',
          last_price_update: new Date().toISOString()
        })), { onConflict: 'sku' });

      if (error) {
        console.error('❌ Supabase error:', error.message);
      } else {
        console.log(`✅ Imported ${products.length} products to Supabase`);
      }
    } catch (err) {
      console.error('❌ Import error:', err.message);
    }
  }

  console.log('\n🎉 Import complete!');
}

main().catch(console.error);
