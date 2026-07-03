#!/usr/bin/env node
/**
 * Consolidate the static /data/*.json storefront datasets INTO the Supabase
 * marketplace catalog (catalog_products), so the in-house marketplace becomes
 * the single source of truth. Shopify stays live; this only ADDS rows.
 *
 * Datasets handled (net-new only — existing rows are left untouched):
 *   slabs.json     -> category 'slab'    (Quartz/Granite/... sold as $12.99 samples)
 *   tile.json      -> category 'tile'    (MSI + Bravo, priced, real images)
 *   flooring.json  -> category 'flooring'(MSI flooring, per-sqft)
 * (sinks/faucets/bathroom/accessories are already 100% in the catalog; other.json
 *  is furniture — out of scope.)
 *
 * catalog_products.vendor_id is a FK to vendor_config, so any missing vendor is
 * created there first (markup 30%, samples offered).
 *
 * Usage:
 *   node scripts/import-datasets-to-catalog.js <slabs|tile|flooring|all> [--write]
 * Without --write it is a DRY RUN (reports the plan, writes nothing).
 */
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', 'api', '.env') });
const { createClient } = require('@supabase/supabase-js');

const SUPA_URL = 'https://ypeypgwsycxcagncgdur.supabase.co';
const supa = createClient(SUPA_URL, process.env.SUPABASE_SERVICE_KEY);

const DEFAULT_SAMPLE_PRICE = 12.99;           // established slab-sample fee
const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
const vslug = (v) => String(v || '').toLowerCase().trim().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
const slugify = (s) => String(s || '').toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

// dataset vendor slug -> existing vendor_config vendor_id
const VENDOR_ALIAS = {
  'hanstone-quartz': 'hanstone',
  'architectural-surfaces': 'arcsurfaces',
  'architectural-surfaces-asg': 'arcsurfaces',
  'asg': 'arcsurfaces',
  'msi-surfaces': 'msi',
  'sensa': 'cosentino',
  'sensa-by-cosentino': 'cosentino',
};

function imagesOf(p) {
  let raw = p.images || (p.primaryImage ? [p.primaryImage] : []) || [];
  if (!Array.isArray(raw)) raw = [raw];
  return raw.map((x) => (typeof x === 'string' ? x : (x && (x.url || x.src)))).filter(Boolean);
}

function loadData(file) {
  const a = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', file), 'utf8'));
  return Array.isArray(a) ? a : (a.products || a.slabs || a.countertops || a.flooring || a.items || []);
}

