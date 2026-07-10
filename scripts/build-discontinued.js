#!/usr/bin/env node
/**
 * Build the Discontinued category: every slab color the vendor has retired,
 * pulled from catalog_products where specs.discontinued = true.
 *
 * These colors are deliberately kept online for SEO/reference but must never be
 * orderable (a discontinued sample is what triggered customer refunds). They are
 * already excluded from data/slabs.json (active-only), so this is the single
 * place that LISTS them — a reference for staff and a feed a "Discontinued"
 * page can render.
 *
 * Output: data/discontinued.json — a bare array, same field shape as slabs.json
 * so the existing product/grid renderers can consume it. Handles are cleaned of
 * the -sample suffix so links resolve to the color page (which now shows the
 * DISCONTINUED banner), not the chip SKU.
 *
 * Usage: NODE_PATH=api/node_modules node scripts/build-discontinued.js [--write]
 */
const path = require('path');
const fs = require('fs');
require('dotenv').config({ path: path.join(__dirname, '..', 'api', '.env') });
const { createClient } = require('@supabase/supabase-js');

const supa = createClient('https://ypeypgwsycxcagncgdur.supabase.co', process.env.SUPABASE_SERVICE_KEY);
const OUT = path.join(__dirname, '..', 'data', 'discontinued.json');

const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
const cleanHandle = (slug) => String(slug || '').replace(/-sample$/, '');

(async () => {
  const write = process.argv.includes('--write');

  // Active slab color names — a color retired by ONE vendor but still sold by
  // another is NOT discontinued (Copenhagen is dead at Arizona Tile but active
  // at Cactus/ASG). Only list colors with no active twin.
  let active = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supa.from('catalog_products')
      .select('name, slug').eq('category', 'slab').eq('active', true).order('id').range(from, from + 999);
    if (error) throw error;
    active = active.concat(data);
    if (data.length < 1000) break;
  }
  const activeNames = new Set(active.filter((r) => !/-sample$/.test(r.slug)).map((r) => norm(r.name)));

  let rows = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supa.from('catalog_products')
      .select('slug, name, subcategory, brand, vendor_id, color_family, primary_image_url, image_urls, specs, tags')
      .eq('category', 'slab').eq('specs->>discontinued', 'true').order('name').range(from, from + 999);
    if (error) throw error;
    rows = rows.concat(data);
    if (data.length < 1000) break;
  }

  // One entry per color. Keep colors that are active from another vendor too,
  // but flag them (activeTwin) — the LIST page hides them (the color isn't really
  // gone), while the detail page can still resolve their retired handle to a
  // banner instead of a jarring "Product Not Found".
  const byColor = new Map();
  for (const r of rows) {
    const key = norm(r.name);
    if (!byColor.has(key)) byColor.set(key, r);
  }

  const out = [...byColor.values()].map((r) => {
    const images = [r.primary_image_url, ...(Array.isArray(r.image_urls) ? r.image_urls : [])]
      .filter(Boolean).filter((v, i, a) => a.indexOf(v) === i);
    const handle = cleanHandle(r.slug);
    return {
      id: handle,
      title: r.name,
      handle,
      vendor: r.brand || r.vendor_id || '',
      brandDisplay: r.brand || r.vendor_id || '',
      productType: r.subcategory || 'Slab',
      material: r.subcategory || '',
      color_family: r.color_family || '',
      category: 'discontinued',
      discontinued: true,
      available: false,
      // True when the same color name is still sold by another vendor — the
      // list hides these, the detail page still resolves them.
      activeTwin: activeNames.has(norm(r.name)),
      images,
      url: `/marketplace/product/?handle=${encodeURIComponent(handle)}&category=slabs`,
    };
  }).sort((a, b) => a.title.localeCompare(b.title));

  const byMaterial = {};
  out.forEach((p) => { byMaterial[p.material] = (byMaterial[p.material] || 0) + 1; });

  console.log('=== Discontinued category ===');
  console.log(`discontinued colors: ${out.length}`);
  console.log('by material:', JSON.stringify(byMaterial));
  console.log('with an image:', out.filter((p) => p.images.length).length);

  if (!write) { console.log('\nDRY RUN — add --write to write data/discontinued.json'); process.exit(0); }

  fs.writeFileSync(OUT, JSON.stringify(out, null, 1));
  console.log(`\nwrote ${OUT} (${out.length} colors)`);
  process.exit(0);
})().catch((e) => { console.error('FATAL', e.message); process.exit(1); });
