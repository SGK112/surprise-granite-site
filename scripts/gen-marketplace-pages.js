#!/usr/bin/env node
/**
 * Generate clean, indexable, purchasable static product pages from the live
 * catalog (/api/catalog) for a marketplace category.
 *
 *   node scripts/gen-marketplace-pages.js sink
 *
 * Output: /marketplace/<category-plural>/<handle>/index.html + sitemap-<plural>.xml
 *
 * Each page is REAL static content (image, price, Add to Cart, description,
 * specs) + full <head> SEO (canonical, OG, Product schema WITH price) so it
 * indexes as a normal product page (not a redirect/param URL). Re-run any time
 * Aria's vendor sync changes inventory — it regenerates from the live catalog.
 *
 * Decisions baked in (per Josh, 2026-06-29): skip out-of-stock; Add-to-Cart →
 * checkout (drop-ship); requires a real price.
 */
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const SITE = 'https://www.surprisegranite.com';
const API = 'https://surprise-granite-email-api.onrender.com';
const CAT = (process.argv[2] || 'sink').toLowerCase();
const PLURAL = { sink: 'sinks', faucet: 'faucets', fixture: 'fixtures', accessory: 'accessories' }[CAT] || (CAT + 's');
const OUTDIR = path.join(ROOT, 'marketplace', PLURAL);

const esc = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const jsonAttr = o => JSON.stringify(o).replace(/</g, '\\u003c');
const money = n => Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function fetchAll() {
  const out = [];
  for (let off = 0; off < 6000; off += 250) {
    const raw = execFileSync('curl', ['-s', `${API}/api/catalog?category=${CAT}&limit=250&offset=${off}`], { maxBuffer: 1 << 26 }).toString();
    let ps; try { ps = JSON.parse(raw).products || []; } catch { break; }
    if (!ps.length) break;
    out.push(...ps);
    if (ps.length < 250) break;
  }
  return out;
}

