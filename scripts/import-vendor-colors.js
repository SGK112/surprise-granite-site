#!/usr/bin/env node
/**
 * "If the vendor has the color, we have the color."
 *
 * Imports every color on a vendor's CURRENT site into catalog_products:
 *  - existing row (matched by vendor + normalized name) -> enrich only
 *    (image if missing/dead, description if empty, sample $/sqft if priced)
 *  - no row -> CREATE one: vendor image, vendor description, sample price
 *    from the cost library ($/sqft) when the price list has the color,
 *    else the $12.99 default until its list is learned.
 * Never deactivates anything.
 *
 * Usage: NODE_PATH=api/node_modules node scripts/import-vendor-colors.js [--write] [vendor ...]
 * Vendors: msi | arizona-tile | caesarstone | pentalquartz
 * (cosentino runs via the headless importer; daltile/bolder pending an image source)
 */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', 'api', '.env') });
require('dotenv').config({ path: '/Users/homepc/voiceNow-crm/.env' });
const { createClient } = require('@supabase/supabase-js');
const { MongoClient } = require('mongodb');

const supa = createClient('https://ypeypgwsycxcagncgdur.supabase.co', process.env.SUPABASE_SERVICE_KEY);
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36';
const WRITE = process.argv.includes('--write');
const ONLY = process.argv.slice(2).filter((a) => a !== '--write');

