/**
 * Products Routes
 * Handles product management and inventory operations
 */

const express = require('express');
const router = express.Router();
const logger = require('../utils/logger');
const { handleApiError, sanitizeString } = require('../utils/security');
const { asyncHandler } = require('../middleware/errorHandler');

/**
 * Helper: Get distributor ID from request
 */
async function getDistributorId(req, supabase) {
  // First check API key
  const apiKey = req.headers['x-api-key'];
  if (apiKey && supabase) {
    const { data: keyData } = await supabase
      .from('api_keys')
      .select('distributor_id')
      .eq('key', apiKey)
      .eq('is_active', true)
      .single();
    if (keyData?.distributor_id) return keyData.distributor_id;
  }

  // Then check authenticated user
  const userId = req.user?.id;
  if (userId && supabase) {
    const { data: profile } = await supabase
      .from('distributor_profiles')
      .select('id')
      .eq('user_id', userId)
      .single();
    if (profile?.id) return profile.id;
  }

  return null;
}

/**
 * List products with filters
 * GET /api/products
 */
router.get('/', asyncHandler(async (req, res) => {
  const supabase = req.app.get('supabase');
  if (!supabase) {
    return res.status(500).json({ error: 'Database not configured' });
  }

  const {
    product_type,
    material_type,
    brand,
    color_family,
    status = 'active',
    search,
    min_price,
    max_price,
    is_public,
    limit = 50,
    offset = 0
  } = req.query;

  let query = supabase
    .from('distributor_products')
    .select(`
      *,
      distributor_product_slabs(*),
      distributor_profiles(company_name, logo_url)
    `, { count: 'exact' });

  // Apply filters
  if (product_type) query = query.eq('product_type', product_type);
  if (material_type) query = query.ilike('material_type', `%${sanitizeString(material_type, 100)}%`);
  if (brand) query = query.ilike('brand', `%${sanitizeString(brand, 100)}%`);
  if (color_family) query = query.ilike('color_family', `%${sanitizeString(color_family, 100)}%`);
  if (status) query = query.eq('status', status);
  if (is_public !== undefined) query = query.eq('is_public', is_public === 'true');
  if (min_price) query = query.gte('wholesale_price', parseFloat(min_price));
  if (max_price) query = query.lte('wholesale_price', parseFloat(max_price));

  // Search across multiple fields
  if (search) {
    const searchTerm = sanitizeString(search, 100);
    query = query.or(`name.ilike.%${searchTerm}%,sku.ilike.%${searchTerm}%,brand.ilike.%${searchTerm}%,material_type.ilike.%${searchTerm}%`);
  }

  query = query
    .order('created_at', { ascending: false })
    .range(parseInt(offset), parseInt(offset) + parseInt(limit) - 1);

  const { data: products, error, count } = await query;

  if (error) {
    return handleApiError(res, error, 'List products');
  }

  res.json({
    products,
    total: count,
    limit: parseInt(limit),
    offset: parseInt(offset)
  });
}));

/**
 * Get inventory statistics
 * GET /api/products/stats
 */
router.get('/stats', asyncHandler(async (req, res) => {
  const supabase = req.app.get('supabase');
  if (!supabase) {
    return res.status(500).json({ error: 'Database not configured' });
  }

  const distributorId = await getDistributorId(req, supabase);
  if (!distributorId) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  const { data: products } = await supabase
    .from('distributor_products')
    .select('product_type, status, quantity, wholesale_price, min_stock_level')
    .eq('distributor_id', distributorId);

  const stats = {
    total_products: products?.length || 0,
    active_products: products?.filter(p => p.status === 'active').length || 0,
    out_of_stock: products?.filter(p => p.status === 'out_of_stock').length || 0,
    low_stock: products?.filter(p => p.quantity <= p.min_stock_level && p.min_stock_level > 0).length || 0,
    by_type: {},
    total_value: 0
  };

  products?.forEach(p => {
    stats.by_type[p.product_type] = (stats.by_type[p.product_type] || 0) + 1;
    stats.total_value += (p.wholesale_price || 0) * (p.quantity || 0);
  });

  res.json(stats);
}));

/**
 * Find product by external SKU
 * GET /api/products/lookup
 */
