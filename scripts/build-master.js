#!/usr/bin/env node
/**
 * ONE master list. Every product, every category, one vocabulary, generated from
 * catalog_products so it cannot drift.
 *
 * The confusion this replaces: the same stone was described in three places with
 * different field names AND conflicting facts.
 *
 *   concept   data/slabs.json      data/countertops.json   catalog_products
 *   id        handle               slug                    slug
 *   name      title                name                    name
 *   brand     vendor (DISPLAY)     brand (SLUG)            brand (DISPLAY) + vendor_id (SLUG)
 *   material  productType          type                    subcategory / specs.material
 *   sample    absent               absent                  sample_eligible
 *
 * `brand` meant a slug in one file and a display name in another, which hid the
 * sample button on every Arizona Tile / MSI / Cosentino product.
 *
 * Two rules learned the hard way, both enforced below:
 *
 *  - NEVER key a product by NAME. 192 catalog names are shared by more than one
 *    slab; "Absolute Black" is SEVEN different stones from seven vendors. The
 *    identity is the slug.
 *  - The distributor hierarchy lives in `brand`, not `vendor_id`. vendor_id
 *    'monterrey-tile' carries 63 rows branded 'LX Viatera' — those ARE the LX
 *    Hausys colours. Deduping on vendor_id calls them unique and imports 21
 *    duplicates.
 *
 * Outputs — written OUTSIDE the repo, to ~/sg-exports/:
 *   master.json  — { generatedAt, counts, categories: { <cat>: [ ...products ] } }
 *   master.csv   — the same rows, flat, for a spreadsheet
 *
 * They are NOT written to data/. Everything under data/ is served publicly
 * (https://www.surprisegranite.com/data/slabs.json returns 200), and this sheet
 * carries `sqftPrice` — which is DEALER COST, not retail: for 839 slabs
 * retail_price is exactly sqft_price x 1.30, the standing markup. Dealer cost
 * leaked through three channels before (retail_price, specs.sqft_price,
 * sample_price) and all three were closed; the product page still lists
 * sqft_price in its SPEC_DENY. Publishing the master under data/ would reopen it
 * for 1,295 slabs.
 *
 * Usage: NODE_PATH=api/node_modules node scripts/build-master.js [--write]
 */
const path = require('path');
const fs = require('fs');
require('dotenv').config({ path: path.join(__dirname, '..', 'api', '.env') });
const { createClient } = require('@supabase/supabase-js');

const SUPA_URL = 'https://ypeypgwsycxcagncgdur.supabase.co';
const KEY = process.env.SUPABASE_SERVICE_KEY;
(function assertPair() {
  if (!KEY) throw new Error('SUPABASE_SERVICE_KEY missing (api/.env)');
  const ref = JSON.parse(Buffer.from(KEY.split('.')[1], 'base64').toString()).ref;
  const host = new URL(SUPA_URL).host.split('.')[0];
  if (ref !== host) throw new Error(`PAIR MISMATCH: url=${host} key.ref=${ref}`);
})();
const supa = createClient(SUPA_URL, KEY);

// Internal only. See the header: data/ is public and these rows carry dealer cost.
const OUT_DIR = path.join(process.env.HOME, 'sg-exports');
const OUT_JSON = path.join(OUT_DIR, 'master.json');
const OUT_CSV = path.join(OUT_DIR, 'master.csv');

// vendor_id -> display, so a vendor page can match on one spelling.
const VENDOR_DISPLAY = {
  msi: 'MSI', 'arizona-tile': 'Arizona Tile', 'cactus-stone': 'Cactus Stone & Tile',
  cosentino: 'Cosentino', daltile: 'Daltile', 'bolder-image-stone': 'Bolder Image Stone',
  'classic-surfaces': 'Classic Surfaces', pentalquartz: 'PentalQuartz',
  arcsurfaces: 'Architectural Surfaces', 'lx-hausys': 'LX Hausys', caesarstone: 'Caesarstone',
  'monterrey-tile': 'Monterrey Tile', 'sun-stone': 'Sun Stone', gila: 'Gila Stone',
  'the-yard-az': 'The Yard', hanstone: 'Hanstone Quartz',
};

