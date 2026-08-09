#!/usr/bin/env node
/**
 * Sync KIBI USA from their public Shopify feed: real dealer cost + live availability.
 *
 * KIBI needs no portal, no login and no browser — kibiusa.com/products.json is public and
 * carries every variant SKU, its list price and an `available` flag.
 *
 * ⚠️ THE COST BUG THIS FIXES. vendor_cost had been populated with KIBI's LIST price, so for
 * 286 products cost == what KIBI charges the public. Marked up 1.4648 on top, that made us
 * dearer than the manufacturer on 96% of their catalogue — KFF501BG stored cost $180, listed
 * by us at $234, while KIBI sells it for $180. Nobody would ever buy that.
 *
 * Our real cost is on the order confirmations: "DEALER 72% OFF (-$129.60) $180.00 -> $50.40".
 * So cost = list x 0.28. Verified against order Web #1972 (2025-11-25).
 *
 * Retail (--with-retail) is KIBI's list less 10%, floored at the standard cost x 1.085 x 1.35.
 * The owner chose that over the raw formula: the formula would put KFF501BG at $73.83 against
 * KIBI's own $180, and undercutting a manufacturer by 59% is how a dealer account gets
 * cancelled if a MAP exists. 10% under keeps us cheapest with nothing to renegotiate.
 *
 * Usage: node scripts/sync-kibi.js [--write] [--with-retail]
 */
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const WRITE = process.argv.includes('--write');
const WITH_RETAIL = process.argv.includes('--with-retail');
// Owner decision 2026-08-09: price 10% under KIBI's own list. That keeps us the cheapest
// place to buy their product while staying under their price rather than undercutting the
// manufacturer by 59%, which is how a dealer account gets cancelled when a MAP exists.
// Floored at the standard formula so a product whose list sits close to cost can never end
// up thin.
const UNDERCUT = 0.90;

const DEALER_MULT = 0.28;   // "DEALER 72% OFF" on every KIBI order confirmation
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

// Public feed — paginate until a short page.
const feed = [];
for (let page = 1; page <= 12; page++) {
  const raw = execFileSync('curl', ['-sL', '-m', '45', '-A', 'Mozilla/5.0',
    `https://kibiusa.com/products.json?limit=250&page=${page}`], { maxBuffer: 1 << 27 }).toString();
  let products = [];
  try { products = JSON.parse(raw).products || []; } catch { break; }
  feed.push(...products);
  if (products.length < 250) break;
}
const live = new Map();
for (const p of feed) {
  for (const v of p.variants || []) {
    const sku = String(v.sku || '').trim().toUpperCase();
    if (sku) live.set(sku, { list: parseFloat(v.price), available: !!v.available, title: p.title });
  }
}
console.log(`KIBI feed: ${feed.length} products, ${live.size} variant SKUs`);
if (live.size < 200) { console.error('feed looks short — refusing to sync on a partial read'); process.exit(1); }

const rows = psql(
  `select id, coalesce(sku,''), name, coalesce(retail_price,0), coalesce(vendor_cost,0),
          coalesce(active,false), coalesce(in_stock,false)
     from catalog_products where vendor_id='kibi' order by sku`
).trim().split('\n').filter(Boolean).map((l) => {
  const [id, sku, name, retail_price, vendor_cost, active, in_stock] = l.split('|');
  return { id, sku, name, retail_price: +retail_price, vendor_cost: +vendor_cost,
    active: active === 't', in_stock: in_stock === 't' };
});
console.log(`our KIBI rows: ${rows.length}\n`);

const round2 = (n) => Math.round(n * 100) / 100;
const updates = [];
const notAtKibi = [];
for (const r of rows) {
  const hit = live.get(String(r.sku).trim().toUpperCase());
  if (!hit) { notAtKibi.push(r); continue; }
  const cost = round2(hit.list * DEALER_MULT);
  const retail = WITH_RETAIL
    ? round2(Math.max(hit.list * UNDERCUT, cost * TAX * MARGIN))
    : r.retail_price;
  updates.push({ ...r, cost, retail, list: hit.list, available: hit.available });
}

const costFixes = updates.filter((u) => Math.abs(u.vendor_cost - u.cost) > 0.01);
const stockFixes = updates.filter((u) => u.in_stock !== u.available);
const dearer = updates.filter((u) => u.retail_price > u.list * 1.02);

console.log(`matched a live KIBI sku : ${updates.length}`);
console.log(`not in KIBI's feed      : ${notAtKibi.length} (${notAtKibi.filter((r) => r.active).length} active)`);
console.log(`cost corrections        : ${costFixes.length}`);
console.log(`stock corrections       : ${stockFixes.length}`);
console.log(`\npriced ABOVE KIBI's own list: ${dearer.length} of ${updates.length}`);
for (const u of updates.slice(0, 6)) {
  console.log(`   ${u.sku.padEnd(14)} we sell $${u.retail_price.toFixed(2).padStart(9)} | KIBI list $${u.list.toFixed(2).padStart(8)} | cost was $${u.vendor_cost.toFixed(2)} -> $${u.cost.toFixed(2)}${WITH_RETAIL ? ` | retail -> $${u.retail.toFixed(2)}` : ''}`);
}
if (!WITH_RETAIL) console.log('\n(retail left alone — pass --with-retail once the pricing call is made)');

if (!WRITE) { console.log('\nDry run — nothing written.'); process.exit(0); }
if (!updates.length) { console.log('nothing to write'); process.exit(0); }

const vals = updates.map((u) => `('${u.id}'::uuid, ${u.cost}, ${u.retail}, ${u.available}, ${u.list})`).join(',\n    ');
const f = path.join(require('os').tmpdir(), `kibi-${Date.now()}.sql`);
fs.writeFileSync(f, `begin;
update catalog_products c
   set vendor_cost = v.cost,
       retail_price = v.retail,
       in_stock = v.available,
       specs = coalesce(c.specs,'{}'::jsonb) || jsonb_build_object(
         'kibi_list', v.list, 'kibi_synced_at', '${new Date().toISOString().slice(0, 10)}'),
       updated_at = now()
  from (values
    ${vals}
  ) as v(id, cost, retail, available, list)
 where c.id = v.id;
commit;`);
execFileSync('psql', [DATABASE_URL, '-v', 'ON_ERROR_STOP=1', '-f', f], { stdio: 'inherit' });
console.log(`\nsynced ${updates.length} KIBI products (cost + stock${WITH_RETAIL ? ' + retail' : ''})`);
