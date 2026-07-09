#!/usr/bin/env node
/**
 * Harvest real vendor SKUs from Shopify into catalog_products.vendor_sku, so the
 * portal syncs can look products up by SKU and Shopify can be switched off.
 *
 *   SHOPIFY_STORE=… SHOPIFY_ADMIN_TOKEN=… DATABASE_URL=… \
 *     node scripts/backfill-vendor-sku.js [--write]
 *
 * The join is exact, not fuzzy: for the drop-ship rows that lack a vendor_sku,
 * catalog_products.sku holds the Shopify HANDLE
 * (`simply-silver-glass-vessel-bathroom-sink`), and the Shopify product with
 * that handle carries the manufacturer SKU on its first variant (`VG07-SS`).
 *
 * Name-based lookup does not work for these vendors — our `name` is a Shopify
 * merchandising title, not the vendor's own product title, so it never appears
 * on the vendor's page. Real SKUs are the only way to reach them, which is why
 * this runs before Shopify is retired.
 *
 * Writes vendor_sku + lookup_mode only. Never touches sku, name or price.
 */

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

// catalog vendor_id -> regex matching Shopify's `vendor` field
const VENDORS = {
  'vigo': /^vigo/i,
  'ruvati': /^ruvati/i,
  'kibi': /^kibi/i,
  'alfi-trade': /^alfi/i,
  'esi': /^(esi|edgebanding)/i,
};

// Mirrors isRealSku() in voiceNow-crm/backend/services/vendorPortalEngine.js and
// migration 016's CHECK. A handle is never a SKU.
const isRealSku = (s) => /^[A-Z0-9][A-Z0-9._/-]{2,24}$/.test(String(s || '')) && /\d/.test(String(s || ''));

const WRITE = process.argv.includes('--write');
const { SHOPIFY_STORE, SHOPIFY_ADMIN_TOKEN, DATABASE_URL } = process.env;
if (!SHOPIFY_STORE || !SHOPIFY_ADMIN_TOKEN || !DATABASE_URL) {
  console.error('need SHOPIFY_STORE, SHOPIFY_ADMIN_TOKEN, DATABASE_URL');
  process.exit(1);
}

const psql = (sql) => execFileSync('psql', [DATABASE_URL, '-Atc', sql], { encoding: 'utf8' }).trim();

async function shopifyProducts() {
  const out = [];
  let url = `https://${SHOPIFY_STORE}/admin/api/2024-10/products.json?limit=250&fields=handle,vendor,variants`;
  let guard = 0;
  while (url && guard++ < 60) {
    const r = await fetch(url, { headers: { 'X-Shopify-Access-Token': SHOPIFY_ADMIN_TOKEN } });
    if (r.status === 429) { await new Promise((s) => setTimeout(s, 1500)); continue; }
    // A 5xx must not look like "no more products" — that would silently backfill nothing.
    if (!r.ok) throw new Error(`Shopify products fetch failed: HTTP ${r.status}`);
    const j = await r.json();
    out.push(...(j.products || []));
    const m = (r.headers.get('link') || '').match(/<([^>]+)>;\s*rel="next"/);
    url = m ? m[1] : null;
  }
  return out;
}

(async () => {
  const products = await shopifyProducts();
  console.log(`shopify products fetched: ${products.length}\n`);

  // handle -> sku, per catalog vendor
  const pairs = [];
  const skipped = {};
  for (const [vendorId, rx] of Object.entries(VENDORS)) {
    const mine = products.filter((p) => rx.test(p.vendor || ''));
    for (const p of mine) {
      const sku = (p.variants || [])[0]?.sku;
      if (!p.handle || !sku) continue;
      if (!isRealSku(sku)) { skipped[vendorId] = (skipped[vendorId] || 0) + 1; continue; }
      pairs.push({ vendorId, handle: p.handle, sku });
    }
  }
  console.log(`candidate handle->sku pairs: ${pairs.length}`);
  Object.entries(skipped).forEach(([v, n]) => console.log(`  ${v}: ${n} shopify SKUs rejected as slug-like`));

  // Load into a temp table and let Postgres do the join — 900 PATCH calls is silly.
  const tsv = pairs.map((p) => `${p.vendorId}\t${p.handle}\t${p.sku}`).join('\n');
  const tmp = path.join(require('os').tmpdir(), 'vendor_sku_pairs.tsv');
  fs.writeFileSync(tmp, tsv);

  const setup = `
    drop table if exists _sku_backfill;
    create temp table _sku_backfill (vendor_id text, handle text, sku text);
  `;
  // \copy runs client-side, so the file doesn't need to exist on the DB host.
  const load = `\\copy _sku_backfill from '${tmp}' with (format text, delimiter E'\\t')`;

  const preview = `
    select c.vendor_id,
           count(*) filter (where c.vendor_sku is null) as would_fill,
           count(*) filter (where c.vendor_sku is not null) as already_set
    from catalog_products c
    join _sku_backfill b on b.handle = c.sku and b.vendor_id = c.vendor_id
    where c.active
    group by c.vendor_id order by 2 desc;
  `;

  const script = [setup, load, preview].join('\n');
  const out = execFileSync('psql', [DATABASE_URL, '-v', 'ON_ERROR_STOP=1', '-f', '-'],
    { encoding: 'utf8', input: script });
  console.log('\n=== rows this backfill would fill ===');
  console.log(out.trim().split('\n').map((l) => '  ' + l).join('\n'));

  if (!WRITE) { console.log('\nDRY RUN — nothing written. Re-run with --write.\n'); return; }

  const apply = [setup, load, `
    update catalog_products c
       set vendor_sku = b.sku,
           lookup_mode = 'sku'
      from _sku_backfill b
     where b.handle = c.sku
       and b.vendor_id = c.vendor_id
       and c.active
       and c.vendor_sku is null;
  `].join('\n');
  const res = execFileSync('psql', [DATABASE_URL, '-v', 'ON_ERROR_STOP=1', '-f', '-'],
    { encoding: 'utf8', input: apply });
  console.log('\n' + res.trim().split('\n').map((l) => '  ' + l).join('\n'));

  console.log('\n=== verify ===');
  console.log('  ' + psql(`
    select vendor_id || '  sku=' || count(*) filter (where lookup_mode='sku')
                     || '  name=' || count(*) filter (where lookup_mode='name')
    from catalog_products where active and vendor_id in ('vigo','ruvati','kibi','alfi-trade','esi')
    group by vendor_id order by vendor_id;`).split('\n').join('\n  '));
  const bad = psql(`select count(*) from catalog_products where vendor_sku is not null and vendor_sku !~ '[0-9]';`);
  console.log(`\n  slug-like values in vendor_sku (want 0): ${bad}`);
  if (bad !== '0') { console.error('  MISMATCH — investigate.'); process.exit(1); }
  console.log('\nDONE.\n');
})().catch((e) => { console.error(e.message); process.exit(1); });
