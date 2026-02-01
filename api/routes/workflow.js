/**
 * Workflow Routes
 * Handles conversions: Lead → Project, Estimate → Invoice, Invoice → Project
 * Unified project-centric workflow with complete data chain
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
const { createProjectService } = require('../services/projectService');

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

  leadToProject: Joi.object({
    user_id: Joi.string().uuid().required(),
    create_customer: Joi.boolean().default(true),
    additional_data: Joi.object({
      city: Joi.string().max(100).trim(),
      state: Joi.string().max(50).trim().default('AZ')
    }).default({})
  }),

  invoiceToProject: Joi.object({
    user_id: Joi.string().uuid().required(),
    scheduled_date: Joi.date().iso(),
    notes: Joi.string().max(2000).trim().allow('')
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
    type: Joi.string().valid('estimate', 'invoice', 'job', 'appointment', 'handoff').required(),
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
// LEAD → PROJECT CONVERSION (NEW UNIFIED APPROACH)
// ============================================================

/**
 * Convert a lead directly to a project
 * POST /api/workflow/lead-to-project/:leadId
 *
 * Creates a project with status='lead' and optionally a customer record
 */
router.post('/lead-to-project/:leadId',
  validateBody(schemas.leadToProject),
  asyncHandler(async (req, res) => {
  const supabase = req.app.get('supabase');
  if (!supabase) {
    return res.status(500).json({ error: 'Database not configured' });
  }

  const projectService = createProjectService(supabase);
  const { leadId } = req.params;
  const { user_id, create_customer, additional_data } = req.body;

  // Create project from lead using the service
  const result = await projectService.createFromLead(leadId, user_id);

  // Optionally create customer record as well
  let customer = null;
  if (create_customer) {
    // Fetch the lead for customer data
    const { data: lead } = await supabase
      .from('leads')
      .select('*')
      .eq('id', leadId)
      .single();

    if (lead) {
      // Check if customer already exists
      const { data: existingCustomer } = await supabase
        .from('customers')
        .select('id')
        .eq('email', lead.homeowner_email)
        .eq('user_id', user_id)
        .single();

      if (existingCustomer) {
        customer = existingCustomer;
        // Link customer to project
        await supabase
          .from('projects')
          .update({ customer_id: existingCustomer.id })
          .eq('id', result.project.id);
      } else {
        // Parse name into first/last
        const nameParts = (lead.homeowner_name || '').trim().split(' ');
        const firstName = nameParts[0] || '';
        const lastName = nameParts.slice(1).join(' ') || '';

        const { data: newCustomer } = await supabase
          .from('customers')
          .insert({
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
            lead_id: leadId
          })
          .select()
          .single();

        if (newCustomer) {
          customer = newCustomer;
          // Link customer to project
          await supabase
            .from('projects')
            .update({ customer_id: newCustomer.id })
            .eq('id', result.project.id);
        }
      }
    }
  }

  // Add customer as collaborator for portal access
  if (result.project.customer_email) {
    await projectService.addCustomerAsCollaborator(result.project.id, user_id);
  }

  logger.info('Lead converted to project', {
    leadId,
    projectId: result.project.id,
    customerId: customer?.id,
    created: result.created
  });

  res.json({
    success: true,
    message: result.created ? 'Lead converted to project' : 'Project already exists for this lead',
    data: {
      project: result.project,
      customer,
      lead_id: leadId,
      portal_url: result.project.portal_token
        ? `https://www.surprisegranite.com/portal/?token=${result.project.portal_token}`
        : null
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
// ESTIMATE → PROJECT (DIRECT CONVERSION)
// ============================================================

/**
 * Convert an approved estimate directly to a project
 * POST /api/workflow/estimate-to-project/:estimateId
 *
 * Creates a project from an estimate, skipping invoice step
 * Useful for deposit-paid or verbal approval scenarios
 */
router.post('/estimate-to-project/:estimateId',
  asyncHandler(async (req, res) => {
  const supabase = req.app.get('supabase');
  if (!supabase) {
    return res.status(500).json({ error: 'Database not configured' });
  }

  const { estimateId } = req.params;
  const { user_id, status = 'approved', notes, scheduled_date } = req.body;

  if (!user_id) {
    return res.status(400).json({ error: 'user_id is required' });
  }

  // Fetch the estimate
  const { data: estimate, error: estimateError } = await supabase
    .from('estimates')
    .select('*')
    .eq('id', estimateId)
    .single();

  if (estimateError || !estimate) {
    return res.status(404).json({ error: 'Estimate not found' });
  }

  // Check if project already exists for this estimate
  const { data: existingProject } = await supabase
    .from('projects')
    .select('id, name')
    .eq('estimate_id', estimateId)
    .single();

  if (existingProject) {
    return res.status(400).json({
      error: 'Project already exists for this estimate',
      project_id: existingProject.id,
      project_name: existingProject.name
    });
  }

  // Generate portal token
  const crypto = require('crypto');
  const portalToken = crypto.randomBytes(32).toString('hex');

  // Create project from estimate data
  const projectData = {
    user_id,
    name: estimate.project_name || `Project - ${estimate.customer_name}`,
    description: estimate.project_description || estimate.notes || '',
    customer_name: estimate.customer_name,
    customer_email: estimate.customer_email,
    customer_phone: estimate.customer_phone,
    address: estimate.customer_address || estimate.project_address,
    status: status,
    priority: 'medium',
    value: estimate.total || 0,
    estimate_id: estimateId,
    lead_id: estimate.lead_id,
    portal_token: portalToken,
    portal_enabled: true,
    notes: notes || estimate.notes,
    start_date: scheduled_date || null
  };

  const { data: newProject, error: projectError } = await supabase
    .from('projects')
    .insert([projectData])
    .select()
    .single();

  if (projectError) {
    return handleApiError(res, projectError, 'Create project from estimate');
  }

  // Update estimate status
  await supabase
    .from('estimates')
    .update({
      status: 'converted',
      updated_at: new Date().toISOString()
    })
    .eq('id', estimateId);

  // Log activity
  await supabase
    .from('project_activity')
    .insert([{
      project_id: newProject.id,
      user_id,
      action: 'created',
      description: `Project created from estimate ${estimate.estimate_number || estimateId}`
    }]);

  logger.info('Estimate converted to project', {
    estimateId,
    projectId: newProject.id,
    projectName: newProject.name
  });

  // Send notification to customer if email configured
  if (newProject.customer_email && emailService.isConfigured()) {
    try {
      const email = {
        subject: `Your Project Has Been Created - Surprise Granite`,
        html: emailService.wrapEmailTemplate(`
          <h2>Great News!</h2>
          <p>Your project "${newProject.name}" has been created and is now being processed.</p>
          <p>You can track your project status anytime using the customer portal:</p>
          <div style="text-align: center; margin: 20px 0;">
            <a href="https://www.surprisegranite.com/portal/?token=${portalToken}"
               style="background: #f9cb00; color: #1a1a2e; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold;">
              View Project Status
            </a>
          </div>
          <p>We'll be in touch soon with next steps.</p>
        `, { headerText: 'Project Created' })
      };
      await emailService.sendNotification(newProject.customer_email, email.subject, email.html);
    } catch (emailErr) {
      logger.apiError(emailErr, { context: 'Project creation email failed' });
    }
  }

  res.json({
    success: true,
    message: 'Estimate successfully converted to project',
    data: {
      project: newProject,
      estimate_id: estimateId,
      portal_url: `https://www.surprisegranite.com/portal/?token=${portalToken}`
    }
  });
}));

// ============================================================
// INVOICE PAID → PROJECT UPDATE (UNIFIED APPROACH)
// ============================================================

/**
 * Update/create project from paid invoice
 * POST /api/workflow/invoice-to-project/:invoiceId
 *
 * Creates or updates a project when invoice is paid
 */
router.post('/invoice-to-project/:invoiceId',
  validateBody(schemas.invoiceToProject),
  asyncHandler(async (req, res) => {
  const supabase = req.app.get('supabase');
  if (!supabase) {
    return res.status(500).json({ error: 'Database not configured' });
  }

  const projectService = createProjectService(supabase);
  const { invoiceId } = req.params;
  const { user_id, scheduled_date, notes } = req.body;

  // Use the project service to handle the conversion
  const result = await projectService.convertFromInvoice(invoiceId, user_id, {
    scheduled_date,
    notes
  });

  // Add customer as collaborator
  if (result.project.customer_email) {
    await projectService.addCustomerAsCollaborator(result.project.id, user_id);
  }

  // Send notification to customer
  if (result.project.customer_email && emailService.isConfigured()) {
    try {
      const email = {
        subject: `Your Project Has Been Confirmed - Surprise Granite`,
        html: emailService.wrapEmailTemplate(`
          <h2>Thank You for Your Payment!</h2>
          <p>Your project "${result.project.name}" has been confirmed and is now in our system.</p>
          <p>You can track your project status anytime using the customer portal:</p>
          <div style="text-align: center; margin: 20px 0;">
            <a href="https://www.surprisegranite.com/portal/?token=${result.project.portal_token}"
               style="background: #f9cb00; color: #1a1a2e; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold;">
              View Project Status
            </a>
          </div>
          <p>We'll be in touch soon to schedule your installation.</p>
        `, { headerText: 'Project Confirmed' })
      };
      await emailService.sendNotification(result.project.customer_email, email.subject, email.html);
    } catch (emailErr) {
      logger.apiError(emailErr, { context: 'Project confirmation email failed' });
    }
  }

  logger.info('Project created/updated from invoice', {
    invoiceId,
    projectId: result.project.id,
    created: result.created
  });

  res.json({
    success: true,
    message: result.created ? 'Project created from invoice' : 'Project updated with payment',
    data: {
      project: result.project,
      invoice_id: invoiceId,
      portal_url: result.project.portal_token
        ? `https://www.surprisegranite.com/portal/?token=${result.project.portal_token}`
        : null
    }
  });
}));

// ============================================================
// INVOICE PAID → JOB CREATION (LEGACY - redirects to project)
// ============================================================

/**
 * Create a job from a paid invoice (Legacy endpoint)
 * POST /api/workflow/invoice-to-job/:invoiceId
 *
 * @deprecated Use /invoice-to-project/:invoiceId instead
 * This now creates a project instead of a job
 */
router.post('/invoice-to-job/:invoiceId',
  validateBody(schemas.invoiceToJob),
  asyncHandler(async (req, res) => {
  const supabase = req.app.get('supabase');
  if (!supabase) {
    return res.status(500).json({ error: 'Database not configured' });
  }

  const projectService = createProjectService(supabase);
  const { invoiceId } = req.params;
  const { user_id, scheduled_date, notes } = req.body;

  // Use the unified project approach
  const result = await projectService.convertFromInvoice(invoiceId, user_id, {
    scheduled_date,
    notes
  });

  // For backwards compatibility, also create a job record if needed
  const { data: existingJob } = await supabase
    .from('jobs')
    .select('id')
    .eq('invoice_id', invoiceId)
    .single();

  let job = existingJob;
  if (!existingJob) {
    // Fetch invoice for job data
    const { data: invoice } = await supabase
      .from('invoices')
      .select('*')
      .eq('id', invoiceId)
      .single();

    if (invoice) {
      const { data: newJob } = await supabase
        .from('jobs')
        .insert({
          user_id,
          customer_id: invoice.customer_id,
          lead_id: invoice.lead_id,
          estimate_id: invoice.estimate_id,
          invoice_id: invoiceId,
          job_number: result.project.job_number,
          title: result.project.name,
          description: notes || invoice.notes,
          status: 'new',
          priority: 'medium',
          scheduled_date: scheduled_date || null,
          customer_address: invoice.customer_address,
          customer_name: invoice.customer_name,
          customer_email: invoice.customer_email,
          customer_phone: invoice.customer_phone,
          contract_amount: invoice.total
        })
        .select()
        .single();

      job = newJob;

      // Link job to project
      if (newJob) {
        await supabase
          .from('projects')
          .update({ legacy_job_id: newJob.id })
          .eq('id', result.project.id);
      }
    }
  }

  logger.info('Job/Project created from invoice', {
    invoiceId,
    projectId: result.project.id,
    jobId: job?.id
  });

  res.json({
    success: true,
    message: 'Project and job created from invoice',
    data: {
      project: result.project,
      job,
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
    jobs: [],
    handoffs: []
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

    // Get design handoffs linked to this lead's project
    if (lead?.project_id) {
      const { data: handoffs } = await supabase
        .from('design_handoffs')
        .select('*')
        .eq('project_id', lead.project_id);
      flow.handoffs = handoffs || [];
    }

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

    // Get design handoffs for customer's projects
    const { data: customerProjects } = await supabase
      .from('projects')
      .select('id')
      .eq('customer_id', id);

    if (customerProjects && customerProjects.length > 0) {
      const projectIds = customerProjects.map(p => p.id);
      const { data: handoffs } = await supabase
        .from('design_handoffs')
        .select('*')
        .in('project_id', projectIds);
      flow.handoffs = handoffs || [];
    }
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

        case 'handoff':
          if (action === 'status_change' && entity.title) {
            email = {
              subject: `Design Handoff Update: ${entity.title}`,
              html: `<p>The design handoff "${entity.title}" has been updated to: <strong>${(new_status || '').replace(/_/g, ' ')}</strong></p>`
            };
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

        case 'handoff':
          if (action === 'status_change' && entity.title) {
            smsResult = await smsService.sendSMS(
              recipient.phone,
              `Surprise Granite: Design handoff "${entity.title}" updated to ${(new_status || '').replace(/_/g, ' ')}`
            );
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
