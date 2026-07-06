#!/usr/bin/env node
/**
 * List Daltile's slab lines on the site — 187 colors scraped from
 * daltile.com (ONE Quartz, Panoramic Porcelain, Natural Stone slab,
 * Purevana) with full-res Scene7 images. Prices auto-attach from the
 * Daltile rows in the master library where names match.
 *
 * Usage: NODE_PATH=api/node_modules node scripts/import-daltile-colors.js [--write]
 */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', 'api', '.env') });
const fs = require('fs');
const { createClient } = require('@supabase/supabase-js');
const { MongoClient } = require('mongodb');

const supa = createClient('https://ypeypgwsycxcagncgdur.supabase.co', process.env.SUPABASE_SERVICE_KEY);
const WRITE = process.argv.includes('--write');
const CRAWL = '/private/tmp/claude-501/-Users-homepc-surprise-granite-site/2bd048cb-bc66-4413-981e-d49856c89864/scratchpad/daltile-slabs.json';
const MONGO = fs.readFileSync('/Users/homepc/voiceNow-crm/.env', 'utf8').match(/^MONGODB_URI=(.+)$/m)[1].trim();

const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
const baseName = (s) => String(s || '')
  .replace(/\([^)]*\)/g, ' ')
  .replace(/\b\d+(?:\.\d+)?\s*cm\b/gi, ' ')
  .replace(/\b(polished|honed|leathered|leather|brushed|matte|satin|velvet|slabs?)\b/gi, ' ')
  .replace(/\b(quartzite|quartz|granite|marble|porcelain|soapstone|one|panoramic|purevana)\b/gi, ' ')
  .trim();

(async () => {
  const colors = JSON.parse(fs.readFileSync(CRAWL, 'utf8'));
  const mongo = new MongoClient(MONGO); await mongo.connect();
  const lil = await mongo.db('voiceflow-crm').collection('lineitemlibraries')
    .find({ vendor: 'Daltile', unit: 'sqft', cost: { $gt: 0 } }, { projection: { name: 1, cost: 1 } }).toArray();
  await mongo.close();
  const priceByBase = new Map();
  for (const r of lil) {
    const b = norm(baseName(r.name));
    if (b.length < 4) continue;
    if (!priceByBase.has(b) || r.cost < priceByBase.get(b)) priceByBase.set(b, Number(r.cost));
  }

  await supa.from('vendor_config').upsert({
    vendor_id: 'daltile', vendor_name: 'Daltile', vendor_url: 'https://www.daltile.com',
    sample_offered: true, sample_price: 12.99,
    notes: 'Slab lines: ONE Quartz, Panoramic Porcelain, Natural Stone, Purevana. Rep: Vanessa Burch vanessa.burch@daltile.com. Colors scraped 2026-07-06.',
  }, { onConflict: 'vendor_id' });

  let existing = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supa.from('catalog_products').select('id,sku,slug,vendor_id,name').order('id').range(from, from + 999);
    if (error) throw error;
    existing = existing.concat(data || []);
    if (data.length < 1000) break;
  }
  const skus = new Set(existing.map((p) => p.sku).filter(Boolean));
  const slugs = new Set(existing.map((p) => p.slug).filter(Boolean));
  const daltileNames = new Set(existing.filter((p) => p.vendor_id === 'daltile').map((p) => norm(p.name)));

  const materialOf = (line) => {
    const l = String(line).toLowerCase();
    if (l.includes('quartzite')) return 'Quartzite';
    if (l.includes('granite')) return 'Granite';
    if (l.includes('marble') && l.includes('natural')) return 'Marble';
    if (l.includes('soapstone')) return 'Soapstone';
    if (l.includes('porcelain')) return 'Porcelain';
    if (l.includes('purevana')) return 'Mineral Surface';
    return 'Quartz';
  };

  const report = { colors: colors.length, created: 0, skipped: 0, priced: 0 };
  const creates = [];
  for (const c of colors) {
    if (!c.image) { report.skipped++; continue; }
    if (daltileNames.has(norm(c.name))) { report.skipped++; continue; }
    const sku = `import-daltile-${norm(c.name)}`.slice(0, 60);
    if (skus.has(sku)) { report.skipped++; continue; }
    let slug = `${norm(baseName(c.name)) || norm(c.name)}-daltile`;
    if (slugs.has(slug)) slug = slug + '-' + norm(materialOf(c.line));
    if (slugs.has(slug)) continue;
    slugs.add(slug); skus.add(sku);
    const sqft = priceByBase.get(norm(baseName(c.name))) || null;
    if (sqft) report.priced++;
    creates.push({
      vendor_id: 'daltile', brand: 'Daltile', sku,
      name: c.name, slug, category: 'slab', subcategory: c.line || materialOf(c.line),
      description: `${c.name} — ${c.line || 'Daltile slab'}.${c.finish ? ` ${c.finish} finish.` : ''} Full slab material from Daltile.`,
      primary_image_url: c.image, image_urls: [c.image],
      retail_price: sqft || 12.99, sample_price: sqft || 12.99, vendor_cost: sqft,
      price_unit: 'each', sample_eligible: true, in_stock: true, active: true,
      vendor_url: c.url, tags: ['vendor-import'], currency: 'USD',
      specs: {
        _source: 'daltile-scrape', imported_at: '2026-07-06', material: materialOf(c.line), line: c.line,
        ...(sqft ? { sample_pricing: 'sqft-price', sqft_price: sqft } : {}),
        ...(c.finish ? { finish: c.finish } : {}),
      },
    });
    report.created++;
  }
  console.log(JSON.stringify(report, null, 2));
  console.log('examples:', creates.slice(0, 5).map((c) => `${c.name} [${c.specs.material}] $${c.retail_price}${c.vendor_cost ? ' (book)' : ''}`).join(' | '));
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