router.get('/lookup', asyncHandler(async (req, res) => {
  const supabase = req.app.get('supabase');
  if (!supabase) {
    return res.status(500).json({ error: 'Database not configured' });
  }

  const { sku, system } = req.query;
  if (!sku) {
    return res.status(400).json({ error: 'SKU is required' });
  }

  const sanitizedSku = sanitizeString(sku, 100);

  let query = supabase
    .from('distributor_product_skus')
    .select(`product_id, distributor_products(*)`)
    .eq('sku_value', sanitizedSku);

  if (system) query = query.eq('system_name', sanitizeString(system, 50));

  const { data: skuMatch } = await query.single();

  if (skuMatch?.distributor_products) {
    return res.json(skuMatch.distributor_products);
  }

  // Fallback to direct SKU search
  let productQuery = supabase
    .from('distributor_products')
    .select('*')
    .or(`sku.eq.${sanitizedSku},external_sku.eq.${sanitizedSku}`);

  const { data: product } = await productQuery.single();

  if (!product) {
    return res.status(404).json({ error: 'Product not found' });
  }

  res.json(product);
}));

/**
 * Get single product with full details
 * GET /api/products/:id
 */
router.get('/:id', asyncHandler(async (req, res) => {
  const supabase = req.app.get('supabase');
  if (!supabase) {
    return res.status(500).json({ error: 'Database not configured' });
  }

  const { id } = req.params;

  const { data: product, error } = await supabase
    .from('distributor_products')
    .select(`
      *,
      distributor_product_slabs(*),
      distributor_profiles(company_name, logo_url, contact_email, phone)
    `)
    .eq('id', id)
    .single();

  if (error || !product) {
    return res.status(404).json({ error: 'Product not found' });
  }

  res.json(product);
}));

/**
 * Create product
 * POST /api/products
 */
router.post('/', asyncHandler(async (req, res) => {
  const supabase = req.app.get('supabase');
  if (!supabase) {
    return res.status(500).json({ error: 'Database not configured' });
  }

  const distributorId = await getDistributorId(req, supabase);
  if (!distributorId) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  const {
    sku, external_sku, upc, product_type = 'slab',
    name, brand, description, material_type, color_family, finish,
    quantity = 1, quantity_unit = 'each', min_stock_level = 0,
    cost_price, wholesale_price, retail_price, price_unit = 'each',
    location_id, warehouse_zone, bin_location,
    status = 'active', is_featured = false, is_public = true,
    images = [], tags = [], custom_attributes = {},
    type_data
  } = req.body;

  if (!name) {
    return res.status(400).json({ error: 'Product name is required' });
  }

  // Insert product
  const { data: product, error: productError } = await supabase
    .from('distributor_products')
    .insert({
      distributor_id: distributorId,
      sku: sanitizeString(sku, 100),
      external_sku: sanitizeString(external_sku, 100),
      upc: sanitizeString(upc, 50),
      product_type,
      name: sanitizeString(name, 300),
      brand: sanitizeString(brand, 100),
      description: sanitizeString(description, 2000),
      material_type: sanitizeString(material_type, 100),
      color_family: sanitizeString(color_family, 100),
      finish: sanitizeString(finish, 100),
      quantity,
      quantity_unit,
      min_stock_level,
      cost_price,
      wholesale_price,
      retail_price,
      price_unit,
      location_id,
      warehouse_zone: sanitizeString(warehouse_zone, 50),
      bin_location: sanitizeString(bin_location, 50),
      status,
      is_featured,
      is_public,
      images,
      tags,
      custom_attributes
    })
    .select()
    .single();

  if (productError) {
    return handleApiError(res, productError, 'Create product');
  }

  // Insert type-specific data for slabs
  if (product_type === 'slab' && type_data) {
    const { error: slabError } = await supabase
      .from('distributor_product_slabs')
      .insert({
        product_id: product.id,
        ...type_data
      });

    if (slabError) {
      logger.apiError(slabError, { context: 'Create slab type data' });
    }
  }

  // Log initial inventory transaction
  await supabase
    .from('inventory_transactions')
    .insert({
      product_id: product.id,
      transaction_type: 'receive',
      quantity_change: quantity,
      quantity_before: 0,
      quantity_after: quantity,
      reference_type: 'initial_stock',
      notes: 'Initial inventory on product creation'
    });

  logger.info('Product created', { productId: product.id, name: product.name });

  res.status(201).json(product);
}));

/**
 * Update product
 * PATCH /api/products/:id
 */
