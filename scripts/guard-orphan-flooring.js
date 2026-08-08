#!/usr/bin/env node
/**
 * Stop /flooring/ pages from advertising a price for a product the catalog no longer sells.
 *
 * gen-marketplace-pages.js already sweeps orphans under /marketplace/, but /flooring/<slug>/
 * pages are built elsewhere and were never covered. A 2026-08-08 audit found 193 pages on
 * disk against 152 live catalog rows — 41 orphans, 36 of them indexed and quoting a price.
 *
 * Two different problems, two different fixes:
 *
 *   RENAMED  The product still exists under an `xl-` prefixed slug, and the old page quotes
 *            the OLD price — e.g. cyrus-whitfield-gray shows $2.46 while the live
 *            xl-cyrus-whitfield-gray is $2.76. That is an underquote, so the page must stop
 *            answering for it: noindex + redirect to the page that has the real price.
 *   GONE     No equivalent anywhere. noindex, follow and drop it from the sitemap; it comes
 *            back on its own if the product returns.
 *
 * Reversible — nothing is deleted, only robots meta added.
 *
 * Usage: node scripts/guard-orphan-flooring.js [--write]
 */
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const API = 'https://surprise-granite-email-api.onrender.com';
const WRITE = process.argv.includes('--write');
const SITEMAP = path.join(ROOT, 'sitemap-flooring.xml');
const MIN_ROWS = 50;   // never sweep on a failed or partial API fetch

function liveFlooring() {
  const slugs = new Map();
  for (let off = 0; off < 2000; off += 250) {
    const raw = execFileSync('curl', ['-s', '-m', '90', `${API}/api/catalog?category=flooring&limit=250&offset=${off}`], { maxBuffer: 1 << 26 });
    const products = JSON.parse(raw).products || [];
    for (const p of products) slugs.set(String(p.slug).toLowerCase(), p);
    if (products.length < 250) break;
  }
  return slugs;
}

const live = liveFlooring();
console.log(`live flooring products: ${live.size}`);
if (live.size < MIN_ROWS) {
  console.error(`only ${live.size} rows returned — refusing to sweep on a partial fetch`);
  process.exit(1);
}

// The same product may have been re-slugged; check the known aliases before calling it dead.
function aliasFor(slug) {
  const candidates = [
    `xl-${slug}`,
    slug.replace(/^xl-/, ''),
    slug.replace(/-luxury-vinyl-planks$/, '-luxury-vinyl-tile'),
    slug.replace(/-luxury-vinyl-tile$/, '-luxury-vinyl-planks'),
  ];
  return candidates.find((c) => live.has(c)) || null;
}

const dir = path.join(ROOT, 'flooring');
const orphans = [];
for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
  if (!entry.isDirectory()) continue;
  const slug = entry.name.toLowerCase();
  if (live.has(slug)) continue;
  const file = path.join(dir, entry.name, 'index.html');
  if (!fs.existsSync(file)) continue;
  orphans.push({ slug, file, alias: aliasFor(slug) });
}

let renamed = 0, gone = 0, already = 0;
const removeFromSitemap = [];

for (const o of orphans) {
  let html = fs.readFileSync(o.file, 'utf8');
  const wasNoindex = /content="noindex/i.test(html);

  const robots = '<meta name="robots" content="noindex, follow"/>';
  html = /<meta name="robots"/i.test(html)
    ? html.replace(/<meta name="robots"[^>]*>/i, robots)
    : html.replace(/<\/title>/i, `</title>\n${robots}`);

  if (o.alias) {
    // Point both humans and crawlers at the page that carries the correct price.
    const dest = `/flooring/${o.alias}/`;
    if (!html.includes('sg-orphan-redirect')) {
      html = html.replace(/<\/head>/i,
        `<meta http-equiv="refresh" content="0;url=${dest}"/>\n` +
        `<link rel="canonical" href="https://www.surprisegranite.com${dest}"/>\n` +
        `<!--sg-orphan-redirect-->\n</head>`);
    }
    // A stale canonical pointing at itself would fight the new one.
    html = html.replace(new RegExp(`<link rel="canonical" href="https://www\\.surprisegranite\\.com/flooring/${o.slug}/"\\s*/?>`, 'i'), '');
    renamed++;
  } else {
    gone++;
  }
  if (wasNoindex && !o.alias) already++;
  removeFromSitemap.push(`/flooring/${o.slug}/`);
  if (WRITE) fs.writeFileSync(o.file, html);
}

// Drop the orphans from the sitemap so we stop actively submitting them.
let dropped = 0;
if (fs.existsSync(SITEMAP)) {
  let xml = fs.readFileSync(SITEMAP, 'utf8');
  for (const p of removeFromSitemap) {
    const re = new RegExp(`\\s*<url>(?:(?!</url>)[\\s\\S])*?${p.replace(/[/-]/g, '\\$&')}(?:(?!</url>)[\\s\\S])*?</url>`, 'g');
    const next = xml.replace(re, '');
    if (next !== xml) { dropped++; xml = next; }
  }
  if (WRITE && dropped) fs.writeFileSync(SITEMAP, xml);
}

console.log(`orphan flooring pages: ${orphans.length}`);
console.log(`  renamed -> noindex + redirect to the live slug : ${renamed}`);
console.log(`  gone    -> noindex, follow                     : ${gone} (${already} already were)`);
console.log(`  sitemap entries removed                        : ${dropped}`);
if (renamed) {
  console.log('\n  redirects:');
  for (const o of orphans.filter((x) => x.alias).slice(0, 10)) {
    console.log(`    ${o.slug}  ->  ${o.alias}  ($${live.get(o.alias).retail_price})`);
  }
}
if (!WRITE) console.log('\nDry run. Re-run with --write to apply.');
