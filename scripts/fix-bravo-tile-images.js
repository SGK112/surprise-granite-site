#!/usr/bin/env node
/**
 * Fix Bravo Tile Images
 *
 * Uploads local Bravo Tile images to Supabase Storage and updates the database.
 * These images have relative URLs that couldn't be downloaded during migration.
 */

const fs = require('fs');
const path = require('path');

const SUPABASE_URL = 'https://ypeypgwsycxcagncgdur.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const STORAGE_BUCKET = 'product-images';
const LOCAL_IMAGE_DIR = path.join(__dirname, '../images/vendors/bravo-tile');

if (!SUPABASE_SERVICE_KEY) {
  console.error('ERROR: SUPABASE_SERVICE_KEY environment variable required');
  process.exit(1);
}

/**
 * Upload local image to Supabase Storage
 */
async function uploadImage(filePath, filename) {
  const url = `${SUPABASE_URL}/storage/v1/object/${STORAGE_BUCKET}/${filename}`;

  try {
    const buffer = fs.readFileSync(filePath);
    const ext = path.extname(filename).toLowerCase();
    const contentType = ext === '.png' ? 'image/png' : 'image/jpeg';

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
        'Content-Type': contentType,
        'x-upsert': 'true'
      },
      body: buffer
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(error);
    }

    return `${SUPABASE_URL}/storage/v1/object/public/${STORAGE_BUCKET}/${filename}`;
  } catch (err) {
    console.error(`  Upload failed for ${filename}: ${err.message}`);
    return null;
  }
}

/**
 * Update products with relative bravo-tile URLs
 */
async function updateProductsWithNewUrls(imageMap) {
  // Fetch products with bravo-tile relative URLs
  const url = `${SUPABASE_URL}/rest/v1/shopify_products?image_url=like./images/vendors/bravo-tile/*&select=id,name,handle,image_url`;

  const response = await fetch(url, {
    headers: {
      'apikey': SUPABASE_SERVICE_KEY,
      'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`
    }
  });

  if (!response.ok) {
    console.error('Failed to fetch products:', await response.text());
    return 0;
  }

  const products = await response.json();
  console.log(`Found ${products.length} products with relative Bravo Tile URLs`);

  let updated = 0;
  for (const product of products) {
    // Extract filename from relative URL
    const filename = path.basename(product.image_url);
    const newUrl = imageMap[filename];

    if (newUrl) {
      const updateUrl = `${SUPABASE_URL}/rest/v1/shopify_products?id=eq.${product.id}`;
      const updateResponse = await fetch(updateUrl, {
        method: 'PATCH',
        headers: {
          'apikey': SUPABASE_SERVICE_KEY,
          'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
          'Content-Type': 'application/json',
          'Prefer': 'return=minimal'
        },
        body: JSON.stringify({
          image_url: newUrl,
          updated_at: new Date().toISOString()
        })
      });

      if (updateResponse.ok) {
        updated++;
      }
    }
  }

  return updated;
}

async function main() {
  console.log('='.repeat(60));
  console.log('FIX BRAVO TILE IMAGES');
  console.log('='.repeat(60));
  console.log('');

  // Get list of local images
  const files = fs.readdirSync(LOCAL_IMAGE_DIR).filter(f =>
    f.endsWith('.jpg') || f.endsWith('.jpeg') || f.endsWith('.png')
  );
  console.log(`Found ${files.length} local images to upload`);

  // Upload images and build mapping
  const imageMap = {};
  let uploaded = 0;
  let errors = 0;

  for (let i = 0; i < files.length; i++) {
    const filename = files[i];
    const filePath = path.join(LOCAL_IMAGE_DIR, filename);

    // Sanitize filename for Supabase
    const safeFilename = `bravo-tile-${filename}`
      .replace(/[^a-zA-Z0-9-_.]/g, '-')
      .replace(/-+/g, '-');

    process.stdout.write(`\r  Uploading ${i + 1}/${files.length}: ${filename.substring(0, 30).padEnd(30)}...`);

    const newUrl = await uploadImage(filePath, safeFilename);
    if (newUrl) {
      imageMap[filename] = newUrl;
      uploaded++;
    } else {
      errors++;
    }

    // Rate limiting
    await new Promise(r => setTimeout(r, 50));
  }

  console.log(`\n  Uploaded: ${uploaded}, Errors: ${errors}\n`);

  // Update database
  console.log('Updating product database...');
  const updatedProducts = await updateProductsWithNewUrls(imageMap);
  console.log(`Updated ${updatedProducts} products in database`);

  console.log('\n' + '='.repeat(60));
  console.log('COMPLETE');
  console.log('='.repeat(60));
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
