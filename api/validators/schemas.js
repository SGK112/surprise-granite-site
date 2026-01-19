/**
 * Validation Schemas
 * Joi schemas for request validation
 */

const Joi = require('joi');

// Common field patterns
const email = Joi.string().email().lowercase().trim().max(255);
const phone = Joi.string().pattern(/^[\d\s\-\(\)\+\.]+$/).max(30).allow('', null);
const uuid = Joi.string().uuid();
const pagination = {
  limit: Joi.number().integer().min(1).max(100).default(20),
  offset: Joi.number().integer().min(0).default(0)
};

/**
 * Lead Schemas
 */
const leadSchemas = {
  create: Joi.object({
    name: Joi.string().trim().min(1).max(200).required(),
    email: email.required(),
    phone: phone,
    message: Joi.string().trim().min(10).max(5000).required(),
    source: Joi.string().max(100).default('website'),
    project_type: Joi.string().valid(
      'kitchen_countertops',
      'bathroom',
      'full_remodel',
      'commercial',
      'flooring',
      'tile',
      'other'
    ),
    project_zip: Joi.string().pattern(/^\d{5}(-\d{4})?$/).allow('', null),
    budget_range: Joi.string().max(50),
    timeline: Joi.string().max(100),
    referral_source: Joi.string().max(100),
    metadata: Joi.object().default({})
  }),

  update: Joi.object({
    status: Joi.string().valid('new', 'contacted', 'qualified', 'quoted', 'won', 'lost'),
    notes: Joi.string().max(5000),
    assigned_to: Joi.string().max(100),
    follow_up_date: Joi.date().iso(),
    metadata: Joi.object()
  }),

  list: Joi.object({
    status: Joi.string().valid('new', 'contacted', 'qualified', 'quoted', 'won', 'lost'),
    source: Joi.string().max(100),
    search: Joi.string().max(100),
    start_date: Joi.date().iso(),
    end_date: Joi.date().iso(),
    ...pagination
  })
};

/**
 * Customer Schemas
 */
const customerSchemas = {
  create: Joi.object({
    email: email.required(),
    name: Joi.string().trim().max(200),
    phone: phone,
    company: Joi.string().trim().max(200),
    address: Joi.string().trim().max(500),
    metadata: Joi.object().default({})
  }),

  update: Joi.object({
    name: Joi.string().trim().max(200),
    phone: phone,
    company: Joi.string().trim().max(200),
    address: Joi.string().trim().max(500),
    metadata: Joi.object()
  }),

  list: Joi.object({
    search: Joi.string().max(100),
    ...pagination
  })
};

/**
 * Invoice Schemas
 */
const invoiceSchemas = {
  create: Joi.object({
    customer_email: email.required(),
    customer_name: Joi.string().trim().max(200),
    items: Joi.array().items(
      Joi.object({
        description: Joi.string().trim().min(1).max(500).required(),
        amount: Joi.number().positive().required(),
        quantity: Joi.number().integer().positive().default(1)
      })
    ).min(1).required(),
    description: Joi.string().trim().max(1000),
    due_date: Joi.date().iso().min('now'),
    notes: Joi.string().trim().max(2000),
    send_email: Joi.boolean().default(true)
  }),

  list: Joi.object({
    status: Joi.string().valid('draft', 'open', 'paid', 'void', 'uncollectible'),
    customer_id: Joi.string().max(100),
    starting_after: Joi.string().max(100),
    ...pagination
  })
};

/**
 * Product Schemas
 */
