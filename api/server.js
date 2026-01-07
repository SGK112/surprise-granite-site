const express = require('express');
const cors = require('cors');
const Stripe = require('stripe');
const nodemailer = require('nodemailer');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3001;

// Initialize Stripe with your secret key
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

// Email configuration - using Gmail SMTP or configure your own
const SMTP_USER = process.env.SMTP_USER || process.env.EMAIL_USER;
const SMTP_PASS = process.env.SMTP_PASS || process.env.EMAIL_PASS;

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'smtp.gmail.com',
  port: process.env.SMTP_PORT || 587,
  secure: false,
  auth: {
    user: SMTP_USER,
    pass: SMTP_PASS
  }
});

// Admin email for notifications
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'info@surprisegranite.com';

// Send email notification
async function sendNotification(to, subject, html) {
  try {
    if (!SMTP_USER) {
      console.log('Email notification (SMTP not configured):', { to, subject });
      return { success: false, reason: 'SMTP not configured' };
    }

    await transporter.sendMail({
      from: `"Surprise Granite" <${SMTP_USER}>`,
      to,
      subject,
      html
    });
    console.log('Email sent:', subject);
    return { success: true };
  } catch (err) {
    console.error('Email error:', err.message);
    return { success: false, reason: err.message };
  }
}

// Email templates
const emailTemplates = {
  invoiceSent: (invoice) => ({
    subject: `Invoice #${invoice.number} Sent - Surprise Granite`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background: #1a1a2e; padding: 20px; text-align: center;">
          <h1 style="color: #f9cb00; margin: 0;">Surprise Granite</h1>
        </div>
        <div style="padding: 30px; background: #f5f5f5;">
          <h2 style="color: #333;">Invoice Sent</h2>
          <p>Invoice <strong>#${invoice.number}</strong> has been sent to <strong>${invoice.customer_email}</strong></p>
          <p><strong>Amount:</strong> $${(invoice.amount_due / 100).toFixed(2)}</p>
          <p><a href="${invoice.hosted_invoice_url}" style="background: #f9cb00; color: #1a1a2e; padding: 12px 24px; text-decoration: none; border-radius: 5px; display: inline-block; margin-top: 10px;">View Invoice</a></p>
        </div>
        <div style="padding: 20px; text-align: center; color: #666; font-size: 12px;">
          <p>Surprise Granite | info@surprisegranite.com</p>
        </div>
      </div>
    `
  }),

  paymentReceived: (invoice) => ({
    subject: `Payment Received - Invoice #${invoice.number}`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background: #1a1a2e; padding: 20px; text-align: center;">
          <h1 style="color: #f9cb00; margin: 0;">Surprise Granite</h1>
        </div>
        <div style="padding: 30px; background: #f5f5f5;">
          <h2 style="color: #4dff82;">Payment Received!</h2>
          <p>Great news! Payment for Invoice <strong>#${invoice.number}</strong> has been received.</p>
          <p><strong>Customer:</strong> ${invoice.customer_email}</p>
          <p><strong>Amount Paid:</strong> $${(invoice.amount_paid / 100).toFixed(2)}</p>
          <p><a href="${invoice.hosted_invoice_url}" style="background: #f9cb00; color: #1a1a2e; padding: 12px 24px; text-decoration: none; border-radius: 5px; display: inline-block; margin-top: 10px;">View Receipt</a></p>
        </div>
        <div style="padding: 20px; text-align: center; color: #666; font-size: 12px;">
          <p>Surprise Granite | info@surprisegranite.com</p>
        </div>
      </div>
    `
  }),

  paymentFailed: (invoice) => ({
    subject: `Payment Failed - Invoice #${invoice.number}`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background: #1a1a2e; padding: 20px; text-align: center;">
          <h1 style="color: #f9cb00; margin: 0;">Surprise Granite</h1>
        </div>
        <div style="padding: 30px; background: #f5f5f5;">
          <h2 style="color: #ff6b6b;">Payment Failed</h2>
          <p>Payment for Invoice <strong>#${invoice.number}</strong> has failed.</p>
          <p><strong>Customer:</strong> ${invoice.customer_email}</p>
          <p><strong>Amount:</strong> $${(invoice.amount_due / 100).toFixed(2)}</p>
          <p>Please follow up with the customer to arrange an alternative payment method.</p>
          <p><a href="${invoice.hosted_invoice_url}" style="background: #f9cb00; color: #1a1a2e; padding: 12px 24px; text-decoration: none; border-radius: 5px; display: inline-block; margin-top: 10px;">View Invoice</a></p>
        </div>
        <div style="padding: 20px; text-align: center; color: #666; font-size: 12px;">
          <p>Surprise Granite | info@surprisegranite.com</p>
        </div>
      </div>
    `
  }),

  invoiceCustomer: (invoice) => ({
    subject: `Your Invoice from Surprise Granite - #${invoice.number}`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background: #1a1a2e; padding: 20px; text-align: center;">
          <h1 style="color: #f9cb00; margin: 0;">Surprise Granite</h1>
        </div>
        <div style="padding: 30px; background: #f5f5f5;">
          <h2 style="color: #333;">Invoice #${invoice.number}</h2>
          <p>Thank you for choosing Surprise Granite! Here's your invoice:</p>
          <p><strong>Amount Due:</strong> $${(invoice.amount_due / 100).toFixed(2)}</p>
          <p><strong>Due Date:</strong> ${invoice.due_date ? new Date(invoice.due_date * 1000).toLocaleDateString() : 'Upon Receipt'}</p>
          <p><a href="${invoice.hosted_invoice_url}" style="background: #f9cb00; color: #1a1a2e; padding: 12px 24px; text-decoration: none; border-radius: 5px; display: inline-block; margin-top: 10px; font-weight: bold;">Pay Invoice</a></p>
          <p style="margin-top: 20px; color: #666;">If you have any questions, please contact us at info@surprisegranite.com</p>
        </div>
        <div style="padding: 20px; text-align: center; color: #666; font-size: 12px;">
          <p>Surprise Granite | Surprise, AZ | info@surprisegranite.com</p>
        </div>
      </div>
    `
  })
};

// Middleware
app.use(cors({
  origin: [
    'https://www.surprisegranite.com',
    'https://surprisegranite.com',
    'http://localhost:3000',
    'http://127.0.0.1:5500'
  ],
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json());

// Health check
app.get('/', (req, res) => {
  res.json({ status: 'ok', service: 'Surprise Granite API' });
});

app.get('/health', (req, res) => {
  res.json({ status: 'healthy' });
});

// ============ CUSTOMER MANAGEMENT ============

// Create or get a Stripe customer
app.post('/api/customers', async (req, res) => {
  try {
    const { email, name, phone, metadata } = req.body;

    if (!email) {
      return res.status(400).json({ error: 'Email is required' });
    }

    // Check if customer already exists
    const existingCustomers = await stripe.customers.list({ email, limit: 1 });

    if (existingCustomers.data.length > 0) {
      // Update existing customer
      const customer = await stripe.customers.update(existingCustomers.data[0].id, {
        name: name || existingCustomers.data[0].name,
        phone: phone || existingCustomers.data[0].phone,
        metadata: { ...existingCustomers.data[0].metadata, ...metadata }
      });
      return res.json({ customer, isNew: false });
    }

    // Create new customer
    const customer = await stripe.customers.create({
      email,
      name,
      phone,
      metadata: {
        source: 'surprise_granite_portal',
        ...metadata
      }
    });

    res.json({ customer, isNew: true });
  } catch (error) {
    console.error('Customer error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get customer by email
app.get('/api/customers/:email', async (req, res) => {
  try {
    const customers = await stripe.customers.list({
      email: req.params.email,
      limit: 1
    });

    if (customers.data.length === 0) {
      return res.status(404).json({ error: 'Customer not found' });
    }

    res.json({ customer: customers.data[0] });
  } catch (error) {
    console.error('Get customer error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============ INVOICE MANAGEMENT ============

// Create and send an invoice
app.post('/api/invoices', async (req, res) => {
  try {
    const {
      customer_email,
      customer_name,
      customer_phone,
      items,
      description,
      notes,
      due_days = 30,
      auto_send = true
    } = req.body;

    if (!customer_email || !items || items.length === 0) {
      return res.status(400).json({ error: 'Customer email and at least one item are required' });
    }

    // Get or create customer
    let customer;
    const existingCustomers = await stripe.customers.list({ email: customer_email, limit: 1 });

    if (existingCustomers.data.length > 0) {
      customer = existingCustomers.data[0];
    } else {
      customer = await stripe.customers.create({
        email: customer_email,
        name: customer_name,
        phone: customer_phone,
        metadata: { source: 'surprise_granite_invoice' }
      });
    }

    // Create invoice
    const invoice = await stripe.invoices.create({
      customer: customer.id,
      collection_method: 'send_invoice',
      days_until_due: due_days,
      description,
      footer: notes || 'Thank you for your business! - Surprise Granite',
      metadata: {
        source: 'surprise_granite_portal',
        created_by: 'admin'
      }
    });

    // Add invoice items
    for (const item of items) {
      await stripe.invoiceItems.create({
        customer: customer.id,
        invoice: invoice.id,
        description: item.description,
        quantity: item.quantity || 1,
        unit_amount: Math.round(item.amount * 100) // Convert to cents
      });
    }

    // Finalize and optionally send the invoice
    const finalizedInvoice = await stripe.invoices.finalizeInvoice(invoice.id);

    if (auto_send) {
      await stripe.invoices.sendInvoice(invoice.id);

      // Send email notifications
      const emailData = emailTemplates.invoiceSent(finalizedInvoice);
      await sendNotification(ADMIN_EMAIL, emailData.subject, emailData.html);

      // Send invoice email to customer
      const customerEmail = emailTemplates.invoiceCustomer(finalizedInvoice);
      await sendNotification(customer_email, customerEmail.subject, customerEmail.html);
    }

    res.json({
      success: true,
      invoice: {
        id: finalizedInvoice.id,
        number: finalizedInvoice.number,
        amount_due: finalizedInvoice.amount_due / 100,
        status: finalizedInvoice.status,
        hosted_invoice_url: finalizedInvoice.hosted_invoice_url,
        pdf: finalizedInvoice.invoice_pdf,
        customer_email: customer_email
      }
    });
  } catch (error) {
    console.error('Invoice error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get all invoices (with optional filters)
app.get('/api/invoices', async (req, res) => {
  try {
    const { customer_email, status, limit = 20 } = req.query;

    let params = { limit: parseInt(limit) };

    if (customer_email) {
      const customers = await stripe.customers.list({ email: customer_email, limit: 1 });
      if (customers.data.length > 0) {
        params.customer = customers.data[0].id;
      }
    }

    if (status) {
      params.status = status;
    }

    const invoices = await stripe.invoices.list(params);

    res.json({
      invoices: invoices.data.map(inv => ({
        id: inv.id,
        number: inv.number,
        customer_email: inv.customer_email,
        customer_name: inv.customer_name,
        amount_due: inv.amount_due / 100,
        amount_paid: inv.amount_paid / 100,
        status: inv.status,
        created: new Date(inv.created * 1000).toISOString(),
        due_date: inv.due_date ? new Date(inv.due_date * 1000).toISOString() : null,
        hosted_invoice_url: inv.hosted_invoice_url,
        pdf: inv.invoice_pdf
      }))
    });
  } catch (error) {
    console.error('List invoices error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get single invoice
app.get('/api/invoices/:id', async (req, res) => {
  try {
    const invoice = await stripe.invoices.retrieve(req.params.id, {
      expand: ['lines.data']
    });

    res.json({
      invoice: {
        id: invoice.id,
        number: invoice.number,
        customer_email: invoice.customer_email,
        customer_name: invoice.customer_name,
        amount_due: invoice.amount_due / 100,
        amount_paid: invoice.amount_paid / 100,
        status: invoice.status,
        description: invoice.description,
        created: new Date(invoice.created * 1000).toISOString(),
        due_date: invoice.due_date ? new Date(invoice.due_date * 1000).toISOString() : null,
        hosted_invoice_url: invoice.hosted_invoice_url,
        pdf: invoice.invoice_pdf,
        items: invoice.lines.data.map(line => ({
          description: line.description,
          quantity: line.quantity,
          amount: line.amount / 100
        }))
      }
    });
  } catch (error) {
    console.error('Get invoice error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Send reminder for an invoice
app.post('/api/invoices/:id/remind', async (req, res) => {
  try {
    const invoice = await stripe.invoices.sendInvoice(req.params.id);
    res.json({ success: true, message: 'Reminder sent', invoice_id: invoice.id });
  } catch (error) {
    console.error('Remind invoice error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Void an invoice
app.post('/api/invoices/:id/void', async (req, res) => {
  try {
    const invoice = await stripe.invoices.voidInvoice(req.params.id);
    res.json({ success: true, message: 'Invoice voided', status: invoice.status });
  } catch (error) {
    console.error('Void invoice error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============ QUICK PAYMENT LINKS ============

// Create a payment link for quick payments
app.post('/api/payment-links', async (req, res) => {
  try {
    const { amount, description, customer_email } = req.body;

    if (!amount || !description) {
      return res.status(400).json({ error: 'Amount and description are required' });
    }

    // Create a product for this payment
    const product = await stripe.products.create({
      name: description,
      metadata: {
        source: 'surprise_granite_quick_payment',
        customer_email: customer_email || 'N/A'
      }
    });

    // Create a price for this product
    const price = await stripe.prices.create({
      product: product.id,
      unit_amount: Math.round(amount * 100),
      currency: 'usd'
    });

    // Create the payment link
    const paymentLink = await stripe.paymentLinks.create({
      line_items: [{ price: price.id, quantity: 1 }],
      after_completion: {
        type: 'redirect',
        redirect: { url: 'https://www.surprisegranite.com/thank-you/' }
      },
      metadata: {
        description,
        customer_email: customer_email || 'N/A'
      }
    });

    res.json({
      success: true,
      payment_link: {
        id: paymentLink.id,
        url: paymentLink.url,
        amount: amount,
        description: description
      }
    });
  } catch (error) {
    console.error('Payment link error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============ STRIPE CONNECT (for vendor payouts) ============

// Create a Connect Express account for vendors
app.post('/api/connect/accounts', async (req, res) => {
  try {
    const { email, business_name, business_type = 'individual' } = req.body;

    if (!email) {
      return res.status(400).json({ error: 'Email is required' });
    }

    const account = await stripe.accounts.create({
      type: 'express',
      country: 'US',
      email,
      capabilities: {
        card_payments: { requested: true },
        transfers: { requested: true }
      },
      business_type,
      metadata: {
        source: 'surprise_granite_vendor',
        business_name: business_name || ''
      }
    });

    // Create onboarding link
    const accountLink = await stripe.accountLinks.create({
      account: account.id,
      refresh_url: 'https://www.surprisegranite.com/account/?connect=refresh',
      return_url: 'https://www.surprisegranite.com/account/?connect=success',
      type: 'account_onboarding'
    });

    res.json({
      success: true,
      account_id: account.id,
      onboarding_url: accountLink.url
    });
  } catch (error) {
    console.error('Connect account error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get Connect account status
app.get('/api/connect/accounts/:id', async (req, res) => {
  try {
    const account = await stripe.accounts.retrieve(req.params.id);

    res.json({
      account: {
        id: account.id,
        email: account.email,
        charges_enabled: account.charges_enabled,
        payouts_enabled: account.payouts_enabled,
        details_submitted: account.details_submitted,
        business_type: account.business_type
      }
    });
  } catch (error) {
    console.error('Get Connect account error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Create a login link for vendor dashboard
app.post('/api/connect/accounts/:id/login', async (req, res) => {
  try {
    const loginLink = await stripe.accounts.createLoginLink(req.params.id);
    res.json({ url: loginLink.url });
  } catch (error) {
    console.error('Login link error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Create a payout to a connected account
app.post('/api/connect/payouts', async (req, res) => {
  try {
    const { account_id, amount, description } = req.body;

    if (!account_id || !amount) {
      return res.status(400).json({ error: 'Account ID and amount are required' });
    }

    const transfer = await stripe.transfers.create({
      amount: Math.round(amount * 100),
      currency: 'usd',
      destination: account_id,
      description: description || 'Vendor payout from Surprise Granite'
    });

    res.json({
      success: true,
      transfer: {
        id: transfer.id,
        amount: transfer.amount / 100,
        destination: transfer.destination,
        created: new Date(transfer.created * 1000).toISOString()
      }
    });
  } catch (error) {
    console.error('Payout error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============ WEBHOOK HANDLER ============

// Stripe webhooks (raw body needed)
app.post('/api/webhooks/stripe', express.raw({ type: 'application/json' }), async (req, res) => {
  const sig = req.headers['stripe-signature'];
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  let event;

  try {
    if (webhookSecret) {
      event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
    } else {
      event = JSON.parse(req.body.toString());
    }
  } catch (err) {
    console.error('Webhook signature verification failed:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  // Handle the event
  const invoice = event.data.object;

  switch (event.type) {
    case 'invoice.paid':
      console.log('Invoice paid:', invoice.id);
      // Send payment received notification to admin
      const paidEmail = emailTemplates.paymentReceived(invoice);
      await sendNotification(ADMIN_EMAIL, paidEmail.subject, paidEmail.html);
      break;

    case 'invoice.payment_failed':
      console.log('Invoice payment failed:', invoice.id);
      // Send payment failed notification to admin
      const failedEmail = emailTemplates.paymentFailed(invoice);
      await sendNotification(ADMIN_EMAIL, failedEmail.subject, failedEmail.html);
      break;

    case 'invoice.sent':
      console.log('Invoice sent:', invoice.id);
      break;

    case 'invoice.finalized':
      console.log('Invoice finalized:', invoice.id);
      break;

    case 'account.updated':
      console.log('Connect account updated:', event.data.object.id);
      break;

    default:
      console.log(`Unhandled event type: ${event.type}`);
  }

  res.json({ received: true });
});

// Start server
app.listen(PORT, () => {
  console.log(`Surprise Granite API running on port ${PORT}`);
  console.log(`Stripe configured: ${!!process.env.STRIPE_SECRET_KEY}`);
});
