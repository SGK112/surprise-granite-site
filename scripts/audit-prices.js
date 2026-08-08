#!/usr/bin/env node
/**
 * Audit price consistency between what a browse grid shows and what the detail page shows.
 *
 * Both surfaces are supposed to derive from ONE source — the live catalog API. The grids
 * fetch it at runtime; the detail pages bake it in at build time. So the grids are correct
 * by construction and the only thing that can drift is a static page that wasn't rebuilt
 * after a price moved. This finds those.
 *
 * Prices are not shown raw for every category — the audit has to know the rules or it
 * reports thousands of false positives (see [[price-renderer-audit]]):
 *
 *   slab     installed $/sqft = retail_price + $55 fabrication      (FAB_RATE below)
 *   slab     when retail_price is a per-slab TOTAL (The Yard), it is
 *            (total / sqft) + $55 — sqft parsed from the size field
 *   remnant  (piece + $150 pickup + sqft x $55) / sqft
 *   other    raw retail_price, drop-ship
 *
 * A slab over $500 is a mis-stored total, not a $/sqft rate, so it has no valid installed
 * price and the page must say "Call for pricing" rather than print a number.
 *
 * Usage: node scripts/audit-prices.js [--json out.json]
 */
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const API = 'https://surprise-granite-email-api.onrender.com';
const FAB_RATE = 55;      // must match build-countertop-pages.js and js/marketplace-grid.js
const PICKUP = 150;       // remnant pickup fee
const MAX_SQFT_RATE = 500;

function fetchCatalog() {
  const out = [];
  const first = JSON.parse(execFileSync('curl', ['-s', '-m', '60', `${API}/api/catalog?limit=1`], { maxBuffer: 1 << 26 }));
  const total = first.total || 0;
  for (let off = 0; off < total; off += 250) {
    const raw = execFileSync('curl', ['-s', '-m', '90', `${API}/api/catalog?limit=250&offset=${off}`], { maxBuffer: 1 << 28 });
    out.push(...(JSON.parse(raw).products || []));
  }
  const bySlug = {};
  for (const p of out) bySlug[String(p.slug || '').toLowerCase()] = p;
  return { bySlug, count: out.length, total };
}

// Slab sizes read like `117" x 77"` — inches, so divide by 144 for square feet.
function sqftOf(product) {
  const m = /([\d.]+)\s*"?\s*[xX×]\s*([\d.]+)/.exec(product.size || '');
  return m ? (parseFloat(m[1]) * parseFloat(m[2])) / 144 : null;
}

// Every price the page is ALLOWED to show, given the category rules.
function expectedPrices(product) {
  const rp = Number(product.retail_price);
  if (!rp) return [];
  const cat = product.category;
  if (cat === 'slab' || cat === 'remnant') {
    const out = [];
    if (rp <= MAX_SQFT_RATE) out.push(rp + FAB_RATE);       // rate is already $/sqft
    const a = sqftOf(product);
    if (a && a > 5) {
      out.push(rp / a + FAB_RATE);                          // per-slab total
      if (cat === 'remnant') out.push((rp + PICKUP + a * FAB_RATE) / a);
    }
    return out;
  }
  return [rp];
}

function detailPages() {
  const pages = [];
  const walk = (rel, depth) => {
    const abs = path.join(ROOT, rel);
    if (!fs.existsSync(abs)) return;
    for (const e of fs.readdirSync(abs, { withFileTypes: true })) {
      if (!e.isDirectory() || e.name.startsWith('.')) continue;
      const child = path.join(rel, e.name);
      if (depth === 1 && fs.existsSync(path.join(ROOT, child, 'index.html'))) pages.push(child);
      else if (depth > 1) walk(child, depth - 1);
    }
  };
  walk('marketplace', 2);   // marketplace/<category>/<slug>
  walk('countertops', 1);
  walk('flooring', 1);
  return pages;
}

const { bySlug, count } = fetchCatalog();
console.log(`catalog: ${count} live products`);

const pages = detailPages();
console.log(`static detail pages: ${pages.length}\n`);

const tally = { match: 0, formula: 0, quoteOnly: 0, stub: 0, aggregate: 0 };
const stale = [];
const orphaned = [];

for (const rel of pages) {
  const html = fs.readFileSync(path.join(ROOT, rel, 'index.html'), 'utf8');
  const noindex = /name="robots"[^>]*noindex/.test(html);
  const m = /"(?:lowPrice|price)"\s*:\s*"?([\d.]+)/.exec(html);
  if (!m) { tally[noindex ? 'stub' : 'quoteOnly']++; continue; }
  const shown = parseFloat(m[1]);
  const slug = rel.split(path.sep).pop().toLowerCase();
  const product = bySlug[slug];

  // Consolidated multi-vendor colour pages quote the CHEAPEST member, so their price has no
  // reason to match the same-slug row even when one exists. Check this before comparing, or
  // every consolidated page reads as stale.
  if (html.includes('AggregateOffer')) { tally.aggregate++; continue; }

  if (!product) {
    if (!noindex) orphaned.push({ page: rel, shown });
    else tally.stub++;
    continue;
  }

  const allowed = expectedPrices(product);
  if (!allowed.length) { tally.quoteOnly++; continue; }
  const hit = allowed.find((p) => Math.abs(p - shown) < 1.0);
  if (hit === undefined) {
    stale.push({ page: rel, shown, catalog: Number(product.retail_price), expected: allowed.map((p) => +p.toFixed(2)), category: product.category, noindex });
  } else if (Math.abs(hit - Number(product.retail_price)) < 0.005) tally.match++;
  else tally.formula++;
}

console.log(`  ${String(tally.match).padStart(6)}  price matches catalog exactly`);
console.log(`  ${String(tally.formula).padStart(6)}  correct under the installed/remnant formula`);
console.log(`  ${String(tally.aggregate).padStart(6)}  multi-vendor consolidated pages (AggregateOffer)`);
console.log(`  ${String(tally.quoteOnly).padStart(6)}  quote-only (no usable price - correct)`);
console.log(`  ${String(tally.stub).padStart(6)}  noindex stubs`);
console.log(`\n  ${String(stale.length).padStart(6)}  STALE - page price matches no valid rule`);
console.log(`  ${String(orphaned.length).padStart(6)}  ORPHANED - indexed, priced, no catalog row`);

for (const s of stale.slice(0, 20)) {
  console.log(`    ${s.category.padEnd(8)} shows $${s.shown.toFixed(2)} | catalog $${s.catalog} -> allowed ${s.expected.map((e) => '$' + e).join(' or ')}  ${s.page}`);
}
if (orphaned.length) {
  console.log('\n  orphaned sample:');
  for (const o of orphaned.slice(0, 15)) console.log(`    $${o.shown.toFixed(2).padStart(9)}  ${o.page}`);
}

const jsonFlag = process.argv.indexOf('--json');
if (jsonFlag !== -1 && process.argv[jsonFlag + 1]) {
  fs.writeFileSync(process.argv[jsonFlag + 1], JSON.stringify({ tally, stale, orphaned }, null, 2));
  console.log(`\nwrote ${process.argv[jsonFlag + 1]}`);
}
process.exitCode = stale.length ? 1 : 0;
