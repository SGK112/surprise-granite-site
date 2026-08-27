/**
 * Server-Side Price Validator
 *
 * Validates cart item prices against the database to prevent
 * price manipulation attacks from the client side.
 */

const path = require('path');

const logger = require('../utils/logger');

// Maximum allowed variance for price validation (0.01 = 1%)
// This accounts for minor rounding differences
const MAX_PRICE_VARIANCE = 0.01;

// Flat sample fee, in cents. A sample is a fixed-size chip, so it costs the
// same whatever the slab costs — never the material's per-sqft retail_price.
const SAMPLE_PRICE_CENTS = 1299;

// Natural stone is never sampled: every lot is unique, so buyers are sent to
// the stone yard instead (owner rule, 2026-07-06).
const NATURAL_STONE_RX = /granite|quartzite|marble|dolomite|limestone|travertine|onyx|soapstone|slate|semi.?precious/i;

// Brands we can source a chip for. Catalog rows carry this as sample_eligible;
// the static countertop colors below have no catalog row, so they're gated on
// brand instead.
//
// This is a BRAND rule, not a vendor one. Silestone/Sensa are Cosentino brands;
// PentalQuartz comes through Architectural Surfaces; LX Hausys IS LX Viatera and
// comes through Monterrey Tile, who supply its samples even though they cut no
// chips of their own stone. HanStone is NOT LX (owner, 2026-07-10) — it is a
// separate brand and a local yard. Everything else — the local yards' own
// material — is not sampleable.
const SAMPLE_BRANDS = new Set([
  'msi-surfaces', 'arizona-tile', 'daltile', 'cosentino', 'silestone', 'sensa',
  'arcsurfaces', 'pentalquartz', 'lx-hausys', 'lx-viatera',
]);

// Tax rates by state (combined state + avg local)
const STATE_TAX_RATES = {
  AZ: 0.081,  AL: 0.092,  AR: 0.094,  CA: 0.0875, CO: 0.075,
  CT: 0.0635, DC: 0.06,   FL: 0.07,   GA: 0.074,  HI: 0.044,
  ID: 0.06,   IL: 0.0882, IN: 0.07,   IA: 0.06,   KS: 0.087,
  KY: 0.06,   LA: 0.0955, ME: 0.055,  MD: 0.06,   MA: 0.0625,
  MI: 0.06,   MN: 0.0773, MS: 0.07,   MO: 0.082,  NE: 0.069,
  NV: 0.082,  NJ: 0.066,  NM: 0.073,  NY: 0.08,   NC: 0.07,
  ND: 0.069,  OH: 0.0723, OK: 0.089,  PA: 0.06,   RI: 0.07,
  SC: 0.074,  SD: 0.064,  TN: 0.0955, TX: 0.0825, UT: 0.071,
  VT: 0.06,   VA: 0.057,  WA: 0.092,  WV: 0.06,   WI: 0.055,
  WY: 0.054
  // States with no sales tax: AK, DE, MT, NH, OR — default to 0
};
const DEFAULT_TAX_RATE = 0; // No tax if state unknown or tax-free

// Shipping tiers
const SHIPPING_TIERS = [
  { maxSubtotal: 0, shipping: 0 },
  { maxSubtotal: 100, shipping: 1500 },      // $15 for orders < $100
  { maxSubtotal: 500, shipping: 2500 },      // $25 for orders $100-$500
  { maxSubtotal: Infinity, shipping: 0 }      // Free shipping > $500
];

/**
 * Calculate shipping based on subtotal
 * @param {number} subtotalCents - Subtotal in cents
 * @returns {number} Shipping amount in cents
 */
function calculateShipping(subtotalCents) {
  const subtotalDollars = subtotalCents / 100;

  for (const tier of SHIPPING_TIERS) {
    if (subtotalDollars < tier.maxSubtotal) {
      return tier.shipping;
    }
  }
  return 0; // Free shipping
}

