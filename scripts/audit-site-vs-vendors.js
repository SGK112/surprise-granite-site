#!/usr/bin/env node
/**
 * Site-vs-vendor truth audit (READ-ONLY). For every ACTIVE catalog product,
 * check whether a vendor source backs it and whether its pricing is sane.
 * Emits a summary + writes the full flag list to scratch for review.
 * NOTHING is deactivated or changed here — report only.
 *
 * Usage: NODE_PATH=api/node_modules node scripts/audit-site-vs-vendors.js
 */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', 'api', '.env') });
const fs = require('fs');
const { createClient } = require('@supabase/supabase-js');
const { MongoClient } = require('mongodb');

const supa = createClient('https://ypeypgwsycxcagncgdur.supabase.co', process.env.SUPABASE_SERVICE_KEY);
const MONGO = fs.readFileSync('/Users/homepc/voiceNow-crm/.env', 'utf8').match(/^MONGODB_URI=(.+)$/m)[1].trim();

const VENDOR_MAP = {
  'msi': ['MSI'],
  'cosentino': ['Cosentino', 'Aracruz Granite'],
  'silestone': ['Cosentino', 'Aracruz Granite'],
  'caesarstone': ['Aracruz Granite', 'Cactus Stone & Tile'],
  'arizona-tile': ['Arizona Tile'],
  'bolder-image-stone': ['Bolder Image Stone'],
  'pentalquartz': ['Architectural Surfaces (ASG)'],
  'hanstone': ['ESI'],
  'daltile': ['Daltile'],
  'classic-surfaces': ['Classic Surfaces', 'Architectural Surfaces (ASG)'],
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

(async () => {
  const mongo = new MongoClient(MONGO); await mongo.connect();
  const lil = await mongo.db('voiceflow-crm').collection('lineitemlibraries')
    .find({ unit: 'sqft', cost: { $gt: 0 } }, { projection: { name: 1, vendor: 1 } }).toArray();
  const vi = await mongo.db('voiceflow-crm').collection('vendorinventories')
    .find({}, { projection: { vendor: 1, sku: 1, dealerCost: 1, inStock: 1 } }).toArray();
  await mongo.close();

  const libKeys = new Set(lil.map((r) => r.vendor + '|' + norm(baseName(r.name))));
  const libPrefix = new Map(); // vendor -> [bases]
  for (const r of lil) {
    const v = r.vendor, b = norm(baseName(r.name));
    if (b.length < 4) continue;
    if (!libPrefix.has(v)) libPrefix.set(v, []);
    libPrefix.get(v).push(b);
  }
  const invBySku = new Map(vi.map((r) => [`${r.vendor}|${String(r.sku).toUpperCase()}`, r]));

  let products = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supa.from('catalog_products')
      .select('id,name,sku,vendor_id,category,retail_price,vendor_cost,specs,in_stock')
      .eq('active', true).order('id').range(from, from + 999);
    if (error) throw error;
    products = products.concat(data || []);
    if (data.length < 1000) break;
  }

  const flags = [];
  const summary = { active: products.length, slabBacked: 0, slabUnbacked: 0, fixtureBacked: 0, fixtureUnbacked: 0, priceSuspect: 0, stockMismatch: 0 };
  const slabBacked = (p) => {
    const vendors = VENDOR_MAP[p.vendor_id];
    if (!vendors) return null; // no book for this vendor — unknown, not unbacked
    const base = norm(baseName(p.name));
    if (base.length < 4) return false;
    for (const v of vendors) {
      if (libKeys.has(v + '|' + base)) return true;
      const hits = (libPrefix.get(v) || []).filter((kb) => kb.startsWith(base) || base.startsWith(kb));
      if (hits.length >= 1) return true;
    }
    return false;
  };

  for (const p of products) {
    const retail = Number(p.retail_price);
    const cost = Number(p.vendor_cost);
    if (p.category === 'slab') {
      const backed = slabBacked(p);
      if (backed === true) summary.slabBacked++;
      else if (backed === false) { summary.slabUnbacked++; flags.push({ type: 'SLAB_NO_VENDOR_MATCH', id: p.id, vendor: p.vendor_id, name: p.name }); }
      continue;
    }
    // fixtures/products: backing via portal inventory or shopify import
    const viRow = p.sku ? (invBySku.get(`${p.vendor_id}|${String(p.sku).toUpperCase()}`)
      || invBySku.get(`${String(p.vendor_id).replace(/-.*/, '')}|${String(p.sku).toUpperCase()}`)) : null;
    const shopifyBacked = p.specs?._source === 'shopify-products-json';
    if (viRow || shopifyBacked) {
      summary.fixtureBacked++;
      if (viRow && typeof viRow.inStock === 'boolean' && p.in_stock !== viRow.inStock) {
        summary.stockMismatch++;
        flags.push({ type: 'STOCK_MISMATCH', id: p.id, vendor: p.vendor_id, sku: p.sku, site: p.in_stock, vendorStock: viRow.inStock, name: p.name.slice(0, 60) });
      }
      if (viRow && viRow.dealerCost > 0 && retail > 0 && retail < viRow.dealerCost) {
        summary.priceSuspect++;
        flags.push({ type: 'RETAIL_BELOW_DEALER_COST', id: p.id, vendor: p.vendor_id, sku: p.sku, retail, dealerCost: viRow.dealerCost, name: p.name.slice(0, 60) });
      }
    } else {
      summary.fixtureUnbacked++;
      flags.push({ type: 'FIXTURE_NO_VENDOR_BACKING', id: p.id, vendor: p.vendor_id, sku: p.sku, retail, name: p.name.slice(0, 60) });
    }
    if (retail <= 0 || (cost > 0 && retail > 0 && retail > cost * 25)) {
      summary.priceSuspect++;
      flags.push({ type: 'PRICE_NONSENSE', id: p.id, vendor: p.vendor_id, sku: p.sku, retail, cost, name: p.name.slice(0, 60) });
    }
  }

  const byType = {};
  const byVendorUnbacked = {};
  for (const f of flags) {
    byType[f.type] = (byType[f.type] || 0) + 1;
    if (f.type.includes('NO_VENDOR')) byVendorUnbacked[f.vendor] = (byVendorUnbacked[f.vendor] || 0) + 1;
  }
  console.log(JSON.stringify({ summary, byType, byVendorUnbacked }, null, 2));
  const out = '/private/tmp/claude-501/-Users-homepc-surprise-granite-site/2bd048cb-bc66-4413-981e-d49856c89864/scratchpad/site-vendor-audit.json';
  fs.writeFileSync(out, JSON.stringify(flags, null, 1));
  console.log('full flag list:', out, `(${flags.length} flags)`);
  process.exit(0);
})().catch((e) => { console.error('FATAL', e); process.exit(1); });
