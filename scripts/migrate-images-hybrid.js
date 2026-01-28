#!/usr/bin/env node
/**
 * Hybrid Image Migration Script
 *
 * - MSI products: Use MSI CDN URLs directly
 * - Non-MSI products: Download from Webflow and upload to Supabase Storage
 *
 * Usage:
 *   node scripts/migrate-images-hybrid.js
 *
 * Options:
 *   --dry-run       Preview changes without applying them
 *   --msi-only      Only update MSI products to use MSI CDN
 *   --storage-only  Only migrate non-MSI to Supabase Storage
 *   --limit=N       Process only N products (for testing)
 */

const fs = require('fs');
const path = require('path');

// Configuration
const SUPABASE_URL = 'https://ypeypgwsycxcagncgdur.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const STORAGE_BUCKET = 'product-images';

// Parse arguments
const args = process.argv.slice(2);
const isDryRun = args.includes('--dry-run');
const msiOnly = args.includes('--msi-only');
const storageOnly = args.includes('--storage-only');
const limitArg = args.find(a => a.startsWith('--limit='));
const limit = limitArg ? parseInt(limitArg.split('=')[1]) : null;

if (!SUPABASE_SERVICE_KEY) {
  console.error('ERROR: SUPABASE_SERVICE_KEY environment variable required');
  process.exit(1);
}

// MSI URL patterns
const MSI_PATTERNS = {
  quartz: (slug) => `https://images.msisurfaces.com/images/quartz/${slug}/quartz-${slug}-702x702.jpg`,
  granite: (slug) => `https://images.msisurfaces.com/images/granite/${slug}/granite-${slug}-702x702.jpg`,
  marble: (slug) => `https://images.msisurfaces.com/images/marble/${slug}/marble-${slug}-702x702.jpg`,
  quartzite: (slug) => `https://images.msisurfaces.com/images/quartzite/${slug}/quartzite-${slug}-702x702.jpg`,
  porcelain: (slug) => `https://images.msisurfaces.com/images/porcelain/${slug}/porcelain-${slug}-702x702.jpg`,
  lvt: (slug) => `https://images.msisurfaces.com/images/lvt-vinyl/${slug}/${slug}-702x702.jpg`,
  tile: (slug) => `https://images.msisurfaces.com/images/tile/${slug}/${slug}-702x702.jpg`,
  default: (slug) => `https://images.msisurfaces.com/images/quartz/${slug}/quartz-${slug}-702x702.jpg`
};

// Known MSI vendor names
const MSI_VENDORS = ['msi', 'msi surfaces', 'msi-surfaces', 'msisurfaces'];

/**
 * Check if product is from MSI
 */
function isMsiProduct(product) {
  const vendor = (product.vendor || '').toLowerCase().trim();
  return MSI_VENDORS.some(v => vendor.includes(v));
}

/**
 * Generate MSI CDN URL for a product
 */
function generateMsiUrl(product) {
  const name = product.name || '';
  const handle = product.handle || '';
  const productType = (product.product_type || '').toLowerCase();

  // Create slug from handle or name
  let slug = handle || name.toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-+/g, '-')
    .replace(/(^-|-$)/g, '');

  // Remove common suffixes
  slug = slug
    .replace(/-quartz$/, '')
    .replace(/-granite$/, '')
    .replace(/-marble$/, '')
    .replace(/-quartzite$/, '')
    .replace(/-porcelain$/, '')
    .replace(/-tile$/, '')
    .replace(/-slab$/, '');

  // Determine product category for URL pattern
  let category = 'default';
  if (productType.includes('quartz')) category = 'quartz';
  else if (productType.includes('granite')) category = 'granite';
  else if (productType.includes('marble')) category = 'marble';
  else if (productType.includes('quartzite')) category = 'quartzite';
  else if (productType.includes('porcelain')) category = 'porcelain';
  else if (productType.includes('vinyl') || productType.includes('lvt') || productType.includes('flooring')) category = 'lvt';
  else if (productType.includes('tile')) category = 'tile';

  const patternFn = MSI_PATTERNS[category] || MSI_PATTERNS.default;
  return patternFn(slug);
}

/**
 * Verify MSI URL is accessible
 */
async function verifyMsiUrl(url) {
  try {
    const response = await fetch(url, { method: 'HEAD' });
    return response.ok;
  } catch {
    return false;
  }
}

/**
 * Download image from URL
 */