// Oversized/LTL items, and what delivery actually costs us, keyed by slug and SKU.
// The tiers above are fine for parcel goods but catastrophic for freight: a tub costs
// $460–$890 to ship and, being expensive, always cleared the $500 "free shipping" line —
// so the threshold guaranteed we ate the freight. An audit against the JAN 2026 vendor
// datasheets found 48 of 301 products losing money on a single-item order, worst -$326.
// Freight SKUs are billed their real freight and kept OUT of the tier subtotal, so they
// can't buy free shipping for the rest of the cart. Regenerate with
// scripts/build-freight-table.js when a vendor sends a new datasheet.
let FREIGHT_TABLE = {};
let PARCEL_TABLE = {};
try {
  // eslint-disable-next-line global-require
  const loaded = require('../../data/shipping-freight.json');
  FREIGHT_TABLE = (loaded && loaded.freight) || {};
  PARCEL_TABLE = (loaded && loaded.parcel) || {};
} catch (err) {
  // Missing table must never take checkout down — it degrades to the old tier behaviour.
  console.warn('[price-validator] shipping-freight.json not loaded:', err.message);
}

function lookupCents(table, item, matchedSlug) {
  for (const raw of [matchedSlug, item && item.id, item && item.sku, item && item.slug, item && item.handle]) {
    if (!raw) continue;
    const k = String(raw).trim();
    const hit = table[k.toLowerCase()] ?? table[k.toUpperCase()];
    if (hit) return Math.round(Number(hit) * 100);
  }
  return 0;
}

/** Real freight for an OVERSIZED/LTL item, in cents. 0 means it ships parcel. */
function freightCentsFor(item, matchedSlug) {
  return lookupCents(FREIGHT_TABLE, item, matchedSlug);
}

/** Real ground cost for a PARCEL item, in cents. Used to floor the tier, never to replace it. */
function parcelCentsFor(item, matchedSlug) {
  return lookupCents(PARCEL_TABLE, item, matchedSlug);
}

/**
 * Calculate tax based on shipping state
 * @param {number} subtotalCents - Subtotal in cents
 * @param {string} state - Two-letter state code
 * @returns {number} Tax amount in cents
 */
function calculateTax(subtotalCents, state) {
  const stateCode = (state || '').toUpperCase().trim();
  const rate = STATE_TAX_RATES[stateCode] !== undefined ? STATE_TAX_RATES[stateCode] : DEFAULT_TAX_RATE;
  return Math.round(subtotalCents * rate);
}

/**
 * Validate cart items against database prices
 *
 * @param {Array} items - Cart items with {id, name, price, quantity}
 * @param {object} supabase - Supabase client
 * @returns {object} Validation result
 */
