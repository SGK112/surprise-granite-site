#!/usr/bin/env node
/**
 * Retire colours that do not exist at the vendor we attribute them to.
 *
 * Owner rule: "If it's not on the price lists or not on the vendor site, it's
 * probably discontinued and we don't want to advertise it."
 *
 * Retiring means active=false + in_stock=false + specs.discontinued=true. The row
 * is kept, never deleted, so a re-import cannot silently resurrect it and so the
 * reason survives. build-slabs-json.js then excludes it from data/slabs.json.
 *
 * Usage: NODE_PATH=api/node_modules node scripts/retire-nonexistent-colors.js [--write]
 */
const path = require('path');
const fs = require('fs');
require('dotenv').config({ path: path.join(__dirname, '..', 'api', '.env') });
const { createClient } = require('@supabase/supabase-js');

const SUPA_URL = 'https://ypeypgwsycxcagncgdur.supabase.co';
const KEY = process.env.SUPABASE_SERVICE_KEY;
(function assertPair() {
  if (!KEY) throw new Error('SUPABASE_SERVICE_KEY missing (api/.env)');
  const ref = JSON.parse(Buffer.from(KEY.split('.')[1], 'base64').toString()).ref;
  const host = new URL(SUPA_URL).host.split('.')[0];
  if (ref !== host) throw new Error(`PAIR MISMATCH: url=${host} key.ref=${ref}`);
})();
const supa = createClient(SUPA_URL, KEY);

// slug -> why. Only rows attributed to a vendor that does not sell them.
const RETIRE = {
  'bedrock-quartz':
    'MSI has no Bedrock in any material (owner, 2026-07-10). '
  + 'msisurfaces.com/granite-countertops/bedrock/ returns 404 and MSI site search lists no Bedrock '
  + 'granite; /quartz-countertops/bedrock-quartz/ is a discontinued notice for "Bedrock Brown". '
  + 'The row had subcategory=Granite, inherited from countertops.json. '
  + 'NB: bedrock-granite-cactus (Cactus Stone) is a different vendor\'s real granite — left alone.',
  'gold-rush-quartz':
    'Bolder Image Stone has no such product: bolderimagestone.com/products/gold-rush/ 404s and it is '
  + 'absent from their catalogue index. Already inactive; this records the reason.',
};

(async () => {
  const write = process.argv.includes('--write');
  const slugs = Object.keys(RETIRE);
  const { data: rows, error } = await supa.from('catalog_products')
    .select('id, slug, name, vendor_id, brand, category, subcategory, active, in_stock, specs')
    .in('slug', slugs);
  if (error) throw error;
  if (!rows.length) throw new Error('zero rows — check the URL/key pair');

  for (const r of rows) {
    console.log(`${r.slug}  [${r.vendor_id} / ${r.category} / ${r.subcategory}]`);
    console.log(`   active ${r.active} -> false | in_stock ${r.in_stock} -> false | specs.discontinued -> true`);
    console.log(`   why: ${RETIRE[r.slug]}\n`);
  }
  const missing = slugs.filter((s) => !rows.some((r) => r.slug === s));
  if (missing.length) console.warn('!! not in catalog:', missing.join(', '));

  if (!write) { console.log('DRY RUN — add --write'); process.exit(0); }

  const dir = path.join(process.env.HOME, 'sg-backups');
  fs.mkdirSync(dir, { recursive: true });
  const backup = path.join(dir, `retired-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
  fs.writeFileSync(backup, JSON.stringify(rows, null, 1));
  console.log('backup:', backup);

  let ok = 0;
  for (const r of rows) {
    const { error: e } = await supa.from('catalog_products').update({
      active: false,
      in_stock: false,
      sample_eligible: false,
      specs: { ...(r.specs || {}), discontinued: true, retired_reason: RETIRE[r.slug] },
      updated_at: new Date().toISOString(),
    }).eq('id', r.id);
    if (e) console.error('  FAIL', r.slug, e.message); else ok++;
  }
  console.log(`retired ${ok}/${rows.length}`);
  process.exit(ok === rows.length ? 0 : 1);
})().catch((e) => { console.error('FATAL', e.message); process.exit(1); });
