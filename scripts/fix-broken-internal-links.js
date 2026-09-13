#!/usr/bin/env node
/**
 * fix-broken-internal-links.js — repoint internal links that 404.
 *
 * WHY. A site-wide link audit on 2026-09-13 found 225 internal href targets with no
 * page behind them, across 1,982 link instances. Every one is crawl budget spent on
 * a 404 and a dead end for a real visitor — and on a site whose biggest GSC bucket
 * is "Crawled – currently not indexed", wasted crawl is the expensive kind of bug.
 *
 * The worst single case: /countertops/glisten/ was linked from 967 pages by the
 * "More <material> colors" strip. The colour exists — its page is written as
 * glisten-quartz — so the strip was pointing a thousand links at nothing. The root
 * cause is fixed in build-countertop-pages.js (related() now only links slugs in
 * renderSet); this repairs the pages already on disk.
 *
 *   node scripts/fix-broken-internal-links.js [--write]
 *
 * ⚠️ EVERY TARGET BELOW WAS VERIFIED 200 ON THE LIVE SITE before being added, and
 * every SOURCE was verified 404. Do not add a pair here from a filesystem check
 * alone: Cloudflare serves edge redirects this repo cannot see, so several paths
 * that look broken on disk (/tools/virtual-kitchen-design-tool, and the other two
 * visualizer aliases) actually resolve 200 to /tools/visualizer/ and must be left
 * exactly as they are. Curl the source AND the target first.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const WRITE = process.argv.includes('--write');

// broken source -> verified live target. Ordered longest-first so a prefix never
// eats a longer match.
const REDIRECTS = [
  ['/countertops/glisten/', '/countertops/glisten-quartz/'],  // 967 links, "More Quartz colors"
  ['/account//activity/dashboard', '/account/'],              // 88, a double slash in the nav template
  ['/company/about', '/company/about-us/'],                   // 196, page is at about-us
  ['/quote/', '/get-a-free-estimate/'],                       // 36
  ['/privacy/', '/legal/privacy-policy/'],                    // 22
  ['/terms/', '/legal/terms-of-use/'],                        // 10
].sort((a, b) => b[0].length - a[0].length);

const SKIP = new Set(['node_modules', '.git', 'migrated', 'images', 'assets', 'data']);
function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name.startsWith('.')) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) { if (!SKIP.has(e.name)) walk(p, out); }
    else if (e.name.endsWith('.html')) out.push(p);
  }
  return out;
}

const tally = new Map(REDIRECTS.map(([f]) => [f, 0]));
let pagesChanged = 0;

for (const file of walk(ROOT)) {
  let html = fs.readFileSync(file, 'utf8');
  const before = html;
  for (const [from, to] of REDIRECTS) {
    // Only inside href="…", and only an exact target — never a substring of a
    // longer path, which would turn /quote/builder/ into /get-a-free-estimate/builder/.
    const re = new RegExp(`href="${from.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"`, 'g');
    const n = (html.match(re) || []).length;
    if (n) { tally.set(from, tally.get(from) + n); html = html.replace(re, `href="${to}"`); }
  }
  if (html !== before) { pagesChanged++; if (WRITE) fs.writeFileSync(file, html); }
}

let total = 0;
for (const [from, to] of REDIRECTS) {
  const n = tally.get(from);
  total += n;
  console.log(`  ${String(n).padStart(5)}  ${from}  ->  ${to}`);
}
console.log(`\n${total} link(s) repaired across ${pagesChanged} page(s)`);
if (!WRITE) console.log('DRY RUN — re-run with --write to apply.');