async function validateCartPrices(items, supabase, shippingState) {
  const result = {
    valid: true,
    validatedItems: [],
    calculatedTotals: {
      subtotal: 0,
      shipping: 0,
      tax: 0,
      total: 0
    },
    errors: [],
    warnings: [],
    unmatchedItems: []
  };

  if (!items || items.length === 0) {
    result.valid = false;
    result.errors.push('No items provided');
    return result;
  }

  // Separate product items from calculated items (tax, shipping)
  const productItems = items.filter(item =>
    !['Tax', 'Shipping', 'Tax (AZ 8.1%)'].some(n => item.name?.includes(n))
  );

  // Validate each product item, bucketing line totals by vendor so shipping
  // can be charged per vendor (each vendor drop-ships + bills freight separately).
  const vendorSubtotals = {};
  let freightTotal = 0;         // real LTL/oversize freight, in cents, billed per item
  const parcelFreight = {};     // real ground cost per vendor, in cents — floors the tier
  for (const item of productItems) {
    const validation = await validateSingleItem(item, supabase);

    if (validation.error) {
      result.errors.push(validation.error);
      result.valid = false;
      if (validation.unmatched) result.unmatchedItems.push(validation.unmatched);
    } else if (validation.warning) {
      result.warnings.push(validation.warning);
    }

    // Use validated price, falling back to provided price with warning.
    //
    // resolvedVendorId is the vendor WE matched, not anything the client sent.
    // It has to ride along on the item: the Stripe webhook rebuilds the stored
    // order purely from Stripe line items, so anything not attached here is
    // gone by the time staff need it. Vendor POs used to print "Confirm vendor
    // before sending" on every order because of exactly that gap, and a sample
    // order for "Sedona" — a name two active vendors share — could not be
    // fulfilled at all without re-deriving the vendor by hand.
    const validatedItem = {
      ...item,
      validatedPrice: validation.validatedPrice || item.price,
      priceSource: validation.priceSource || 'client',
      resolvedVendorId: validation.vendorId || null,
      resolvedSku: validation.resolvedSku || item.sku || null,
      resolvedSlug: validation.resolvedSlug || null
    };

    result.validatedItems.push(validatedItem);
    const lineTotal = validatedItem.validatedPrice * (item.quantity || 1);
    result.calculatedTotals.subtotal += lineTotal;

    // Freight-class items bill their own real freight and stay out of the tier subtotal —
    // otherwise a $1,200 tub would push the cart over $500 and make the whole order ship free
    // while costing us $500 to deliver.
    const unitFreight = freightCentsFor(item, validation.slug);
    if (unitFreight > 0) {
      freightTotal += unitFreight * (item.quantity || 1);
      continue;
    }

    // Group by vendor (matched catalog vendor_id; else the item's brand/variant; else one bucket)
    const vKey = validation.vendorId
      || (item.vendor_id || item.vendor || item.variant || item.brand || '').toString().toLowerCase().trim()
      || 'default';
    vendorSubtotals[vKey] = (vendorSubtotals[vKey] || 0) + lineTotal;
    parcelFreight[vKey] = (parcelFreight[vKey] || 0) + parcelCentsFor(item, validation.slug) * (item.quantity || 1);
  }

  // Calculate server-side totals (never trust client for these).
  // Per-vendor shipping: charge the shipping tier PER vendor and sum. A flat
  // cart-wide fee lost money on multi-vendor orders — e.g. samples from 3
  // vendors = 3 separate shipments (3x ~$10 freight) but only one $15 charge.
  const shippingByVendor = {};
  let shippingTotal = 0;
  for (const vKey of Object.keys(vendorSubtotals)) {
    const sub = vendorSubtotals[vKey];
    const tier = calculateShipping(sub);
    // Above the free-shipping threshold the margin absorbs ground freight, and keeping that
    // promise is what earns repeat orders. Below it, never collect less than the shipment
    // actually costs — a $60 ground charge must not hide behind a $15 tier.
    const FREE_AT_CENTS = 50000;
    const s = sub >= FREE_AT_CENTS ? tier : Math.max(tier, parcelFreight[vKey] || 0);
    shippingByVendor[vKey] = s;
    shippingTotal += s;
  }
  result.calculatedTotals.shipping = shippingTotal + freightTotal;
  result.calculatedTotals.freight = freightTotal;
  result.calculatedTotals.shippingByVendor = shippingByVendor;
  result.calculatedTotals.vendorCount = Object.keys(vendorSubtotals).length;
  result.calculatedTotals.tax = calculateTax(result.calculatedTotals.subtotal, shippingState);
  result.calculatedTotals.taxState = (shippingState || '').toUpperCase() || 'NONE';
  result.calculatedTotals.taxRate = STATE_TAX_RATES[(shippingState || '').toUpperCase()] || 0;
  result.calculatedTotals.total =
    result.calculatedTotals.subtotal +
    result.calculatedTotals.shipping +
    result.calculatedTotals.tax;

  return result;
}

/**
 * Colors we publish a page for but have no catalog_products row for — 379 of
 * the 434 sampleable colors as of 2026-07. Their samples still have to sell,
 * so the static dataset backs the allowlist alongside the catalog.
 *
 * Excludes natural stone, and any brand we can't source a chip from — without
 * the brand gate this list resold local-yard samples that the catalog's
 * sample_eligible flag had already turned off.
 *
 * @returns {{bySlug: Map, byName: Map}} Sampleable countertops, keyed both ways
 */
