/**
 * Server-Side Price Validator
 *
 * Validates cart item prices against the database to prevent
 * price manipulation attacks from the client side.
 */

const logger = require('../utils/logger');

// Maximum allowed variance for price validation (0.01 = 1%)
// This accounts for minor rounding differences
const MAX_PRICE_VARIANCE = 0.01;

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
  for (const item of productItems) {
    const validation = await validateSingleItem(item, supabase);

    if (validation.error) {
      result.errors.push(validation.error);
      result.valid = false;
      if (validation.unmatched) result.unmatchedItems.push(validation.unmatched);
    } else if (validation.warning) {
      result.warnings.push(validation.warning);
    }

    // Use validated price, falling back to provided price with warning
    const validatedItem = {
      ...item,
      validatedPrice: validation.validatedPrice || item.price,
      priceSource: validation.priceSource || 'client'
    };

    result.validatedItems.push(validatedItem);
    const lineTotal = validatedItem.validatedPrice * (item.quantity || 1);
    result.calculatedTotals.subtotal += lineTotal;

    // Group by vendor (matched catalog vendor_id; else the item's brand/variant; else one bucket)
    const vKey = validation.vendorId
      || (item.vendor_id || item.vendor || item.variant || item.brand || '').toString().toLowerCase().trim()
      || 'default';
    vendorSubtotals[vKey] = (vendorSubtotals[vKey] || 0) + lineTotal;
  }

  // Calculate server-side totals (never trust client for these).
  // Per-vendor shipping: charge the shipping tier PER vendor and sum. A flat
  // cart-wide fee lost money on multi-vendor orders — e.g. samples from 3
  // vendors = 3 separate shipments (3x ~$10 freight) but only one $15 charge.
  const shippingByVendor = {};
  let shippingTotal = 0;
  for (const vKey of Object.keys(vendorSubtotals)) {
    const s = calculateShipping(vendorSubtotals[vKey]);
    shippingByVendor[vKey] = s;
    shippingTotal += s;
  }
  result.calculatedTotals.shipping = shippingTotal;
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

  // Try to find product in database
  if (supabase) {
    try {
      let product = null;

      // CATALOG is the source of truth. The cart sends the product slug as
      // item.id (catalog products) — also try SKU and exact name so static
      // products that were ingested into the catalog are matched too.
      const catCols = 'id, name, retail_price, active, vendor_id';
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
    clientPrice: item.price
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
            price_source: item.priceSource
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
  STATE_TAX_RATES,
  SHIPPING_TIERS
};
