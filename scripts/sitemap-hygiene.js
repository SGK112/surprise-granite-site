#!/usr/bin/env node
/**
 * sitemap-hygiene.js — refresh the sitemap-index lastmods, and warn if the
 * marketplace sitemaps have drifted from the pages on disk. Rerunnable, idempotent.
 *
 * WHY THIS EXISTS. Google reads the sitemap INDEX's <lastmod> to decide whether to
 * re-fetch a child sitemap at all. Nothing maintained it: on 2026-09-13 every child
 * was frozen at 2026-07-07 in sitemap.xml while the children themselves had moved on
 * to 2026-09-07 — so the freshest sitemaps on the site were the ones Google had the
 * least reason to re-read. This sets each child's index date to the newest <lastmod>
 * actually inside that child, so the published date is true rather than just "today".
 *
 * THE DRIFT RULE (reported, not enforced): a marketplace page belongs in its sitemap
 * iff it is sellable (has an Add to Cart) AND not noindex. Anything else is drift.
 *
 * ⚠️ TWO WRITERS — READ THIS BEFORE ADDING --write TO THE URL SETS.
 * The scheduled "stock: refresh product availability from the vendor stock list"
 * job ALREADY regenerates the 5 marketplace category sitemaps from the catalog
 * (2,123 files a run, sitemap-{sinks,faucets,tile,bathroom,kitchen-accessories}
 * included). It owns those URL sets. This script therefore only REPORTS drift
 * against the pages on disk — it never rewrites them, because two writers with
 * different sources of truth would fight on every run. As of 2026-09-13 the two
 * agree exactly (+0/-0), so a non-zero drift number here means the stock job's
 * catalog view and the actual pages have diverged: fix the job, not the sitemap.
 *
 * What this script DOES write is the sitemap INDEX lastmod, which nothing else
 * maintains — every child was frozen at 2026-07-07 while children themselves had
 * moved on to 2026-09-07. Google reads the index lastmod to decide whether to
 * re-fetch a child at all, so a stale index hides fresh children.
 *
 * Exits non-zero on drift, so it can gate CI.
 *
 * lastmod policy: existing per-URL lastmods are PRESERVED. Only newly added URLs
 * get today's date. Never mass-restamp every URL to today — that is a false
 * freshness signal and Google discounts sitemaps that do it.
 *
 * Usage: node scripts/sitemap-hygiene.js [--write]
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const WRITE = process.argv.includes('--write');
const ORIGIN = 'https://www.surprisegranite.com';
const TODAY = new Date().toISOString().slice(0, 10);

// category dir under marketplace/  ->  sitemap file
const CATEGORIES = {
  sinks: 'sitemap-sinks.xml',
  faucets: 'sitemap-faucets.xml',
  tile: 'sitemap-tile.xml',
  bathroom: 'sitemap-bathroom.xml',
  'kitchen-accessories': 'sitemap-kitchen-accessories.xml',
};

const isNoindex = html => /<meta[^>]*name=["']robots["'][^>]*content=["'][^"']*noindex/i.test(html);
const isSellable = html => html.includes('Add to Cart');

/** Existing <loc> -> <lastmod> so we can preserve real dates. */
function readSitemap(file) {
  if (!fs.existsSync(file)) return new Map();
  const xml = fs.readFileSync(file, 'utf8');
  const map = new Map();
  for (const block of xml.split('<url>').slice(1)) {
    const loc = (block.match(/<loc>([^<]+)<\/loc>/) || [])[1];
    if (!loc) continue;
    map.set(loc.trim(), (block.match(/<lastmod>([^<]+)<\/lastmod>/) || [])[1] || TODAY);
  }
  return map;
}

