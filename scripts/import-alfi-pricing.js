#!/usr/bin/env node
/**
 * Reconcile Alfi Trade pricing (ALFI brand, EAGO, Whitehaus) from the vendor datasheets.
 *
 * Alfi has no dealer portal — pricing arrives as spreadsheets Kim Tiamzon emails. Those sheets
 * are the only authoritative source, and catalog_products has drifted badly from them:
 * WHNCD72 carried vendor_cost $131.63 against a real cost of $2,495, so it listed at $171.12
 * and would have lost $2,324 on a single sale. Costs are also split across two pricing
 * generations (547 rows at 1.30x, 367 at 1.4648x), so per-row cost cannot be trusted at all.
 *
 * This recomputes, per SKU, from the sheet:
 *   cost   = MSRP x multiplier        (Whitehaus 0.50 · ALFI brand + EAGO 0.405)
 *   retail = max(cost x 1.085 x 1.35, MAP)
 *
 * MAP is a contractual advertising floor and only Whitehaus publishes one. Pricing below it can
 * cost us the dealer account, so it wins over the formula whenever it is higher.
 *
 * Discontinued SKUs are deactivated rather than repriced — Whitehaus lists them on a second tab,
 * ALFI/EAGO inline via `Discontinued?`. We were still listing 70 of them, some dead since 2019.
 *
 * Dry-run by default. This writes to PRODUCTION Supabase — read the report before using --write.
 *
 * Usage: node scripts/import-alfi-pricing.js "<whitehaus.xlsx>" "<alfi-eago.xlsx>" [--write]
 */
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const WRITE = process.argv.includes('--write');
// Default is the SAFE set: correct vendor_cost everywhere (internal truth, no customer impact),
// but only move retail_price where the current price is indefensible — at/below cost, or under
// the vendor's MAP floor. Bulk repricing to the margin formula is an owner decision, so the
// remaining items need --all-prices said out loud.
const ALL_PRICES = process.argv.includes('--all-prices');
const files = process.argv.slice(2).filter((a) => !a.startsWith('--'));
if (files.length < 2) {
  console.error('usage: import-alfi-pricing.js "<whitehaus.xlsx>" "<alfi-eago.xlsx>" [--write]');
  process.exit(1);
}

// Load credentials the same way the rest of the repo does.
for (const line of fs.readFileSync(path.join(ROOT, '.env.local'), 'utf8').split('\n')) {
  const m = /^([A-Z_]+)=(.*)$/.exec(line.trim());
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
}
// psql over the SESSION POOLER, not PostgREST: the project host
// (<ref>.supabase.co) does not resolve from this machine — a known local DNS/IPv6 quirk — while
// aws-0-us-west-2.pooler.supabase.com does. Batched SQL in one transaction also beats thousands
// of individual PATCH calls.
const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) { console.error('DATABASE_URL missing from .env.local'); process.exit(1); }

function psql(sql) {
  return execFileSync('psql', [DATABASE_URL, '-v', 'ON_ERROR_STOP=1', '-tA', '-c', sql],
    { maxBuffer: 1 << 28 }).toString();
}

const TAX = 1.085;      // input tax baked into cost basis
const MARGIN = 1.35;    // owner-set margin — see the master-sheet pricing rule
const WHITEHAUS_MULT = 0.50;
const ALFI_MULT = 0.405;

const PY = `
import json, sys, warnings
warnings.filterwarnings("ignore")
import openpyxl

wh = openpyxl.load_workbook(sys.argv[1], data_only=True)
ws = wh["Sheet1"]
rows = list(ws.iter_rows(values_only=True))
hdr = [str(h).strip() if h is not None else "" for h in rows[0]]
i = {h: n for n, h in enumerate(hdr)}
out = {}
for r in rows[1:]:
    s = r[i["SkuNumber"]]
    if not s:
        continue
    out[str(s).strip().upper()] = {"msrp": r[i["MSRP"]], "map": r[i["MAP"]], "brand": "Whitehaus", "disc": False}
for r in list(wh["DISCONTINUED"].iter_rows(min_row=2, values_only=True)):
    if r and r[0]:
        k = str(r[0]).strip().upper()
        out.setdefault(k, {"msrp": None, "map": None, "brand": "Whitehaus"})["disc"] = True

al = openpyxl.load_workbook(sys.argv[2], data_only=True)["Sheet1"]
rows = list(al.iter_rows(values_only=True))
hdr = [str(h).strip() if h is not None else "" for h in rows[0]]
i = {h: n for n, h in enumerate(hdr)}
for r in rows[1:]:
    s = r[i["SKU"]]
    if not s:
        continue
    out[str(s).strip().upper()] = {
        "msrp": r[i["2026 MSRP"]], "map": None,
        "brand": (str(r[i["Brand"]]).strip() or "ALFI brand"),
        "disc": str(r[i["Discontinued?"]]).strip().lower() in ("yes", "true", "y", "1"),
    }
json.dump(out, sys.stdout)
`;
const sheet = JSON.parse(execFileSync('python3', ['-c', PY, files[0], files[1]], { maxBuffer: 1 << 28 }).toString());
console.log(`datasheet SKUs: ${Object.keys(sheet).length}`);

// Pull every Alfi row.
const rows = psql(
  "select id, coalesce(sku,''), coalesce(retail_price,0), coalesce(vendor_cost,0), coalesce(active,true) " +
  "from catalog_products where vendor_id = 'alfi-trade'"
).trim().split('\n').filter(Boolean).map((line) => {
  const [id, sku, retail_price, vendor_cost, active] = line.split('|');
  return { id, sku, retail_price: Number(retail_price), vendor_cost: Number(vendor_cost), active: active === 't' };
});
console.log(`catalog rows (alfi-trade): ${rows.length}\n`);

