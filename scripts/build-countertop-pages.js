#!/usr/bin/env node
/**
 * Build real, server-rendered, crawlable countertop detail pages at /countertops/{slug}/.
 *
 * Replaces the old client-side redirect "loader" stubs (which JS-redirected to
 * /marketplace/product/?handle=... and were thin/invisible to search) with static pages
 * that carry real content + Product/BreadcrumbList JSON-LD + crawlable internal links.
 *
 * Data: data/slabs.json (rich: material, vendor, images, size…) merged with
 * data/countertops.json (color, accent, style). Slugs with NO data are left untouched
 * and reported (handled separately: sitemap prune / noindex).
 *
 * Usage:  node scripts/build-countertop-pages.js          (write all)
 *         node scripts/build-countertop-pages.js --dry     (report only)
 *         node scripts/build-countertop-pages.js --limit 3 (first N, for testing)
 */
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const DIRS = path.join(ROOT, 'countertops');
const ORIGIN = 'https://www.surprisegranite.com';
const API = 'https://surprise-granite-email-api.onrender.com';
const FAB_RATE = 55; // $/sqft fabrication + install — same rate as the calculator & The Yard

// Live installed pricing from the catalog (master sheet): slug -> installed $/sqft.
// retail_price for slabs is MATERIAL per sqft; installed = material + $55/sqft.
// Fails soft: if the API is unreachable the pages build without prices.
const CATALOG_SLUGS = new Set(); // every slab slug the live shop can render
const CATALOG = {};             // slug -> { vendor, name, inst, retail }
function fetchInstalledPrices() {
  const out = {};
  try {
    for (let off = 0; off < 6000; off += 250) {
      const raw = execFileSync('curl', ['-s', '-m', '30', `${API}/api/catalog?category=slab&limit=250&offset=${off}`], { maxBuffer: 1 << 26 }).toString();
      let ps; try { ps = JSON.parse(raw).products || []; } catch { break; }
      if (!ps.length) break;
      for (const p of ps) {
        const slug = p.slug || p.id;
        const rp = Number(p.retail_price) || 0;
        const inst = Number(p.installed_sqft) || ((rp > 0 && rp <= 500) ? Math.round((rp + FAB_RATE) * 100) / 100 : 0);
        if (slug) { CATALOG_SLUGS.add(slug); CATALOG[slug] = { vendor: p.vendor_id || p.brand || '', name: p.name || '', inst, retail: rp }; }
        if (slug && inst) out[slug] = inst;
      }
      if (ps.length < 250) break;
    }
  } catch (e) { console.warn('price fetch failed (building without prices):', e.message); }
  return out;
}
const INSTALLED = fetchInstalledPrices();
console.log(`installed prices fetched for ${Object.keys(INSTALLED).length} slabs`);

// ---------- natural-stone color consolidation ----------
// Same-name, same-material natural stone carried by 2+ vendors collapses to ONE canonical page
// with a "Carried by" supplier table; the variant pages redirect in. Engineered stone (quartz/
// porcelain/Dekton) is proprietary per brand and never merged.
const C_FINISH = /\b(polished|honed|leather(?:ed)?|satin|soft|lux|matte|storm|brushed|suede|velvet|antiqued|caresse|premium)\b/gi;
const C_MATWORD = /\b(granite|quartzite|marble|dolomite|travertine|onyx|limestone|soapstone|quartz)\b/gi;
const normName = s => String(s || '').toLowerCase().replace(C_FINISH, '').replace(C_MATWORD, '').replace(/[^a-z0-9]+/g, '');
function baseNatMat(m) {
  const t = String(m || '').toLowerCase();
  for (const k of ['granite', 'quartzite', 'marble', 'dolomite', 'travertine', 'onyx', 'limestone', 'soapstone']) if (t.includes(k)) return k;
  if (/semi/.test(t)) return 'semi-precious';
  return null;
}
const VENDTOK = /-(asg|monterrey|cactus|theyard|bolder|daltile|gila|arizona-tile|msi|cosentino|arc|classic|eclos|sensa|scalea|satin|soft|lux|matte|storm|leather(?:ed)?|polished|honed|brushed|caresse)(-\d+)?$/;
function finishOf(name, canonicalName) {
  const m = String(name || '').match(C_FINISH);
  return m ? [...new Set(m.map(x => x[0].toUpperCase() + x.slice(1).toLowerCase()))].join(' / ') : 'Standard';
}

