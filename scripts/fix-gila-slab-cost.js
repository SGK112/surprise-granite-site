#!/usr/bin/env node
/**
 * Gila's catalog rows carry the wrong cost entirely.
 *
 *   MONGODB_URI=… DATABASE_URL=… node scripts/fix-gila-slab-cost.js [--write]
 *
 * Gila Cabinet & Stone Center prices quartz as a grid: four PREFAB sizes
 * (110x26, 110x36, 110x42, 110x52) and one SLAB size (126x63). Our
 * catalog_products.vendor_cost for their slabs holds the **110x26 prefab**
 * price — $326 for Carrara White, where the actual slab is $588. That is why
 * Gila's costs sit at $277-$400 while every other vendor's are per-sqft, and
 * why marking them up would have published $452/sqft.
 *
 * A 126x63 slab is 55.125 sqft, so the real per-sqft cost is slab_price/55.125:
 * Carrara White $588 -> $10.67/sqft.
 *
 * Colours sold prefab-only (no Slab 126x63 price) get no vendor_cost. We cannot
 * quote a slab we cannot buy, and inventing a per-sqft figure from a prefab top
 * is how the $452 number happened in the first place.
 *
 * Writes vendor_cost only. Run apply-retail-markup.js --vendor gila afterwards.
 */

const path = require('path');
const { MongoClient } = require(path.join(__dirname, '../api/node_modules/mongodb'));
const { execFileSync } = require('child_process');

const SLAB_SQFT = (126 * 63) / 144;   // 55.125
const DOC = 'Quartz PriceList - Wholesale.pdf';
const WRITE = process.argv.includes('--write');

const { DATABASE_URL, MONGODB_URI } = process.env;
if (!DATABASE_URL || !MONGODB_URI) { console.error('need DATABASE_URL and MONGODB_URI'); process.exit(1); }
const q = (sql) => execFileSync('psql', [DATABASE_URL, '-At', '-F', '\t', '-c', sql], { encoding: 'utf8' }).trim();

// "Carrara White" -> "carrarawhite". The catalog slugs run the words together.
const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');

async function priceGrid() {
  const client = new MongoClient(MONGODB_URI);
  await client.connect();
  const doc = await client.db().collection('_vendor_docs').findOne({ filename: DOC });
  await client.close();
  if (!doc) throw new Error(`price list not cached: ${DOC}`);

  const { PDFParse } = require(path.join(process.env.HOME, 'voiceNow-crm/node_modules/pdf-parse'));
  const parser = new PDFParse({ data: new Uint8Array(Buffer.from(doc.dataB64, 'base64url')) });
  const text = (await parser.getText()).text || '';
  await parser.destroy?.();

  const out = [];
  for (const line of text.split('\n')) {
    const m = /^(.+?)\s*\(([^)]+)\)\s+(.*)$/.exec(line.trim());
    if (!m) continue;
    const [, code, colour, rest] = m;
    const cells = rest.split(/\t|\s{2,}/).map((c) => c.trim()).filter(Boolean);
    if (cells.length < 5) continue;
    const num = (c) => {
      const v = c.replace(/[$,]/g, '');
      return /^\d+(\.\d+)?$/.test(v) ? parseFloat(v) : null;
    };
    const slab = num(cells[4]);           // the "Slab 126x63" column
    out.push({ code: code.trim(), colour: colour.trim(), prefab: num(cells[0]), slab });
  }
  return out;
}

(async () => {
  const grid = await priceGrid();
  const withSlab = grid.filter((g) => g.slab);
  console.log(`price list rows parsed : ${grid.length}`);
  console.log(`  with a Slab 126x63 price: ${withSlab.length}`);
  console.log(`  prefab-only (no slab)   : ${grid.length - withSlab.length}\n`);

  const bySlab = new Map(withSlab.map((g) => [norm(g.colour), g]));

  const slabs = q(`
    SELECT id, slug, name, vendor_cost
      FROM catalog_products
     WHERE active AND category='slab' AND vendor_id='gila' AND slug !~ '-sample$';
  `).split('\n').filter(Boolean).map((l) => {
    const [id, slug, name, cost] = l.split('\t');
    return { id, slug, name, cost: cost === '' ? null : +cost };
  });

  const updates = [], unmatched = [];
  for (const s of slabs) {
    // The slug is the reliable key: `carrarawhite-quartz-gila`.
    const key = norm(s.slug.replace(/-quartz-gila$/, ''));
    const hit = bySlab.get(key) || bySlab.get(norm(s.name));
    if (!hit) { unmatched.push(s); continue; }
    const perSqft = Number((hit.slab / SLAB_SQFT).toFixed(2));
    updates.push({ ...s, colour: hit.colour, slabPrice: hit.slab, perSqft });
  }

  const pad = (x, n) => String(x).padEnd(n);
  console.log(`gila slabs in catalog  : ${slabs.length}`);
  console.log(`  matched to a slab price: ${updates.length}`);
  console.log(`  no slab price (prefab-only or unmatched): ${unmatched.length}\n`);

  console.log(pad('slug', 34) + pad('cost now', 11) + pad('slab price', 12) + '$/sqft');
  console.log('-'.repeat(66));
  updates.slice(0, 12).forEach((u) => console.log(
    pad(u.slug, 34) + pad(`$${u.cost}`, 11) + pad(`$${u.slabPrice}`, 12) + `$${u.perSqft}`));

  if (unmatched.length) {
    console.log('\n--- no Slab 126x63 price; vendor_cost will be cleared ---');
    unmatched.slice(0, 8).forEach((u) => console.log(`  ${pad(u.slug, 34)} was $${u.cost}`));
  }

  if (!WRITE) { console.log('\nDRY RUN — nothing written. Re-run with --write.\n'); return; }

  const fs = require('fs');
  const os = require('os');
  const dir = path.join(os.homedir(), 'sg-backups');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'gila_vendor_cost_before.json'), JSON.stringify(slabs, null, 1));
  console.log(`\nbackup: ${path.join(dir, 'gila_vendor_cost_before.json')} (${slabs.length} rows)`);

  for (const u of updates) {
    q(`UPDATE catalog_products SET vendor_cost = ${u.perSqft} WHERE id = '${u.id}';`);
  }
  // A prefab price is not a slab cost. Better no number than a wrong one.
  for (const u of unmatched) {
    q(`UPDATE catalog_products SET vendor_cost = NULL, retail_price = NULL WHERE id = '${u.id}';`);
  }
  console.log(`  updated ${updates.length}, cleared ${unmatched.length}`);

  const bad = q(`SELECT count(*) FROM catalog_products WHERE active AND vendor_id='gila' AND category='slab' AND slug !~ '-sample$' AND vendor_cost > 100;`);
  console.log(`\nverify: gila slabs with a cost > $100/sqft: ${bad} (expect 0)`);
  if (bad !== '0') { console.error('MISMATCH — restore from the backup.'); process.exit(1); }
  console.log('\nDONE. Now run: node scripts/apply-retail-markup.js --vendor gila\n');
})().catch((e) => { console.error(e.message); process.exit(1); });
