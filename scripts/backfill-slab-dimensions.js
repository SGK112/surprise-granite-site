#!/usr/bin/env node
/**
 * Backfill slab dimensions into the catalog ("They also show the dimensions
 * for each slab and you are not showing that in the UI", Josh 2026-07-06).
 * The vendor price books carry them — parser output lands in
 * lineitemlibraries name/description as "126x63", "Jumbo 136x79",
 * "136x79=74.61sqft", "~58sqft/slab" — so match each slab-color product to
 * its library rows (same matcher as apply-sample-sqft-pricing.js) and write:
 *   specs.slab_size  "126 x 63"        size column   126" x 63"
 *   specs.slab_sqft  55.1              (stated, else w*h/144)
 *   specs.thickness  "2cm, 3cm"        (tokens seen across the color's rows)
 *   specs.finish     "Polished, Leathered"
 *
 * Usage: NODE_PATH=api/node_modules node scripts/backfill-slab-dimensions.js [--write]
 */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', 'api', '.env') });
require('dotenv').config({ path: '/Users/homepc/voiceNow-crm/.env' });
const { createClient } = require('@supabase/supabase-js');
const { MongoClient } = require('mongodb');

const supa = createClient('https://ypeypgwsycxcagncgdur.supabase.co', process.env.SUPABASE_SERVICE_KEY);

const VENDOR_MAP = {
  'msi': ['MSI'],
  'cosentino': ['Cosentino', 'Aracruz Granite'],
  'silestone': ['Cosentino', 'Aracruz Granite'],
  'caesarstone': ['Aracruz Granite', 'Cactus Stone & Tile'],
  'arizona-tile': ['Arizona Tile'],
  'bolder-image-stone': ['Bolder Image Stone'],
  'pentalquartz': ['Architectural Surfaces (ASG)'],
  'daltile': ['Daltile'],
  'classic-surfaces': ['Classic Surfaces', 'Architectural Surfaces (ASG)'],
  'cactus-stone': ['Cactus Stone & Tile'],
  'monterrey-tile': ['Monterrey Tile Company'],
  'lx-hausys': ['LX Hausys', 'Monterrey Tile Company'],
};

const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
const baseName = (s) => String(s || '')
  .replace(/\(aka:[^)]*\)/gi, '')
  .replace(/\([^)]*\)/g, ' ')
  .replace(/\b\d+(?:\.\d+)?\s*cm\b/gi, ' ')
  .replace(/\bjumbo\s*\d+x\d+\b/gi, ' ')
  .replace(/\b(polished|honed|leathered|leather|caressed|brushed|matte|lava|dual|suede|satin|1st choice|finish|slabs?)\b/gi, ' ')
  .replace(/\b(silestone|caesarstone|acarastone|rough)\b/gi, ' ')
  .replace(/\b(quartzite|quartz|granite|marble|porcelain|dekton|soapstone|travertine|dolomite|scalea|sensa by cosentino|sensa)\b/gi, ' ')
  .trim();

// Extract dimension facts from one library row's name + description.
const factsOf = (r) => {
  const text = `${r.name || ''} | ${r.description || ''}`;
  const out = { w: null, h: null, sqft: null, thick: new Set(), finish: new Set() };
  // 126x63 / 136 x 79 / 137×78.7 — slab-plausible ranges only (long side
  // 90-160", short side 40-90") so tile sizes like 12x24 don't sneak in
  const dm = text.match(/\b(\d{2,3}(?:\.\d+)?)\s*[x×]\s*(\d{2,3}(?:\.\d+)?)\b/g) || [];
  for (const d of dm) {
    let [a, b] = d.split(/[x×]/).map((n) => parseFloat(n));
    if (b > a) [a, b] = [b, a];
    if (a >= 90 && a <= 165 && b >= 40 && b <= 90) { out.w = a; out.h = b; break; }
  }
  const sq = text.match(/[=~]?\s*(\d{2,3}(?:\.\d+)?)\s*(?:sq\.?\s*ft|sqft)\b/i);
  if (sq) { const v = parseFloat(sq[1]); if (v >= 25 && v <= 120) out.sqft = v; }
  if (/\b3\s*cm\b/i.test(text)) out.thick.add('3cm');
  if (/\b2\s*cm\b/i.test(text)) out.thick.add('2cm');
  if (/\b1\.6\s*cm\b/i.test(text)) out.thick.add('1.6cm');
  for (const f of ['Polished', 'Honed', 'Leathered', 'Brushed', 'Matte', 'Satin', 'Suede', 'Caressed'])
    if (new RegExp(`\\b${f}\\b`, 'i').test(text)) out.finish.add(f);
  return out;
};

