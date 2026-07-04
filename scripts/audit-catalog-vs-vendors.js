// Cross-vendor catalog scrub: is each of our slab colors still in the vendor's
// current lineup? Unmatched -> mark discontinued (specs + tag + in_stock=false,
// stays visible/active). Matched rows with <2 images also get the vendor page's
// og:image appended as a second image.
// Ground truth per vendor: the vendor site's product sitemap; for Bolder Image,
// their current wholesale price sheets (May 2026) in the CRM cost library.
require('dotenv').config({ path: '/Users/homepc/surprise-granite-site/api/.env' });
require('dotenv').config({ path: '/Users/homepc/voiceNow-crm/.env' });
const { createClient } = require('@supabase/supabase-js');
const { MongoClient, ObjectId } = require('mongodb');

const supa = createClient('https://ypeypgwsycxcagncgdur.supabase.co', process.env.SUPABASE_SERVICE_KEY);
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36';
const WRITE = process.argv.includes('--write');
const ONLY = process.argv.slice(2).filter((a) => a !== '--write');

const slugify = (s) => String(s || '').toLowerCase()
  .replace(/\(aka:[^)]*\)|\([^)]*\)/g, ' ')
  .replace(/\b(polished|honed|leathered|leather|matte|brushed|suede|satin|lava|caressed|dual|quartz|quartzite|granite|marble|dolomite|soapstone|travertine|dekton|porcelain|slab|1st choice|finish|\d+(\.\d+)?\s*cm|jumbo \d+x\d+)\b/g, ' ')
  .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
const digitless = (s) => s.replace(/-?\d+$/, '');

async function get(url) {
  const res = await fetch(url, { headers: { 'User-Agent': UA }, redirect: 'follow', signal: AbortSignal.timeout(25000) });
  if (!res.ok) throw new Error('HTTP ' + res.status);
  return res.text();
}
async function sitemapUrls(entries, keepRx) {
  const out = []; const queue = [...entries]; const seen = new Set();
  while (queue.length) {
    const u = queue.shift();
    if (seen.has(u)) continue; seen.add(u);
    let xml; try { xml = await get(u); } catch { continue; }
    for (const m of xml.matchAll(/<loc>([^<]+)<\/loc>/g)) {
      const l = m[1];
      if (/\.xml$/.test(l)) { if (!/post-sitemap|blog/.test(l)) queue.push(l); }
      else if (!keepRx || keepRx.test(l)) out.push(l);
    }
  }
  return [...new Set(out)];
}
// candidate segments a color could live under
const segsOf = (u) => {
  const parts = u.replace(/\/+$/, '').split('/');
  return [parts.pop() || '', parts.pop() || ''];
};
function buildIndex(urls) {
  const idx = new Map(); // normalized segment -> url
  for (const u of urls) {
    for (let seg of segsOf(u)) {
      seg = seg.toLowerCase().replace(/-quartz$|-granite$|-marble$|-quartzite$/, '').replace(/^dt-/, '').replace(/^\d+-/, '').replace(/-+$/, '');
      if (seg && !idx.has(seg)) idx.set(seg, u);
    }
  }
  return idx;
}
function matchIn(idx, name) {
  const s = slugify(name);
  if (!s) return null;
  if (idx.has(s)) return idx.get(s);
  const dl = digitless(s);
  for (const [seg, u] of idx) if (digitless(seg) === dl) return u;
  for (const [seg, u] of idx) if ((s.length >= 5 && seg.startsWith(s + '-')) || (seg.length >= 5 && s.startsWith(seg + '-'))) return u;
  return null;
}

