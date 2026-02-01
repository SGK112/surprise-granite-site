/**
 * Flooring Pricing Service
 *
 * Handles flooring-specific pricing calculations including:
 * - Per-SF and per-box pricing
 * - Collection-based wholesale costs
 * - Coverage calculations for projects
 * - Tier-based retail pricing
 */

const logger = require('../utils/logger');

// MSI Flooring Collections with wholesale pricing
const FLOORING_COLLECTIONS = {
  andover: {
    name: 'Andover',
    cost_per_sf: 2.29,
    cost_per_box: 50.38,
    sf_per_box: 22,
    wear_layer: '20mil',
    dimensions: '7x48',
    thickness: '5.5mm',
    type: 'LVP'
  },
  ashton: {
    name: 'Ashton',
    cost_per_sf: 2.29,
    cost_per_box: 50.38,
    sf_per_box: 22,
    wear_layer: '20mil',
    dimensions: '7x48',
    thickness: '5.5mm',
    type: 'LVP'
  },
  wilmont: {
    name: 'Wilmont',
    cost_per_sf: 2.49,
    cost_per_box: 54.78,
    sf_per_box: 22,
    wear_layer: '20mil',
    dimensions: '7x48',
    thickness: '6.5mm',
    type: 'SPC'
  },
  cyrus: {
    name: 'Cyrus',
    cost_per_sf: 1.99,
    cost_per_box: 46.57,
    sf_per_box: 23.4,
    wear_layer: '12mil',
    dimensions: '7x48',
    thickness: '5mm',
    type: 'SPC'
  },
  prescott: {
    name: 'Prescott',
    cost_per_sf: 2.69,
    cost_per_box: 62.95,
    sf_per_box: 23.4,
    wear_layer: '20mil',
    dimensions: '7x48',
    thickness: '6mm',
    type: 'SPC'
  },
  katavia: {
    name: 'Katavia',
    cost_per_sf: 1.69,
    cost_per_box: 37.18,
    sf_per_box: 22,
    wear_layer: '6mil',
    dimensions: '6x48',
    thickness: '2mm',
    type: 'LVP'
  },
  lowcountry: {
    name: 'Lowcountry',
    cost_per_sf: 2.79,
    cost_per_box: 65.23,
    sf_per_box: 23.4,
    wear_layer: '20mil',
    dimensions: '9x48',
    thickness: '6.5mm',
    type: 'SPC'
  },
  xl_cyrus: {
    name: 'XL Cyrus',
    cost_per_sf: 2.59,
    cost_per_box: 60.61,
    sf_per_box: 23.4,
    wear_layer: '12mil',
    dimensions: '9x60',
    thickness: '5mm',
    type: 'SPC'
  },
  xl_prescott: {
    name: 'XL Prescott',
    cost_per_sf: 2.99,
    cost_per_box: 69.97,
    sf_per_box: 23.4,
    wear_layer: '20mil',
    dimensions: '9x60',
    thickness: '6mm',
    type: 'SPC'
  },
  everlife: {
    name: 'Everlife',
    cost_per_sf: 2.89,
    cost_per_box: 67.63,
    sf_per_box: 23.4,
    wear_layer: '22mil',
    dimensions: '7x48',
    thickness: '6.5mm',
    type: 'SPC'
  }
};

const DEFAULT_COLLECTION = {
  name: 'Standard',
  cost_per_sf: 2.29,
  cost_per_box: 50.38,
  sf_per_box: 22,
  wear_layer: '20mil',
  dimensions: '7x48',
  thickness: '5.5mm',
  type: 'LVP'
};

// Tier markup percentages
const TIER_MARKUPS = {
  guest: 1.55,      // 55% markup
  homeowner: 1.50,  // 50% markup
  pro: 1.35,        // 35% markup
  designer: 1.30,   // 30% markup
  contractor: 1.25, // 25% markup
  fabricator: 1.15  // 15% markup
};

/**
 * Get collection info by name or product name
 * @param {string} name - Collection name or product name
 * @returns {object} Collection pricing info
 */
function getCollection(name) {
  if (!name) return DEFAULT_COLLECTION;

  const normalized = name.toLowerCase().replace(/\s+/g, '_').replace(/-/g, '_');

  // Direct collection match
  if (FLOORING_COLLECTIONS[normalized]) {
    return { id: normalized, ...FLOORING_COLLECTIONS[normalized] };
  }

  // Search in product name
  for (const [id, collection] of Object.entries(FLOORING_COLLECTIONS)) {
    const searchTerms = [id, id.replace(/_/g, ' '), id.replace(/_/g, '-')];
    for (const term of searchTerms) {
      if (normalized.includes(term)) {
        return { id, ...collection };
      }
    }
  }

  return { id: 'default', ...DEFAULT_COLLECTION };
}

