#!/usr/bin/env node
/**
 * Un-flag the colors the vendor-verification pass proved are STILL sold.
 *
 * Reads data/discontinued-review.json (from verify-discontinued.js) and, for
 * every color with verdict "still-listed", clears the stale specs.discontinued
 * flag and reactivates the product so it returns to the live catalog and drops
 * off /discontinued/.
 *
 * Only touches product rows (never -sample chips) that carry an image, so a
 * reactivated color renders correctly. Idempotent.
 *
 * Usage: NODE_PATH=api/node_modules node scripts/unflag-verified-available.js [--write]
 */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', 'api', '.env') });
const { createClient } = require('@supabase/supabase-js');

const supa = createClient('https://ypeypgwsycxcagncgdur.supabase.co', process.env.SUPABASE_SERVICE_KEY);
const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');

(async () => {
  const write = process.argv.includes('--write');
  const review = require(path.join(__dirname, '..', 'data', 'discontinued-review.json'));
  const names = new Set(review.results.filter((r) => r.verdict === 'still-listed').map((r) => norm(r.name)));
  console.log('still-listed colors from review:', names.size);

  let rows = [];
  for (let f = 0; ; f += 1000) {
    const { data } = await supa.from('catalog_products')
      .select('id, slug, name, active, in_stock, primary_image_url, image_urls, specs')
      .eq('category', 'slab').eq('specs->>discontinued', 'true').order('name').range(f, f + 999);
    rows = rows.concat(data); if (data.length < 1000) break;
  }
  const targets = rows.filter((r) => names.has(norm(r.name))
    && !/-sample$/.test(r.slug)
    && (r.primary_image_url || (Array.isArray(r.image_urls) && r.image_urls.length)));

  console.log('rows to reactivate:', targets.length);
  if (!write) { console.log('\nDRY RUN — add --write'); process.exit(0); }

  let ok = 0;
  for (const r of targets) {
    const specs = Object.assign({}, r.specs);
    delete specs.discontinued;
    delete specs.discontinued_source;
    specs._reactivated = 'vendor-verified still on public site';
    const { error } = await supa.from('catalog_products')
      .update({ active: true, in_stock: true, specs, updated_at: new Date().toISOString() })
      .eq('id', r.id);
    if (!error) ok++; else console.warn('  failed', r.slug, error.message);
  }
  console.log(`reactivated ${ok}/${targets.length}`);
  process.exit(0);
})().catch((e) => { console.error('FATAL', e.message); process.exit(1); });
