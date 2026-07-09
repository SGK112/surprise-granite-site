#!/usr/bin/env node
/**
 * What's missing between the price lists and the storefront?
 *
 *   1. Colors we have a PRICE for but no product page.
 *   2. Products we advertise with no IMAGE.
 *   3. Sample-eligible products with no image (the ones a buyer clicks).
 *
 * Read-only.
 *   SUPABASE_URL=… SUPABASE_SERVICE_KEY=… MONGODB_URI=… node scripts/coverage-report.js
 */

const path = require('path');
const { MongoClient } = require(path.join(__dirname, '../api/node_modules/mongodb'));

const VENDOR_MAP = {
  'msi': ['MSI'], 'cosentino': ['Cosentino'], 'arizona-tile': ['Arizona Tile'],
  'daltile': ['Daltile'], 'arcsurfaces': ['Architectural Surfaces (ASG)'],
  'bolder-image-stone': ['Bolder Image Stone'], 'cactus-stone': ['Cactus Stone & Tile'],
  'sun-stone': ['Sun Stone'], 'gila': ['Gila'], 'esi': ['ESI'],
  'monterrey-tile': ['Monterrey Tile'],
};
const LIB_TO_CATALOG = Object.fromEntries(Object.entries(VENDOR_MAP).flatMap(([c, ls]) => ls.map((l) => [l, c])));

const THICK_RX = /\b\d{1,2}(?:\.\d)?\s*(?:cm|mm)\b/gi;
const FINISH_RX = /\b(polished|honed|matte|matt|suede|leathered|satin|brushed|textured|natural|volcano|velvet|dual|caressed|lava)\b/gi;
const BRAND_RX = /\b(silestone|dekton|sensa|scalea|by cosentino|cosentino|msi|pental ?quartz|pental|viatera|hanstone|caesarstone)\b/gi;
const MAT_RX = /\b(quartz|quartzite|granite|marble|porcelain|dekton|slab|tile)\b/gi;
const norm = (n) => String(n || '').toLowerCase()
  .replace(/\(r\)|®|™/g, ' ').replace(/\*+[a-z ]+\*+/g, ' ').replace(/\(aka:[^)]*\)/gi, ' ')
  .replace(/::.*$/, ' ').replace(/:\s*\d+x\d+.*$/, ' ')
  .replace(THICK_RX, ' ').replace(FINISH_RX, ' ').replace(BRAND_RX, ' ').replace(MAT_RX, ' ')
  .replace(/\b(new|premium|slabs?)\b/g, ' ').replace(/[^a-z0-9]+/g, ' ').trim();

const hasImage = (r) => Boolean((r.primary_image_url && r.primary_image_url.trim()) || (Array.isArray(r.image_urls) && r.image_urls.length));

async function fetchAll(sel) {
  const { SUPABASE_URL: U, SUPABASE_SERVICE_KEY: K } = process.env;
  const out = [];
  for (let from = 0; ; from += 1000) {
    const res = await fetch(`${U}/rest/v1/catalog_products?${sel}`, { headers: { apikey: K, Authorization: `Bearer ${K}`, Range: `${from}-${from + 999}` } });
    const p = await res.json();
    out.push(...p);
    if (p.length < 1000) return out;
  }
}

