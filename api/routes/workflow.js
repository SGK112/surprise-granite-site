/**
 * Workflow Routes
 * Handles conversions: Lead → Customer, Estimate → Invoice, Invoice → Job
 * Maintains complete data chain with proper linkage
 */

const express = require('express');
const router = express.Router();
const Joi = require('joi');
const logger = require('../utils/logger');
const { handleApiError, sanitizeString } = require('../utils/security');
const { asyncHandler } = require('../middleware/errorHandler');
const { validateBody, validateParams } = require('../middleware/validator');
const emailService = require('../services/emailService');
const smsService = require('../services/smsService');

// ============================================================
// VALIDATION SCHEMAS
// ============================================================

const schemas = {
  leadToCustomer: Joi.object({
    user_id: Joi.string().uuid().required(),
    additional_data: Joi.object({
      city: Joi.string().max(100).trim(),
      state: Joi.string().max(50).trim().default('AZ')
    }).default({})
  }),

  estimateToInvoice: Joi.object({
    user_id: Joi.string().uuid().required(),
    due_days: Joi.number().integer().min(1).max(365).default(30),
    notes: Joi.string().max(2000).trim().allow('')
  }),

  invoiceToJob: Joi.object({
    user_id: Joi.string().uuid().required(),
    scheduled_date: Joi.date().iso(),
    notes: Joi.string().max(2000).trim().allow('')
  }),

  notify: Joi.object({
    type: Joi.string().valid('estimate', 'invoice', 'job', 'appointment').required(),
    action: Joi.string().valid('sent', 'approved', 'status_change', 'reminder', 'paid', 'scheduled', 'confirmed').required(),
    entity: Joi.object().required(),
    recipient: Joi.object({
      email: Joi.string().email().max(255),
      phone: Joi.string().max(20),
      name: Joi.string().max(200)
    }).required(),
    new_status: Joi.string().max(50)
  }),

  uuidParam: Joi.object({
    leadId: Joi.string().uuid(),
    estimateId: Joi.string().uuid(),
    invoiceId: Joi.string().uuid()
  })
};

// ============================================================
// LEAD → CUSTOMER CONVERSION
// ============================================================

/**
 * Convert a lead to a customer
 * POST /api/workflow/lead-to-customer/:leadId
 *
 * Creates a customer record from lead data and maintains bidirectional linkage
 */
router.post('/lead-to-customer/:leadId',
  validateBody(schemas.leadToCustomer),
  asyncHandler(async (req, res) => {
  const supabase = req.app.get('supabase');
  if (!supabase) {
    return res.status(500).json({ error: 'Database not configured' });
  }

  const { leadId } = req.params;
  const { user_id, additional_data } = req.body;

  // Fetch the lead
  const { data: lead, error: leadError } = await supabase
    .from('leads')
    .select('*')
    .eq('id', leadId)
    .single();

  if (leadError || !lead) {
    return res.status(404).json({ error: 'Lead not found' });
  }

  // Check if customer already exists with this email
  const { data: existingCustomer } = await supabase
    .from('customers')
    .select('id')
    .eq('email', lead.homeowner_email)
    .eq('user_id', user_id)
    .single();

  if (existingCustomer) {
    // Link existing customer to lead
    await supabase
      .from('leads')
      .update({ customer_id: existingCustomer.id, status: 'converted' })
      .eq('id', leadId);

    await supabase
      .from('customers')
      .update({ lead_id: leadId })
      .eq('id', existingCustomer.id);

    return res.json({
      success: true,
      message: 'Lead linked to existing customer',
      data: { customer_id: existingCustomer.id, lead_id: leadId }
    });
  }

  // Parse name into first/last
  const nameParts = (lead.homeowner_name || '').trim().split(' ');
  const firstName = nameParts[0] || '';
  const lastName = nameParts.slice(1).join(' ') || '';

  // Create customer record
  const customerData = {
    user_id,
    first_name: firstName,
    last_name: lastName,
    email: lead.homeowner_email,
    phone: lead.homeowner_phone,
    address: lead.project_address || '',
    city: additional_data.city || '',
    state: additional_data.state || 'AZ',
    zip: lead.project_zip || '',
    notes: lead.project_details || '',
    source: lead.source || 'lead_conversion',
    lead_id: leadId  // Bidirectional link
  };

  const { data: newCustomer, error: customerError } = await supabase
    .from('customers')
    .insert([customerData])
    .select()
    .single();

  if (customerError) {
    return handleApiError(res, customerError, 'Create customer');
  }

  // Update lead with customer_id and status
  await supabase
    .from('leads')
    .update({
      customer_id: newCustomer.id,
      status: 'converted',
      updated_at: new Date().toISOString()
    })
    .eq('id', leadId);

  logger.info('Lead converted to customer', {
    leadId,
    customerId: newCustomer.id
  });

  res.json({
    success: true,
    message: 'Lead successfully converted to customer',
    data: {
      customer: newCustomer,
      lead_id: leadId
    }
  });
}));