// The manufacturer, resolved through the distributor. Keyed on the brand column,
// because vendor_id names who ships it, not who made it.
const BRAND_FAMILY = [
  [/^lx (viatera|hausys)$/i, 'LX Hausys'],
  [/silestone/i, 'Cosentino'],
  [/dekton/i, 'Cosentino'],
  [/sensa/i, 'Cosentino'],
  [/scalea/i, 'Cosentino'],
  [/eclos/i, 'Cosentino'],
];
function brandFamily(brand, vendorId) {
  for (const [rx, fam] of BRAND_FAMILY) if (rx.test(String(brand || ''))) return fam;
  return String(brand || VENDOR_DISPLAY[vendorId] || vendorId || '');
}

const NATURAL_STONE_RX = /granite|quartzite|marble|dolomite|limestone|travertine|onyx|soapstone|slate|semi.?precious/i;

const csvCell = (v) => {
  const s = v == null ? '' : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

(async () => {
  const write = process.argv.includes('--write');
  let rows = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supa.from('catalog_products')
      .select('id, slug, sku, name, vendor_id, brand, category, subcategory, description, '
            + 'retail_price, sample_price, sample_eligible, in_stock, active, specs, size, '
            + 'primary_image_url, image_urls, tags, vendor_url')
      .order('id').range(from, from + 999);
    if (error) throw error;
    rows = rows.concat(data);
    if (data.length < 1000) break;
  }
  if (!rows.length) throw new Error('zero rows — check the URL/key pair');

  const seen = new Set();
  const dupes = [];
  const products = rows.map((r) => {
    if (seen.has(r.slug)) dupes.push(r.slug);
    seen.add(r.slug);
    const specs = r.specs || {};
    const material = specs.material || r.subcategory || '';
    const images = [r.primary_image_url, ...(Array.isArray(r.image_urls) ? r.image_urls : [])]
      .filter(Boolean).filter((v, i, a) => a.indexOf(v) === i);
    return {
      id: r.slug,                                   // the identity. never the name.
      sku: r.sku || null,
      name: r.name,
      category: r.category,
      subcategory: r.subcategory || null,
      material: material || null,
      isNaturalStone: NATURAL_STONE_RX.test(material),
      vendorId: r.vendor_id || null,                // who ships it
      vendorDisplay: VENDOR_DISPLAY[r.vendor_id] || r.brand || r.vendor_id || null,
      brand: r.brand || null,                       // what it is sold as
      brandFamily: brandFamily(r.brand, r.vendor_id), // who makes it
      active: r.active !== false,
      inStock: r.in_stock !== false,
      discontinued: specs.discontinued === true,
      sampleEligible: r.sample_eligible === true,
      samplePrice: r.sample_eligible === true ? (r.sample_price != null ? Number(r.sample_price) : 12.99) : null,
      // retail_price is per-sqft for most vendors but PER-SLAB for The Yard and
      // Gila, who post a price for the physical piece. specs.each_price is the
      // only reliable discriminator, so say which unit this number is in.
      retailPrice: r.retail_price != null ? Number(r.retail_price) : null,
      retailPriceUnit: r.retail_price == null ? null : (specs.each_price != null ? 'each' : 'sqft'),
      sqftPrice: specs.sqft_price != null ? Number(specs.sqft_price) : null,
      thickness: specs.thickness || null,
      finish: specs.finish || null,
      slabSize: specs.slab_size || r.size || null,
      slabSqft: specs.slab_sqft != null ? Number(specs.slab_sqft) : null,
      dimsSource: specs._dims_source || null,
      materialSource: specs.material_source || specs._source || null,
      // The prose itself lives in catalog_products and data/slabs.json; carrying
      // it here tripled the file (12.4 MB) and nothing reads it from the master.
      descriptionLength: (r.description || '').length,
      // Only the hero image, for the same reason.
      image: images[0] || null,
      imageCount: images.length,
      tags: Array.isArray(r.tags) ? r.tags : [],
      vendorUrl: r.vendor_url || null,
    };
  });

  // The slug IS the identity — the checkout resolves a sample by it, and the
  // product page resolves a handle by it. Ruvati's slugs are truncated at 100
  // chars, so RVG1344BK / RVG1388BK / RVG1396BK (three different sink sizes)
  // collapse onto one. Surface it loudly; do not silently pick a winner.
  if (dupes.length) {
    const uniq = [...new Set(dupes)];
    console.warn(`\n!! ${uniq.length} DUPLICATE SLUGS across ${dupes.length + uniq.length} rows — the identity is not unique`);
    console.warn(`   ${uniq.slice(0, 6).join('\n   ')}`);
  }

  const categories = {};
  for (const p of products) (categories[p.category] ||= []).push(p);
  for (const list of Object.values(categories)) list.sort((a, b) => a.id.localeCompare(b.id));

  const counts = {};
  for (const [cat, list] of Object.entries(categories)) {
    const act = list.filter((p) => p.active);
    counts[cat] = {
      total: list.length,
      active: act.length,
      sampleable: act.filter((p) => p.sampleEligible).length,
      withDimensions: act.filter((p) => p.slabSize).length,
      withThickness: act.filter((p) => p.thickness).length,
      withFinish: act.filter((p) => p.finish).length,
      withImages: act.filter((p) => p.imageCount > 0).length,
      withDescription: act.filter((p) => p.descriptionLength > 40).length,
      withPrice: act.filter((p) => p.retailPrice != null).length,
    };
  }

  console.log('=== master list ===');
  console.log(`products: ${products.length}  categories: ${Object.keys(categories).length}`);
  const pad = (s, n) => String(s).padEnd(n);
  console.log('\n' + pad('category', 12) + pad('active', 8) + pad('dims', 8) + pad('thick', 8) + pad('finish', 8) + pad('images', 8) + pad('desc', 8) + pad('price', 8) + 'sample');
  for (const [cat, c] of Object.entries(counts).sort()) {
    const pct = (n) => `${Math.round((100 * n) / (c.active || 1))}%`;
    console.log(pad(cat, 12) + pad(c.active, 8) + pad(pct(c.withDimensions), 8) + pad(pct(c.withThickness), 8)
      + pad(pct(c.withFinish), 8) + pad(pct(c.withImages), 8) + pad(pct(c.withDescription), 8) + pad(pct(c.withPrice), 8) + c.sampleable);
  }

  // Invariants the storefront depends on.
  const bad = products.filter((p) => p.sampleEligible && p.isNaturalStone);
  console.log(`\nINVARIANT natural stone + sampleEligible: ${bad.length} ${bad.length ? '** VIOLATION **' : '(clean)'}`);
  bad.slice(0, 5).forEach((p) => console.log('   ', p.id, p.material, 'active=' + p.active));

  if (!write) { console.log('\nDRY RUN — add --write'); process.exit(0); }

  const payload = { generatedAt: new Date().toISOString(), counts, categories };
  fs.writeFileSync(OUT_JSON, JSON.stringify(payload, null, 1));

  const cols = ['id', 'sku', 'name', 'category', 'subcategory', 'material', 'isNaturalStone', 'vendorId',
    'vendorDisplay', 'brand', 'brandFamily', 'active', 'inStock', 'discontinued', 'sampleEligible',
    'samplePrice', 'retailPrice', 'retailPriceUnit', 'sqftPrice', 'thickness', 'finish', 'slabSize',
    'slabSqft', 'dimsSource', 'materialSource', 'imageCount', 'vendorUrl'];
  const lines = [cols.join(',')];
  for (const p of products) lines.push(cols.map((c) => csvCell(p[c])).join(','));
  fs.writeFileSync(OUT_CSV, lines.join('\n'));

  console.log(`\nwrote ${OUT_JSON} (${(fs.statSync(OUT_JSON).size / 1e6).toFixed(1)} MB)`);
  console.log(`wrote ${OUT_CSV} (${products.length} rows)`);
  process.exit(0);
})().catch((e) => { console.error('FATAL', e.message); process.exit(1); });
