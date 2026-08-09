#!/usr/bin/env node
/**
 * Sync VIGO from vigoindustries.com/products.json — live stock now, cost when we have a rate.
 *
 * ⚠️ COST IS DELIBERATELY NOT SET, and that is the whole point of this header.
 *
 * VIGO has the same bug KIBI had: vendor_cost holds VIGO's own selling price, so 52 of the 58
 * products we can verify are listed ABOVE what VIGO charges the public
 * (VG6041STCL6074K1 — we ask $1,364.87, VIGO sells it for $944.90).
 *
 * KIBI was fixable because they apply "DEALER 72% OFF" automatically at their Shopify
 * checkout, so the multiplier is printed on every order confirmation. VIGO is a PO
 * relationship — orders go to orders@vigoindustries.com with a CC authorisation form via named
 * reps (Tom Clavano, Bryan Bation), e.g. PO #SG1526 — and no dealer rate appears anywhere in
 * that correspondence. The feed's compare_at_price is a consumer sale reference (median 0.85
 * of MSRP), NOT a dealer rate; treating it as one would set 634 wrong prices.
 *
 * So: pass --dealer-mult <n> once VIGO's price list arrives and cost + retail follow the same
 * rule as KIBI (retail = max(list x 0.90, cost x 1.085 x 1.35)). Until then this syncs stock
 * and records VIGO's price/MSRP for later reconciliation.
 *
 * Usage: node scripts/sync-vigo.js [--write] [--dealer-mult 0.28]
 */
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const WRITE = process.argv.includes('--write');
const mi = process.argv.indexOf('--dealer-mult');
const DEALER_MULT = mi !== -1 && process.argv[mi + 1] ? parseFloat(process.argv[mi + 1]) : null;
const UNDERCUT = 0.90;
const TAX = 1.085;
const MARGIN = 1.35;

for (const line of fs.readFileSync(path.join(ROOT, '.env.local'), 'utf8').split('\n')) {
  const m = /^([A-Z_]+)=(.*)$/.exec(line.trim());
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
}
const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) { console.error('DATABASE_URL missing from .env.local'); process.exit(1); }
const psql = (sql) => execFileSync('psql', [DATABASE_URL, '-v', 'ON_ERROR_STOP=1', '-tA', '-c', sql],
  { maxBuffer: 1 << 28 }).toString();

// VIGO rate-limits hard (429s on the sitemap), so pace the feed pull.
const feed = [];
for (let page = 1; page <= 12; page++) {
  const raw = execFileSync('curl', ['-sL', '-m', '45', '-A', 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/126 Safari/537.36',
    `https://www.vigoindustries.com/products.json?limit=250&page=${page}`], { maxBuffer: 1 << 27 }).toString();
  let products = [];
  try { products = JSON.parse(raw).products || []; } catch { break; }
  feed.push(...products);
  if (products.length < 250) break;
  execFileSync('sleep', ['2']);
}
const live = new Map();
for (const p of feed) {
  for (const v of p.variants || []) {
    const sku = String(v.sku || '').trim().toUpperCase();
    if (sku) live.set(sku, {
      price: parseFloat(v.price),
      msrp: v.compare_at_price ? parseFloat(v.compare_at_price) : null,
      available: !!v.available,
    });
  }
}
console.log(`VIGO feed: ${feed.length} products, ${live.size} skus`);
if (live.size < 300) { console.error('feed short — refusing to sync'); process.exit(1); }

const rows = psql(
  `select id, coalesce(sku,''), coalesce(retail_price,0), coalesce(vendor_cost,0), coalesce(in_stock,false), coalesce(active,false)
     from catalog_products where vendor_id='vigo' order by sku`
).trim().split('\n').filter(Boolean).map((l) => {
  const [id, sku, retail_price, vendor_cost, in_stock, active] = l.split('|');
  return { id, sku, retail_price: +retail_price, vendor_cost: +vendor_cost, in_stock: in_stock === 't', active: active === 't' };
});

const round2 = (n) => Math.round(n * 100) / 100;
const matched = [];
const unmatched = [];
for (const r of rows) {
  const hit = live.get(String(r.sku).trim().toUpperCase());
  if (!hit) { unmatched.push(r); continue; }
  const cost = DEALER_MULT ? round2(hit.price * DEALER_MULT) : r.vendor_cost;
  const retail = DEALER_MULT ? round2(Math.max(hit.price * UNDERCUT, cost * TAX * MARGIN)) : r.retail_price;
  matched.push({ ...r, hit, cost, retail });
}
const dearer = matched.filter((m) => m.retail_price > m.hit.price * 1.02);
const costIsTheirPrice = matched.filter((m) => m.vendor_cost > 0 && Math.abs(m.vendor_cost - m.hit.price) < 0.01);

console.log(`our rows: ${rows.length} | matched: ${matched.length} | not in feed: ${unmatched.length} (${unmatched.filter((r) => r.active).length} active)`);
console.log(`cost == VIGO's own selling price : ${costIsTheirPrice.length}   <- the bug`);
console.log(`priced ABOVE VIGO's own site     : ${dearer.length}`);
console.log(`stock corrections                : ${matched.filter((m) => m.in_stock !== m.hit.available).length}`);
if (!DEALER_MULT) console.log('\ncost/retail NOT touched — rerun with --dealer-mult once VIGO sends their rate');

if (!WRITE) { console.log('\nDry run — nothing written.'); process.exit(0); }

const today = new Date().toISOString().slice(0, 10);
const vals = matched.map((m) =>
  `('${m.id}'::uuid, ${m.hit.available}, ${m.hit.price}, ${m.hit.msrp || 'null'}, ${m.cost}, ${m.retail})`).join(',\n    ');
const f = path.join(require('os').tmpdir(), `vigo-${Date.now()}.sql`);
fs.writeFileSync(f, `begin;
update catalog_products c
   set in_stock = v.available,
       vendor_cost = v.cost,
       retail_price = v.retail,
       specs = coalesce(c.specs,'{}'::jsonb) || jsonb_build_object(
         'vigo_price', v.price, 'vigo_msrp', v.msrp, 'vigo_synced_at', '${today}'),
       updated_at = now()
  from (values
    ${vals}
  ) as v(id, available, price, msrp, cost, retail)
 where c.id = v.id;
commit;`);
execFileSync('psql', [DATABASE_URL, '-v', 'ON_ERROR_STOP=1', '-f', f], { stdio: 'inherit' });
console.log(`\nsynced ${matched.length} VIGO products (stock${DEALER_MULT ? ' + cost + retail' : ' only'})`);