let sampleableCache = null;
function sampleableCountertops() {
  if (sampleableCache) return sampleableCache;

  const bySlug = new Map();
  const byName = new Map();
  try {
    const { countertops } = require(path.join(__dirname, '../../data/countertops.json'));
    for (const product of countertops || []) {
      if (NATURAL_STONE_RX.test(product.type || '')) continue;
      if (!SAMPLE_BRANDS.has(String(product.brand || '').toLowerCase())) continue;
      if (product.slug) bySlug.set(product.slug.toLowerCase(), product);
      if (product.name) byName.set(product.name.toLowerCase(), product);
    }
  } catch (err) {
    logger.warn('Sampleable countertop list unavailable', { error: err.message });
  }

  sampleableCache = { bySlug, byName };
  return sampleableCache;
}

/**
 * Every colour we publish, sampleable or not, so a refused sample can say WHY.
 *
 * "Absolute Black granite" and "a colour we have never heard of" both used to
 * arrive as one alert reading "possible price tampering, or a product missing
 * from the catalog". The first is the sampling policy working exactly as the
 * owner specified, and alarming on it teaches staff to ignore the alert that
 * matters. Only the second is a lost sale.
 */
let allColoursCache = null;
function allCountertopColours() {
  if (allColoursCache) return allColoursCache;
  const bySlug = new Map();
  const byName = new Map();
  try {
    const { countertops } = require(path.join(__dirname, '../../data/countertops.json'));
    for (const product of countertops || []) {
      if (product.slug) bySlug.set(product.slug.toLowerCase(), product);
      if (product.name) byName.set(product.name.toLowerCase(), product);
    }
  } catch (err) {
    logger.warn('Countertop colour list unavailable', { error: err.message });
  }
  allColoursCache = { bySlug, byName };
  return allColoursCache;
}

/**
 * Why did a sample fail to resolve?
 *   'not_sampleable'  — we publish this colour, but policy says no chip for it
 *                       (natural stone, or a brand no distributor will cut).
 *   'no_server_price' — we cannot identify it at all: tampering, or a genuinely
 *                       missing product, and possibly a lost sale.
 */
function classifySampleRefusal(item) {
  const { bySlug, byName } = allCountertopColours();
  const base = baseProductName(item.name);
  const known = bySlug.get(String(item.id || '').toLowerCase())
    || byName.get(String(base || '').toLowerCase())
    || byName.get(String(item.name || '').toLowerCase());
  if (!known) return { reason: 'no_server_price' };

  const type = known.type || '';
  const brand = String(known.brand || '').toLowerCase();
  const why = NATURAL_STONE_RX.test(type)
    ? `${type || 'natural stone'} — we don't sample natural stone`
    : `brand "${brand || 'unknown'}" is not one we can source a chip from`;
  return { reason: 'not_sampleable', why };
}

/**
 * A sample line item, by any of the shapes the three add-to-cart paths emit:
 * "Kensho (Sample)" (marketplace), "Kensho - Sample" (countertop pages),
 * or an explicit variant/category tag.
 */
function isSampleItem(item) {
  const variant = String(item.variant || '').trim().toLowerCase();
  const category = String(item.category || '').trim().toLowerCase();
  if (variant === 'sample' || category === 'samples') return true;
  return /\(\s*sample\s*\)$|[-–]\s*sample$/i.test(String(item.name || '').trim());
}

/** "Kensho (Sample)" -> "Kensho", so the name can be matched against a product. */
function baseProductName(name) {
  return String(name || '')
    .trim()
    .replace(/\(\s*sample\s*\)$/i, '')
    .replace(/[-–]\s*sample$/i, '')
    .trim();
}

/**
 * Confirm we actually sample this product. Identity must resolve; the price
 * never comes from the client.
 *
 * @returns {?{vendorId: ?string, source: string}} null when we don't sample it
 */
