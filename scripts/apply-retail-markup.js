#!/usr/bin/env node
/**
 * Set slab retail_price = vendor_cost x (1 + vendor_config.default_markup_pct).
 *
 *   DATABASE_URL=… node scripts/apply-retail-markup.js [--write] [--vendor msi]
 *
 * Why: on slabs retail_price still EQUALS vendor_cost — a leftover from the
 * retired "sample price = the colour's $/sqft" scheme. The marketplace renders
 * retail_price as a `/sqft` figure, so today it publishes dealer cost to the
 * public. 1,038 slabs are in that state.
 *
 * Excludes `<colour>-sample` rows: they are $12.99 chips, not slabs, and 177 of
 * them carry a vendor_cost that would otherwise be marked up and charged.
 *
 * Backs up every slab's retail_price before writing, prints a full diff first,
 * and verifies each row afterwards.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const WRITE = process.argv.includes('--write');
const vArg = process.argv.indexOf('--vendor');
const ONLY = vArg > -1 ? process.argv[vArg + 1] : null;

// --scope dropship reprices the non-slab rows that also publish dealer cost.
// It is a different problem: those categories already have correctly-priced
// siblings, so the risk is RE-pricing them, not leaving them alone.
const DROPSHIP = process.argv.includes('--scope') && process.argv[process.argv.indexOf('--scope') + 1] === 'dropship';

const { DATABASE_URL } = process.env;
if (!DATABASE_URL) { console.error('need DATABASE_URL'); process.exit(1); }

const q = (sql) => execFileSync('psql', [DATABASE_URL, '-At', '-F', '\t', '-c', sql], { encoding: 'utf8' }).trim();

const pad = (s, n) => String(s).padEnd(n);
const money = (n) => (n === null ? '—' : `$${n.toFixed(2)}`);

/**
 * Vendors whose already-priced rows sit at (roughly) their configured markup.
 * Only those can have the config applied to their cost-priced rows without
 * inventing a price. A vendor with no priced siblings gives us no evidence and
 * is excluded — silence is not agreement.
 */
function agreeingVendors() {
  const rows = q(`
    SELECT c.vendor_id,
           v.default_markup_pct,
           round((percentile_cont(0.5) WITHIN GROUP (ORDER BY c.retail_price / c.vendor_cost) - 1) * 100) AS observed,
           count(*)
      FROM catalog_products c JOIN vendor_config v ON v.vendor_id = c.vendor_id
     WHERE c.active AND c.category <> 'slab' AND c.vendor_cost > 0
       AND c.retail_price > c.vendor_cost * 1.05
     GROUP BY c.vendor_id, v.default_markup_pct
    HAVING count(*) >= 3;
  `).split('\n').filter(Boolean).map((l) => {
    const [vendor, configured, observed, n] = l.split('\t');
    return { vendor, configured: +configured, observed: +observed, n: +n };
  });
  const agree = rows.filter((r) => Math.abs(r.observed - r.configured) <= AGREEMENT_POINTS);
  console.log('markup agreement (non-slab, vendors with >=3 priced rows):');
  rows.forEach((r) => console.log(`  ${pad(r.vendor, 20)}configured ${r.configured}%  observed ${r.observed}%  n=${r.n}  ${Math.abs(r.observed - r.configured) <= AGREEMENT_POINTS ? 'AGREES' : 'DISAGREES -> excluded'}`));
  console.log('');
  return agree.map((r) => r.vendor);
}

// A slab that costs more than this per sqft, or less than this, is a data error
// rather than a deal. Refuse to publish a price derived from it. Cactus's
// semi-precious (Blue Agate, Amethyst) legitimately reaches $295/sqft.
const MIN_COST = 3;
const MAX_COST = 300;

// vendor_cost is NOT always per-sqft, and price_unit cannot tell you which:
// every slab row says 'each' while carrying a per-sqft number (median $23.95).
// Gila's rows are the real per-SLAB ones — $277-$400 for quartz — so marking
// them up would publish a $452/sqft price. Their price-library rows are
// unit:'each' too. Excluded until their slab area is known and the cost can be
// divided down.
const PER_SLAB_VENDORS = ['gila'];

