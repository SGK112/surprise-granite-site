// Auto-pricing sync service
// -----------------------------------------------------------------------------
// Pulls LIVE vendor pricing from the VoiceNow CRM Mongo and writes retail/cost/
// inventory into the marketplace catalog (Supabase catalog_products), so the
// online store prices itself instead of someone doing it by hand in a terminal.
//
// Sources (order of trust):
//   1. VendorInventory  (browser-agent dealer-portal pulls) matched by SKU
//        -> dealerCost, availableQty, (shopifyPrice as last-resort retail)
//   2. LineItemLibrary  (emailed vendor price sheets) matched by VENDOR + exact
//        NAME  -> cost.  Vendor-scoping avoids cross-vendor name collisions
//        (e.g. a slab "Calacatta Gold" mispricing a tile of the same name).
//
// Pricing rule (approved, derived from the already-priced catalog):
//   retail = cost * 1.30   (tile: * 1.50)      [override via env]
//
// Safety: mode 'fill' (default) only prices items with no retail_price yet and
// never overwrites an existing price. mode 'refresh' re-prices everything a
// source can cover. dryRun returns the plan without writing.
//
// Requires env MONGODB_URI (VoiceNow CRM Atlas). Supabase service client passed in.
// -----------------------------------------------------------------------------
const { MongoClient } = require('mongodb');

const MARKUP_STD = Number(process.env.CATALOG_MARKUP_STD || 1.30);
const MARKUP_TILE = Number(process.env.CATALOG_MARKUP_TILE || 1.50);
const MONGO_DB = process.env.VENDOR_MONGO_DB || 'voiceflow-crm';

const norm = (s) => String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
const round2 = (n) => Math.round(n * 100) / 100;
const markupFor = (category) => (/tile/i.test(category || '') ? MARKUP_TILE : MARKUP_STD);

// SKU-shaped tokens: >=5 chars, alphanumeric, containing BOTH a letter and a
// digit (e.g. RVB6719WH, RVG1388BK). Plain words ("MIDNIGHT"), short color/size
// codes ("3X9", "DM07"), and decimals ("853.03") are excluded — this keeps the
// token fallback from mis-matching tile/flooring, which have no real SKUs.
const skuTokens = (s) => (String(s || '').toUpperCase().match(/\b[A-Z0-9]{5,}\b/g) || [])
  .filter((t) => /[A-Z]/.test(t) && /[0-9]/.test(t));
// The token that identifies a product: its own sku field wins; otherwise the
// LAST SKU-shaped token in its name (catalog names end with the real SKU, so a
// SKU mentioned mid-name for a *different* product — "Rinse Grid for RVG1533" —
// is never chosen).
const productToken = (p) => {
  const st = skuTokens(p.sku);
  if (st.length) return st[st.length - 1];
  const nt = skuTokens(p.name);
  return nt.length ? nt[nt.length - 1] : null;
};

async function loadSources() {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error('MONGODB_URI not set (VoiceNow CRM Mongo is required for pricing sync)');
  const client = new MongoClient(uri, { serverSelectionTimeoutMS: 15000 });
  await client.connect();
  try {
    const db = client.db(MONGO_DB);
    const vi = await db.collection('vendorinventories')
      .find({}, { projection: { _id: 0, sku: 1, dealerCost: 1, shopifyPrice: 1, availableQty: 1 } }).toArray();
    const lil = await db.collection('lineitemlibraries')
      .find({}, { projection: { _id: 0, name: 1, cost: 1, vendor: 1 } }).toArray();
    return { vi, lil };
  } finally {
    await client.close();
  }
}

// small concurrency pool so a few-thousand updates finish in seconds, not minutes
async function runPool(items, worker, concurrency = 12) {
  let i = 0, done = 0;
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (i < items.length) {
      const idx = i++;
      try { await worker(items[idx]); done++; } catch (_) { /* counted by caller */ }
    }
  }));
  return done;
}

