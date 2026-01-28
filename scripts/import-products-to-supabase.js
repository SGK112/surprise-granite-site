#!/usr/bin/env node
/**
 * Import Products to Supabase
 *
 * This script imports products from local JSON files into the Supabase shopify_products table.
 *
 * Usage:
 *   node scripts/import-products-to-supabase.js
 *
 * Options:
 *   --dry-run    Show what would be imported without actually importing
 *   --category   Import only specific category: countertops, flooring, tile
 */

const fs = require('fs');
const path = require('path');

// Supabase configuration (from js/config.js)
const SUPABASE_URL = 'https://ypeypgwsycxcagncgdur.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY;

// Parse command line arguments
const args = process.argv.slice(2);
const isDryRun = args.includes('--dry-run');
const categoryArg = args.find(a => a.startsWith('--category='));
const specificCategory = categoryArg ? categoryArg.split('=')[1] : null;

// Check for service key (not needed for dry run)
if (!SUPABASE_SERVICE_KEY && !isDryRun) {
  console.error('ERROR: SUPABASE_SERVICE_KEY environment variable required');
  console.error('Set it with: export SUPABASE_SERVICE_KEY="your-service-role-key"');
  console.error('You can find this in Supabase Dashboard > Settings > API > service_role key');
  console.error('\nOr run with --dry-run to preview what would be imported');
  process.exit(1);
}

// Data file paths
const DATA_FILES = {
  countertops: path.join(__dirname, '../data/countertops.json'),
  flooring: path.join(__dirname, '../data/flooring.json'),
  tile: path.join(__dirname, '../data/tile.json')
};

// Brand name mapping for consistency
const BRAND_MAP = {
  'msi-surfaces': 'MSI Surfaces',
  'msi': 'MSI Surfaces',
  'cosentino': 'Cosentino',
  'radianz-quartz': 'Radianz',
  'radianz': 'Radianz',
  'lx-hausys': 'LX Hausys',
  'cambria': 'Cambria',
  'daltile': 'Daltile',
  'bedrosians': 'Bedrosians',
  'silestone': 'Silestone',
  'dekton': 'Dekton',
  'caesarstone': 'Caesarstone',
  'bravo-tile': 'Bravo Tile',
  'surprise-granite': 'Surprise Granite'
};

/**
 * Generate a URL-friendly handle from name
 */
function generateHandle(name) {
  return (name || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

/**
 * Map brand slug to display name
 */
function mapBrand(brandSlug) {
  if (!brandSlug) return 'Unknown';
  return BRAND_MAP[brandSlug.toLowerCase()] ||
         brandSlug.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

/**
 * Transform countertop product to shopify_products schema
 */
function transformCountertop(product) {
  const tags = [];
  if (product.primaryColor) tags.push(product.primaryColor);
  if (product.accentColor) tags.push(product.accentColor);
  if (product.style) tags.push(product.style);
  if (product.type) tags.push(product.type);

  return {
    name: product.name,
    handle: product.slug || generateHandle(product.name),
    vendor: mapBrand(product.brand),
    product_type: product.type || 'Countertop',
    description: `${product.name} ${product.type || 'countertop'} from ${mapBrand(product.brand)}. ${product.style ? 'Style: ' + product.style + '.' : ''}`,
    price: 0, // Price to be set manually or from pricing data
    image_url: product.primaryImage || null,
    tags: tags,
    status: 'active',
    show_on_website: true,
    is_dropship: false,
    inventory_quantity: 100,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };
}

/**
 * Transform flooring product to shopify_products schema
 */
function transformFlooring(product) {
  const tags = [];
  if (product.primaryColor) tags.push(product.primaryColor);
  if (product.type) tags.push(product.type);
  if (product.category) tags.push(product.category);
  tags.push('Flooring');

  return {
    name: product.name,
    handle: product.slug || generateHandle(product.name),
    vendor: mapBrand(product.brand),
    product_type: product.type || 'Flooring',
    description: `${product.name} flooring from ${mapBrand(product.brand)}.`,
    price: 0,
    image_url: product.primaryImage || null,
    tags: tags,
    status: 'active',
    show_on_website: true,
    is_dropship: false,
    inventory_quantity: 100,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };
}

/**
 * Transform tile product to shopify_products schema
 */
function transformTile(product) {
  const tags = [];
  if (product.material) tags.push(product.material);
  if (product.color) tags.push(product.color);
  if (product.finish) tags.push(product.finish);
  tags.push('Tile');

  return {
    name: product.name,
    handle: product.slug || generateHandle(product.name),
    vendor: mapBrand(product.brand),
    product_type: product.material || 'Tile',
    description: product.description || `${product.name} tile from ${mapBrand(product.brand)}.`,
    price: 0,
    image_url: product.primaryImage || product.image || null,
    tags: tags,
    status: 'active',
    show_on_website: true,
    is_dropship: false,
    inventory_quantity: 100,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };
}

/**
 * Load products from JSON file
 */
function loadProducts(category) {
  const filePath = DATA_FILES[category];
  if (!fs.existsSync(filePath)) {
    console.warn(`File not found: ${filePath}`);
    return [];
  }

  try {
    const raw = fs.readFileSync(filePath, 'utf8');
    const data = JSON.parse(raw);

    // Handle different JSON structures
    if (category === 'countertops' && data.countertops) {
      return data.countertops;
    }
    if (category === 'flooring' && data.flooring) {
      return data.flooring;
    }
    if (category === 'tile' && data.tiles) {
      return data.tiles;
    }
    if (Array.isArray(data)) {
      return data;
    }

    // Try to find the array in the data
    const keys = Object.keys(data);
    for (const key of keys) {
      if (Array.isArray(data[key])) {
        return data[key];
      }
    }

    return [];
  } catch (err) {
    console.error(`Error loading ${category}:`, err.message);
    return [];
  }
}

/**
 * Insert products to Supabase using REST API
 */
async function insertToSupabase(products, category) {
  if (products.length === 0) {
    console.log(`No products to import for ${category}`);
    return { inserted: 0, errors: 0 };
  }

  const url = `${SUPABASE_URL}/rest/v1/shopify_products`;
  const headers = {
    'apikey': SUPABASE_SERVICE_KEY,
    'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
    'Content-Type': 'application/json',
    'Prefer': 'resolution=merge-duplicates' // Upsert on conflict
  };

  let inserted = 0;
  let errors = 0;
  const batchSize = 50;

  // Process in batches
  for (let i = 0; i < products.length; i += batchSize) {
    const batch = products.slice(i, i + batchSize);

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: headers,
        body: JSON.stringify(batch)
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`Batch ${Math.floor(i/batchSize) + 1} error:`, errorText);
        errors += batch.length;
      } else {
        inserted += batch.length;
        process.stdout.write(`\r  Imported ${inserted}/${products.length} ${category} products...`);
      }
    } catch (err) {
      console.error(`Batch ${Math.floor(i/batchSize) + 1} failed:`, err.message);
      errors += batch.length;
    }
  }

  console.log(''); // New line after progress
  return { inserted, errors };
}

