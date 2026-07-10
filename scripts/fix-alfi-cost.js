#!/usr/bin/env node
/**
 * Repair the handful of Alfi/Whitehaus rows whose vendor_cost is corrupt.
 *
 *   MONGODB_URI=… DATABASE_URL=… node scripts/fix-alfi-cost.js [--write]
 *
 * Alfi Trade sells two brands and gives us a datasheet of MSRPs for each. Our
 * dealer cost is a fixed fraction of MSRP, and it is remarkably clean:
 *
 *   ALFI brand / EAGO : cost = MSRP x 0.405   (563 of 569 rows, p05..p95 all 0.405)
 *   Whitehaus         : cost = MSRP x 0.500   (251 of 255 rows, p05..p95 all 0.500)
 *
 * retail_price already equals MSRP on 611 of the 613 rows we can match.
 *
 * Ten rows fall outside those bands — WHNCD72 and WHNCMB4413 both carry a stuck
 * $131.63, AB1023 shows $1.46 against a $290 MSRP. Those are the rows that made
 * retail look like 10-20x cost. Recompute them from MSRP; a row we cannot match
 * to a datasheet keeps whatever it has, because guessing is what broke it.
 *
 * Writes vendor_cost only.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { MongoClient } = require(path.join(__dirname, '../api/node_modules/mongodb'));
const { execFileSync } = require('child_process');

const WRITE = process.argv.includes('--write');
const { DATABASE_URL, MONGODB_URI } = process.env;
if (!DATABASE_URL || !MONGODB_URI) { console.error('need DATABASE_URL and MONGODB_URI'); process.exit(1); }

function q(sql) {
  try {
    return execFileSync('psql', [DATABASE_URL, '-At', '-F', '\t', '-c', sql], { encoding: 'utf8' }).trim();
  } catch (e) {
    // execFileSync puts argv — including the password — in the error message.
    throw new Error(`psql failed: ${(e.stderr || '').toString().trim() || e.status}`);
  }
}

// Whatever vendor_config says today, so a repaired row lands on the same price
// apply-retail-markup.js would give it. Hardcoding 30 here would silently drift.
const MARKUP_PCT = Number(q(`SELECT default_markup_pct FROM vendor_config WHERE vendor_id='alfi-trade';`));
if (!Number.isFinite(MARKUP_PCT)) { console.error('no markup configured for alfi-trade'); process.exit(1); }

// Integer cents: `39.95 * 1.3` is 51.934999… in float, so toFixed(2) gives 51.93
// where Postgres round(numeric,2) stores 51.94. Must agree, or verify() fails.
const markedUp = (cost) => Math.round((Math.round(cost * 100) * (100 + MARKUP_PCT)) / 100) / 100;

const SHEETS = [
  { file: 'ALFI brand and EAGO Datasheet - JAN 2026.xlsx', priceHeader: /msrp/i, ratio: 0.405, brand: 'ALFI/EAGO' },
  { file: 'Whitehaus Datasheet - JAN 26.xlsx', priceHeader: /msrp/i, ratio: 0.500, brand: 'Whitehaus' },
];

// A base SKU maps to several finishes with different MSRPs: AB1003 costs $153.90,
// which is exactly 380 x 0.405 (the BN finish), while its MSRP-era retail $280 is
// the PC finish's. So: if the cost matches ratio x MSRP for ANY finish of that
// SKU, it is right, and nothing here touches it.
//
// Everything else that HAS a datasheet entry is corrupt. That is a harder line
// than this script first drew, and it has to be: retail_price is now derived as
// cost x 1.30 (one markup, every vendor — owner, 2026-07-09), so a wrong cost is
// no longer a private bookkeeping error, it is a wrong price on the website.
// AB3018UD's cost implies a $567 MSRP where the sheet says $1,150, and it was
// publishing $298 for an eleven-hundred-dollar sink.
const MATCH_TOL = 0.02;

// Rows the datasheets don't contain cannot be priced at all: no MSRP, so no cost,
// so no defensible retail. Selling one means guessing. WH3018 was on offer at
// $121.10 against a $1,100 list price. Deactivate rather than guess — a listing
// we can restore in one UPDATE is cheaper than a sink sold at an 89% discount.
const RETAIL_BEFORE = path.join(process.env.HOME, 'sg-backups', 'retail_price_before_markup_dropship.json');
const COLLAPSE = 0.5;

async function loadSheet(client, spec) {
  const doc = await client.db().collection('_vendor_docs').findOne({ filename: spec.file });
  if (!doc) throw new Error(`not cached: ${spec.file}`);
  const ExcelJS = require(path.join(process.env.HOME, 'voiceNow-crm/node_modules/exceljs'));
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(Buffer.from(doc.dataB64, 'base64url'));
  const ws = wb.worksheets[0];

  let priceCol = null;
  ws.getRow(1).eachCell({ includeEmpty: false }, (c, i) => { if (priceCol === null && spec.priceHeader.test(String(c.value))) priceCol = i; });
  if (!priceCol) throw new Error(`no price column in ${spec.file}`);

  const map = new Map();
  ws.eachRow((row, i) => {
    if (i === 1) return;
    const sku = row.getCell(1).value;
    const raw = row.getCell(priceCol).value;
    const price = Number(typeof raw === 'object' && raw ? (raw.result ?? raw.text) : raw);
    if (sku && Number.isFinite(price) && price > 0) map.set(String(sku).trim().toUpperCase(), price);
  });
  return map;
}

/**
 * The datasheets key on finish (`AB1023-BN`, `AB1023-PC`); the catalog collapses
 * them to a base SKU (`AB1023`). Match exactly first, then fall back to the base
 * SKU and take the MSRP nearest the row's retail price — retail already equals an
 * MSRP on 611 of 613 matched rows, so it identifies which finish this row is.
 */
