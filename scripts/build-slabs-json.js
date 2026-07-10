#!/usr/bin/env node
/**
 * Rebuild data/slabs.json from catalog_products (the Supabase master).
 *
 * The vendor profile pages (js/vendor-profile.js), local-product-images,
 * related-products etc. read the STATIC /data/slabs.json — not the catalog
 * API — so catalog imports are invisible on those surfaces until this runs.
 * Run after every vendor import, then commit data/slabs.json.
 *
 * Owner rule (Josh 2026-07-06): "If it's not on the price lists or not on
 * the vendor site, it's probably discontinued and we don't want to advertise
 * it" — rows flagged specs.discontinued by the vendor audit are DEACTIVATED
 * in the catalog here (--write) and never exported.
 *
 * Legacy extras (tags, brandTier, origin) are preserved by handle/name merge
 * from the previous slabs.json.
 *
 * Usage: NODE_PATH=api/node_modules node scripts/build-slabs-json.js [--write]
 *   --write: apply discontinued deactivation + overwrite data/slabs.json
 */
const path = require('path');
const fs = require('fs');
require('dotenv').config({ path: path.join(__dirname, '..', 'api', '.env') });
const { createClient } = require('@supabase/supabase-js');

const supa = createClient('https://ypeypgwsycxcagncgdur.supabase.co', process.env.SUPABASE_SERVICE_KEY);
const OUT = path.join(__dirname, '..', 'data', 'slabs.json');

// vendor_id -> the display name js/vendor-profile.js matches via stone-yards.json brandKeys
const VENDOR_DISPLAY = {
  'msi': 'MSI',
  'arizona-tile': 'Arizona Tile',
  'cactus-stone': 'Cactus Stone & Tile',
  'cosentino': 'Cosentino',
  'daltile': 'Daltile',
  'bolder-image-stone': 'Bolder Image Stone',
  'classic-surfaces': 'Classic Surfaces',
  'pentalquartz': 'PentalQuartz',
  'arcsurfaces': 'Architectural Surfaces',
  'lx-hausys': 'LX Hausys',
  'caesarstone': 'Caesarstone',
  'monterrey-tile': 'Monterrey Tile',
  'sun-stone': 'Sun Stone',
  'gila': 'Gila Stone',
  'the-yard-az': 'The Yard',
};

const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');