router.patch('/:id', asyncHandler(async (req, res) => {
  const supabase = req.app.get('supabase');
  if (!supabase) {
    return res.status(500).json({ error: 'Database not configured' });
  }

  const { id } = req.params;
  const distributorId = await getDistributorId(req, supabase);
  if (!distributorId) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  // Verify ownership
  const { data: existing } = await supabase
    .from('distributor_products')
    .select('distributor_id, product_type')
    .eq('id', id)
    .single();

  if (!existing || existing.distributor_id !== distributorId) {
    return res.status(404).json({ error: 'Product not found' });
  }

  const { type_data, ...productData } = req.body;

  // Sanitize string fields
  const sanitizedData = { ...productData };
  const stringFields = ['name', 'brand', 'description', 'material_type', 'color_family', 'finish', 'warehouse_zone', 'bin_location'];
  stringFields.forEach(field => {
    if (sanitizedData[field]) {
      sanitizedData[field] = sanitizeString(sanitizedData[field], field === 'description' ? 2000 : 300);
    }
  });

  // Update product
  const { data: product, error: productError } = await supabase
    .from('distributor_products')
    .update(sanitizedData)
    .eq('id', id)
    .select()
    .single();

  if (productError) {
    return handleApiError(res, productError, 'Update product');
  }

  // Update type-specific data
  if (existing.product_type === 'slab' && type_data) {
    await supabase
      .from('distributor_product_slabs')
      .upsert({ product_id: id, ...type_data }, { onConflict: 'product_id' });
  }

  logger.info('Product updated', { productId: id });

  res.json(product);
}));

/**
 * Delete product
 * DELETE /api/products/:id
 */
router.delete('/:id', asyncHandler(async (req, res) => {
  const supabase = req.app.get('supabase');
  if (!supabase) {
    return res.status(500).json({ error: 'Database not configured' });
  }

  const { id } = req.params;
  const distributorId = await getDistributorId(req, supabase);
  if (!distributorId) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  // Verify ownership
  const { data: existing } = await supabase
    .from('distributor_products')
    .select('distributor_id')
    .eq('id', id)
    .single();

  if (!existing || existing.distributor_id !== distributorId) {
    return res.status(404).json({ error: 'Product not found' });
  }

  const { error } = await supabase
    .from('distributor_products')
    .delete()
    .eq('id', id);

  if (error) {
    return handleApiError(res, error, 'Delete product');
  }

  logger.info('Product deleted', { productId: id });

  res.json({ success: true, message: 'Product deleted' });
}));

/**
 * Bulk create/update products
 * POST /api/products/bulk
 */
router.post('/bulk', asyncHandler(async (req, res) => {
  const supabase = req.app.get('supabase');
  if (!supabase) {
    return res.status(500).json({ error: 'Database not configured' });
  }

  const distributorId = await getDistributorId(req, supabase);
  if (!distributorId) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  const { products } = req.body;
  if (!Array.isArray(products) || products.length === 0) {
    return res.status(400).json({ error: 'Products array is required' });
  }

  if (products.length > 500) {
    return res.status(400).json({ error: 'Maximum 500 products per batch' });
  }

  const results = {
    created: 0,
    updated: 0,
    errors: []
  };

  for (const product of products) {
    try {
      const { type_data, ...productData } = product;

      // Sanitize name
      if (productData.name) {
        productData.name = sanitizeString(productData.name, 300);
      }

      // Upsert product by SKU
      const { data, error } = await supabase
        .from('distributor_products')
        .upsert({
          distributor_id: distributorId,
          ...productData,
          updated_at: new Date().toISOString()
        }, { onConflict: 'distributor_id,sku' })
        .select()
        .single();

      if (error) throw error;

      // Handle type-specific data
      if (data.product_type === 'slab' && type_data) {
        await supabase
          .from('distributor_product_slabs')
          .upsert({ product_id: data.id, ...type_data }, { onConflict: 'product_id' });
      }

      results.created++;
    } catch (err) {
      results.errors.push({
        sku: product.sku,
        error: 'Failed to import product'
      });
    }
  }

  logger.info('Bulk product import completed', {
    created: results.created,
    errors: results.errors.length
  });

  res.json(results);
}));

/**
 * Get inventory transactions
 * GET /api/products/:id/inventory
 */
router.get('/:id/inventory', asyncHandler(async (req, res) => {
  const supabase = req.app.get('supabase');
  if (!supabase) {
    return res.status(500).json({ error: 'Database not configured' });
  }

  const { id } = req.params;
  const { limit = 50, offset = 0 } = req.query;

  const { data: transactions, error, count } = await supabase
    .from('inventory_transactions')
    .select('*', { count: 'exact' })
    .eq('product_id', id)
    .order('performed_at', { ascending: false })
    .range(parseInt(offset), parseInt(offset) + parseInt(limit) - 1);

  if (error) {
    return handleApiError(res, error, 'Get inventory transactions');
  }

  res.json({
    transactions,
    total: count,
    limit: parseInt(limit),
    offset: parseInt(offset)
  });
}));

/**
 * Add inventory transaction
 * POST /api/products/:id/inventory
 */
