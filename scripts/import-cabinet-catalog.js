#!/usr/bin/env node
/**
 * Turn a cabinet manufacturer's SKU list into a catalog the designer can load.
 *
 * Catalogs used to live inline in a 3MB index.html, so adding a manufacturer
 * meant editing that file. They are now JSON under tools/room-designer/data/
 * catalogs/, fetched at runtime, so adding one is a data drop.
 *
 *   node scripts/import-cabinet-catalog.js <csv> --id=greenfield --name="Greenfield Cabinetry"
 *
 * The CSV needs a header row. Recognised columns (case/spacing insensitive,
 * extras ignored):
 *   sku, name/description, width, height, depth, price, category, series
 *
 * Width/height/depth are inches in the sheet and are converted to the app's
 * grid units (1 unit = 12"). Missing depth defaults per category.
 */
const fs = require('fs'), path = require('path');

const args = process.argv.slice(2);
const file = args.find(a => !a.startsWith('--'));
const opt = k => (args.find(a => a.startsWith(`--${k}=`)) || '').split('=').slice(1).join('=');
const id = opt('id'), name = opt('name') || id;

if (!file || !id) {
  console.error('usage: import-cabinet-catalog.js <csv> --id=<slug> --name="Display Name"');
  process.exit(1);
}

/**
 * CSV reader that survives cabinet sheets specifically. A quote only opens a
 * quoted field at the START of a field — every other quote is an inch mark.
 * Cabinet lists are full of `Base Cabinet 12"`, and treating that as an opening
 * quote silently swallows the rest of the row and the ones after it.
 */
function parseCsv(text) {
  const rows = [];
  let row = [], field = '', quoted = false, atFieldStart = true;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"' && atFieldStart) { quoted = true; atFieldStart = false; }
    else if (c === ',') { row.push(field); field = ''; atFieldStart = true; }
    else if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; atFieldStart = true; }
    else if (c !== '\r') { field += c; atFieldStart = false; }
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  return rows.filter(r => r.some(v => v.trim()));
}

const norm = s => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
const num = v => {
  const n = parseFloat(String(v).replace(/[^0-9.]/g, ''));
  return Number.isFinite(n) ? n : null;
};

// Where a SKU lands in the designer's sidebar. Anything unrecognised goes to
// accessories rather than being dropped — a SKU nobody can find is worse than
// one filed imperfectly.
const CATEGORIES = [
  [/blind/, 'blindCorner'], [/lazy|susan/, 'lazySusan'], [/apron|farm/, 'apronSink'],
  [/sink/, 'sink'], [/vanity|bath/, 'vanity'], [/drawer/, 'drawer'],
  [/corner/, 'corner'], [/tall|pantry|oven|utility/, 'tall'],
  [/appliance|micro|fridge|refrig|hood/, 'appliance'],
  [/wall|upper/, 'wall'], [/base|sink base|\bb\d/, 'base'],
];
const DEFAULT_DEPTH = { wall: 12, tall: 24, vanity: 21 };

function categorise(row) {
  const hay = norm(row.category) + ' ' + norm(row.sku) + ' ' + norm(row.name);
  for (const [re, cat] of CATEGORIES) if (re.test(hay)) return cat;
  return 'accessories';
}

const rows = parseCsv(fs.readFileSync(file, 'utf8'));
const header = rows.shift().map(norm);
const col = (r, ...names) => {
  for (const n of names) {
    const i = header.indexOf(norm(n));
    if (i >= 0 && r[i] != null && String(r[i]).trim()) return String(r[i]).trim();
  }
  return '';
};

const cabinets = {};
const series = {};
let kept = 0, skipped = 0;

for (const r of rows) {
  const item = {
    sku: col(r, 'sku', 'item', 'itemnumber', 'code', 'partnumber'),
    name: col(r, 'name', 'description', 'desc', 'product'),
    width: num(col(r, 'width', 'w')),
    height: num(col(r, 'height', 'h')),
    depth: num(col(r, 'depth', 'd')),
    price: num(col(r, 'price', 'list', 'listprice', 'msrp', 'cost')),
    category: col(r, 'category', 'type', 'group'),
    series: col(r, 'series', 'finish', 'door', 'style'),
  };
  if (!item.sku || !item.width) { skipped++; continue; }

  const cat = categorise(item);
  const depth = item.depth || DEFAULT_DEPTH[cat] || 24;
  (cabinets[cat] ||= []).push({
    sku: item.sku,
    name: item.name || item.sku,
    // The app works in 12" grid units, not inches.
    width: item.width / 12,
    height: (item.height || (cat === 'wall' ? 30 : 24)) / 12,
    depth: depth / 12,
    type: cat === 'wall' ? 'wall-cabinet' : cat === 'tall' ? 'tall-cabinet' : 'base-cabinet',
    price: item.price ?? null,
  });
  if (item.series) {
    const key = item.series.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    series[key] ||= { name: item.series, color: '#d9d9d9', finish: 'painted', grainType: 'flat' };
  }
  kept++;
}

// A catalog with no finishes would render an empty series picker.
if (!Object.keys(series).length) {
  series['default'] = { name: 'Standard', color: '#e8e8e8', finish: 'painted', grainType: 'flat' };
}

const out = { name, series, cabinets };
const dir = path.join(__dirname, '..', 'tools', 'room-designer', 'data', 'catalogs');
fs.writeFileSync(path.join(dir, `${id}.json`), JSON.stringify(out, null, 2));

// Keep the manifest honest — the app reads it to know what exists.
const idxPath = path.join(dir, 'index.json');
const idx = JSON.parse(fs.readFileSync(idxPath, 'utf8'));
idx.catalogs = idx.catalogs.filter(c => c.id !== id);
idx.catalogs.push({ id, name, skus: kept, file: `${id}.json` });
idx.version = (idx.version || 0) + 1;
idx.updated = new Date().toISOString().slice(0, 10);
fs.writeFileSync(idxPath, JSON.stringify(idx, null, 2));

console.log(`${id}.json — ${kept} SKUs kept, ${skipped} skipped (no sku or no width)`);
for (const [c, list] of Object.entries(cabinets)) console.log(`  ${c.padEnd(13)} ${list.length}`);
console.log(`  finishes: ${Object.keys(series).length}`);
console.log(`manifest now at version ${idx.version}`);
