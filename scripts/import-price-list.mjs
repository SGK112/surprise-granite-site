#!/usr/bin/env node
/**
 * Generic vendor price-list importer.
 *
 * Updates catalog_products.vendor_cost from a CSV and recomputes retail_price
 * from the vendor's markup (vendor_config.default_markup_pct) — so reps only
 * need to send COST. Matches rows by SKU first, then exact name (within the
 * vendor). DRY by default; pass --commit to write.
 *
 *   node scripts/import-price-list.mjs <vendor_id> <csv-path> [--commit]
 *   node scripts/import-price-list.mjs kibi pricing-lists/kibi/2026.csv --commit
 */
import fs from 'fs';
import os from 'os';

const [vendorId, csvPath] = process.argv.slice(2).filter(a => !a.startsWith('--'));
const COMMIT = process.argv.includes('--commit');
if (!vendorId || !csvPath) { console.error('Usage: node scripts/import-price-list.mjs <vendor_id> <csv-path> [--commit]'); process.exit(1); }
if (!fs.existsSync(csvPath)) { console.error('CSV not found:', csvPath); process.exit(1); }

// minimal CSV parser (handles quoted fields + commas)
function parseCsv(text) {
  const rows = []; let row = [], cur = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"' && text[i+1] === '"') { cur += '"'; i++; } else if (c === '"') q = false; else cur += c; }
    else if (c === '"') q = true;
    else if (c === ',') { row.push(cur); cur = ''; }
    else if (c === '\n' || c === '\r') { if (cur !== '' || row.length) { row.push(cur); rows.push(row); row = []; cur = ''; } if (c === '\r' && text[i+1] === '\n') i++; }
    else cur += c;
  }
  if (cur !== '' || row.length) { row.push(cur); rows.push(row); }
  return rows;
}
const money = s => { const n = parseFloat(String(s ?? '').replace(/[$,\s]/g, '')); return Number.isFinite(n) ? n : null; };

const raw = parseCsv(fs.readFileSync(csvPath, 'utf8')).filter(r => r.some(c => c.trim() !== ''));
const header = raw[0].map(h => h.trim().toLowerCase());
const ci = name => header.indexOf(name);
const iSku = ci('sku'), iCost = ci('cost'), iRetail = ci('retail'), iName = ci('name');
if (iSku < 0 && iName < 0) { console.error('CSV needs a "sku" or "name" column. Header was:', header.join(',')); process.exit(1); }
const lines = raw.slice(1).map(r => ({
  sku: iSku >= 0 ? (r[iSku] || '').trim() : '',
  name: iName >= 0 ? (r[iName] || '').trim() : '',
  cost: iCost >= 0 ? money(r[iCost]) : null,
  retail: iRetail >= 0 ? money(r[iRetail]) : null,
})).filter(l => (l.sku || l.name) && (l.cost != null || l.retail != null));
console.log(`Parsed ${lines.length} priced rows from ${csvPath} for vendor "${vendorId}"`);

const rk = fs.readFileSync(`${os.homedir()}/.render-key`, 'utf8').trim();
const ev = await (await fetch('https://api.render.com/v1/services/srv-d5ca9gh5pdvs73c5kscg/env-vars?limit=100', { headers: { Authorization: `Bearer ${rk}` } })).json();
const get = k => { const v = ev.find(x => (x.envVar?.key || x.key) === k); return v ? (v.envVar?.value || v.value) : undefined; };
const { createClient } = await import('@supabase/supabase-js');
const sb = createClient(get('SUPABASE_URL'), get('SUPABASE_SERVICE_KEY'));

const { data: vc } = await sb.from('vendor_config').select('default_markup_pct,vendor_name').eq('vendor_id', vendorId).maybeSingle();
if (!vc) { console.error(`vendor_id "${vendorId}" not in vendor_config. Add it first or check the id.`); process.exit(1); }
const markup = (vc.default_markup_pct || 0) / 100;
console.log(`Vendor: ${vc.vendor_name} | markup ${vc.default_markup_pct || 0}% → retail = cost × ${(1 + markup).toFixed(2)} when retail not provided\n`);

let matched = 0, unmatched = 0, updates = [];
for (const l of lines) {
  let prod = null;
  if (l.sku) {
    const { data } = await sb.from('catalog_products').select('id,name,sku').eq('vendor_id', vendorId).eq('sku', l.sku).limit(1).maybeSingle();
    prod = data;
  }
  if (!prod && l.name) {
    const { data } = await sb.from('catalog_products').select('id,name,sku').eq('vendor_id', vendorId).eq('name', l.name).limit(1).maybeSingle();
    prod = data;
  }
  if (!prod) { unmatched++; if (unmatched <= 8) console.log('  ✗ no match:', l.sku || l.name); continue; }
  matched++;
  const cost = l.cost;
  const retail = l.retail != null ? l.retail : (cost != null ? +(cost * (1 + markup)).toFixed(2) : null);
  updates.push({ id: prod.id, vendor_cost: cost, retail_price: retail, name: prod.name });
}
console.log(`\nMatched ${matched}, unmatched ${unmatched}.`);
console.log('Sample updates:'); updates.slice(0, 6).forEach(u => console.log(`  ${u.name.slice(0,40)} → cost $${u.vendor_cost ?? '-'} retail $${u.retail_price ?? '-'}`));

if (!COMMIT) { console.log(`\nDRY RUN — pass --commit to write ${updates.length} updates.`); process.exit(0); }
let ok = 0, fail = 0;
for (const u of updates) {
  const patch = { updated_at: new Date().toISOString() };
  if (u.vendor_cost != null) patch.vendor_cost = u.vendor_cost;
  if (u.retail_price != null) { patch.retail_price = u.retail_price; patch.unit_price = u.retail_price; }
  const { error } = await sb.from('catalog_products').update(patch).eq('id', u.id);
  if (error) { fail++; if (fail <= 3) console.log('  err:', error.message); } else ok++;
}
console.log(`\n✅ Updated ${ok} products (${fail} failed) for ${vendorId}.`);
