#!/usr/bin/env node
/**
 * Extract all tile data from Webflow CMS page
 */

const fs = require('fs');
const path = require('path');

const HTML_FILE = '/tmp/all-tile-page.html';
const OUTPUT_FILE = path.join(__dirname, '../data/tile.json');

const html = fs.readFileSync(HTML_FILE, 'utf8');

// Split into chunks at each tile item
const chunks = html.split('role="listitem" class="materials_item w-dyn-item"');
console.log(`Found ${chunks.length - 1} tile chunks`);

const tiles = [];

for (let i = 1; i < chunks.length; i++) {
  const chunk = chunks[i].substring(0, 5000); // Only look at first 5000 chars of each

  try {
    // Extract slug from href
    const slugMatch = chunk.match(/href="\/tiles\/([^"]+)"/);
    if (!slugMatch) continue;
    const slug = slugMatch[1];

    // Extract images - look for both primary and secondary
    const primaryImgMatch = chunk.match(/class="product1_image is-primary"[^>]*src="([^"]+)"/);
    const altImgMatch = chunk.match(/src="([^"]+)"[^>]*class="product1_image is-primary"/);
    const anyImgMatch = chunk.match(/src="(https:\/\/cdn\.prod\.website-files\.com[^"]+)"/);

    const primaryImage = primaryImgMatch ? primaryImgMatch[1] :
                         altImgMatch ? altImgMatch[1] :
                         anyImgMatch ? anyImgMatch[1] : '';

    // Extract name from Keyword field
    const nameMatch = chunk.match(/fs-cmsfilter-field="Keyword"[^>]*>([^<]+)</);
    const name = nameMatch ? nameMatch[1].trim() : slug.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());

    // Extract other fields
    const styleMatch = chunk.match(/fs-cmsfilter-field="style"[^>]*>([^<]*)</);
    const materialMatch = chunk.match(/fs-cmsfilter-field="material"[^>]*>([^<]*)</);
    const colorMatch = chunk.match(/fs-cmsfilter-field="color"[^>]*>([^<]*)</);

    tiles.push({
      name,
      slug,
      brand: 'msi',
      primaryImage,
      primaryColor: colorMatch ? colorMatch[1].trim() : '',
      type: styleMatch ? styleMatch[1].trim() : 'Tile',
      material: materialMatch ? materialMatch[1].trim() : '',
      category: 'tile'
    });

  } catch (e) {
    console.error(`Error on chunk ${i}:`, e.message);
  }
}

console.log(`Extracted ${tiles.length} tiles`);

// Load existing tile.json
let existingData = { vendors: [], tile: [] };
try {
  existingData = JSON.parse(fs.readFileSync(OUTPUT_FILE, 'utf8'));
} catch (e) {}

// Keep Bravo Tile products
const bravoTiles = existingData.tile.filter(t => t.brand === 'bravo-tile');
console.log(`Keeping ${bravoTiles.length} Bravo Tile products`);

// Combine all tiles
const allTiles = [...tiles, ...bravoTiles];

// Remove duplicates
const uniqueTiles = [];
const seen = new Set();
for (const t of allTiles) {
  if (!seen.has(t.slug)) {
    seen.add(t.slug);
    uniqueTiles.push(t);
  }
}

// Get vendors
const vendors = [...new Set(uniqueTiles.map(t => t.brand))];

// Save
fs.writeFileSync(OUTPUT_FILE, JSON.stringify({ vendors, tile: uniqueTiles }, null, 2));
console.log(`Saved ${uniqueTiles.length} tiles to ${OUTPUT_FILE}`);

// Summary
const byBrand = {};
uniqueTiles.forEach(t => { byBrand[t.brand] = (byBrand[t.brand] || 0) + 1; });
console.log('\nBy brand:', byBrand);

// Show sample
console.log('\nSample tile:', JSON.stringify(uniqueTiles[0], null, 2));
