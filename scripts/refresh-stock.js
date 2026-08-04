#!/usr/bin/env node
/**
 * Re-check every product against the vendor's published stock, and republish.
 *
 *   node scripts/refresh-stock.js            # rebuild, leave changes staged for review
 *   node scripts/refresh-stock.js --commit   # rebuild, commit + push (what the cron runs)
 *
 * WHY THIS RUNS ON A SCHEDULE. A customer called about a vanity the marketplace
 * showed as available; ALFI had discontinued it. The generator now cross-checks
 * ALFI's published stock list, which found 66 products across five categories
 * being advertised in stock that the vendor reports as ZERO.
 *
 * But that check is only as fresh as the last run, and it decays in BOTH
 * directions:
 *
 *   Stale one way, we advertise something the vendor has run out of — the
 *   original problem, returning quietly a week later.
 *
 *   Stale the other way, a product that came BACK stays hidden. That is the
 *   failure nobody reports, because a customer who cannot find a product does
 *   not phone to say so. It just looks like we do not sell it.
 *
 * ALFI refreshes their file Monday, Wednesday and Friday. This runs those
 * afternoons so the site is never more than one business day behind.
 *
 * IT COMMITS NOTHING WHEN NOTHING CHANGED. The generators are idempotent —
 * verified: a second identical run rewrites no files — so a quiet week produces
 * a quiet log and an empty git history rather than a daily no-op commit.
 */
const path = require('path');
const { spawnSync, execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const args = process.argv.slice(2);
const COMMIT = args.includes('--commit');

/** Every category the marketplace publishes. Missing one leaves it stale. */
const CATS = ['sink', 'faucet', 'tile', 'fixture', 'accessory'];

function run(label, script, extra = []) {
  console.log(`\n── ${label} ${'─'.repeat(Math.max(0, 40 - label.length))}`);
  const r = spawnSync('node', [path.join(__dirname, script), ...extra], { cwd: ROOT, stdio: 'inherit' });
  if (r.status !== 0) {
    // Stop rather than push a half-rebuilt site. A partial run could leave one
    // category advertising stock the vendor no longer has, which is the exact
    // thing this exists to prevent.
    console.error(`✗ ${label} failed (exit ${r.status}) — stopping before any commit`);
    process.exit(r.status || 1);
  }
}

// ---- 1. confirm the vendor file is actually reachable ----
// The generator degrades gracefully when ALFI is unreachable: it generates
// exactly as before, without the cross-check. That is right for a one-off run
// and WRONG for a scheduled one — it would republish every pulled product as
// available and look like a successful refresh. So check first, and bail.
let vendorRows = 0;
let raw = '';
try {
  raw = execFileSync('curl', ['-sL', '--max-time', '30', '-A',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/120.0 Safari/537.36',
    'https://www.alfitrade.com/media/pdf/alfitrade-inventory.csv'], { maxBuffer: 1 << 24 }).toString();
} catch (e) {
  console.error(`✗ ALFI stock list unreachable (${e.message}) — refusing to republish without it.`);
  process.exit(1);
}

// VALIDATE THE CONTENT, not the line count.
//
// The first version counted non-empty lines and required 500. A 404 from
// alfitrade.com is an HTML error page 587 lines long, so it sailed through the
// check and the run proceeded with an empty stock map — which would have
// republished all 66 pulled products as available and reported success. Tested,
// not imagined: pointing the URL at a missing file printed "587 rows —
// proceeding."
//
// So: the header must be the CSV header we expect, and enough DATA rows must
// actually parse into a SKU and a numeric quantity.
const lines = raw.split(/\r?\n/).filter((l) => l.trim());
const header = (lines[0] || '').split(',').map((h) => h.trim().toUpperCase());
const iSku = header.indexOf('SKU');
const iQty = header.indexOf('QTY');
if (iSku < 0 || iQty < 0) {
  console.error(`✗ ALFI response is not the stock list — header was: ${String(lines[0] || '(empty)').slice(0, 90)}`);
  console.error('  Refusing to republish: without the vendor file every pulled product goes back up as available.');
  process.exit(1);
}
for (const line of lines.slice(1)) {
  const c = line.split(',');
  const sku = (c[iSku] || '').trim();
  const qty = (c[iQty] || '').trim();
  if (sku && /^\d+$/.test(qty)) vendorRows++;
}
const MIN_ROWS = 1000; // the file has ~1,822; anything near half is a bad fetch
if (vendorRows < MIN_ROWS) {
  console.error(`✗ ALFI stock list parsed only ${vendorRows} usable rows (expected ~1,800) — refusing to republish on a partial file.`);
  process.exit(1);
}
console.log(`ALFI stock list: ${vendorRows} usable rows — proceeding.`);

// ---- 2. rebuild every category ----
for (const cat of CATS) run(`Marketplace: ${cat}`, 'gen-marketplace-pages.js', [cat]);

// ---- 3. commit + push only if something actually moved ----
if (!COMMIT) {
  console.log('\n✓ Done. Review `git status`, then commit when ready.');
  process.exit(0);
}

console.log('\n── Commit & push ─────────────────────────');
const changed = spawnSync('git', ['status', '--porcelain', 'marketplace', 'sitemap-sinks.xml',
  'sitemap-faucets.xml', 'sitemap-tile.xml', 'sitemap-bathroom.xml', 'sitemap-kitchen-accessories.xml'],
{ cwd: ROOT }).stdout.toString().trim();

if (!changed) {
  console.log('No change since the last run — vendor stock is the same. Nothing committed.');
  process.exit(0);
}

const files = changed.split('\n').length;
const msg = `stock: refresh product availability from the vendor stock list (${files} file${files === 1 ? '' : 's'})

Auto-regenerated by refresh-stock.js against ALFI Trade's published list
(${vendorRows} SKUs, refreshed Mon/Wed/Fri). Products the vendor reports as zero
are pulled from the sitemap and their pages corrected to say unavailable;
products that came back in stock are republished.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>`;

for (const a of [['add', 'marketplace', '-A'], ['add', '.'], ['commit', '-q', '-m', msg], ['push', '-q', 'origin', 'main']]) {
  const r = spawnSync('git', a, { cwd: ROOT, stdio: 'inherit' });
  if (r.status !== 0) { console.error(`✗ git ${a[0]} failed`); process.exit(r.status || 1); }
}
console.log('Committed & pushed ✓');
