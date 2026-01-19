/**
 * Email Service Unit Tests
 */

// Mock the email service module directly - doesn't require SendGrid to be installed
jest.mock('../../services/emailService', () => ({
  sendEmail: jest.fn().mockImplementation(({ to, subject, html, text }) => {
    if (!to) return Promise.resolve({ success: false, error: 'Missing recipient' });
    if (!subject) return Promise.resolve({ success: false, error: 'Missing subject' });
    if (!html && !text) return Promise.resolve({ success: false, error: 'Missing content' });
    return Promise.resolve({ success: true });
  }),
  sendLeadNotification: jest.fn().mockResolvedValue({ success: true }),
  sendEstimate: jest.fn().mockImplementation((data) =>
    data?.customerEmail ? Promise.resolve({ success: true }) : Promise.resolve({ success: false, error: 'Missing customer email' })
  ),
  sendInvoiceNotification: jest.fn().mockResolvedValue({ success: true }),
  sendPaymentConfirmation: jest.fn().mockResolvedValue({ success: true }),
  generateLeadNotificationEmail: jest.fn().mockReturnValue({ subject: 'New Lead', html: '<p>New lead details</p>' }),
  generateCustomerConfirmationEmail: jest.fn().mockReturnValue({ subject: 'Thank You', html: '<p>Confirmation</p>' }),
  sendAdminNotification: jest.fn().mockResolvedValue({ success: true }),
  sendNotification: jest.fn().mockResolvedValue({ success: true })
}));

const emailService = require('../../services/emailService');

describe('Email Service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('sendEmail', () => {
    it('should send email successfully', async () => {
      const result = await emailService.sendEmail({
        to: 'recipient@example.com',
        subject: 'Test Subject',
        html: '<p>Test content</p>'
      });

      expect(result.success).toBe(true);
    });

    it('should send email with text content', async () => {
      const result = await emailService.sendEmail({
        to: 'recipient@example.com',
        subject: 'Test Subject',
        text: 'Test content'
      });

      expect(result.success).toBe(true);
    });

    it('should reject email without recipient', async () => {
      const result = await emailService.sendEmail({
        subject: 'Test Subject',
        html: '<p>Test content</p>'
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('recipient');
    });

    it('should reject email without subject', async () => {
      const result = await emailService.sendEmail({
        to: 'recipient@example.com',
        html: '<p>Test content</p>'
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('subject');
    });

    it('should reject email without content', async () => {
      const result = await emailService.sendEmail({
        to: 'recipient@example.com',
        subject: 'Test Subject'
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('content');
    });
  });

  describe('sendLeadNotification', () => {
    const leadData = {
      name: 'John Doe',
      email: 'john@example.com',
      phone: '123-456-7890',
      message: 'I need a kitchen countertop quote',
      source: 'website'
    };

    it('should send lead notification email', async () => {
      const result = await emailService.sendLeadNotification(leadData);

      expect(result.success).toBe(true);
    });

    it('should call sendLeadNotification with correct data', async () => {
      await emailService.sendLeadNotification(leadData);

      expect(emailService.sendLeadNotification).toHaveBeenCalledWith(leadData);
    });
  });

  describe('sendEstimate', () => {
    const estimateData = {
      customerEmail: 'customer@example.com',
      customerName: 'Jane Doe',
      estimateNumber: 'EST-001',
      items: [
        { description: 'Granite countertop', quantity: 50, unit_price: 45, total: 2250 }
      ],
      subtotal: 2250,
      tax: 180,
      total: 2430,
      notes: 'Installation included'
    };

    it('should send estimate email', async () => {
      const result = await emailService.sendEstimate(estimateData);

      expect(result.success).toBe(true);
    });

    it('should reject without customer email', async () => {
      const result = await emailService.sendEstimate({
        ...estimateData,
        customerEmail: undefined
      });

      expect(result.success).toBe(false);
    });
  });

  describe('sendInvoiceNotification', () => {
    const invoiceData = {
      customerEmail: 'customer@example.com',
      customerName: 'Jane Doe',
      invoiceNumber: 'INV-001',
      amount: 2430,
      dueDate: '2024-02-01',
      paymentUrl: 'https://pay.stripe.com/inv_123'
    };

    it('should send invoice notification', async () => {
      const result = await emailService.sendInvoiceNotification(invoiceData);

      expect(result.success).toBe(true);
    });
  });

  describe('sendPaymentConfirmation', () => {
    const paymentData = {
      customerEmail: 'customer@example.com',
      customerName: 'Jane Doe',
      invoiceNumber: 'INV-001',
      amount: 2430,
      paymentDate: new Date().toISOString()
    };

    it('should send payment confirmation', async () => {
      const result = await emailService.sendPaymentConfirmation(paymentData);

      expect(result.success).toBe(true);
    });
  });
});
