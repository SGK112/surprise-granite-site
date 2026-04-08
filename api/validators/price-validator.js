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
    warnings: []
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

  // Validate each product item
  for (const item of productItems) {
    const validation = await validateSingleItem(item, supabase);

    if (validation.error) {
      result.errors.push(validation.error);
      result.valid = false;
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
    result.calculatedTotals.subtotal += validatedItem.validatedPrice * (item.quantity || 1);
  }

  // Calculate server-side totals (never trust client for these)
  result.calculatedTotals.shipping = calculateShipping(result.calculatedTotals.subtotal);
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

  // Skip validation for items under $0.50 (samples, free items)
  if (item.price < 50) {
    result.validatedPrice = item.price;
    result.priceSource = 'client_trusted_low_value';
    return result;
  }

  // Try to find product in database
  if (supabase) {
    try {
      let product = null;

      // Look up in distributor_products
      if (!product && item.id) {
        const { data: distProduct } = await supabase
          .from('distributor_products')
          .select('id, name, retail_price, wholesale_price')
          .eq('id', item.id)
          .single();

        if (distProduct) {
          product = { ...distProduct, source: 'distributor_products' };
        }
      }

      if (product && product.retail_price) {
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

  // Accept client price with warning for products not in DB
  result.validatedPrice = item.price;
  result.priceSource = 'client_unverified';
  result.warning = `Price for "${item.name}" could not be verified against database`;

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
