/**
 * Flooring API Routes
 *
 * Handles flooring products, pricing, and project estimates
 *
 * Routes:
 *   GET  /api/flooring/products       - List flooring products
 *   GET  /api/flooring/products/:slug - Get single product
 *   GET  /api/flooring/collections    - List collections with pricing
 *   GET  /api/flooring/pricing/:name  - Get pricing for product/collection
 *   POST /api/flooring/estimate       - Calculate project estimate
 *   POST /api/flooring/compare        - Compare pricing across tiers
 *   POST /api/flooring/upload-prices  - Upload vendor price sheet
 */

const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const flooringPricing = require('../services/flooringPricingService');
const pricingService = require('../services/pricingService');
const { requireAuth, optionalAuth } = require('../middleware/auth');
const { checkPermission } = require('../middleware/authorization');
const logger = require('../utils/logger');

// Configure multer for price sheet uploads
const upload = multer({
  dest: path.join(__dirname, '../../uploads/flooring-prices'),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
  fileFilter: (req, file, cb) => {
    const allowed = ['.csv', '.xlsx', '.xls'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowed.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error('Only CSV and Excel files are allowed'));
    }
  }
});

/**
 * Get user tier from request
 */
function getUserTier(req) {
  if (!req.user) return 'guest';

  const user = req.user;

  // Check subscription
  if (user.pro_subscription_tier === 'fabricator' || user.pro_subscription_tier === 'business') {
    return 'fabricator';
  }
  if (user.pro_subscription_tier === 'pro') {
    return 'pro';
  }

  // Check role
  if (user.role === 'fabricator') return 'fabricator';
  if (user.role === 'contractor') return 'contractor';
  if (user.role === 'designer') return 'designer';

  return 'homeowner';
}

// =============================================================================
// PUBLIC ROUTES
// =============================================================================

/**
 * GET /api/flooring/collections
 * List all flooring collections with pricing
 */
router.get('/collections', optionalAuth, async (req, res) => {
  try {
    const tier = getUserTier(req);
    const collections = flooringPricing.listCollections(tier);

    res.json({
      success: true,
      tier,
      collections
    });
  } catch (error) {
    logger.error('Error listing flooring collections:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to list collections'
    });
  }
});

/**
 * GET /api/flooring/pricing/:name
 * Get pricing for a specific product or collection
 */
router.get('/pricing/:name', optionalAuth, async (req, res) => {
  try {
    const { name } = req.params;
    const tier = getUserTier(req);

    const pricing = flooringPricing.getFlooringPricing(name, tier);

    res.json({
      success: true,
      pricing
    });
  } catch (error) {
    logger.error('Error getting flooring pricing:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get pricing'
    });
  }
});

/**
 * POST /api/flooring/estimate
 * Calculate project estimate
 *
 * Body: {
 *   product: string,      // Product name or collection
 *   sqft: number,         // Square footage needed
 *   waste_percent?: number, // Waste factor (default 10%)
 *   include_installation?: boolean
 * }
 */
router.post('/estimate', optionalAuth, async (req, res) => {
  try {
    const { product, sqft, waste_percent, include_installation } = req.body;

    if (!product) {
      return res.status(400).json({
        success: false,
        error: 'Product name is required'
      });
    }

    if (!sqft || sqft <= 0) {
      return res.status(400).json({
        success: false,
        error: 'Square footage must be greater than 0'
      });
    }

    const tier = getUserTier(req);

    const estimate = flooringPricing.calculateProjectEstimate({
      product,
      sqft: parseFloat(sqft),
      tier,
      waste_percent: parseFloat(waste_percent) || 10,
      include_installation: include_installation === true
    });

    res.json({
      success: true,
      estimate
    });
  } catch (error) {
    logger.error('Error calculating flooring estimate:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to calculate estimate'
    });
  }
});

/**
 * POST /api/flooring/compare
 * Compare pricing across all tiers
 *
 * Body: {
 *   product: string,
 *   sqft?: number (default 100)
 * }
 */