/**
 * Check for existing products with same handle
 */
async function getExistingHandles() {
  const url = `${SUPABASE_URL}/rest/v1/shopify_products?select=handle`;
  const headers = {
    'apikey': SUPABASE_SERVICE_KEY,
    'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`
  };

  try {
    const response = await fetch(url, { headers });
    if (response.ok) {
      const data = await response.json();
      return new Set(data.map(p => p.handle));
    }
  } catch (err) {
    console.warn('Could not fetch existing handles:', err.message);
  }
  return new Set();
}

/**
 * Main import function
 */
async function main() {
  console.log('='.repeat(60));
  console.log('SURPRISE GRANITE - Product Import to Supabase');
  console.log('='.repeat(60));
  console.log('');

  if (isDryRun) {
    console.log('*** DRY RUN MODE - No data will be imported ***\n');
  }

  // Get existing handles to avoid duplicates
  console.log('Checking existing products...');
  const existingHandles = await getExistingHandles();
  console.log(`Found ${existingHandles.size} existing products in Supabase\n`);

  const categories = specificCategory ? [specificCategory] : ['countertops', 'flooring', 'tile'];
  const transformers = {
    countertops: transformCountertop,
    flooring: transformFlooring,
    tile: transformTile
  };

  let totalInserted = 0;
  let totalSkipped = 0;
  let totalErrors = 0;

  for (const category of categories) {
    console.log(`\n--- ${category.toUpperCase()} ---`);

    // Load products
    const rawProducts = loadProducts(category);
    console.log(`Loaded ${rawProducts.length} products from JSON`);

    if (rawProducts.length === 0) continue;

    // Transform products
    const transformer = transformers[category];
    const transformed = rawProducts.map(p => transformer(p));

    // Filter out duplicates
    const newProducts = transformed.filter(p => !existingHandles.has(p.handle));
    const skipped = transformed.length - newProducts.length;
    totalSkipped += skipped;

    console.log(`  ${newProducts.length} new products (${skipped} already exist)`);

    // Show sample
    if (newProducts.length > 0) {
      console.log(`  Sample: "${newProducts[0].name}" - ${newProducts[0].vendor}`);
      if (newProducts[0].image_url) {
        console.log(`          Image: ${newProducts[0].image_url.substring(0, 60)}...`);
      }
    }

    // Insert to Supabase
    if (!isDryRun && newProducts.length > 0) {
      const result = await insertToSupabase(newProducts, category);
      totalInserted += result.inserted;
      totalErrors += result.errors;

      // Add new handles to set to avoid duplicates across categories
      newProducts.forEach(p => existingHandles.add(p.handle));
    }
  }

  // Summary
  console.log('\n' + '='.repeat(60));
  console.log('IMPORT SUMMARY');
  console.log('='.repeat(60));
  console.log(`  Total inserted: ${totalInserted}`);
  console.log(`  Total skipped:  ${totalSkipped} (already existed)`);
  console.log(`  Total errors:   ${totalErrors}`);
  console.log('');

  if (isDryRun) {
    console.log('This was a DRY RUN. Run without --dry-run to actually import.');
  } else if (totalInserted > 0) {
    console.log('Import complete! Products are now available in Supabase.');
    console.log('The Room Designer will automatically use these images.');
  }
}

// Run
main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