// A finish suffix is ALPHABETIC (-BN brushed nickel, -PC polished chrome, -W
// white, -BM matte black). A suffix containing a digit is a SIZE or model, and a
// different size is a different product.
//
// This regex used to be /-[A-Z0-9]{1,4}$/, which stripped sizes too, so
// `WHRAX-63` collapsed to `WHRAX` and "verified" its cost against `WHRAX-48` —
// a 48-inch unit. `WH1-114` likewise matched `WH1-102L`. Both then passed the
// ratio check and were reported correct. Widening a key until it matches is not
// verification; it just moves the error somewhere quieter.
const stripFinish = (s) => s.replace(/-[A-Z]{1,3}$/, '');

function msrpCandidates(map, sku) {
  if (map.has(sku)) return [map.get(sku)];
  const base = stripFinish(sku);
  if (map.has(base)) return [map.get(base)];
  const out = [];
  for (const [k, v] of map) if (stripFinish(k) === base) out.push(v);
  return out;
}

(async () => {
  const client = new MongoClient(MONGODB_URI);
  await client.connect();
  const sheets = [];
  for (const spec of SHEETS) sheets.push({ ...spec, map: await loadSheet(client, spec) });
  await client.close();
  sheets.forEach((s) => console.log(`${s.brand.padEnd(12)} ${s.map.size} SKUs, cost = MSRP x ${s.ratio}`));

  const rows = q(`
    SELECT id, vendor_sku, vendor_cost, retail_price
      FROM catalog_products
     WHERE active AND vendor_id='alfi-trade' AND vendor_sku IS NOT NULL AND vendor_cost > 0;
  `).split('\n').filter(Boolean).map((l) => {
    const [id, sku, cost, retail] = l.split('\t');
    return { id, sku: sku.toUpperCase(), cost: +cost, retail: +retail };
  });

  // retail_price is now cost x 1.30, so it can no longer tell us which finish a
  // row is. Its pre-markup value equalled the MSRP on 611 of 613 rows, and that
  // is what identifies the finish. Read it from the backup taken before the write.
  const priorRetail = new Map(JSON.parse(fs.readFileSync(RETAIL_BEFORE, 'utf8'))
    .map((r) => [r.id, r.retail_price === '' || r.retail_price == null ? null : Number(r.retail_price)]));

  const fixes = [];
  const unmatched = [];
  let matched = 0;
  for (const r of rows) {
    r.was = priorRetail.get(r.id) ?? r.retail;
    let sheet = null, cands = [];
    for (const s2 of sheets) {
      const c = msrpCandidates(s2.map, r.sku);
      if (c.length) { sheet = s2; cands = c; break; }
    }
    if (!sheet) { unmatched.push(r); continue; }
    matched++;

    // Right for ANY finish of this SKU -> leave it alone.
    if (cands.some((m) => Math.abs(r.cost / m - sheet.ratio) <= MATCH_TOL)) continue;

    const msrp = cands.reduce((a, b) => (Math.abs(b - r.was) < Math.abs(a - r.was) ? b : a));
    fixes.push({ ...r, msrp, expected: Number((msrp * sheet.ratio).toFixed(2)), ratio: +(r.cost / msrp).toFixed(3), brand: sheet.brand });
  }

  // No datasheet entry AND the reprice slashed the public price: the cost that
  // drove it is unsupported by any source we hold. Pull the listing.
  const unfixable = unmatched.filter((r) => r.was && r.retail < r.was * COLLAPSE);

  const pad = (s, n) => String(s).padEnd(n);
  console.log(`\nalfi rows with a cost      : ${rows.length}`);
  console.log(`  matched to a datasheet   : ${matched}`);
  console.log(`  cost contradicts the sheet: ${fixes.length}  (repair)`);
  console.log(`  no datasheet SKU         : ${unmatched.length}  (of which ${unfixable.length} now underpriced -> deactivate)\n`);

  if (fixes.length) {
    console.log(pad('sku', 15) + pad('brand', 12) + pad('msrp', 10) + pad('cost now', 11) + pad('cost should be', 15) + pad('retail now', 12) + 'retail after');
    console.log('-'.repeat(100));
    fixes.forEach((f) => console.log(
      pad(f.sku, 15) + pad(f.brand, 12) + pad(`$${f.msrp}`, 10) + pad(`$${f.cost}`, 11) + pad(`$${f.expected}`, 15)
      + pad(`$${f.retail.toFixed(2)}`, 12) + `$${markedUp(f.expected).toFixed(2)}`));
  }

  if (unfixable.length) {
    console.log(`\n--- absent from both datasheets, retail collapsed -> DEACTIVATE ---`);
    console.log(pad('sku', 15) + pad('cost', 11) + pad('was', 11) + pad('now', 11) + 'name');
    unfixable.forEach((r) => console.log(pad(r.sku, 15) + pad(`$${r.cost}`, 11) + pad(`$${r.was.toFixed(2)}`, 11) + pad(`$${r.retail.toFixed(2)}`, 11)));
  }

  if (!WRITE) { console.log('\nDRY RUN — nothing written. Re-run with --write.\n'); return; }
  if (!fixes.length && !unfixable.length) { console.log('\nnothing to do.\n'); return; }

  const dir = path.join(os.homedir(), 'sg-backups');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'alfi_vendor_cost_before.json'), JSON.stringify(rows, null, 1));
  console.log(`\nbackup: ${path.join(dir, 'alfi_vendor_cost_before.json')} (${rows.length} rows)`);

  // Repair the cost AND the price it now derives. Leaving retail behind would
  // republish the very number this script exists to remove.
  for (const f of fixes) {
    q(`UPDATE catalog_products SET vendor_cost = ${f.expected}, retail_price = ${markedUp(f.expected)} WHERE id = '${f.id}';`);
  }
  for (const r of unfixable) q(`UPDATE catalog_products SET active = false WHERE id = '${r.id}';`);
  console.log(`  repaired ${fixes.length}, deactivated ${unfixable.length}`);

  if (fixes.length) {
    const ids = fixes.map((f) => `'${f.id}'`).join(',');
    const bad = q(`SELECT count(*) FROM catalog_products
                    WHERE id IN (${ids})
                      AND abs(retail_price - round((vendor_cost * ${1 + MARKUP_PCT / 100})::numeric, 2)) >= 0.01;`);
    console.log(`\nverify: repaired rows off the ${MARKUP_PCT}% markup: ${bad} (expect 0)`);
    if (bad !== '0') { console.error('MISMATCH — restore from the backup.'); process.exit(1); }
  }
  const live = q(`SELECT count(*) FROM catalog_products WHERE active AND id IN (${unfixable.map((r) => `'${r.id}'`).join(',') || `''`});`);
  console.log(`verify: unpriceable rows still active     : ${live} (expect 0)`);
  if (live !== '0') { console.error('MISMATCH — those rows are still on sale.'); process.exit(1); }
  console.log('\nDONE.\n');
})().catch((e) => { console.error(e.message); process.exit(1); });
