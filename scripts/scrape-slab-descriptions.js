#!/usr/bin/env node
/**
 * Backfill missing slab-color descriptions from the vendors' own product pages.
 *
 * For each active slab product whose description AND short_description are
 * empty/trivial (<40 chars), find the color's page on the vendor site (via the
 * vendor's sitemap, matched on a slugified color name) and copy its
 * meta/og:description into catalog_products.description. Rows updated get
 * specs.desc_source = 'vendor-site-meta'. Products with no page match are
 * left untouched and reported.
 *
 * Usage: node scripts/scrape-slab-descriptions.js [--write] [vendor ...]
 */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', 'api', '.env') });
const { createClient } = require('@supabase/supabase-js');

const supa = createClient('https://ypeypgwsycxcagncgdur.supabase.co', process.env.SUPABASE_SERVICE_KEY);
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36';

const SITEMAPS = {
  'msi': ['https://www.msisurfaces.com/sitemap.xml'],
  'arizona-tile': ['https://www.arizonatile.com/product-sitemap.xml'],
  'caesarstone': ['https://www.caesarstoneus.com/catalog-sitemap.xml'],
  'cosentino': ['https://www.cosentino.com/page-sitemap1.xml', 'https://www.cosentino.com/page-sitemap2.xml'],
  'silestone': ['https://www.cosentino.com/page-sitemap1.xml', 'https://www.cosentino.com/page-sitemap2.xml'],
  'pentalquartz': ['https://arcsurfaces.com/sitemap.xml', 'https://arcsurfaces.com/sitemap_index.xml'],
};

const slugify = (s) => String(s || '').toLowerCase()
  .replace(/\b(polished|honed|leathered|leather|matte|brushed|suede|satin|quartz|quartzite|granite|marble|dekton|slab)\b/g, ' ')
  .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

async function get(url) {
  const res = await fetch(url, { headers: { 'User-Agent': UA }, redirect: 'follow', signal: AbortSignal.timeout(25000) });
  if (!res.ok) throw new Error('HTTP ' + res.status);
  return res.text();
}

async function sitemapUrls(entry) {
  const out = [];
  const queue = [...entry];
  while (queue.length) {
    const u = queue.shift();
    let xml;
    try { xml = await get(u); } catch { continue; }
    const locs = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
    for (const l of locs) {
      if (/\.xml$/.test(l) && out.length + queue.length < 60000 && !/post-sitemap/.test(l)) queue.push(l);
      else if (!/\.xml$/.test(l)) out.push(l);
    }
  }
  return out;
}

function matchUrl(urls, name) {
  const slug = slugify(name);
  if (!slug) return null;
  const seg = (u) => u.replace(/\/+$/, '').split('/').pop().toLowerCase();
  return urls.find((u) => seg(u) === slug)
    || urls.find((u) => seg(u) === slug + '-quartz')
    || urls.find((u) => new RegExp('(^|-)' + slug.replace(/-/g, '\\-') + '(-|$)').test(seg(u)))
    || urls.find((u) => seg(u).includes(slug) && slug.length >= 8)
    || null;
}

function cleanText(raw) {
  const text = String(raw).replace(/&amp;/g, '&').replace(/&#x0*27;|&#0?39;|&rsquo;/gi, "'").replace(/&quot;|&#x0*22;/gi, '"').replace(/&[a-z]+;|&#x?[0-9a-f]+;/gi, ' ').replace(/\s+/g, ' ').trim();
  if (text.length >= 60 && text.length <= 600 && !/couldn't find|page not found|^new releases/i.test(text)) return text;
  return null;
}

function extractDescription(html) {
  for (const rx of [
    /<meta\s+property="og:description"\s+content="([^"]+)"/i,
    /<meta\s+name="description"\s+content="([^"]+)"/i,
    /<meta\s+content="([^"]+)"\s+name="description"/i,
  ]) {
    const m = html.match(rx);
    const text = m && cleanText(m[1]);
    if (text) return text;
  }
  // some vendors (Arizona Tile) put a shared boilerplate in the meta but the
  // real per-color prose in JSON-LD product data
  for (const m of html.matchAll(/<script[^>]*application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      const walk = (o) => {
        if (!o || typeof o !== 'object') return null;
        if (typeof o.description === 'string' && o.description.length >= 80) return o.description;
        for (const v of Object.values(o)) { const r = walk(v); if (r) return r; }
        return null;
      };
      const text = cleanText(walk(JSON.parse(m[1])) || '');
      if (text) return text;
    } catch { /* malformed block */ }
  }
  return null;
}

(async () => {
  const write = process.argv.includes('--write');
  const onlyVendors = process.argv.slice(2).filter((a) => a !== '--write');

  let products = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supa.from('catalog_products')
      .select('id,name,vendor_id,description,short_description,specs')
      .eq('category', 'slab').eq('active', true).order('id').range(from, from + 999);
    if (error) throw error;
    products = products.concat(data || []);
    if (data.length < 1000) break;
  }
  const missing = products.filter((p) =>
    (!p.description || p.description.trim().length < 40) &&
    (!p.short_description || p.short_description.trim().length < 40) &&
    SITEMAPS[p.vendor_id] &&
    (!onlyVendors.length || onlyVendors.includes(p.vendor_id)));

  const byVendor = {};
  for (const p of missing) (byVendor[p.vendor_id] = byVendor[p.vendor_id] || []).push(p);
  console.log('missing descriptions with a scrapable vendor:', missing.length,
    Object.fromEntries(Object.entries(byVendor).map(([v, l]) => [v, l.length])));

  const report = { updated: 0, noUrl: [], noDesc: [], failed: 0 };
  // a description reused across colors is site boilerplate, not color copy —
  // only the first product may keep it; later hits are treated as no-desc
  const seenDesc = new Set();
  for (const [vendor, list] of Object.entries(byVendor)) {
    console.log(`\n── ${vendor}: loading sitemap…`);
    const urls = await sitemapUrls(SITEMAPS[vendor]);
    console.log(`   ${urls.length} urls`);
    for (const p of list) {
      const url = matchUrl(urls, p.name);
      if (!url) { report.noUrl.push(`${vendor}:${p.name}`); continue; }
      try {
        const html = await get(url);
        const desc = extractDescription(html);
        if (!desc || seenDesc.has(desc)) { report.noDesc.push(`${vendor}:${p.name}`); continue; }
        seenDesc.add(desc);
        console.log(`   ✓ ${p.name} ← ${desc.slice(0, 90)}…`);
        if (write) {
          const { error } = await supa.from('catalog_products').update({
            description: desc,
            specs: { ...(p.specs || {}), desc_source: 'vendor-site-meta', desc_source_url: url },
            updated_at: new Date().toISOString(),
          }).eq('id', p.id);
          if (error) { report.failed++; continue; }
        }
        report.updated++;
      } catch { report.failed++; }
      await new Promise((r) => setTimeout(r, 500));
    }
  }
  console.log(`\n${write ? 'WROTE' : 'DRY RUN (add --write)'} — updated: ${report.updated}, no page match: ${report.noUrl.length}, page had no usable meta: ${report.noDesc.length}, fetch errors: ${report.failed}`);
  if (report.noUrl.length) console.log('no match:', report.noUrl.slice(0, 40).join(' | '));
  process.exit(0);
})().catch((e) => { console.error('FATAL', e); process.exit(1); });