/**
 * Get markup multiplier for user tier
 * @param {string} tier - User tier
 * @returns {number} Markup multiplier
 */
function getMarkup(tier) {
  return TIER_MARKUPS[tier] || TIER_MARKUPS.guest;
}

/**
 * Calculate retail price from wholesale
 * @param {number} wholesale - Wholesale cost
 * @param {string} tier - User tier
 * @returns {number} Retail price
 */
function calculateRetailPrice(wholesale, tier = 'guest') {
  const markup = getMarkup(tier);
  return Math.round(wholesale * markup * 100) / 100;
}

/**
 * Get flooring pricing for a product
 * @param {string} productName - Product name or collection
 * @param {string} tier - User pricing tier
 * @returns {object} Pricing information
 */
function getFlooringPricing(productName, tier = 'guest') {
  const collection = getCollection(productName);
  const markup = getMarkup(tier);

  return {
    collection: collection.name,
    collection_id: collection.id,
    type: collection.type,
    dimensions: collection.dimensions,
    thickness: collection.thickness,
    wear_layer: collection.wear_layer,
    sf_per_box: collection.sf_per_box,
    pricing: {
      wholesale: {
        per_sf: collection.cost_per_sf,
        per_box: collection.cost_per_box
      },
      retail: {
        per_sf: calculateRetailPrice(collection.cost_per_sf, tier),
        per_box: calculateRetailPrice(collection.cost_per_box, tier)
      },
      tier: tier,
      markup_percent: Math.round((markup - 1) * 100)
    }
  };
}

/**
 * Calculate flooring project estimate
 * @param {object} params - Project parameters
 * @param {string} params.product - Product name or collection
 * @param {number} params.sqft - Square footage needed
 * @param {string} params.tier - User pricing tier
 * @param {number} params.waste_percent - Waste factor (default 10%)
 * @param {boolean} params.include_installation - Include installation cost
 * @returns {object} Project estimate
 */
function calculateProjectEstimate(params) {
  const {
    product,
    sqft,
    tier = 'guest',
    waste_percent = 10,
    include_installation = false
  } = params;

  if (!sqft || sqft <= 0) {
    throw new Error('Square footage must be greater than 0');
  }

  const collection = getCollection(product);
  const markup = getMarkup(tier);

  // Add waste factor
  const adjustedSqFt = sqft * (1 + waste_percent / 100);

  // Calculate boxes needed (round up)
  const boxesNeeded = Math.ceil(adjustedSqFt / collection.sf_per_box);
  const actualSqFt = boxesNeeded * collection.sf_per_box;

  // Calculate material costs
  const wholesaleMaterial = actualSqFt * collection.cost_per_sf;
  const retailMaterial = wholesaleMaterial * markup;

  // Installation cost estimate ($3-5/sf typical)
  const installationCostPerSf = 4.00;
  const installationTotal = include_installation ? actualSqFt * installationCostPerSf : 0;

  // Build estimate
  const estimate = {
    product: {
      name: product,
      collection: collection.name,
      collection_id: collection.id,
      type: collection.type,
      dimensions: collection.dimensions,
      wear_layer: collection.wear_layer
    },
    coverage: {
      requested_sqft: sqft,
      waste_percent: waste_percent,
      adjusted_sqft: Math.round(adjustedSqFt * 100) / 100,
      boxes_needed: boxesNeeded,
      sf_per_box: collection.sf_per_box,
      actual_coverage: actualSqFt,
      overage_sqft: Math.round((actualSqFt - sqft) * 100) / 100
    },
    pricing: {
      tier: tier,
      markup_percent: Math.round((markup - 1) * 100),
      unit_prices: {
        wholesale_per_sf: collection.cost_per_sf,
        retail_per_sf: calculateRetailPrice(collection.cost_per_sf, tier),
        wholesale_per_box: collection.cost_per_box,
        retail_per_box: calculateRetailPrice(collection.cost_per_box, tier)
      },
      material: {
        wholesale: Math.round(wholesaleMaterial * 100) / 100,
        retail: Math.round(retailMaterial * 100) / 100
      }
    },
    totals: {
      material: Math.round(retailMaterial * 100) / 100,
      installation: include_installation ? Math.round(installationTotal * 100) / 100 : null,
      grand_total: Math.round((retailMaterial + installationTotal) * 100) / 100
    },
    savings: {
      vs_guest: tier !== 'guest'
        ? Math.round((sqft * collection.cost_per_sf * TIER_MARKUPS.guest) - retailMaterial)
        : 0,
      percent_saved: tier !== 'guest'
        ? Math.round((1 - markup / TIER_MARKUPS.guest) * 100)
        : 0
    }
  };

  return estimate;
}

