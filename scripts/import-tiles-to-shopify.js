/**
 * Import Tiles to Shopify
 * Adds all tiles from tile.json to Shopify store
 *
 * Usage: node scripts/import-tiles-to-shopify.js
 */

const fs = require('fs');
const path = require('path');

const SHOPIFY_STORE = process.env.SHOPIFY_STORE || 'surprise-granite.myshopify.com';
const ADMIN_API_TOKEN = process.env.SHOPIFY_ADMIN_TOKEN; // Set via environment variable
const API_VERSION = '2024-01';

if (!ADMIN_API_TOKEN) {
  console.error('Error: SHOPIFY_ADMIN_TOKEN environment variable is required');
  process.exit(1);
}

// Rate limiting - Shopify allows 2 requests/second for Admin API
const DELAY_MS = 550;

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function shopifyAdminFetch(endpoint, method = 'GET', body = null) {
  const url = `https://${SHOPIFY_STORE}/admin/api/${API_VERSION}${endpoint}`;

  const options = {
    method,
    headers: {
      'Content-Type': 'application/json',
      'X-Shopify-Access-Token': ADMIN_API_TOKEN,
    }
  };

  if (body) {
    options.body = JSON.stringify(body);
  }

  const response = await fetch(url, options);

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Shopify API error ${response.status}: ${errorText}`);
  }

  return response.json();
}

function fixImageUrl(url) {
  if (!url) return null;
  // Convert relative URLs to absolute
  if (url.startsWith('/')) {
    return `https://www.surprisegranite.com${url}`;
  }
  return url;
}

async function createProduct(tile) {
  // Fix image URLs - convert relative to absolute
  const images = (tile.images || [])
    .map(url => fixImageUrl(url))
    .filter(url => url)
    .map(url => ({ src: url }));

  const product = {
    product: {
      title: tile.title,
      body_html: `<p>${tile.description || ''}</p>
        <ul>
          ${tile.specs?.material ? `<li><strong>Material:</strong> ${tile.specs.material}</li>` : ''}
          ${tile.specs?.style ? `<li><strong>Style:</strong> ${tile.specs.style}</li>` : ''}
          ${tile.specs?.color ? `<li><strong>Color:</strong> ${tile.specs.color}</li>` : ''}
        </ul>`,
      vendor: tile.vendor || tile.brandDisplay || 'MSI',
      product_type: 'Tile',
      tags: (tile.tags || []).filter(t => t).join(', '),
      status: 'active',
      variants: [
        {
          price: tile.price || '0.00',
          sku: tile.handle || tile.id,
          inventory_management: null, // Don't track inventory
          requires_shipping: true,
          taxable: true,
          weight: 5, // Approximate weight in lbs per sq ft
          weight_unit: 'lb'
        }
      ],
      images: images.length > 0 ? images : [] // Skip images if none valid
    }
  };

  return shopifyAdminFetch('/products.json', 'POST', product);
}

async function checkExistingProducts() {
  // Get count of existing tile products
  try {
    const result = await shopifyAdminFetch('/products/count.json?product_type=Tile');
    return result.count || 0;
  } catch (e) {
    return 0;
  }
}

async function main() {
  console.log('=== Tile Import to Shopify ===\n');

  // Load tile data
  const tilePath = path.join(__dirname, '../data/tile.json');
  const tileData = JSON.parse(fs.readFileSync(tilePath, 'utf8'));

  console.log(`Found ${tileData.length} tiles to import\n`);

  // Check existing
  const existingCount = await checkExistingProducts();
  console.log(`Existing tile products in Shopify: ${existingCount}\n`);

  if (existingCount > 0) {
    console.log('WARNING: There are already tile products in Shopify.');
    console.log('This script will create duplicates if run again.\n');
  }

  // Import tiles
  let success = 0;
  let failed = 0;
  const errors = [];

  for (let i = 0; i < tileData.length; i++) {
    const tile = tileData[i];
    const progress = `[${i + 1}/${tileData.length}]`;

    try {
      process.stdout.write(`${progress} Creating: ${tile.title}... `);
      await createProduct(tile);
      console.log('✓');
      success++;
    } catch (err) {
      console.log('✗');
      console.error(`  Error: ${err.message}`);
      failed++;
      errors.push({ tile: tile.title, error: err.message });
    }

    // Rate limit delay
    await sleep(DELAY_MS);
  }

  // Summary
  console.log('\n=== Import Complete ===');
  console.log(`Success: ${success}`);
  console.log(`Failed: ${failed}`);

  if (errors.length > 0) {
    console.log('\nErrors:');
    errors.forEach(e => console.log(`  - ${e.tile}: ${e.error}`));
  }

  console.log('\nTiles are now available in your Shopify store!');
  console.log('Customers can add them to cart and checkout with shipping.');
}

main().catch(console.error);
