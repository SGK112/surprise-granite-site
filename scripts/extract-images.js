#!/usr/bin/env node
/**
 * Extract all product images from backup static pages
 * and update countertops.json with full image arrays
 */

const fs = require('fs');
const path = require('path');

const BACKUP_DIR = path.join(__dirname, '../.backup-20260131-142601/countertops');
const JSON_FILE = path.join(__dirname, '../data/countertops.json');

// Read current JSON
const data = JSON.parse(fs.readFileSync(JSON_FILE, 'utf8'));
const products = data.countertops;

console.log(`Processing ${products.length} products...`);

let updated = 0;
let errors = 0;

products.forEach((product, index) => {
  const productDir = path.join(BACKUP_DIR, product.slug);
  const indexFile = path.join(productDir, 'index.html');

  if (!fs.existsSync(indexFile)) {
    console.log(`  [SKIP] No backup for: ${product.slug}`);
    return;
  }

  try {
    const html = fs.readFileSync(indexFile, 'utf8');

    // Extract all CDN image URLs (excluding favicons/icons)
    const imageRegex = /https:\/\/(?:cdn\.prod\.website-files\.com|uploads-ssl\.webflow\.com)\/6456ce4476abb2d4f9fbad10\/[^"'\s]+\.(?:jpg|jpeg|png|webp)/gi;
    const matches = html.match(imageRegex) || [];

    // Dedupe and filter out duplicates
    const uniqueImages = [...new Set(matches)];

    // Filter to only product images (not general site images)
    const productImages = uniqueImages.filter(url => {
      const lower = url.toLowerCase();
      // Must be from the product image folder and likely be a product image
      return lower.includes('6456ce4476abb2d4f9fbad10') &&
             !lower.includes('favicon') &&
             !lower.includes('webclip') &&
             !lower.includes('icon');
    });

    if (productImages.length > 0) {
      // Store as images array
      product.images = productImages;
      updated++;

      if (productImages.length > 2) {
        console.log(`  [+${productImages.length}] ${product.name}`);
      }
    }
  } catch (err) {
    console.log(`  [ERROR] ${product.slug}: ${err.message}`);
    errors++;
  }
});

// Write updated JSON
fs.writeFileSync(JSON_FILE, JSON.stringify(data, null, 2));

console.log(`\nDone!`);
console.log(`  Updated: ${updated} products`);
console.log(`  Errors: ${errors}`);
console.log(`  JSON saved to: ${JSON_FILE}`);
