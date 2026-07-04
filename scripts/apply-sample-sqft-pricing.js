#!/usr/bin/env node
/**
 * Sample price = the material's $/sqft (Josh, 2026-07-04) — replaces the flat
 * $12.99 sample price on slab-color products with the color's per-sqft price
 * from the vendor cost library (LineItemLibrary, deterministic price-book
 * parsers). A sample then costs what one square foot of the slab costs.
 *
 * Matching: vendor_id → library vendor, then name match on the library name
 * stripped of thickness / finish / collection tokens. Preference: 3cm price
 * when both thicknesses exist (standard countertop build), else 2cm; lowest
 * matching price on finish ties. Unmatched products keep their current price.
 *
 * Usage: node scripts/apply-sample-sqft-pricing.js [--write]   (dry-run default)
 */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', 'api', '.env') });
require('dotenv').config({ path: '/Users/homepc/voiceNow-crm/.env' });
const { createClient } = require('@supabase/supabase-js');
const { MongoClient } = require('mongodb');

const supa = createClient('https://ypeypgwsycxcagncgdur.supabase.co', process.env.SUPABASE_SERVICE_KEY);

const VENDOR_MAP = {
  'msi': 'MSI',
  'cosentino': 'Cosentino',
  'silestone': 'Cosentino',
  'arizona-tile': 'Arizona Tile',
  'bolder-image-stone': 'Bolder Image Stone',
  'pentalquartz': 'Architectural Surfaces (ASG)', // PQ book = PentalQuartz
  'hanstone': 'ESI',
  'daltile': 'Daltile',
};

const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
// strip the tokens the price-book parsers append so the base color name remains
const baseName = (s) => String(s || '')
  .replace(/\(aka:[^)]*\)/gi, '')
  .replace(/\([^)]*\)/g, ' ')              // collection / alt-name parentheticals
  .replace(/\b\d+(?:\.\d+)?\s*cm\b/gi, ' ')
  .replace(/\bjumbo\s*\d+x\d+\b/gi, ' ')
  .replace(/\b(polished|honed|leathered|leather|caressed|brushed|matte|lava|dual|suede|satin|1st choice|finish|slabs?)\b/gi, ' ')
  // material / line words that appear on one side only ("Specchio White Quartz"
  // in the catalog vs "Specchio White 2cm" in the price book)
  .replace(/\b(quartzite|quartz|granite|marble|porcelain|dekton|soapstone|travertine|dolomite|scalea|sensa by cosentino|sensa)\b/gi, ' ')
  .trim();
const thickOf = (s) => (/\b3\s*cm\b/i.test(s) ? '3cm' : /\b1\.6\s*cm\b/i.test(s) ? '1.6cm' : /\b2\s*cm\b/i.test(s) ? '2cm' : '');

(async () => {
  const write = process.argv.includes('--write');
  const mongo = new MongoClient(process.env.MONGODB_URI); await mongo.connect();
  const lil = await mongo.db('voiceflow-crm').collection('lineitemlibraries')
    .find({ unit: 'sqft', cost: { $gt: 0 } }, { projection: { name: 1, cost: 1, vendor: 1 } }).toArray();
  await mongo.close();

  // vendor -> normalized base color -> [{thick, cost}]
  const index = new Map();
  for (const r of lil) {
    const key = r.vendor + '|' + norm(baseName(r.name));
    if (!index.has(key)) index.set(key, []);
    index.get(key).push({ thick: thickOf(r.name), cost: Number(r.cost) });
  }
  const priceFor = (libVendor, productName) => {
    const cands = index.get(libVendor + '|' + norm(baseName(productName)));
    if (!cands || !cands.length) return null;
    for (const want of ['3cm', '2cm', '', '1.6cm']) {
      const hit = cands.filter((c) => c.thick === want);
      if (hit.length) return Math.min(...hit.map((c) => c.cost));
    }
    return Math.min(...cands.map((c) => c.cost));
  };

  let products = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supa.from('catalog_products')
      .select('id,name,vendor_id,retail_price,vendor_cost,specs')
      .eq('category', 'slab').eq('active', true).order('id').range(from, from + 999);
    if (error) throw error;
    products = products.concat(data || []);
    if (data.length < 1000) break;
  }

  const report = { slabs: products.length, matched: 0, changed: 0, byVendor: {} };
  const patches = [];
  for (const p of products) {
    const libVendor = VENDOR_MAP[p.vendor_id];
    if (!libVendor) continue;
    const sqft = priceFor(libVendor, p.name);
    if (!sqft) continue;
    report.matched++;
    report.byVendor[p.vendor_id] = (report.byVendor[p.vendor_id] || 0) + 1;
    if (Number(p.retail_price) === sqft && Number(p.vendor_cost) === sqft) continue;
    patches.push({ id: p.id, name: p.name, vendor: p.vendor_id, old: p.retail_price, fields: {
      retail_price: sqft,             // sample sells at the per-sqft price
      sample_price: sqft,
      vendor_cost: sqft,              // cost basis = same book price
      // price_unit stays 'each' (check-constrained) — a sample is one unit;
      // specs.sample_pricing records that the amount equals the $/sqft price
      specs: { ...(p.specs || {}), sample_pricing: 'sqft-price', sqft_price: sqft },
      updated_at: new Date().toISOString(),
    } });
    report.changed++;
  }
  console.log(JSON.stringify(report, null, 2));
  console.log('examples:', patches.slice(0, 8).map((x) => `${x.vendor}:${x.name} $${x.old} -> $${x.fields.retail_price}`).join('\n  '));

  if (!write) { console.log('DRY RUN — add --write to apply.'); process.exit(0); }
  let ok = 0, failed = 0, i = 0;
  await Promise.all(Array.from({ length: 10 }, async () => {
    while (i < patches.length) {
      const u = patches[i++];
      const { error } = await supa.from('catalog_products').update(u.fields).eq('id', u.id);
      if (error) failed++; else ok++;
    }
  }));
  console.log(`WROTE ${ok} rows (${failed} failed).`);
  process.exit(0);
})().catch((e) => { console.error('FATAL', e); process.exit(1); });
