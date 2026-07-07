#!/usr/bin/env node
/**
 * Marketplace slab taxonomy cleanup (vendor-by-vendor sweep, 2026-07-06).
 * Fixes scrape-truncated subcategories using each row's own vendor_url:
 *   - Arizona Tile "Della"    -> della-terra-quartz = Quartz,
 *                                della-terra-porcelain = Porcelain
 *   - Arizona Tile "Natural"  -> natural-stone-slab/<material> = that material;
 *                                natural-stone-tile rows are TILES -> category 'tile'
 *   - Arizona Tile "Special"/"Pavers" -> paver products -> category 'tile'
 *   - Arizona Tile "Agglomerate" -> Agglomerate Marble (engineered, NOT natural marble)
 *   - Cosentino "Ultracompact" -> Dekton (same line, split label)
 * Then fills specs.material from subcategory wherever specs.material is missing,
 * so detail pages stop showing blank Material.
 *
 * Usage: NODE_PATH=api/node_modules node scripts/cleanup-slab-taxonomy.js [--write]
 */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', 'api', '.env') });
const { createClient } = require('@supabase/supabase-js');

const supa = createClient('https://ypeypgwsycxcagncgdur.supabase.co', process.env.SUPABASE_SERVICE_KEY);

const MATERIAL_SUBS = new Set([
  'Quartz', 'Quartzite', 'Granite', 'Marble', 'Dolomite', 'Limestone', 'Travertine',
  'Onyx', 'Soapstone', 'Slate', 'Porcelain', 'Dekton', 'Semi-Precious', 'Agglomerate Marble',
]);

const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

(async () => {
  const write = process.argv.includes('--write');
  let rows = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supa.from('catalog_products')
      .select('id, vendor_id, name, subcategory, vendor_url, specs, category')
      .eq('category', 'slab').eq('active', true).range(from, from + 999);
    if (error) throw error;
    rows = rows.concat(data);
    if (data.length < 1000) break;
  }

  const patches = [];
  const report = { toTile: [], resub: {}, materialFilled: 0, unresolved: [] };

  for (const r of rows) {
    const fields = {};
    const url = r.vendor_url || '';
    let sub = r.subcategory;

    if (r.vendor_id === 'arizona-tile' && ['Della', 'Natural', 'Special', 'Pavers', 'Agglomerate'].includes(sub)) {
      if (/natural-stone-tile|special-order-pavers|\/pavers\//.test(url)) {
        fields.category = 'tile';
        fields.subcategory = /paver/.test(url) ? 'Pavers' : 'Natural Stone Tile';
        report.toTile.push(`${r.name} (${sub})`);
      } else if (/della-terra-quartz/.test(url)) sub = 'Quartz';
      else if (/della-terra-porcelain/.test(url)) sub = 'Porcelain';
      else if (/agglomerate-marble/.test(url)) sub = 'Agglomerate Marble';
      else {
        const m = url.match(/natural-stone-slab\/([a-z-]+)\//);
        if (m) sub = cap(m[1].replace(/-.*/, ''));
        else { report.unresolved.push(`${r.name} sub=${r.subcategory} url=${url}`); continue; }
      }
      if (!fields.category && sub !== r.subcategory) {
        fields.subcategory = sub;
        report.resub[`${r.subcategory} -> ${sub}`] = (report.resub[`${r.subcategory} -> ${sub}`] || 0) + 1;
      }
    }

    if (r.vendor_id === 'cosentino' && sub === 'Ultracompact') {
      sub = 'Dekton';
      fields.subcategory = sub;
      report.resub['Ultracompact -> Dekton'] = (report.resub['Ultracompact -> Dekton'] || 0) + 1;
    }

    // fill specs.material from (possibly corrected) subcategory
    if (fields.category !== 'tile' && MATERIAL_SUBS.has(sub) && !(r.specs && r.specs.material)) {
      fields.specs = { ...(r.specs || {}), material: sub };
      report.materialFilled++;
    }

    if (Object.keys(fields).length) {
      fields.updated_at = new Date().toISOString();
      patches.push({ id: r.id, fields });
    }
  }

  console.log('active slabs scanned:', rows.length);
  console.log('moved to tile category:', report.toTile.length);
  report.toTile.forEach((n) => console.log('   TILE <-', n));
  console.log('subcategory fixes:', JSON.stringify(report.resub, null, 1));
  console.log('specs.material filled:', report.materialFilled);
  if (report.unresolved.length) console.log('UNRESOLVED:', report.unresolved.join('\n  '));
  console.log('total patches:', patches.length);

  if (!write) { console.log('DRY RUN — add --write to apply.'); process.exit(0); }
  let ok = 0, failed = 0, i = 0;
  await Promise.all(Array.from({ length: 10 }, async () => {
    while (i < patches.length) {
      const u = patches[i++];
      const { error } = await supa.from('catalog_products').update(u.fields).eq('id', u.id);
      if (error) { failed++; console.error('FAIL', u.id, error.message); } else ok++;
    }
  }));
  console.log(`WROTE ${ok} rows (${failed} failed).`);
  process.exit(0);
})().catch((e) => { console.error('FATAL', e); process.exit(1); });
