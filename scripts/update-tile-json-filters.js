#!/usr/bin/env node
/**
 * Update tile.json with filter metadata
 * Extracts unique values for each filter category
 */

const fs = require('fs');
const path = require('path');

const TILE_JSON = path.join(__dirname, '../data/tile.json');

// Load current tile.json
const data = JSON.parse(fs.readFileSync(TILE_JSON, 'utf8'));
const tiles = data.tile || [];

console.log(`Processing ${tiles.length} tiles...`);

// Extract unique values for each filter
const materials = new Set();
const colors = new Set();
const styles = new Set();
const brands = new Set();

tiles.forEach(tile => {
  if (tile.material) materials.add(tile.material);
  if (tile.primaryColor) colors.add(tile.primaryColor);
  if (tile.type) styles.add(tile.type);
  if (tile.brand) brands.add(tile.brand);
});

// Sort alphabetically
const sortedMaterials = [...materials].sort();
const sortedColors = [...colors].sort();
const sortedStyles = [...styles].sort();
const sortedBrands = [...brands].sort();

console.log(`\nFilter options extracted:`);
console.log(`  Materials: ${sortedMaterials.length}`);
console.log(`  Colors: ${sortedColors.length}`);
console.log(`  Styles: ${sortedStyles.length}`);
console.log(`  Brands: ${sortedBrands.length}`);

// Create new structure matching countertops.json
const newData = {
  filters: {
    materials: sortedMaterials,
    colors: sortedColors,
    styles: sortedStyles,
    brands: sortedBrands
  },
  tiles: tiles
};

// Save
fs.writeFileSync(TILE_JSON, JSON.stringify(newData, null, 2));
console.log(`\nSaved updated tile.json`);

// Print filter values
console.log('\nMaterials:', sortedMaterials.join(', '));
console.log('\nColors:', sortedColors.join(', '));
console.log('\nStyles:', sortedStyles.join(', '));
console.log('\nBrands:', sortedBrands.join(', '));
