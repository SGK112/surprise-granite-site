/**
 * Validation Schemas
 * Joi schemas for validating API request data
 */

const Joi = require('joi');

// ============================================================
// COMMON PATTERNS
// ============================================================

const patterns = {
  uuid: Joi.string().uuid(),
  email: Joi.string().email().max(255).lowercase().trim(),
  phone: Joi.string().pattern(/^[\d\s\-\(\)\+\.]+$/).min(10).max(20),
  zipCode: Joi.string().pattern(/^\d{5}(-\d{4})?$/).max(10),
  url: Joi.string().uri().max(2000),
  currency: Joi.number().min(0).max(9999999.99).precision(2),
  percentage: Joi.number().min(0).max(100).precision(2),
  positiveInt: Joi.number().integer().min(0).max(999999),
  safeString: (max = 500) => Joi.string().max(max).trim(),
  safeText: (max = 5000) => Joi.string().max(max).trim()
};

// ============================================================
// LEAD SCHEMAS
// ============================================================

const leadSchemas = {
  create: Joi.object({
    first_name: patterns.safeString(100),
    last_name: patterns.safeString(100),
    full_name: patterns.safeString(200),
    homeowner_name: patterns.safeString(200),
    email: patterns.email.required(),
    homeowner_email: patterns.email,
    phone: patterns.phone,
    homeowner_phone: patterns.phone,
    address: patterns.safeString(500),
    project_address: patterns.safeString(500),
    city: patterns.safeString(100),
    state: patterns.safeString(50),
    zip: patterns.zipCode,
    zip_code: patterns.zipCode,
    project_zip: patterns.zipCode,
    project_type: patterns.safeString(100),
    project_budget: patterns.safeString(50),
    project_timeline: patterns.safeString(100),
    project_details: patterns.safeText(2000),
    message: patterns.safeText(2000),
    source: patterns.safeString(50).default('website'),
    form_name: patterns.safeString(100),
    page_url: patterns.url,
    appointment_date: Joi.date().iso(),
    appointment_time: patterns.safeString(20),
    appointment_type: patterns.safeString(50)
  }),

  update: Joi.object({
    status: Joi.string().valid('new', 'contacted', 'qualified', 'quoted', 'won', 'lost'),
    notes: patterns.safeText(2000),
    assigned_to: patterns.uuid,
    follow_up_date: Joi.date().iso()
  })
};

// ============================================================
// CUSTOMER SCHEMAS
// ============================================================

const customerSchemas = {
  create: Joi.object({
    first_name: patterns.safeString(100).required(),
    last_name: patterns.safeString(100),
    email: patterns.email.required(),
    phone: patterns.phone,
    address: patterns.safeString(500),
    city: patterns.safeString(100),
    state: patterns.safeString(50),
    zip: patterns.zipCode,
    notes: patterns.safeText(2000),
    source: patterns.safeString(50),
    lead_id: patterns.uuid
  }),

  update: Joi.object({
    first_name: patterns.safeString(100),
    last_name: patterns.safeString(100),
    email: patterns.email,
    phone: patterns.phone,
    address: patterns.safeString(500),
    city: patterns.safeString(100),
    state: patterns.safeString(50),
    zip: patterns.zipCode,
    notes: patterns.safeText(2000)
  })
};

// ============================================================
// ESTIMATE SCHEMAS
// ============================================================

const estimateLineItem = Joi.object({
  name: patterns.safeString(200),
  description: patterns.safeString(500),
  quantity: Joi.number().min(0.01).max(99999).required(),
  unit_price: patterns.currency.required(),
  unit_type: patterns.safeString(50),
  category: patterns.safeString(100),
  total: patterns.currency
});

const estimateSchemas = {
  create: Joi.object({
    customer_id: patterns.uuid,
    lead_id: patterns.uuid,
    customer_name: patterns.safeString(200),
    customer_email: patterns.email,
    customer_phone: patterns.phone,
    customer_address: patterns.safeString(500),
    project_name: patterns.safeString(200),
    project_type: patterns.safeString(100),
    project_description: patterns.safeText(2000),
    items: Joi.array().items(estimateLineItem).min(1).required(),
    subtotal: patterns.currency.required(),
    tax_rate: patterns.percentage.default(0),
    tax_amount: patterns.currency.default(0),
    discount_type: Joi.string().valid('percent', 'fixed'),
    discount_value: Joi.number().min(0).max(100),
    discount_amount: patterns.currency.default(0),
    total: patterns.currency.required(),
    deposit_percent: patterns.percentage,
    deposit_amount: patterns.currency,
    inclusions: patterns.safeText(2000),
    exclusions: patterns.safeText(2000),
    terms_conditions: patterns.safeText(5000),
    estimated_timeline: patterns.safeString(200),
    valid_until: Joi.date().iso(),
    warranty_terms: patterns.safeText(2000),
    notes: patterns.safeText(2000),
    internal_notes: patterns.safeText(2000),
    status: Joi.string().valid('draft', 'sent', 'approved', 'rejected', 'expired', 'converted').default('draft')
  }),

  sendEmail: Joi.object({
    customer_email: patterns.email.required(),
    customer_name: patterns.safeString(200),
    estimate_number: patterns.safeString(50),
    estimate_id: patterns.uuid,
    items: Joi.array().items(estimateLineItem),
    subtotal: patterns.currency,
    total: patterns.currency,
    notes: patterns.safeText(2000),
    view_url: patterns.url
  })
};

