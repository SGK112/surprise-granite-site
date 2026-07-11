#!/usr/bin/env node
/**
 * The drop-ship master: ONE sellable list of every online product (sinks,
 * faucets, bathroom fixtures, kitchen accessories) that is active AND priced.
 *
 * Output: data/shop.json — customer-safe (retail price only, NEVER vendor_cost),
 * so it can be served publicly and feed any surface (search, swipe, a shop grid)
 * from one source instead of the four stale category files.
 *
 * "Ship class" = the vendor. Freight is charged PER VENDOR at checkout (each
 * vendor drop-ships separately; api/validators/price-validator.js buckets the
 * cart by vendor and applies a subtotal tier: $15 <$100, $25 <$500, free >$500).
 * So an item's shipping depends on how much of its vendor is in the cart — the
 * vendor is the grouping, which is what we carry here.
 *
 * NEVER writes vendor_cost/margin — that is internal (owner rule, same as the
 * slab master). Run after each vendor sync.
 *
 * Usage: NODE_PATH=api/node_modules node scripts/build-shop-master.js [--write]
 */
const path = require('path');
const fs = require('fs');
require('dotenv').config({ path: path.join(__dirname, '..', 'api', '.env') });
const { createClient } = require('@supabase/supabase-js');

const supa = createClient('https://ypeypgwsycxcagncgdur.supabase.co', process.env.SUPABASE_SERVICE_KEY);
const OUT = path.join(__dirname, '..', 'data', 'shop.json');

// category -> clean-URL dir (matches gen-marketplace-pages.js).
const DIR = { sink: 'sinks', faucet: 'faucets', fixture: 'bathroom', accessory: 'kitchen-accessories' };

// The same product line arrives under several brand spellings (VIGO/Vigo,
// KIBI/Kibi/Kibi USA, "ALFI brand", "Ruvati Sinks"). Normalize so the master
// (and any vendor facet) reads clean.
function normBrand(brand, vendorId) {
  const s = String(brand || '').trim();
  const low = s.toLowerCase();
  if (/\bvigo\b/.test(low)) return 'Vigo';
  if (/\bkibi\b/.test(low)) return 'Kibi';
  if (/\balfi\b/.test(low)) return 'ALFI';
  if (/\bruvati\b/.test(low)) return 'Ruvati';
  if (/\bwhitehaus\b/.test(low)) return 'Whitehaus';
  if (/\bmsi\b/.test(low)) return 'MSI';
  return s || vendorId || '';
}

(async () => {
  const write = process.argv.includes('--write');
  let rows = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supa.from('catalog_products')
      .select('slug, sku, name, category, subcategory, brand, vendor_id, retail_price, price_unit, currency, in_stock, stock_quantity, lead_time_days, primary_image_url, image_urls, short_description')
      .in('category', ['sink', 'faucet', 'fixture', 'accessory'])
      .eq('active', true).gt('retail_price', 0).order('category').order('name').range(from, from + 999);
    if (error) throw error;
    rows = rows.concat(data);
    if (data.length < 1000) break;
  }

  const items = rows.map((r) => {
    const image = r.primary_image_url || (Array.isArray(r.image_urls) && r.image_urls[0]) || '';
    const dir = DIR[r.category] || r.category + 's';
    return {
      id: r.slug,
      sku: r.sku || null,
      name: r.name,
      category: r.category,
      subcategory: r.subcategory || null,
      brand: normBrand(r.brand, r.vendor_id),
      vendorId: r.vendor_id || null,     // the ship class (per-vendor freight bucket)
      price: Number(r.retail_price),
      priceUnit: r.price_unit || 'each',
      currency: r.currency || 'USD',
      inStock: r.in_stock !== false,
      leadTimeDays: r.lead_time_days || null,
      image,
      url: `/marketplace/${dir}/${encodeURIComponent(r.slug)}/`,
    };
  });

  const counts = { total: items.length };
  const byCat = {}; const byVendor = {};
  for (const it of items) {
    byCat[it.category] = (byCat[it.category] || 0) + 1;
    byVendor[it.brand] = (byVendor[it.brand] || 0) + 1;
  }

  console.log('=== drop-ship master (data/shop.json) ===');
  console.log('sellable items:', items.length);
  console.log('by category:', JSON.stringify(byCat));
  console.log('by vendor (ship class):');
  Object.entries(byVendor).sort((a, b) => b[1] - a[1]).forEach(([k, c]) => console.log('   ' + String(c).padStart(5), k));
  console.log('with image:', items.filter((i) => i.image).length);
  console.log('missing image:', items.filter((i) => !i.image).length);

  if (!write) { console.log('\nDRY RUN — add --write'); process.exit(0); }

  const payload = {
    generatedAt: new Date().toISOString(),
    counts: { total: items.length, byCategory: byCat },
    shippingModel: 'per-vendor freight: $15 <$100, $25 <$500, free >$500 (each vendor ships separately)',
    items,
  };
  fs.writeFileSync(OUT, JSON.stringify(payload, null, 1));
  console.log('\nwrote', OUT, `(${items.length} items)`);
  process.exit(0);
})().catch((e) => { console.error('FATAL', e.message); process.exit(1); });
