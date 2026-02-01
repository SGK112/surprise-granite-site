/**
 * Import Bravo Tiles to Shopify (with fixed image URLs)
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
  if (body) options.body = JSON.stringify(body);
  const response = await fetch(url, options);
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Shopify API error ${response.status}: ${errorText}`);
  }
  return response.json();
}

function fixImageUrl(url) {
  if (!url) return null;
  if (url.startsWith('/')) {
    return `https://www.surprisegranite.com${url}`;
  }
  return url;
}

async function createProduct(tile) {
  const images = (tile.images || [])
    .map(url => fixImageUrl(url))
    .filter(url => url)
    .map(url => ({ src: url }));

  const product = {
    product: {
      title: `${tile.title} - Bravo Tile`,
      body_html: `<p>${tile.description || 'Premium tile from Bravo Tile'}</p>`,
      vendor: 'Bravo Tile',
      product_type: 'Tile',
      tags: (tile.tags || []).filter(t => t).join(', ') + ', bravo, bravo-tile',
      status: 'active',
      variants: [{
        price: tile.price || '5.99',
        sku: `bravo-${tile.handle || tile.id}`,
        inventory_management: null,
        requires_shipping: true,
        taxable: true,
        weight: 5,
        weight_unit: 'lb'
      }],
      images: images
    }
  };
  return shopifyAdminFetch('/products.json', 'POST', product);
}

async function main() {
  console.log('=== Bravo Tile Import ===\n');

  const tilePath = path.join(__dirname, '../data/tile.json');
  const allTiles = JSON.parse(fs.readFileSync(tilePath, 'utf8'));
  const bravoTiles = allTiles.filter(t => t.vendor === 'Bravo Tile');

  console.log(`Found ${bravoTiles.length} Bravo tiles to import\n`);

  let success = 0, failed = 0;
  const errors = [];

  for (let i = 0; i < bravoTiles.length; i++) {
    const tile = bravoTiles[i];
    const progress = `[${i + 1}/${bravoTiles.length}]`;

    try {
      process.stdout.write(`${progress} ${tile.title}... `);
      await createProduct(tile);
      console.log('✓');
      success++;
    } catch (err) {
      console.log('✗');
      failed++;
      errors.push({ tile: tile.title, error: err.message });
    }
    await sleep(DELAY_MS);
  }

  console.log('\n=== Complete ===');
  console.log(`Success: ${success}`);
  console.log(`Failed: ${failed}`);

  if (errors.length > 0 && errors.length < 20) {
    console.log('\nErrors:');
    errors.forEach(e => console.log(`  - ${e.tile}: ${e.error}`));
  }
}

main().catch(console.error);