async function resolveSampleableProduct(item, supabase) {
  const base = baseProductName(item.name);

  // A slug/sku IDENTIFIES the product. If it names something we know, that thing
  // decides the answer — never fall through to a name lookup, because display
  // names collide across colours and materials.
  //
  // `white-pearl-granite` is not sampleable, so its slug missed, and the search
  // continued to the name "White Pearl", which matched a DIFFERENT, quartz
  // colour of the same name. The server then charged $12.99 for a granite chip
  // we do not stock. `avenza-quartz-bolder-image-stone` resolved the same way
  // through "Avenza". The name fallback exists for carts that carry no id at
  // all, and must only run then.
  const identity = item.id || item.handle || item.sku;

  // The static list slugs a colour `<name>-<material>`; the catalog slugs it
  // `<name>`. `white-egeo-granite` therefore missed its catalog row (`white-egeo`,
  // Granite, sample_eligible=false), fell through to data/countertops.json — which
  // wrongly calls it Quartz — and checkout sold a granite chip for $12.99.
  //
  // Try the base slug too, EXACTLY. Never a prefix match: `arctic-quartz` must not
  // resolve to `arctic-ice`, which is a different stone.
  const baseSlug = (s) => String(s || '').replace(/-(quartz|granite|marble|quartzite|dekton|porcelain|soapstone)$/i, '') || null;

  // The catalog is authoritative and carries vendor_id, which the caller needs
  // to charge shipping per vendor (each vendor drop-ships separately).
  if (supabase) {
    const idLookups = [
      ['slug', item.id],
      ['slug', item.handle],
      ['sku', item.sku],
      ['slug', baseSlug(item.id) !== item.id ? baseSlug(item.id) : null],
      ['slug', baseSlug(item.handle) !== item.handle ? baseSlug(item.handle) : null],
    ];
    for (const [column, value] of idLookups) {
      if (!value) continue;
      try {
        const { data } = await supabase
          .from('catalog_products')
          .select('vendor_id, sample_eligible, sku, slug')
          .eq(column, value).eq('active', true).limit(1).maybeSingle();
        if (data) {
          // Identity found. Its own flag is the verdict, either way.
          return data.sample_eligible
            ? { vendorId: data.vendor_id || null, sku: data.sku, slug: data.slug, source: 'catalog_sample' }
            : null;
        }
      } catch (err) {
        logger.debug('Sample catalog lookup failed', { column, error: err.message });
      }
    }

    if (!identity && base) {
      try {
        // Names collide across vendors: "Sedona" is BOTH a sampleable Daltile
        // slab and a non-sampleable Bolder Image Stone one, both active. The
        // old `.limit(1)` had no ORDER BY, so which vendor answered — and
        // therefore whether the sample sold at all — was left to Postgres.
        // Take every match and only sell when the answer is unambiguous.
        const { data } = await supabase
          .from('catalog_products')
          .select('vendor_id, sample_eligible, sku, slug')
          .eq('name', base).eq('active', true);
        const eligible = (data || []).filter(r => r.sample_eligible);
        if (eligible.length === 1) {
          const row = eligible[0];
          return { vendorId: row.vendor_id || null, sku: row.sku, slug: row.slug, source: 'catalog_sample' };
        }
        if (eligible.length > 1) {
          logger.warn('Ambiguous sample name — refusing rather than guessing the vendor', {
            name: base, vendors: eligible.map(r => r.vendor_id)
          });
          return null;
        }
      } catch (err) {
        logger.debug('Sample catalog name lookup failed', { error: err.message });
      }
    }
  }

  const { bySlug, byName } = sampleableCountertops();

  if (identity) {
    const key = String(identity).toLowerCase();
    const known = allCountertopColours().bySlug.get(key);
    // We publish this colour: sampleable iff it survived the policy filter.
    if (known) return bySlug.get(key) ? { vendorId: known.brand || null, slug: known.slug || null, source: 'static_countertops' } : null;
    // An id we have never seen falls through to the name, so a cart that sends a
    // stale slug for a colour we still sample keeps working.
  }

  const match = base && byName.get(base.toLowerCase());
  if (match) return { vendorId: match.brand || null, slug: match.slug || null, source: 'static_countertops' };

  return null;
}

/**
 * Validate a single cart item
 *
 * @param {object} item - Cart item
 * @param {object} supabase - Supabase client
 * @returns {object} Validation result for single item
 */
