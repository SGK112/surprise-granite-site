#!/usr/bin/env node
/**
 * Push a vendor's portal-sync results from the CRM into the storefront catalog.
 *
 * THE GAP THIS CLOSES. vendorPortalEngine logs into a dealer portal and writes real
 * dealerCost + stock into the CRM's Mongo `vendorinventories`. Nothing then carries that to
 * Supabase `catalog_products`, which is what the site actually sells from. So a portal can be
 * syncing perfectly and the storefront still shows stale cost and stock — the two databases
 * were only ever reconciled by hand.
 *
 * Ruvati is the proof it works: 626 costed rows sat in the CRM while the catalog quietly
 * drifted. It is also the only vendor with no public feed (products.json and sitemap both
 * 404), so the portal is the sole source of truth there.
 *
 * Cost is taken as-is from the portal — it IS our dealer cost, not a list price to discount.
 * Retail is only recalculated with --reprice, because moving 500 prices is an owner decision.
 *
 * Usage: node scripts/apply-vendor-inventory.js <vendor> [--write] [--reprice]
 *   e.g. node scripts/apply-vendor-inventory.js ruvati --write
 */
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const vendor = process.argv[2];
const WRITE = process.argv.includes('--write');
const REPRICE = process.argv.includes('--reprice');
if (!vendor || vendor.startsWith('--')) {
  console.error('usage: apply-vendor-inventory.js <vendor> [--write] [--reprice]');
  process.exit(1);
}
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

// The CRM lives in a separate repo with its own Mongo connection string.
const CRM = path.join(process.env.HOME, 'voiceNow-crm');
const mongoUri = (fs.readFileSync(path.join(CRM, '.env'), 'utf8')
  .split('\n').find((l) => l.startsWith('MONGODB_URI=')) || '').slice(12).replace(/^["']|["']$/g, '').trim();
if (!mongoUri) { console.error('MONGODB_URI not found in ~/voiceNow-crm/.env'); process.exit(1); }

const NODE = `
const m = require('mongoose');
(async () => {
  await m.connect(process.argv[1], { serverSelectionTimeoutMS: 20000 });
  const rows = await m.connection.collection('vendorinventories')
    .find({ vendor: new RegExp(process.argv[2], 'i') },
          { projection: { sku: 1, dealerCost: 1, inStock: 1, availableQty: 1, lastSyncedAt: 1 } })
    .toArray();
  process.stdout.write(JSON.stringify(rows));
  await m.disconnect();
})().catch((e) => { console.error(e.message); process.exit(1); });
`;
const portal = JSON.parse(execFileSync('node', ['-e', NODE, mongoUri, vendor], { cwd: CRM, maxBuffer: 1 << 27 }).toString());
const bySku = new Map();
let newest = null;
for (const r of portal) {
  const sku = String(r.sku || '').trim().toUpperCase();
  if (sku) bySku.set(sku, r);
  if (r.lastSyncedAt && (!newest || r.lastSyncedAt > newest)) newest = r.lastSyncedAt;
}
console.log(`portal rows for "${vendor}": ${portal.length} (last synced ${String(newest).slice(0, 10)})`);
if (!bySku.size) { console.error('no portal inventory for that vendor'); process.exit(1); }

const rows = psql(
  `select id, coalesce(sku,''), coalesce(retail_price,0), coalesce(vendor_cost,0), coalesce(in_stock,false)
     from catalog_products where vendor_id='${vendor.replace(/'/g, "''")}'`
).trim().split('\n').filter(Boolean).map((l) => {
  const [id, sku, retail_price, vendor_cost, in_stock] = l.split('|');
  return { id, sku, retail_price: +retail_price, vendor_cost: +vendor_cost, in_stock: in_stock === 't' };
});

const round2 = (n) => Math.round(n * 100) / 100;
const changes = [];
for (const r of rows) {
  const p = bySku.get(String(r.sku).trim().toUpperCase());
  if (!p || !(p.dealerCost > 0)) continue;
  const cost = round2(p.dealerCost);
  const stock = !!p.inStock;
  const retail = REPRICE ? round2(cost * TAX * MARGIN) : r.retail_price;
  if (Math.abs(r.vendor_cost - cost) < 0.01 && r.in_stock === stock && Math.abs(r.retail_price - retail) < 0.01) continue;
  changes.push({ ...r, cost, stock, retail, qty: p.availableQty });
}
const costMoves = changes.filter((c) => Math.abs(c.vendor_cost - c.cost) > 0.01);
const stockMoves = changes.filter((c) => c.in_stock !== c.stock);
const wouldLose = changes.filter((c) => c.retail > 0 && c.retail <= c.cost);

console.log(`catalog rows: ${rows.length} | matched portal: ${rows.filter((r) => bySku.has(String(r.sku).toUpperCase())).length}`);
console.log(`  cost corrections : ${costMoves.length}`);
console.log(`  stock corrections: ${stockMoves.length}`);
console.log(`  repricing        : ${REPRICE ? changes.length : 'off (--reprice)'}`);
if (wouldLose.length) console.log(`  ⚠ would sell at/below cost: ${wouldLose.length}`);
for (const c of changes.slice(0, 8)) {
  console.log(`   ${c.sku.slice(0, 22).padEnd(22)} cost $${c.vendor_cost.toFixed(2)} -> $${c.cost.toFixed(2)}  stock ${c.in_stock} -> ${c.stock}`);
}
if (!changes.length) { console.log('\nalready in sync'); process.exit(0); }
if (!WRITE) { console.log('\nDry run — nothing written.'); process.exit(0); }

const vals = changes.map((c) =>
  `('${c.id}'::uuid, ${c.cost}, ${c.retail}, ${c.stock}, ${Number.isFinite(c.qty) ? c.qty : 'null'})`).join(',\n    ');
const f = path.join(require('os').tmpdir(), `vi-${vendor}-${Date.now()}.sql`);
fs.writeFileSync(f, `begin;
update catalog_products c
   set vendor_cost = v.cost, retail_price = v.retail, in_stock = v.stock,
       specs = coalesce(c.specs,'{}'::jsonb) || jsonb_build_object(
         'portal_qty', v.qty, 'portal_synced_at', '${new Date().toISOString().slice(0, 10)}'),
       updated_at = now()
  from (values
    ${vals}
  ) as v(id, cost, retail, stock, qty)
 where c.id = v.id;
commit;`);
execFileSync('psql', [DATABASE_URL, '-v', 'ON_ERROR_STOP=1', '-f', f], { stdio: 'inherit' });
console.log(`\napplied ${changes.length} rows from the ${vendor} portal sync`);