// Drop-ship: only touch rows that literally publish cost (retail == vendor_cost).
// Their siblings are already priced, and re-deriving those from vendor_config
// would slash them — alfi's priced rows sit at 100% markup while its config says
// 30%, msi at 55% vs 30%, ruvati 35% vs 25%. Configured markup is not what those
// vendors are actually sold at.
const AGREEMENT_POINTS = 5;

const where = DROPSHIP ? `
  c.active
  AND c.category <> 'slab'
  AND c.slug !~ '-sample$'
  AND c.vendor_cost > 0
  AND c.retail_price IS NOT NULL
  AND abs(c.retail_price - c.vendor_cost) < 0.01
  AND c.vendor_id = ANY($AGREEING$)
  ${ONLY ? `AND c.vendor_id = '${ONLY.replace(/'/g, "''")}'` : ''}
` : `
  c.active
  AND c.category = 'slab'
  AND c.slug !~ '-sample$'
  AND c.vendor_cost > 0
  AND c.vendor_id NOT IN (${PER_SLAB_VENDORS.map((v) => `'${v}'`).join(',')})
  ${ONLY ? `AND c.vendor_id = '${ONLY.replace(/'/g, "''")}'` : ''}
`;

const agreeing = DROPSHIP ? agreeingVendors() : [];
if (DROPSHIP && !agreeing.length) { console.error('no vendor agrees with its configured markup — refusing to guess.'); process.exit(1); }
const whereSql = where.replace('$AGREEING$', `ARRAY[${agreeing.map((v) => `'${v}'`).join(',')}]`);

const rows = q(`
  SELECT c.id, c.slug, c.vendor_id, c.vendor_cost, c.retail_price, v.default_markup_pct
  FROM catalog_products c
  JOIN vendor_config v ON v.vendor_id = c.vendor_id
  WHERE ${whereSql}
  ORDER BY c.vendor_id, c.slug;
