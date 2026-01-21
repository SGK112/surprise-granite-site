#!/usr/bin/env node
/**
 * Sync all Bravo Tile products from bravo-tile-images.json to tile.json
 * This ensures all 300+ Bravo tiles are included
 */

const fs = require('fs');
const path = require('path');

const IMAGES_JSON = path.join(__dirname, '../data/bravo-tile-images.json');
const TILE_JSON = path.join(__dirname, '../data/tile.json');
const BRAVO_JSON = path.join(__dirname, '../data/bravo-tile.json');

// Load data
const allImages = JSON.parse(fs.readFileSync(IMAGES_JSON, 'utf8'));
const tileData = JSON.parse(fs.readFileSync(TILE_JSON, 'utf8'));
const bravoData = JSON.parse(fs.readFileSync(BRAVO_JSON, 'utf8'));

console.log('Bravo tile images available:', allImages.length);
console.log('Current tiles in tile.json:', tileData.tiles.length);
console.log('Bravo tiles in tile.json:', tileData.tiles.filter(t => t.brand === 'bravo-tile').length);

// Create lookup for existing bravo products (by name for better matching)
const existingBravoByName = new Map();
bravoData.products.forEach(p => {
  existingBravoByName.set(p.name.toLowerCase(), p);
});

// Create set of existing slugs in tile.json
const existingSlugs = new Set(tileData.tiles.map(t => t.slug));

// Helper to create slug
function createSlug(name) {
  return name.toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

// Helper to guess material from name
function guessMaterial(name) {
  const n = name.toLowerCase();
  if (n.includes('marble') || n.includes('carrara') || n.includes('calacatta') || n.includes('thassos') || n.includes('emperador')) return 'Marble';
  if (n.includes('travertine') || n.includes('tumbled') || n.includes('versailles')) return 'Travertine';
  if (n.includes('porcelain')) return 'Porcelain';
  if (n.includes('ceramic')) return 'Ceramic';
  if (n.includes('glass')) return 'Glass';
  if (n.includes('slate')) return 'Slate';
  if (n.includes('quartzite')) return 'Quartzite';
  if (n.includes('granite')) return 'Granite';
  if (n.includes('limestone')) return 'Limestone';
  if (n.includes('onyx')) return 'Onyx';
  if (n.includes('basalt')) return 'Basalt';
  if (n.includes('ledger') || n.includes('stacked stone')) return 'Natural Stone';
  if (n.includes('mosaic')) return 'Mosaic';
  if (n.includes('paver')) return 'Paver';
  if (n.includes('molding') || n.includes('pencil') || n.includes('chair rail')) return 'Trim';
  return 'Natural Stone';
}

// Helper to guess type from name
function guessType(name) {
  const n = name.toLowerCase();
  if (n.includes('polished')) return 'Polished';
  if (n.includes('honed')) return 'Honed';
  if (n.includes('tumbled')) return 'Tumbled';
  if (n.includes('matte')) return 'Matte';
  if (n.includes('mosaic')) return 'Mosaic';
  if (n.includes('hexagon')) return 'Hexagon';
  if (n.includes('herringbone')) return 'Herringbone';
  if (n.includes('subway')) return 'Subway';
  if (n.includes('ledger')) return 'Ledger Panel';
  if (n.includes('versailles')) return 'Versailles Pattern';
  if (n.includes('basketweave')) return 'Basketweave';
  if (n.includes('penny')) return 'Penny Round';
  if (n.includes('paver')) return 'Paver';
  if (n.includes('coping')) return 'Pool Coping';
  if (n.includes('molding') || n.includes('pencil') || n.includes('chair rail')) return 'Molding';
  return 'Field Tile';
}

// Helper to guess color from name
function guessColor(name) {
  const n = name.toLowerCase();
  if (n.includes('white') || n.includes('bianco') || n.includes('arctic')) return 'White';
  if (n.includes('grey') || n.includes('gray') || n.includes('gris')) return 'Gray';
  if (n.includes('beige') || n.includes('cream') || n.includes('crema') || n.includes('ivory')) return 'Beige';
  if (n.includes('brown') || n.includes('noce') || n.includes('walnut') || n.includes('nut')) return 'Brown';
  if (n.includes('black') || n.includes('noir') || n.includes('nero')) return 'Black';
  if (n.includes('gold') || n.includes('golden') || n.includes('honey')) return 'Gold';
  if (n.includes('blue') || n.includes('azul')) return 'Blue';
  if (n.includes('green') || n.includes('verde')) return 'Green';
  if (n.includes('silver')) return 'Silver';
  if (n.includes('red') || n.includes('copper')) return 'Red';
  if (n.includes('autumn') || n.includes('multi')) return 'Multi';
  return '';
}

let added = 0;
let skipped = 0;

// Process all images
for (const img of allImages) {
  const slug = createSlug(img.name);

  // Skip if already exists
  if (existingSlugs.has(slug)) {
    skipped++;
    continue;
  }

  // Check if we have more detailed info from bravo products
  const existingProduct = existingBravoByName.get(img.name.toLowerCase());

  const tile = {
    name: img.name,
    slug: slug,
    brand: 'bravo-tile',
    primaryImage: img.image || '/images/placeholder-tile.jpg',
    primaryColor: existingProduct?.primaryColor || guessColor(img.name),
    type: existingProduct?.type || guessType(img.name),
    material: existingProduct?.material || guessMaterial(img.name),
    category: existingProduct?.category || 'tile'
  };

  tileData.tiles.push(tile);
  existingSlugs.add(slug);
  added++;
}

console.log('\nAdded:', added, 'new Bravo tiles');
console.log('Skipped:', skipped, '(already existed)');
console.log('Total tiles now:', tileData.tiles.length);

// Update filters
const materials = new Set();
const colors = new Set();
const styles = new Set();
const brands = new Set();

tileData.tiles.forEach(tile => {
  if (tile.material) materials.add(tile.material);
  if (tile.primaryColor) colors.add(tile.primaryColor);
  if (tile.type) styles.add(tile.type);
  if (tile.brand) brands.add(tile.brand);
});

tileData.filters = {
  materials: [...materials].sort(),
  colors: [...colors].sort(),
  styles: [...styles].sort(),
  brands: [...brands].sort()
};

console.log('\nUpdated filters:');
console.log('  Materials:', tileData.filters.materials.length);
console.log('  Colors:', tileData.filters.colors.length);
console.log('  Styles:', tileData.filters.styles.length);
console.log('  Brands:', tileData.filters.brands.length);

// Save
fs.writeFileSync(TILE_JSON, JSON.stringify(tileData, null, 2));
console.log('\nSaved to', TILE_JSON);

// Count by brand
const byBrand = {};
tileData.tiles.forEach(t => {
  byBrand[t.brand] = (byBrand[t.brand] || 0) + 1;
});
console.log('\nTiles by brand:', byBrand);
