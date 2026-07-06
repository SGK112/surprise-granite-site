#!/usr/bin/env node
/**
 * Repair the Ruvati catalog: an old import generation stuffed URL slugs into
 * the sku column, so the vendor stock sync (which joins by REAL SKU) never
 * touches those rows — they stay "in stock" forever. 2026-07-06: the store's
 * FIRST order was one of these ghosts (RVA1049ST, qty 0 at Ruvati).
 *
 *  - real SKU extracted from the product name (Ruvati names end with it)
 *  - stock + dealer cost joined from vendorinventories
 *  - twins deduped: one row per real SKU (keep the one with a real sku
 *    already, else the junk row gets repaired in place), extras deactivated
 *  - rows Ruvati doesn't carry at all (no vendorinventories match) keep
 *    their data but get in_stock=false — never sellable while unverifiable
 *
 * Usage: NODE_PATH=api/node_modules node scripts/repair-ruvati-catalog.js [--write]
 */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', 'api', '.env') });
const fs = require('fs');
const { createClient } = require('@supabase/supabase-js');
const { MongoClient } = require('mongodb');

const supa = createClient('https://ypeypgwsycxcagncgdur.supabase.co', process.env.SUPABASE_SERVICE_KEY);
const MONGO = fs.readFileSync('/Users/homepc/voiceNow-crm/.env', 'utf8').match(/^MONGODB_URI=(.+)$/m)[1].trim();
const WRITE = process.argv.includes('--write');

const SKU_RX = /\b(RV[ABCDGHKLMPQSTUVWXYZ][A-Z0-9-]{2,14})\b/gi;
const realSku = (p) => {
  if (p.sku && /^RV[A-Z]/i.test(p.sku) && !/-.+-.+-/.test(p.sku)) return String(p.sku).toUpperCase();
  const hits = [...String(p.name).matchAll(SKU_RX)].map((m) => m[1].toUpperCase());
  if (!hits.length) return null;
  const last = hits[hits.length - 1];
  // Accessory guard: "Bottom Rinse Grid for RVM5166 sink - RVM5166" ends with
  // the PARENT sink's SKU, not its own — extracting it would merge the grid
  // into the sink row and deactivate it as a "dupe". If the trailing token
  // equals a "for <SKU>" reference, the row has no reliable SKU of its own.
  const parentRef = String(p.name).match(/\bfor\s+(?:the\s+)?(RV[A-Z][A-Z0-9-]{2,14})/i);
  if (parentRef && parentRef[1].toUpperCase() === last) return null;
  return last;
};

(async () => {
  const mongo = new MongoClient(MONGO); await mongo.connect();
  const vi = await mongo.db('voiceflow-crm').collection('vendorinventories')
    .find({ vendor: 'ruvati' }, { projection: { sku: 1, inStock: 1, dealerCost: 1, availableQty: 1, eta: 1 } }).toArray();
  await mongo.close();
  const viBySku = new Map(vi.map((r) => [String(r.sku).toUpperCase(), r]));

  let rows = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supa.from('catalog_products')
      .select('id,sku,name,vendor_id,active,in_stock,retail_price,vendor_cost,specs')
      .in('vendor_id', ['ruvati', 'ruvati-sinks']).order('id').range(from, from + 999);
    if (error) throw error;
    rows = rows.concat(data || []);
    if (data.length < 1000) break;
  }

  const bySku = new Map(); // realSku -> rows[]
  const noSku = [];
  for (const p of rows) {
    const s = realSku(p);
    if (!s) { noSku.push(p); continue; }
    if (!bySku.has(s)) bySku.set(s, []);
    bySku.get(s).push(p);
  }

  const report = { rows: rows.length, uniqueSkus: bySku.size, noSkuExtracted: noSku.length, repaired: 0, dupesDeactivated: 0, stockCorrected: 0, unverifiable: 0 };
  const updates = [];
  const deactivate = [];

  for (const [sku, group] of bySku) {
    // keeper: prefers already-real sku, then active, then first
    group.sort((a, b) => ((/^RV/i.test(b.sku) && !/-.+-/.test(b.sku)) ? 1 : 0) - ((/^RV/i.test(a.sku) && !/-.+-/.test(a.sku)) ? 1 : 0) || (b.active ? 1 : 0) - (a.active ? 1 : 0));
    const keep = group[0];
    for (const extra of group.slice(1)) if (extra.active) { deactivate.push(extra.id); report.dupesDeactivated++; }
    const inv = viBySku.get(sku);
    const fields = { sku, updated_at: new Date().toISOString() };
    if (inv) {
      fields.in_stock = inv.inStock === true;
      if (inv.dealerCost > 0) fields.vendor_cost = inv.dealerCost;
      fields.specs = { ...(keep.specs || {}), ruvati_qty: inv.availableQty ?? null, ruvati_eta: inv.eta ?? null, stock_synced_at: new Date().toISOString() };
      if (keep.in_stock !== (inv.inStock === true)) report.stockCorrected++;
    } else {
      fields.in_stock = false; // Ruvati doesn't carry it — never sellable silently
      report.unverifiable++;
    }
    if (keep.sku !== sku || 'in_stock' in fields) { updates.push({ id: keep.id, fields }); report.repaired++; }
  }
  // rows with no extractable SKU: not sellable
  for (const p of noSku) if (p.active && p.in_stock) { updates.push({ id: p.id, fields: { in_stock: false, updated_at: new Date().toISOString() } }); report.unverifiable++; }

  console.log(JSON.stringify(report, null, 2));
  if (!WRITE) { console.log('DRY RUN — add --write'); process.exit(0); }
  let ok = 0, fail = 0, i = 0;
  await Promise.all(Array.from({ length: 8 }, async () => {
    while (i < updates.length) {
      const u = updates[i++];
      const { error } = await supa.from('catalog_products').update(u.fields).eq('id', u.id);
      if (error) fail++; else ok++;
    }
  }));
  if (deactivate.length) await supa.from('catalog_products').update({ active: false, updated_at: new Date().toISOString() }).in('id', deactivate);
  console.log(`WROTE ${ok} updates (${fail} failed), ${deactivate.length} dupes deactivated`);
  process.exit(0);
})().catch((e) => { console.error('FATAL', e); process.exit(1); });
