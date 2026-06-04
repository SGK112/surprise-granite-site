#!/usr/bin/env node
/**
 * Monterrey Tile price-list importer.
 *
 * Reads the 5 Monterrey PDFs (via pdftotext -layout), normalizes every list
 * into ONE shape, and (with --commit) upserts into distributor_products under
 * the Monterrey distributor_profile. DRY by default — prints counts + a sample
 * and writes a full CSV to /tmp for review.
 *
 * The normalize/validate/upsert half is vendor-agnostic; only parseXxx() is
 * per-list. Next vendor = add a parser (or feed the normalized CSV directly).
 *
 *   node scripts/import-monterrey.mjs            # dry run
 *   node scripts/import-monterrey.mjs --commit   # write to DB
 */
import fs from 'fs';
import os from 'os';
import { execSync } from 'child_process';

const COMMIT = process.argv.includes('--commit');
const DL = `${os.homedir()}/Downloads`;
const MONTERREY_ID = '1f73a94c-d826-430d-950e-994438980377';

const FILES = {
  symphony: `${DL}/Symphony Price List.pdf`,
  vitabella: `${DL}/VitaBella-Quartz-Fabricator-Prices.pdf`,
  viatera: `${DL}/LGViatera-Quartz-Fabricator-Retail-Prices.pdf`,
  hawkins: `${DL}/Hawkins Bay Collection-Displaying- Retail-Price List.pdf`,
  stone: `${DL}/Stone Retail & Fabricator Price List.pdf`,
};

const txt = (f) => execSync(`pdftotext -layout "${f}" -`, { encoding: 'utf8', maxBuffer: 50 * 1024 * 1024 });
const money = (s) => { const n = parseFloat(String(s).replace(/[$,\s]/g, '')); return Number.isFinite(n) ? n : null; };
const sqftOf = (dim) => { const m = /(\d+)\s*[xX]\s*(\d+)/.exec(dim || ''); return m ? (parseInt(m[1]) * parseInt(m[2])) / 144 : null; };
const perSqft = (slabPrice, dim) => { const sf = sqftOf(dim); return (slabPrice && sf) ? +(slabPrice / sf).toFixed(2) : null; };

const rows = [];
const add = (r) => rows.push({
  distributor_id: MONTERREY_ID, brand: r.brand, name: r.name, collection: r.collection || null,
  category: r.category, material_type: r.material_type, color: r.color || null, finish: r.finish || null,
  dimensions: r.dimensions || null, thickness: r.thickness || null, unit_type: r.unit_type || 'sqft',
  cost_price: r.cost ?? null, retail_price: r.retail ?? null,
  unit_price: r.retail ?? r.cost ?? null,         // display price = retail (fallback cost)
  vendor_sku: r.vendor_sku || null, model: r.model || null, is_active: true,
  attributes: r.attributes || {},
});

// ---- Symphony: NAME  SIZE  $retail/slab  $fab/slab  $fab/sqft ----
function parseSymphony(t) {
  let n = 0;
  for (const line of t.split('\n')) {
    const m = /^([A-Z][A-Z ]+?)\s+(\d+x\d+)\s+\$([\d,]+)\s+\$([\d,]+)\s+\$([\d.]+)\s*$/.exec(line.trim());
    if (!m) continue;
    add({ brand: 'Symphony (Aurea Stone)', name: titlecase(m[1]), category: 'slab', material_type: 'quartz',
      dimensions: m[2], thickness: '2cm', unit_type: 'sqft', retail: perSqft(money(m[3]), m[2]), cost: money(m[5]),
      attributes: { retail_per_slab: money(m[3]), fab_per_slab: money(m[4]), series: 'Symphony' } });
    n++;
  }
  return n;
}

