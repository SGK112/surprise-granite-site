/**
 * Marketplace Routes
 * Public product/slab browsing and inquiry endpoints
 */

const express = require('express');
const router = express.Router();
const logger = require('../utils/logger');
const { handleApiError, sanitizeString, isValidEmail, isValidPhone } = require('../utils/security');
const { asyncHandler } = require('../middleware/errorHandler');
const emailService = require('../services/emailService');

/**
 * Search marketplace products
 * GET /api/marketplace/products
 */
router.get('/products', asyncHandler(async (req, res) => {
  const supabase = req.app.get('supabase');
  if (!supabase) {
    return res.status(500).json({ error: 'Database not configured' });
  }

  const {
    product_type,
    material_type,
    brand,
    color,
    color_family,
    featured,
    min_price,
    max_price,
    search,
    limit = 50,
    offset = 0
  } = req.query;

  let query = supabase
    .from('distributor_products')
    .select(`
      *,
      distributor_product_slabs(*),
      distributor_profiles(company_name, logo_url, city, state)
    `, { count: 'exact' })
    .eq('is_public', true)
    .eq('status', 'active');

  // Apply filters
  if (product_type) query = query.eq('product_type', product_type);
  if (material_type) query = query.ilike('material_type', `%${sanitizeString(material_type, 100)}%`);
  if (brand) query = query.ilike('brand', `%${sanitizeString(brand, 100)}%`);

  const colorFilter = color_family || color;
  if (colorFilter) query = query.ilike('color_family', `%${sanitizeString(colorFilter, 100)}%`);
  if (featured === 'true') query = query.eq('is_featured', true);
  if (min_price) query = query.gte('wholesale_price', parseFloat(min_price));
  if (max_price) query = query.lte('wholesale_price', parseFloat(max_price));

  if (search) {
    const searchTerm = sanitizeString(search, 100);
    query = query.or(`name.ilike.%${searchTerm}%,sku.ilike.%${searchTerm}%,brand.ilike.%${searchTerm}%,material_type.ilike.%${searchTerm}%`);
  }

  query = query
    .order('created_at', { ascending: false })
    .range(parseInt(offset), parseInt(offset) + parseInt(limit) - 1);

  const { data: products, error, count } = await query;

  if (error) {
    return handleApiError(res, error, 'Search marketplace products');
  }

  res.json({
    products: products || [],
    total: count,
    limit: parseInt(limit),
    offset: parseInt(offset)
  });
}));

/**
 * Get marketplace product detail
 * GET /api/marketplace/products/:id
 */
router.get('/products/:id', asyncHandler(async (req, res) => {
  const supabase = req.app.get('supabase');
  if (!supabase) {
    return res.status(500).json({ error: 'Database not configured' });
  }

  const { data: product, error } = await supabase
    .from('distributor_products')
    .select(`
      *,
      distributor_product_slabs(*),
      distributor_profiles(company_name, logo_url, city, state, contact_email, phone)
    `)
    .eq('id', req.params.id)
    .eq('is_public', true)
    .single();

  if (error || !product) {
    return res.status(404).json({ error: 'Product not found' });
  }

  // Increment view count
  await supabase.rpc('increment_product_views', { product_id: req.params.id }).catch(() => {});

  res.json(product);
}));

/**
 * Search slabs (public)
 * GET /api/marketplace/slabs
 */