async function downloadImage(url) {
  try {
    // Handle relative URLs
    let fullUrl = url;
    if (url.startsWith('/')) {
      // Skip relative URLs that don't have a base domain
      console.error(`  Download failed: Relative URL without base: ${url.substring(0, 50)}`);
      return null;
    }

    // Ensure https
    if (url.startsWith('http://')) {
      fullUrl = url.replace('http://', 'https://');
    }

    const response = await fetch(fullUrl);
    if (!response.ok) return null;

    const buffer = await response.arrayBuffer();
    const contentType = response.headers.get('content-type') || 'image/jpeg';

    return { buffer: Buffer.from(buffer), contentType };
  } catch (err) {
    console.error(`  Download failed: ${err.message}`);
    return null;
  }
}

/**
 * Upload image to Supabase Storage
 */
async function uploadToSupabase(imageData, filename) {
  const url = `${SUPABASE_URL}/storage/v1/object/${STORAGE_BUCKET}/${filename}`;

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
        'Content-Type': imageData.contentType,
        'x-upsert': 'true'
      },
      body: imageData.buffer
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(error);
    }

    // Return public URL
    return `${SUPABASE_URL}/storage/v1/object/public/${STORAGE_BUCKET}/${filename}`;
  } catch (err) {
    console.error(`  Upload failed: ${err.message}`);
    return null;
  }
}

/**
 * Update product image_url in database
 */
async function updateProductImageUrl(productId, newUrl) {
  const url = `${SUPABASE_URL}/rest/v1/shopify_products?id=eq.${productId}`;

  try {
    const response = await fetch(url, {
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

    return response.ok;
  } catch {
    return false;
  }
}

/**
 * Fetch all products from Supabase
 */
async function fetchProducts() {
  const products = [];
  let offset = 0;
  const pageSize = 1000;

  while (true) {
    const url = `${SUPABASE_URL}/rest/v1/shopify_products?select=id,name,handle,vendor,product_type,image_url&order=id&offset=${offset}&limit=${pageSize}`;

    const response = await fetch(url, {
      headers: {
        'apikey': SUPABASE_SERVICE_KEY,
        'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`
      }
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch products: ${response.statusText}`);
    }

    const batch = await response.json();
    if (batch.length === 0) break;

    products.push(...batch);
    offset += pageSize;

    if (limit && products.length >= limit) {
      return products.slice(0, limit);
    }
  }

  return products;
}

/**
 * Ensure storage bucket exists
 */
async function ensureBucketExists() {
  // Check if bucket exists
  const listUrl = `${SUPABASE_URL}/storage/v1/bucket/${STORAGE_BUCKET}`;
  const checkResponse = await fetch(listUrl, {
    headers: {
      'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`
    }
  });

  if (checkResponse.ok) {
    console.log(`Storage bucket '${STORAGE_BUCKET}' exists`);
    return true;
  }

  // Create bucket
  console.log(`Creating storage bucket '${STORAGE_BUCKET}'...`);
  const createUrl = `${SUPABASE_URL}/storage/v1/bucket`;
  const createResponse = await fetch(createUrl, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      id: STORAGE_BUCKET,
      name: STORAGE_BUCKET,
      public: true
    })
  });

  if (!createResponse.ok) {
    const error = await createResponse.text();
    console.error(`Failed to create bucket: ${error}`);
    return false;
  }

  console.log(`Bucket '${STORAGE_BUCKET}' created successfully`);
  return true;
}

/**
 * Get file extension from URL or content type
 */
function getExtension(url, contentType) {
  // Try from URL
  const urlMatch = url.match(/\.(jpg|jpeg|png|webp|avif|gif)(\?|$)/i);
  if (urlMatch) return urlMatch[1].toLowerCase();

  // From content type
  if (contentType) {
    if (contentType.includes('jpeg') || contentType.includes('jpg')) return 'jpg';
    if (contentType.includes('png')) return 'png';
    if (contentType.includes('webp')) return 'webp';
    if (contentType.includes('avif')) return 'avif';
    if (contentType.includes('gif')) return 'gif';
  }

  return 'jpg';
}

/**
 * Main migration function
 */