const args = process.argv.slice(2);
const DRY = args.includes('--dry');
const LIMIT = args.includes('--limit') ? parseInt(args[args.indexOf('--limit') + 1], 10) : Infinity;

const esc = s => String(s == null ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
const attr = s => esc(s);
const jsonLd = o => JSON.stringify(o).replace(/</g, '\\u003c');

// ---------- merge data by slug ----------
function loadArr(file, keys) {
  const d = JSON.parse(fs.readFileSync(path.join(ROOT, file)));
  for (const k of keys) if (Array.isArray(d[k])) return d[k];
  return Array.isArray(d) ? d : Object.values(d)[0];
}
const slabs = loadArr('data/slabs.json', ['slabs', 'countertops']);
const ctops = loadArr('data/countertops.json', ['countertops']);

const bySlug = {};
for (const s of slabs) {
  const slug = s.handle || s.slug;
  if (!slug) continue;
  bySlug[slug] = {
    slug,
    name: s.title || s.name,
    material: s.material || s.productType || 'Stone',
    vendor: s.brandDisplay || s.vendor || s.brand || '',
    finish: s.finish || '', thickness: s.thickness || '', size: s.size || '',
    slab_sqft: s.slab_sqft || '',
    images: (s.images || []).filter(Boolean),
    description: (s.description || '').trim(),
    sample_eligible: !!s.sample_eligible, sample_price: s.sample_price || '',
    color: '', accent: '', style: ''
  };
}
for (const c of ctops) {
  const slug = c.slug;
  if (!slug) continue;
  const e = bySlug[slug] || (bySlug[slug] = { slug, images: [] });
  e.name = e.name || c.name;
  e.material = e.material || c.type || 'Stone';
  e.vendor = e.vendor || c.brand || '';
  e.color = e.color || c.primaryColor || '';
  e.accent = e.accent || c.accentColor || '';
  e.style = e.style || c.style || '';
  e.finish = e.finish || c.finish || '';
  e.thickness = e.thickness || c.thickness || '';
  e.size = e.size || c.size || '';
  if (!e.images || !e.images.length) e.images = (c.images || [c.primaryImage]).filter(Boolean);
  if (!e.sample_price && c.sample_price) { e.sample_price = c.sample_price; e.sample_eligible = true; }
}

const prettyVendor = v => (v || '').replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
  .replace(/\bMsi\b/, 'MSI').replace(/\bAsg\b/, 'ASG').replace(/\bAz\b/i, 'AZ').replace(/\bArcsurfaces\b/i, 'Architectural Surfaces')
  .replace(/The Yard Az/i, 'The Yard');

// Build consolidation groups: natural stone, same normalized name + base material, 2+ vendors.
const groups = {};
for (const slug in bySlug) {
  const e = bySlug[slug];
  if (!e.name) continue;
  const mat = baseNatMat(e.material) || baseNatMat(slug);
  if (!mat) continue; // natural only
  const cat = CATALOG[slug];
  const vendor = (cat && cat.vendor) || e.vendor || '';
  const key = normName(e.name) + '|' + mat;
  (groups[key] = groups[key] || []).push({ slug, vendor, name: (cat && cat.name) || e.name, inst: (cat && cat.inst) || INSTALLED[slug] || 0, mat });
}
const canonicalOf = {};   // variantSlug -> canonicalSlug
const membersOf = {};     // canonicalSlug -> [{vendor,name,slug,inst,finish}]
for (const key in groups) {
  const v = groups[key];
  if (new Set(v.map(x => x.vendor)).size < 2 && v.length < 2) continue;
  const nameSlug = key.split('|')[0].replace(/([a-z])([0-9])/g, '$1-$2');
  const ideal = nameSlug + '-' + key.split('|')[1];
  const generic = v.find(x => !VENDTOK.test(x.slug) && bySlug[x.slug] && bySlug[x.slug].name);
  const canonical = (bySlug[ideal] && bySlug[ideal].name) ? ideal : (generic ? generic.slug : ideal);
  // seed a canonical entry (richest member) if the canonical slug has no data yet
  if (!bySlug[canonical] || !bySlug[canonical].name) {
    const seedSlug = (v.find(x => bySlug[x.slug] && bySlug[x.slug].images && bySlug[x.slug].images.length) || v[0]).slug;
    const seed = bySlug[seedSlug];
    if (seed) bySlug[canonical] = Object.assign({}, seed, { slug: canonical, name: seed.name });
  }
  // display name = canonical listing's clean name (drop finish/material words)
  const cName = ((bySlug[canonical] && bySlug[canonical].name) || v[0].name).replace(C_FINISH, '').replace(C_MATWORD, '').replace(/\s+/g, ' ').trim();
  if (bySlug[canonical]) bySlug[canonical].name = cName || bySlug[canonical].name;
  // pool images across members onto the canonical
  const pooled = [];
  for (const x of v) { const be = bySlug[x.slug]; if (be && be.images) for (const im of be.images) if (!pooled.includes(im)) pooled.push(im); }
  if (bySlug[canonical] && pooled.length) bySlug[canonical].images = pooled;
  membersOf[canonical] = v.slice().sort((a, b) => (a.inst || 1e9) - (b.inst || 1e9));
  for (const x of v) if (x.slug !== canonical) canonicalOf[x.slug] = canonical;
}
console.log(`consolidation: ${Object.keys(membersOf).length} canonical color pages, ${Object.keys(canonicalOf).length} variants redirecting`);

// group by material for "related colors" (built AFTER consolidation so variants are excluded)
const byMaterial = {};
for (const slug in bySlug) {
  if (canonicalOf[slug]) continue;
  const m = (bySlug[slug].material || 'Stone').toLowerCase();
  (byMaterial[m] = byMaterial[m] || []).push(slug);
}

// Only these material category pages actually exist — link the breadcrumb to them; for any
// other material (dolomite, travertine, onyx, quartz (quantra)…) fall back to all-countertops
// so we never emit a 404 internal link.
const MATERIAL_PAGES = new Set(['granite', 'quartz', 'marble', 'quartzite', 'porcelain', 'dekton']);
function materialSlug(mat) {
  const base = (mat || '').toLowerCase().replace(/\(.*?\)/g, '').trim().split(/\s+/)[0];
  return MATERIAL_PAGES.has(base) ? base : null;
}
const titleCaseMat = m => /quartz|granite|marble|dekton|porcelain|quartzite|onyx|soapstone|travertine/i.test(m) ? m : m;

function metaDescription(e) {
  const color = e.color ? e.color + ' ' : '';
  const mat = e.material || 'stone';
  const style = e.style ? `, ${e.style.toLowerCase()},` : '';
  return `${e.name} is a ${color}${mat} countertop slab${style} fabricated & installed by Surprise Granite across Phoenix & Arizona. Free in-home estimates — see it in your kitchen or order a sample.`.slice(0, 300);
}
function bodyDescription(e) {
  if (e.description && e.description.length > 40) return e.description;
  const color = e.color ? e.color.toLowerCase() + ' ' : '';
  const mat = e.material || 'stone';
  const vendor = e.vendor ? ` from ${prettyVendor(e.vendor)}` : '';
  const style = e.style ? ` Its ${e.style.toLowerCase()} pattern` : ' Its look';
  return `${e.name} is a ${color}${mat} countertop${vendor}.${style} suits kitchens, islands, bathroom vanities, and outdoor kitchens. Surprise Granite fabricates and installs ${e.name} throughout the Phoenix metro — Surprise, Scottsdale, Peoria, Glendale, and greater Arizona — with precise templating, a lifetime workmanship warranty, and free in-home estimates.`;
}

function specRows(e) {
  const rows = [
    ['Material', e.material],
    ['Color', [e.color, e.accent && e.accent !== e.color ? e.accent : ''].filter(Boolean).join(' / ')],
    ['Pattern', e.style],
    ['Finish', e.finish],
    ['Thickness', e.thickness],
    ['Slab size', e.size],
    ['Brand', prettyVendor(e.vendor)]
  ].filter(r => r[1]);
  return rows.map(r => `<div class="spec"><dt>${esc(r[0])}</dt><dd>${esc(r[1])}</dd></div>`).join('');
}

// "Carried by" supplier table for a consolidated (multi-vendor) color.
function supplierTable(members) {
  if (!members || members.length < 2) return '';
  const rows = members.map(m => {
    const price = m.inst ? `$${m.inst.toFixed(2)}<small>/sq ft</small>` : '<span class="mut">Call</span>';
    const shop = CATALOG_SLUGS.has(m.slug)
      ? `<a href="/marketplace/product/?handle=${attr(m.slug)}&category=slabs">Shop &rarr;</a>`
      : `<a href="/get-a-free-estimate/?source=countertop&color=${attr(encodeURIComponent(m.name))}">Quote &rarr;</a>`;
    return `<tr><td class="v">${esc(prettyVendor(m.vendor))}</td><td class="f">${esc(finishOf(m.name))}</td><td class="p">${price}</td><td class="s">${shop}</td></tr>`;
  }).join('');
  return `<section class="suppliers">
    <h2>Carried by ${members.length} suppliers</h2>
    <p class="sup-note">We source this stone per job from whichever partner yard has the best slab. Installed price = material + $55/sq ft fabrication &amp; installation.</p>
    <div class="tw"><table><thead><tr><th>Supplier</th><th>Finish</th><th>Installed</th><th></th></tr></thead><tbody>${rows}</tbody></table></div>
  </section>`;
}

function related(e) {
  const m = (e.material || 'Stone').toLowerCase();
  const pool = (byMaterial[m] || []).filter(s => s !== e.slug);
  const pick = pool.slice(0, 8).map(s => bySlug[s]);
  if (!pick.length) return '';
  return `<section class="rel"><h2>More ${esc(e.material)} colors</h2><div class="rel-grid">` +
    pick.map(p => `<a class="rel-card" href="/countertops/${attr(p.slug)}/"><img src="${attr((p.images[0]||''))}" alt="${attr(p.name)} ${attr(p.material)}" loading="lazy" onerror="this.style.visibility='hidden'"><span>${esc(p.name)}</span></a>`).join('') +
    `</div></section>`;
}

// ---------- page template ----------
function renderPage(e) {
  const url = `${ORIGIN}/countertops/${e.slug}/`;
  const title = `${e.name} ${e.material} Countertops | Surprise Granite`;
  const desc = metaDescription(e);
  const imgs = e.images.slice(0, 6);
  const hero = imgs[0] || '';
  const heroAbs = hero.startsWith('http') ? hero : ORIGIN + hero;
  const members = membersOf[e.slug] || null;               // consolidated multi-vendor page?
  const memberPrices = members ? members.map(m => m.inst).filter(Boolean) : (INSTALLED[e.slug] ? [INSTALLED[e.slug]] : []);
  const inst = memberPrices.length ? Math.min(...memberPrices) : 0; // "from" = lowest installed
  const unitOffer = (price, u) => ({
    '@type': 'Offer', priceCurrency: 'USD', price: price.toFixed(2),
    priceSpecification: { '@type': 'UnitPriceSpecification', price: price.toFixed(2), priceCurrency: 'USD', referenceQuantity: { '@type': 'QuantitativeValue', value: 1, unitCode: 'FTK' } },
    availability: 'https://schema.org/InStock', itemCondition: 'https://schema.org/NewCondition', url, seller: { '@type': 'Organization', name: u || 'Surprise Granite' }
  });
  const productLd = {
    '@context': 'https://schema.org', '@type': 'Product',
    name: `${e.name} ${e.material}`,
    image: imgs.map(i => i.startsWith('http') ? i : ORIGIN + i),
    description: bodyDescription(e).replace(/\s+/g, ' ').trim(),
    category: 'Countertops',
    material: e.material || undefined,
    color: e.color || undefined,
    brand: (!members && e.vendor) ? { '@type': 'Brand', name: prettyVendor(e.vendor) } : undefined,
    url,
    // Honest installed pricing (material + fabrication + install), per sqft.
    // Multi-vendor colors use AggregateOffer (low–high across suppliers); single = Offer.
    offers: !memberPrices.length ? undefined : (members && memberPrices.length > 1) ? {
      '@type': 'AggregateOffer', priceCurrency: 'USD',
      lowPrice: Math.min(...memberPrices).toFixed(2), highPrice: Math.max(...memberPrices).toFixed(2),
      offerCount: members.length, availability: 'https://schema.org/InStock', url,
      offers: members.filter(m => m.inst).map(m => unitOffer(m.inst, prettyVendor(m.vendor)))
    } : unitOffer(memberPrices[0])
  };
  const matSlug = materialSlug(e.material);
  const crumbItems = [
    { '@type': 'ListItem', position: 1, name: 'Home', item: ORIGIN + '/' },
    { '@type': 'ListItem', position: 2, name: 'Countertops', item: ORIGIN + '/materials/all-countertops/' }
  ];
  if (matSlug) crumbItems.push({ '@type': 'ListItem', position: crumbItems.length + 1, name: `${e.material} Countertops`, item: `${ORIGIN}/materials/countertops/${matSlug}-countertops/` });
  crumbItems.push({ '@type': 'ListItem', position: crumbItems.length + 1, name: e.name, item: url });
  const crumbLd = { '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: crumbItems };
  const gallery = imgs.length > 1
    ? `<div class="thumbs">${imgs.map((i, n) => `<img src="${attr(i)}" alt="${attr(e.name)} ${attr(e.material)} ${n ? 'scene ' + n : 'slab'}" loading="lazy" onerror="this.style.display='none'">`).join('')}</div>`
    : '';
  const sampleCta = e.sample_eligible ? `<a class="btn ghost" href="/marketplace/product/?handle=${attr(e.slug)}&category=slabs">Order a sample${e.sample_price ? ` · $${attr(e.sample_price)}` : ''}</a>` : '';

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover"/>
<title>${esc(title)}</title>
<meta name="description" content="${attr(desc)}"/>
<link rel="canonical" href="${url}"/>
<meta name="robots" content="index, follow"/>
<meta property="og:type" content="product"/>
<meta property="og:title" content="${attr(e.name)} ${attr(e.material)} Countertops"/>
<meta property="og:description" content="${attr(desc)}"/>
<meta property="og:url" content="${url}"/>
<meta property="og:image" content="${attr(heroAbs)}"/>
<meta property="og:site_name" content="Surprise Granite"/>
<meta name="twitter:card" content="summary_large_image"/>
<meta name="twitter:title" content="${attr(e.name)} ${attr(e.material)} Countertops"/>
<meta name="twitter:description" content="${attr(desc)}"/>
<meta name="twitter:image" content="${attr(heroAbs)}"/>
<link rel="shortcut icon" href="/migrated/6456ce4476abb25581fbad0c/6456ce4476abb269c6fbb176_Surprise-Granite-favicon-32x32px.png" type="image/x-icon"/>
<link rel="stylesheet" href="/css/unified-nav.css?v=20260709c"/>
<script defer src="/js/unified-nav.js?v=20260713c"></script>
<link rel="stylesheet" href="/css/footer-enhanced.css?v=20260426a"/>
<script type="application/ld+json">${jsonLd(productLd)}</script>
<script type="application/ld+json">${jsonLd(crumbLd)}</script>
<style>
:root{--gold:#f9cb00;--gold-deep:#e5b800;--ink:#17181d;--mut:#6b6e78;--bg:#f4f1ea;--panel:#fff;--line:#e6e1d6;--shadow:0 18px 44px -18px rgba(30,26,15,.35)}
*{box-sizing:border-box;margin:0;padding:0}
body{background:var(--bg);color:var(--ink);font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;line-height:1.55;-webkit-font-smoothing:antialiased}
.wrap{max-width:1120px;margin:0 auto;padding:20px 20px 56px}
.crumb{font-size:12.5px;color:var(--mut);margin-bottom:16px;display:flex;flex-wrap:wrap;gap:6px}
.crumb a{color:var(--gold-deep);text-decoration:none}.crumb span{color:var(--mut)}
.top{display:grid;grid-template-columns:1.05fr .95fr;gap:28px;align-items:start}
@media (max-width:820px){.top{grid-template-columns:1fr}}
.gallery img.hero{width:100%;border-radius:16px;border:1px solid var(--line);display:block;background:#e9e3d6;aspect-ratio:4/3;object-fit:cover}
.thumbs{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-top:8px}
.thumbs img{width:100%;aspect-ratio:1;object-fit:cover;border-radius:10px;border:1px solid var(--line);background:#e9e3d6}
.eyebrow{font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:var(--gold-deep);font-weight:700}
h1{font-size:clamp(24px,4vw,34px);line-height:1.08;letter-spacing:-.02em;font-weight:800;margin:4px 0 12px}
.lead{color:#33343a;font-size:15.5px;margin-bottom:18px}
.iprice{margin:2px 0 12px;font-size:15px;color:#33343a}
.iprice b{font-size:22px;font-weight:800;color:var(--ink);letter-spacing:-.02em}
.iprice span{display:block;font-size:12px;color:var(--mut);margin-top:2px}
.specs{display:grid;grid-template-columns:1fr 1fr;gap:1px;background:var(--line);border:1px solid var(--line);border-radius:14px;overflow:hidden;margin-bottom:20px}
.spec{background:var(--panel);padding:11px 14px}
.spec dt{font-size:11px;text-transform:uppercase;letter-spacing:.05em;color:var(--mut);font-weight:700}
.spec dd{font-size:14.5px;font-weight:600;margin-top:2px}
.cta{display:flex;flex-wrap:wrap;gap:10px}
.btn{font:inherit;font-weight:700;font-size:14.5px;border:none;border-radius:11px;padding:13px 18px;cursor:pointer;text-decoration:none;display:inline-flex;gap:8px;align-items:center;transition:transform .12s}
.btn:hover{transform:translateY(-2px)}
.btn.prime{background:linear-gradient(135deg,#ffdf4a,var(--gold),var(--gold-deep));color:#141207;box-shadow:0 10px 22px -8px rgba(249,203,0,.6)}
.btn.ghost{background:var(--panel);color:var(--ink);border:1px solid var(--line)}
.btn.shop{background:var(--ink);color:#fff;box-shadow:0 10px 22px -10px rgba(23,24,29,.5)}
.suppliers{margin-top:30px}
.suppliers h2{font-size:19px;font-weight:800;margin-bottom:4px}
.sup-note{color:var(--mut);font-size:13px;margin-bottom:12px;max-width:70ch}
.tw{overflow-x:auto;border:1px solid var(--line);border-radius:13px}
.suppliers table{width:100%;border-collapse:collapse;font-size:14px}
.suppliers th{text-align:left;font-size:10.5px;letter-spacing:.06em;text-transform:uppercase;color:var(--mut);font-weight:700;padding:9px 14px;background:var(--bg);border-bottom:1px solid var(--line)}
.suppliers td{padding:11px 14px;border-bottom:1px solid var(--line)}
.suppliers tr:last-child td{border-bottom:none}
.suppliers td.v{font-weight:700}
.suppliers td.f{color:var(--mut)}
.suppliers td.p{font-weight:800;font-variant-numeric:tabular-nums;white-space:nowrap}
.suppliers td.p small{font-weight:600;color:var(--mut)}
.suppliers td.s{text-align:right;white-space:nowrap}
.suppliers td.s a{color:var(--gold-deep);font-weight:700;text-decoration:none}
.suppliers .mut{color:var(--mut)}
.about{margin-top:34px;max-width:74ch}
.about h2{font-size:19px;font-weight:800;margin-bottom:8px}
.about p{color:#33343a;font-size:15px;margin-bottom:10px}
.rel{margin-top:38px}
.rel h2{font-size:19px;font-weight:800;margin-bottom:14px}
.rel-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(130px,1fr));gap:12px}
.rel-card{text-decoration:none;color:inherit;border:1px solid var(--line);border-radius:12px;overflow:hidden;background:var(--panel);transition:transform .12s,border-color .15s}
.rel-card:hover{transform:translateY(-3px);border-color:var(--gold)}
.rel-card img{width:100%;aspect-ratio:4/3;object-fit:cover;display:block;background:#e9e3d6}
.rel-card span{display:block;padding:9px 10px;font-size:12.5px;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
</style>
</head>
<body class="unified-nav-active">
<div class="wrap">
  <nav class="crumb" aria-label="Breadcrumb">
    <a href="/">Home</a> <span>/</span>
    <a href="/materials/all-countertops/">Countertops</a> <span>/</span>
    ${matSlug ? `<a href="/materials/countertops/${matSlug}-countertops/">${esc(e.material)}</a> <span>/</span>` : ''}
    <span>${esc(e.name)}</span>
  </nav>
  <div class="top">
    <div class="gallery">
      <img class="hero" src="${attr(hero)}" alt="${attr(e.name)} ${attr(e.material)} countertop slab" onerror="this.style.background='#e9e3d6'">
      ${gallery}
    </div>
    <div class="info">
      <div class="eyebrow">${esc(e.material)}${members ? ` · ${members.length} suppliers` : (e.vendor ? ' · ' + esc(prettyVendor(e.vendor)) : '')}</div>
      <h1>${esc(e.name)} ${esc(e.material)} Countertops</h1>
      ${inst ? `<div class="iprice"><b>from $${inst.toFixed(2)}</b>/sq ft installed<span> · includes fabrication &amp; installation · free in-home measure</span></div>` : `<div class="iprice"><b>Call for pricing</b><span> · <a href="tel:+16028333189" style="color:var(--gold-deep);font-weight:700">(602) 833-3189</a> · free in-home measure</span></div>`}
      <p class="lead">${esc(bodyDescription(e))}</p>
      <dl class="specs">${specRows(e)}</dl>
      <div class="cta">
        <a class="btn prime" href="/get-a-free-estimate/?source=countertop&color=${attr(encodeURIComponent(e.name))}">Get a free estimate →</a>
        ${(() => { const shopSlug = members ? (members.find(m => CATALOG_SLUGS.has(m.slug)) || {}).slug : (CATALOG_SLUGS.has(e.slug) ? e.slug : null); return shopSlug ? `<a class="btn shop" href="/marketplace/product/?handle=${attr(shopSlug)}&category=slabs">Shop this color →</a>` : ''; })()}
        <a class="btn ghost" href="/tools/visualizer/">See it in your kitchen</a>
        ${sampleCta}
      </div>
    </div>
  </div>
  ${supplierTable(members)}
  <section class="about">
    <h2>About ${esc(e.name)}</h2>
    <p>${esc(bodyDescription(e))}</p>
    <p>Every ${esc(e.name)} installation includes digital templating, professional fabrication, and expert installation by our Arizona-based team. ${inst ? `Installed pricing starts around $${inst.toFixed(2)} per square foot — material, fabrication, and installation included. ` : ''}Final pricing depends on square footage, edge profile, and cutouts — <a href="/tools/countertop-calculator/">estimate your project</a> or book a free in-home measure for exact numbers.</p>
  </section>
  ${related(e)}
</div>
<footer class="simple-footer">
  <div class="footer-cta">
    <h2>Ready to Start Your Project?</h2>
    <p>Free estimates for Phoenix metro homeowners</p>
    <div class="footer-cta-btns">
      <a href="/get-a-free-estimate/" class="footer-btn-primary">Get Free Estimate</a>
      <a href="tel:+16028333189" class="footer-btn-secondary">(602) 833-3189</a>
    </div>
  </div>
  <div class="footer-main"><div class="footer-grid">
    <div class="footer-col"><h4>Products</h4><a href="/materials/all-countertops/">Countertops</a><a href="/materials/all-cabinets">Cabinets</a><a href="/materials/flooring">Flooring</a><a href="/materials/all-tile">Tile &amp; Backsplash</a><a href="/marketplace/">Online Store</a></div>
    <div class="footer-col"><h4>Services</h4><a href="/services/home/kitchen-remodeling-arizona">Kitchen Remodeling</a><a href="/services/home/bathroom-remodeling-arizona">Bathroom Remodeling</a><a href="/get-a-free-estimate/">Free Estimate</a><a href="/tools/">Design Tools</a></div>
    <div class="footer-col"><h4>Company</h4><a href="/company/about-us">About Us</a><a href="/company/project-gallery">Gallery</a><a href="/company/reviews">Reviews</a><a href="/blog">Blog</a><a href="/contact-us">Contact</a></div>
    <div class="footer-col"><h4>Connect</h4><div class="footer-contact"><p><strong>Service Area:</strong><br>Greater Phoenix, AZ<br>We Come to You!</p><p><strong>Hours:</strong><br>Mon-Fri 8am-5pm<br>Sat 9am-2pm</p></div></div>
  </div></div>
  <div class="footer-bottom"><div class="footer-bottom-inner">
    <div class="footer-legal"><a href="/legal/privacy-policy">Privacy</a><a href="/legal/terms-of-use">Terms</a><a href="/legal/lifetime-warranty">Warranty</a><a href="https://azroc.my.site.com/AZRoc/s/contractor-search?licenseId=a0o8y000000OAdvAAG" target="_blank">ROC #341113</a></div>
    <div class="footer-copy">© 2026 Surprise Granite Marble &amp; Quartz</div>
  </div></div>
</footer>
<script defer src="/js/remodely-hub.js?v=20260713c"></script>
</body>
</html>
`;
}

// ---------- run ----------
const dirs = fs.readdirSync(DIRS).filter(d => {
  try { return fs.statSync(path.join(DIRS, d)).isDirectory(); } catch { return false; }
});
const dirSet = new Set(dirs);
function redirectPage(canonical) {
  const to = `/countertops/${canonical}/`;
  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(bySlug[canonical] ? bySlug[canonical].name + ' ' + bySlug[canonical].material : 'Countertops')} | Surprise Granite</title>
<meta name="robots" content="noindex, follow">
<link rel="canonical" href="${ORIGIN}${to}">
<meta http-equiv="refresh" content="0; url=${to}">
<script>location.replace("${to}");</script>
</head><body>This color moved to <a href="${to}">its page</a>.</body></html>`;
}

let written = 0, redirected = 0, noData = [], count = 0, newCanon = 0;
// pages to render: canonicals (may be new slugs) + non-variant slugs with data
const renderSet = new Set(Object.keys(membersOf).filter(c => bySlug[c] && bySlug[c].name && bySlug[c].images && bySlug[c].images.length));
for (const slug of dirs) {
  if (canonicalOf[slug]) continue; // variant → redirect below
  const e = bySlug[slug];
  if (!e || !e.name || !(e.images && e.images.length)) { noData.push(slug); continue; }
  renderSet.add(slug);
}
for (const slug of renderSet) {
  if (count >= LIMIT) break;
  count++;
  if (DRY) { written++; continue; }
  const dir = path.join(DIRS, slug);
  if (!dirSet.has(slug)) { fs.mkdirSync(dir, { recursive: true }); newCanon++; }
  fs.writeFileSync(path.join(dir, 'index.html'), renderPage(bySlug[slug]));
  written++;
}
// redirect variant pages into their canonical
for (const variant in canonicalOf) {
  if (!dirSet.has(variant)) continue;
  if (!DRY) fs.writeFileSync(path.join(DIRS, variant, 'index.html'), redirectPage(canonicalOf[variant]));
  redirected++;
}
console.log(`countertop dirs: ${dirs.length}`);
console.log(`pages ${DRY ? 'would write' : 'written'}: ${written} (new canonical dirs: ${newCanon})`);
console.log(`variants redirected to canonical: ${redirected}`);
console.log(`no-data (left as stubs): ${noData.length}`);
if (!DRY) {
  fs.writeFileSync(path.join(ROOT, 'scripts/.countertop-canonical-map.json'), JSON.stringify(canonicalOf, null, 0));
  if (noData.length) fs.writeFileSync(path.join(ROOT, 'scripts/.countertop-nodata-slugs.json'), JSON.stringify(noData, null, 0));
}
