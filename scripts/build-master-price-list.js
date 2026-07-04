#!/usr/bin/env node
/**
 * Build the MASTER PRICE LIST in catalog_products (Supabase) — the single
 * Aria-readable table of product · vendor · COST · retail · margin · stock.
 *
 * Joins dealer COST from the two live sources into every catalog row:
 *   VendorInventory   (portal pulls)   by SKU / SKU-token
 *   LineItemLibrary   (emailed sheets) by vendor + exact/last-token name
 * ...and writes vendor_cost (+ derived margin into specs). It does NOT touch
 * retail_price — retail stays whatever the marketplace already shows; this only
 * backfills the COST side so the catalog is a true master price list.
 *
 * Usage: node scripts/build-master-price-list.js [--write]   (dry-run without --write)
 */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', 'api', '.env') });
require('dotenv').config({ path: '/Users/homepc/voiceNow-crm/.env' });
const { createClient } = require('@supabase/supabase-js');
const { MongoClient } = require('mongodb');

const supa = createClient('https://ypeypgwsycxcagncgdur.supabase.co', process.env.SUPABASE_SERVICE_KEY);
const norm = (s) => String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
const skuTokens = (s) => (String(s || '').toUpperCase().match(/\b[A-Z0-9]{5,}\b/g) || []).filter((t) => /[A-Z]/.test(t) && /[0-9]/.test(t));
const productToken = (p) => { const st = skuTokens(p.sku); if (st.length) return st[st.length - 1]; const nt = skuTokens(p.name); return nt.length ? nt[nt.length - 1] : null; };
const round2 = (n) => Math.round(n * 100) / 100;

(async () => {
  const write = process.argv.includes('--write');
  const mongo = new MongoClient(process.env.MONGODB_URI); await mongo.connect();
  const db = mongo.db('voiceflow-crm');
  const vi = await db.collection('vendorinventories').find({}, { projection: { _id: 0, sku: 1, dealerCost: 1 } }).toArray();
  const lil = await db.collection('lineitemlibraries').find({}, { projection: { _id: 0, name: 1, cost: 1, vendor: 1 } }).toArray();
  await mongo.close();

  // cost indexes (mirror pricingSync)
  const viBySku = new Map(), viByTok = new Map();
  for (const r of vi) { if (!(Number(r.dealerCost) > 0)) continue; const k = norm(r.sku); if (k && !viBySku.has(k)) viBySku.set(k, Number(r.dealerCost)); for (const t of skuTokens(r.sku)) if (!viByTok.has(t)) viByTok.set(t, Number(r.dealerCost)); }
  const lilByVN = new Map(), lilByVTok = new Map();
  for (const r of lil) { if (!(Number(r.cost) > 0)) continue; const v = norm(r.vendor); lilByVN.set(v + '|' + norm(r.name), Number(r.cost)); for (const t of skuTokens(r.name)) { const k = v + '|' + t; if (!lilByVTok.has(k)) lilByVTok.set(k, Number(r.cost)); } }

  // load whole catalog
  let products = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supa.from('catalog_products').select('id,name,sku,category,vendor_id,retail_price,vendor_cost,specs').order('id').range(from, from + 999);
    if (error) throw error; products = products.concat(data || []); if (data.length < 1000) break;
  }

  const costOf = (p) => {
    let c = viBySku.get(norm(p.sku));
    if (!(c > 0)) c = lilByVN.get(norm(p.vendor_id) + '|' + norm(p.name));
    if (!(c > 0)) { const tok = productToken(p); if (tok) { c = viByTok.get(tok) || lilByVTok.get(norm(p.vendor_id) + '|' + tok); } }
    return Number(c) > 0 ? Number(c) : null;
  };

  const report = { total: products.length, hadCost: 0, costFilled: 0, stillNoCost: 0, bySrc: { vi: 0, lil: 0 } };
  const patches = [];
  for (const p of products) {
    if (Number(p.vendor_cost) > 0) { report.hadCost++; continue; }
    const cost = costOf(p);
    if (!cost) { report.stillNoCost++; continue; }
    const fields = { vendor_cost: cost, updated_at: new Date().toISOString() };
    if (Number(p.retail_price) > 0) {
      const margin = round2((p.retail_price - cost) / p.retail_price * 100);
      fields.specs = { ...(p.specs || {}), margin_pct: margin, markup_x: round2(p.retail_price / cost) };
    }
    patches.push({ id: p.id, fields }); report.costFilled++;
  }

  report.masterListPriced = products.filter((p) => Number(p.retail_price) > 0).length;
  report.masterListWithCostAfter = report.hadCost + report.costFilled;
  console.log(JSON.stringify(report, null, 2));

  if (!write) { console.log('DRY RUN — add --write to backfill vendor_cost.'); process.exit(0); }
  let ok = 0, failed = 0, i = 0;
  await Promise.all(Array.from({ length: 12 }, async () => {
    while (i < patches.length) { const u = patches[i++]; const { error } = await supa.from('catalog_products').update(u.fields).eq('id', u.id); if (error) failed++; else ok++; }
  }));
  console.log(`\nWROTE vendor_cost on ${ok} rows (${failed} failed).`);
  process.exit(0);
})().catch((e) => { console.error('FATAL', e); process.exit(1); });
