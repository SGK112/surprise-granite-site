#!/usr/bin/env node
/**
 * Trust-but-verify the discontinued list against vendors' PUBLIC sites.
 *
 * Strategy: fetch each vendor's public list of live colors ONCE (their product
 * sitemap, or the colors page HTML), then check whether each color we call
 * discontinued still appears. Present on the vendor's live site => NOT
 * discontinued (a false positive to un-flag). Absent => confirmed gone.
 *
 * Public sources that work by plain fetch (measured 2026-07):
 *   Arizona Tile   product-sitemap.xml        (/products/.../<slug>/)
 *   Caesarstone    catalog-sitemap.xml         (/countertops/<code>-<slug>/)
 *   Bolder Image   products-sitemap.xml        (/products/<slug>/)
 *   Hanstone       hanstoneusa.com/colors/     (names in the HTML)
 *
 * Cosentino (Silestone/Dekton/Sensa) and MSI are country-routed JS SPAs whose
 * colors aren't in a fetchable sitemap — marked needs-browser (route via the
 * vendor-sync browser agent). Never writes the catalog; emits a review report.
 *
 * Usage: NODE_PATH=api/node_modules node scripts/verify-discontinued.js
 */
const path = require('path');
const fs = require('fs');
require('dotenv').config({ path: path.join(__dirname, '..', 'api', '.env') });
const { createClient } = require('@supabase/supabase-js');

const supa = createClient('https://ypeypgwsycxcagncgdur.supabase.co', process.env.SUPABASE_SERVICE_KEY);
const OUT = path.join(__dirname, '..', 'data', 'discontinued-review.json');
const UA = { headers: { 'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36' } };

const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
// Vendor pages name a color by its base, without the material word we append.
const colorSlug = (name) => String(name || '').toLowerCase()
  .replace(/\b(quartz|granite|marble|quartzite|dekton|porcelain|soapstone|sensa|silestone)\b/g, '')
  .trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

async function fetchText(url) {
  const c = new AbortController();
  const t = setTimeout(() => c.abort(), 20000);
  try {
    const r = await fetch(url, { ...UA, redirect: 'follow', signal: c.signal });
    clearTimeout(t);
    return r.ok ? await r.text() : '';
  } catch { clearTimeout(t); return ''; }
}
const locsFrom = (xml) => (xml.match(/<loc>([^<]+)<\/loc>/g) || []).map((m) => m.replace(/<\/?loc>/g, ''));
const lastSeg = (u) => u.replace(/^https?:\/\/[^/]+/, '').split('/').filter(Boolean).pop() || '';

// Build a Set of live color slugs (or raw HTML) per vendor, fetched once.
async function buildVendorSource(kind, urls) {
  if (kind === 'html') return { kind, html: (await fetchText(urls[0])).toLowerCase() };
  let slugs = new Set();
  for (const u of urls) {
    for (const loc of locsFrom(await fetchText(u))) {
      const seg = lastSeg(loc);
      if (!seg || seg === 'products' || seg === 'countertops') continue;
      slugs.add(seg);
      slugs.add(seg.replace(/^\d+-/, '')); // Caesarstone strips a numeric code prefix
    }
  }
  return { kind, slugs };
}

const VENDORS = {
  'arizona tile': { kind: 'sitemap', urls: ['https://www.arizonatile.com/product-sitemap.xml'] },
  'caesarstone': { kind: 'sitemap', urls: ['https://www.caesarstoneus.com/catalog-sitemap.xml'] },
  'bolder image stone': { kind: 'sitemap', urls: ['https://bolderimagestone.com/products-sitemap.xml'] },
  'hanstone quartz': { kind: 'html', urls: ['https://hanstoneusa.com/colors/'] },
};
function vendorKey(brand) {
  const b = String(brand || '').toLowerCase();
  if (b.includes('arizona tile')) return 'arizona tile';
  if (b.includes('caesarstone')) return 'caesarstone';
  if (b.includes('bolder')) return 'bolder image stone';
  if (b.includes('hanstone')) return 'hanstone quartz';
  return null; // cosentino, msi -> needs browser
}

(async () => {
  let active = [];
  for (let f = 0; ; f += 1000) { const { data } = await supa.from('catalog_products').select('name, slug').eq('category', 'slab').eq('active', true).order('id').range(f, f + 999); active = active.concat(data); if (data.length < 1000) break; }
  const activeNames = new Set(active.filter((r) => !/-sample$/.test(r.slug)).map((r) => norm(r.name)));

  let rows = [];
  for (let f = 0; ; f += 1000) { const { data } = await supa.from('catalog_products').select('slug, name, subcategory, brand, vendor_id').eq('category', 'slab').eq('specs->>discontinued', 'true').order('name').range(f, f + 999); rows = rows.concat(data); if (data.length < 1000) break; }
  const byColor = new Map();
  for (const r of rows) { const k = norm(r.name); if (!byColor.has(k)) byColor.set(k, r); }
  const list = [...byColor.values()].filter((r) => !activeNames.has(norm(r.name)));

  // Fetch each needed vendor source once.
  const needed = [...new Set(list.map((r) => vendorKey(r.brand)).filter(Boolean))];
  const sources = {};
  for (const key of needed) { console.log('fetching live colors:', key); sources[key] = await buildVendorSource(VENDORS[key].kind, VENDORS[key].urls); }

  const results = list.map((r) => {
    const key = vendorKey(r.brand);
    if (!key || !sources[key]) return { name: r.name, slug: r.slug, brand: r.brand, verdict: 'needs-browser' };
    const src = sources[key];
    const cs = colorSlug(r.name);
    let listed;
    if (src.kind === 'html') listed = src.html.includes(cs.replace(/-/g, ' ')) || src.html.includes(cs.replace(/-/g, ''));
    else listed = src.slugs.has(cs);
    return { name: r.name, slug: r.slug, brand: r.brand, verdict: listed ? 'still-listed' : 'gone' };
  });

  const tally = {};
  results.forEach((r) => { tally[r.verdict] = (tally[r.verdict] || 0) + 1; });
  console.log('\n=== discontinued verification (public sites) ===');
  console.log('checked:', results.length, JSON.stringify(tally));

  const falsePos = results.filter((r) => r.verdict === 'still-listed');
  console.log('\nSTILL LISTED on vendor public site — likely NOT discontinued (' + falsePos.length + '):');
  falsePos.forEach((r) => console.log('  ', r.name, '(' + r.brand + ')'));

  const nb = {};
  results.filter((r) => r.verdict === 'needs-browser').forEach((r) => { nb[r.brand] = (nb[r.brand] || 0) + 1; });
  console.log('\nstill needs browser-agent (JS SPA vendors):', JSON.stringify(nb));

  fs.writeFileSync(OUT, JSON.stringify({ tally, results }, null, 1));
  console.log('\nwrote', OUT);
  process.exit(0);
})().catch((e) => { console.error('FATAL', e.message); process.exit(1); });