function page(p) {
  const handle = p.slug || p.id;
  const url = `${SITE}/marketplace/${PLURAL}/${handle}/`;
  const name = p.name || 'Product';
  const brand = p.brand || p.vendor_id || '';
  const price = Number(p.retail_price);
  const imgs = (Array.isArray(p.image_urls) && p.image_urls.length ? p.image_urls : [p.primary_image_url]).filter(Boolean);
  const img = imgs[0] || `${SITE}/images/placeholder.svg`;
  const desc = (p.short_description || `${name}${brand ? ' by ' + brand : ''} — available at Surprise Granite with fast shipping. Quality ${CAT}s for your kitchen or bath remodel.`).replace(/\s+/g, ' ').trim();
  const metaDesc = desc.length > 300 ? desc.slice(0, 297) + '…' : desc;
  const catLabel = CAT.charAt(0).toUpperCase() + CAT.slice(1);

  const productLd = {
    '@context': 'https://schema.org', '@type': 'Product', name, description: desc, image: imgs,
    sku: p.sku || handle, brand: { '@type': 'Brand', name: brand || 'Surprise Granite' },
    category: `${catLabel}s`, url,
    offers: { '@type': 'Offer', price: price.toFixed(2), priceCurrency: 'USD',
      availability: 'https://schema.org/InStock', url,
      seller: { '@type': 'Organization', name: 'Surprise Granite' } }
  };
  const crumbLd = {
    '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: SITE + '/' },
      { '@type': 'ListItem', position: 2, name: 'Marketplace', item: SITE + '/marketplace/' },
      { '@type': 'ListItem', position: 3, name: `${catLabel}s`, item: `${SITE}/marketplace/${PLURAL}/` },
      { '@type': 'ListItem', position: 4, name }
    ]
  };
  const cartObj = { id: p.sku || handle, name, price, image: img, variant: brand, category: PLURAL, href: url };
  const thumbs = imgs.slice(0, 5).map((u, i) =>
    `<img class="pdp-thumb${i === 0 ? ' active' : ''}" src="${esc(u)}" alt="${esc(name)} view ${i + 1}" loading="lazy" onclick="document.getElementById('pdpMain').src=this.src" onerror="this.remove()"/>`).join('');
  const specs = [['Brand', brand], ['SKU', p.sku || handle], ['Type', p.subcategory || `${catLabel}`]]
    .filter(([, v]) => v).map(([k, v]) => `<li><span>${esc(k)}</span><strong>${esc(v)}</strong></li>`).join('');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1"/>
  <title>${esc(name)} | Surprise Granite</title>
  <meta name="description" content="${esc(metaDesc)}"/>
  <link rel="canonical" href="${url}"/>
  <meta name="robots" content="index, follow"/>
  <meta property="og:type" content="product"/>
  <meta property="og:url" content="${url}"/>
  <meta property="og:title" content="${esc(name)}"/>
  <meta property="og:description" content="${esc(metaDesc)}"/>
  <meta property="og:image" content="${esc(img)}"/>
  <meta property="og:site_name" content="Surprise Granite"/>
  <meta name="twitter:card" content="summary_large_image"/>
  <meta name="twitter:title" content="${esc(name)}"/>
  <meta name="twitter:description" content="${esc(metaDesc)}"/>
  <meta name="twitter:image" content="${esc(img)}"/>
  <meta property="product:price:amount" content="${price.toFixed(2)}"/>
  <meta property="product:price:currency" content="USD"/>
  <script type="application/ld+json">${jsonAttr(productLd)}</script>
  <script type="application/ld+json">${jsonAttr(crumbLd)}</script>
  <link rel="stylesheet" href="/css/unified-nav.css?v=20260628c"/>
  <link rel="stylesheet" href="/css/marketplace-cards.css?v=20260426a"/>
  <link rel="stylesheet" href="/css/marketplace-mobile-fix.css?v=20260502a"/>
  <script defer src="/js/unified-nav.js?v=20260628a"></script>
  <style>
    :root{--gold:#f9cb00;--navy:#1a2b3c;--text-primary:#1a1a2e;--text-secondary:#555;--text-muted:#888;--bg:#fff;--bg-light:#f8f9fa;--border:#e5e5e5}
    *{box-sizing:border-box}body{margin:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:var(--text-primary);background:var(--bg)}
    .breadcrumb-nav{max-width:1200px;margin:0 auto;padding:14px 24px;font-size:13px;color:var(--text-muted)}
    .breadcrumb-nav a{color:var(--navy);text-decoration:none}.breadcrumb-nav a:hover{text-decoration:underline}
    .pdp{max-width:1200px;margin:0 auto;padding:8px 24px 56px;display:grid;grid-template-columns:1fr 1fr;gap:48px}
    .pdp-gallery{position:sticky;top:16px;align-self:start}
    .pdp-main{width:100%;aspect-ratio:1/1;object-fit:cover;border:1px solid var(--border);border-radius:14px;background:var(--bg-light)}
    .pdp-thumbs{display:flex;gap:10px;margin-top:12px;flex-wrap:wrap}
    .pdp-thumb{width:64px;height:64px;object-fit:cover;border:1px solid var(--border);border-radius:8px;cursor:pointer;opacity:.65;transition:opacity .15s}
    .pdp-thumb.active,.pdp-thumb:hover{opacity:1;border-color:var(--gold)}
    .pdp-brand{text-transform:uppercase;letter-spacing:.05em;font-size:12px;font-weight:700;color:var(--text-muted)}
    .pdp-title{font-size:clamp(1.5rem,3vw,2.1rem);font-weight:800;margin:6px 0 14px;line-height:1.2}
    .pdp-price{font-size:1.9rem;font-weight:800;color:var(--navy);margin-bottom:8px}
    .pdp-ship{font-size:13px;color:#16a34a;font-weight:600;margin-bottom:20px}
    .add-to-cart-btn{display:inline-block;background:var(--gold);color:var(--navy);border:none;border-radius:10px;padding:15px 40px;font-size:1.05rem;font-weight:800;cursor:pointer;transition:transform .1s,box-shadow .15s;box-shadow:0 3px 12px rgba(249,203,0,.35)}
    .add-to-cart-btn:hover{transform:translateY(-1px)}.add-to-cart-btn:disabled{opacity:.7;cursor:default}
    .pdp-desc{margin:26px 0;line-height:1.7;color:var(--text-secondary);font-size:15px}
    .pdp-specs{list-style:none;padding:0;margin:0 0 26px;border-top:1px solid var(--border)}
    .pdp-specs li{display:flex;justify-content:space-between;padding:11px 0;border-bottom:1px solid var(--border);font-size:14px}
    .pdp-specs span{color:var(--text-muted)}.pdp-back{color:var(--navy);font-weight:600;text-decoration:none;font-size:14px}
    .footer{background:var(--navy);color:#fff;padding:36px 24px;margin-top:40px}
    .footer-inner{max-width:1200px;margin:0 auto;text-align:center}
    .footer-links{display:flex;gap:22px;justify-content:center;flex-wrap:wrap;margin-bottom:14px}
    .footer-links a{color:#fff;opacity:.85;text-decoration:none;font-size:14px}.footer-links a:hover{opacity:1}
    .footer-copyright{opacity:.6;font-size:13px}
    @media(max-width:760px){.pdp{grid-template-columns:1fr;gap:24px}.pdp-gallery{position:static}}
  </style>
</head>
<body>
  <nav class="breadcrumb-nav" aria-label="Breadcrumb"><a href="/">Home</a> / <a href="/marketplace/">Marketplace</a> / <a href="/marketplace/${PLURAL}/">${catLabel}s</a> / ${esc(name)}</nav>
  <main class="pdp">
    <div class="pdp-gallery">
      <img id="pdpMain" class="pdp-main" src="${esc(img)}" alt="${esc(name)}" onerror="this.onerror=null;this.src='/images/placeholder.svg'"/>
      <div class="pdp-thumbs">${thumbs}</div>
    </div>
    <div class="pdp-info">
      ${brand ? `<div class="pdp-brand">${esc(brand)}</div>` : ''}
      <h1 class="pdp-title">${esc(name)}</h1>
      <div class="pdp-price">$${money(price)}</div>
      <div class="pdp-ship">✓ In stock · ships to your door</div>
      <button class="add-to-cart-btn" onclick="sgAdd(this)">Add to Cart</button>
      <div class="pdp-desc">${esc(desc)}</div>
      <ul class="pdp-specs">${specs}</ul>
      <a class="pdp-back" href="/marketplace/${PLURAL}/">← Browse all ${PLURAL}</a>
    </div>
  </main>
  <footer class="footer"><div class="footer-inner">
    <div class="footer-links"><a href="/">Home</a><a href="/marketplace/">Marketplace</a><a href="/marketplace/${PLURAL}/">${catLabel}s</a><a href="/cart/">Cart</a><a href="/contact-us/">Contact</a></div>
    <div class="footer-copyright">&copy; 2026 Surprise Granite. All rights reserved.</div>
  </div></footer>
  <script>
    var SG_PRODUCT = ${jsonAttr(cartObj)};
    function sgAdd(btn){ if(window.sgAddToCart){ window.sgAddToCart(SG_PRODUCT, btn); } else { window.location='/cart/'; } }
  </script>
  <script src="/js/pricing-config.js"></script>
  <script src="/js/sg-auth.js?v=20260205b"></script>
  <script src="/js/cart.js?v=20260628b"></script>
  <script src="/js/shop-cart-integration.js?v=20260628e"></script>
</body>
</html>`;
}

// --- run ---
const all = fetchAll();
console.log(`fetched ${all.length} ${CAT} products`);
let made = 0, skipOOS = 0, skipNoPrice = 0;
const urls = [];
for (const p of all) {
  const handle = p.slug || p.id;
  if (!handle) continue;
  if (p.in_stock === false) { skipOOS++; continue; }            // decision: skip OOS
  if (!(Number(p.retail_price) > 0)) { skipNoPrice++; continue; } // need a real price to sell
  const dir = path.join(OUTDIR, handle);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'index.html'), page(p));
  urls.push(`${SITE}/marketplace/${PLURAL}/${handle}/`);
  made++;
}
console.log(`generated ${made} pages | skipped OOS ${skipOOS}, no-price ${skipNoPrice}`);

// sitemap
const sm = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
  urls.map(u => `<url>\n<loc>${u}</loc>\n<changefreq>weekly</changefreq>\n<priority>0.6</priority>\n</url>`).join('\n') +
  `\n</urlset>\n`;
fs.writeFileSync(path.join(ROOT, `sitemap-${PLURAL}.xml`), sm);
console.log(`wrote sitemap-${PLURAL}.xml (${urls.length} urls)`);