const productSchemas = {
  create: Joi.object({
    sku: Joi.string().trim().max(100),
    external_sku: Joi.string().trim().max(100),
    upc: Joi.string().trim().max(50),
    product_type: Joi.string().valid('slab', 'tile', 'flooring', 'sink', 'faucet', 'accessory', 'other').default('slab'),
    name: Joi.string().trim().min(1).max(300).required(),
    brand: Joi.string().trim().max(100),
    description: Joi.string().trim().max(2000),
    material_type: Joi.string().trim().max(100),
    color_family: Joi.string().trim().max(100),
    finish: Joi.string().trim().max(100),
    quantity: Joi.number().integer().min(0).default(1),
    quantity_unit: Joi.string().valid('each', 'sqft', 'lnft', 'box', 'pallet').default('each'),
    min_stock_level: Joi.number().integer().min(0).default(0),
    cost_price: Joi.number().min(0),
    wholesale_price: Joi.number().min(0),
    retail_price: Joi.number().min(0),
    price_unit: Joi.string().valid('each', 'sqft', 'lnft').default('each'),
    location_id: uuid,
    warehouse_zone: Joi.string().trim().max(50),
    bin_location: Joi.string().trim().max(50),
    status: Joi.string().valid('active', 'inactive', 'out_of_stock').default('active'),
    is_featured: Joi.boolean().default(false),
    is_public: Joi.boolean().default(true),
    images: Joi.array().items(Joi.string().uri()).max(20),
    tags: Joi.array().items(Joi.string().max(50)).max(20),
    custom_attributes: Joi.object(),
    type_data: Joi.object({
      length_inches: Joi.number().positive(),
      width_inches: Joi.number().positive(),
      thickness_cm: Joi.number().positive(),
      lot_number: Joi.string().max(100),
      slab_number: Joi.string().max(100)
    })
  }),

  update: Joi.object({
    sku: Joi.string().trim().max(100),
    name: Joi.string().trim().min(1).max(300),
    brand: Joi.string().trim().max(100),
    description: Joi.string().trim().max(2000),
    material_type: Joi.string().trim().max(100),
    color_family: Joi.string().trim().max(100),
    finish: Joi.string().trim().max(100),
    quantity: Joi.number().integer().min(0),
    min_stock_level: Joi.number().integer().min(0),
    cost_price: Joi.number().min(0),
    wholesale_price: Joi.number().min(0),
    retail_price: Joi.number().min(0),
    warehouse_zone: Joi.string().trim().max(50),
    bin_location: Joi.string().trim().max(50),
    status: Joi.string().valid('active', 'inactive', 'out_of_stock'),
    is_featured: Joi.boolean(),
    is_public: Joi.boolean(),
    images: Joi.array().items(Joi.string().uri()).max(20),
    tags: Joi.array().items(Joi.string().max(50)).max(20),
    custom_attributes: Joi.object(),
    type_data: Joi.object()
  }),

  list: Joi.object({
    product_type: Joi.string().valid('slab', 'tile', 'flooring', 'sink', 'faucet', 'accessory', 'other'),
    material_type: Joi.string().max(100),
    brand: Joi.string().max(100),
    color_family: Joi.string().max(100),
    status: Joi.string().valid('active', 'inactive', 'out_of_stock'),
    search: Joi.string().max(100),
    min_price: Joi.number().min(0),
    max_price: Joi.number().min(0),
    is_public: Joi.boolean(),
    ...pagination
  }),

  inventoryTransaction: Joi.object({
    transaction_type: Joi.string().valid('receive', 'sell', 'adjust', 'transfer', 'damage', 'return').required(),
    quantity_change: Joi.number().integer().required(),
    reference_type: Joi.string().max(50),
    reference_id: Joi.string().max(100),
    notes: Joi.string().max(500)
  }),

  skuMapping: Joi.object({
    system_name: Joi.string().trim().min(1).max(100).required(),
    sku_value: Joi.string().trim().min(1).max(100).required()
  })
};

/**
 * Estimate Schemas
 */
const estimateSchemas = {
  create: Joi.object({
    customer_email: email.required(),
    customer_name: Joi.string().trim().max(200).required(),
    customer_phone: phone,
    customer_address: Joi.string().trim().max(500),
    items: Joi.array().items(
      Joi.object({
        description: Joi.string().trim().min(1).max(500).required(),
        quantity: Joi.number().positive().required(),
        unit: Joi.string().max(20).default('each'),
        unit_price: Joi.number().min(0).required()
      })
    ).min(1).required(),
    notes: Joi.string().trim().max(2000),
    valid_days: Joi.number().integer().min(1).max(365).default(30),
    terms: Joi.string().trim().max(5000)
  })
};

/**
 * Payment Schemas
 */
const paymentSchemas = {
  quickPayment: Joi.object({
    amount: Joi.number().positive().max(1000000).required(),
    description: Joi.string().trim().min(1).max(500).required(),
    customer_email: email,
    customer_name: Joi.string().trim().max(200),
    metadata: Joi.object()
  }),

  checkout: Joi.object({
    items: Joi.array().items(
      Joi.object({
        id: Joi.string().max(100),
        name: Joi.string().trim().min(1).max(200).required(),
        price: Joi.number().positive().required(),
        quantity: Joi.number().integer().positive().default(1),
        description: Joi.string().trim().max(500)
      })
    ).min(1).required(),
    customer_email: email,
    customer_phone: phone,
    success_url: Joi.string().uri(),
    cancel_url: Joi.string().uri(),
    metadata: Joi.object()
  })
};

/**
 * Inquiry Schemas
 */
const inquirySchemas = {
  create: Joi.object({
    name: Joi.string().trim().min(1).max(200).required(),
    email: email.required(),
    phone: phone,
    company: Joi.string().trim().max(200),
    message: Joi.string().trim().min(10).max(2000).required()
  })
};

module.exports = {
  leadSchemas,
  customerSchemas,
  invoiceSchemas,
  productSchemas,
  estimateSchemas,
  paymentSchemas,
  inquirySchemas
};
