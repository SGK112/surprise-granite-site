#!/usr/bin/env node
/**
 * Import a Shopify-based vendor's PUBLIC catalog (products.json) into
 * catalog_products: title, SKU, MSRP (their listed price), full image set,
 * description — listed at MSRP, with dealer cost joined from the portal sync
 * (vendorinventories) by SKU so the master price list shows cost AND retail.
 * Additive/enrich only — never deactivates.
 *
 * Vendors: vigo (vigoindustries.com), kibi (kibiusa.com)
 * Usage: NODE_PATH=api/node_modules node scripts/import-shopify-vendor-catalog.js [--write] [vendor ...]
 */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', 'api', '.env') });
require('dotenv').config({ path: '/Users/homepc/voiceNow-crm/.env' });
const { createClient } = require('@supabase/supabase-js');
const { MongoClient } = require('mongodb');

const supa = createClient('https://ypeypgwsycxcagncgdur.supabase.co', process.env.SUPABASE_SERVICE_KEY);
const WRITE = process.argv.includes('--write');
const ONLY = process.argv.slice(2).filter((a) => a !== '--write');

const VENDORS = {
  vigo: { base: 'https://www.vigoindustries.com', brand: 'VIGO', viVendor: 'vigo' },
  kibi: { base: 'https://kibiusa.com', brand: 'Kibi USA', viVendor: 'kibi' },
};
const CATEGORY = (type, title) => {
  const t = `${type} ${title}`.toLowerCase();
  if (/sink/.test(t)) return 'sink';
  if (/faucet|sprayer|spout/.test(t)) return 'faucet';
  if (/shower|tub|bathtub|drain|grid|strainer|soap|accessor|holder|stopper/.test(t)) return 'accessory';
  return 'fixture';
};
const stripHtml = (h) => String(h || '').replace(/<style[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/&[a-z#0-9]+;/gi, ' ').replace(/\s+/g, ' ').trim();

(async () => {
  const mongo = new MongoClient(process.env.MONGODB_URI); await mongo.connect();
  const vi = await mongo.db('voiceflow-crm').collection('vendorinventories')
    .find({ dealerCost: { $gt: 0 } }, { projection: { vendor: 1, sku: 1, dealerCost: 1, inStock: 1 } }).toArray();
  await mongo.close();
  const costBySku = new Map();
  for (const r of vi) costBySku.set(`${r.vendor}|${String(r.sku).toUpperCase()}`, r);

  let existing = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supa.from('catalog_products').select('id,vendor_id,sku,slug,primary_image_url,description,retail_price,vendor_cost,specs').order('id').range(from, from + 999);
    if (error) throw error;
    existing = existing.concat(data || []);
    if (data.length < 1000) break;
  }
  const bySku = new Map(existing.filter((p) => p.sku).map((p) => [`${p.vendor_id}|${String(p.sku).toUpperCase()}`, p]));
  const slugTaken = new Set(existing.map((p) => p.slug).filter(Boolean));

  for (const [vendorId, cfg] of Object.entries(VENDORS)) {
    if (ONLY.length && !ONLY.includes(vendorId)) continue;
    let page = 1, created = 0, enriched = 0, costJoined = 0, total = 0;
    for (;;) {
      const res = await fetch(`${cfg.base}/products.json?limit=250&page=${page}`, { headers: { 'User-Agent': 'Mozilla/5.0' }, signal: AbortSignal.timeout(30000) });
      if (!res.ok) break;
      const products = (await res.json()).products || [];
      if (!products.length) break;
      total += products.length;
      for (const p of products) {
        const v = (p.variants || [])[0] || {};
        const sku = String(v.sku || '').toUpperCase();
        if (!sku) continue;
        const msrp = Number(v.price) || null;
        const imgs = (p.images || []).map((i) => i.src).slice(0, 6);
        const inv = costBySku.get(`${cfg.viVendor}|${sku}`);
        if (inv) costJoined++;
        const key = `${vendorId}|${sku}`;
        const desc = stripHtml(p.body_html).slice(0, 600);
        const cur = bySku.get(key);
        if (cur) {
          const fields = { updated_at: new Date().toISOString() };
          if (msrp > 0) fields.retail_price = msrp;
          if (inv?.dealerCost > 0) fields.vendor_cost = inv.dealerCost;
          if ((!cur.description || cur.description.length < 40) && desc.length >= 40) fields.description = desc;
          if (imgs.length && (!cur.primary_image_url || /squarespace|cdn\.shopify\.com\/s\/files\/1\/0555/.test(cur.primary_image_url))) { fields.primary_image_url = imgs[0]; fields.image_urls = imgs; }
          if (msrp > 0 && inv?.dealerCost > 0) fields.specs = { ...(cur.specs || {}), msrp, margin_pct: Math.round((msrp - inv.dealerCost) / msrp * 1000) / 10 };
          if (Object.keys(fields).length > 1) { if (WRITE) await supa.from('catalog_products').update(fields).eq('id', cur.id); enriched++; }
        } else {
          let slug = (p.handle || sku.toLowerCase()) + '-' + vendorId;
          if (slugTaken.has(slug)) slug = slug + '-' + sku.toLowerCase();
          if (slugTaken.has(slug)) continue;
          slugTaken.add(slug);
          const row = {
            vendor_id: vendorId, brand: cfg.brand, sku, name: p.title.slice(0, 180), slug,
            category: CATEGORY(p.product_type, p.title), subcategory: p.product_type || null,
            description: desc, primary_image_url: imgs[0] || null, image_urls: imgs,
            retail_price: msrp, price_unit: 'each', vendor_cost: inv?.dealerCost || null,
            sample_eligible: false, in_stock: inv ? inv.inStock !== false : true, active: true,
            vendor_url: `${cfg.base}/products/${p.handle}`, tags: ['vendor-import'], currency: 'USD',
            specs: { _source: 'shopify-products-json', imported_at: '2026-07-05', ...(msrp && inv?.dealerCost ? { msrp, margin_pct: Math.round((msrp - inv.dealerCost) / msrp * 1000) / 10 } : {}) },
          };
          if (WRITE) { const { error } = await supa.from('catalog_products').insert(row); if (error) continue; }
          created++;
        }
      }
      if (products.length < 250) break;
      page++;
      await new Promise((r) => setTimeout(r, 400));
    }
    console.log(`== ${vendorId}: site products=${total} created=${created} enriched=${enriched} dealer-cost joined=${costJoined}`);
  }
  console.log(WRITE ? 'WROTE.' : 'DRY RUN — add --write.');
  process.exit(0);
})().catch((e) => { console.error('FATAL', e); process.exit(1); });