// ============================================================
// INVOICE SCHEMAS
// ============================================================

const invoiceLineItem = Joi.object({
  description: patterns.safeString(500).required(),
  quantity: Joi.number().min(0.01).max(99999).required(),
  unit_price: patterns.currency.required(),
  total: patterns.currency
});

const invoiceSchemas = {
  create: Joi.object({
    customer_id: patterns.uuid,
    estimate_id: patterns.uuid,
    customer_name: patterns.safeString(200),
    customer_email: patterns.email.required(),
    customer_phone: patterns.phone,
    customer_address: patterns.safeString(500),
    items: Joi.array().items(invoiceLineItem).min(1).required(),
    subtotal: patterns.currency.required(),
    tax_rate: patterns.percentage.default(0),
    tax_amount: patterns.currency.default(0),
    total: patterns.currency.required(),
    due_date: Joi.date().iso(),
    payment_terms: patterns.safeString(200),
    notes: patterns.safeText(2000),
    status: Joi.string().valid('draft', 'sent', 'paid', 'void', 'overdue').default('draft')
  }),

  update: Joi.object({
    status: Joi.string().valid('draft', 'sent', 'paid', 'void', 'overdue'),
    amount_paid: patterns.currency,
    notes: patterns.safeText(2000)
  })
};

// ============================================================
// JOB SCHEMAS
// ============================================================

const jobSchemas = {
  create: Joi.object({
    customer_id: patterns.uuid.required(),
    invoice_id: patterns.uuid,
    estimate_id: patterns.uuid,
    lead_id: patterns.uuid,
    customer_name: patterns.safeString(200),
    customer_email: patterns.email,
    customer_phone: patterns.phone,
    customer_address: patterns.safeString(500),
    title: patterns.safeString(200),
    project_description: patterns.safeText(2000),
    project_type: patterns.safeString(100),
    scheduled_date: Joi.date().iso(),
    estimated_start_date: Joi.date().iso(),
    estimated_end_date: Joi.date().iso(),
    contract_amount: patterns.currency,
    deposit_amount: patterns.currency,
    status: Joi.string().valid(
      'new', 'assigned', 'scheduled', 'material_ordered', 'material_received',
      'in_progress', 'on_hold', 'completed', 'cancelled', 'archived'
    ).default('new'),
    priority: Joi.string().valid('low', 'medium', 'high', 'urgent').default('medium'),
    notes: patterns.safeText(2000),
    internal_notes: patterns.safeText(2000)
  }),

  update: Joi.object({
    status: Joi.string().valid(
      'new', 'assigned', 'scheduled', 'material_ordered', 'material_received',
      'in_progress', 'on_hold', 'completed', 'cancelled', 'archived'
    ),
    priority: Joi.string().valid('low', 'medium', 'high', 'urgent'),
    scheduled_date: Joi.date().iso(),
    assigned_to: patterns.uuid,
    notes: patterns.safeText(2000),
    internal_notes: patterns.safeText(2000)
  })
};

// ============================================================
// EMAIL SCHEMAS
// ============================================================

const emailSchemas = {
  send: Joi.object({
    to: patterns.email.required(),
    subject: patterns.safeString(200).required(),
    message: patterns.safeText(5000).required(),
    type: Joi.string().valid('info', 'success', 'warning', 'error').default('info')
  }),

  contact: Joi.object({
    name: patterns.safeString(200).required(),
    email: patterns.email.required(),
    phone: patterns.phone,
    subject: patterns.safeString(200),
    message: patterns.safeText(2000).required()
  })
};

// ============================================================
// QUERY SCHEMAS
// ============================================================

const querySchemas = {
  pagination: Joi.object({
    limit: Joi.number().integer().min(1).max(100).default(50),
    offset: Joi.number().integer().min(0).default(0),
    page: Joi.number().integer().min(1)
  }),

  leadFilters: Joi.object({
    status: Joi.string().valid('new', 'contacted', 'qualified', 'quoted', 'won', 'lost'),
    source: patterns.safeString(50),
    limit: Joi.number().integer().min(1).max(100).default(50),
    offset: Joi.number().integer().min(0).default(0)
  }),

  jobFilters: Joi.object({
    status: Joi.string().valid(
      'new', 'assigned', 'scheduled', 'material_ordered', 'material_received',
      'in_progress', 'on_hold', 'completed', 'cancelled', 'archived'
    ),
    priority: Joi.string().valid('low', 'medium', 'high', 'urgent'),
    customer_id: patterns.uuid,
    limit: Joi.number().integer().min(1).max(100).default(50),
    offset: Joi.number().integer().min(0).default(0)
  })
};

// ============================================================
// PARAM SCHEMAS
// ============================================================

const paramSchemas = {
  id: Joi.object({
    id: patterns.uuid.required()
  }),

  email: Joi.object({
    email: patterns.email.required()
  })
};

// ============================================================
// EXPORTS
// ============================================================

module.exports = {
  patterns,
  lead: leadSchemas,
  customer: customerSchemas,
  estimate: estimateSchemas,
  invoice: invoiceSchemas,
  job: jobSchemas,
  email: emailSchemas,
  query: querySchemas,
  params: paramSchemas
};
