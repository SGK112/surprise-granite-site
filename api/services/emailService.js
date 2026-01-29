/**
 * Email Service
 * Handles all email sending functionality
 */

const nodemailer = require('nodemailer');
const logger = require('../utils/logger');
const { escapeHtml } = require('../utils/security');

// Email configuration
const SMTP_USER = process.env.SMTP_USER || process.env.EMAIL_USER;
const SMTP_PASS = process.env.SMTP_PASS || process.env.EMAIL_PASS;
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'info@surprisegranite.com';

// Company Branding - Remodely Platform
const COMPANY = {
  name: 'Remodely',
  shortName: 'Remodely',
  email: 'hello@remodely.ai',
  phone: '(602) 833-3189',
  address: 'Serving Nationwide',
  website: 'https://www.remodely.ai',
  logo: 'https://www.surprisegranite.com/remodely-platform/assets/remodely-logo.svg',
  tagline: 'AI-Powered Home Remodeling Platform',
  license: ''
};

// Create transporter
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'smtp.gmail.com',
  port: process.env.SMTP_PORT || 587,
  secure: false,
  auth: {
    user: SMTP_USER,
    pass: SMTP_PASS
  }
});

/**
 * Send an email notification
 * @param {string} to - Recipient email address
 * @param {string} subject - Email subject
 * @param {string} html - HTML content
 * @param {Array} attachments - Optional array of attachments
 *   Each attachment can have: { filename, content (Buffer), contentType, path (URL) }
 */
async function sendNotification(to, subject, html, attachments = []) {
  try {
    if (!SMTP_USER) {
      logger.warn('Email not sent - SMTP not configured', { to: to?.substring(0, 3) + '***', subject });
      return { success: false, reason: 'SMTP not configured' };
    }

    const mailOptions = {
      from: `"${COMPANY.shortName}" <${SMTP_USER}>`,
      to,
      subject,
      html
    };

    // Add attachments if provided
    if (attachments && attachments.length > 0) {
      mailOptions.attachments = attachments.map(att => {
        const attachment = { filename: att.filename };
        if (att.content) attachment.content = att.content;
        if (att.contentType) attachment.contentType = att.contentType;
        if (att.path) attachment.path = att.path;
        if (att.href) attachment.href = att.href; // For URL-based attachments
        return attachment;
      });
    }

    await transporter.sendMail(mailOptions);

    logger.emailSent(subject, true, { attachmentCount: attachments.length });
    return { success: true };
  } catch (err) {
    logger.apiError(err, { context: 'Email send failed', subject });
    return { success: false, reason: err.message };
  }
}

/**
 * Send email to admin
 */
async function sendAdminNotification(subject, html) {
  return sendNotification(ADMIN_EMAIL, subject, html);
}

/**
 * Generate standard email wrapper - Premium Design
 */
