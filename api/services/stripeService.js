/**
 * Stripe Service
 * Handles all Stripe payment operations
 */

const Stripe = require('stripe');
const logger = require('../utils/logger');

// Initialize Stripe
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

/**
 * Create a customer in Stripe
 */
async function createCustomer({ email, name, phone, metadata = {} }) {
  try {
    const customer = await stripe.customers.create({
      email,
      name,
      phone,
      metadata: {
        source: 'surprise_granite_api',
        ...metadata
      }
    });

    logger.paymentEvent('customer_created', { customerId: customer.id });
    return { success: true, customer };
  } catch (error) {
    logger.apiError(error, { context: 'Create Stripe customer' });
    return { success: false, error };
  }
}

/**
 * Get or create a customer by email
 */
async function getOrCreateCustomer({ email, name, phone }) {
  try {
    // Search for existing customer
    const customers = await stripe.customers.list({ email, limit: 1 });

    if (customers.data.length > 0) {
      return { success: true, customer: customers.data[0], created: false };
    }

    // Create new customer
    const result = await createCustomer({ email, name, phone });
    return { ...result, created: true };
  } catch (error) {
    logger.apiError(error, { context: 'Get or create customer' });
    return { success: false, error };
  }
}

/**
 * Create a checkout session
 */
async function createCheckoutSession({
  lineItems,
  customerEmail,
  successUrl,
  cancelUrl,
  metadata = {},
  mode = 'payment'
}) {
  try {
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: lineItems,
      mode,
      customer_email: customerEmail,
      success_url: successUrl,
      cancel_url: cancelUrl,
      metadata,
      billing_address_collection: 'required',
      phone_number_collection: { enabled: true }
    });

    logger.paymentEvent('checkout_session_created', { sessionId: session.id });
    return { success: true, session };
  } catch (error) {
    logger.apiError(error, { context: 'Create checkout session' });
    return { success: false, error };
  }
}

/**
 * Create a payment intent
 */
async function createPaymentIntent({ amount, currency = 'usd', customerId, metadata = {} }) {
  try {
    const paymentIntent = await stripe.paymentIntents.create({
      amount,
      currency,
      customer: customerId,
      metadata,
      automatic_payment_methods: { enabled: true }
    });

    logger.paymentEvent('payment_intent_created', {
      paymentIntentId: paymentIntent.id,
      amount: amount / 100
    });

    return { success: true, paymentIntent };
  } catch (error) {
    logger.apiError(error, { context: 'Create payment intent' });
    return { success: false, error };
  }
}

/**
 * Create an invoice
 */
async function createInvoice({
  customerId,
  items,
  description,
  dueDate,
  metadata = {}
}) {
  try {
    // Create invoice
    const invoice = await stripe.invoices.create({
      customer: customerId,
      description,
      due_date: dueDate ? Math.floor(new Date(dueDate).getTime() / 1000) : undefined,
      metadata,
      collection_method: 'send_invoice',
      auto_advance: true
    });

    // Add line items
    for (const item of items) {
      await stripe.invoiceItems.create({
        customer: customerId,
        invoice: invoice.id,
        description: item.description,
        amount: Math.round(item.amount * 100),
        currency: 'usd'
      });
    }

    // Finalize the invoice
    const finalizedInvoice = await stripe.invoices.finalizeInvoice(invoice.id);

    logger.paymentEvent('invoice_created', {
      invoiceId: finalizedInvoice.id,
      amount: finalizedInvoice.amount_due / 100
    });

    return { success: true, invoice: finalizedInvoice };
  } catch (error) {
    logger.apiError(error, { context: 'Create invoice' });
    return { success: false, error };
  }
}

/**
 * Send an invoice
 */
async function sendInvoice(invoiceId) {
  try {
    const invoice = await stripe.invoices.sendInvoice(invoiceId);
    logger.paymentEvent('invoice_sent', { invoiceId });
    return { success: true, invoice };
  } catch (error) {
    logger.apiError(error, { context: 'Send invoice' });
    return { success: false, error };
  }
}

/**
 * Get invoice by ID
 */
async function getInvoice(invoiceId) {
  try {
    const invoice = await stripe.invoices.retrieve(invoiceId, {
      expand: ['customer', 'payment_intent']
    });
    return { success: true, invoice };
  } catch (error) {
    logger.apiError(error, { context: 'Get invoice' });
    return { success: false, error };
  }
}

/**
 * List invoices with filters
 */
async function listInvoices({ customerId, status, limit = 10, startingAfter }) {
  try {
    const params = { limit };
    if (customerId) params.customer = customerId;
    if (status) params.status = status;
    if (startingAfter) params.starting_after = startingAfter;

    const invoices = await stripe.invoices.list(params);
    return { success: true, invoices: invoices.data, hasMore: invoices.has_more };
  } catch (error) {
    logger.apiError(error, { context: 'List invoices' });
    return { success: false, error };
  }
}

/**
 * Create a payment link
 */
async function createPaymentLink({ priceId, quantity = 1, metadata = {} }) {
  try {
    const paymentLink = await stripe.paymentLinks.create({
      line_items: [{ price: priceId, quantity }],
      metadata
    });

    logger.paymentEvent('payment_link_created', { url: paymentLink.url });
    return { success: true, paymentLink };
  } catch (error) {
    logger.apiError(error, { context: 'Create payment link' });
    return { success: false, error };
  }
}

/**
 * Verify webhook signature
 */
function verifyWebhookSignature(payload, signature, webhookSecret) {
  try {
    const event = stripe.webhooks.constructEvent(payload, signature, webhookSecret);
    return { success: true, event };
  } catch (error) {
    logger.apiError(error, { context: 'Webhook signature verification' });
    return { success: false, error };
  }
}

/**
 * Get Stripe instance for advanced operations
 */
function getStripeInstance() {
  return stripe;
}

module.exports = {
  createCustomer,
  getOrCreateCustomer,
  createCheckoutSession,
  createPaymentIntent,
  createInvoice,
  sendInvoice,
  getInvoice,
  listInvoices,
  createPaymentLink,
  verifyWebhookSignature,
  getStripeInstance
};
