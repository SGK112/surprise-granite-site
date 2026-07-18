#!/usr/bin/env node
/**
 * Fix the Product snippet error on the static flooring pages.
 *
 * The 193 /flooring/<slug>/ pages emit a bare `@type: Product` with NO offers,
 * which trips GSC's "Either offers, review, or aggregateRating should be
 * specified". Flooring DOES have a retail per-sqft price (data/flooring-with-
 * pricing.json → price.guest), so add a valid Offer with that price instead of
 * dropping the schema — that fixes the error AND makes the pages eligible for a
 * Product rich result.
 *
 * Pages whose slug has no price in the data get the Product @type dropped to a
 * plain Thing (still valid, no Product-snippet requirement) rather than left
 * broken.
 *
 * Usage: NODE_PATH=api/node_modules node scripts/fix-flooring-schema.js [--write]
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const write = process.argv.includes('--write');

const data = require(path.join(ROOT, 'data', 'flooring-with-pricing.json'));
const items = Array.isArray(data) ? data : (data.flooring || data.products || Object.values(data)[0]);
const priceBySlug = {};
for (const it of items) {
  // price = flat guest/retail per-sqft number; price_sf = the tiered object.
  const p = Number(it.price) || (it.price_sf && Number(it.price_sf.guest)) || 0;
  if (it.slug && p > 0) priceBySlug[it.slug] = p;
}

const SITE = 'https://www.surprisegranite.com';
const priceValidUntil = new Date(Date.now() + 365 * 864e5).toISOString().slice(0, 10);
// Full merchant Offer: price + shipping (with delivery time) + 30-day return policy,
// matching the sinks/faucets pages so flooring is a complete Merchant-listings item.
function buildOffer(price, slug) {
  const shipVal = price >= 500 ? 0 : price >= 100 ? 25 : 15;
  return {
    '@type': 'Offer', price: price.toFixed(2), priceCurrency: 'USD', priceValidUntil,
    availability: 'https://schema.org/InStock', url: `${SITE}/flooring/${slug}/`,
    seller: { '@type': 'Organization', name: 'Surprise Granite', url: SITE },
    hasMerchantReturnPolicy: { '@type': 'MerchantReturnPolicy', applicableCountry: 'US',
      returnPolicyCategory: 'https://schema.org/MerchantReturnFiniteReturnWindow',
      merchantReturnDays: 30, returnMethod: 'https://schema.org/ReturnByMail',
      returnFees: 'https://schema.org/ReturnFeesCustomerResponsibility',
      merchantReturnLink: `${SITE}/legal/refund-policy/` },
    shippingDetails: { '@type': 'OfferShippingDetails',
      shippingRate: { '@type': 'MonetaryAmount', value: shipVal.toFixed(2), currency: 'USD' },
      shippingDestination: { '@type': 'DefinedRegion', addressCountry: 'US' },
      deliveryTime: { '@type': 'ShippingDeliveryTime',
        handlingTime: { '@type': 'QuantitativeValue', minValue: 0, maxValue: 2, unitCode: 'DAY' },
        transitTime: { '@type': 'QuantitativeValue', minValue: 3, maxValue: 7, unitCode: 'DAY' } } },
  };
}

const dir = path.join(ROOT, 'flooring');
const slugs = fs.readdirSync(dir).filter((d) => fs.existsSync(path.join(dir, d, 'index.html')));

const stats = { total: 0, priced: 0, downgraded: 0, noSchema: 0, unchanged: 0 };
for (const slug of slugs) {
  const file = path.join(dir, slug, 'index.html');
  let html = fs.readFileSync(file, 'utf8');
  const m = html.match(/(<script[^>]*application\/ld\+json[^>]*>)([\s\S]*?)(<\/script>)/);
  if (!m) { stats.noSchema++; continue; }
  let obj;
  try { obj = JSON.parse(m[2]); } catch { stats.noSchema++; continue; }
  if (obj['@type'] !== 'Product') { stats.unchanged++; continue; }
  stats.total++;

  const existingOffer = (obj.offers && typeof obj.offers === 'object' && !Array.isArray(obj.offers)) ? obj.offers : null;
  const price = priceBySlug[slug] || (existingOffer && Number(existingOffer.price)) || 0;
  if (price > 0) {
    // Add the Offer, or upgrade an earlier minimal one to the full merchant Offer
    // (shipping + delivery time + return policy). Idempotent — safe to re-run.
    obj.offers = buildOffer(price, slug);
    stats.priced++;
  } else if (!existingOffer) {
    // No price to justify a Product — make it a plain Thing so it's still valid
    // structured data but no longer subject to the Product-snippet requirement.
    obj['@type'] = 'Thing';
    stats.downgraded++;
  } else { stats.unchanged++; continue; }

  if (write) {
    const rebuilt = m[1] + JSON.stringify(obj) + m[3];
    fs.writeFileSync(file, html.replace(m[0], rebuilt));
  }
}

console.log('=== flooring Product-schema fix ===');
console.log('pages:', slugs.length, '| bare Product found:', stats.total);
console.log('  + Offer added (priced):', stats.priced);
console.log('  -> downgraded to Thing (no price):', stats.downgraded);
console.log('  already ok / no schema:', stats.unchanged + stats.noSchema);
console.log(write ? '\nWROTE changes.' : '\nDRY RUN — add --write');