// Dimensions come in two shapes: the clean top-level `size` (126" x 63") and
// specs.slab_size, which is sometimes bare (126 x 63) and sometimes already
// quoted/annotated (130" x 65" (typ.)). Normalize the bare form to inches;
// leave anything already carrying a unit mark (", mm) untouched.
const fmtSize = (s) => {
  const v = String(s || '').trim();
  if (!v) return '';
  if (/["'mM]/.test(v)) return v;                         // already has a unit
  const m = v.match(/^(\d+(?:\.\d+)?)\s*x\s*(\d+(?:\.\d+)?)/i);
  return m ? `${m[1]}" x ${m[2]}"` : v;
};

(async () => {
  const write = process.argv.includes('--write');
  let rows = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supa.from('catalog_products')
      .select('id, vendor_id, name, slug, brand, subcategory, description, sample_price, sample_eligible, retail_price, in_stock, specs, primary_image_url, image_urls, size, active, tags')
      .eq('category', 'slab').eq('active', true).order('id').range(from, from + 999);
    if (error) throw error;
    rows = rows.concat(data);
    if (data.length < 1000) break;
  }

  // Josh: don't advertise discontinued — deactivate + exclude.
  const discontinued = rows.filter((r) => r.specs && r.specs.discontinued);
  console.log('active slabs:', rows.length, '| discontinued to retire:', discontinued.length);
  if (write && discontinued.length) {
    let i = 0, retired = 0;
    await Promise.all(Array.from({ length: 8 }, async () => {
      while (i < discontinued.length) {
        const r = discontinued[i++];
        const { error } = await supa.from('catalog_products')
          .update({ active: false, in_stock: false, updated_at: new Date().toISOString() }).eq('id', r.id);
        if (!error) retired++;
      }
    }));
    console.log('retired (active=false):', retired);
  }
  rows = rows.filter((r) => !(r.specs && r.specs.discontinued));

  // legacy merge source
  let legacyByKey = new Map();
  try {
    const legacy = JSON.parse(fs.readFileSync(OUT, 'utf8'));
    for (const p of legacy) {
      legacyByKey.set(p.handle, p);
      legacyByKey.set(norm(p.vendor) + '|' + norm(p.title), p);
    }
  } catch { /* first run */ }

  const out = rows.map((r) => {
    const vendor = VENDOR_DISPLAY[r.vendor_id] || r.brand || r.vendor_id;
    const old = legacyByKey.get(r.slug) || legacyByKey.get(norm(vendor) + '|' + norm(r.name)) || {};
    const images = [r.primary_image_url, ...(Array.isArray(r.image_urls) ? r.image_urls : [])]
      .filter(Boolean).filter((v, i, a) => a.indexOf(v) === i);
    // Customer-facing spec fields from the catalog master. These live in specs
    // but were never projected here, so the slab spec card had only material.
    // Prefer the clean top-level size; fall back to the normalized slab_size.
    // NOTE: sqft_price / each_price are DEALER COST and stay out of this file.
    const sp = r.specs || {};
    const size = r.size || fmtSize(sp.slab_size);
    const origin = old.origin || sp.origin || '';
    return {
      id: old.id || r.slug,
      title: r.name,
      handle: r.slug,
      vendor,
      brandDisplay: r.brand || vendor,
      brandTier: old.brandTier || 'standard',
      productType: r.subcategory || old.productType || '',
      category: 'slabs',
      description: (r.description && r.description.length >= (old.description || '').length)
        ? r.description : (old.description || r.description || ''),
      tags: [...new Set([...(old.tags || []), ...(Array.isArray(r.tags) ? r.tags : [])])],
      available: r.in_stock !== false,
      // A slab has NO price: it is quote-based (sqft varies per job, and the
      // vendors price per-slab vs per-sqft inconsistently). The old `price` was
      // really `sample_price`, and when that was null it fell back to
      // `old.price` — the value in the file this script is about to overwrite.
      // 1,577 of 2,402 prices had no catalog backing and were laundered forward
      // on every run, including The Yard's per-slab $1,995. Two consumers read
      // it: the schema.org Offer (which published $12.99 to Google as the slab's
      // price for 917 pages) and the Hanstone vendor grid ("$12.99/sf").
      //
      // `sample_eligible` is the field slab pages could never see. It is the
      // catalog's name for it, and the server checks the same column at
      // checkout, so the button and the server cannot drift.
      sample_eligible: r.sample_eligible === true,
      sample_price: r.sample_eligible === true ? String(r.sample_price != null ? r.sample_price : '12.99') : null,
      images: images.length ? images : (old.images || []),
      variants: old.variants || [],
      ...(origin ? { origin } : {}),
      ...(size ? { size } : {}),
      ...(sp.thickness ? { thickness: String(sp.thickness) } : {}),
      ...(sp.finish ? { finish: String(sp.finish) } : {}),
      ...(sp.slab_sqft != null ? { slab_sqft: Number(sp.slab_sqft) } : {}),
      ...(sp.material ? { material: sp.material } : {}),
    };
  });

  const byVendor = {};
  out.forEach((p) => (byVendor[p.vendor] = (byVendor[p.vendor] || 0) + 1));
  console.log('export:', out.length, 'slabs', JSON.stringify(byVendor, null, 1));

  if (!write) { console.log('DRY RUN — add --write'); process.exit(0); }
  fs.writeFileSync(OUT, JSON.stringify(out, null, 1));
  console.log('wrote', OUT);
  process.exit(0);
})().catch((e) => { console.error('FATAL', e); process.exit(1); });
