#!/usr/bin/env node
/**
 * inject-remnant-inventory.js — put the remnant inventory on /marketplace/remnants/
 * as crawlable text.
 *
 * WHY. The page is a JS grid: it renders 586 remnants from /api/catalog?category=remnant
 * at runtime and ships ZERO of them in the HTML. Googlebot sees 64 lines of boilerplate
 * and no product content, so ~$400k of priced, pictured, in-stock stone — the highest
 * local-intent inventory the business has ("black galaxy remnant phoenix") — is
 * invisible. Every other JS-grid browse page was fixed by inject-browse-links.js, but
 * that script builds links from a category sitemap and reads each detail page's <h1>.
 * Remnants have neither: no per-item pages, no sitemap.
 *
 * So this injects the inventory ITSELF rather than links to pages that don't exist.
 * No per-item URLs are created on purpose — remnants sell and the hourly Yard sync drops
 * them, so a page per remnant would be a 404 farm. A browse page that lists what is in
 * the yard today goes stale gracefully; a URL that dies does not.
 *
 *   node scripts/inject-remnant-inventory.js [--write]
 *
 * Idempotent: replaces anything between the markers. Safe to run from the hourly sync —
 * that is the point, it keeps the crawlable copy current.
 */
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const API = 'https://surprise-granite-email-api.onrender.com';
const PAGE = path.join(ROOT, 'marketplace', 'remnants', 'index.html');
const START = '<!--remnant-inventory-->';
const END = '<!--/remnant-inventory-->';
const WRITE = process.argv.includes('--write');

const esc = s => String(s == null ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const money = n => Number(n).toLocaleString('en-US', { maximumFractionDigits: 0 });

function fetchRemnants() {
  const out = [];
  for (let off = 0; off < 4000; off += 250) {
    const raw = execFileSync('curl', ['-s', '--max-time', '60',
      `${API}/api/catalog?category=remnant&limit=250&offset=${off}`], { maxBuffer: 1 << 26 }).toString();
    let ps;
    try { ps = JSON.parse(raw).products || []; } catch (e) { break; }
    if (!ps.length) break;
    out.push(...ps);
    if (ps.length < 250) break;
  }
  return out;
}

const rows = fetchRemnants();
if (rows.length < 20) {
  // A half-empty API response would otherwise publish a page claiming the yard is
  // nearly bare. Leave the previous block in place and fail loudly instead.
  console.error(`only ${rows.length} remnants returned — refusing to overwrite the page. Nothing written.`);
  process.exit(1);
}

// Group by stone type: that is how people search ("quartzite remnant", "granite remnant
// near me"), and it gives the section real headings instead of one undifferentiated list.
const byMaterial = new Map();
for (const p of rows) {
  const m = (p.subcategory || 'Stone').trim();
  if (!byMaterial.has(m)) byMaterial.set(m, []);
  byMaterial.get(m).push(p);
}
const materials = [...byMaterial.entries()].sort((a, b) => b[1].length - a[1].length);

const sections = materials.map(([mat, items]) => {
  items.sort((a, b) => String(a.name).localeCompare(String(b.name)));
  const li = items.map((p) => {
    const size = p.size ? ` · ${esc(p.size)}` : '';
    const price = p.retail_price ? ` · from $${money(p.retail_price)}` : '';
    return `<li>${esc(p.name)}${size}${price}</li>`;
  }).join('');
  return `<h3>${esc(mat)} remnants <span class="rem-count">(${items.length} in the yard)</span></h3>\n<ul class="rem-list">${li}</ul>`;
}).join('\n');

const total = rows.length;
const matLine = materials.map(([m, i]) => `${i.length} ${m.toLowerCase()}`).join(', ');

const block = `${START}
<section class="rem-seo" aria-labelledby="rem-seo-h">
  <h2 id="rem-seo-h">What's in the yard right now</h2>
  <p><strong>${total} stone remnants</strong> in stock today — ${esc(matLine)}. Remnants are
  offcuts from full slabs: one-of-a-kind pieces, already paid for, priced to move. They suit a
  vanity, an island, a laundry or a bar top, and they are the cheapest way to get real stone
  into a small space.</p>
  <p>Prices shown are the starting price for the piece. We fabricate and install across the
  Phoenix metro — Surprise, Peoria, Glendale, Scottsdale, Phoenix, Goodyear, Avondale, Buckeye
  and Sun City. <a href="/get-a-free-estimate/">Book a free measure</a> or call
  <a href="tel:+16028333189">(602) 833-3189</a> and we will hold the piece for you.</p>
  ${sections}
  <p class="rem-note">Remnant stock changes daily — pieces sell and new offcuts arrive as we
  fabricate. If something here is gone by the time you call, we will show you the closest
  match in the yard.</p>
</section>
<style>
  .rem-seo{max-width:1200px;margin:36px auto 8px;padding:24px 18px 4px;border-top:1px solid rgba(128,128,128,.25);font-size:15px;line-height:1.65}
  .rem-seo h2{font-size:1.35rem;font-weight:800;margin:0 0 12px}
  .rem-seo h3{font-size:1rem;font-weight:800;margin:24px 0 8px}
  .rem-seo p{margin:0 0 12px;max-width:75ch;opacity:.9}
  .rem-count{font-weight:600;opacity:.6}
  .rem-list{list-style:none;padding:0;margin:0;display:grid;gap:4px 22px;grid-template-columns:repeat(auto-fill,minmax(280px,1fr))}
  .rem-list li{font-size:13.5px;opacity:.85;padding:2px 0}
  .rem-note{margin-top:22px;font-size:13.5px;opacity:.7}
</style>
${END}`;

let html = fs.readFileSync(PAGE, 'utf8');
const had = html.includes(START);
if (had) {
  html = html.replace(new RegExp(`${START}[\\s\\S]*?${END}`), block);
} else {
  // Below the grid, above the cross-sell strip, so it reads as supporting copy rather
  // than pushing the actual product grid down the page.
  const anchor = html.includes('<!--cross-sell-->') ? '<!--cross-sell-->' : '<footer';
  html = html.replace(anchor, `${block}\n${anchor}`);
}

console.log(`${total} remnants across ${materials.length} materials`);
for (const [m, i] of materials) console.log(`  ${m.padEnd(14)} ${i.length}`);
console.log(`\n${had ? 'refreshed' : 'inserted'} block — ${Buffer.byteLength(block)} bytes of crawlable copy`);
if (!WRITE) { console.log('DRY RUN — re-run with --write to apply.'); process.exit(0); }
fs.writeFileSync(PAGE, html);
console.log(`wrote ${path.relative(ROOT, PAGE)}`);
