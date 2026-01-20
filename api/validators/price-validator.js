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

// Tax rate (Arizona combined state + local)
const TAX_RATE = 0.081;

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
 * Calculate tax
 * @param {number} subtotalCents - Subtotal in cents
 * @returns {number} Tax amount in cents
 */
function calculateTax(subtotalCents) {
  return Math.round(subtotalCents * TAX_RATE);
}

/**
 * Validate cart items against database prices
 *
 * @param {Array} items - Cart items with {id, name, price, quantity}
 * @param {object} supabase - Supabase client
 * @returns {object} Validation result
 */
async function validateCartPrices(items, supabase) {
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
  result.calculatedTotals.tax = calculateTax(result.calculatedTotals.subtotal);
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
  if (supabase && item.id) {
    try {
      // Try distributor_products first
      const { data: product } = await supabase
        .from('distributor_products')
        .select('id, name, retail_price, wholesale_price')
        .eq('id', item.id)
        .single();

      if (product && product.retail_price) {
        const dbPriceCents = Math.round(product.retail_price * 100);
        const clientPriceCents = item.price;

        // Check if prices match within tolerance
        const variance = Math.abs(dbPriceCents - clientPriceCents) / dbPriceCents;

        if (variance <= MAX_PRICE_VARIANCE) {
          // Use database price (authoritative)
          result.validatedPrice = dbPriceCents;
          result.priceSource = 'database';
          return result;
        } else {
          // Price mismatch - potential manipulation
          logger.warn('Price mismatch detected', {
            itemId: item.id,
            itemName: item.name,
            clientPrice: clientPriceCents,
            dbPrice: dbPriceCents,
            variance: `${(variance * 100).toFixed(2)}%`
          });

          // Use database price instead
          result.validatedPrice = dbPriceCents;
          result.priceSource = 'database_override';
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
          name: 'Tax (AZ 8.1%)',
          metadata: { type: 'tax' }
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
  TAX_RATE,
  SHIPPING_TIERS
};
