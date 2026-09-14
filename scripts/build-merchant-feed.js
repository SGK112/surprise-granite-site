#!/usr/bin/env node
/**
 * build-merchant-feed.js — Google Merchant Center product feed.
 *
 * WHY THIS EXISTS. Measured from the retired Shopify store's own order history
 * (2026-09-13): **Google Shopping was 31% of orders and 37% of revenue** — 155 of
 * 489 paid orders, $15,494 of $40,868 — identified by the `srsltid=` click id on
 * their landing URLs, and 236 of 489 orders landed straight on a product page from
 * a listing. Shopify fed Google Merchant Center automatically. That feed died with
 * it, and the rebuilt store publishes none: /feed.xml, /product-feed.xml,
 * /merchant-feed.xml and /google-shopping.xml all 404. It is the single biggest
 * demand channel the store lost, and nothing on the new site replaced it.
 *
 *   node scripts/build-merchant-feed.js [--write]
 *
 * Output: /merchant-feed.xml (RSS 2.0 + the g: namespace Google expects).
 * Submit it once in Merchant Center as a scheduled fetch; re-running keeps it current.
 *
 * WHAT IS DELIBERATELY EXCLUDED, and why — every exclusion is a disapproval avoided:
 *  - anything not active + in_stock, or without a real price, or without an image
 *  - **stone slabs, remnants and countertops.** They are quoted installed, not sold
 *    per unit. Feeding a per-sqft material figure as an item price would advertise a
 *    number nobody can buy a countertop for.
 *  - any product whose landing page does not exist, is noindexed, or renders a
 *    DISABLED buy button. The page — not the catalog — is the source of truth here,
 *    because they genuinely disagree: ABGR2420 is active + in_stock + $89.51 in
 *    catalog_products while its page says "unavailable" with a dead button, the
 *    vendor stock feed having retired it. 4 items are excluded on this rule today.
 *
 * Per-sqft tile IS included, with unit_pricing_measure "1 sqft", because that is
 * genuinely what the cart charges for one unit — $6.63 buys 1 sqft. Tile and mosaic
 * were Shopify's best-selling category, so dropping it would repeat the mistake.
 *
 * Shipping comes from scripts/lib/shipping.js — the same rule the product page and
 * the cart use. Google disapproves items whose feed shipping undercuts checkout, so
 * this must never be a guess.
 */
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const crypto = require('crypto');
const { shippingFor } = require('./lib/shipping');

const ROOT = path.resolve(__dirname, '..');
const SITE = 'https://www.surprisegranite.com';
const API = 'https://surprise-granite-email-api.onrender.com';
const OUT = path.join(ROOT, 'merchant-feed.xml');
const WRITE = process.argv.includes('--write');

// catalog category -> the marketplace dir its pages live in, + the product_type we
// declare. google_product_category is deliberately omitted: Google auto-classifies,
// and a wrong explicit category is worse than none.
const CATS = {
  sink: { dir: 'sinks', type: 'Home & Garden > Kitchen > Sinks' },
  faucet: { dir: 'faucets', type: 'Home & Garden > Kitchen > Faucets' },
  tile: { dir: 'tile', type: 'Home & Garden > Building Materials > Tile' },
  fixture: { dir: 'bathroom', type: 'Home & Garden > Bathroom > Fixtures' },
  accessory: { dir: 'kitchen-accessories', type: 'Home & Garden > Kitchen > Accessories' },
};

const xml = s => String(s == null ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&apos;')
  .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '');           // control chars break the parse