function wrapEmailTemplate(content, options = {}) {
  const { headerColor = '#1a1a2e', accentColor = '#f9cb00', headerText = '', showLogo = true } = options;

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin: 0; padding: 0; background-color: #f0f0f0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; -webkit-font-smoothing: antialiased;">
  <table width="100%" cellspacing="0" cellpadding="0" style="background-color: #f0f0f0;">
    <tr>
      <td align="center" style="padding: 30px 15px;">
        <!-- Main Container -->
        <table width="100%" cellspacing="0" cellpadding="0" style="max-width: 580px; background-color: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 24px rgba(0,0,0,0.08);">
          <!-- Header -->
          <tr>
            <td style="background: ${headerColor}; padding: 28px 30px; text-align: center;">
              ${showLogo ? `
              <table width="100%" cellspacing="0" cellpadding="0">
                <tr>
                  <td align="center">
                    <img src="${COMPANY.logo}" alt="${COMPANY.shortName}" style="max-height: 45px; width: auto;">
                  </td>
                </tr>
              </table>
              ` : ''}
              ${headerText ? `
              <h1 style="margin: ${showLogo ? '16px' : '0'} 0 0; color: #ffffff; font-size: 20px; font-weight: 600; letter-spacing: -0.3px;">${escapeHtml(headerText)}</h1>
              ` : ''}
            </td>
          </tr>
          <!-- Accent Bar -->
          <tr>
            <td style="background: ${accentColor}; height: 4px;"></td>
          </tr>
          <!-- Content -->
          <tr>
            <td style="padding: 35px 30px;">
              ${content}
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="background: #fafafa; padding: 25px 30px; border-top: 1px solid #eaeaea;">
              <table width="100%" cellspacing="0" cellpadding="0">
                <tr>
                  <td align="center">
                    <p style="margin: 0 0 8px; color: #1a1a2e; font-size: 14px; font-weight: 600;">${COMPANY.shortName}</p>
                    <p style="margin: 0 0 12px; color: #666; font-size: 13px;">
                      <a href="tel:${COMPANY.phone}" style="color: #1a1a2e; text-decoration: none; font-weight: 500;">${COMPANY.phone}</a>
                      &nbsp;&nbsp;•&nbsp;&nbsp;
                      <a href="mailto:${COMPANY.email}" style="color: #666; text-decoration: none;">${COMPANY.email}</a>
                    </p>
                    <p style="margin: 0 0 8px; color: #888; font-size: 12px;">${COMPANY.address}</p>
                    ${COMPANY.license ? `<p style="margin: 0; color: #aaa; font-size: 11px;">${COMPANY.license} • Licensed, Bonded & Insured</p>` : ''}
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
        <!-- Bottom Text -->
        <table width="100%" cellspacing="0" cellpadding="0" style="max-width: 580px;">
          <tr>
            <td align="center" style="padding: 20px;">
              <p style="margin: 0; color: #999; font-size: 11px;">
                © ${new Date().getFullYear()} ${COMPANY.name}. All rights reserved.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

/**
 * Generate lead notification email for admin
 */
function generateLeadNotificationEmail(lead) {
  const content = `
    <h2 style="margin: 0 0 20px; color: #1a1a2e; font-size: 18px; border-bottom: 2px solid #f9cb00; padding-bottom: 10px;">New Lead Received</h2>
    <table width="100%" cellspacing="0" cellpadding="8">
      <tr>
        <td style="color: #666; font-weight: 600; width: 140px;">Name:</td>
        <td style="color: #1a1a2e;">${escapeHtml(lead.name || 'Not provided')}</td>
      </tr>
      <tr>
        <td style="color: #666; font-weight: 600;">Email:</td>
        <td style="color: #1a1a2e;"><a href="mailto:${escapeHtml(lead.email)}" style="color: #1a1a2e;">${escapeHtml(lead.email || 'Not provided')}</a></td>
      </tr>
      <tr>
        <td style="color: #666; font-weight: 600;">Phone:</td>
        <td style="color: #1a1a2e;"><a href="tel:${escapeHtml(lead.phone)}" style="color: #1a1a2e;">${escapeHtml(lead.phone || 'Not provided')}</a></td>
      </tr>
      <tr>
        <td style="color: #666; font-weight: 600;">Project Type:</td>
        <td style="color: #1a1a2e;">${escapeHtml(lead.project_type || 'Not specified')}</td>
      </tr>
      <tr>
        <td style="color: #666; font-weight: 600;">Source:</td>
        <td style="color: #1a1a2e;">${escapeHtml(lead.source || 'website')}</td>
      </tr>
      ${lead.message ? `
      <tr>
        <td style="color: #666; font-weight: 600;">Message:</td>
        <td style="color: #1a1a2e;">${escapeHtml(lead.message)}</td>
      </tr>
      ` : ''}
    </table>
  `;

  return {
    subject: `New Lead: ${lead.name || 'Unknown'} - ${lead.project_type || 'General Inquiry'}`,
    html: wrapEmailTemplate(content, { headerText: '📋 New Lead Received' })
  };
}

/**
 * Generate customer confirmation email - Premium Design
 */
function generateCustomerConfirmationEmail(data) {
  const firstName = (data.name || 'there').split(' ')[0];

  const content = `
    <p style="margin: 0 0 20px; color: #333; font-size: 16px; line-height: 1.6;">
      Hi ${escapeHtml(firstName)},
    </p>
    <p style="margin: 0 0 24px; color: #555; font-size: 15px; line-height: 1.6;">
      Thank you for reaching out to ${COMPANY.shortName}! We've received your inquiry and our team is reviewing it now.
    </p>

    <!-- Timeline -->
    <table width="100%" cellspacing="0" cellpadding="0" style="margin: 24px 0;">
      <tr>
        <td style="background: #fafafa; border-radius: 12px; padding: 24px;">
          <p style="margin: 0 0 16px; color: #1a1a2e; font-size: 14px; font-weight: 600;">What happens next:</p>
          <table width="100%" cellspacing="0" cellpadding="0">
            <tr>
              <td style="padding: 10px 0;">
                <table cellspacing="0" cellpadding="0">
                  <tr>
                    <td style="width: 32px; vertical-align: top;">
                      <div style="width: 24px; height: 24px; background: #f9cb00; border-radius: 50%; text-align: center; line-height: 24px; color: #1a1a2e; font-size: 12px; font-weight: 700;">1</div>
                    </td>
                    <td style="padding-left: 12px; color: #555; font-size: 14px;">We'll review your project details</td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td style="padding: 10px 0;">
                <table cellspacing="0" cellpadding="0">
                  <tr>
                    <td style="width: 32px; vertical-align: top;">
                      <div style="width: 24px; height: 24px; background: #f9cb00; border-radius: 50%; text-align: center; line-height: 24px; color: #1a1a2e; font-size: 12px; font-weight: 700;">2</div>
                    </td>
                    <td style="padding-left: 12px; color: #555; font-size: 14px;">A team member will call within 24 hours</td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td style="padding: 10px 0;">
                <table cellspacing="0" cellpadding="0">
                  <tr>
                    <td style="width: 32px; vertical-align: top;">
                      <div style="width: 24px; height: 24px; background: #f9cb00; border-radius: 50%; text-align: center; line-height: 24px; color: #1a1a2e; font-size: 12px; font-weight: 700;">3</div>
                    </td>
                    <td style="padding-left: 12px; color: #555; font-size: 14px;">We'll schedule a free consultation at your convenience</td>
                  </tr>
                </table>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>

    <p style="margin: 24px 0 0; color: #888; font-size: 13px; text-align: center;">
      Questions? Call <a href="tel:${COMPANY.phone}" style="color: #1a1a2e; font-weight: 600; text-decoration: none;">${COMPANY.phone}</a>
    </p>
  `;

  return {
    subject: `We received your request - ${COMPANY.shortName}`,
    html: wrapEmailTemplate(content, { headerText: 'Thank You!' })
  };
}

/**
 * Generate order confirmation email
 */
function generateOrderConfirmationEmail(order) {
  const content = `
    <div style="text-align: center; margin-bottom: 25px;">
      <div style="width: 80px; height: 80px; background: linear-gradient(135deg, #4caf50, #2e7d32); border-radius: 50%; margin: 0 auto 20px; line-height: 80px;">
        <span style="font-size: 40px; color: #fff;">✓</span>
      </div>
      <h2 style="margin: 0 0 10px; color: #1a1a2e; font-size: 24px;">Order Confirmed!</h2>
      <p style="margin: 0 0 5px; color: #f9cb00; font-size: 16px; font-weight: 600;">Order #${escapeHtml(order.id)}</p>
    </div>

    <div style="background: #f8f8f8; padding: 25px; border-radius: 8px; text-align: center; margin-bottom: 25px;">
      <p style="margin: 0 0 5px; color: #888; font-size: 12px; text-transform: uppercase; letter-spacing: 1px;">Order Total</p>
      <p style="margin: 0; color: #1a1a2e; font-size: 32px; font-weight: 700;">$${(order.amount / 100).toFixed(2)}</p>
    </div>

    <p style="margin: 0; color: #666; font-size: 14px; text-align: center;">
      We're preparing your order and will send shipping information once it's on its way.
    </p>
  `;

  return {
    subject: `Order Confirmed - ${COMPANY.shortName} #${order.id}`,
    html: wrapEmailTemplate(content, { headerText: '' })
  };
}

/**
 * Generate estimate sent email for customer
 */
function generateEstimateSentEmail(estimate) {
  const viewUrl = `${COMPANY.website}/estimate/view?token=${estimate.view_token || estimate.id}`;
  const content = `
    <div style="text-align: center; margin-bottom: 25px;">
      <h2 style="margin: 0 0 10px; color: #1a1a2e; font-size: 22px;">Your Estimate is Ready!</h2>
      <p style="margin: 0; color: #666; font-size: 15px;">Estimate #${escapeHtml(estimate.estimate_number || 'N/A')}</p>
    </div>

    <p style="margin: 0 0 20px; color: #444; font-size: 15px;">
      Hi ${escapeHtml(estimate.customer_name || 'Valued Customer')},
    </p>
    <p style="margin: 0 0 20px; color: #444; font-size: 15px;">
      Thank you for considering ${COMPANY.shortName} for your project. We've prepared a detailed estimate for your review.
    </p>

    <div style="background: #f8f8f8; padding: 25px; border-radius: 8px; text-align: center; margin-bottom: 25px;">
      <p style="margin: 0 0 5px; color: #888; font-size: 12px; text-transform: uppercase; letter-spacing: 1px;">Estimated Total</p>
      <p style="margin: 0 0 15px; color: #1a1a2e; font-size: 32px; font-weight: 700;">$${(estimate.total || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}</p>
      ${estimate.valid_until ? `<p style="margin: 0; color: #888; font-size: 13px;">Valid until ${new Date(estimate.valid_until).toLocaleDateString()}</p>` : ''}
    </div>

    <div style="text-align: center; margin-bottom: 25px;">
      <a href="${viewUrl}" style="display: inline-block; background: linear-gradient(135deg, #f9cb00 0%, #e6b800 100%); color: #1a1a2e; text-decoration: none; padding: 14px 30px; border-radius: 8px; font-weight: 600; font-size: 16px;">View Full Estimate</a>
    </div>

    <p style="margin: 0; color: #666; font-size: 14px; text-align: center;">
      Questions? Reply to this email or call <a href="tel:${COMPANY.phone}" style="color: #1a1a2e; font-weight: 600;">${COMPANY.phone}</a>
    </p>
  `;

  return {
    subject: `Your Estimate from ${COMPANY.shortName} - #${estimate.estimate_number || 'Draft'}`,
    html: wrapEmailTemplate(content, { headerText: '📋 Your Estimate' })
  };
}

/**
 * Generate estimate approved notification for admin
 */
function generateEstimateApprovedEmail(estimate) {
  const content = `
    <h2 style="margin: 0 0 20px; color: #1a1a2e; font-size: 18px; border-bottom: 2px solid #4caf50; padding-bottom: 10px;">🎉 Estimate Approved!</h2>

    <div style="background: #e8f5e9; padding: 20px; border-radius: 8px; margin-bottom: 20px;">
      <p style="margin: 0 0 10px; color: #2e7d32; font-weight: 600; font-size: 16px;">Customer has approved the estimate</p>
      <p style="margin: 0; color: #1a1a2e; font-size: 24px; font-weight: 700;">$${(estimate.total || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}</p>
    </div>

    <table width="100%" cellspacing="0" cellpadding="8">
      <tr>
        <td style="color: #666; font-weight: 600; width: 140px;">Estimate #:</td>
        <td style="color: #1a1a2e;">${escapeHtml(estimate.estimate_number || 'N/A')}</td>
      </tr>
      <tr>
        <td style="color: #666; font-weight: 600;">Customer:</td>
        <td style="color: #1a1a2e;">${escapeHtml(estimate.customer_name || 'N/A')}</td>
      </tr>
      <tr>
        <td style="color: #666; font-weight: 600;">Email:</td>
        <td style="color: #1a1a2e;"><a href="mailto:${escapeHtml(estimate.customer_email)}">${escapeHtml(estimate.customer_email || 'N/A')}</a></td>
      </tr>
      <tr>
        <td style="color: #666; font-weight: 600;">Phone:</td>
        <td style="color: #1a1a2e;">${escapeHtml(estimate.customer_phone || 'N/A')}</td>
      </tr>
      <tr>
        <td style="color: #666; font-weight: 600;">Project:</td>
        <td style="color: #1a1a2e;">${escapeHtml(estimate.project_name || 'Not specified')}</td>
      </tr>
    </table>

    <div style="text-align: center; margin-top: 25px;">
      <p style="margin: 0; color: #666; font-size: 14px;">Next step: Create an invoice and schedule the job</p>
    </div>
  `;

  return {
    subject: `✅ Estimate Approved - ${estimate.customer_name} - $${(estimate.total || 0).toLocaleString()}`,
    html: wrapEmailTemplate(content, { headerColor: '#4caf50', headerText: 'Estimate Approved' })
  };
}

/**
 * Generate invoice sent email for customer
 */
function generateInvoiceSentEmail(invoice) {
  const payUrl = invoice.hosted_invoice_url || `${COMPANY.website}/invoice/pay?id=${invoice.id}`;
  const content = `
    <div style="text-align: center; margin-bottom: 25px;">
      <h2 style="margin: 0 0 10px; color: #1a1a2e; font-size: 22px;">Invoice Ready for Payment</h2>
      <p style="margin: 0; color: #666; font-size: 15px;">Invoice #${escapeHtml(invoice.number || invoice.invoice_number || 'N/A')}</p>
    </div>

    <p style="margin: 0 0 20px; color: #444; font-size: 15px;">
      Hi ${escapeHtml(invoice.customer_name || 'Valued Customer')},
    </p>

    <div style="background: #f8f8f8; padding: 25px; border-radius: 8px; text-align: center; margin-bottom: 25px;">
      <p style="margin: 0 0 5px; color: #888; font-size: 12px; text-transform: uppercase; letter-spacing: 1px;">Amount Due</p>
      <p style="margin: 0 0 10px; color: #1a1a2e; font-size: 32px; font-weight: 700;">$${(invoice.amount_due || invoice.total || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}</p>
      ${invoice.due_date ? `<p style="margin: 0; color: #e65100; font-size: 14px; font-weight: 600;">Due by ${new Date(invoice.due_date).toLocaleDateString()}</p>` : ''}
    </div>

    <div style="text-align: center; margin-bottom: 25px;">
      <a href="${payUrl}" style="display: inline-block; background: linear-gradient(135deg, #4caf50 0%, #2e7d32 100%); color: #fff; text-decoration: none; padding: 14px 30px; border-radius: 8px; font-weight: 600; font-size: 16px;">Pay Now</a>
    </div>

    <p style="margin: 0; color: #666; font-size: 13px; text-align: center;">
      We accept all major credit cards and ACH bank transfers.
    </p>
  `;

  return {
    subject: `Invoice from ${COMPANY.shortName} - #${invoice.number || invoice.invoice_number || 'N/A'}`,
    html: wrapEmailTemplate(content, { headerText: '💳 Invoice' })
  };
}

/**
 * Generate payment confirmation email for customer
 */
function generatePaymentConfirmationEmail(payment) {
  const content = `
    <div style="text-align: center; margin-bottom: 25px;">
      <div style="width: 80px; height: 80px; background: linear-gradient(135deg, #4caf50, #2e7d32); border-radius: 50%; margin: 0 auto 20px; line-height: 80px;">
        <span style="font-size: 40px; color: #fff;">✓</span>
      </div>
      <h2 style="margin: 0 0 10px; color: #1a1a2e; font-size: 24px;">Payment Received!</h2>
      <p style="margin: 0; color: #666; font-size: 15px;">Thank you for your payment</p>
    </div>

    <div style="background: #e8f5e9; padding: 25px; border-radius: 8px; text-align: center; margin-bottom: 25px;">
      <p style="margin: 0 0 5px; color: #888; font-size: 12px; text-transform: uppercase; letter-spacing: 1px;">Amount Paid</p>
      <p style="margin: 0 0 10px; color: #2e7d32; font-size: 32px; font-weight: 700;">$${(payment.amount / 100).toLocaleString('en-US', { minimumFractionDigits: 2 })}</p>
      <p style="margin: 0; color: #666; font-size: 13px;">Invoice #${escapeHtml(payment.invoice_number || 'N/A')}</p>
    </div>

    <div style="background: #f8f8f8; padding: 20px; border-radius: 8px; margin-bottom: 20px;">
      <h3 style="margin: 0 0 12px; color: #1a1a2e; font-size: 16px;">What happens next?</h3>
      <ul style="margin: 0; padding-left: 20px; color: #666; font-size: 14px; line-height: 1.8;">
        <li>We'll contact you to schedule your installation</li>
        <li>Materials will be ordered/prepared</li>
        <li>You'll receive updates on your project status</li>
      </ul>
    </div>

    <p style="margin: 0; color: #666; font-size: 14px; text-align: center;">
      Questions? Call us at <a href="tel:${COMPANY.phone}" style="color: #1a1a2e; font-weight: 600;">${COMPANY.phone}</a>
    </p>
  `;

  return {
    subject: `Payment Confirmed - ${COMPANY.shortName}`,
    html: wrapEmailTemplate(content, { headerColor: '#4caf50', headerText: '' })
  };
}

/**
 * Generate job status update email for customer
 */
function generateJobStatusEmail(job, newStatus) {
  const statusMessages = {
    'reviewing': { emoji: '🔍', title: 'Project Under Review', message: 'We are reviewing your project details and will be in touch soon.' },
    'material_ordered': { emoji: '📦', title: 'Materials Ordered', message: 'Great news! We have ordered the materials for your project.' },
    'material_received': { emoji: '✅', title: 'Materials Received', message: 'All materials have arrived and we are ready to move forward.' },
    'scheduled': { emoji: '📅', title: 'Installation Scheduled', message: `Your installation has been scheduled${job.install_date ? ' for ' + new Date(job.install_date).toLocaleDateString() : ''}.` },
    'measured': { emoji: '📐', title: 'Measurements Complete', message: 'Field measurements have been completed. Production will begin soon.' },
    'in_production': { emoji: '🏭', title: 'In Production', message: 'Your countertops are now being fabricated.' },
    'ready': { emoji: '🎯', title: 'Ready for Installation', message: 'Your project is complete and ready for installation!' },
    'installing': { emoji: '🔨', title: 'Installation in Progress', message: 'Our team is currently installing your new countertops.' },
    'completed': { emoji: '🎉', title: 'Project Complete!', message: 'Congratulations! Your project has been completed. We hope you love it!' }
  };

  const statusInfo = statusMessages[newStatus] || { emoji: '📋', title: 'Status Update', message: `Your project status has been updated to: ${newStatus}` };

  const content = `
    <div style="text-align: center; margin-bottom: 25px;">
      <div style="font-size: 50px; margin-bottom: 15px;">${statusInfo.emoji}</div>
      <h2 style="margin: 0 0 10px; color: #1a1a2e; font-size: 22px;">${statusInfo.title}</h2>
      <p style="margin: 0; color: #666; font-size: 15px;">Job #${escapeHtml(job.job_number || 'N/A')}</p>
    </div>

    <p style="margin: 0 0 20px; color: #444; font-size: 15px;">
      Hi ${escapeHtml(job.customer_name || 'Valued Customer')},
    </p>
    <p style="margin: 0 0 25px; color: #444; font-size: 15px;">
      ${statusInfo.message}
    </p>

    <div style="background: #f8f8f8; padding: 20px; border-radius: 8px; margin-bottom: 20px;">
      <table width="100%" cellspacing="0" cellpadding="6">
        <tr>
          <td style="color: #666; font-weight: 600;">Project:</td>
          <td style="color: #1a1a2e;">${escapeHtml(job.project_description || 'Countertop Installation')}</td>
        </tr>
        ${job.install_date ? `
        <tr>
          <td style="color: #666; font-weight: 600;">Install Date:</td>
          <td style="color: #1a1a2e;">${new Date(job.install_date).toLocaleDateString()}</td>
        </tr>
        ` : ''}
        ${job.assigned_contractor ? `
        <tr>
          <td style="color: #666; font-weight: 600;">Installer:</td>
          <td style="color: #1a1a2e;">${escapeHtml(job.assigned_contractor)}</td>
        </tr>
        ` : ''}
      </table>
    </div>

    <p style="margin: 0; color: #666; font-size: 14px; text-align: center;">
      Questions? Call us at <a href="tel:${COMPANY.phone}" style="color: #1a1a2e; font-weight: 600;">${COMPANY.phone}</a>
    </p>
  `;

  return {
    subject: `${statusInfo.emoji} ${statusInfo.title} - Job #${job.job_number || 'N/A'}`,
    html: wrapEmailTemplate(content, { headerText: 'Project Update' })
  };
}

/**
 * Generate appointment reminder email
 */
function generateAppointmentReminderEmail(appointment) {
  const content = `
    <div style="text-align: center; margin-bottom: 25px;">
      <div style="font-size: 50px; margin-bottom: 15px;">📅</div>
      <h2 style="margin: 0 0 10px; color: #1a1a2e; font-size: 22px;">Appointment Reminder</h2>
    </div>

    <p style="margin: 0 0 20px; color: #444; font-size: 15px;">
      Hi ${escapeHtml(appointment.customer_name || 'Valued Customer')},
    </p>
    <p style="margin: 0 0 25px; color: #444; font-size: 15px;">
      This is a friendly reminder about your upcoming appointment with ${COMPANY.shortName}.
    </p>

    <div style="background: #fff3cd; padding: 25px; border-radius: 8px; text-align: center; margin-bottom: 25px; border: 1px solid #ffc107;">
      <p style="margin: 0 0 5px; color: #856404; font-size: 14px; font-weight: 600;">Appointment Details</p>
      <p style="margin: 0 0 5px; color: #1a1a2e; font-size: 24px; font-weight: 700;">${new Date(appointment.date).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}</p>
      ${appointment.time ? `<p style="margin: 0; color: #1a1a2e; font-size: 18px;">${appointment.time}</p>` : ''}
    </div>

    <div style="background: #f8f8f8; padding: 20px; border-radius: 8px; margin-bottom: 20px;">
      <p style="margin: 0 0 10px; color: #666; font-size: 14px;"><strong>Type:</strong> ${escapeHtml(appointment.type || 'Consultation')}</p>
      ${appointment.address ? `<p style="margin: 0; color: #666; font-size: 14px;"><strong>Location:</strong> ${escapeHtml(appointment.address)}</p>` : ''}
    </div>

    <p style="margin: 0; color: #666; font-size: 14px; text-align: center;">
      Need to reschedule? Call us at <a href="tel:${COMPANY.phone}" style="color: #1a1a2e; font-weight: 600;">${COMPANY.phone}</a>
    </p>
  `;

  return {
    subject: `Reminder: Your ${appointment.type || 'Appointment'} with ${COMPANY.shortName}`,
    html: wrapEmailTemplate(content, { headerColor: '#ffc107', headerText: '' })
  };
}

/**
 * Generate contractor notification email
 */
function generateContractorAssignmentEmail(job, contractor) {
  const content = `
    <h2 style="margin: 0 0 20px; color: #1a1a2e; font-size: 18px; border-bottom: 2px solid #f9cb00; padding-bottom: 10px;">New Job Assignment</h2>

    <p style="margin: 0 0 20px; color: #444; font-size: 15px;">
      Hi ${escapeHtml(contractor.name || 'Contractor')},
    </p>
    <p style="margin: 0 0 25px; color: #444; font-size: 15px;">
      You have been assigned to a new job. Please review the details below.
    </p>

    <div style="background: #f8f8f8; padding: 20px; border-radius: 8px; margin-bottom: 20px;">
      <table width="100%" cellspacing="0" cellpadding="8">
        <tr>
          <td style="color: #666; font-weight: 600; width: 140px;">Job #:</td>
          <td style="color: #1a1a2e;">${escapeHtml(job.job_number || 'N/A')}</td>
        </tr>
        <tr>
          <td style="color: #666; font-weight: 600;">Customer:</td>
          <td style="color: #1a1a2e;">${escapeHtml(job.customer_name || 'N/A')}</td>
        </tr>
        <tr>
          <td style="color: #666; font-weight: 600;">Phone:</td>
          <td style="color: #1a1a2e;"><a href="tel:${job.customer_phone}">${escapeHtml(job.customer_phone || 'N/A')}</a></td>
        </tr>
        <tr>
          <td style="color: #666; font-weight: 600;">Address:</td>
          <td style="color: #1a1a2e;">${escapeHtml(job.address || 'See notes')}</td>
        </tr>
        <tr>
          <td style="color: #666; font-weight: 600;">Project:</td>
          <td style="color: #1a1a2e;">${escapeHtml(job.project_description || 'Countertop Installation')}</td>
        </tr>
        ${job.install_date ? `
        <tr>
          <td style="color: #666; font-weight: 600;">Install Date:</td>
          <td style="color: #1a1a2e; font-weight: 600; color: #e65100;">${new Date(job.install_date).toLocaleDateString()}</td>
        </tr>
        ` : ''}
        ${job.notes ? `
        <tr>
          <td style="color: #666; font-weight: 600;">Notes:</td>
          <td style="color: #1a1a2e;">${escapeHtml(job.notes)}</td>
        </tr>
        ` : ''}
      </table>
    </div>

    <p style="margin: 0; color: #666; font-size: 14px; text-align: center;">
      Questions? Contact the office at <a href="tel:${COMPANY.phone}" style="color: #1a1a2e; font-weight: 600;">${COMPANY.phone}</a>
    </p>
  `;

  return {
    subject: `New Job Assignment - ${job.job_number || 'Job'} - ${job.customer_name || 'Customer'}`,
    html: wrapEmailTemplate(content, { headerText: '🔨 Job Assignment' })
  };
}

/**
 * Generate portal welcome email with access link - Premium Design
 */
function generatePortalWelcomeEmail(data) {
  const { name, portal_url, appointment, pin_code } = data;
  const firstName = (name || 'there').split(' ')[0];

  let appointmentSection = '';
  if (appointment && appointment.date) {
    const apptDate = new Date(appointment.date);
    const formattedDate = apptDate.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
    appointmentSection = `
      <table width="100%" cellspacing="0" cellpadding="0" style="margin: 24px 0;">
        <tr>
          <td style="background: linear-gradient(135deg, #1a1a2e 0%, #2d2d44 100%); border-radius: 12px; padding: 24px; text-align: center;">
            <p style="margin: 0 0 4px; color: #f9cb00; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 1.5px;">Upcoming Appointment</p>
            <p style="margin: 0 0 4px; color: #ffffff; font-size: 20px; font-weight: 700;">${formattedDate}</p>
            ${appointment.time ? `<p style="margin: 0; color: rgba(255,255,255,0.7); font-size: 15px;">${escapeHtml(appointment.time)}</p>` : ''}
          </td>
        </tr>
      </table>
    `;
  }

  let pinSection = '';
  if (pin_code) {
    pinSection = `
      <table width="100%" cellspacing="0" cellpadding="0" style="margin-top: 20px;">
        <tr>
          <td style="background: #f5f5f5; border-radius: 8px; padding: 16px; text-align: center;">
            <p style="margin: 0 0 6px; color: #666; font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px;">Your Secure PIN</p>
            <p style="margin: 0; color: #1a1a2e; font-size: 28px; font-weight: 700; letter-spacing: 6px; font-family: monospace;">${escapeHtml(pin_code)}</p>
          </td>
        </tr>
      </table>
    `;
  }

  const content = `
    <p style="margin: 0 0 20px; color: #333; font-size: 16px; line-height: 1.6;">
      Hi ${escapeHtml(firstName)},
    </p>
    <p style="margin: 0 0 24px; color: #555; font-size: 15px; line-height: 1.6;">
      Thank you for choosing ${COMPANY.shortName}! We've set up a personal project portal where you can track progress, view documents, and stay connected with our team.
    </p>

    ${appointmentSection}

    <!-- CTA Button -->
    <table width="100%" cellspacing="0" cellpadding="0" style="margin: 28px 0;">
      <tr>
        <td align="center">
          <a href="${portal_url}" style="display: inline-block; background: #f9cb00; color: #1a1a2e; text-decoration: none; padding: 16px 36px; border-radius: 8px; font-weight: 700; font-size: 15px; letter-spacing: 0.3px;">Access Your Portal</a>
        </td>
      </tr>
    </table>

    <!-- Features Grid -->
    <table width="100%" cellspacing="0" cellpadding="0" style="margin: 24px 0;">
      <tr>
        <td style="background: #fafafa; border-radius: 12px; padding: 24px;">
          <p style="margin: 0 0 16px; color: #1a1a2e; font-size: 14px; font-weight: 600;">In your portal, you can:</p>
          <table width="100%" cellspacing="0" cellpadding="0">
            <tr>
              <td width="50%" style="padding: 6px 0; color: #555; font-size: 13px;">✓ View appointments</td>
              <td width="50%" style="padding: 6px 0; color: #555; font-size: 13px;">✓ Upload project photos</td>
            </tr>
            <tr>
              <td style="padding: 6px 0; color: #555; font-size: 13px;">✓ Review estimates</td>
              <td style="padding: 6px 0; color: #555; font-size: 13px;">✓ Pay invoices online</td>
            </tr>
            <tr>
              <td style="padding: 6px 0; color: #555; font-size: 13px;">✓ Message our team</td>
              <td style="padding: 6px 0; color: #555; font-size: 13px;">✓ Track project status</td>
            </tr>
          </table>
        </td>
      </tr>
    </table>

    ${pinSection}

    <p style="margin: 24px 0 0; color: #888; font-size: 13px; text-align: center;">
      Questions? Call <a href="tel:${COMPANY.phone}" style="color: #1a1a2e; font-weight: 600; text-decoration: none;">${COMPANY.phone}</a> or reply to this email.
    </p>
  `;

  return {
    subject: `Welcome to ${COMPANY.shortName} - Your Project Portal is Ready`,
    html: wrapEmailTemplate(content, { headerText: 'Welcome!' })
  };
}

/**
 * Generate appointment confirmation with portal link - Premium Design
 */
function generateAppointmentWithPortalEmail(data) {
  const { name, appointment_date, appointment_time, portal_url, address } = data;
  const firstName = (name || 'there').split(' ')[0];

  const apptDate = new Date(appointment_date);
  const dayName = apptDate.toLocaleDateString('en-US', { weekday: 'long' });
  const monthDay = apptDate.toLocaleDateString('en-US', { month: 'long', day: 'numeric' });
  const year = apptDate.getFullYear();

  const content = `
    <p style="margin: 0 0 20px; color: #333; font-size: 16px; line-height: 1.6;">
      Hi ${escapeHtml(firstName)},
    </p>
    <p style="margin: 0 0 24px; color: #555; font-size: 15px; line-height: 1.6;">
      Great news! Your consultation with ${COMPANY.shortName} has been confirmed.
    </p>

    <!-- Appointment Card -->
    <table width="100%" cellspacing="0" cellpadding="0" style="margin: 24px 0;">
      <tr>
        <td style="background: linear-gradient(135deg, #1a1a2e 0%, #2d2d44 100%); border-radius: 12px; overflow: hidden;">
          <table width="100%" cellspacing="0" cellpadding="0">
            <tr>
              <td style="padding: 24px; text-align: center; border-bottom: 1px solid rgba(255,255,255,0.1);">
                <p style="margin: 0 0 4px; color: #4caf50; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 1.5px;">✓ Appointment Confirmed</p>
              </td>
            </tr>
            <tr>
              <td style="padding: 28px; text-align: center;">
                <p style="margin: 0 0 4px; color: rgba(255,255,255,0.6); font-size: 14px;">${dayName}</p>
                <p style="margin: 0 0 4px; color: #ffffff; font-size: 28px; font-weight: 700;">${monthDay}</p>
                <p style="margin: 0 0 12px; color: rgba(255,255,255,0.6); font-size: 14px;">${year}</p>
                ${appointment_time ? `
                <table cellspacing="0" cellpadding="0" style="margin: 0 auto;">
                  <tr>
                    <td style="background: #f9cb00; color: #1a1a2e; padding: 8px 20px; border-radius: 20px; font-size: 15px; font-weight: 600;">${escapeHtml(appointment_time)}</td>
                  </tr>
                </table>
                ` : ''}
                ${address ? `<p style="margin: 16px 0 0; color: rgba(255,255,255,0.5); font-size: 13px;">${escapeHtml(address)}</p>` : ''}
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>

    <!-- Preparation Tips -->
    <table width="100%" cellspacing="0" cellpadding="0" style="margin: 24px 0;">
      <tr>
        <td style="background: #fafafa; border-radius: 12px; padding: 24px;">
          <p style="margin: 0 0 14px; color: #1a1a2e; font-size: 14px; font-weight: 600;">To prepare for your visit:</p>
          <table width="100%" cellspacing="0" cellpadding="0">
            <tr>
              <td style="padding: 8px 0; color: #555; font-size: 13px; line-height: 1.5;">
                <span style="color: #f9cb00; font-weight: bold; margin-right: 8px;">1.</span>
                Think about your material preferences (granite, quartz, marble)
              </td>
            </tr>
            <tr>
              <td style="padding: 8px 0; color: #555; font-size: 13px; line-height: 1.5;">
                <span style="color: #f9cb00; font-weight: bold; margin-right: 8px;">2.</span>
                Have a budget range in mind
              </td>
            </tr>
            <tr>
              <td style="padding: 8px 0; color: #555; font-size: 13px; line-height: 1.5;">
                <span style="color: #f9cb00; font-weight: bold; margin-right: 8px;">3.</span>
                Take photos of your current space to share
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>

    ${portal_url ? `
    <!-- Portal CTA -->
    <table width="100%" cellspacing="0" cellpadding="0" style="margin: 28px 0;">
      <tr>
        <td align="center">
          <p style="margin: 0 0 14px; color: #666; font-size: 14px;">Upload photos and track your project:</p>
          <a href="${portal_url}" style="display: inline-block; background: #f9cb00; color: #1a1a2e; text-decoration: none; padding: 14px 32px; border-radius: 8px; font-weight: 700; font-size: 14px;">Open Project Portal</a>
        </td>
      </tr>
    </table>
    ` : ''}

    <p style="margin: 24px 0 0; color: #888; font-size: 13px; text-align: center;">
      Need to reschedule? Call <a href="tel:${COMPANY.phone}" style="color: #1a1a2e; font-weight: 600; text-decoration: none;">${COMPANY.phone}</a>
    </p>
  `;

  return {
    subject: `Confirmed: ${dayName}, ${monthDay} - ${COMPANY.shortName}`,
    html: wrapEmailTemplate(content, { headerText: 'Appointment Confirmed', accentColor: '#4caf50' })
  };
}

/**
 * Generate pay link email - for sending payment links
 */
function generatePayLinkEmail({
  customerName,
  amount,
  description,
  payLinkUrl,
  entityType = 'payment',  // 'estimate', 'invoice', 'deposit', 'payment'
  entityNumber,
  dueDate,
  notes
}) {
  const firstName = (customerName || 'there').split(' ')[0];
  const formattedAmount = typeof amount === 'number'
    ? `$${(amount / 100).toFixed(2)}`
    : amount;

  // Determine header text and color based on entity type
  const headerConfig = {
    estimate: { text: 'Deposit Request', color: '#1a1a2e' },
    invoice: { text: 'Invoice Payment', color: '#1a1a2e' },
    deposit: { text: 'Deposit Payment', color: '#1a1a2e' },
    payment: { text: 'Payment Request', color: '#1a1a2e' }
  };

  const { text: headerText, color: headerColor } = headerConfig[entityType] || headerConfig.payment;

  const content = `
    <p style="margin: 0 0 20px; color: #333; font-size: 16px; line-height: 1.5;">
      Hi ${escapeHtml(firstName)},
    </p>

    <p style="margin: 0 0 24px; color: #555; font-size: 15px; line-height: 1.6;">
      ${entityType === 'estimate' ? 'A deposit is requested to proceed with your project.' :
        entityType === 'invoice' ? 'Please find your invoice payment link below.' :
        'Please click the button below to complete your payment.'}
    </p>

    <!-- Payment Details Box -->
    <table width="100%" cellspacing="0" cellpadding="0" style="margin: 0 0 28px;">
      <tr>
        <td style="background: #f8f9fa; border-radius: 12px; padding: 24px; border-left: 4px solid #f9cb00;">
          <table width="100%" cellspacing="0" cellpadding="0">
            ${entityNumber ? `
            <tr>
              <td style="padding: 6px 0; color: #666; font-size: 13px; width: 120px;">Reference:</td>
              <td style="padding: 6px 0; color: #1a1a2e; font-size: 14px; font-weight: 600;">${escapeHtml(entityNumber)}</td>
            </tr>
            ` : ''}
            ${description ? `
            <tr>
              <td style="padding: 6px 0; color: #666; font-size: 13px;">Description:</td>
              <td style="padding: 6px 0; color: #1a1a2e; font-size: 14px;">${escapeHtml(description)}</td>
            </tr>
            ` : ''}
            <tr>
              <td style="padding: 6px 0; color: #666; font-size: 13px;">Amount Due:</td>
              <td style="padding: 6px 0; color: #1a1a2e; font-size: 20px; font-weight: 700;">${escapeHtml(formattedAmount)}</td>
            </tr>
            ${dueDate ? `
            <tr>
              <td style="padding: 6px 0; color: #666; font-size: 13px;">Due Date:</td>
              <td style="padding: 6px 0; color: #1a1a2e; font-size: 14px;">${escapeHtml(dueDate)}</td>
            </tr>
            ` : ''}
          </table>
        </td>
      </tr>
    </table>

    <!-- Pay Now Button -->
    <table width="100%" cellspacing="0" cellpadding="0" style="margin: 0 0 28px;">
      <tr>
        <td align="center">
          <a href="${escapeHtml(payLinkUrl)}" style="display: inline-block; background: linear-gradient(135deg, #f9cb00 0%, #f0b800 100%); color: #1a1a2e; text-decoration: none; padding: 16px 48px; border-radius: 8px; font-weight: 700; font-size: 16px; box-shadow: 0 4px 14px rgba(249, 203, 0, 0.4);">
            Pay ${escapeHtml(formattedAmount)} Now
          </a>
        </td>
      </tr>
    </table>

    ${notes ? `
    <p style="margin: 0 0 20px; color: #666; font-size: 14px; line-height: 1.5; font-style: italic; padding: 16px; background: #fafafa; border-radius: 8px;">
      ${escapeHtml(notes)}
    </p>
    ` : ''}

    <!-- Payment Methods Info -->
    <table width="100%" cellspacing="0" cellpadding="0" style="margin: 24px 0;">
      <tr>
        <td style="padding: 16px; background: #f0f7ff; border-radius: 8px; text-align: center;">
          <p style="margin: 0 0 8px; color: #1a1a2e; font-size: 13px; font-weight: 600;">Secure Payment Options</p>
          <p style="margin: 0; color: #666; font-size: 12px;">Credit Card • Debit Card • Bank Transfer (ACH)</p>
        </td>
      </tr>
    </table>

    <p style="margin: 20px 0 0; color: #888; font-size: 13px; text-align: center;">
      Questions? Call us at <a href="tel:${COMPANY.phone}" style="color: #1a1a2e; font-weight: 600; text-decoration: none;">${COMPANY.phone}</a>
    </p>
  `;

  // Generate subject line
  let subject;
  if (entityType === 'estimate' && entityNumber) {
    subject = `Deposit Request - Estimate ${entityNumber}`;
  } else if (entityType === 'invoice' && entityNumber) {
    subject = `Invoice ${entityNumber} - ${formattedAmount} Due`;
  } else {
    subject = `Payment Request - ${formattedAmount} - ${COMPANY.shortName}`;
  }

  return {
    subject,
    html: wrapEmailTemplate(content, { headerText, headerColor })
  };
}

/**
 * Generate estimate email with attachments info
 */
function generateEstimateWithAttachmentsEmail({
  customerName,
  estimateNumber,
  projectName,
  total,
  depositAmount,
  depositPercent,
  payLinkUrl,
  validUntil,
  attachments = [],
  notes
}) {
  const firstName = (customerName || 'there').split(' ')[0];
  const formattedTotal = typeof total === 'number' ? `$${total.toFixed(2)}` : total;
  const formattedDeposit = typeof depositAmount === 'number' ? `$${depositAmount.toFixed(2)}` : depositAmount;

  const content = `
    <p style="margin: 0 0 20px; color: #333; font-size: 16px; line-height: 1.5;">
      Hi ${escapeHtml(firstName)},
    </p>

    <p style="margin: 0 0 24px; color: #555; font-size: 15px; line-height: 1.6;">
      Thank you for considering ${COMPANY.shortName} for your project. Please find your estimate details below.
    </p>

    <!-- Estimate Summary Box -->
    <table width="100%" cellspacing="0" cellpadding="0" style="margin: 0 0 28px;">
      <tr>
        <td style="background: #f8f9fa; border-radius: 12px; padding: 24px; border-left: 4px solid #f9cb00;">
          <table width="100%" cellspacing="0" cellpadding="0">
            <tr>
              <td style="padding: 6px 0; color: #666; font-size: 13px; width: 130px;">Estimate #:</td>
              <td style="padding: 6px 0; color: #1a1a2e; font-size: 14px; font-weight: 600;">${escapeHtml(estimateNumber)}</td>
            </tr>
            ${projectName ? `
            <tr>
              <td style="padding: 6px 0; color: #666; font-size: 13px;">Project:</td>
              <td style="padding: 6px 0; color: #1a1a2e; font-size: 14px;">${escapeHtml(projectName)}</td>
            </tr>
            ` : ''}
            <tr>
              <td style="padding: 6px 0; color: #666; font-size: 13px;">Total:</td>
              <td style="padding: 6px 0; color: #1a1a2e; font-size: 18px; font-weight: 700;">${escapeHtml(formattedTotal)}</td>
            </tr>
            ${depositAmount ? `
            <tr>
              <td style="padding: 6px 0; color: #666; font-size: 13px;">Deposit (${depositPercent || 50}%):</td>
              <td style="padding: 6px 0; color: #f9cb00; font-size: 16px; font-weight: 700;">${escapeHtml(formattedDeposit)}</td>
            </tr>
            ` : ''}
            ${validUntil ? `
            <tr>
              <td style="padding: 6px 0; color: #666; font-size: 13px;">Valid Until:</td>
              <td style="padding: 6px 0; color: #1a1a2e; font-size: 14px;">${escapeHtml(validUntil)}</td>
            </tr>
            ` : ''}
          </table>
        </td>
      </tr>
    </table>

    ${attachments.length > 0 ? `
    <!-- Attachments Section -->
    <table width="100%" cellspacing="0" cellpadding="0" style="margin: 0 0 24px;">
      <tr>
        <td>
          <p style="margin: 0 0 12px; color: #1a1a2e; font-size: 14px; font-weight: 600;">📎 Attachments (${attachments.length}):</p>
          <table width="100%" cellspacing="0" cellpadding="0" style="background: #fafafa; border-radius: 8px; padding: 12px;">
            ${attachments.map(att => `
            <tr>
              <td style="padding: 8px 12px; color: #555; font-size: 13px;">
                ${att.file_type === 'image' || att.file_type === 'photo' ? '🖼️' : '📄'} ${escapeHtml(att.file_name)}
              </td>
            </tr>
            `).join('')}
          </table>
          <p style="margin: 8px 0 0; color: #888; font-size: 12px;">Files are attached to this email.</p>
        </td>
      </tr>
    </table>
    ` : ''}

    ${payLinkUrl ? `
    <!-- Pay Deposit Button -->
    <table width="100%" cellspacing="0" cellpadding="0" style="margin: 0 0 28px;">
      <tr>
        <td align="center">
          <a href="${escapeHtml(payLinkUrl)}" style="display: inline-block; background: linear-gradient(135deg, #f9cb00 0%, #f0b800 100%); color: #1a1a2e; text-decoration: none; padding: 16px 48px; border-radius: 8px; font-weight: 700; font-size: 16px; box-shadow: 0 4px 14px rgba(249, 203, 0, 0.4);">
            Pay Deposit ${formattedDeposit ? `(${escapeHtml(formattedDeposit)})` : ''} to Approve
          </a>
        </td>
      </tr>
    </table>
    ` : ''}

    ${notes ? `
    <p style="margin: 0 0 20px; color: #666; font-size: 14px; line-height: 1.5; padding: 16px; background: #fafafa; border-radius: 8px;">
      <strong>Notes:</strong> ${escapeHtml(notes)}
    </p>
    ` : ''}

    <p style="margin: 20px 0 0; color: #888; font-size: 13px; text-align: center;">
      Questions? Call us at <a href="tel:${COMPANY.phone}" style="color: #1a1a2e; font-weight: 600; text-decoration: none;">${COMPANY.phone}</a>
    </p>
  `;

  return {
    subject: `Estimate ${estimateNumber} - ${formattedTotal} - ${COMPANY.shortName}`,
    html: wrapEmailTemplate(content, { headerText: 'Your Estimate', headerColor: '#1a1a2e' })
  };
}

/**
 * Generate invoice email with attachments info
 */
function generateInvoiceWithAttachmentsEmail({
  customerName,
  invoiceNumber,
  projectName,
  total,
  amountPaid,
  balanceDue,
  payLinkUrl,
  dueDate,
  attachments = [],
  notes
}) {
  const firstName = (customerName || 'there').split(' ')[0];
  const formattedTotal = typeof total === 'number' ? `$${total.toFixed(2)}` : total;
  const formattedPaid = typeof amountPaid === 'number' ? `$${amountPaid.toFixed(2)}` : amountPaid;
  const formattedBalance = typeof balanceDue === 'number' ? `$${balanceDue.toFixed(2)}` : balanceDue;

  const content = `
    <p style="margin: 0 0 20px; color: #333; font-size: 16px; line-height: 1.5;">
      Hi ${escapeHtml(firstName)},
    </p>

    <p style="margin: 0 0 24px; color: #555; font-size: 15px; line-height: 1.6;">
      Please find your invoice from ${COMPANY.shortName} below.
    </p>

    <!-- Invoice Summary Box -->
    <table width="100%" cellspacing="0" cellpadding="0" style="margin: 0 0 28px;">
      <tr>
        <td style="background: #f8f9fa; border-radius: 12px; padding: 24px; border-left: 4px solid #1a1a2e;">
          <table width="100%" cellspacing="0" cellpadding="0">
            <tr>
              <td style="padding: 6px 0; color: #666; font-size: 13px; width: 130px;">Invoice #:</td>
              <td style="padding: 6px 0; color: #1a1a2e; font-size: 14px; font-weight: 600;">${escapeHtml(invoiceNumber)}</td>
            </tr>
            ${projectName ? `
            <tr>
              <td style="padding: 6px 0; color: #666; font-size: 13px;">Project:</td>
              <td style="padding: 6px 0; color: #1a1a2e; font-size: 14px;">${escapeHtml(projectName)}</td>
            </tr>
            ` : ''}
            <tr>
              <td style="padding: 6px 0; color: #666; font-size: 13px;">Total:</td>
              <td style="padding: 6px 0; color: #1a1a2e; font-size: 16px; font-weight: 600;">${escapeHtml(formattedTotal)}</td>
            </tr>
            ${amountPaid ? `
            <tr>
              <td style="padding: 6px 0; color: #666; font-size: 13px;">Amount Paid:</td>
              <td style="padding: 6px 0; color: #4caf50; font-size: 14px;">-${escapeHtml(formattedPaid)}</td>
            </tr>
            ` : ''}
            <tr>
              <td style="padding: 6px 0; color: #666; font-size: 13px;">Balance Due:</td>
              <td style="padding: 6px 0; color: #f44336; font-size: 20px; font-weight: 700;">${escapeHtml(formattedBalance)}</td>
            </tr>
            ${dueDate ? `
            <tr>
              <td style="padding: 6px 0; color: #666; font-size: 13px;">Due Date:</td>
              <td style="padding: 6px 0; color: #1a1a2e; font-size: 14px; font-weight: 600;">${escapeHtml(dueDate)}</td>
            </tr>
            ` : ''}
          </table>
        </td>
      </tr>
    </table>

    ${attachments.length > 0 ? `
    <!-- Attachments Section -->
    <table width="100%" cellspacing="0" cellpadding="0" style="margin: 0 0 24px;">
      <tr>
        <td>
          <p style="margin: 0 0 12px; color: #1a1a2e; font-size: 14px; font-weight: 600;">📎 Attachments (${attachments.length}):</p>
          <table width="100%" cellspacing="0" cellpadding="0" style="background: #fafafa; border-radius: 8px; padding: 12px;">
            ${attachments.map(att => `
            <tr>
              <td style="padding: 8px 12px; color: #555; font-size: 13px;">
                ${att.file_type === 'image' || att.file_type === 'photo' ? '🖼️' : '📄'} ${escapeHtml(att.file_name)}
              </td>
            </tr>
            `).join('')}
          </table>
          <p style="margin: 8px 0 0; color: #888; font-size: 12px;">Files are attached to this email.</p>
        </td>
      </tr>
    </table>
    ` : ''}

    ${payLinkUrl ? `
    <!-- Pay Now Button -->
    <table width="100%" cellspacing="0" cellpadding="0" style="margin: 0 0 28px;">
      <tr>
        <td align="center">
          <a href="${escapeHtml(payLinkUrl)}" style="display: inline-block; background: linear-gradient(135deg, #f9cb00 0%, #f0b800 100%); color: #1a1a2e; text-decoration: none; padding: 16px 48px; border-radius: 8px; font-weight: 700; font-size: 16px; box-shadow: 0 4px 14px rgba(249, 203, 0, 0.4);">
            Pay ${escapeHtml(formattedBalance)} Now
          </a>
        </td>
      </tr>
    </table>
    ` : ''}

    ${notes ? `
    <p style="margin: 0 0 20px; color: #666; font-size: 14px; line-height: 1.5; padding: 16px; background: #fafafa; border-radius: 8px;">
      <strong>Notes:</strong> ${escapeHtml(notes)}
    </p>
    ` : ''}

    <!-- Payment Methods Info -->
    <table width="100%" cellspacing="0" cellpadding="0" style="margin: 24px 0;">
      <tr>
        <td style="padding: 16px; background: #f0f7ff; border-radius: 8px; text-align: center;">
          <p style="margin: 0 0 8px; color: #1a1a2e; font-size: 13px; font-weight: 600;">Secure Payment Options</p>
          <p style="margin: 0; color: #666; font-size: 12px;">Credit Card • Debit Card • Bank Transfer (ACH)</p>
        </td>
      </tr>
    </table>

    <p style="margin: 20px 0 0; color: #888; font-size: 13px; text-align: center;">
      Questions? Call us at <a href="tel:${COMPANY.phone}" style="color: #1a1a2e; font-weight: 600; text-decoration: none;">${COMPANY.phone}</a>
    </p>
  `;

  return {
    subject: `Invoice ${invoiceNumber} - ${formattedBalance} Due - ${COMPANY.shortName}`,
    html: wrapEmailTemplate(content, { headerText: 'Invoice', headerColor: '#1a1a2e' })
  };
}

module.exports = {
  sendNotification,
  sendAdminNotification,
  wrapEmailTemplate,
  generateLeadNotificationEmail,
  generateCustomerConfirmationEmail,
  generateOrderConfirmationEmail,
  generateEstimateSentEmail,
  generateEstimateApprovedEmail,
  generateInvoiceSentEmail,
  generatePaymentConfirmationEmail,
  generateJobStatusEmail,
  generateAppointmentReminderEmail,
  generateContractorAssignmentEmail,
  generatePortalWelcomeEmail,
  generateAppointmentWithPortalEmail,
  generatePayLinkEmail,
  generateEstimateWithAttachmentsEmail,
  generateInvoiceWithAttachmentsEmail,
  COMPANY,
  ADMIN_EMAIL,
  isConfigured: () => !!SMTP_USER
};