const round2 = (n) => Math.round(n * 100) / 100;
const plan = { reprice: [], costOnly: [], deactivate: [], unmatched: [], unchanged: 0 };

for (const row of rows) {
  const sku = String(row.sku || '').trim().toUpperCase();
  const s = sheet[sku];
  if (!s) { plan.unmatched.push(row); continue; }

  if (s.disc) {
    if (row.active !== false) plan.deactivate.push({ row });
    else plan.unchanged++;
    continue;
  }
  if (!s.msrp) { plan.unmatched.push(row); continue; }

  const mult = /whitehaus/i.test(s.brand) ? WHITEHAUS_MULT : ALFI_MULT;
  const cost = round2(s.msrp * mult);
  const formula = cost * TAX * MARGIN;
  const retail = round2(Math.max(formula, s.map || 0));

  const costMoved = Math.abs((row.vendor_cost || 0) - cost) > 0.01;
  const priceMoved = Math.abs((row.retail_price || 0) - retail) > 0.01;
  if (!costMoved && !priceMoved) { plan.unchanged++; continue; }
  const wasLoss = (row.retail_price || 0) <= cost;
  const underMap = !!(s.map && (row.retail_price || 0) < s.map - 0.01);
  const mustFix = wasLoss || underMap;
  const entry = { row, cost, retail, mapFloor: s.map && formula < s.map, wasLoss, underMap };
  // Cost is always corrected; retail only moves when it must, unless --all-prices.
  if (mustFix || ALL_PRICES) plan.reprice.push(entry);
  else plan.costOnly.push(entry);
}

const money = (n) => `$${Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
console.log(`reprice (price+cost): ${plan.reprice.length}`);
console.log(`cost-only fix       : ${plan.costOnly.length}${ALL_PRICES ? '' : '  (retail left alone — needs --all-prices)'}`);
console.log(`deactivate (disc): ${plan.deactivate.length}`);
console.log(`already correct  : ${plan.unchanged}`);
console.log(`no sheet row     : ${plan.unmatched.length}`);

const losses = plan.reprice.filter((p) => p.wasLoss);
console.log(`\nwere selling AT OR BELOW COST: ${losses.length}`);
for (const p of losses.sort((a, b) => (a.row.retail_price - a.cost) - (b.row.retail_price - b.cost)).slice(0, 10)) {
  console.log(`   ${String(p.row.sku).padEnd(14)} ${money(p.row.retail_price)} -> ${money(p.retail)}   (cost ${money(p.cost)})`);
}
const mapped = plan.reprice.filter((p) => p.mapFloor);
console.log(`\nlifted to the MAP floor: ${mapped.length}`);
for (const p of mapped.slice(0, 6)) {
  console.log(`   ${String(p.row.sku).padEnd(14)} ${money(p.row.retail_price)} -> ${money(p.retail)}`);
}
const biggest = plan.reprice.slice().sort((a, b) => Math.abs(b.retail - b.row.retail_price) - Math.abs(a.retail - a.row.retail_price));
console.log('\nlargest price moves:');
for (const p of biggest.slice(0, 10)) {
  const d = p.retail - p.row.retail_price;
  console.log(`   ${String(p.row.sku).padEnd(14)} ${money(p.row.retail_price)} -> ${money(p.retail)}  (${d > 0 ? '+' : ''}${money(d)})`);
}

if (!WRITE) {
  console.log('\nDry run — nothing written. Re-run with --write to apply to PRODUCTION.');
  process.exit(0);
}

const esc = (v) => String(v).replace(/'/g, "''");
const sqlParts = [];
if (plan.reprice.length) {
  const vals = plan.reprice.map((p) => `('${esc(p.row.id)}'::uuid, ${p.cost}, ${p.retail})`).join(',\n    ');
  sqlParts.push(
    `update catalog_products c set vendor_cost = v.cost, retail_price = v.retail\n` +
    `  from (values\n    ${vals}\n  ) as v(id, cost, retail)\n  where c.id = v.id;`
  );
}
if (plan.costOnly.length) {
  const vals = plan.costOnly.map((p) => `('${esc(p.row.id)}'::uuid, ${p.cost})`).join(',\n    ');
  sqlParts.push(
    `update catalog_products c set vendor_cost = v.cost\n` +
    `  from (values\n    ${vals}\n  ) as v(id, cost)\n  where c.id = v.id;`
  );
}
if (plan.deactivate.length) {
  const ids = plan.deactivate.map((p) => `'${esc(p.row.id)}'::uuid`).join(',');
  sqlParts.push(`update catalog_products set active = false, in_stock = false where id in (${ids});`);
}
if (!sqlParts.length) { console.log('\nnothing to do'); process.exit(0); }

const sqlFile = path.join(require('os').tmpdir(), `alfi-reprice-${Date.now()}.sql`);
fs.writeFileSync(sqlFile, `begin;\n${sqlParts.join('\n')}\ncommit;\n`);
console.log(`\napplying ${plan.reprice.length} reprices + ${plan.costOnly.length} cost-only + ${plan.deactivate.length} deactivations in one transaction...`);
execFileSync('psql', [DATABASE_URL, '-v', 'ON_ERROR_STOP=1', '-f', sqlFile], { stdio: 'inherit' });
console.log('done');
