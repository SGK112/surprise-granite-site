#!/usr/bin/env node
/**
 * List Cactus Stone & Tile's slab catalog on the site — 426 colors scraped
 * from cactusstone.com with XL slab images, material, sizes, and per-lot
 * PDFs. Owner rule: "if the vendor has the color, we have the color" —
 * ALL colors listed; the ones matching the CS FAB price book get real
 * sample-price = $/sqft, the rest keep the default sample price until the
 * book match improves.
 *
 * Usage: NODE_PATH=api/node_modules node scripts/import-cactus-colors.js [--write]
 */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', 'api', '.env') });
const fs = require('fs');
const { createClient } = require('@supabase/supabase-js');
const { MongoClient } = require('mongodb');

const supa = createClient('https://ypeypgwsycxcagncgdur.supabase.co', process.env.SUPABASE_SERVICE_KEY);
const WRITE = process.argv.includes('--write');
const CRAWL = '/private/tmp/claude-501/-Users-homepc-surprise-granite-site/2bd048cb-bc66-4413-981e-d49856c89864/scratchpad/cactus-products.json';
const MONGO = fs.readFileSync('/Users/homepc/voiceNow-crm/.env', 'utf8').match(/^MONGODB_URI=(.+)$/m)[1].trim();

const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
const baseName = (s) => String(s || '')
  .replace(/\([^)]*\)/g, ' ')
  .replace(/\b\d+(?:\.\d+)?\s*cm\b/gi, ' ')
  .replace(/\b(polished|honed|leathered|leather|brushed|matte|satin|slabs?)\b/gi, ' ')
  .replace(/\b(quartzite|quartz|granite|marble|porcelain|dolomite|onyx|limestone|travertine|slate)\b/gi, ' ')
  .trim();

(async () => {
  const colors = JSON.parse(fs.readFileSync(CRAWL, 'utf8'));
  const mongo = new MongoClient(MONGO); await mongo.connect();
  const lil = await mongo.db('voiceflow-crm').collection('lineitemlibraries')
    .find({ vendor: 'Cactus Stone & Tile', unit: 'sqft', cost: { $gt: 0 } }, { projection: { name: 1, cost: 1 } }).toArray();
  await mongo.close();
  const priceByBase = new Map();
  for (const r of lil) {
    const b = norm(baseName(r.name));
    if (b.length < 4) continue;
    if (!priceByBase.has(b) || r.cost < priceByBase.get(b)) priceByBase.set(b, Number(r.cost));
  }

  let existing = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supa.from('catalog_products').select('id,sku,slug').order('id').range(from, from + 999);
    if (error) throw error;
    existing = existing.concat(data || []);
    if (data.length < 1000) break;
  }
  const skus = new Set(existing.map((p) => p.sku).filter(Boolean));
  const slugs = new Set(existing.map((p) => p.slug).filter(Boolean));

  const report = { colors: colors.length, created: 0, skippedExisting: 0, priced: 0, noImage: 0 };
  const creates = [];
  for (const c of colors) {
    if (!c.image) { report.noImage++; continue; }
    const sku = `import-cactus-stone-${norm(c.name)}`.slice(0, 60);
    if (skus.has(sku)) { report.skippedExisting++; continue; }
    let slug = `${norm(baseName(c.name)) || norm(c.name)}-${norm(c.material)}-cactus`.replace(/^-/, 'stone-');
    if (slugs.has(slug)) slug = slug + '-2';
    if (slugs.has(slug)) continue;
    slugs.add(slug); skus.add(sku);
    const sqft = priceByBase.get(norm(baseName(c.name))) || null;
    if (sqft) report.priced++;
    const sizes = (c.lots || []).map((l) => l.sizes).filter(Boolean).join('; ');
    creates.push({
      vendor_id: 'cactus-stone', brand: 'Cactus Stone & Tile', sku,
      name: c.name, slug, category: 'slab', subcategory: c.material || null,
      description: `${c.name} ${c.material ? c.material.toLowerCase() : 'stone'} slab from Cactus Stone & Tile, Phoenix.${sizes ? ` Available: ${sizes}.` : ''}`,
      primary_image_url: c.image, image_urls: [c.image, ...(c.lots || []).map((l) => l.image).filter((u) => u && u !== c.image)].slice(0, 5),
      retail_price: sqft || 12.99, sample_price: sqft || 12.99, vendor_cost: sqft,
      price_unit: 'each', sample_eligible: true, in_stock: true, active: true,
      vendor_url: c.url || 'https://www.cactusstone.com/stone.html',
      tags: ['vendor-import'], currency: 'USD',
      specs: {
        _source: 'cactusstone-scrape', imported_at: '2026-07-06', material: c.material || null,
        ...(sqft ? { sample_pricing: 'sqft-price', sqft_price: sqft } : {}),
        lots: (c.lots || []).map((l) => l.lot).filter(Boolean).slice(0, 6),
      },
    });
    report.created++;
  }
  console.log(JSON.stringify(report, null, 2));
  console.log('examples:', creates.slice(0, 5).map((c) => `${c.name} [${c.subcategory}] $${c.retail_price}${c.vendor_cost ? ' (book)' : ' (default)'}`).join(' | '));
  if (!WRITE) { console.log('DRY RUN — add --write'); process.exit(0); }
  let created = 0;
  for (let j = 0; j < creates.length; j += 50) {
    const { error } = await supa.from('catalog_products').insert(creates.slice(j, j + 50));
    if (error) console.error('batch error:', error.message);
    else created += Math.min(50, creates.length - j);
  }
  console.log('CREATED', created);
  process.exit(0);
})().catch((e) => { console.error('FATAL', e); process.exit(1); });