// ============================================================
// ESTIMATE → INVOICE CONVERSION
// ============================================================

/**
 * Convert an estimate to an invoice
 * POST /api/workflow/estimate-to-invoice/:estimateId
 *
 * Creates an invoice from an approved estimate, maintaining linkage
 */
router.post('/estimate-to-invoice/:estimateId',
  validateBody(schemas.estimateToInvoice),
  asyncHandler(async (req, res) => {
  const supabase = req.app.get('supabase');
  if (!supabase) {
    return res.status(500).json({ error: 'Database not configured' });
  }

  const { estimateId } = req.params;
  const { user_id, due_days, notes } = req.body;

  // Fetch the estimate with related data
  const { data: estimate, error: estimateError } = await supabase
    .from('estimates')
    .select('*')
    .eq('id', estimateId)
    .single();

  if (estimateError || !estimate) {
    return res.status(404).json({ error: 'Estimate not found' });
  }

  // Check if invoice already exists for this estimate
  const { data: existingInvoice } = await supabase
    .from('invoices')
    .select('id, invoice_number')
    .eq('estimate_id', estimateId)
    .single();

  if (existingInvoice) {
    return res.status(400).json({
      error: 'Invoice already exists for this estimate',
      invoice_id: existingInvoice.id,
      invoice_number: existingInvoice.invoice_number
    });
  }

  // Generate invoice number
  const { data: lastInvoice } = await supabase
    .from('invoices')
    .select('invoice_number')
    .eq('user_id', user_id)
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  let nextNumber = 1001;
  if (lastInvoice?.invoice_number) {
    const match = lastInvoice.invoice_number.match(/\d+/);
    if (match) {
      nextNumber = parseInt(match[0]) + 1;
    }
  }
  const invoiceNumber = `INV-${nextNumber}`;

  // Calculate due date
  const dueDate = new Date();
  dueDate.setDate(dueDate.getDate() + due_days);

  // Create invoice
  const invoiceData = {
    user_id,
    customer_id: estimate.customer_id,
    lead_id: estimate.lead_id,  // Preserve lead linkage
    estimate_id: estimateId,     // Link to estimate
    invoice_number: invoiceNumber,
    status: 'draft',
    subtotal: estimate.subtotal || estimate.total,
    tax: estimate.tax || 0,
    total: estimate.total,
    due_date: dueDate.toISOString(),
    notes: notes || estimate.notes,
    line_items: estimate.line_items || [],
    customer_name: estimate.customer_name,
    customer_email: estimate.customer_email,
    customer_phone: estimate.customer_phone,
    customer_address: estimate.customer_address
  };

  const { data: newInvoice, error: invoiceError } = await supabase
    .from('invoices')
    .insert([invoiceData])
    .select()
    .single();

  if (invoiceError) {
    return handleApiError(res, invoiceError, 'Create invoice');
  }

  // Update estimate status
  await supabase
    .from('estimates')
    .update({
      status: 'converted',
      invoice_id: newInvoice.id,
      updated_at: new Date().toISOString()
    })
    .eq('id', estimateId);

  logger.info('Estimate converted to invoice', {
    estimateId,
    invoiceId: newInvoice.id,
    invoiceNumber
  });

  res.json({
    success: true,
    message: 'Estimate successfully converted to invoice',
    data: {
      invoice: newInvoice,
      estimate_id: estimateId
    }
  });
}));

// ============================================================
// INVOICE PAID → JOB CREATION
// ============================================================

/**
 * Create a job from a paid invoice
 * POST /api/workflow/invoice-to-job/:invoiceId
 *
 * Automatically creates a job when invoice is marked as paid
 */