(async () => {
  const write = process.argv.includes('--write');
  const mongo = new MongoClient(process.env.MONGODB_URI); await mongo.connect();
  const lil = await mongo.db('voiceflow-crm').collection('lineitemlibraries')
    .find({ unit: 'sqft' }, { projection: { name: 1, description: 1, vendor: 1 } }).toArray();
  await mongo.close();

  // vendor|base -> merged facts across that color's rows (2cm+3cm variants etc.)
  const index = new Map();
  for (const r of lil) {
    const key = r.vendor + '|' + norm(baseName(r.name));
    const f = factsOf(r);
    if (!index.has(key)) index.set(key, { w: null, h: null, sqft: null, thick: new Set(), finish: new Set() });
    const g = index.get(key);
    if (f.w && !g.w) { g.w = f.w; g.h = f.h; }
    if (f.sqft && !g.sqft) g.sqft = f.sqft;
    f.thick.forEach((t) => g.thick.add(t));
    f.finish.forEach((x) => g.finish.add(x));
  }

  const factsFor = (libVendors, productName) => {
    const base = norm(baseName(productName));
    if (!base || base.length < 4) return null;
    for (const v of libVendors) {
      const g = index.get(v + '|' + base);
      if (g) return g;
    }
    for (const v of libVendors) {
      const pref = v + '|';
      const hits = [];
      for (const [key, g] of index) {
        if (!key.startsWith(pref)) continue;
        const kbase = key.slice(pref.length);
        if (kbase.length < 4) continue;
        if (kbase.startsWith(base) || base.startsWith(kbase)) hits.push(g);
      }
      if (hits.length === 1) return hits[0];
    }
    return null;
  };

  let products = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supa.from('catalog_products')
      .select('id,name,vendor_id,size,specs')
      .eq('category', 'slab').eq('active', true).order('id').range(from, from + 999);
    if (error) throw error;
    products = products.concat(data || []);
    if (data.length < 1000) break;
  }

  const report = { slabs: products.length, matched: 0, withSize: 0, sqftOnly: 0, thickOrFinishOnly: 0, byVendor: {} };
  const patches = [];
  for (const p of products) {
    const libVendors = VENDOR_MAP[p.vendor_id];
    if (!libVendors) continue;
    const g = factsFor(libVendors, p.name);
    if (!g) continue;
    const specs = { ...(p.specs || {}) };
    const fields = {};
    let touched = false;
    if (g.w && !specs.slab_size) {
      specs.slab_size = `${g.w} x ${g.h}`;
      fields.size = `${g.w}" x ${g.h}"`;
      specs.slab_sqft = g.sqft || Math.round((g.w * g.h) / 144 * 10) / 10;
      touched = true; report.withSize++;
    } else if (g.sqft && !specs.slab_sqft) {
      specs.slab_sqft = g.sqft;
      touched = true; report.sqftOnly++;
    }
    if (g.thick.size && !specs.thickness) {
      specs.thickness = ['3cm', '2cm', '1.6cm'].filter((t) => g.thick.has(t)).join(', ');
      touched = true;
    }
    if (g.finish.size && !specs.finish) {
      specs.finish = [...g.finish].join(', ');
      touched = true;
    }
    if (!touched) continue;
    if (!fields.size && !specs.slab_size) report.thickOrFinishOnly++;
    report.matched++;
    report.byVendor[p.vendor_id] = (report.byVendor[p.vendor_id] || 0) + 1;
    patches.push({ id: p.id, name: p.name, vendor: p.vendor_id, fields: { ...fields, specs, updated_at: new Date().toISOString() } });
  }
  console.log(JSON.stringify(report, null, 2));
  console.log('examples:\n  ' + patches.slice(0, 10).map((x) =>
    `${x.vendor}:${x.name} -> size=${x.fields.size || '-'} specs=${JSON.stringify({ ...x.fields.specs, sample_pricing: undefined, sqft_price: undefined, material: undefined })}`).join('\n  '));

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