const money = n => Number(n).toFixed(2);
const clean = s => String(s || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();

/**
 * Google caps the `id` attribute at 50 characters and rejects the item outright
 * beyond that ("Value too long in attribute: id"). Five SKUs are really slugs and
 * ran 51-53 chars.
 *
 * Plain truncation is not safe: `msi-arabescato-venato-white-marble-subway-honed-tile`
 * and `...-herringbone-tile` share a long prefix, and two items with the same id
 * silently overwrite each other in Merchant Center. So keep a readable prefix and
 * append a short hash of the FULL sku — unique, and stable across rebuilds, which
 * matters because changing an id resets that item's history with Google.
 */
function feedId(sku) {
  const s = String(sku);
  if (s.length <= 50) return s;
  const h = crypto.createHash('sha1').update(s).digest('hex').slice(0, 7);
  return `${s.slice(0, 42)}-${h}`;
}

function fetchCategory(cat) {
  const out = [];
  for (let off = 0; off < 6000; off += 250) {
    const raw = execFileSync('curl', ['-s', '--max-time', '60',
      `${API}/api/catalog?category=${cat}&limit=250&offset=${off}`], { maxBuffer: 1 << 26 }).toString();
    let ps; try { ps = JSON.parse(raw).products || []; } catch (e) { break; }
    if (!ps.length) break;
    out.push(...ps);
    if (ps.length < 250) break;
  }
  return out;
}

const skipped = { noPrice: 0, noImage: 0, noPage: 0, noStock: 0, noindex: 0, notBuyable: 0 };
const items = [];

for (const [cat, cfg] of Object.entries(CATS)) {
  for (const p of fetchCategory(cat)) {
    const handle = p.slug || p.id;
    const price = Number(p.retail_price);
    if (!handle) continue;
    if (p.in_stock === false) { skipped.noStock++; continue; }
    if (!price || price <= 0) { skipped.noPrice++; continue; }

    const imgs = (Array.isArray(p.image_urls) && p.image_urls.length ? p.image_urls : [p.primary_image_url])
      .filter(Boolean)
      .map(u => (/^https?:\/\//i.test(u) ? u : `${SITE}${String(u).startsWith('/') ? '' : '/'}${u}`));
    if (!imgs.length) { skipped.noImage++; continue; }

    // THE PAGE IS THE SOURCE OF TRUTH, NOT THE CATALOG. A feed item pointing at a
    // 404 is disapproved on sight — but worse, the catalog and the page genuinely
    // disagree: ABGR2420 is active + in_stock + $89.51 in catalog_products while its
    // page is noindex, says "unavailable" and renders a DISABLED Add to Cart,
    // because the vendor stock feed retired it. Advertising that on Shopping sends a
    // shopper to a dead button. So require the page to exist, be indexable, and
    // offer a live buy button — exactly the test a customer applies.
    const pageFile = path.join(ROOT, 'marketplace', cfg.dir, handle, 'index.html');
    if (!fs.existsSync(pageFile)) { skipped.noPage++; continue; }
    const pageHtml = fs.readFileSync(pageFile, 'utf8');
    if (/<meta[^>]*name=["']robots["'][^>]*content=["'][^"']*noindex/i.test(pageHtml)) { skipped.noindex++; continue; }
    if (!/class="add-to-cart-btn"/.test(pageHtml) || /add-to-cart-btn"[^>]*\bdisabled/.test(pageHtml)) { skipped.notBuyable++; continue; }

    const link = `${SITE}/marketplace/${cfg.dir}/${handle}/`;
    const title = clean(p.name).slice(0, 150);
    const desc = (clean(p.description) || clean(p.short_description) || title).slice(0, 4900);
    const ship = shippingFor({ ...p, handle }, price, ROOT);
    const perSqft = String(p.price_unit) === 'sqft';

    const parts = [
      `<g:id>${xml(feedId(p.sku || handle))}</g:id>`,
      `<g:title>${xml(title)}</g:title>`,
      `<g:description>${xml(desc)}</g:description>`,
      `<g:link>${xml(link)}</g:link>`,
      `<g:image_link>${xml(imgs[0])}</g:image_link>`,
      ...imgs.slice(1, 11).map(u => `<g:additional_image_link>${xml(u)}</g:additional_image_link>`),
      '<g:availability>in_stock</g:availability>',
      '<g:condition>new</g:condition>',
      `<g:price>${money(price)} USD</g:price>`,
      `<g:brand>${xml(clean(p.brand) || 'Surprise Granite')}</g:brand>`,
      `<g:mpn>${xml(p.sku || handle)}</g:mpn>`,
      // We hold no GTINs. brand + mpn is an accepted identifier pair, so
      // identifier_exists must NOT be "no" — saying so would strip the pair and
      // lose us the matching that Shopping ranking depends on.
      `<g:product_type>${xml(cfg.type)}</g:product_type>`,
      `<g:shipping><g:country>US</g:country><g:service>Standard</g:service><g:price>${money(ship.cost)} USD</g:price></g:shipping>`,
    ];
    // Say what one unit is, so $6.63 is not read as the price of a finished floor.
    if (perSqft) {
      parts.push('<g:unit_pricing_measure>1 sqft</g:unit_pricing_measure>');
      parts.push('<g:unit_pricing_base_measure>1 sqft</g:unit_pricing_base_measure>');
    }
    items.push(`  <item>\n    ${parts.join('\n    ')}\n  </item>`);
  }
}

const feed = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:g="http://base.google.com/ns/1.0">
<channel>
  <title>Surprise Granite</title>
  <link>${SITE}/</link>
  <description>Countertops, sinks, faucets, tile and bathroom fixtures, shipped across the US and installed across the Phoenix metro.</description>
${items.join('\n')}
</channel>
</rss>
`;

console.log(`feed items: ${items.length}`);
console.log(`  skipped — no page ${skipped.noPage}, noindexed ${skipped.noindex}, buy button disabled ${skipped.notBuyable}, no price ${skipped.noPrice}, no image ${skipped.noImage}, out of stock ${skipped.noStock}`);
console.log(`  size: ${(Buffer.byteLength(feed) / 1024 / 1024).toFixed(2)} MB`);
if (!WRITE) { console.log('\nDRY RUN — re-run with --write to apply.'); process.exit(0); }
fs.writeFileSync(OUT, feed);
console.log(`wrote ${path.relative(ROOT, OUT)}  ->  ${SITE}/merchant-feed.xml`);