router.post('/compare', async (req, res) => {
  try {
    const { product, sqft } = req.body;

    if (!product) {
      return res.status(400).json({
        success: false,
        error: 'Product name is required'
      });
    }

    const comparison = flooringPricing.getPricingComparison(
      product,
      parseFloat(sqft) || 100
    );

    res.json({
      success: true,
      comparison
    });
  } catch (error) {
    logger.error('Error comparing flooring pricing:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to compare pricing'
    });
  }
});

/**
 * GET /api/flooring/products
 * List flooring products with optional filters
 */
router.get('/products', optionalAuth, async (req, res) => {
  try {
    const {
      collection,
      type,
      color,
      min_price,
      max_price,
      sort,
      limit = 50,
      offset = 0
    } = req.query;

    const tier = getUserTier(req);

    // Load products from JSON (or database if available)
    const dataPath = path.join(__dirname, '../../data/flooring.json');
    let products = [];

    if (fs.existsSync(dataPath)) {
      const data = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
      products = data.flooring || [];
    }

    // Enrich with pricing
    products = products.map(p => {
      const pricing = flooringPricing.getFlooringPricing(p.name, tier);
      return {
        ...p,
        collection: pricing.collection_id,
        pricing: pricing.pricing
      };
    });

    // Apply filters
    if (collection) {
      products = products.filter(p =>
        p.collection?.toLowerCase() === collection.toLowerCase()
      );
    }
    if (type) {
      products = products.filter(p =>
        p.type?.toLowerCase().includes(type.toLowerCase())
      );
    }
    if (color) {
      products = products.filter(p =>
        p.primaryColor?.toLowerCase().includes(color.toLowerCase())
      );
    }
    if (min_price) {
      const minPrice = parseFloat(min_price);
      products = products.filter(p =>
        p.pricing?.retail?.per_sf >= minPrice
      );
    }
    if (max_price) {
      const maxPrice = parseFloat(max_price);
      products = products.filter(p =>
        p.pricing?.retail?.per_sf <= maxPrice
      );
    }

    // Sort
    if (sort === 'price_asc') {
      products.sort((a, b) =>
        (a.pricing?.retail?.per_sf || 0) - (b.pricing?.retail?.per_sf || 0)
      );
    } else if (sort === 'price_desc') {
      products.sort((a, b) =>
        (b.pricing?.retail?.per_sf || 0) - (a.pricing?.retail?.per_sf || 0)
      );
    } else if (sort === 'name') {
      products.sort((a, b) => a.name.localeCompare(b.name));
    }

    // Paginate
    const total = products.length;
    const limitNum = parseInt(limit);
    const offsetNum = parseInt(offset);
    products = products.slice(offsetNum, offsetNum + limitNum);

    res.json({
      success: true,
      tier,
      total,
      limit: limitNum,
      offset: offsetNum,
      products
    });
  } catch (error) {
    logger.error('Error listing flooring products:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to list products'
    });
  }
});

/**
 * GET /api/flooring/products/:slug
 * Get single flooring product by slug
 */
router.get('/products/:slug', optionalAuth, async (req, res) => {
  try {
    const { slug } = req.params;
    const tier = getUserTier(req);

    // Load products from JSON
    const dataPath = path.join(__dirname, '../../data/flooring.json');

    if (!fs.existsSync(dataPath)) {
      return res.status(404).json({
        success: false,
        error: 'Flooring data not found'
      });
    }

    const data = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
    const products = data.flooring || [];

    const product = products.find(p => p.slug === slug);

    if (!product) {
      return res.status(404).json({
        success: false,
        error: 'Product not found'
      });
    }

    // Enrich with pricing
    const pricing = flooringPricing.getFlooringPricing(product.name, tier);

    res.json({
      success: true,
      product: {
        ...product,
        collection: pricing.collection_id,
        pricing: pricing.pricing,
        specs: {
          type: pricing.type,
          dimensions: pricing.dimensions,
          thickness: pricing.thickness,
          wear_layer: pricing.wear_layer,
          sf_per_box: pricing.sf_per_box
        }
      }
    });
  } catch (error) {
    logger.error('Error getting flooring product:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get product'
    });
  }
});