const CONFIG = {
  'msi': { sitemaps: ['https://www.msisurfaces.com/sitemap.xml'], keep: /\/(quartz-countertops|products\/natural-stone-collections)\/[^/]+/ },
  'arizona-tile': { sitemaps: ['https://www.arizonatile.com/product-sitemap.xml'], keep: null },
  'caesarstone': { sitemaps: ['https://www.caesarstoneus.com/catalog-sitemap.xml'], keep: null },
  'pentalquartz': { sitemaps: ['https://arcsurfaces.com/sitemap.xml', 'https://arcsurfaces.com/sitemap_index.xml'], keep: /\/(quartz|granite|marble|quartzite|dolomite|soapstone|final-editions|pq-collection)\// },
  'hanstone': { sitemaps: ['https://hanstone.ca/sitemap.xml'], keep: /colou?rs/ , note: 'hanstone.ca (CA lineup) + ESI price book' },
  'classic-surfaces': { sitemaps: ['https://www.classic-surfaces.com/sitemap.xml'], keep: null },
  'bolder-image-stone': { library: 'Bolder Image Stone' },
};

(async () => {
  const mongo = new MongoClient(process.env.MONGODB_URI); await mongo.connect();
  const lil = mongo.db('voiceflow-crm').collection('lineitemlibraries');
  const userId = new ObjectId('6913b021776947444de0638e');

  let rows = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supa.from('catalog_products')
      .select('id,name,vendor_id,subcategory,primary_image_url,image_urls,specs,tags')
      .eq('category', 'slab').eq('active', true).order('id').range(from, from + 999);
    if (error) throw error;
    rows = rows.concat(data || []); if (data.length < 1000) break;
  }

  const summary = {};
  for (const [vendor, cfg] of Object.entries(CONFIG)) {
    if (ONLY.length && !ONLY.includes(vendor)) continue;
    const mine = rows.filter((r) => r.vendor_id === vendor);
    if (!mine.length) continue;

    let idx;
    if (cfg.library) {
      const names = await lil.find({ userId, vendor: cfg.library, unit: 'sqft' }).project({ name: 1 }).toArray();
      idx = new Map();
      for (const n of names) { const s = slugify(n.name); if (s && !idx.has(s)) idx.set(s, 'pricebook:' + n.name); }
    } else {
      let urls = await sitemapUrls(cfg.sitemaps, cfg.keep);
      // hanstone: the CA site misses US-only colors — union with the ESI book names
      if (vendor === 'hanstone') {
        const esi = await lil.find({ userId, vendor: 'ESI', unit: 'sqft' }).project({ name: 1 }).toArray();
        urls = urls.concat(esi.map((e) => 'pricebook://esi/' + slugify(e.name)));
      }
      idx = buildIndex(urls);
    }

    const matched = [], gone = [];
    for (const r of mine) (matchIn(idx, r.name) ? matched : gone).push(r);

    // MSI's sitemap is partial (Screaming Frog export) — before declaring a
    // color discontinued, probe its constructed URL and check for the site's
    // soft-404 marker. A live page rescues the color into `matched`.
    if (vendor === 'msi' && gone.length) {
      const rescue = [];
      for (const r of [...gone]) {
        const s = slugify(r.name);
        const isQuartz = /quartz/i.test(r.subcategory || 'quartz') && !/quartzite/i.test(r.subcategory || '');
        const candidates = isQuartz
          ? [`https://www.msisurfaces.com/quartz-countertops/${s}-quartz/`, `https://www.msisurfaces.com/quartz-countertops/${s}/`]
          : ['granite', 'marble', 'quartzite', 'travertine', 'onyx', 'dolomite'].map((t) => `https://www.msisurfaces.com/products/natural-stone-collections/${t}/${s}/`);
        for (const u of candidates) {
          try {
            const html = await get(u);
            if (!/couldn't find the page|page not found/i.test(html)) { idx.set(s, u); rescue.push(r); break; }
          } catch { /* 404 */ }
          await new Promise((x) => setTimeout(x, 250));
        }
      }
      for (const r of rescue) { gone.splice(gone.indexOf(r), 1); matched.push(r); }
      console.log(`   msi probe rescued ${rescue.length} colors the sitemap missed`);
    }
    summary[vendor] = { ours: mine.length, current: idx.size, matched: matched.length, discontinued: gone.map((g) => g.name) };
    console.log(`\n== ${vendor}: ours=${mine.length} vendorList=${idx.size} matched=${matched.length} discontinued=${gone.length}`);
    for (const g of gone) console.log('   discontinued:', g.name);

    if (WRITE) {
      for (const g of gone) {
        const tags = Array.from(new Set([...(g.tags || []), 'discontinued']));
        await supa.from('catalog_products').update({
          in_stock: false, tags,
          specs: { ...(g.specs || {}), discontinued: true, discontinued_checked: '2026-07-04', discontinued_source: cfg.library ? 'current wholesale price sheet' : cfg.sitemaps[0] },
          updated_at: new Date().toISOString(),
        }).eq('id', g.id);
      }
    }

    // second image via og:image for matched rows lacking one (curl-able vendors only)
    if (!cfg.library) {
      const needImg = matched.filter((r) => (!Array.isArray(r.image_urls) || r.image_urls.filter(Boolean).length < 2));
      let added = 0;
      for (const r of needImg) {
        const url = matchIn(idx, r.name);
        if (!url || url.startsWith('pricebook')) continue;
        try {
          const html = await get(url);
          let img = html.match(/<meta\s+property="og:image"\s+content="([^"]+)"/i)?.[1]
            || html.match(/<meta\s+content="([^"]+)"\s+property="og:image"/i)?.[1];
          if (img && /\/api\/og-page\?/.test(img)) img = decodeURIComponent(img.replace(/&amp;/g, '&').match(/[?&]image=([^&]+)/)?.[1] || '');
          if (!img || !/^https?:/.test(img)) continue;
          const cur = (r.image_urls || [r.primary_image_url]).filter(Boolean);
          if (cur.some((c) => c.split('?')[0] === img.split('?')[0])) continue;
          if (WRITE) {
            const { error } = await supa.from('catalog_products').update({
              image_urls: [...cur, img].slice(0, 4),
              specs: { ...(r.specs || {}), image2_source: url },
              updated_at: new Date().toISOString(),
            }).eq('id', r.id);
            if (error) continue;
          }
          added++;
        } catch { /* skip */ }
        await new Promise((x) => setTimeout(x, 350));
      }
      summary[vendor].secondImagesAdded = added;
      console.log(`   second images added: ${added} (of ${needImg.length} needing one)`);
    }
  }
  await mongo.close();
  console.log(`\n${WRITE ? 'WROTE' : 'DRY RUN'} SUMMARY: ` + JSON.stringify(Object.fromEntries(Object.entries(summary).map(([v, s]) => [v, { ours: s.ours, matched: s.matched, discontinued: s.discontinued.length, img2: s.secondImagesAdded }]))));
})().catch((e) => { console.error('FATAL', e); process.exit(1); });
