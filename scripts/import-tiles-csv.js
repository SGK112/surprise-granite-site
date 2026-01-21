#!/usr/bin/env node
/**
 * Import tiles from a CSV file
 * Usage: node scripts/import-tiles-csv.js tiles.csv
 *
 * CSV format (with header row):
 * name,brand,material,type,color,imageUrl
 * "Calacatta Gold 12x24","msi","Marble","Polished","White","https://..."
 */

const fs = require('fs');
const path = require('path');

const TILE_JSON = path.join(__dirname, '../data/tile.json');

const csvFile = process.argv[2];

if (!csvFile) {
  console.log(`
CSV Tile Import Tool
====================

Usage: node scripts/import-tiles-csv.js path/to/tiles.csv

CSV Format (first row is header):
name,brand,material,type,color,imageUrl

Required columns: name, brand
Optional columns: material, type, color, imageUrl

Example CSV content:
name,brand,material,type,color,imageUrl
"Calacatta Gold 12x24","msi","Marble","Polished","White","https://example.com/img.jpg"
"Subway White 3x6","dal-tile","Ceramic","Glossy","White",""
"Travertine Versailles","msi","Travertine","Tumbled","Beige",""
  `);
  process.exit(0);
}

if (!fs.existsSync(csvFile)) {
  console.error(`Error: File not found: ${csvFile}`);
  process.exit(1);
}

// Parse CSV
function parseCSV(content) {
  const lines = content.split('\n').filter(line => line.trim());
  const headers = parseCSVLine(lines[0]);
  const rows = [];

  for (let i = 1; i < lines.length; i++) {
    const values = parseCSVLine(lines[i]);
    const row = {};
    headers.forEach((header, idx) => {
      row[header.trim().toLowerCase()] = values[idx] || '';
    });
    rows.push(row);
  }

  return rows;
}

function parseCSVLine(line) {
  const result = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current.trim());

  return result;
}

// Load existing data
const data = JSON.parse(fs.readFileSync(TILE_JSON, 'utf8'));
const existingSlugs = new Set(data.tiles.map(t => t.slug));

// Parse CSV
const csvContent = fs.readFileSync(csvFile, 'utf8');
const rows = parseCSV(csvContent);

console.log(`Found ${rows.length} tiles in CSV\n`);

let added = 0;
let skipped = 0;

for (const row of rows) {
  const name = row.name;
  const brand = row.brand;

  if (!name || !brand) {
    console.log(`⚠ Skipped row (missing name or brand): ${JSON.stringify(row)}`);
    skipped++;
    continue;
  }

  const slug = name.toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

  if (existingSlugs.has(slug)) {
    console.log(`⚠ Skipped (duplicate): ${name}`);
    skipped++;
    continue;
  }

  const tile = {
    name,
    slug,
    brand,
    primaryImage: row.imageurl || row.image || '/images/placeholder-tile.jpg',
    primaryColor: row.color || row.primarycolor || '',
    type: row.type || row.style || 'Tile',
    material: row.material || '',
    category: 'tile'
  };

  data.tiles.push(tile);
  existingSlugs.add(slug);

  // Update filters
  if (tile.material && !data.filters.materials.includes(tile.material)) {
    data.filters.materials.push(tile.material);
  }
  if (tile.primaryColor && !data.filters.colors.includes(tile.primaryColor)) {
    data.filters.colors.push(tile.primaryColor);
  }
  if (tile.type && !data.filters.styles.includes(tile.type)) {
    data.filters.styles.push(tile.type);
  }
  if (tile.brand && !data.filters.brands.includes(tile.brand)) {
    data.filters.brands.push(tile.brand);
  }

  console.log(`✓ Added: ${name}`);
  added++;
}

// Sort filters
data.filters.materials.sort();
data.filters.colors.sort();
data.filters.styles.sort();
data.filters.brands.sort();

// Save
fs.writeFileSync(TILE_JSON, JSON.stringify(data, null, 2));

console.log(`\n========================================`);
console.log(`Added: ${added} tiles`);
console.log(`Skipped: ${skipped} tiles`);
console.log(`Total tiles: ${data.tiles.length}`);
console.log(`========================================`);
console.log(`\nTo generate individual tile pages, run:`);
console.log(`node scripts/generate-bravo-tile-pages.js`);
