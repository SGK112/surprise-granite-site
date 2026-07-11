#!/usr/bin/env node
/**
 * Site-wide structured-data (JSON-LD) offer audit.
 *
 * Google Merchant listings / Product snippets reject offers that aren't typed
 * `Offer` or `AggregateOffer` (a common mistake is `UnitPriceSpecification`,
 * which is only valid NESTED inside an Offer as `priceSpecification`), and flag
 * any `Product` that lacks offers/review/aggregateRating.
 *
 * This scans every *.html for both problems. Run after any change that touches
 * ld+json (collection pages, vendor pages, product generators).
 *
 * Usage: node scripts/audit-structured-data.js
 */
const fs = require('fs'), path = require('path');
const VALID = new Set(['Offer', 'AggregateOffer']);
const badTypes = {}, filesWithBad = new Set(), noOffersProducts = {};
let scanned = 0, withJson = 0;

function walkOffers(node, onOffer) {
  if (Array.isArray(node)) return node.forEach((n) => walkOffers(n, onOffer));
  if (node && typeof node === 'object') {
    for (const k of Object.keys(node)) {
      if (k === 'offers') {
        const vals = Array.isArray(node[k]) ? node[k] : [node[k]];
        vals.forEach((v) => { if (v && typeof v === 'object') onOffer(v['@type'] || '(none)'); });
      }
      walkOffers(node[k], onOffer);
    }
  }
}
function walkProducts(node, onProduct) {
  if (Array.isArray(node)) return node.forEach((n) => walkProducts(n, onProduct));
  if (node && typeof node === 'object') {
    const t = node['@type'];
    if (t === 'Product' || (Array.isArray(t) && t.includes('Product'))) onProduct(node);
    for (const k of Object.keys(node)) walkProducts(node[k], onProduct);
  }
}
function scan(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name === 'node_modules' || e.name.startsWith('.')) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) { scan(p); continue; }
    if (!e.name.endsWith('.html')) continue;
    scanned++;
    let html; try { html = fs.readFileSync(p, 'utf8'); } catch { continue; }
    const blocks = [...html.matchAll(/application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)];
    if (!blocks.length) continue; withJson++;
    for (const b of blocks) {
      let o; try { o = JSON.parse(b[1]); } catch { continue; }
      walkOffers(o, (type) => { if (!VALID.has(type)) { badTypes[type] = (badTypes[type] || 0) + 1; filesWithBad.add(p); } });
      walkProducts(o, (prod) => { if (!prod.offers && !prod.review && !prod.aggregateRating) noOffersProducts[p] = (noOffersProducts[p] || 0) + 1; });
    }
  }
}
scan('.');
console.log('scanned html:', scanned, '| with ld+json:', withJson);
console.log('\ninvalid offer @types (must be Offer/AggregateOffer):');
const bt = Object.entries(badTypes).sort((a, b) => b[1] - a[1]);
bt.length ? bt.forEach(([t, n]) => console.log('  ' + t + ': ' + n)) : console.log('  none ✓');
console.log('  files affected:', filesWithBad.size);
[...filesWithBad].slice(0, 30).forEach((f) => console.log('   - ' + f));
console.log('\nProducts with no offers/review/aggregateRating:');
const np = Object.entries(noOffersProducts);
np.length ? np.forEach(([f, n]) => console.log('   - ' + f + ' (' + n + ')')) : console.log('  none ✓');
process.exit(filesWithBad.size || np.length ? 1 : 0);
