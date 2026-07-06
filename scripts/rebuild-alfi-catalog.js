#!/usr/bin/env node
/**
 * Rebuild the Alfi Trade marketplace catalog from the alfitrade.com crawl
 * (scratch alfi-products.json — 1,284 products, 100% MSRP-priced, live stock
 * badges). Owner directive 2026-07-04: "all of their products listed in the
 * marketplace at msrp"; 2026-07-06: "update the store with accurate products,
 * variants, and pricing".
 *
 *  - match existing alfi-trade rows by SKU → correct price to MSRP, stock,
 *    image, url
 *  - create missing products at MSRP
 *  - deactivate rows whose SKU is Discontinued on their site OR absent from
 *    the full crawl (they don't sell it anymore — "products that don't exist")
 *
 * Usage: NODE_PATH=api/node_modules node scripts/rebuild-alfi-catalog.js [--write]
 */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', 'api', '.env') });
const fs = require('fs');
const { createClient } = require('@supabase/supabase-js');

const supa = createClient('https://ypeypgwsycxcagncgdur.supabase.co', process.env.SUPABASE_SERVICE_KEY);
const WRITE = process.argv.includes('--write');
const CRAWL = '/private/tmp/claude-501/-Users-homepc-surprise-granite-site/2bd048cb-bc66-4413-981e-d49856c89864/scratchpad/alfi-products.json';

const CATEGORY = (name) => {
  const t = String(name).toLowerCase();
  if (/\btub\b|bathtub/.test(t)) return 'fixture';
  if (/sink/.test(t)) return 'sink';
  if (/faucet|sprayer|spout|filler/.test(t)) return 'faucet';
  if (/shower|drain|grid|strainer|soap|holder|stopper|towel|accessor/.test(t)) return 'accessory';
  return 'fixture';
};

(async () => {
  const crawl = JSON.parse(fs.readFileSync(CRAWL, 'utf8'));
  const bySku = new Map();
  for (const p of crawl) if (p.sku) bySku.set(String(p.sku).toUpperCase(), p);

  let existing = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supa.from('catalog_products')
      .select('id,sku,name,slug,retail_price,in_stock,active,primary_image_url,specs')
      .eq('vendor_id', 'alfi-trade').order('id').range(from, from + 999);
    if (error) throw error;
    existing = existing.concat(data || []);
    if (data.length < 1000) break;
  }
  const existingBySku = new Map(existing.filter((p) => p.sku).map((p) => [String(p.sku).toUpperCase(), p]));

  const { data: slugRows } = await supa.from('catalog_products').select('slug');
  const slugTaken = new Set((slugRows || []).map((r) => r.slug));

  const report = { crawl: crawl.length, existing: existing.length, updated: 0, created: 0, deactivated: 0, discontinued: 0 };
  const updates = [];
  const creates = [];
  const deactivates = [];

  for (const [sku, p] of bySku) {
    const active = p.stockStatus !== 'Discontinued';
    const cur = existingBySku.get(sku);
    const fields = {
      name: String(p.name).slice(0, 180),
      retail_price: p.price,
      in_stock: p.inStock === true,
      active,
      primary_image_url: p.image || null,
      vendor_url: p.url,
      specs: { ...(cur?.specs || {}), msrp: p.price, alfi_stock: p.stockStatus, _source: 'alfitrade-crawl', crawled_at: '2026-07-06' },
      updated_at: new Date().toISOString(),
    };
    if (cur) { updates.push({ id: cur.id, fields }); report.updated++; if (!active) report.discontinued++; }
    else if (active) {
      let slug = 'alfi-' + String(p.name).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 70);
      if (slugTaken.has(slug)) slug = slug + '-' + sku.toLowerCase();
      if (slugTaken.has(slug)) continue;
      slugTaken.add(slug);
      creates.push({
        vendor_id: 'alfi-trade', brand: /whitehaus/i.test(p.name) ? 'Whitehaus' : 'ALFI brand', sku,
        name: fields.name, slug, category: CATEGORY(p.name), description: '',
        primary_image_url: p.image || null, image_urls: p.image ? [p.image] : [],
        retail_price: p.price, price_unit: 'each', sample_eligible: false,
        in_stock: p.inStock === true, active: true, vendor_url: p.url,
        tags: ['vendor-import'], currency: 'USD',
        specs: { msrp: p.price, alfi_stock: p.stockStatus, _source: 'alfitrade-crawl', crawled_at: '2026-07-06' },
      });
      report.created++;
    }
  }
  for (const [sku, cur] of existingBySku) {
    if (!bySku.has(sku) && cur.active) { deactivates.push(cur.id); report.deactivated++; }
  }

  console.log(JSON.stringify(report, null, 2));
  console.log('examples update:', updates.slice(0, 3).map((u) => `${u.fields.name.slice(0, 40)} -> $${u.fields.retail_price} ${u.fields.specs.alfi_stock}`).join(' | '));
  console.log('examples create:', creates.slice(0, 3).map((c) => `${c.name.slice(0, 40)} $${c.retail_price}`).join(' | '));
  if (!WRITE) { console.log('DRY RUN — add --write'); process.exit(0); }

  let ok = 0, fail = 0, i = 0;
  await Promise.all(Array.from({ length: 8 }, async () => {
    while (i < updates.length) {
      const u = updates[i++];
      const { error } = await supa.from('catalog_products').update(u.fields).eq('id', u.id);
      if (error) fail++; else ok++;
    }
  }));
  let created = 0;
  for (let j = 0; j < creates.length; j += 50) {
    const { error } = await supa.from('catalog_products').insert(creates.slice(j, j + 50));
    if (error) { console.error('insert batch error:', error.message); }
    else created += Math.min(50, creates.length - j);
  }
  if (deactivates.length) {
    const { error } = await supa.from('catalog_products').update({ active: false, updated_at: new Date().toISOString() }).in('id', deactivates);
    if (error) console.error('deactivate error:', error.message);
  }
  console.log(`WROTE: ${ok} updated (${fail} failed), ${created} created, ${deactivates.length} deactivated`);
  process.exit(0);
})().catch((e) => { console.error('FATAL', e); process.exit(1); });
