#!/usr/bin/env node
/**
 * Add a new tile to tile.json
 * Usage: node scripts/add-tile.js "Tile Name" "brand-name" "material" "tile-type" "Primary Color" "https://image-url.jpg"
 *
 * Example:
 * node scripts/add-tile.js "Calacatta Gold 12x24" "msi" "Marble" "Polished" "White" "https://example.com/image.jpg"
 */

const fs = require('fs');
const path = require('path');

const TILE_JSON = path.join(__dirname, '../data/tile.json');
const TILES_DIR = path.join(__dirname, '../tiles');

// Get arguments
const args = process.argv.slice(2);

if (args.length < 2) {
  console.log(`
Tile Addition Tool
==================

Usage: node scripts/add-tile.js "Tile Name" "brand" [material] [type] [color] [imageUrl]

Arguments:
  name     - The display name of the tile (required)
  brand    - Brand slug: msi, bravo-tile, dal-tile, etc. (required)
  material - Material type: Marble, Porcelain, Ceramic, Natural Stone, etc.
  type     - Tile style: Polished, Honed, Tumbled, Matte, Mosaic, etc.
  color    - Primary color: White, Gray, Beige, Brown, Multi, etc.
  imageUrl - URL to the tile image

Examples:
  node scripts/add-tile.js "Calacatta Gold 12x24" "msi" "Marble" "Polished" "White"
  node scripts/add-tile.js "Subway White 3x6" "dal-tile" "Ceramic" "Glossy" "White" "https://..."

To add multiple tiles, create a CSV file and use: node scripts/import-tiles.js tiles.csv
  `);
  process.exit(0);
}

const [name, brand, material = '', type = 'Tile', primaryColor = '', imageUrl = ''] = args;

// Create slug from name
const slug = name.toLowerCase()
  .replace(/[^a-z0-9]+/g, '-')
  .replace(/^-|-$/g, '');

// Load existing data
const data = JSON.parse(fs.readFileSync(TILE_JSON, 'utf8'));

// Check if slug already exists
if (data.tiles.find(t => t.slug === slug)) {
  console.error(`Error: Tile with slug "${slug}" already exists!`);
  process.exit(1);
}

// Create new tile
const newTile = {
  name,
  slug,
  brand,
  primaryImage: imageUrl || '/images/placeholder-tile.jpg',
  primaryColor,
  type,
  material,
  category: 'tile'
};

// Add to tiles array
data.tiles.push(newTile);

// Update filters
const addToSet = (arr, value) => {
  if (value && !arr.includes(value)) {
    arr.push(value);
    arr.sort();
  }
};

addToSet(data.filters.materials, material);
addToSet(data.filters.colors, primaryColor);
addToSet(data.filters.styles, type);
addToSet(data.filters.brands, brand);

// Save JSON
fs.writeFileSync(TILE_JSON, JSON.stringify(data, null, 2));
console.log(`✓ Added tile: ${name}`);
console.log(`  Slug: ${slug}`);
console.log(`  Brand: ${brand}`);
console.log(`  Total tiles: ${data.tiles.length}`);

// Create tile page directory
const tileDir = path.join(TILES_DIR, slug);
if (!fs.existsSync(tileDir)) {
  fs.mkdirSync(tileDir, { recursive: true });
  console.log(`✓ Created directory: /tiles/${slug}/`);
  console.log(`  Note: Run 'node scripts/generate-bravo-tile-pages.js' to generate the page HTML`);
}
