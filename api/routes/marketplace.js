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
      id, name, brand, sku, material_type, category, subcategory,
      dimensions, thickness, finish, color,
      unit_price, unit_type, sqft_per_box,
      description, is_active, primary_image_url,
      distributor_id, created_at, updated_at,
      distributor_profiles(company_name, website)
    `, { count: 'exact' })
    .eq('is_active', true);

  // Apply filters
  if (product_type) query = query.eq('category', product_type);
  if (material_type) query = query.ilike('material_type', `%${sanitizeString(material_type, 100)}%`);
  if (brand) query = query.ilike('brand', `%${sanitizeString(brand, 100)}%`);

  const colorFilter = color_family || color;
  if (colorFilter) query = query.ilike('color', `%${sanitizeString(colorFilter, 100)}%`);
  if (min_price) query = query.gte('unit_price', parseFloat(min_price));
  if (max_price) query = query.lte('unit_price', parseFloat(max_price));

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

  // Use distributor_products table with actual schema
  if (use_legacy_schema !== 'true') {
    let query = supabase
      .from('distributor_products')
      .select(`
        id, name, brand, sku, material_type, category, subcategory,
        dimensions, thickness, finish, color,
        unit_price, unit_type, sqft_per_box,
        description, is_active, primary_image_url,
        distributor_id, created_at, updated_at,
        distributor_profiles(company_name, website)
      `, { count: 'exact' })
      .eq('is_active', true);

    if (material_type) query = query.ilike('material_type', `%${sanitizeString(material_type, 100)}%`);
    if (brand) query = query.ilike('brand', `%${sanitizeString(brand, 100)}%`);
    if (color) query = query.ilike('color', `%${sanitizeString(color, 100)}%`);
    if (min_price) query = query.gte('unit_price', parseFloat(min_price));
    if (max_price) query = query.lte('unit_price', parseFloat(max_price));
    if (search) {
      const searchTerm = sanitizeString(search, 100);
      query = query.or(`name.ilike.%${searchTerm}%,brand.ilike.%${searchTerm}%,material_type.ilike.%${searchTerm}%,color.ilike.%${searchTerm}%`);
    }

    query = query
      .order('created_at', { ascending: false })
      .range(parseInt(offset), parseInt(offset) + parseInt(limit) - 1);

    const { data: products, error, count } = await query;

    if (error) {
      return handleApiError(res, error, 'Search slabs');
    }

    // Transform products to match expected slab format
    const slabs = (products || []).map(p => ({
      id: p.id,
      distributor_id: p.distributor_id,
      product_name: p.name,
      brand: p.brand,
      material_type: p.material_type,
      color_family: p.color,
      finish: p.finish,
      description: p.description,
      price_per_sqft: p.unit_price,
      dimensions: p.dimensions,
      thickness: p.thickness,
      primary_image_url: p.primary_image_url,
      images: p.primary_image_url ? [p.primary_image_url] : [],
      status: p.is_active ? 'available' : 'inactive',
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
  const { data: product, error: productError } = await supabase
    .from('distributor_products')
    .select(`
      id, distributor_id, name, brand, unit_price, primary_image_url,
      distributor_profiles!distributor_id(id, company_name, primary_contact_email, primary_contact_name, primary_contact_phone)
    `)
    .eq('id', req.params.id)
    .eq('is_active', true)
    .single();

  if (productError) {
    logger.error('Product inquiry lookup error', { error: productError.message, productId: req.params.id });
    return res.status(404).json({ error: 'Product not found' });
  }

  if (!product) {
    return res.status(404).json({ error: 'Product not found' });
  }

  const distributor = product.distributor_profiles;

  // Store inquiry as a lead with marketplace context
  const leadData = {
    full_name: sanitizeString(name, 200),
    email: email.toLowerCase().trim(),
    phone: phone || null,
    project_type: 'marketplace_inquiry',
    source: 'marketplace',
    form_name: 'product_inquiry',
    message: `[Marketplace Inquiry]\n` +
             `Product: ${product.name}${product.brand ? ` (${product.brand})` : ''}\n` +
             `Product ID: ${req.params.id}\n` +
             `Price: $${product.unit_price || 'N/A'}/sqft\n` +
             `Distributor: ${distributor?.company_name || 'Unknown'}\n` +
             (company ? `Company: ${sanitizeString(company, 200)}\n` : '') +
             `\nCustomer Message:\n${sanitizeString(message, 2000)}`,
    status: 'new'
  };

  const { data: inquiry, error } = await supabase
    .from('leads')
    .insert(leadData)
    .select()
    .single();

  if (error) {
    logger.error('Failed to store inquiry', { error: error.message });
    return handleApiError(res, error, 'Submit inquiry');
  }

  // Send email notification to distributor/fabricator
  if (distributor?.primary_contact_email) {
    try {
      const productImageHtml = product.primary_image_url
        ? `<img src="${product.primary_image_url}" alt="${product.name}" style="max-width: 200px; border-radius: 8px; margin-bottom: 16px;">`
        : '';

      await emailService.sendNotification(
        distributor.primary_contact_email,
        `New Inquiry: ${product.name}`,
        `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #ffffff;">
            <div style="background: linear-gradient(135deg, #1a1a2e 0%, #2d2d44 100%); padding: 32px; text-align: center;">
              <h1 style="color: #f9cb00; margin: 0; font-size: 24px;">New Product Inquiry</h1>
              <p style="color: rgba(255,255,255,0.7); margin: 8px 0 0;">Someone is interested in your listing!</p>
            </div>

            <div style="padding: 32px;">
              <div style="background: #f8f9fa; padding: 24px; border-radius: 12px; margin-bottom: 24px;">
                ${productImageHtml}
                <h2 style="margin: 0 0 8px; color: #1a1a2e; font-size: 18px;">${product.name}</h2>
                ${product.brand ? `<p style="margin: 0 0 8px; color: #666;">Brand: ${product.brand}</p>` : ''}
                <p style="margin: 0; color: #1a1a2e; font-weight: 600;">$${product.unit_price || 'Contact for price'}/sqft</p>
              </div>

              <h3 style="color: #1a1a2e; margin: 0 0 16px; font-size: 16px; border-bottom: 2px solid #f9cb00; padding-bottom: 8px;">Customer Information</h3>
              <table style="width: 100%; margin-bottom: 24px;">
                <tr>
                  <td style="padding: 8px 0; color: #666; width: 100px;">Name:</td>
                  <td style="padding: 8px 0; color: #1a1a2e; font-weight: 500;">${sanitizeString(name, 200)}</td>
                </tr>
                <tr>
                  <td style="padding: 8px 0; color: #666;">Email:</td>
                  <td style="padding: 8px 0;"><a href="mailto:${email}" style="color: #2563eb;">${email}</a></td>
                </tr>
                ${phone ? `
                <tr>
                  <td style="padding: 8px 0; color: #666;">Phone:</td>
                  <td style="padding: 8px 0;"><a href="tel:${phone}" style="color: #2563eb;">${phone}</a></td>
                </tr>` : ''}
                ${company ? `
                <tr>
                  <td style="padding: 8px 0; color: #666;">Company:</td>
                  <td style="padding: 8px 0; color: #1a1a2e;">${sanitizeString(company, 200)}</td>
                </tr>` : ''}
              </table>

              <h3 style="color: #1a1a2e; margin: 0 0 16px; font-size: 16px; border-bottom: 2px solid #f9cb00; padding-bottom: 8px;">Message</h3>
              <div style="background: #f8f9fa; padding: 16px; border-radius: 8px; border-left: 4px solid #f9cb00;">
                <p style="margin: 0; color: #333; line-height: 1.6;">${sanitizeString(message, 2000).replace(/\n/g, '<br>')}</p>
              </div>

              <div style="margin-top: 32px; text-align: center;">
                <a href="https://www.surprisegranite.com/distributor/dashboard/inquiries/"
                   style="display: inline-block; background: linear-gradient(135deg, #f9cb00 0%, #cca600 100%); color: #1a1a2e; padding: 14px 32px; border-radius: 8px; text-decoration: none; font-weight: 600;">
                  View in Dashboard
                </a>
              </div>
            </div>

            <div style="background: #f8f9fa; padding: 24px; text-align: center; border-top: 1px solid #e5e7eb;">
              <p style="margin: 0; color: #666; font-size: 13px;">
                This inquiry was submitted through the Surprise Granite Marketplace.<br>
                <a href="https://www.surprisegranite.com" style="color: #f9cb00;">www.surprisegranite.com</a>
              </p>
            </div>
          </div>
        `
      );
      logger.info('Inquiry notification email sent', { to: distributor.primary_contact_email, productId: req.params.id });
    } catch (emailErr) {
      logger.apiError(emailErr, { context: 'Send inquiry notification email' });
    }
  }

  logger.info('Product inquiry submitted', {
    productId: req.params.id,
    leadId: inquiry.id
  });

  res.status(201).json({
    success: true,
    message: 'Inquiry submitted successfully',
    inquiry_id: inquiry.id
  });
}));

/**
 * Submit inquiry for user-generated stone listing (remnants)
 * POST /api/marketplace/listings/:id/inquiry
 */
router.post('/listings/:id/inquiry', asyncHandler(async (req, res) => {
  const supabase = req.app.get('supabase');
  if (!supabase) {
    return res.status(500).json({ error: 'Database not configured' });
  }

  const { name, email, phone, message } = req.body;

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

  // Get listing and owner info
  const { data: listing, error: listingError } = await supabase
    .from('stone_listings')
    .select(`
      id, user_id, stone_name, material_type, price, city, state,
      image_url, show_phone, show_email, contact_form_only,
      sg_users(id, full_name, email, phone)
    `)
    .eq('id', req.params.id)
    .eq('status', 'active')
    .single();

  if (listingError || !listing) {
    return res.status(404).json({ error: 'Listing not found' });
  }

  const owner = listing.sg_users;

  // Store inquiry
  const { data: inquiry, error } = await supabase
    .from('listing_inquiries')
    .insert({
      listing_id: req.params.id,
      sender_name: sanitizeString(name, 200),
      sender_email: email.toLowerCase().trim(),
      sender_phone: phone || null,
      message: sanitizeString(message, 2000),
      is_read: false
    })
    .select()
    .single();

  if (error) {
    return handleApiError(res, error, 'Submit listing inquiry');
  }

  // Update inquiry count on listing
  await supabase
    .from('stone_listings')
    .update({ inquiries: supabase.sql`COALESCE(inquiries, 0) + 1` })
    .eq('id', req.params.id)
    .catch(() => {});

  // Send email notification to listing owner
  if (owner?.email) {
    try {
      const listingImageHtml = listing.image_url
        ? `<img src="${listing.image_url}" alt="${listing.stone_name}" style="max-width: 200px; border-radius: 8px; margin-bottom: 16px;">`
        : '';

      await emailService.sendNotification(
        owner.email,
        `New Inquiry: ${listing.stone_name} Remnant`,
        `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #ffffff;">
            <div style="background: linear-gradient(135deg, #1a1a2e 0%, #2d2d44 100%); padding: 32px; text-align: center;">
              <h1 style="color: #f9cb00; margin: 0; font-size: 24px;">New Remnant Inquiry</h1>
              <p style="color: rgba(255,255,255,0.7); margin: 8px 0 0;">Someone is interested in your listing!</p>
            </div>

            <div style="padding: 32px;">
              <div style="background: #f8f9fa; padding: 24px; border-radius: 12px; margin-bottom: 24px;">
                ${listingImageHtml}
                <h2 style="margin: 0 0 8px; color: #1a1a2e; font-size: 18px;">${listing.stone_name}</h2>
                <p style="margin: 0 0 8px; color: #666;">${listing.material_type ? listing.material_type.charAt(0).toUpperCase() + listing.material_type.slice(1) : 'Stone'} Remnant</p>
                ${listing.price ? `<p style="margin: 0; color: #1a1a2e; font-weight: 600;">$${listing.price}</p>` : ''}
                <p style="margin: 8px 0 0; color: #888; font-size: 13px;">${listing.city || ''}${listing.city && listing.state ? ', ' : ''}${listing.state || ''}</p>
              </div>

              <h3 style="color: #1a1a2e; margin: 0 0 16px; font-size: 16px; border-bottom: 2px solid #f9cb00; padding-bottom: 8px;">Interested Buyer</h3>
              <table style="width: 100%; margin-bottom: 24px;">
                <tr>
                  <td style="padding: 8px 0; color: #666; width: 100px;">Name:</td>
                  <td style="padding: 8px 0; color: #1a1a2e; font-weight: 500;">${sanitizeString(name, 200)}</td>
                </tr>
                <tr>
                  <td style="padding: 8px 0; color: #666;">Email:</td>
                  <td style="padding: 8px 0;"><a href="mailto:${email}" style="color: #2563eb;">${email}</a></td>
                </tr>
                ${phone ? `
                <tr>
                  <td style="padding: 8px 0; color: #666;">Phone:</td>
                  <td style="padding: 8px 0;"><a href="tel:${phone}" style="color: #2563eb;">${phone}</a></td>
                </tr>` : ''}
              </table>

              <h3 style="color: #1a1a2e; margin: 0 0 16px; font-size: 16px; border-bottom: 2px solid #f9cb00; padding-bottom: 8px;">Message</h3>
              <div style="background: #f8f9fa; padding: 16px; border-radius: 8px; border-left: 4px solid #f9cb00;">
                <p style="margin: 0; color: #333; line-height: 1.6;">${sanitizeString(message, 2000).replace(/\n/g, '<br>')}</p>
              </div>

              <div style="margin-top: 32px; padding: 20px; background: #fffbeb; border-radius: 8px; border: 1px solid #fcd34d;">
                <p style="margin: 0; color: #92400e; font-size: 14px;">
                  <strong>Tip:</strong> Respond quickly to inquiries! Buyers are often comparing multiple options.
                </p>
              </div>
            </div>

            <div style="background: #f8f9fa; padding: 24px; text-align: center; border-top: 1px solid #e5e7eb;">
              <p style="margin: 0; color: #666; font-size: 13px;">
                This inquiry was submitted through the Surprise Granite Marketplace.<br>
                <a href="https://www.surprisegranite.com/marketplace/listings/" style="color: #f9cb00;">View your listings</a>
              </p>
            </div>
          </div>
        `
      );
      logger.info('Listing inquiry notification email sent', { to: owner.email, listingId: req.params.id });
    } catch (emailErr) {
      logger.apiError(emailErr, { context: 'Send listing inquiry email' });
    }
  }

  logger.info('Stone listing inquiry submitted', {
    listingId: req.params.id,
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
 * Get designer-visible products for room designer integration
 * GET /api/marketplace/designer-products
 * Returns products where designer_visible = true with element type mapping
 */
router.get('/designer-products', asyncHandler(async (req, res) => {
  const supabase = req.app.get('supabase');
  if (!supabase) {
    return res.status(500).json({ error: 'Database not configured' });
  }

  const {
    category,
    material_type,
    brand,
    limit = 100,
    offset = 0
  } = req.query;

  // Query actual table structure
  let query = supabase
    .from('distributor_products')
    .select(`
      id, name, brand, sku, material_type, category, subcategory,
      dimensions, thickness, finish, color,
      unit_price, unit_type, sqft_per_box,
      description, is_active, primary_image_url,
      distributor_profiles(company_name)
    `, { count: 'exact' })
    .eq('is_active', true);

  if (category) {
    query = query.eq('category', sanitizeString(category, 50));
  }
  if (material_type) {
    query = query.eq('material_type', sanitizeString(material_type, 50));
  }
  if (brand) {
    query = query.ilike('brand', `%${sanitizeString(brand, 100)}%`);
  }

  query = query
    .order('category', { ascending: true })
    .order('name', { ascending: true })
    .range(parseInt(offset), parseInt(offset) + parseInt(limit) - 1);

  const { data: products, error, count } = await query;

  if (error) {
    return handleApiError(res, error, 'Get designer products');
  }

  // Group by category for sidebar rendering
  const grouped = {};
  (products || []).forEach(p => {
    const cat = p.category || 'other';
    if (!grouped[cat]) grouped[cat] = [];
    grouped[cat].push({
      id: p.id,
      name: p.name,
      brand: p.brand,
      sku: p.sku,
      materialType: p.material_type,
      category: p.category,
      subcategory: p.subcategory,
      dimensions: p.dimensions,
      thickness: p.thickness,
      finish: p.finish,
      color: p.color,
      price: p.unit_price,
      unitType: p.unit_type,
      sqftPerBox: p.sqft_per_box,
      description: p.description,
      image: p.primary_image_url,
      distributor: p.distributor_profiles?.company_name
    });
  });

  res.json({
    products: products || [],
    grouped,
    total: count,
    limit: parseInt(limit),
    offset: parseInt(offset)
  });
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
