/**
 * Customer Routes
 * Handles customer management operations
 */

const express = require('express');
const router = express.Router();
const logger = require('../utils/logger');
const { handleApiError, isValidEmail, sanitizeString } = require('../utils/security');
const { customerRateLimiter } = require('../middleware/rateLimiter');
const { asyncHandler } = require('../middleware/errorHandler');
const stripeService = require('../services/stripeService');

/**
 * Create a new customer
 * POST /api/customers
 */
router.post('/', customerRateLimiter, asyncHandler(async (req, res) => {
  const supabase = req.app.get('supabase');

  const { email, name, phone, company, address, metadata = {} } = req.body;

  // Validation
  if (!email || !isValidEmail(email)) {
    return res.status(400).json({ error: 'Valid email is required' });
  }

  // Create in Stripe
  const stripeResult = await stripeService.getOrCreateCustomer({
    email: email.toLowerCase().trim(),
    name: sanitizeString(name, 200),
    phone
  });

  if (!stripeResult.success) {
    return handleApiError(res, stripeResult.error, 'Create customer');
  }

  const stripeCustomer = stripeResult.customer;

  // Store in local database if available
  let localCustomer = null;
  if (supabase) {
    try {
      const { data, error } = await supabase
        .from('customers')
        .upsert({
          email: email.toLowerCase().trim(),
          name: sanitizeString(name, 200),
          phone,
          company: sanitizeString(company, 200),
          address: sanitizeString(address, 500),
          stripe_customer_id: stripeCustomer.id,
          metadata,
          updated_at: new Date().toISOString()
        }, { onConflict: 'email' })
        .select()
        .single();

      if (!error) {
        localCustomer = data;
      }
    } catch (dbErr) {
      logger.apiError(dbErr, { context: 'Customer DB insert' });
    }
  }

  logger.info('Customer created/updated', {
    stripeId: stripeCustomer.id,
    created: stripeResult.created
  });

  res.status(stripeResult.created ? 201 : 200).json({
    success: true,
    data: {
      id: localCustomer?.id || stripeCustomer.id,
      email: stripeCustomer.email,
      name: stripeCustomer.name,
      stripe_customer_id: stripeCustomer.id,
      created: stripeResult.created
    }
  });
}));

/**
 * Get customer by email
 * GET /api/customers/:email
 */
router.get('/:email', asyncHandler(async (req, res) => {
  const supabase = req.app.get('supabase');
  const { email } = req.params;

  if (!isValidEmail(email)) {
    return res.status(400).json({ error: 'Valid email is required' });
  }

  // Try local database first
  if (supabase) {
    const { data: customer, error } = await supabase
      .from('customers')
      .select('*')
      .eq('email', email.toLowerCase())
      .single();

    if (!error && customer) {
      return res.json({ success: true, data: customer });
    }
  }

  // Fallback to Stripe
  const stripe = stripeService.getStripeInstance();
  const customers = await stripe.customers.list({ email: email.toLowerCase(), limit: 1 });

  if (customers.data.length === 0) {
    return res.status(404).json({ error: 'Customer not found' });
  }

  res.json({
    success: true,
    data: {
      id: customers.data[0].id,
      email: customers.data[0].email,
      name: customers.data[0].name,
      phone: customers.data[0].phone,
      stripe_customer_id: customers.data[0].id
    }
  });
}));

/**
 * List customers
 * GET /api/customers
 */
router.get('/', asyncHandler(async (req, res) => {
  const supabase = req.app.get('supabase');

  if (!supabase) {
    return res.status(500).json({ error: 'Database not configured' });
  }

  const { limit = 50, offset = 0, search } = req.query;

  let query = supabase
    .from('customers')
    .select('*', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(offset, offset + parseInt(limit) - 1);

  if (search) {
    const searchTerm = `%${sanitizeString(search, 100)}%`;
    query = query.or(`email.ilike.${searchTerm},name.ilike.${searchTerm}`);
  }

  const { data: customers, error, count } = await query;

  if (error) {
    return handleApiError(res, error, 'List customers');
  }

  res.json({
    success: true,
    data: customers,
    pagination: {
      total: count,
      limit: parseInt(limit),
      offset: parseInt(offset)
    }
  });
}));

/**
 * Update customer
 * PUT /api/customers/:id
 */
router.put('/:id', asyncHandler(async (req, res) => {
  const supabase = req.app.get('supabase');

  if (!supabase) {
    return res.status(500).json({ error: 'Database not configured' });
  }

  const { id } = req.params;
  const { name, phone, company, address, metadata } = req.body;

  const updates = {
    updated_at: new Date().toISOString()
  };

  if (name !== undefined) updates.name = sanitizeString(name, 200);
  if (phone !== undefined) updates.phone = phone;
  if (company !== undefined) updates.company = sanitizeString(company, 200);
  if (address !== undefined) updates.address = sanitizeString(address, 500);
  if (metadata !== undefined) updates.metadata = metadata;

  const { data: customer, error } = await supabase
    .from('customers')
    .update(updates)
    .eq('id', id)
    .select()
    .single();

  if (error) {
    return handleApiError(res, error, 'Update customer');
  }

  // Also update in Stripe if we have stripe_customer_id
  if (customer.stripe_customer_id) {
    try {
      const stripe = stripeService.getStripeInstance();
      await stripe.customers.update(customer.stripe_customer_id, {
        name: customer.name,
        phone: customer.phone
      });
    } catch (stripeErr) {
      logger.apiError(stripeErr, { context: 'Stripe customer update' });
    }
  }

  res.json({ success: true, data: customer });
}));

/**
 * Get customer invoices
 * GET /api/customers/:id/invoices
 */
router.get('/:id/invoices', asyncHandler(async (req, res) => {
  const supabase = req.app.get('supabase');

  if (!supabase) {
    return res.status(500).json({ error: 'Database not configured' });
  }

  const { id } = req.params;

  // Get customer's Stripe ID
  const { data: customer, error } = await supabase
    .from('customers')
    .select('stripe_customer_id')
    .eq('id', id)
    .single();

  if (error || !customer?.stripe_customer_id) {
    return res.status(404).json({ error: 'Customer not found' });
  }

  // Get invoices from Stripe
  const result = await stripeService.listInvoices({
    customerId: customer.stripe_customer_id,
    limit: 20
  });

  if (!result.success) {
    return handleApiError(res, result.error, 'Get customer invoices');
  }

  res.json({
    success: true,
    data: result.invoices.map(inv => ({
      id: inv.id,
      number: inv.number,
      status: inv.status,
      amount_due: inv.amount_due / 100,
      amount_paid: inv.amount_paid / 100,
      created: new Date(inv.created * 1000).toISOString(),
      due_date: inv.due_date ? new Date(inv.due_date * 1000).toISOString() : null,
      hosted_invoice_url: inv.hosted_invoice_url,
      pdf: inv.invoice_pdf
    }))
  });
}));

module.exports = router;