/**
 * Get pricing for multiple tiers (comparison)
 * @param {string} product - Product name
 * @param {number} sqft - Square footage
 * @returns {object} Pricing comparison across tiers
 */
function getPricingComparison(product, sqft = 100) {
  const collection = getCollection(product);
  const comparison = {
    product: collection.name,
    sqft: sqft,
    tiers: {}
  };

  for (const [tierName, markup] of Object.entries(TIER_MARKUPS)) {
    const estimate = calculateProjectEstimate({
      product,
      sqft,
      tier: tierName,
      waste_percent: 10,
      include_installation: false
    });

    comparison.tiers[tierName] = {
      per_sf: estimate.pricing.unit_prices.retail_per_sf,
      per_box: estimate.pricing.unit_prices.retail_per_box,
      total: estimate.totals.material,
      savings_vs_guest: estimate.savings.vs_guest
    };
  }

  return comparison;
}

/**
 * List all available collections with pricing
 * @param {string} tier - User tier for retail prices
 * @returns {array} Collections with pricing
 */
function listCollections(tier = 'guest') {
  const collections = [];

  for (const [id, collection] of Object.entries(FLOORING_COLLECTIONS)) {
    collections.push({
      id,
      name: collection.name,
      type: collection.type,
      dimensions: collection.dimensions,
      thickness: collection.thickness,
      wear_layer: collection.wear_layer,
      sf_per_box: collection.sf_per_box,
      wholesale_per_sf: collection.cost_per_sf,
      retail_per_sf: calculateRetailPrice(collection.cost_per_sf, tier),
      retail_per_box: calculateRetailPrice(collection.cost_per_box, tier)
    });
  }

  // Sort by price (lowest first)
  collections.sort((a, b) => a.wholesale_per_sf - b.wholesale_per_sf);

  return collections;
}

/**
 * Process flooring price sheet upload
 * @param {array} rows - Parsed CSV rows
 * @param {object} columnMapping - Column mapping
 * @returns {object} Processed pricing data
 */
function processFlooringPriceSheet(rows, columnMapping) {
  const processed = [];
  const errors = [];
  const warnings = [];

  const skuCol = columnMapping.sku;
  const nameCol = columnMapping.name;
  const priceSfCol = columnMapping.wholesale_price_sf;
  const priceBoxCol = columnMapping.wholesale_price_box;
  const collectionCol = columnMapping.collection;
  const sfPerBoxCol = columnMapping.sf_per_box;

  for (const row of rows) {
    const rowNum = row._rowNumber;

    try {
      const sku = row[skuCol]?.trim();
      const name = row[nameCol]?.trim();
      const priceSf = parseFloat(row[priceSfCol]?.replace(/[$,]/g, ''));
      const priceBox = priceBoxCol ? parseFloat(row[priceBoxCol]?.replace(/[$,]/g, '')) : null;
      const collection = collectionCol ? row[collectionCol]?.trim() : null;
      const sfPerBox = sfPerBoxCol ? parseFloat(row[sfPerBoxCol]) : null;

      if (!sku) {
        errors.push({ row: rowNum, message: 'Missing SKU' });
        continue;
      }

      if (isNaN(priceSf) || priceSf <= 0) {
        errors.push({ row: rowNum, message: `Invalid price per SF: ${row[priceSfCol]}` });
        continue;
      }

      // Validate price ranges
      if (priceSf < 0.50) {
        warnings.push({ row: rowNum, message: `Price per SF seems too low: $${priceSf}` });
      }
      if (priceSf > 15.00) {
        warnings.push({ row: rowNum, message: `Price per SF seems high: $${priceSf}` });
      }

      processed.push({
        sku,
        name: name || sku,
        wholesale_cost_sf: Math.round(priceSf * 10000) / 10000,
        wholesale_cost_box: priceBox ? Math.round(priceBox * 100) / 100 : null,
        collection: collection || detectCollectionFromName(name || sku),
        sf_per_box: sfPerBox || 22,
        _rowNumber: rowNum
      });
    } catch (err) {
      errors.push({ row: rowNum, message: err.message });
    }
  }

  return { processed, errors, warnings };
}

/**
 * Detect collection from product name
 */
function detectCollectionFromName(name) {
  if (!name) return 'unknown';

  const normalized = name.toLowerCase();

  for (const collectionId of Object.keys(FLOORING_COLLECTIONS)) {
    const searchTerm = collectionId.replace(/_/g, ' ');
    if (normalized.includes(searchTerm)) {
      return collectionId;
    }
  }

  return 'unknown';
}

module.exports = {
  FLOORING_COLLECTIONS,
  TIER_MARKUPS,
  getCollection,
  getMarkup,
  calculateRetailPrice,
  getFlooringPricing,
  calculateProjectEstimate,
  getPricingComparison,
  listCollections,
  processFlooringPriceSheet,
  detectCollectionFromName
};