async function validateSingleItem(item, supabase) {
  const result = {
    validatedPrice: null,
    priceSource: null,
    vendorId: null,
    resolvedSku: null,
    resolvedSlug: null,
    error: null,
    warning: null
  };

  if (!item.name) {
    result.error = 'Item missing name';
    return result;
  }

  if (item.price === undefined || item.price === null) {
    result.error = `Item "${item.name}" missing price`;
    return result;
  }

  if (item.price < 0) {
    result.error = `Item "${item.name}" has invalid negative price`;
    return result;
  }

  // Samples are priced by us, at a flat fee, for any color we actually sample.
  // This must run before the catalog lookup below: most sampleable colors have
  // no catalog row at all (their checkout used to 400), and the ones that do
  // carry a per-sqft retail_price that would bill a 4x4 chip as a slab.
  // The client's price is ignored, so a tampered sample line just pays full
  // sample price — identity still has to resolve to something we sample.
  if (isSampleItem(item)) {
    const sampleable = await resolveSampleableProduct(item, supabase);
    if (sampleable) {
      result.validatedPrice = SAMPLE_PRICE_CENTS;
      result.priceSource = sampleable.source;
      result.vendorId = sampleable.vendorId;
      result.resolvedSku = sampleable.sku || null;
      result.resolvedSlug = sampleable.slug || null;
      return result;
    }

    const { reason, why } = classifySampleRefusal(item);
    result.error = reason === 'not_sampleable'
      ? `We don't offer samples of "${baseProductName(item.name)}". Call us at (602) 833-3189 and we'll help you see it in person.`
      : `We couldn't verify the price for "${item.name}". Please contact us at (602) 833-3189 to complete your order.`;
    result.unmatched = {
      id: item.id || null,
      sku: item.sku || null,
      name: item.name,
      clientPrice: item.price,
      reason,
      why: why || null
    };
    return result;
  }

  // Try to find product in database
  if (supabase) {
    try {
      let product = null;

      // CATALOG is the source of truth. The cart sends the product slug as
      // item.id (catalog products) — also try SKU and exact name so static
      // products that were ingested into the catalog are matched too.
      const catCols = 'id, name, retail_price, active, vendor_id, sku, slug';
      if (!product && item.id) {
        const { data } = await supabase.from('catalog_products').select(catCols)
          .eq('slug', item.id).eq('active', true).limit(1).maybeSingle();
        if (data && data.retail_price != null) product = { ...data, source: 'catalog_products' };
      }
      if (!product && item.sku) {
        const { data } = await supabase.from('catalog_products').select(catCols)
          .eq('sku', item.sku).eq('active', true).limit(1).maybeSingle();
        if (data && data.retail_price != null) product = { ...data, source: 'catalog_products' };
      }
      if (!product && item.name) {
        const { data } = await supabase.from('catalog_products').select(catCols)
          .eq('name', item.name).eq('active', true).limit(1).maybeSingle();
        if (data && data.retail_price != null) product = { ...data, source: 'catalog_products' };
      }

      // Legacy fallback: distributor_products by id.
      if (!product && item.id) {
        const { data: distProduct } = await supabase
          .from('distributor_products')
          .select('id, name, retail_price, wholesale_price')
          .eq('id', item.id)
          .maybeSingle();

        if (distProduct) {
          product = { ...distProduct, source: 'distributor_products' };
        }
      }

      if (product && product.retail_price) {
        // Capture the vendor so shipping can be charged per-vendor (each vendor
        // drop-ships separately and bills freight per shipment).
        result.vendorId = product.vendor_id || null;
        result.resolvedSku = product.sku || item.sku || null;
        result.resolvedSlug = product.slug || null;
        const dbPriceCents = Math.round(product.retail_price * 100);
        const clientPriceCents = item.price;

        // Check if prices match within tolerance
        const variance = Math.abs(dbPriceCents - clientPriceCents) / dbPriceCents;

        if (variance <= MAX_PRICE_VARIANCE) {
          // Use database price (authoritative)
          result.validatedPrice = dbPriceCents;
          result.priceSource = product.source || 'database';
          return result;
        } else {
          // Price mismatch - potential manipulation
          logger.warn('Price mismatch detected', {
            itemId: item.id,
            itemName: item.name,
            clientPrice: clientPriceCents,
            dbPrice: dbPriceCents,
            variance: `${(variance * 100).toFixed(2)}%`,
            source: product.source
          });

          // Use database price instead
          result.validatedPrice = dbPriceCents;
          result.priceSource = `${product.source}_override`;
          result.warning = `Price adjusted for "${item.name}" from $${(clientPriceCents/100).toFixed(2)} to $${(dbPriceCents/100).toFixed(2)}`;
          return result;
        }
      }
    } catch (err) {
      logger.debug('Product lookup failed', { itemId: item.id, error: err.message });
    }
  }

  // Product not found in database - apply reasonable limits
  // For unknown products, cap at $10,000 per item
  const MAX_ITEM_PRICE = 1000000; // $10,000 in cents

  if (item.price > MAX_ITEM_PRICE) {
    result.error = `Item "${item.name}" exceeds maximum allowed price`;
    return result;
  }

  // Low-value bypass (samples / genuinely free items) — only AFTER the DB
  // lookup confirmed no catalog/distributor product matched. Doing this up
  // front let an attacker POST a real product at 1-49¢ to skip validation
  // entirely and check out for pennies. Here, any item that matched a DB
  // product with a real price already returned above with the server price.
  if (item.price < 50) {
    result.validatedPrice = item.price;
    result.priceSource = 'client_trusted_low_value';
    return result;
  }

  // No server reference price for a non-trivial item — REJECT rather than
  // trust the client's price. Trusting it was a price-tampering hole: an
  // attacker could check out a real product at any price by sending an id/sku/
  // name that matches nothing. Every genuinely-sellable item resolves in the
  // catalog (verified: sinks/faucets/accessories/fixtures all have prices), so
  // an unmatched item is either tampering or a product missing from the
  // catalog. Mark it so the caller can alert staff to add the real product.
  result.error = `We couldn't verify the price for "${item.name}". Please contact us at (602) 833-3189 to complete your order.`;
  result.unmatched = {
    id: item.id || null,
    sku: item.sku || null,
    name: item.name,
    clientPrice: item.price,
    reason: 'no_server_price',
    why: null
  };
  return result;
}

