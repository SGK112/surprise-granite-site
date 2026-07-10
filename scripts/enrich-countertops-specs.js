#!/usr/bin/env node
/**
 * Convergence step: fold catalog_products slab specs INTO data/countertops.json
 * so the curated colour file and the vendor master stop contradicting.
 *
 * WHY this exists: countertops.json (619 curated colours, editorial fields —
 * views/trending/featured, /migrated/ images) and the vendor catalog (2,404
 * rows, real specs) are DIFFERENT datasets that both describe slabs with no
 * shared key. Regenerating countertops.json from the catalog would delete the
 * 76 curated-only colours, risk 83 ambiguous name collisions ("Absolute Black"
 * is seven stones), and wipe the editorial fields. So we ENRICH, not rebuild.
 *
 * ADDITIVE ONLY — the safety guarantee:
 *   Every field this writes (size, thickness, finish, origin, sample_eligible,
 *   sample_price) is NEW to a countertop record. countertops.json carries none
 *   of them today, so no current reader references them and none can break.
 *   No existing field is renamed, reordered, or removed. Editorial fields
 *   (views, trending, featured, collection, colours, images) are untouched.
 *
 * MATCHING: real catalog values land only on rows that resolve to exactly one
 * catalog slab — by slug, or by a name that is UNIQUE in the catalog. Ambiguous
 * names and the curated-only colours get no catalog data (real = absent).
 *
 * PLACEHOLDERS: so every spec card renders full and uniform, missing DISPLAY
 * specs (size, thickness, finish) are filled with a "call for availability"
 * string. NEVER sample_eligible / sample_price — those gate the sample button
 * and must reflect catalog truth (default: not sampleable when unmatched).
 *
 * Re-runnable: safe to run after every vendor sync. Reads the same Supabase
 * master as build-slabs-json.js.
 *
 * Usage: NODE_PATH=api/node_modules node scripts/enrich-countertops-specs.js [--write]
 */
const path = require('path');
const fs = require('fs');
require('dotenv').config({ path: path.join(__dirname, '..', 'api', '.env') });
const { createClient } = require('@supabase/supabase-js');

const supa = createClient('https://ypeypgwsycxcagncgdur.supabase.co', process.env.SUPABASE_SERVICE_KEY);
const FILE = path.join(__dirname, '..', 'data', 'countertops.json');

const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');

// Bare "126 x 63" -> 126" x 63"; leave anything already carrying a unit mark.
const fmtSize = (s) => {
  const v = String(s || '').trim();
  if (!v) return '';
  if (/["'mM]/.test(v)) return v;
  const m = v.match(/^(\d+(?:\.\d+)?)\s*x\s*(\d+(?:\.\d+)?)/i);
  return m ? `${m[1]}" x ${m[2]}"` : v;
};

const PLACEHOLDER_SIZE = 'Call for available sizes';
const PLACEHOLDER = 'Call for availability';

(async () => {
  const write = process.argv.includes('--write');

  const doc = JSON.parse(fs.readFileSync(FILE, 'utf8'));
  const list = doc.countertops;
  if (!Array.isArray(list)) throw new Error('countertops.json: .countertops is not an array');

  let rows = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supa.from('catalog_products')
      .select('slug, name, specs, size, sample_eligible, sample_price')
      .eq('category', 'slab').eq('active', true).order('id').range(from, from + 999);
    if (error) throw error;
    rows = rows.concat(data);
    if (data.length < 1000) break;
  }
  rows = rows.filter((r) => !(r.specs && r.specs.discontinued));

  const bySlug = new Map(rows.map((r) => [r.slug, r]));
  const byName = new Map();
  for (const r of rows) {
    const k = norm(r.name);
    (byName.get(k) || byName.set(k, []).get(k)).push(r);
  }

  const stats = { matchedSlug: 0, matchedName: 0, ambiguous: 0, orphan: 0,
    realSize: 0, realThickness: 0, realFinish: 0, realOrigin: 0, sampleable: 0,
    phSize: 0, phThickness: 0, phFinish: 0 };

  for (const c of list) {
    let m = bySlug.get(c.slug);
    if (m) stats.matchedSlug++;
    else {
      const g = byName.get(norm(c.name));
      if (g && g.length === 1) { m = g[0]; stats.matchedName++; }
      else if (g && g.length > 1) stats.ambiguous++;
      else stats.orphan++;
    }

    const sp = (m && m.specs) || {};
    const size = m ? (m.size || fmtSize(sp.slab_size)) : '';
    const thickness = sp.thickness ? String(sp.thickness) : '';
    const finish = sp.finish ? String(sp.finish) : '';
    const origin = sp.origin ? String(sp.origin) : '';

    if (size) stats.realSize++;
    if (thickness) stats.realThickness++;
    if (finish) stats.realFinish++;
    if (origin) stats.realOrigin++;

    // Display specs: real value, else a uniform placeholder so the card looks full.
    c.size = size || (stats.phSize++, PLACEHOLDER_SIZE);
    c.thickness = thickness || (stats.phThickness++, PLACEHOLDER);
    c.finish = finish || (stats.phFinish++, PLACEHOLDER);
    // Origin only when real — no "call for" placeholder (it is not orderable info).
    if (origin) c.origin = origin; else delete c.origin;

    // Sample gating: catalog truth only, never a placeholder.
    const eligible = m ? m.sample_eligible === true : false;
    c.sample_eligible = eligible;
    c.sample_price = eligible ? String(m.sample_price != null ? m.sample_price : '12.99') : null;
    if (eligible) stats.sampleable++;
  }

  console.log('=== enrich countertops.json ===');
  console.log(`rows: ${list.length}`);
  console.log(`matched by slug:      ${stats.matchedSlug}`);
  console.log(`matched by uniq name: ${stats.matchedName}`);
  console.log(`ambiguous (no data):  ${stats.ambiguous}`);
  console.log(`orphan (no data):     ${stats.orphan}`);
  console.log(`  -> real specs added: size ${stats.realSize}, thickness ${stats.realThickness}, finish ${stats.realFinish}, origin ${stats.realOrigin}`);
  console.log(`  -> sampleable (real): ${stats.sampleable}`);
  console.log(`  -> placeholders:     size ${stats.phSize}, thickness ${stats.phThickness}, finish ${stats.phFinish}`);

  if (!write) { console.log('\nDRY RUN — add --write'); process.exit(0); }

  fs.writeFileSync(FILE, JSON.stringify(doc, null, 1));
  console.log(`\nwrote ${FILE}`);
  process.exit(0);
})().catch((e) => { console.error('FATAL', e.message); process.exit(1); });