// =============================================================================
// ADMIN ROUTES - Price Sheet Upload
// =============================================================================

/**
 * POST /api/flooring/upload-prices
 * Upload vendor price sheet for flooring
 */
router.post('/upload-prices',
  requireAuth,
  checkPermission('pricing.write'),
  upload.single('file'),
  async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({
          success: false,
          error: 'No file uploaded'
        });
      }

      const { vendor_id = 'msi_flooring' } = req.body;

      // Read file
      const filePath = req.file.path;
      const fileContent = fs.readFileSync(filePath, 'utf8');

      // Parse CSV
      const { headers, rows, errors: parseErrors } = pricingService.parseCSV(fileContent);

      if (parseErrors.length > 0) {
        return res.status(400).json({
          success: false,
          error: 'Failed to parse file',
          details: parseErrors
        });
      }

      // Auto-detect columns
      const columnMapping = pricingService.autoDetectColumns(headers, {
        column_mapping: {
          sku: { aliases: ['item id', 'sku', 'product id'] },
          name: { aliases: ['color', 'name', 'product name'] },
          wholesale_price_sf: { aliases: ['price per sf', 'cost per sf', 'unit price'] },
          wholesale_price_box: { aliases: ['price per box', 'box price'] },
          collection: { aliases: ['series', 'collection', 'line'] },
          sf_per_box: { aliases: ['sf per box', 'coverage', 'box coverage'] }
        }
      });

      // Process flooring-specific validation
      const { processed, errors, warnings } = flooringPricing.processFlooringPriceSheet(
        rows,
        columnMapping
      );

      // Clean up temp file
      fs.unlinkSync(filePath);

      res.json({
        success: true,
        file: {
          name: req.file.originalname,
          size: req.file.size,
          rows: rows.length
        },
        column_mapping: columnMapping,
        validation: {
          valid_rows: processed.length,
          errors: errors.length,
          warnings: warnings.length
        },
        errors,
        warnings,
        preview: processed.slice(0, 10) // First 10 rows
      });
    } catch (error) {
      logger.error('Error uploading flooring prices:', error);
      res.status(500).json({
        success: false,
        error: error.message || 'Failed to upload price sheet'
      });
    }
  }
);

/**
 * POST /api/flooring/apply-prices
 * Apply validated price changes
 */
router.post('/apply-prices',
  requireAuth,
  checkPermission('pricing.approve'),
  async (req, res) => {
    try {
      const { prices } = req.body;

      if (!prices || !Array.isArray(prices)) {
        return res.status(400).json({
          success: false,
          error: 'Prices array is required'
        });
      }

      // Update flooring.json with new prices
      const dataPath = path.join(__dirname, '../../data/flooring.json');
      const data = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
      let products = data.flooring || [];

      let updated = 0;

      for (const priceUpdate of prices) {
        const productIndex = products.findIndex(p =>
          p.slug === priceUpdate.sku?.toLowerCase().replace(/_/g, '-') ||
          p.name.toLowerCase() === priceUpdate.name?.toLowerCase()
        );

        if (productIndex !== -1) {
          products[productIndex] = {
            ...products[productIndex],
            wholesale_cost_sf: priceUpdate.wholesale_cost_sf,
            wholesale_cost_box: priceUpdate.wholesale_cost_box,
            collection: priceUpdate.collection,
            sf_per_box: priceUpdate.sf_per_box,
            price_updated_at: new Date().toISOString()
          };
          updated++;
        }
      }

      // Save updated data
      fs.writeFileSync(dataPath, JSON.stringify({ flooring: products }, null, 2));

      logger.info(`Updated ${updated} flooring product prices by user ${req.user.id}`);

      res.json({
        success: true,
        updated,
        total: prices.length
      });
    } catch (error) {
      logger.error('Error applying flooring prices:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to apply prices'
      });
    }
  }
);

module.exports = router;