async function syncPricing(supabase, { mode = 'fill', dryRun = false, limit = 0 } = {}) {
  if (!supabase) throw new Error('supabase client required');
  const { vi, lil } = await loadSources();

  const viBySku = new Map();
  for (const r of vi) {
    const k = norm(r.sku);
    if (k && Number(r.dealerCost) > 0) viBySku.set(k, r);
  }
  const lilByVendorName = new Map();
  for (const r of lil) {
    if (Number(r.cost) > 0) lilByVendorName.set(norm(r.vendor) + '|' + norm(r.name), Number(r.cost));
  }
  // SKU-token indexes for the fallback path (catalog rows whose sku field is an
  // internal slug like "ruvati-5763" but whose name ends with the real SKU).
  const viByTok = new Map();
  for (const r of vi) {
    if (!(Number(r.dealerCost) > 0)) continue;
    for (const t of skuTokens(r.sku)) if (!viByTok.has(t)) viByTok.set(t, r);
  }
  const lilByVendorTok = new Map(); // vendorNorm|token -> cost (vendor-scoped)
  for (const r of lil) {
    if (!(Number(r.cost) > 0)) continue;
    const vk = norm(r.vendor) + '|';
    for (const t of skuTokens(r.name)) { const k = vk + t; if (!lilByVendorTok.has(k)) lilByVendorTok.set(k, Number(r.cost)); }
  }

  // load the whole catalog (paginate past the 1000-row cap)
  let products = [];
  const PAGE = 1000;
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from('catalog_products')
      .select('id,name,sku,category,vendor_id,retail_price')
      .order('id')
      .range(from, from + PAGE - 1);
    if (error) throw new Error('catalog read failed: ' + error.message);
    products = products.concat(data || []);
    if (!data || data.length < PAGE) break;
  }

  const report = {
    catalogTotal: products.length,
    sourcesLoaded: { vendorInventory: viBySku.size, emailSheetNames: lilByVendorName.size },
    fromVendorInventory: 0, fromEmailSheet: 0,
    skippedAlreadyPriced: 0, skippedNoSource: 0,
  };
  const patches = [];
  for (const p of products) {
    if (mode === 'fill' && Number(p.retail_price) > 0) { report.skippedAlreadyPriced++; continue; }
    let cost = null, retail = null, qty = null, source = null;
    const viRow = viBySku.get(norm(p.sku));
    if (viRow) {
      cost = Number(viRow.dealerCost) || null;
      qty = (viRow.availableQty != null) ? Number(viRow.availableQty) : null;
      retail = cost > 0 ? round2(cost * markupFor(p.category))
        : (Number(viRow.shopifyPrice) > 0 ? Number(viRow.shopifyPrice) : null);
      source = 'vendor_inventory';
    } else {
      const c = lilByVendorName.get(norm(p.vendor_id) + '|' + norm(p.name));
      if (Number(c) > 0) { cost = Number(c); retail = round2(cost * markupFor(p.category)); source = 'email_sheet'; }
    }
    // Fallback: match by SKU token when neither exact path hit (recovers rows
    // whose stored sku is an internal slug). VendorInventory first, then the
    // vendor-scoped email sheet.
    if (!(retail > 0)) {
      const tok = productToken(p);
      if (tok) {
        const viTok = viByTok.get(tok);
        if (viTok && Number(viTok.dealerCost) > 0) {
          cost = Number(viTok.dealerCost);
          qty = (viTok.availableQty != null) ? Number(viTok.availableQty) : null;
          retail = round2(cost * markupFor(p.category));
          source = 'vendor_inventory';
        } else {
          const c = lilByVendorTok.get(norm(p.vendor_id) + '|' + tok);
          if (Number(c) > 0) { cost = Number(c); retail = round2(cost * markupFor(p.category)); source = 'email_sheet'; }
        }
      }
    }
    if (!(retail > 0)) { report.skippedNoSource++; continue; }
    const fields = { retail_price: retail, updated_at: new Date().toISOString() };
    if (cost > 0) fields.vendor_cost = cost;
    if (qty != null) { fields.stock_quantity = qty; fields.in_stock = qty > 0; }
    patches.push({ id: p.id, fields });
    if (source === 'vendor_inventory') report.fromVendorInventory++; else report.fromEmailSheet++;
    if (limit && patches.length >= limit) break;
  }

  report.matched = patches.length;
  report.sample = patches.slice(0, 5).map((x) => ({ id: x.id, retail: x.fields.retail_price, cost: x.fields.vendor_cost }));

  if (!dryRun && patches.length) {
    let failed = 0;
    const ok = await runPool(patches, async (u) => {
      const { error } = await supabase.from('catalog_products').update(u.fields).eq('id', u.id);
      if (error) { failed++; throw error; }
    });
    report.updated = ok;
    report.failed = failed;
  } else {
    report.updated = 0;
  }
  return { mode, dryRun, ...report };
}

module.exports = { syncPricing };