/**
 * Build validated line items for Stripe
 *
 * @param {object} validation - Result from validateCartPrices
 * @returns {Array} Line items for Stripe checkout
 */
function buildStripeLineItems(validation) {
  const lineItems = [];

  // Add product items
  for (const item of validation.validatedItems) {
    lineItems.push({
      price_data: {
        currency: 'usd',
        product_data: {
          name: item.name,
          images: item.image ? [item.image] : [],
          metadata: {
            product_id: item.id || '',
            price_source: item.priceSource,
            // Read back by the checkout webhook. Stripe caps metadata values at
            // 500 chars; these are short ids.
            vendor_id: item.resolvedVendorId || '',
            sku: item.resolvedSku || '',
            slug: item.resolvedSlug || ''
          }
        },
        unit_amount: item.validatedPrice
      },
      quantity: item.quantity || 1
    });
  }

  // Add shipping (server-calculated)
  if (validation.calculatedTotals.shipping > 0) {
    lineItems.push({
      price_data: {
        currency: 'usd',
        product_data: {
          name: 'Shipping',
          metadata: { type: 'shipping' }
        },
        unit_amount: validation.calculatedTotals.shipping
      },
      quantity: 1
    });
  }

  // Add tax (server-calculated)
  if (validation.calculatedTotals.tax > 0) {
    lineItems.push({
      price_data: {
        currency: 'usd',
        product_data: {
          name: `Tax (${validation.calculatedTotals.taxState} ${(validation.calculatedTotals.taxRate * 100).toFixed(1)}%)`,
          metadata: { type: 'tax', state: validation.calculatedTotals.taxState }
        },
        unit_amount: validation.calculatedTotals.tax
      },
      quantity: 1
    });
  }

  return lineItems;
}

module.exports = {
  validateCartPrices,
  validateSingleItem,
  buildStripeLineItems,
  calculateShipping,
  calculateTax,
  isSampleItem,
  classifySampleRefusal,
  STATE_TAX_RATES,
  SHIPPING_TIERS,
  SAMPLE_PRICE_CENTS,
  // Exported so api/tests/unit/sampleableParity.test.js can assert the browser's
  // copy (js/sampleable.js) still agrees. The two drifting is what put an
  // "Order Sample" button on colours checkout refuses.
  NATURAL_STONE_RX,
  SAMPLE_BRANDS
};