// ---- Vita Bella: grouped; NAME SIZE $retail/slab $fab/slab $fab/sqft ----
function parseVitaBella(t) {
  let n = 0, coll = null;
  for (const line of t.split('\n')) {
    const c = /^(VITA BELLA [A-Z ]+?)(?:\s*$)/.exec(line.trim());
    if (c && /SILICA|SERIES|COLLECTION/.test(c[1])) { coll = titlecase(c[1].replace(/^VITA BELLA /, '')); continue; }
    const m = /^([A-Z][A-Z\- ]+?)\s+(\d+X\d+)\s+\$([\d,]+)\s+\$([\d,]+)\s+\$([\d.]+)\s*$/.exec(line.trim());
    if (!m) continue;
    add({ brand: 'Vita Bella', name: titlecase(m[1]), collection: coll, category: 'slab', material_type: 'quartz',
      dimensions: m[2], thickness: '2cm', unit_type: 'sqft', retail: perSqft(money(m[3]), m[2]), cost: money(m[5]),
      attributes: { retail_per_slab: money(m[3]), fab_per_slab: money(m[4]) } });
    n++;
  }
  return n;
}

// ---- Viatera: NAME SIZE $ret2 $fab2 SIZE $ret3 $fab3 GROUP (separate row per thickness) ----
function parseViatera(t) {
  let n = 0;
  for (const line of t.split('\n')) {
    const s = line.trim();
    // 2cm block: size retail fab ; then 3cm block: size retail fab ; trailing GROUP X
    const m = /^([A-Z][A-Z0-9\-\*\(\) ]+?)\s+(\d+[xX]\d+)\*{0,2}\s+\$([\d,]+)\s+\$([\d,]+)\s+(?:(\d+[xX]\d+)\*{0,2}\s+\$([\d,]+)\s+\$([\d,]+)\s+)?GROUP\s+([A-Z]+)\s*$/.exec(s);
    if (!m) continue;
    const rawname = m[1].replace(/\*+/g, '').trim();
    const stocked = /\*\*/.test(m[1]) || /\*\*/.test(line);
    const grp = `Group ${m[8]}`;
    // 2cm variant
    if (m[3]) add({ brand: 'Viatera (LX Hausys)', name: `${titlecase(rawname)} 2cm`, collection: grp, model: titlecase(rawname),
      category: 'slab', material_type: 'quartz', dimensions: m[2], thickness: '2cm', unit_type: 'sqft',
      retail: perSqft(money(m[3]), m[2]), cost: perSqft(money(m[4]), m[2]),
      attributes: { group: m[8], stocked, retail_per_slab: money(m[3]), fab_per_slab: money(m[4]) } }) && n++;
    // 3cm variant
    if (m[5] && m[6]) add({ brand: 'Viatera (LX Hausys)', name: `${titlecase(rawname)} 3cm`, collection: grp, model: titlecase(rawname),
      category: 'slab', material_type: 'quartz', dimensions: m[5], thickness: '3cm', unit_type: 'sqft',
      retail: perSqft(money(m[6]), m[5]), cost: perSqft(money(m[7]), m[5]),
      attributes: { group: m[8], stocked, retail_per_slab: money(m[6]), fab_per_slab: money(m[7]) } }) && n++;
  }
  return n;
}

// ---- Stone: NAME  ORIGIN  $retail/sqft  $fab/sqft  GROUP ----
function parseStone(t) {
  let n = 0, material = 'granite';
  const ORIGINS = /\b(BRAZIL|INDIA|SPAIN|NORWAY|ITALY|TURKEY|CHINA|USA|CANADA|MEXICO|GREECE|IRAN|EGYPT|NAMIBIA|FINLAND|ANGOLA|SAUDI ARABIA)\b/;
  for (const line of t.split('\n')) {
    const s = line.trim();
    if (/^(GRANITE|MARBLE|QUARTZITE|QUARTZ|LIMESTONE|TRAVERTINE|ONYX|SOAPSTONE|SLATE|SINKS?)$/.test(s)) { material = s.toLowerCase(); continue; }
    const m = new RegExp(`^([A-Z0-9][A-Z0-9'\\-\\* ]+?)\\s+${ORIGINS.source}\\s+\\$\\s*([\\d,.]+)\\s+\\$\\s*([\\d,.]+)\\s+([IVX]+)\\s*$`).exec(s);
    if (!m) continue;
    let name = m[1].replace(/\*+/g, '').trim();
    const dyed = /\*\*\*\*/.test(line);
    const thickness = /3CM/.test(name) ? '3cm' : (/2CM/.test(name) ? '2cm' : null);
    add({ brand: 'Monterrey Natural Stone', name: titlecase(name), category: 'slab',
      material_type: material === 'sinks' ? 'sink' : material, thickness, unit_type: 'sqft',
      retail: money(m[3]), cost: money(m[4]),
      attributes: { origin: titlecase(m[2]), group: m[5], dyed } });
    n++;
  }
  return n;
}

