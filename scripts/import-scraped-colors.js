#!/usr/bin/env node
/**
 * Import scraped vendor slab colors (session scrape JSON, shape
 * {name, material, image, url, description?, thickness?} or {colors:[...]})
 * into catalog_products. Owner rule: "if the vendor has the color, we have
 * the color". Sample price = the color's $/sqft from the vendor's price-book
 * library rows when matched, else the $12.99 default. Dedupes against
 * EXISTING vendor rows by normalized base name (not just sku/slug —
 * Classic Surfaces already has 26 live slab rows).
 *
 * Usage: NODE_PATH=api/node_modules node scripts/import-scraped-colors.js <vendor> <json> [--write]
 *   vendor: classic-surfaces | monterrey-tile
 */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', 'api', '.env') });
const fs = require('fs');
const { createClient } = require('@supabase/supabase-js');
const { MongoClient } = require('mongodb');

const supa = createClient('https://ypeypgwsycxcagncgdur.supabase.co', process.env.SUPABASE_SERVICE_KEY);
const MONGO = fs.readFileSync('/Users/homepc/voiceNow-crm/.env', 'utf8').match(/^MONGODB_URI=(.+)$/m)[1].trim();
const WRITE = process.argv.includes('--write');
const [vendorId, jsonPath] = process.argv.slice(2).filter((a) => a !== '--write');

const VENDORS = {
  'classic-surfaces': {
    brand: 'Classic Surfaces', libVendors: ['Classic Surfaces', 'Architectural Surfaces (ASG)'],
    url: 'https://www.classic-surfaces.com/', city: 'Phoenix', source: 'classicsurfaces-scrape', slugSuffix: 'classic',
  },
  'monterrey-tile': {
    brand: 'Monterrey Tile', libVendors: ['Monterrey Tile'],
    url: 'https://www.monterreytile.com/', city: 'Mesa', source: 'monterreytile-scrape', slugSuffix: 'monterrey',
  },
  'bolder-image-stone': {
    brand: 'Bolder Image Stone', libVendors: ['Bolder Image Stone'],
    url: 'https://bolderimagestone.com/', city: 'Phoenix', source: 'bolderimagestone-scrape', slugSuffix: 'bolder',
  },
  'arcsurfaces': {
    brand: 'Architectural Surfaces', libVendors: ['Architectural Surfaces (ASG)'],
    url: 'https://arcsurfaces.com/', city: 'Tempe', source: 'arcsurfaces-scrape', slugSuffix: 'asg',
  },
};

const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
const baseName = (s) => String(s || '')
  .replace(/\([^)]*\)/g, ' ')
  .replace(/\b\d+(?:\.\d+)?\s*cm\b/gi, ' ')
  .replace(/\b(polished|honed|leathered|leather|brushed|matte|satin|suede|caressed|slabs?|1st choice|finish|3d)\b/gi, ' ')
  .replace(/\b(quartzite|quartz|granite|marble|porcelain|dolomite|onyx|limestone|travertine|slate|soapstone|viatera|dekton)\b/gi, ' ')
  .trim();

// "quartz (LX Viatera)" -> {material: 'Quartz', line: 'LX Viatera'}
const materialOf = (m) => {
  const raw = String(m || '').trim();
  const line = (raw.match(/\(([^)]+)\)/) || [])[1] || null;
  const word = raw.replace(/\([^)]*\)/, '').trim().toLowerCase();
  const cap = word ? word.split(/\s+/).map((w) => w[0].toUpperCase() + w.slice(1)).join(' ') : null;
  return { material: cap, line };
};