const CONFIG = {
  'msi': {
    brand: 'MSI Surfaces', lib: 'MSI',
    sitemaps: ['https://www.msisurfaces.com/sitemap.xml'],
    keep: /msisurfaces\.com\/(quartz-countertops|products\/natural-stone-collections\/(granite|marble|quartzite|travertine|onyx|dolomite|soapstone))\/[a-z0-9-]+\/$/,
    material: (u) => /quartz-countertops/.test(u) ? 'Quartz' : (u.match(/natural-stone-collections\/([a-z]+)\//)?.[1] || 'stone').replace(/^./, (c) => c.toUpperCase()),
  },
  'arizona-tile': {
    brand: 'Arizona Tile', lib: 'Arizona Tile',
    sitemaps: ['https://www.arizonatile.com/product-sitemap.xml'],
    keep: /\/products\/(slab|outer-limits)\/[a-z0-9-]+(\/[a-z0-9-]+)+\/$/,
    material: (u) => (u.match(/\/products\/(?:slab|outer-limits)\/([a-z-]+)\//)?.[1] || 'stone').split('-')[0].replace(/^./, (c) => c.toUpperCase()),
  },
  'caesarstone': {
    brand: 'Caesarstone', lib: null,
    sitemaps: ['https://www.caesarstoneus.com/catalog-sitemap.xml'],
    keep: /\/countertops\/[a-z0-9-]+\/$/,
    material: () => 'Quartz',
  },
  'pentalquartz': {
    brand: 'PentalQuartz', lib: 'Architectural Surfaces (ASG)',
    sitemaps: ['https://arcsurfaces.com/sitemap.xml', 'https://arcsurfaces.com/sitemap_index.xml'],
    keep: /arcsurfaces\.com\/(quartz\/pentalquartz|final-editions\/pentalquartz)\/[a-z0-9-]+\/$/,
    material: () => 'Quartz',
  },
};

const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
const baseName = (s) => String(s || '')
  .replace(/\(aka:[^)]*\)|\([^)]*\)/gi, ' ')
  .replace(/\b\d+(?:\.\d+)?\s*cm\b/gi, ' ')
  .replace(/\bjumbo\s*\d+x\d+\b/gi, ' ')
  .replace(/\b(polished|honed|leathered|leather|caressed|brushed|matte|lava|dual|suede|satin|1st choice|finish|slabs?)\b/gi, ' ')
  .replace(/\b(quartzite|quartz|granite|marble|porcelain|dekton|soapstone|travertine|dolomite|scalea|sensa by cosentino|sensa)\b/gi, ' ')
  .trim();
const titleCase = (s) => s.toLowerCase().replace(/\b[a-z]/g, (c) => c.toUpperCase());

async function get(url) {
  const res = await fetch(url, { headers: { 'User-Agent': UA }, redirect: 'follow', signal: AbortSignal.timeout(25000) });
  if (!res.ok) throw new Error('HTTP ' + res.status);
  return res.text();
}
async function sitemapUrls(entries, keep) {
  const out = []; const queue = [...entries]; const seen = new Set();
  while (queue.length) {
    const u = queue.shift();
    if (seen.has(u)) continue; seen.add(u);
    let xml; try { xml = await get(u); } catch { continue; }
    for (const m of xml.matchAll(/<loc>([^<]+)<\/loc>/g)) {
      const l = m[1];
      if (/\.xml$/.test(l)) { if (!/post-sitemap|blog/.test(l)) queue.push(l); }
      else if (keep.test(l)) out.push(l);
    }
  }
  return [...new Set(out)];
}
function extract(html) {
  const meta = (rx) => html.match(rx)?.[1] || '';
  let desc = meta(/<meta\s+property="og:description"\s+content="([^"]+)"/i) || meta(/<meta\s+name="description"\s+content="([^"]+)"/i);
  if (/^new releases/i.test(desc)) desc = '';
  if (!desc || desc.length < 60) {
    for (const m of html.matchAll(/<script[^>]*application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)) {
      try {
        const walk = (o) => { if (!o || typeof o !== 'object') return null; if (typeof o.description === 'string' && o.description.length >= 80) return o.description; for (const v of Object.values(o)) { const r = walk(v); if (r) return r; } return null; };
        const d = walk(JSON.parse(m[1]));
        if (d) { desc = d; break; }
      } catch { /* skip */ }
    }
  }
  desc = String(desc).replace(/&amp;/g, '&').replace(/&#x0*27;|&#0?39;|&rsquo;/gi, "'").replace(/&[a-z]+;|&#x?[0-9a-f]+;/gi, ' ').replace(/\s+/g, ' ').trim().slice(0, 600);
  const img = meta(/<meta\s+property="og:image"\s+content="([^"]+)"/i) || meta(/<meta\s+content="([^"]+)"\s+property="og:image"/i);
  let title = meta(/<meta\s+property="og:title"\s+content="([^"]+)"/i) || (html.match(/<title>([^<]+)<\/title>/i)?.[1] || '');
  title = title.split(/\s*[|–—-]\s*(?=MSI|Arizona|Caesarstone|Architectural|Arc |Premium|Shop|Buy)/i)[0].trim();
  return { desc: desc.length >= 60 ? desc : '', img: /^https?:/.test(img) ? img : '', title };
}
const nameFromUrl = (u) => titleCase(u.replace(/\/+$/, '').split('/').pop()
  .replace(/^dt-|^\d+-/, '').replace(/-quartz$/, '').replace(/-/g, ' ').trim());

(async () => {
  const mongo = new MongoClient(process.env.MONGODB_URI); await mongo.connect();
  const lil = await mongo.db('voiceflow-crm').collection('lineitemlibraries')
    .find({ unit: 'sqft', cost: { $gt: 0 } }, { projection: { name: 1, cost: 1, vendor: 1 } }).toArray();
  await mongo.close();
  const priceIdx = new Map();
  for (const r of lil) {
    const k = r.vendor + '|' + norm(baseName(r.name));
    const prev = priceIdx.get(k);
    const thick3 = /\b3\s*cm\b/i.test(r.name);
    if (!prev || (thick3 && !prev.thick3)) priceIdx.set(k, { cost: Number(r.cost), thick3 });
  }

  let products = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supa.from('catalog_products')
      .select('id,name,vendor_id,slug,description,primary_image_url,image_urls,retail_price,vendor_cost,specs')
      .eq('category', 'slab').order('id').range(from, from + 999);
    if (error) throw error;
    products = products.concat(data || []); if (data.length < 1000) break;
  }
  const byKey = new Map();
  for (const p of products) byKey.set(p.vendor_id + '|' + norm(baseName(p.name)), p);
  const slugTaken = new Set(products.map((p) => p.slug).filter(Boolean));

  const DEAD = /squarespace|cdn\.shopify\.com/;
  for (const [vendor, cfg] of Object.entries(CONFIG)) {
    if (ONLY.length && !ONLY.includes(vendor)) continue;
    const urls = await sitemapUrls(cfg.sitemaps, cfg.keep);
    console.log(`\n== ${vendor}: ${urls.length} color pages on vendor site`);
    let created = 0, enriched = 0, skipped = 0, priced = 0;
    for (const u of urls) {
      const guessName = nameFromUrl(u);
      const key = vendor + '|' + norm(baseName(guessName));
      const existing = byKey.get(key);
      const needsCreate = !existing;
      const needsEnrich = existing && ((!existing.description || existing.description.length < 40)
        || !existing.primary_image_url || DEAD.test(existing.primary_image_url)
        || (existing.image_urls || []).filter(Boolean).length < 2);
      if (!needsCreate && !needsEnrich) { skipped++; continue; }
      let ex;
      try { ex = extract(await get(u)); } catch { continue; }
      if (!ex.img && needsCreate) continue; // no image, no card — don't create broken placeholders
      const price = cfg.lib ? priceIdx.get(cfg.lib + '|' + norm(baseName(guessName)))?.cost : null;
      if (needsCreate) {
        const name = guessName;
        let slug = (vendor + '-' + norm(baseName(name)).replace(/(.)/g, '$1')).toLowerCase();
        slug = (name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') + '-' + vendor).slice(0, 120);
        if (slugTaken.has(slug)) { skipped++; continue; }
        slugTaken.add(slug);
        const row = {
          vendor_id: vendor, brand: cfg.brand, category: 'slab', subcategory: cfg.material(u),
          sku: `import-${vendor}-${norm(baseName(name))}`.slice(0, 100),
          name, slug, description: ex.desc || '',
          primary_image_url: ex.img, image_urls: [ex.img],
          retail_price: price || 12.99, sample_price: price || 12.99, price_unit: 'each',
          vendor_cost: price || null, sample_eligible: true, in_stock: true, active: true,
          vendor_url: u, tags: ['vendor-import'],
          specs: { _source: 'vendor-site-import', imported_at: '2026-07-04', ...(price ? { sample_pricing: 'sqft-price', sqft_price: price } : {}) },
          currency: 'USD',
        };
        if (WRITE) {
          const { error } = await supa.from('catalog_products').insert(row);
          if (error) { skipped++; continue; }
        }
        created++; if (price) priced++;
      } else {
        const fields = { updated_at: new Date().toISOString() };
        const spec = { ...(existing.specs || {}) };
        if ((!existing.description || existing.description.length < 40) && ex.desc) { fields.description = ex.desc; spec.desc_source = 'vendor-site-meta'; }
        if ((!existing.primary_image_url || DEAD.test(existing.primary_image_url)) && ex.img) { fields.primary_image_url = ex.img; }
        const cur = (existing.image_urls || [existing.primary_image_url]).filter(Boolean);
        if (ex.img && cur.length < 2 && !cur.some((c) => c.split('?')[0] === ex.img.split('?')[0])) fields.image_urls = [...cur, ex.img].slice(0, 4);
        if (Object.keys(fields).length > 1) {
          fields.specs = spec;
          if (WRITE) await supa.from('catalog_products').update(fields).eq('id', existing.id);
          enriched++;
        } else skipped++;
      }
      await new Promise((r) => setTimeout(r, 350));
    }
    console.log(`   created: ${created} (${priced} with $/sqft sample price), enriched: ${enriched}, already complete/skipped: ${skipped}`);
  }
  console.log(WRITE ? '\nWROTE.' : '\nDRY RUN — add --write.');
  process.exit(0);
})().catch((e) => { console.error('FATAL', e); process.exit(1); });