router.post('/invoice-to-job/:invoiceId',
  validateBody(schemas.invoiceToJob),
  asyncHandler(async (req, res) => {
  const supabase = req.app.get('supabase');
  if (!supabase) {
    return res.status(500).json({ error: 'Database not configured' });
  }

  const { invoiceId } = req.params;
  const { user_id, scheduled_date, notes } = req.body;

  // Fetch the invoice
  const { data: invoice, error: invoiceError } = await supabase
    .from('invoices')
    .select('*')
    .eq('id', invoiceId)
    .single();

  if (invoiceError || !invoice) {
    return res.status(404).json({ error: 'Invoice not found' });
  }

  // Check if job already exists for this invoice
  const { data: existingJob } = await supabase
    .from('jobs')
    .select('id, title')
    .eq('invoice_id', invoiceId)
    .single();

  if (existingJob) {
    return res.status(400).json({
      error: 'Job already exists for this invoice',
      job_id: existingJob.id,
      job_title: existingJob.title
    });
  }

  // Generate job title
  const customerName = invoice.customer_name || 'Customer';
  const jobTitle = `Installation - ${customerName}`;

  // Create job
  const jobData = {
    user_id,
    customer_id: invoice.customer_id,
    lead_id: invoice.lead_id,       // Preserve lead linkage
    estimate_id: invoice.estimate_id, // Preserve estimate linkage
    invoice_id: invoiceId,           // Link to invoice
    title: jobTitle,
    description: invoice.notes || notes,
    status: 'new',
    priority: 'medium',
    scheduled_date: scheduled_date || null,
    address: invoice.customer_address,
    customer_name: invoice.customer_name,
    customer_email: invoice.customer_email,
    customer_phone: invoice.customer_phone,
    total_value: invoice.total
  };

  const { data: newJob, error: jobError } = await supabase
    .from('jobs')
    .insert([jobData])
    .select()
    .single();

  if (jobError) {
    return handleApiError(res, jobError, 'Create job');
  }

  // Update invoice with job_id
  await supabase
    .from('invoices')
    .update({
      job_id: newJob.id,
      updated_at: new Date().toISOString()
    })
    .eq('id', invoiceId);

  logger.info('Job created from invoice', {
    invoiceId,
    jobId: newJob.id
  });

  // Send notification to customer about job creation
  if (invoice.customer_email && emailService.isConfigured()) {
    try {
      const email = emailService.generateJobStatusEmail(newJob, 'new');
      await emailService.sendNotification(invoice.customer_email, email.subject, email.html);
    } catch (emailErr) {
      logger.apiError(emailErr, { context: 'Job creation email failed' });
    }
  }

  res.json({
    success: true,
    message: 'Job successfully created from invoice',
    data: {
      job: newJob,
      invoice_id: invoiceId
    }
  });
}));

// ============================================================
// FULL FLOW: LEAD → CUSTOMER → ESTIMATE → INVOICE → JOB
// ============================================================

/**
 * Get complete flow data for a lead/customer
 * GET /api/workflow/flow/:type/:id
 *
 * Returns complete chain: lead, customer, estimates, invoices, jobs
 */