router.get('/slabs', asyncHandler(async (req, res) => {
  const supabase = req.app.get('supabase');
  if (!supabase) {
    return res.status(500).json({ error: 'Database not configured' });
  }

  const {
    material_type,
    brand,
    color,
    min_price,
    max_price,
    min_sqft,
    max_sqft,
    state,
    search,
    limit = 50,
    offset = 0,
    use_legacy_schema = 'false'
  } = req.query;

  // Use new distributor_products schema (default)
  if (use_legacy_schema !== 'true') {
    let query = supabase
      .from('distributor_products')
      .select(`
        *,
        distributor_product_slabs(*),
        distributor_profiles(company_name, logo_url, city, state)
      `, { count: 'exact' })
      .eq('product_type', 'slab')
      .eq('is_public', true)
      .eq('status', 'active');

    if (material_type) query = query.ilike('material_type', `%${sanitizeString(material_type, 100)}%`);
    if (brand) query = query.ilike('brand', `%${sanitizeString(brand, 100)}%`);
    if (color) query = query.ilike('color_family', `%${sanitizeString(color, 100)}%`);
    if (min_price) query = query.gte('wholesale_price', parseFloat(min_price));
    if (max_price) query = query.lte('wholesale_price', parseFloat(max_price));
    if (search) {
      const searchTerm = sanitizeString(search, 100);
      query = query.or(`name.ilike.%${searchTerm}%,brand.ilike.%${searchTerm}%,material_type.ilike.%${searchTerm}%,color_family.ilike.%${searchTerm}%`);
    }

    query = query
      .order('created_at', { ascending: false })
      .range(parseInt(offset), parseInt(offset) + parseInt(limit) - 1);

    const { data: products, error, count } = await query;

    if (error) {
      return handleApiError(res, error, 'Search slabs');
    }

    // Transform products to match legacy slab format
    const slabs = (products || []).map(p => ({
      id: p.id,
      distributor_id: p.distributor_id,
      product_name: p.name,
      brand: p.brand,
      material_type: p.material_type,
      color_family: p.color_family,
      finish: p.finish,
      description: p.description,
      price_per_sqft: p.wholesale_price,
      length_inches: p.distributor_product_slabs?.[0]?.length_inches,
      width_inches: p.distributor_product_slabs?.[0]?.width_inches,
      thickness_cm: p.distributor_product_slabs?.[0]?.thickness_cm,
      primary_image_url: p.images?.[0],
      images: p.images,
      status: p.status,
      distributor: p.distributor_profiles,
      created_at: p.created_at
    }));

    return res.json({ slabs, total: count });
  }

  // Legacy: Use the search function for slab_inventory
  const { data: slabs, error } = await supabase.rpc('search_slabs', {
    p_material_type: material_type || null,
    p_brand: brand || null,
    p_color: color || null,
    p_min_price: min_price ? parseFloat(min_price) : null,
    p_max_price: max_price ? parseFloat(max_price) : null,
    p_min_sqft: min_sqft ? parseFloat(min_sqft) : null,
    p_max_sqft: max_sqft ? parseFloat(max_sqft) : null,
    p_location_state: state || null,
    p_search: search || null,
    p_limit: parseInt(limit),
    p_offset: parseInt(offset)
  });

  if (error) {
    return handleApiError(res, error, 'Search slabs');
  }

  res.json({ slabs: slabs || [] });
}));

/**
 * Get slab detail (public)
 * GET /api/marketplace/slabs/:id
 */
router.get('/slabs/:id', asyncHandler(async (req, res) => {
  const supabase = req.app.get('supabase');
  if (!supabase) {
    return res.status(500).json({ error: 'Database not configured' });
  }

  const { data: product, error } = await supabase
    .from('distributor_products')
    .select(`
      *,
      distributor_product_slabs(*),
      distributor_profiles(company_name, logo_url, city, state, contact_email, phone)
    `)
    .eq('id', req.params.id)
    .eq('product_type', 'slab')
    .eq('is_public', true)
    .single();

  if (error || !product) {
    return res.status(404).json({ error: 'Slab not found' });
  }

  // Increment view count
  await supabase.rpc('increment_product_views', { product_id: req.params.id }).catch(() => {});

  // Transform to legacy format
  const slab = {
    id: product.id,
    distributor_id: product.distributor_id,
    product_name: product.name,
    brand: product.brand,
    material_type: product.material_type,
    color_family: product.color_family,
    finish: product.finish,
    description: product.description,
    price_per_sqft: product.wholesale_price,
    length_inches: product.distributor_product_slabs?.[0]?.length_inches,
    width_inches: product.distributor_product_slabs?.[0]?.width_inches,
    thickness_cm: product.distributor_product_slabs?.[0]?.thickness_cm,
    primary_image_url: product.images?.[0],
    images: product.images,
    status: product.status,
    distributor: product.distributor_profiles,
    created_at: product.created_at
  };

  res.json(slab);
}));