// ── field mappers per dataset ───────────────────────────────────────────────
function mapSlab(p) {
  const price = Number(p.price) || 0;
  const isSample = price > 0 && price <= 50;
  const samplePrice = isSample ? price : DEFAULT_SAMPLE_PRICE;
  return {
    category: 'slab', subcategory: p.productType || 'Slab',
    sku: p.sku || p.id || p.handle, slug: p.handle || slugify(p.title),
    name: p.title, brand: p.brandDisplay || p.vendor,
    description: p.description || null,
    retail_price: price > 50 ? price : samplePrice,   // full-slab price for the rare buyables, else the sample fee
    price_unit: 'each',                                // a sample (or the rare full slab) is bought as a unit

    sample_eligible: true, sample_price: samplePrice,
    color_family: p.primaryColor || null,
    in_stock: p.available !== false,
    tags: Array.isArray(p.tags) ? p.tags : [],
    specs: { brandTier: p.brandTier, accentColor: p.accentColor, style: p.style, origin: p.originCountry, _source: 'slabs.json' },
    _vendorRaw: p.vendor || p.brandDisplay, _images: imagesOf(p),
  };
}
function mapTile(p) {
  const price = Number(p.price) || 0;
  return {
    category: 'tile', subcategory: p.productType || 'Tile',
    sku: p.sku || p.id || p.handle, slug: p.handle || slugify(p.title),
    name: p.title, brand: p.brandDisplay || p.vendor,
    description: p.description || null,
    retail_price: price || null, price_unit: 'sqft',
    sample_eligible: true, sample_price: 5,
    color_family: p.primaryColor || null,
    in_stock: p.available !== false,
    tags: Array.isArray(p.tags) ? p.tags : [],
    specs: { style: p.style, _source: 'tile.json' },
    _vendorRaw: p.vendor || p.brand, _images: imagesOf(p),
  };
}
function mapFlooring(p) {
  // price_sf is a role-tiered object {guest, homeowner, pro, ...}; guest = public retail.
  const psf = (p.price_sf && typeof p.price_sf === 'object') ? Number(p.price_sf.guest) : Number(p.price_sf);
  const price = psf > 0 ? psf : 0;
  return {
    category: 'flooring', subcategory: p.type || p.category || 'Flooring',
    sku: p.sku || p.slug, slug: p.slug || slugify(p.name),
    name: p.name, brand: p.brand,
    description: p.description || null,
    vendor_cost: Number(p.wholesale_cost_sf) || null,
    retail_price: price || null, price_unit: 'sqft',
    sample_eligible: true, sample_price: 5,
    color_family: p.primaryColor || null,
    in_stock: true,
    tags: [], specs: { collection: p.collection, wear_layer: p.wear_layer, sf_per_box: p.sf_per_box, _source: 'flooring.json' },
    _vendorRaw: p.brand || p.vendor, _images: imagesOf(p),
  };
}

// countertops.json = the color BROWSE set. Most overlap the sellable slabs
// already imported; the net-new colors come in as sample-sellable slab rows so
// the countertop pages have full parity from the catalog.
function mapCountertop(p) {
  return {
    category: 'slab', subcategory: p.type || 'Slab',
    sku: p.sku || p.slug, slug: p.slug,
    name: p.name, brand: p.brand,
    description: p.description || null,
    retail_price: DEFAULT_SAMPLE_PRICE, price_unit: 'each',
    sample_eligible: true, sample_price: DEFAULT_SAMPLE_PRICE,
    color_family: p.primaryColor || null,
    in_stock: true,
    tags: [], specs: { collection: p.collection, style: p.style, accentColor: p.accentColor, _source: 'countertops.json' },
    _vendorRaw: p.brand || p.vendor,
    _images: [p.primaryImage, p.secondaryImage, ...(Array.isArray(p.images) ? p.images : [])]
      .map((x) => (typeof x === 'string' ? x : (x && (x.url || x.src)))).filter(Boolean),
  };
}

const DATASETS = {
  slabs: { file: 'slabs.json', map: mapSlab },
  tile: { file: 'tile.json', map: mapTile },
  flooring: { file: 'flooring.json', map: mapFlooring },
  countertops: { file: 'countertops.json', map: mapCountertop },
};

async function loadCatalogKeys() {
  const names = new Set(), skus = new Set(), slugs = new Set();
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supa.from('catalog_products').select('sku,slug,name').order('id').range(from, from + 999);
    if (error) throw error;
    for (const r of data) { names.add(norm(r.name)); if (r.sku) skus.add(norm(r.sku)); if (r.slug) slugs.add(norm(r.slug)); }
    if (data.length < 1000) break;
  }
  return { names, skus, slugs };
}

async function ensureVendors(neededSlugs, write) {
  const { data } = await supa.from('vendor_config').select('vendor_id');
  const have = new Set((data || []).map((v) => v.vendor_id));
  const toCreate = [...neededSlugs].filter((v) => v && !have.has(v));
  if (!toCreate.length) return { created: [], have };
  console.log(`  vendors to create in vendor_config: ${toCreate.join(', ')}`);
  if (write) {
    const rows = toCreate.map((v) => ({
      vendor_id: v, vendor_name: v.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
      default_markup_pct: 30, sample_offered: true, sample_price: 0, dropship_method: 'manual',
      notes: 'auto-created during /data JSON → catalog consolidation',
    }));
    const { error } = await supa.from('vendor_config').insert(rows);
    if (error) throw new Error('vendor_config insert failed: ' + error.message);
    toCreate.forEach((v) => have.add(v));
  }
  return { created: toCreate, have };
}

