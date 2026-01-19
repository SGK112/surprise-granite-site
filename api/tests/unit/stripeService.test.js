/**
 * Stripe Service Unit Tests
 */

// Mock Stripe before importing
jest.mock('stripe', () => {
  return jest.fn().mockImplementation(() => ({
    customers: {
      create: jest.fn().mockResolvedValue({
        id: 'cus_test123',
        email: 'test@example.com',
        name: 'Test Customer'
      }),
      list: jest.fn().mockResolvedValue({ data: [] }),
      update: jest.fn().mockResolvedValue({ id: 'cus_test123' })
    },
    checkout: {
      sessions: {
        create: jest.fn().mockResolvedValue({
          id: 'cs_test123',
          url: 'https://checkout.stripe.com/test'
        })
      }
    },
    paymentIntents: {
      create: jest.fn().mockResolvedValue({
        id: 'pi_test123',
        client_secret: 'secret_test'
      })
    },
    invoices: {
      create: jest.fn().mockResolvedValue({
        id: 'in_test123',
        status: 'draft'
      }),
      finalizeInvoice: jest.fn().mockResolvedValue({
        id: 'in_test123',
        status: 'open',
        amount_due: 10000,
        hosted_invoice_url: 'https://invoice.stripe.com/test'
      }),
      retrieve: jest.fn().mockResolvedValue({
        id: 'in_test123',
        status: 'open'
      }),
      list: jest.fn().mockResolvedValue({
        data: [],
        has_more: false
      }),
      sendInvoice: jest.fn().mockResolvedValue({
        id: 'in_test123',
        status: 'open'
      })
    },
    invoiceItems: {
      create: jest.fn().mockResolvedValue({ id: 'ii_test123' })
    },
    paymentLinks: {
      create: jest.fn().mockResolvedValue({
        id: 'plink_test123',
        url: 'https://pay.stripe.com/test'
      })
    },
    webhooks: {
      constructEvent: jest.fn().mockReturnValue({
        id: 'evt_test123',
        type: 'payment_intent.succeeded'
      })
    }
  }));
});

const stripeService = require('../../services/stripeService');

describe('Stripe Service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('createCustomer', () => {
    it('should create a customer successfully', async () => {
      const result = await stripeService.createCustomer({
        email: 'test@example.com',
        name: 'Test Customer'
      });

      expect(result.success).toBe(true);
      expect(result.customer).toBeDefined();
      expect(result.customer.id).toBe('cus_test123');
    });

    it('should include metadata in customer creation', async () => {
      const result = await stripeService.createCustomer({
        email: 'test@example.com',
        name: 'Test Customer',
        metadata: { source: 'website' }
      });

      expect(result.success).toBe(true);
    });
  });

  describe('getOrCreateCustomer', () => {
    it('should create customer when none exists', async () => {
      const result = await stripeService.getOrCreateCustomer({
        email: 'new@example.com',
        name: 'New Customer'
      });

      expect(result.success).toBe(true);
      expect(result.created).toBe(true);
    });
  });

  describe('createCheckoutSession', () => {
    it('should create a checkout session', async () => {
      const result = await stripeService.createCheckoutSession({
        lineItems: [{ price: 'price_123', quantity: 1 }],
        customerEmail: 'test@example.com',
        successUrl: 'https://example.com/success',
        cancelUrl: 'https://example.com/cancel'
      });

      expect(result.success).toBe(true);
      expect(result.session).toBeDefined();
      expect(result.session.id).toBe('cs_test123');
    });
  });

  describe('createPaymentIntent', () => {
    it('should create a payment intent', async () => {
      const result = await stripeService.createPaymentIntent({
        amount: 5000,
        currency: 'usd',
        customerId: 'cus_test123'
      });

      expect(result.success).toBe(true);
      expect(result.paymentIntent).toBeDefined();
      expect(result.paymentIntent.id).toBe('pi_test123');
    });
  });

  describe('createInvoice', () => {
    it('should create and finalize an invoice', async () => {
      const result = await stripeService.createInvoice({
        customerId: 'cus_test123',
        items: [
          { description: 'Granite countertop', amount: 100 }
        ],
        description: 'Kitchen countertop installation'
      });

      expect(result.success).toBe(true);
      expect(result.invoice).toBeDefined();
      expect(result.invoice.status).toBe('open');
    });
  });

  describe('sendInvoice', () => {
    it('should send an invoice', async () => {
      const result = await stripeService.sendInvoice('in_test123');

      expect(result.success).toBe(true);
      expect(result.invoice).toBeDefined();
    });
  });

  describe('getInvoice', () => {
    it('should retrieve an invoice', async () => {
      const result = await stripeService.getInvoice('in_test123');

      expect(result.success).toBe(true);
      expect(result.invoice.id).toBe('in_test123');
    });
  });

  describe('listInvoices', () => {
    it('should list invoices with filters', async () => {
      const result = await stripeService.listInvoices({
        customerId: 'cus_test123',
        status: 'open',
        limit: 10
      });

      expect(result.success).toBe(true);
      expect(Array.isArray(result.invoices)).toBe(true);
      expect(typeof result.hasMore).toBe('boolean');
    });
  });

  describe('verifyWebhookSignature', () => {
    it('should verify webhook signature', () => {
      const result = stripeService.verifyWebhookSignature(
        'payload',
        'signature',
        'webhook_secret'
      );

      expect(result.success).toBe(true);
      expect(result.event).toBeDefined();
      expect(result.event.type).toBe('payment_intent.succeeded');
    });
  });

  describe('getStripeInstance', () => {
    it('should return the Stripe instance', () => {
      const stripe = stripeService.getStripeInstance();
      expect(stripe).toBeDefined();
      expect(stripe.customers).toBeDefined();
      expect(stripe.invoices).toBeDefined();
    });
  });
});
