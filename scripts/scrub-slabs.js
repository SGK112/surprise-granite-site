#!/usr/bin/env node
/**
 * Scrub the slab catalog against the vendor price lists.
 *
 * Answers two questions, and writes nothing:
 *   A. Which samples do we offer that we cannot actually get?
 *      Samples run only through the national distributors, and never on
 *      natural stone.
 *   B. Which colors are we advertising that are no longer on the vendor's
 *      current price list?
 *
 * A missing price row is only evidence of discontinuation when the vendor's
 * list is otherwise well matched. A vendor we never ingested matches nothing,
 * which says nothing about the colors. So (B) is reported per vendor with a
 * confidence tier, never as one flat list.
 *
 *   SUPABASE_URL=... SUPABASE_SERVICE_KEY=... MONGODB_URI=... \
 *     node scripts/scrub-slabs.js [--csv out.csv]
 */

const path = require('path');
const { MongoClient } = require(path.join(__dirname, '../api/node_modules/mongodb'));

// Samples are fulfilled only by these national distributors (owner, 2026-07-09).
const SAMPLE_DISTRIBUTORS = new Set(['msi', 'arizona-tile', 'daltile', 'cosentino', 'arcsurfaces']);

// Natural stone is never sampled — every lot is unique.
const NATURAL_RX = /granite|quartzite|marble|dolomite|limestone|travertine|onyx|soapstone|slate|semi.?precious/i;

// catalog vendor_id -> vendor string(s) in the price library
const VENDOR_MAP = {
  'msi': ['MSI'], 'cosentino': ['Cosentino'], 'arizona-tile': ['Arizona Tile'],
  'daltile': ['Daltile'], 'arcsurfaces': ['Architectural Surfaces (ASG)'],
  'bolder-image-stone': ['Bolder Image Stone'], 'cactus-stone': ['Cactus Stone & Tile'],
  'sun-stone': ['Sun Stone'], 'gila': ['Gila'], 'esi': ['ESI'],
  'monterrey-tile': ['Monterrey Tile'],
};

// Cosentino's own brands reach us on a distributor's sheet, so their library
// rows carry that distributor's vendor string. Match Cosentino by brand name.
const BRAND_RX = { 'cosentino': /^(silestone|dekton|sensa|scalea)\b/i };

// Below this match rate the vendor's list is too incomplete for an unmatched
// slab to mean "discontinued".
const CONFIDENT_MATCH_RATE = 0.6;

// Thickness appears as 2cm, 3CM, 1.2cm AND 12mm/20mm. Missing the mm form made
// `Travertino Bone 12mm` fail to match `travertino-bone-matte`, which then
// looked discontinued.
const THICK_RX = /\b\d{1,2}(?:\.\d)?\s*(?:cm|mm)\b/gi;
const FINISH_RX = /\b(polished|honed|matte|matt|suede|leathered|satin|brushed|textured|natural|volcano|velvet|dual|caressed|lava)\b/gi;
const BRAND_STRIP_RX = /\b(silestone|dekton|sensa|scalea|by cosentino|cosentino|msi|pental ?quartz|pental|viatera|hanstone|caesarstone)\b/gi;
const MATERIAL_RX = /\b(quartz|quartzite|granite|marble|porcelain|dekton|slab|tile)\b/gi;

const normalize = (n) => String(n || '').toLowerCase()
  .replace(/\(r\)|®|™/g, ' ').replace(/\*+[a-z ]+\*+/g, ' ')
  .replace(/\(aka:[^)]*\)/gi, ' ')          // "Ebony Honed (AKA: Black Mist)"
  .replace(/::.*$/, ' ').replace(/:\s*\d+x\d+.*$/, ' ')
  .replace(THICK_RX, ' ').replace(FINISH_RX, ' ')
  .replace(BRAND_STRIP_RX, ' ').replace(MATERIAL_RX, ' ')
  .replace(/\b(new|premium|slabs?)\b/g, ' ')
  .replace(/[^a-z0-9]+/g, ' ').trim();

const isSampleSku = (slug) => /-sample$/.test(slug || '');

async function fetchSlabs() {
  const { SUPABASE_URL: U, SUPABASE_SERVICE_KEY: K } = process.env;
  const out = [];
  for (let from = 0; ; from += 1000) {
    const res = await fetch(`${U}/rest/v1/catalog_products?select=slug,name,vendor_id,subcategory,retail_price,sample_eligible,active&category=eq.slab&active=eq.true`,
      { headers: { apikey: K, Authorization: `Bearer ${K}`, Range: `${from}-${from + 999}` } });
    const page = await res.json();
    out.push(...page);
    if (page.length < 1000) return out;
  }
}