/**
 * Submit product/slab inquiry
 * POST /api/marketplace/slabs/:id/inquiry
 */
router.post('/slabs/:id/inquiry', asyncHandler(async (req, res) => {
  const supabase = req.app.get('supabase');
  if (!supabase) {
    return res.status(500).json({ error: 'Database not configured' });
  }

  const { name, email, phone, message, company } = req.body;

  // Validation
  if (!name || !email || !message) {
    return res.status(400).json({ error: 'Name, email, and message are required' });
  }

  if (!isValidEmail(email)) {
    return res.status(400).json({ error: 'Invalid email format' });
  }

  if (phone && !isValidPhone(phone)) {
    return res.status(400).json({ error: 'Invalid phone format' });
  }

  // Get product and distributor info
  const { data: product } = await supabase
    .from('distributor_products')
    .select(`
      id, distributor_id, name, brand, wholesale_price,
      distributors(id, company_name, email, contact_name)
    `)
    .eq('id', req.params.id)
    .single();

  if (!product) {
    return res.status(404).json({ error: 'Product not found' });
  }

  // Store inquiry
  const { data: inquiry, error } = await supabase
    .from('product_inquiries')
    .insert({
      product_id: req.params.id,
      distributor_id: product.distributor_id,
      customer_name: sanitizeString(name, 200),
      customer_email: email.toLowerCase().trim(),
      customer_phone: phone,
      customer_company: sanitizeString(company, 200),
      message: sanitizeString(message, 2000),
      status: 'new'
    })
    .select()
    .single();

  if (error) {
    return handleApiError(res, error, 'Submit inquiry');
  }

  // Increment inquiry count
  await supabase.rpc('increment_product_inquiries', { product_id: req.params.id }).catch(() => {});

  // Send email to distributor
  if (product.distributors?.email) {
    try {
      await emailService.sendEmail({
        to: product.distributors.email,
        subject: `New Product Inquiry: ${product.name}`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #1a1a2e;">New Product Inquiry</h2>
            <div style="background: #f5f5f5; padding: 20px; border-radius: 8px; margin: 20px 0;">
              <p><strong>Product:</strong> ${product.name} ${product.brand ? `(${product.brand})` : ''}</p>
              <p><strong>Price:</strong> $${product.wholesale_price || 'N/A'}/sqft</p>
            </div>
            <h3>Contact Information</h3>
            <p><strong>Name:</strong> ${sanitizeString(name, 200)}</p>
            <p><strong>Email:</strong> ${email}</p>
            ${phone ? `<p><strong>Phone:</strong> ${phone}</p>` : ''}
            ${company ? `<p><strong>Company:</strong> ${sanitizeString(company, 200)}</p>` : ''}
            <h3>Message</h3>
            <p style="background: #f9f9f9; padding: 15px; border-radius: 4px;">${sanitizeString(message, 2000)}</p>
          </div>
        `
      });
    } catch (emailErr) {
      logger.apiError(emailErr, { context: 'Send inquiry email' });
    }
  }

  logger.info('Product inquiry submitted', {
    productId: req.params.id,
    inquiryId: inquiry.id
  });

  res.status(201).json({
    success: true,
    message: 'Inquiry submitted successfully',
    inquiry_id: inquiry.id
  });
}));

/**
 * Get featured products
 * GET /api/marketplace/featured
 */
router.get('/featured', asyncHandler(async (req, res) => {
  const supabase = req.app.get('supabase');
  if (!supabase) {
    return res.status(500).json({ error: 'Database not configured' });
  }

  const { limit = 12 } = req.query;

  const { data: products, error } = await supabase
    .from('distributor_products')
    .select(`
      *,
      distributor_profiles(company_name, logo_url, city, state)
    `)
    .eq('is_public', true)
    .eq('status', 'active')
    .eq('is_featured', true)
    .order('created_at', { ascending: false })
    .limit(parseInt(limit));

  if (error) {
    return handleApiError(res, error, 'Get featured products');
  }

  res.json({ products: products || [] });
}));

/**
 * Get stone yard partners (for /stone-yards/ page)
 * GET /api/marketplace/stone-yards
 */
router.get('/stone-yards', asyncHandler(async (req, res) => {
  const supabase = req.app.get('supabase');
  if (!supabase) {
    return res.status(500).json({ error: 'Database not configured' });
  }

  // Try using the get_stone_yard_partners function
  const { data: partners, error } = await supabase.rpc('get_stone_yard_partners');

  if (error) {
    // Fallback: direct query if function doesn't exist yet
    const { data: fallbackPartners, error: fallbackError } = await supabase
      .from('distributor_profiles')
      .select(`
        id,
        company_name,
        company_type,
        primary_contact_phone,
        website,
        material_types,
        distributor_locations!inner (
          location_name,
          address_line1,
          city,
          state,
          zip_code,
          latitude,
          longitude,
          has_showroom,
          has_slab_yard
        )
      `)
      .eq('is_stone_yard_partner', true)
      .eq('is_active', true)
      .eq('verification_status', 'verified')
      .eq('distributor_locations.is_primary', true)
      .order('company_name');

    if (fallbackError) {
      return handleApiError(res, fallbackError, 'Get stone yard partners');
    }

    // Transform to expected format
    const transformedPartners = (fallbackPartners || []).map(p => ({
      id: p.id,
      company_name: p.company_name,
      company_type: p.company_type,
      phone: p.primary_contact_phone,
      website: p.website,
      material_types: p.material_types,
      location_name: p.distributor_locations?.[0]?.location_name,
      address: p.distributor_locations?.[0]?.address_line1,
      city: p.distributor_locations?.[0]?.city,
      state: p.distributor_locations?.[0]?.state,
      zip_code: p.distributor_locations?.[0]?.zip_code,
      latitude: p.distributor_locations?.[0]?.latitude,
      longitude: p.distributor_locations?.[0]?.longitude,
      has_showroom: p.distributor_locations?.[0]?.has_showroom,
      has_slab_yard: p.distributor_locations?.[0]?.has_slab_yard
    }));

    return res.json({ partners: transformedPartners });
  }

  res.json({ partners: partners || [] });
}));

/**
 * Get available material types and brands (for filters)
 * GET /api/marketplace/filters
 */
router.get('/filters', asyncHandler(async (req, res) => {
  const supabase = req.app.get('supabase');
  if (!supabase) {
    return res.status(500).json({ error: 'Database not configured' });
  }

  const [materialTypes, brands, colorFamilies] = await Promise.all([
    supabase
      .from('distributor_products')
      .select('material_type')
      .eq('is_public', true)
      .eq('status', 'active')
      .not('material_type', 'is', null),
    supabase
      .from('distributor_products')
      .select('brand')
      .eq('is_public', true)
      .eq('status', 'active')
      .not('brand', 'is', null),
    supabase
      .from('distributor_products')
      .select('color_family')
      .eq('is_public', true)
      .eq('status', 'active')
      .not('color_family', 'is', null)
  ]);

  // Extract unique values
  const uniqueMaterials = [...new Set(materialTypes.data?.map(m => m.material_type).filter(Boolean))].sort();
  const uniqueBrands = [...new Set(brands.data?.map(b => b.brand).filter(Boolean))].sort();
  const uniqueColors = [...new Set(colorFamilies.data?.map(c => c.color_family).filter(Boolean))].sort();

  res.json({
    material_types: uniqueMaterials,
    brands: uniqueBrands,
    color_families: uniqueColors
  });
}));

module.exports = router;