// ---- Hawkins Bay laminate flooring: 11 colors @ $4.65/SF (retail only) ----
function parseHawkins(t) {
  const colors = ['Aft','Anchorage','Battin','Binnacle','Cabin','Fairwater','Juneau','Keel','Seward','Spratly','Stern'];
  const pm = /\$([\d.]+)\s*SF/.exec(t);
  const retail = pm ? money(pm[1]) : 4.65;
  for (const c of colors) add({ brand: 'Hawkins Bay', name: `Hawkins Bay ${c}`, collection: 'Hawkins Bay Collection',
    category: 'flooring', material_type: 'laminate', color: c, dimensions: '9.37x59.5', thickness: '14mm',
    unit_type: 'sqft', retail, cost: null, attributes: { waterproof: true, sf_per_carton: 19.6 } });
  return colors.length;
}

function titlecase(s){ return s.toLowerCase().replace(/\b\w/g, m=>m.toUpperCase()).replace(/\bAnd\b/g,'and').trim(); }

// ---- run parsers ----
const counts = {
  symphony: parseSymphony(txt(FILES.symphony)),
  vitabella: parseVitaBella(txt(FILES.vitabella)),
  viatera: parseViatera(txt(FILES.viatera)),
  stone: parseStone(txt(FILES.stone)),
  hawkins: parseHawkins(txt(FILES.hawkins)),
};

console.log('=== PARSED COUNTS ===');
for (const [k, v] of Object.entries(counts)) console.log(`  ${k.padEnd(12)} ${v} rows`);
console.log(`  TOTAL        ${rows.length} rows`);

console.log('\n=== SAMPLE (2 per list) ===');
for (const k of Object.keys(counts)) {
  const brandKey = { symphony:'Symphony', vitabella:'Vita Bella', viatera:'Viatera', stone:'Natural Stone', hawkins:'Hawkins' }[k];
  rows.filter(r => r.brand.includes(brandKey.split(' ')[0])).slice(0, 2).forEach(r =>
    console.log(`  [${k}] ${r.name} | ${r.material_type}/${r.category} | ${r.thickness||'-'} | cost $${r.cost_price ?? '-'}/sf retail $${r.retail_price ?? '-'}/sf | ${JSON.stringify(r.attributes).slice(0,70)}`));
}

// full CSV for review
const cols = ['brand','name','collection','category','material_type','color','thickness','dimensions','unit_type','cost_price','retail_price','vendor_sku','model'];
const csv = [cols.join(',')].concat(rows.map(r => cols.map(c => JSON.stringify(r[c] ?? '')).join(','))).join('\n');
fs.writeFileSync('/tmp/monterrey_import.csv', csv);
console.log('\nFull normalized CSV → /tmp/monterrey_import.csv');

if (!COMMIT) { console.log('\nDRY RUN — no DB writes. Re-run with --commit to load.'); process.exit(0); }

// ---- commit: upsert into distributor_products ----
const rk = fs.readFileSync(`${os.homedir()}/.render-key`, 'utf8').trim();
const ev = await (await fetch('https://api.render.com/v1/services/srv-d5ca9gh5pdvs73c5kscg/env-vars?limit=100', { headers: { Authorization: `Bearer ${rk}` } })).json();
const get = (k) => { const v = ev.find(x => (x.envVar?.key || x.key) === k); return v ? (v.envVar?.value || v.value) : undefined; };
const { createClient } = await import(`${process.cwd()}/api/node_modules/@supabase/supabase-js/dist/main/index.js`).catch(() => import('@supabase/supabase-js'));
const sb = createClient(get('SUPABASE_URL'), get('SUPABASE_SERVICE_KEY'));
let ok = 0, fail = 0;
for (const r of rows) {
  const { error } = await sb.from('distributor_products').insert(r);
  if (error) { fail++; if (fail <= 5) console.log('  ✗', r.name, error.message); } else ok++;
}
console.log(`\nINSERTED ${ok} / ${rows.length} (${fail} failed)`);