(async () => {
  const client = new MongoClient(process.env.MONGODB_URI);
  await client.connect();
  const lib = await client.db().collection('lineitemlibraries')
    .find({ category: 'materials' }, { projection: { name: 1, vendor: 1, cost: 1, unit: 1 } }).toArray();
  await client.close();

  const byVendor = new Map();   // "MSI" -> Set(normalized names)
  const byBrand = [];           // rows whose NAME carries the brand, whoever mailed the sheet
  for (const r of lib) {
    const key = normalize(r.name);
    if (!key) continue;
    if (!byVendor.has(r.vendor)) byVendor.set(r.vendor, new Set());
    byVendor.get(r.vendor).add(key);
    byBrand.push({ key, raw: r.name });
  }
  const brandIndex = (rx) => new Set(byBrand.filter((b) => rx.test(b.raw)).map((b) => b.key));

  const slabs = await fetchSlabs();
  const real = slabs.filter((s) => !isSampleSku(s.slug));
  const sampleSkus = slabs.filter((s) => isSampleSku(s.slug));

  // ---- A. sample scrub ----------------------------------------------------
  const offered = slabs.filter((s) => s.sample_eligible);
  const badVendor = offered.filter((s) => !SAMPLE_DISTRIBUTORS.has(s.vendor_id));
  const badNatural = offered.filter((s) => SAMPLE_DISTRIBUTORS.has(s.vendor_id) && NATURAL_RX.test(s.subcategory || ''));
  const keep = offered.filter((s) => SAMPLE_DISTRIBUTORS.has(s.vendor_id) && !NATURAL_RX.test(s.subcategory || ''));

  console.log('=== A. SAMPLES WE OFFER BUT CANNOT GET ===\n');
  console.log(`slab rows offering a sample : ${offered.length}`);
  console.log(`  keep (distributor + engineered) : ${keep.length}`);
  console.log(`  DISABLE — not a distributor     : ${badVendor.length}`);
  console.log(`  DISABLE — natural stone         : ${badNatural.length}`);
  const bv = {};
  badVendor.forEach((s) => { bv[s.vendor_id] = (bv[s.vendor_id] || 0) + 1; });
  console.log('\n  not-a-distributor, by vendor:');
  Object.entries(bv).sort((a, b) => b[1] - a[1]).forEach(([v, n]) => console.log(`    ${String(v).padEnd(22)}${n}`));

  // ---- B. discontinued scrub ---------------------------------------------
  // A color is CURRENT if any supplier still lists it. Several vendors stock
  // the same stone — river-white is filed under arizona-tile here but priced by
  // MSI; black-mist by Daltile. Judging a color against only the vendor we
  // happened to file it under condemns colors we can still buy.
  console.log('\n\n=== B. COLORS NO SUPPLIER STILL LISTS ===\n');
  const anyVendorNames = new Set();
  for (const set of byVendor.values()) for (const n of set) anyVendorNames.add(n);

  const distributorNames = new Set();
  for (const v of SAMPLE_DISTRIBUTORS) {
    for (const lv of VENDOR_MAP[v] || []) for (const n of byVendor.get(lv) || []) distributorNames.add(n);
    if (BRAND_RX[v]) for (const n of brandIndex(BRAND_RX[v])) distributorNames.add(n);
  }

  const stats = {};
  const gone = [];
  for (const s of real) {
    const v = s.vendor_id;
    stats[v] = stats[v] || { total: 0, anywhere: 0, missing: [] };
    stats[v].total++;
    if (anyVendorNames.has(normalize(s.name))) stats[v].anywhere++;
    else stats[v].missing.push(s);
  }

  const pad = (x, n) => String(x).padEnd(n);
  console.log(pad('vendor', 22) + pad('slabs', 8) + pad('priced', 9) + pad('nowhere', 9) + 'verdict');
  console.log('-'.repeat(84));
  const actionable = [];
  for (const [v, s] of Object.entries(stats).sort((a, b) => b[1].total - a[1].total)) {
    const rate = s.anywhere / s.total;
    let verdict;
    if (rate < CONFIDENT_MATCH_RATE) verdict = `coverage ${Math.round(rate * 100)}% — UNKNOWN, do not touch`;
    else { verdict = `CONFIDENT — ${s.missing.length} unlistable`; actionable.push(...s.missing.map((m) => ({ ...m, vendor: v }))); }
    console.log(pad(v, 22) + pad(s.total, 8) + pad(s.anywhere, 9) + pad(s.missing.length, 9) + verdict);
  }
  gone.push(...actionable);

  console.log(`\nactionable — no supplier lists these: ${actionable.length}`);
  console.log(`  of those, still offering a sample : ${actionable.filter((a) => a.sample_eligible).length}`);
  console.log('\n  examples:');
  actionable.slice(0, 10).forEach((a) => console.log(`    ${pad(a.slug, 42)} ${a.vendor}  $${a.retail_price}`));

  // ---- C. samples a distributor can actually supply ------------------------
  const unsupported = keep.filter((s) => !distributorNames.has(normalize(s.name)));
  console.log(`\n\n=== C. DISTRIBUTOR SAMPLES WITH NO DISTRIBUTOR PRICE ROW ===\n`);
  console.log(`  offered by a distributor      : ${keep.length}`);
  console.log(`  confirmed on a distributor list: ${keep.length - unsupported.length}`);
  console.log(`  NOT on any distributor list    : ${unsupported.length}  <- cannot source the chip`);
  unsupported.slice(0, 8).forEach((s) => console.log(`    ${pad(s.slug, 42)} ${s.vendor_id}`));

  console.log(`\n\nsample SKU rows excluded from (B): ${sampleSkus.length}`);
  console.log('NOTHING WRITTEN — dry run.\n');

  const csvArg = process.argv.indexOf('--csv');
  if (csvArg > -1 && process.argv[csvArg + 1]) {
    const fs = require('fs');
    const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const lines = ['action,slug,vendor,name,subcategory,retail_price,sample_eligible'];
    badVendor.forEach((s) => lines.push(['disable_sample_not_distributor', s.slug, s.vendor_id, s.name, s.subcategory, s.retail_price, s.sample_eligible].map(esc).join(',')));
    badNatural.forEach((s) => lines.push(['disable_sample_natural_stone', s.slug, s.vendor_id, s.name, s.subcategory, s.retail_price, s.sample_eligible].map(esc).join(',')));
    actionable.forEach((s) => lines.push(["review_no_supplier", s.slug, s.vendor, s.name, s.subcategory, s.retail_price, s.sample_eligible].map(esc).join(",")));
    fs.writeFileSync(process.argv[csvArg + 1], lines.join('\n'));
    console.log(`proposals -> ${process.argv[csvArg + 1]} (${lines.length - 1} rows)\n`);
  }
})().catch((e) => { console.error(e); process.exit(1); });