async function importDataset(key, write) {
  const cfg = DATASETS[key];
  console.log(`\n=== ${key} (${cfg.file}) ===`);
  const rows = loadData(cfg.file).map(cfg.map);
  const catKeys = await loadCatalogKeys();

  // resolve vendor_ids
  const vendorFor = (raw) => { const s = vslug(raw); return VENDOR_ALIAS[s] || s; };
  const needed = new Set(rows.map((r) => vendorFor(r._vendorRaw)));
  const { have } = await ensureVendors(needed, write);

  // filter to net-new (not already in catalog) + dedupe within batch + valid vendor
  const seen = new Set();
  const toInsert = []; let skipDup = 0, skipVendor = 0, skipSelfDup = 0;
  for (const r of rows) {
    const vid = vendorFor(r._vendorRaw);
    const nName = norm(r.name), nSku = norm(r.sku), nSlug = norm(r.slug);
    if ((nName && catKeys.names.has(nName)) || (nSku && catKeys.skus.has(nSku)) || (nSlug && catKeys.slugs.has(nSlug))) { skipDup++; continue; }
    const selfKey = nSku || nSlug || nName;
    if (seen.has(selfKey)) { skipSelfDup++; continue; }
    if (!have.has(vid)) { skipVendor++; continue; }
    seen.add(selfKey);
    const { _vendorRaw, _images, ...clean } = r;
    const imgs = _images || [];
    toInsert.push({ ...clean, vendor_id: vid, currency: 'USD', active: true,
      primary_image_url: imgs[0] || null, image_urls: imgs.length ? imgs : null });
  }

  console.log(`  dataset rows: ${rows.length} | already-in-catalog: ${skipDup} | in-batch dupes: ${skipSelfDup} | bad-vendor: ${skipVendor} | NET-NEW to insert: ${toInsert.length}`);
  const priced = toInsert.filter((r) => Number(r.retail_price) > 0).length;
  console.log(`  of those, priced: ${priced} | sample-eligible: ${toInsert.filter((r) => r.sample_eligible).length}`);
  console.log('  sample rows:'); toInsert.slice(0, 3).forEach((r) => console.log(`    ${r.vendor_id} | ${r.category}/${r.subcategory} | $${r.retail_price} (sample $${r.sample_price}) | ${r.name}`));

  if (!write) { console.log('  DRY RUN — no writes.'); return { key, netNew: toInsert.length, priced }; }

  let inserted = 0, failed = 0;
  for (let i = 0; i < toInsert.length; i += 100) {
    const batch = toInsert.slice(i, i + 100);
    const { error, count } = await supa.from('catalog_products').insert(batch, { count: 'exact' });
    if (error) { failed += batch.length; console.error(`  batch ${i} FAILED: ${error.message}`); }
    else inserted += (count || batch.length);
  }
  console.log(`  INSERTED: ${inserted} | failed: ${failed}`);
  return { key, inserted, failed };
}

(async () => {
  const arg = (process.argv[2] || '').toLowerCase();
  const write = process.argv.includes('--write');
  const keys = arg === 'all' ? Object.keys(DATASETS) : [arg];
  if (!keys.every((k) => DATASETS[k])) { console.error('usage: node import-datasets-to-catalog.js <slabs|tile|flooring|all> [--write]'); process.exit(1); }
  console.log(write ? '*** WRITE MODE ***' : '*** DRY RUN (add --write to execute) ***');
  const report = [];
  for (const k of keys) report.push(await importDataset(k, write));
  console.log('\n=== SUMMARY ==='); console.table(report);
  process.exit(0);
})().catch((e) => { console.error('FATAL:', e); process.exit(1); });
