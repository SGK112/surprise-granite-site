/**
 * ONE copy of the delivery rule.
 *
 * It is already implemented in js/cart.js (what the shopper is shown) and in the
 * API's price-validator (what they are actually charged). The product page and the
 * Google Merchant feed both need to state it too, and a fourth and fifth copy would
 * drift — the repo has been bitten by exactly that before, which is why installed
 * pricing lives in api/lib/installedPricing.js. A shipping figure that disagrees
 * with checkout is worse than none: it is a promise broken at the last screen, and
 * in a Merchant feed it is grounds for item disapproval.
 *
 * THE RULE (per vendor, because each vendor drop-ships separately):
 *   freight SKU        -> its real LTL cost, always billed, never free
 *   subtotal >= $500   -> free
 *   subtotal >= $100   -> $25
 *   otherwise          -> $15
 *
 * Freight SKUs are tubs, toilets and shower panels that cost $350-890 to ship. They
 * are excluded from the free-shipping threshold on purpose: because the pricey items
 * are also the heavy ones, they all cleared $500 and the threshold guaranteed we ate
 * the freight — 48 of 301 audited products lost money on a single-item order, worst
 * -$326.
 */
const fs = require('fs');
const path = require('path');

const FREE_THRESHOLD = 500;
const TIER_MID = 100;
const TIER_LOW_FEE = 15;
const TIER_MID_FEE = 25;

let _table = null;
function freightTable(root) {
  if (_table === null) {
    try {
      _table = JSON.parse(fs.readFileSync(path.join(root, 'data', 'shipping-freight.json'), 'utf8')).freight || {};
    } catch (e) { _table = {}; }
  }
  return _table;
}

/** Real LTL cost for an oversized item, or 0 if it ships parcel. */
function freightFor(product, root) {
  const t = freightTable(root);
  for (const k of [product.sku, product.slug, product.handle, product.id]) {
    if (!k) continue;
    const hit = t[String(k)] ?? t[String(k).toUpperCase()] ?? t[String(k).toLowerCase()];
    if (hit) return Number(hit) || 0;
  }
  return 0;
}

/**
 * What a single-item order of this product costs to deliver.
 * Returns { cost, isFreight, isFree, toFree } — toFree is how much more spend
 * would earn free shipping (0 when already free or when the item is freight).
 */
function shippingFor(product, price, root) {
  const freight = freightFor(product, root);
  if (freight > 0) return { cost: freight, isFreight: true, isFree: false, toFree: 0 };
  if (price >= FREE_THRESHOLD) return { cost: 0, isFreight: false, isFree: true, toFree: 0 };
  const cost = price < TIER_MID ? TIER_LOW_FEE : TIER_MID_FEE;
  return { cost, isFreight: false, isFree: false, toFree: FREE_THRESHOLD - price };
}

module.exports = { shippingFor, freightFor, FREE_THRESHOLD };