async function main() {
  console.log('='.repeat(60));
  console.log('HYBRID IMAGE MIGRATION');
  console.log('MSI Products → MSI CDN');
  console.log('Other Products → Supabase Storage');
  console.log('='.repeat(60));
  console.log('');

  if (isDryRun) {
    console.log('*** DRY RUN MODE - No changes will be made ***\n');
  }

  // Ensure bucket exists
  if (!storageOnly && !isDryRun) {
    const bucketReady = await ensureBucketExists();
    if (!bucketReady && !msiOnly) {
      console.error('Cannot proceed without storage bucket');
      process.exit(1);
    }
  }

  // Fetch all products
  console.log('Fetching products from Supabase...');
  const products = await fetchProducts();
  console.log(`Found ${products.length} products\n`);

  // Categorize products
  const msiProducts = products.filter(p => isMsiProduct(p));
  const otherProducts = products.filter(p => !isMsiProduct(p));

  console.log(`MSI Products: ${msiProducts.length}`);
  console.log(`Other Products: ${otherProducts.length}\n`);

  let msiUpdated = 0;
  let msiSkipped = 0;
  let msiErrors = 0;
  let storageUploaded = 0;
  let storageSkipped = 0;
  let storageErrors = 0;

  // Process MSI products
  if (!storageOnly) {
    console.log('--- MSI PRODUCTS (Using MSI CDN) ---');

    for (let i = 0; i < msiProducts.length; i++) {
      const product = msiProducts[i];
      const msiUrl = generateMsiUrl(product);

      // Check if already using MSI CDN
      if (product.image_url && product.image_url.includes('msisurfaces.com')) {
        msiSkipped++;
        continue;
      }

      process.stdout.write(`\r  Processing ${i + 1}/${msiProducts.length}: ${product.name.substring(0, 30)}...`);

      // Verify URL is valid
      const isValid = await verifyMsiUrl(msiUrl);

      if (isValid) {
        if (!isDryRun) {
          const updated = await updateProductImageUrl(product.id, msiUrl);
          if (updated) {
            msiUpdated++;
          } else {
            msiErrors++;
          }
        } else {
          msiUpdated++;
        }
      } else {
        // MSI URL not valid, will be handled by storage migration
        msiSkipped++;
      }
    }
    console.log(`\n  Updated: ${msiUpdated}, Skipped: ${msiSkipped}, Errors: ${msiErrors}\n`);
  }

  // Process non-MSI products (upload to Supabase Storage)
  if (!msiOnly) {
    console.log('--- OTHER PRODUCTS (Uploading to Supabase Storage) ---');

    // Also include MSI products that failed MSI CDN verification
    const toUpload = storageOnly ? otherProducts : [
      ...otherProducts,
      ...msiProducts.filter(p => {
        // Include if not using MSI CDN and not already in Supabase storage
        return !p.image_url?.includes('msisurfaces.com') &&
               !p.image_url?.includes('supabase.co/storage');
      })
    ];

    console.log(`  Products to process: ${toUpload.length}`);

    for (let i = 0; i < toUpload.length; i++) {
      const product = toUpload[i];

      // Skip if no image or already in Supabase storage
      if (!product.image_url) {
        storageSkipped++;
        continue;
      }

      if (product.image_url.includes('supabase.co/storage')) {
        storageSkipped++;
        continue;
      }

      process.stdout.write(`\r  Processing ${i + 1}/${toUpload.length}: ${product.name.substring(0, 30).padEnd(30)}...`);

      if (isDryRun) {
        storageUploaded++;
        continue;
      }

      // Download image
      const imageData = await downloadImage(product.image_url);
      if (!imageData) {
        storageErrors++;
        continue;
      }

      // Generate filename - sanitize to remove special characters
      const ext = getExtension(product.image_url, imageData.contentType);
      const safeHandle = (product.handle || product.id)
        .replace(/[™®©]/g, '')
        .replace(/[^a-zA-Z0-9-_]/g, '-')
        .replace(/-+/g, '-')
        .substring(0, 100);
      const filename = `${safeHandle}.${ext}`;

      // Upload to Supabase
      const newUrl = await uploadToSupabase(imageData, filename);
      if (!newUrl) {
        storageErrors++;
        continue;
      }

      // Update database
      const updated = await updateProductImageUrl(product.id, newUrl);
      if (updated) {
        storageUploaded++;
      } else {
        storageErrors++;
      }

      // Rate limiting
      await new Promise(r => setTimeout(r, 100));
    }
    console.log(`\n  Uploaded: ${storageUploaded}, Skipped: ${storageSkipped}, Errors: ${storageErrors}\n`);
  }

  // Summary
  console.log('='.repeat(60));
  console.log('MIGRATION SUMMARY');
  console.log('='.repeat(60));
  console.log(`  MSI CDN:           ${msiUpdated} updated, ${msiSkipped} skipped`);
  console.log(`  Supabase Storage:  ${storageUploaded} uploaded, ${storageSkipped} skipped`);
  console.log(`  Total Errors:      ${msiErrors + storageErrors}`);
  console.log('');

  if (isDryRun) {
    console.log('This was a DRY RUN. Run without --dry-run to apply changes.');
  }
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
