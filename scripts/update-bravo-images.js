#!/usr/bin/env node
/**
 * Update Bravo Tile Products with Image URLs
 * Matches downloaded images to Supabase products and generates update SQL
 */

const fs = require('fs');
const path = require('path');

// File paths
const IMAGES_JSON = path.join(__dirname, '../data/bravo-tile-images.json');
const BRAVO_JSON = path.join(__dirname, '../data/bravo-tile.json');
const SQL_OUTPUT = path.join(__dirname, '../database/bravo-tile-image-updates.sql');

// Load data
const images = JSON.parse(fs.readFileSync(IMAGES_JSON, 'utf8'));
const bravoData = JSON.parse(fs.readFileSync(BRAVO_JSON, 'utf8'));

// Our Supabase products (names we inserted)
const supabaseProducts = [
  // Porcelain Wood Look
  { name: 'Listone Noce', sku: 'BT-LN-936' },
  { name: 'Listone Iroko', sku: 'BT-LI-936' },
  { name: 'Amalfi Gris', sku: 'BT-AG-848' },
  { name: 'Rango Americano', sku: 'BT-RA-848' },
  { name: 'Avana Brown', sku: 'BT-AB-848' },
  { name: 'Bianca Sabbia', sku: 'BT-BS-848' },
  { name: 'Montana Marrone', sku: 'BT-MM-848' },
  { name: 'Sequoia White', sku: 'BT-SW-848' },
  { name: 'Sequoia Nut', sku: 'BT-SN-848' },
  { name: 'Sequoia Brown', sku: 'BT-SB-848' },
  // Stone Look
  { name: 'Antique White Polished', sku: 'BT-AWP-2448' },
  { name: 'Antique White Matte', sku: 'BT-AWM-2448' },
  { name: 'Calacatta Extra Polished', sku: 'BT-CEP-2448' },
  { name: 'Calacatta Extra Matte', sku: 'BT-CEM-2448' },
  { name: 'Lakestone Grey', sku: 'BT-LG-2448' },
  { name: 'Lakestone Beige', sku: 'BT-LB-2448' },
  { name: 'Medici Blue Polished', sku: 'BT-MBP-2448' },
  { name: 'Medici Gold Polished', sku: 'BT-MGP-2448' },
  { name: 'Statuario Qua Polished', sku: 'BT-SQP-2448' },
  { name: 'Noir Laurent Lux', sku: 'BT-NLL-2448' },
  // Travertine
  { name: 'Autumn Leaves 12x12 Tumbled', sku: 'BT-AL-1212T' },
  { name: 'Autumn Leaves 18x18 Tumbled', sku: 'BT-AL-1818T' },
  { name: 'Autumn Leaves Versailles Pattern', sku: 'BT-AL-VP' },
  { name: 'Noce 12x12 Tumbled', sku: 'BT-NC-1212T' },
  { name: 'Noce 18x18 Tumbled', sku: 'BT-NC-1818T' },
  { name: 'Noce Versailles Pattern', sku: 'BT-NC-VP' },
  { name: 'Crema Classico 12x12 Tumbled', sku: 'BT-CC-1212T' },
  { name: 'Ivory Platinum 12x12 Honed', sku: 'BT-IP-1212H' },
  { name: 'Silver 12x12 Tumbled', sku: 'BT-SV-1212T' },
  { name: 'Gold 12x12 Tumbled', sku: 'BT-GD-1212T' },
  // Marble
  { name: 'Italian White Carrara 12x12', sku: 'BT-WC-1212P' },
  { name: 'Italian White Carrara 18x18', sku: 'BT-WC-1818P' },
  { name: 'Italian White Carrara 12x24', sku: 'BT-WC-1224P' },
  { name: 'Crema Marfil Select 12x12', sku: 'BT-CM-1212P' },
  { name: 'Calacatta Gold 12x12', sku: 'BT-CG-1212P' },
  { name: 'Calacatta Gold 12x24', sku: 'BT-CG-1224P' },
  { name: 'Thassos 12x12', sku: 'BT-TH-1212P' },
  { name: 'Emperador Dark 12x12', sku: 'BT-ED-1212P' },
  { name: 'Emperador Light 12x12', sku: 'BT-EL-1212P' },
  { name: 'Statuary 12x12', sku: 'BT-ST-1212P' },
  // Limestone
  { name: 'Desert Pearl 12x12', sku: 'BT-DP-1212H' },
  { name: 'Desert Pearl 18x18', sku: 'BT-DP-1818H' },
  { name: 'Haisa Light 12x24', sku: 'BT-HL-1224H' },
  { name: 'Lagos Blue 12x24', sku: 'BT-LBL-1224H' },
  // Mosaics
  { name: 'White Carrara 2x2 Mosaic', sku: 'BT-WCM-22' },
  { name: 'White Carrara Herringbone Mosaic', sku: 'BT-WCM-HB' },
  { name: 'White Carrara Hexagon Mosaic', sku: 'BT-WCM-HX' },
  { name: 'White Carrara Basketweave Mosaic', sku: 'BT-WCM-BW' },
  { name: 'Calacatta Gold 2x2 Mosaic', sku: 'BT-CGM-22' },
  { name: 'Thassos Hexagon Mosaic', sku: 'BT-THM-HX' },
  { name: 'Crema Classico 2x2 Mosaic', sku: 'BT-CCM-22T' },
  { name: 'Noce 2x2 Mosaic', sku: 'BT-NCM-22T' },
  // Ledger Panels
  { name: 'Alaska Grey Ledger Panel', sku: 'BT-AG-LP' },
  { name: 'Arctic White Ledger Panel', sku: 'BT-AW-LP' },
  { name: 'Coal Canyon Ledger Panel', sku: 'BT-CC-LP' },
  { name: 'Golden Honey Ledger Panel', sku: 'BT-GH-LP' },
  { name: 'Sierra Blue Ledger Panel', sku: 'BT-SBL-LP' },
  // Pavers
  { name: 'Quartz Bone Paver 24x24', sku: 'BT-QBP-2424' },
  { name: 'Quartz Grey Paver 24x24', sku: 'BT-QGP-2424' },
  { name: 'Autumn Leaves Paver 16x24', sku: 'BT-AL-1624P' },
  // Moldings
  { name: 'Autumn Leaves Pencil Molding', sku: 'BT-AL-PM' },
  { name: 'White Carrara Pencil Molding', sku: 'BT-WC-PM' },
  { name: 'White Carrara Chair Rail', sku: 'BT-WC-CR' },
  { name: 'Calacatta Gold Chair Rail', sku: 'BT-CG-CR' },
  // Pool Coping
  { name: 'Autumn Leaves Pool Coping', sku: 'BT-AL-PC' },
];