router.post('/:id/inventory', asyncHandler(async (req, res) => {
  const supabase = req.app.get('supabase');
  if (!supabase) {
    return res.status(500).json({ error: 'Database not configured' });
  }

  const { id } = req.params;
  const distributorId = await getDistributorId(req, supabase);
  if (!distributorId) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  const {
    transaction_type,
    quantity_change,
    reference_type,
    reference_id,
    notes
  } = req.body;

  if (!transaction_type || quantity_change === undefined) {
    return res.status(400).json({ error: 'Transaction type and quantity change are required' });
  }

  // Verify ownership and get current quantity
  const { data: product } = await supabase
    .from('distributor_products')
    .select('distributor_id, quantity')
    .eq('id', id)
    .single();

  if (!product || product.distributor_id !== distributorId) {
    return res.status(404).json({ error: 'Product not found' });
  }

  const newQuantity = product.quantity + quantity_change;

  if (newQuantity < 0) {
    return res.status(400).json({
      error: 'Insufficient inventory',
      current_quantity: product.quantity,
      requested_change: quantity_change
    });
  }

  // Update product quantity
  await supabase
    .from('distributor_products')
    .update({
      quantity: newQuantity,
      status: newQuantity === 0 ? 'out_of_stock' : 'active'
    })
    .eq('id', id);

  // Log transaction
  const { data: transaction, error } = await supabase
    .from('inventory_transactions')
    .insert({
      product_id: id,
      transaction_type,
      quantity_change,
      quantity_before: product.quantity,
      quantity_after: newQuantity,
      reference_type,
      reference_id,
      notes: sanitizeString(notes, 500)
    })
    .select()
    .single();

  if (error) {
    return handleApiError(res, error, 'Add inventory transaction');
  }

  logger.info('Inventory transaction added', {
    productId: id,
    type: transaction_type,
    change: quantity_change
  });

  res.status(201).json({
    transaction,
    new_quantity: newQuantity
  });
}));

/**
 * Get SKU cross-references
 * GET /api/products/:id/skus
 */
router.get('/:id/skus', asyncHandler(async (req, res) => {
  const supabase = req.app.get('supabase');
  if (!supabase) {
    return res.status(500).json({ error: 'Database not configured' });
  }

  const { id } = req.params;

  const { data: skus, error } = await supabase
    .from('distributor_product_skus')
    .select('*')
    .eq('product_id', id)
    .order('system_name');

  if (error) {
    return handleApiError(res, error, 'Get product SKUs');
  }

  res.json(skus || []);
}));

/**
 * Add SKU mapping
 * POST /api/products/:id/skus
 */
router.post('/:id/skus', asyncHandler(async (req, res) => {
  const supabase = req.app.get('supabase');
  if (!supabase) {
    return res.status(500).json({ error: 'Database not configured' });
  }

  const { id } = req.params;
  const distributorId = await getDistributorId(req, supabase);
  if (!distributorId) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  const { system_name, sku_value } = req.body;

  if (!system_name || !sku_value) {
    return res.status(400).json({ error: 'System name and SKU value are required' });
  }

  // Verify ownership
  const { data: product } = await supabase
    .from('distributor_products')
    .select('distributor_id')
    .eq('id', id)
    .single();

  if (!product || product.distributor_id !== distributorId) {
    return res.status(404).json({ error: 'Product not found' });
  }

  const { data: sku, error } = await supabase
    .from('distributor_product_skus')
    .insert({
      product_id: id,
      system_name: sanitizeString(system_name, 100),
      sku_value: sanitizeString(sku_value, 100)
    })
    .select()
    .single();

  if (error) {
    return handleApiError(res, error, 'Add SKU mapping');
  }

  res.status(201).json(sku);
}));

/**
 * Remove SKU mapping
 * DELETE /api/products/:id/skus/:skuId
 */
router.delete('/:id/skus/:skuId', asyncHandler(async (req, res) => {
  const supabase = req.app.get('supabase');
  if (!supabase) {
    return res.status(500).json({ error: 'Database not configured' });
  }

  const { id, skuId } = req.params;
  const distributorId = await getDistributorId(req, supabase);
  if (!distributorId) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  // Verify ownership
  const { data: product } = await supabase
    .from('distributor_products')
    .select('distributor_id')
    .eq('id', id)
    .single();

  if (!product || product.distributor_id !== distributorId) {
    return res.status(404).json({ error: 'Product not found' });
  }

  const { error } = await supabase
    .from('distributor_product_skus')
    .delete()
    .eq('id', skuId)
    .eq('product_id', id);

  if (error) {
    return handleApiError(res, error, 'Delete SKU mapping');
  }

  res.json({ success: true, message: 'SKU mapping removed' });
}));

module.exports = router;
