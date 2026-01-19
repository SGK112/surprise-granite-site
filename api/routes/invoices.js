/**
 * Invoice Routes
 * Handles invoice creation and management
 */

const express = require('express');
const router = express.Router();
const logger = require('../utils/logger');
const { handleApiError, isValidEmail, sanitizeString } = require('../utils/security');
const { asyncHandler } = require('../middleware/errorHandler');
const stripeService = require('../services/stripeService');
const emailService = require('../services/emailService');

/**
 * Create a new invoice
 * POST /api/invoices
 */
router.post('/', asyncHandler(async (req, res) => {
  const {
    customer_email,
    customer_name,
    items,
    description,
    due_date,
    notes,
    send_email = true
  } = req.body;

  // Validation
  if (!customer_email || !isValidEmail(customer_email)) {
    return res.status(400).json({ error: 'Valid customer email is required' });
  }

  if (!items || !Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'At least one line item is required' });
  }

  // Validate items
  for (const item of items) {
    if (!item.description || typeof item.amount !== 'number' || item.amount <= 0) {
      return res.status(400).json({
        error: 'Each item must have a description and positive amount'
      });
    }
  }

  // Get or create customer
  const customerResult = await stripeService.getOrCreateCustomer({
    email: customer_email.toLowerCase().trim(),
    name: sanitizeString(customer_name, 200)
  });

  if (!customerResult.success) {
    return handleApiError(res, customerResult.error, 'Get customer');
  }

  // Create invoice
  const invoiceResult = await stripeService.createInvoice({
    customerId: customerResult.customer.id,
    items: items.map(item => ({
      description: sanitizeString(item.description, 500),
      amount: item.amount
    })),
    description: sanitizeString(description, 1000),
    dueDate: due_date,
    metadata: {
      notes: sanitizeString(notes, 2000),
      source: 'api'
    }
  });

  if (!invoiceResult.success) {
    return handleApiError(res, invoiceResult.error, 'Create invoice');
  }

  const invoice = invoiceResult.invoice;

  // Send invoice if requested
  if (send_email) {
    await stripeService.sendInvoice(invoice.id);
  }

  logger.info('Invoice created', {
    invoiceId: invoice.id,
    amount: invoice.amount_due / 100
  });

  res.status(201).json({
    success: true,
    data: {
      id: invoice.id,
      number: invoice.number,
      status: invoice.status,
      amount_due: invoice.amount_due / 100,
      customer_email: invoice.customer_email,
      hosted_invoice_url: invoice.hosted_invoice_url,
      pdf: invoice.invoice_pdf,
      created: new Date(invoice.created * 1000).toISOString(),
      due_date: invoice.due_date ? new Date(invoice.due_date * 1000).toISOString() : null
    }
  });
}));

/**
 * Get invoice by ID
 * GET /api/invoices/:id
 */
router.get('/:id', asyncHandler(async (req, res) => {
  const { id } = req.params;

  const result = await stripeService.getInvoice(id);

  if (!result.success) {
    if (result.error?.code === 'resource_missing') {
      return res.status(404).json({ error: 'Invoice not found' });
    }
    return handleApiError(res, result.error, 'Get invoice');
  }

  const invoice = result.invoice;

  res.json({
    success: true,
    data: {
      id: invoice.id,
      number: invoice.number,
      status: invoice.status,
      amount_due: invoice.amount_due / 100,
      amount_paid: invoice.amount_paid / 100,
      amount_remaining: invoice.amount_remaining / 100,
      customer_email: invoice.customer_email,
      customer_name: invoice.customer_name,
      description: invoice.description,
      hosted_invoice_url: invoice.hosted_invoice_url,
      pdf: invoice.invoice_pdf,
      created: new Date(invoice.created * 1000).toISOString(),
      due_date: invoice.due_date ? new Date(invoice.due_date * 1000).toISOString() : null,
      paid_at: invoice.status_transitions?.paid_at
        ? new Date(invoice.status_transitions.paid_at * 1000).toISOString()
        : null,
      lines: invoice.lines?.data?.map(line => ({
        description: line.description,
        amount: line.amount / 100,
        quantity: line.quantity
      })) || []
    }
  });
}));

/**
 * List invoices
 * GET /api/invoices
 */
router.get('/', asyncHandler(async (req, res) => {
  const { status, customer_id, limit = 20, starting_after } = req.query;

  const result = await stripeService.listInvoices({
    customerId: customer_id,
    status,
    limit: Math.min(parseInt(limit), 100),
    startingAfter: starting_after
  });

  if (!result.success) {
    return handleApiError(res, result.error, 'List invoices');
  }

  res.json({
    success: true,
    data: result.invoices.map(inv => ({
      id: inv.id,
      number: inv.number,
      status: inv.status,
      amount_due: inv.amount_due / 100,
      amount_paid: inv.amount_paid / 100,
      customer_email: inv.customer_email,
      created: new Date(inv.created * 1000).toISOString(),
      due_date: inv.due_date ? new Date(inv.due_date * 1000).toISOString() : null,
      hosted_invoice_url: inv.hosted_invoice_url
    })),
    has_more: result.hasMore
  });
}));

/**
 * Send/resend invoice
 * POST /api/invoices/:id/send
 */
router.post('/:id/send', asyncHandler(async (req, res) => {
  const { id } = req.params;

  const result = await stripeService.sendInvoice(id);

  if (!result.success) {
    if (result.error?.code === 'resource_missing') {
      return res.status(404).json({ error: 'Invoice not found' });
    }
    return handleApiError(res, result.error, 'Send invoice');
  }

  res.json({
    success: true,
    message: 'Invoice sent successfully',
    data: {
      id: result.invoice.id,
      status: result.invoice.status
    }
  });
}));

/**
 * Void an invoice
 * POST /api/invoices/:id/void
 */
router.post('/:id/void', asyncHandler(async (req, res) => {
  const { id } = req.params;

  try {
    const stripe = stripeService.getStripeInstance();
    const invoice = await stripe.invoices.voidInvoice(id);

    logger.info('Invoice voided', { invoiceId: id });

    res.json({
      success: true,
      message: 'Invoice voided successfully',
      data: {
        id: invoice.id,
        status: invoice.status
      }
    });
  } catch (error) {
    if (error.code === 'resource_missing') {
      return res.status(404).json({ error: 'Invoice not found' });
    }
    return handleApiError(res, error, 'Void invoice');
  }
}));

/**
 * Mark invoice as paid (for offline payments)
 * POST /api/invoices/:id/mark-paid
 */
router.post('/:id/mark-paid', asyncHandler(async (req, res) => {
  const { id } = req.params;

  try {
    const stripe = stripeService.getStripeInstance();
    const invoice = await stripe.invoices.pay(id, {
      paid_out_of_band: true
    });

    logger.info('Invoice marked as paid', { invoiceId: id });

    res.json({
      success: true,
      message: 'Invoice marked as paid',
      data: {
        id: invoice.id,
        status: invoice.status,
        amount_paid: invoice.amount_paid / 100
      }
    });
  } catch (error) {
    if (error.code === 'resource_missing') {
      return res.status(404).json({ error: 'Invoice not found' });
    }
    return handleApiError(res, error, 'Mark invoice paid');
  }
}));

module.exports = router;