function renderSitemap(entries) {
  const body = entries
    .map(
      ({ loc, lastmod }) =>
        `<url>\n<loc>${loc}</loc>\n<lastmod>${lastmod}</lastmod>\n<changefreq>weekly</changefreq>\n<priority>0.6</priority>\n</url>`
    )
    .join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${body}\n</urlset>\n`;
}

let totalAdded = 0;
let totalRemoved = 0;

for (const [cat, smName] of Object.entries(CATEGORIES)) {
  const dir = path.join(ROOT, 'marketplace', cat);
  if (!fs.existsSync(dir)) {
    console.log(`  ${smName.padEnd(34)} SKIP (no marketplace/${cat}/)`);
    continue;
  }
  const smPath = path.join(ROOT, smName);
  const existing = readSitemap(smPath);

  // Derive the correct set from the pages themselves.
  const wanted = new Map();
  for (const slug of fs.readdirSync(dir)) {
    const page = path.join(dir, slug, 'index.html');
    if (!fs.existsSync(page)) continue;
    const html = fs.readFileSync(page, 'utf8');
    if (!isSellable(html) || isNoindex(html)) continue;
    const loc = `${ORIGIN}/marketplace/${cat}/${slug}/`;
    wanted.set(loc, existing.get(loc) || TODAY);
  }

  const added = [...wanted.keys()].filter(u => !existing.has(u));
  const removed = [...existing.keys()].filter(u => !wanted.has(u));
  totalAdded += added.length;
  totalRemoved += removed.length;

  const entries = [...wanted.entries()]
    .map(([loc, lastmod]) => ({ loc, lastmod }))
    .sort((a, b) => a.loc.localeCompare(b.loc));

  console.log(
    `  ${smName.padEnd(34)} ${String(entries.length).padStart(5)} urls  +${added.length} -${removed.length}`
  );
  for (const u of added.slice(0, 4)) console.log(`      + ${u.replace(ORIGIN, '')}`);
  for (const u of removed.slice(0, 4)) console.log(`      - ${u.replace(ORIGIN, '')}`);

  // Deliberately NOT written — the stock-refresh job owns these URL sets. See the
  // TWO WRITERS note above. renderSitemap() is kept so a future single-owner
  // refactor can turn this on without rewriting the logic.
  void renderSitemap;
}

// ---- Refresh the sitemap index ----------------------------------------------
// Each child's index lastmod = the newest lastmod actually inside that child, so
// the date we publish is true rather than just "today".
const indexPath = path.join(ROOT, 'sitemap.xml');
let indexXml = fs.readFileSync(indexPath, 'utf8');
const indexChanges = [];

indexXml = indexXml.replace(
  /<sitemap>\s*<loc>([^<]+)<\/loc>\s*<lastmod>([^<]+)<\/lastmod>\s*<\/sitemap>/g,
  (whole, loc, oldDate) => {
    const child = path.join(ROOT, loc.split('/').pop());
    if (!fs.existsSync(child)) return whole;
    const dates = [...fs.readFileSync(child, 'utf8').matchAll(/<lastmod>([^<]+)<\/lastmod>/g)].map(m => m[1]);
    const newest = dates.sort().pop() || oldDate;
    if (newest !== oldDate) indexChanges.push(`${loc.split('/').pop()}: ${oldDate} -> ${newest}`);
    return `<sitemap>\n    <loc>${loc}</loc>\n    <lastmod>${newest}</lastmod>\n  </sitemap>`;
  }
);

console.log('\n  sitemap index lastmod:');
for (const c of indexChanges) console.log(`      ${c}`);
if (!indexChanges.length) console.log('      (already current)');
if (WRITE) fs.writeFileSync(indexPath, indexXml);

const drift = totalAdded + totalRemoved;
console.log(
  `\n${WRITE ? 'WROTE' : 'DRY RUN'} — index dates refreshed: ${indexChanges.length}.`
);
console.log(
  drift === 0
    ? '  sitemap/page drift: none (stock-refresh job and on-disk pages agree).'
    : `  ⚠️  sitemap/page drift: ${totalAdded} missing, ${totalRemoved} stale. The stock-refresh\n     job's catalog view has diverged from the pages — fix the job, not the sitemap.`
);
if (!WRITE) console.log('\nRe-run with --write to apply the index dates.');
process.exit(drift === 0 ? 0 : 1);