/**
 * Normalize string for matching
 */
function normalize(str) {
  return str
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
    .replace(/\d+x\d+/g, '') // Remove dimensions like 12x12
    .replace(/tumbled|polished|honed|matte|filled/gi, '') // Remove finishes
    .trim();
}

/**
 * Calculate similarity score between two strings
 */
function similarity(s1, s2) {
  const n1 = normalize(s1);
  const n2 = normalize(s2);

  if (n1 === n2) return 1;
  if (n1.includes(n2) || n2.includes(n1)) return 0.9;

  // Check word overlap
  const words1 = n1.match(/[a-z]+/g) || [];
  const words2 = n2.match(/[a-z]+/g) || [];
  const common = words1.filter(w => words2.includes(w)).length;
  const total = Math.max(words1.length, words2.length);

  return total > 0 ? common / total : 0;
}

/**
 * Find best matching image for a product
 */
function findBestImage(productName, downloadedImages) {
  let bestMatch = null;
  let bestScore = 0;

  for (const img of downloadedImages) {
    if (img.status !== 'downloaded') continue;

    const score = similarity(productName, img.name);
    if (score > bestScore && score >= 0.5) {
      bestScore = score;
      bestMatch = img;
    }
  }

  return bestMatch;
}

// Build image lookup by normalized name
const imageByName = {};
for (const img of images) {
  if (img.status === 'downloaded') {
    // Store by various normalized versions
    const key = normalize(img.name);
    imageByName[key] = img;

    // Also store by filename
    const filename = path.basename(img.image, '.jpg');
    imageByName[filename.replace(/-/g, '')] = img;
  }
}

// Match products to images
const matches = [];
const unmatched = [];

for (const product of supabaseProducts) {
  const match = findBestImage(product.name, images);

  if (match) {
    matches.push({
      productName: product.name,
      sku: product.sku,
      imagePath: match.image,
      imageName: match.name,
    });
  } else {
    unmatched.push(product);
  }
}

console.log('='.repeat(60));
console.log('Bravo Tile Image Matcher');
console.log('='.repeat(60));
console.log(`\nMatched: ${matches.length}/${supabaseProducts.length} products`);
console.log(`Unmatched: ${unmatched.length} products\n`);

// Show matches
console.log('MATCHED PRODUCTS:');
matches.forEach(m => {
  console.log(`  ✓ ${m.productName} → ${path.basename(m.imagePath)}`);
});

if (unmatched.length > 0) {
  console.log('\nUNMATCHED PRODUCTS:');
  unmatched.forEach(p => {
    console.log(`  ✗ ${p.name} (${p.sku})`);
  });
}

// Generate SQL update script
let sql = `-- =====================================================
-- BRAVO TILE IMAGE URL UPDATES
-- Run this in Supabase SQL Editor
-- =====================================================

`;

// For each match, create an UPDATE statement
for (const match of matches) {
  sql += `UPDATE distributor_products
SET primary_image_url = '${match.imagePath}'
WHERE sku = '${match.sku}'
  AND distributor_id = (SELECT id FROM distributor_profiles WHERE slug = 'bravo-tile-stone');\n\n`;
}

sql += `-- Verify updates
SELECT name, sku, primary_image_url
FROM distributor_products
WHERE distributor_id = (SELECT id FROM distributor_profiles WHERE slug = 'bravo-tile-stone')
  AND primary_image_url IS NOT NULL
ORDER BY name;
`;

// Write SQL file
fs.writeFileSync(SQL_OUTPUT, sql);
console.log(`\nSQL file written to: ${SQL_OUTPUT}`);

// Update bravo-tile.json with image paths
let updatedCount = 0;
for (const product of bravoData.products) {
  const match = findBestImage(product.name, images);
  if (match) {
    product.primaryImage = match.image;
    updatedCount++;
  }
}

fs.writeFileSync(BRAVO_JSON, JSON.stringify(bravoData, null, 2));
console.log(`Updated ${updatedCount} products in bravo-tile.json`);

console.log('\n' + '='.repeat(60));
console.log('COMPLETE');
console.log('='.repeat(60));
console.log('\nNext steps:');
console.log('1. Run the SQL in Supabase: database/bravo-tile-image-updates.sql');
console.log('2. Images are at: /images/vendors/bravo-tile/');