(async () => {
  const cfg = VENDORS[vendorId];
  if (!cfg || !jsonPath) { console.error('usage: import-scraped-colors.js <classic-surfaces|monterrey-tile> <json> [--write]'); process.exit(1); }
  const raw = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
  const colors = Array.isArray(raw) ? raw : (raw.colors || raw.slabs || raw.products);

  const mongo = new MongoClient(MONGO); await mongo.connect();
  const lil = await mongo.db('voiceflow-crm').collection('lineitemlibraries')
    .find({ vendor: { $in: cfg.libVendors }, unit: 'sqft', cost: { $gt: 0 } }, { projection: { name: 1, cost: 1 } }).toArray();
  await mongo.close();
  const priceByBase = new Map();
  for (const r of lil) {
    const b = norm(baseName(r.name));
    if (b.length < 4) continue;
    if (!priceByBase.has(b) || r.cost < priceByBase.get(b)) priceByBase.set(b, Number(r.cost));
  }
  console.log('library rows:', lil.length, '| priced bases:', priceByBase.size);

  let existing = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supa.from('catalog_products').select('id,sku,slug,name,vendor_id,category').order('id').range(from, from + 999);
    if (error) throw error;
    existing = existing.concat(data || []);
    if (data.length < 1000) break;
  }
  const skus = new Set(existing.map((p) => p.sku).filter(Boolean));
  const slugs = new Set(existing.map((p) => p.slug).filter(Boolean));
  const vendorBases = new Set(existing
    .filter((p) => p.vendor_id === vendorId && p.category === 'slab')
    .map((p) => norm(baseName(p.name))).filter((b) => b.length >= 3));

  const report = { colors: colors.length, created: 0, skippedExisting: 0, priced: 0, noImage: 0, byMaterial: {} };
  const creates = [];
  for (const c of colors) {
    if (!c.image) { report.noImage++; continue; }
    const { material, line } = materialOf(c.material);
    const b = norm(baseName(c.name));
    if (vendorBases.has(b)) { report.skippedExisting++; continue; }
    const sku = `import-${vendorId}-${norm(c.name)}`.slice(0, 60);
    if (skus.has(sku)) { report.skippedExisting++; continue; }
    let slug = `${b || norm(c.name)}-${norm(material || 'stone')}-${cfg.slugSuffix}`;
    if (slugs.has(slug)) slug = slug + '-2';
    if (slugs.has(slug)) continue;
    slugs.add(slug); skus.add(sku); vendorBases.add(b);
    let sqft = priceByBase.get(b) || null;
    if (!sqft && b.length >= 4) {
      // unique-prefix fallback (book rows carry grade/finish suffixes)
      const hits = [...priceByBase.keys()].filter((k) => k.length >= 4 && (k.startsWith(b) || b.startsWith(k)));
      if (hits.length && hits.every((h) => priceByBase.get(h) === priceByBase.get(hits[0]))) sqft = priceByBase.get(hits[0]);
      else if (hits.length) sqft = Math.min(...hits.map((h) => priceByBase.get(h)));
    }
    if (sqft) report.priced++;
    report.byMaterial[material || '?'] = (report.byMaterial[material || '?'] || 0) + 1;
    const thick = Array.isArray(c.thickness) ? c.thickness.join(', ') : (c.thickness || null);
    creates.push({
      vendor_id: vendorId, brand: line || cfg.brand, sku,
      name: c.name, slug, category: 'slab', subcategory: material,
      description: (c.description && c.description.length > 60) ? c.description
        : `${c.name} ${material ? material.toLowerCase() : 'stone'} slab from ${cfg.brand}, ${cfg.city}, Arizona.${line ? ` Part of the ${line} line.` : ''}`,
      primary_image_url: c.image, image_urls: [c.image],
      retail_price: sqft || 12.99, sample_price: sqft || 12.99, vendor_cost: sqft,
      price_unit: 'each', sample_eligible: true, in_stock: true, active: true,
      vendor_url: c.url || cfg.url,
      tags: ['vendor-import'], currency: 'USD',
      specs: {
        _source: cfg.source, imported_at: '2026-07-06', material,
        ...(line ? { product_line: line } : {}),
        ...(thick ? { thickness: thick } : {}),
        ...(sqft ? { sample_pricing: 'sqft-price', sqft_price: sqft } : {}),
      },
    });
    report.created++;
  }
  console.log(JSON.stringify(report, null, 2));
  console.log('examples:', creates.slice(0, 6).map((c) => `${c.name} [${c.subcategory}${c.brand !== cfg.brand ? '/' + c.brand : ''}] $${c.retail_price}${c.vendor_cost ? ' (book)' : ''}`).join(' | '));
  if (!WRITE) { console.log('DRY RUN — add --write'); process.exit(0); }
  let created = 0;
  for (let j = 0; j < creates.length; j += 50) {
    const { error } = await supa.from('catalog_products').insert(creates.slice(j, j + 50));
    if (error) console.error('batch error:', error.message);
    else created += Math.min(50, creates.length - j);
  }
  console.log('CREATED', created);
  process.exit(0);
})().catch((e) => { console.error('FATAL', e); process.exit(1); });