router.get('/flow/:type/:id', asyncHandler(async (req, res) => {
  const supabase = req.app.get('supabase');
  if (!supabase) {
    return res.status(500).json({ error: 'Database not configured' });
  }

  const { type, id } = req.params;

  let flow = {
    lead: null,
    customer: null,
    estimates: [],
    invoices: [],
    jobs: []
  };

  if (type === 'lead') {
    // Start from lead
    const { data: lead } = await supabase
      .from('leads')
      .select('*')
      .eq('id', id)
      .single();

    flow.lead = lead;

    if (lead?.customer_id) {
      const { data: customer } = await supabase
        .from('customers')
        .select('*')
        .eq('id', lead.customer_id)
        .single();
      flow.customer = customer;
    }

    // Get estimates linked to this lead
    const { data: estimates } = await supabase
      .from('estimates')
      .select('*')
      .eq('lead_id', id);
    flow.estimates = estimates || [];

    // Get invoices linked to this lead
    const { data: invoices } = await supabase
      .from('invoices')
      .select('*')
      .eq('lead_id', id);
    flow.invoices = invoices || [];

    // Get jobs linked to this lead
    const { data: jobs } = await supabase
      .from('jobs')
      .select('*')
      .eq('lead_id', id);
    flow.jobs = jobs || [];

  } else if (type === 'customer') {
    // Start from customer
    const { data: customer } = await supabase
      .from('customers')
      .select('*')
      .eq('id', id)
      .single();

    flow.customer = customer;

    if (customer?.lead_id) {
      const { data: lead } = await supabase
        .from('leads')
        .select('*')
        .eq('id', customer.lead_id)
        .single();
      flow.lead = lead;
    }

    // Get all estimates for customer
    const { data: estimates } = await supabase
      .from('estimates')
      .select('*')
      .eq('customer_id', id);
    flow.estimates = estimates || [];

    // Get all invoices for customer
    const { data: invoices } = await supabase
      .from('invoices')
      .select('*')
      .eq('customer_id', id);
    flow.invoices = invoices || [];

    // Get all jobs for customer
    const { data: jobs } = await supabase
      .from('jobs')
      .select('*')
      .eq('customer_id', id);
    flow.jobs = jobs || [];
  }

  res.json({
    success: true,
    data: flow
  });
}));

// ============================================================
// SEND NOTIFICATIONS
// ============================================================

/**
 * Send status update notification (email + SMS)
 * POST /api/workflow/notify
 */
router.post('/notify',
  validateBody(schemas.notify),
  asyncHandler(async (req, res) => {
  const { type, action, entity, recipient, new_status } = req.body;

  const results = {
    email: { sent: false },
    sms: { sent: false }
  };

  // Send email notification
  if (recipient?.email && emailService.isConfigured()) {
    try {
      let email;

      switch (type) {
        case 'estimate':
          if (action === 'sent') {
            email = emailService.generateEstimateSentEmail(entity);
          } else if (action === 'approved') {
            email = emailService.generateEstimateApprovedEmail(entity);
          }
          break;

        case 'invoice':
          if (action === 'sent') {
            email = emailService.generateInvoiceSentEmail(entity);
          } else if (action === 'paid') {
            email = emailService.generatePaymentConfirmationEmail(entity);
          }
          break;

        case 'job':
          if (action === 'status_change') {
            email = emailService.generateJobStatusEmail(entity, new_status);
          }
          break;

        case 'appointment':
          if (action === 'reminder') {
            email = emailService.generateAppointmentReminderEmail(entity);
          }
          break;
      }

      if (email) {
        await emailService.sendNotification(recipient.email, email.subject, email.html);
        results.email = { sent: true };
      }
    } catch (err) {
      logger.apiError(err, { context: 'Notification email failed' });
      results.email = { sent: false, error: err.message };
    }
  }

  // Send SMS notification
  if (recipient?.phone && smsService.isConfigured()) {
    try {
      let smsResult;

      switch (type) {
        case 'estimate':
          if (action === 'sent') {
            smsResult = await smsService.sendEstimateNotification(entity, recipient.phone);
          } else if (action === 'approved') {
            smsResult = await smsService.sendEstimateApprovedNotification(entity, recipient.phone);
          }
          break;

        case 'invoice':
          if (action === 'sent') {
            smsResult = await smsService.sendInvoiceNotification(entity, recipient.phone);
          } else if (action === 'paid') {
            smsResult = await smsService.sendPaymentConfirmation(entity, recipient.phone);
          }
          break;

        case 'job':
          if (action === 'status_change') {
            smsResult = await smsService.sendJobStatusUpdate(entity, new_status, recipient.phone);
          } else if (action === 'scheduled') {
            smsResult = await smsService.sendJobScheduledNotification(entity, recipient.phone);
          }
          break;

        case 'appointment':
          if (action === 'reminder') {
            smsResult = await smsService.sendAppointmentReminder(entity, recipient.phone);
          } else if (action === 'confirmed') {
            smsResult = await smsService.sendAppointmentConfirmation(entity, recipient.phone);
          }
          break;
      }

      if (smsResult) {
        results.sms = smsResult;
      }
    } catch (err) {
      logger.apiError(err, { context: 'Notification SMS failed' });
      results.sms = { sent: false, error: err.message };
    }
  }

  res.json({
    success: true,
    notifications: results
  });
}));

module.exports = router;
