#!/usr/bin/env node
/**
 * Repoint dead slab images to the vendor's own product photo.
 *
 * Targets active slab products whose primary_image_url is a dead host
 * (squarespace-cdn leftovers on the Hanstone rows, cdn.shopify.com from the
 * closed Shopify store). Finds the color's page via the vendor sitemap and
 * takes its og:image. Rows updated get specs.image_source = 'vendor-site'.
 *
 * Usage: node scripts/fix-broken-slab-images.js [--write]
 */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', 'api', '.env') });
const { createClient } = require('@supabase/supabase-js');

const supa = createClient('https://ypeypgwsycxcagncgdur.supabase.co', process.env.SUPABASE_SERVICE_KEY);
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36';

const SITEMAPS = {
  'hanstone': ['https://hanstone.ca/sitemap.xml'],
  'msi': ['https://www.msisurfaces.com/sitemap.xml'],
  'cosentino': ['https://www.cosentino.com/page-sitemap1.xml', 'https://www.cosentino.com/page-sitemap2.xml'],
  'silestone': ['https://www.cosentino.com/page-sitemap1.xml', 'https://www.cosentino.com/page-sitemap2.xml'],
  'pentalquartz': ['https://arcsurfaces.com/sitemap.xml', 'https://arcsurfaces.com/sitemap_index.xml'],
};
const DEAD_HOST = /squarespace|cdn\.shopify\.com/;

const slugify = (s) => String(s || '').toLowerCase()
  .replace(/\b(polished|honed|leathered|leather|matte|brushed|suede|satin|quartz|quartzite|granite|marble|dekton|slab)\b/g, ' ')
  .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

async function get(url) {
  const res = await fetch(url, { headers: { 'User-Agent': UA }, redirect: 'follow', signal: AbortSignal.timeout(25000) });
  if (!res.ok) throw new Error('HTTP ' + res.status);
  return res.text();
}

async function sitemapUrls(entry) {
  const out = []; const queue = [...entry];
  while (queue.length) {
    const u = queue.shift();
    let xml; try { xml = await get(u); } catch { continue; }
    for (const m of xml.matchAll(/<loc>([^<]+)<\/loc>/g)) {
      const l = m[1];
      if (/\.xml$/.test(l) && !/post-sitemap/.test(l)) queue.push(l);
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
    || null;
}

(async () => {
  const write = process.argv.includes('--write');
  let rows = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supa.from('catalog_products').select('id,name,vendor_id,primary_image_url,image_urls,specs')
      .eq('category', 'slab').eq('active', true).order('id').range(from, from + 999);
    if (error) throw error;
    rows = rows.concat(data || []); if (data.length < 1000) break;
  }
  const broken = rows.filter((r) => DEAD_HOST.test(r.primary_image_url || '') && SITEMAPS[r.vendor_id]);
  const byVendor = {};
  for (const r of broken) (byVendor[r.vendor_id] = byVendor[r.vendor_id] || []).push(r);
  console.log('broken images with scrapable vendor:', broken.length, Object.fromEntries(Object.entries(byVendor).map(([v, l]) => [v, l.length])));

  let updated = 0; const misses = [];
  for (const [vendor, list] of Object.entries(byVendor)) {
    const urls = await sitemapUrls(SITEMAPS[vendor]);
    console.log(`── ${vendor}: ${urls.length} sitemap urls`);
    for (const p of list) {
      const url = matchUrl(urls, p.name);
      if (!url) { misses.push(`${vendor}:${p.name} (no page)`); continue; }
      try {
        const html = await get(url);
        let img = html.match(/<meta\s+property="og:image"\s+content="([^"]+)"/i)?.[1]
          || html.match(/<meta\s+content="([^"]+)"\s+property="og:image"/i)?.[1];
        // hanstone.ca wraps the real slab photo in a social-card generator URL
        // (…/api/og-page?title=X&image=<real-url>) — unwrap it
        if (img && /\/api\/og-page\?/.test(img)) {
          img = decodeURIComponent(img.replace(/&amp;/g, '&').match(/[?&]image=([^&]+)/)?.[1] || '');
        }
        if (!img || !/^https?:/.test(img)) { misses.push(`${vendor}:${p.name} (no og:image)`); continue; }
        console.log(`   ✓ ${p.name} ← ${img.slice(0, 90)}`);
        if (write) {
          const { error } = await supa.from('catalog_products').update({
            primary_image_url: img, image_urls: [img],
            specs: { ...(p.specs || {}), image_source: 'vendor-site', image_source_url: url },
            updated_at: new Date().toISOString(),
          }).eq('id', p.id);
          if (error) { misses.push(`${vendor}:${p.name} (db: ${error.message})`); continue; }
        }
        updated++;
      } catch (e) { misses.push(`${vendor}:${p.name} (${e.message})`); }
      await new Promise((r) => setTimeout(r, 400));
    }
  }
  console.log(`${write ? 'WROTE' : 'DRY RUN (add --write)'} — fixed: ${updated}, misses: ${misses.length}`);
  for (const m of misses) console.log('  miss:', m);
  process.exit(0);
})().catch((e) => { console.error('FATAL', e); process.exit(1); });