(async () => {
  const client = new MongoClient(process.env.MONGODB_URI);
  await client.connect();
  const lib = await client.db().collection('lineitemlibraries')
    .find({ category: 'materials', cost: { $gt: 0 } }, { projection: { name: 1, vendor: 1, unit: 1 } }).toArray();
  await client.close();

  const rows = await fetchAll('select=slug,name,vendor_id,brand,category,subcategory,primary_image_url,image_urls,sample_eligible,retail_price&active=eq.true');
  const pad = (s, n) => String(s).padEnd(n);

  // ---- 1. priced colors with no product ----------------------------------
  console.log('=== 1. COLORS WE HAVE A PRICE FOR BUT DO NOT SELL ===\n');
  const catalogByVendor = {};
  rows.filter((r) => !/-sample$/.test(r.slug)).forEach((r) => {
    (catalogByVendor[r.vendor_id] = catalogByVendor[r.vendor_id] || new Set()).add(norm(r.name));
  });

  console.log(pad('vendor', 24) + pad('priced colors', 15) + pad('on site', 10) + 'missing product page');
  console.log('-'.repeat(72));
  let totalMissing = 0;
  const missingByVendor = {};
  // Only slab colors. The library also holds sample chips ("FOSSIL GRAY SAMPLE
  // 5X10X2CM") and per-unit goods (sinks, vanities) — counting those as
  // "colors we don't sell" is nonsense.
  const isSlabColor = (r) => r.unit === 'sqft' && !/\bsample\b|\bsink\b|\bvanity\b/i.test(r.name);

  for (const [libVendor, catVendor] of Object.entries(LIB_TO_CATALOG)) {
    const colors = new Map();
    lib.filter((r) => r.vendor === libVendor && isSlabColor(r)).forEach((r) => { const k = norm(r.name); if (k) colors.set(k, r.name); });
    if (!colors.size) continue;
    const have = catalogByVendor[catVendor] || new Set();
    const missing = [...colors.entries()].filter(([k]) => !have.has(k));
    totalMissing += missing.length;
    missingByVendor[catVendor] = missing;
    console.log(pad(libVendor, 24) + pad(colors.size, 15) + pad(colors.size - missing.length, 10) + missing.length);
  }
  console.log(`\ntotal priced colors with no product page: ${totalMissing}`);
  for (const v of ['msi', 'daltile', 'arizona-tile']) {
    const m = missingByVendor[v] || [];
    if (m.length) console.log(`\n  ${v} examples: ${m.slice(0, 5).map(([, n]) => n).join(' | ')}`);
  }

  // ---- 2 + 3. images ------------------------------------------------------
  console.log('\n\n=== 2. PRODUCTS WITH NO IMAGE ===\n');
  const noImg = rows.filter((r) => !hasImage(r));
  console.log(`active products      : ${rows.length}`);
  console.log(`  missing an image   : ${noImg.length}`);
  const byCat = {};
  noImg.forEach((r) => { byCat[r.category] = (byCat[r.category] || 0) + 1; });
  Object.entries(byCat).sort((a, b) => b[1] - a[1]).forEach(([c, n]) => console.log(`    ${pad(c, 14)}${n}`));

  console.log('\n\n=== 3. SAMPLE-ELIGIBLE PRODUCTS WITH NO IMAGE ===\n');
  const elig = rows.filter((r) => r.sample_eligible);
  const eligNoImg = elig.filter((r) => !hasImage(r));
  console.log(`sample_eligible      : ${elig.length}`);
  console.log(`  missing an image   : ${eligNoImg.length}   <- buyer sees an empty card`);
  const bv = {};
  eligNoImg.forEach((r) => { bv[r.vendor_id] = (bv[r.vendor_id] || 0) + 1; });
  Object.entries(bv).sort((a, b) => b[1] - a[1]).forEach(([v, n]) => console.log(`    ${pad(v, 20)}${n}`));
  eligNoImg.slice(0, 6).forEach((r) => console.log(`      ${pad(r.slug, 40)} ${r.vendor_id}`));

  // ---- 4. sample-eligible with no price ----------------------------------
  console.log('\n\n=== 4. SAMPLE-ELIGIBLE WITH A PLACEHOLDER PRICE ===\n');
  const ph = elig.filter((r) => Number(r.retail_price) === 12.99);
  console.log(`sample_eligible at the $12.99 placeholder: ${ph.length}`);
  const pv = {};
  ph.forEach((r) => { pv[r.vendor_id] = (pv[r.vendor_id] || 0) + 1; });
  Object.entries(pv).sort((a, b) => b[1] - a[1]).slice(0, 6).forEach(([v, n]) => console.log(`    ${pad(v, 20)}${n}`));
  console.log('\n(placeholder = we never learned the slab $/sqft; the $12.99 sample still sells fine)\n');
})().catch((e) => { console.error(e); process.exit(1); });