`).split('\n').filter(Boolean).map((l) => {
  const [id, slug, vendor, cost, retail, markup] = l.split('\t');
  return { id, slug, vendor, cost: +cost, retail: retail === '' ? null : +retail, markup: +markup };
});

// Drop-ship goods are priced per unit, not per sqft: a $1,050 Kibi sink is
// normal. The slab sanity band would reject almost all of them.
const LO = DROPSHIP ? 1 : MIN_COST;
const HI = DROPSHIP ? 20000 : MAX_COST;
const outOfBand = rows.filter((r) => r.cost < LO || r.cost > HI);
// Must agree with Postgres, which computes round(numeric, 2) on an exact value.
// `39.95 * 1.3` in float is 51.934999…, so toFixed(2) yields 51.93 while Postgres
// stores 51.94. That single cent made the dry run report 35 phantom changes on a
// table that was already correct. Integer cents, rounded half-up, matches.
const markedUp = (cost, markupPct) => {
  const cents = Math.round(cost * 100);
  return Math.round((cents * (100 + markupPct)) / 100) / 100;
};

const priced = rows.filter((r) => r.cost >= LO && r.cost <= HI)
  .map((r) => ({ ...r, next: markedUp(r.cost, r.markup) }));
const changing = priced.filter((r) => r.retail === null || Math.abs(r.next - r.retail) >= 0.01);

console.log(`mode: ${WRITE ? 'WRITE' : 'DRY RUN'}${ONLY ? `   vendor=${ONLY}` : ''}\n`);
console.log(`repriceable ${DROPSHIP ? 'drop-ship rows' : 'slabs'}: ${rows.length}`);
if (!DROPSHIP) console.log(`  excluded per-slab vendors: ${PER_SLAB_VENDORS.join(', ')}  (cost is per slab, not per sqft)`);
console.log(`  cost outside $${LO}-$${HI}: ${outOfBand.length}  (skipped, not published)`);
console.log(`  retail_price changing : ${changing.length}\n`);

const byVendor = {};
changing.forEach((r) => {
  byVendor[r.vendor] = byVendor[r.vendor] || { n: 0, markup: r.markup, sumOld: 0, sumNew: 0 };
  byVendor[r.vendor].n++;
  byVendor[r.vendor].sumOld += r.retail ?? 0;
  byVendor[r.vendor].sumNew += r.next;
});
console.log(pad('vendor', 22) + pad('markup', 9) + pad(DROPSHIP ? 'rows' : 'slabs', 8) + pad('avg now', 11) + 'avg after');
console.log('-'.repeat(64));
Object.entries(byVendor).sort((a, b) => b[1].n - a[1].n).forEach(([v, s]) => {
  console.log(pad(v, 22) + pad(`${s.markup}%`, 9) + pad(s.n, 8)
    + pad(money(s.sumOld / s.n), 11) + money(s.sumNew / s.n));
});

console.log('\n--- 12 sample rows ---');
changing.slice(0, 12).forEach((r) => console.log(
  `  ${pad(r.slug, 38)} cost ${money(r.cost)} x${(1 + r.markup / 100).toFixed(2)}  ${money(r.retail)} -> ${money(r.next)}`));

if (outOfBand.length) {
  console.log(`\n--- skipped: cost outside $${LO}-$${HI} ---`);
  outOfBand.slice(0, 6).forEach((r) => console.log(`  ${pad(r.slug, 38)} cost ${money(r.cost)}`));
}

if (!WRITE) { console.log('\nDRY RUN — nothing written. Re-run with --write.\n'); process.exit(0); }
if (!changing.length) { console.log('\nnothing to do.\n'); process.exit(0); }

// Snapshot EVERY slab's retail_price, not only the ones we touch, so a restore
// never has to reproduce this script's filters.
const dir = path.join(os.homedir(), 'sg-backups');
fs.mkdirSync(dir, { recursive: true });
const backup = path.join(dir, DROPSHIP ? 'retail_price_before_markup_dropship.json' : 'retail_price_before_markup.json');
const all = q(`SELECT id, slug, coalesce(retail_price::text,'') FROM catalog_products WHERE active AND category ${DROPSHIP ? "<> 'slab'" : "= 'slab'"};`)
  .split('\n').filter(Boolean).map((l) => { const [id, slug, retail] = l.split('\t'); return { id, slug, retail_price: retail === '' ? null : +retail }; });
fs.writeFileSync(backup, JSON.stringify(all, null, 1));
console.log(`\nbackup: ${backup} (${all.length} slab rows)`);

// One statement, one transaction. The markup lives in vendor_config, so the
// database can compute it — no 1,000 round trips, and no chance of a partial write.
const applied = execFileSync('psql', [DATABASE_URL, '-v', 'ON_ERROR_STOP=1', '-c', `
  UPDATE catalog_products c
     SET retail_price = round((c.vendor_cost * (1 + v.default_markup_pct / 100.0))::numeric, 2)
    FROM vendor_config v
   WHERE v.vendor_id = c.vendor_id
     AND ${whereSql}
     AND c.vendor_cost BETWEEN ${LO} AND ${HI}
     AND (c.retail_price IS NULL
          OR abs(c.retail_price - round((c.vendor_cost * (1 + v.default_markup_pct / 100.0))::numeric, 2)) >= 0.01);
`], { encoding: 'utf8' });
console.log('  ' + applied.trim());

const stillEqual = q(`
  SELECT count(*) FROM catalog_products c
  WHERE ${whereSql} AND c.vendor_cost BETWEEN ${LO} AND ${HI}
    AND abs(c.retail_price - c.vendor_cost) < 0.01;`);
const wrong = q(`
  SELECT count(*) FROM catalog_products c JOIN vendor_config v ON v.vendor_id = c.vendor_id
  WHERE ${whereSql} AND c.vendor_cost BETWEEN ${LO} AND ${HI}
    AND abs(c.retail_price - round((c.vendor_cost * (1 + v.default_markup_pct/100.0))::numeric, 2)) >= 0.01;`);

console.log(`\nverify: slabs still publishing dealer cost: ${stillEqual} (expect 0)`);
console.log(`        slabs not at their markup           : ${wrong} (expect 0)`);
if (stillEqual !== '0' || wrong !== '0') { console.error('MISMATCH — restore from the backup.'); process.exit(1); }
console.log('\nDONE. vendor_cost unchanged.\n');
