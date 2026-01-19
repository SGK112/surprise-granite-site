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

// Company Branding
const COMPANY = {
  name: 'Surprise Granite Marble & Quartz',
  shortName: 'Surprise Granite',
  email: 'info@surprisegranite.com',
  phone: '(602) 833-3189',
  address: '15464 W Aster Dr, Surprise, AZ 85379',
  website: 'https://www.surprisegranite.com',
  logo: 'https://cdn.prod.website-files.com/6456ce4476abb25581fbad0c/6456ce4476abb23120fbb175_Surprise-Granite-webclip-icon-256x256px.png',
  tagline: 'Premium Countertops & Expert Installation',
  license: 'AZ ROC# 341113'
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
 */
async function sendNotification(to, subject, html) {
  try {
    if (!SMTP_USER) {
      logger.warn('Email not sent - SMTP not configured', { to: to?.substring(0, 3) + '***', subject });
      return { success: false, reason: 'SMTP not configured' };
    }

    await transporter.sendMail({
      from: `"${COMPANY.shortName}" <${SMTP_USER}>`,
      to,
      subject,
      html
    });

    logger.emailSent(subject, true);
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
 * Generate standard email wrapper
 */
function wrapEmailTemplate(content, options = {}) {
  const { headerColor = '#f9cb00', headerText = '' } = options;

  return `
<!DOCTYPE html>
<html>
<body style="margin: 0; padding: 0; background-color: #f5f5f5; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
  <table width="100%" cellspacing="0" cellpadding="0" style="background-color: #f5f5f5;">
    <tr>
      <td align="center" style="padding: 40px 20px;">
        <table width="600" cellspacing="0" cellpadding="0" style="background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.08);">
          <tr>
            <td style="background: linear-gradient(135deg, ${headerColor} 0%, #e6b800 100%); padding: 25px; text-align: center;">
              <img src="${COMPANY.logo}" alt="${COMPANY.shortName}" style="max-height: 40px; width: auto; margin-bottom: 10px;">
              ${headerText ? `<h1 style="margin: 0; color: #1a1a2e; font-size: 22px; font-weight: 700;">${escapeHtml(headerText)}</h1>` : ''}
            </td>
          </tr>
          <tr>
            <td style="padding: 30px;">
              ${content}
            </td>
          </tr>
          <tr>
            <td style="background: #f8f8f8; padding: 20px; text-align: center; border-top: 1px solid #e5e5e5;">
              <p style="margin: 0 0 8px; color: #666; font-size: 13px;">
                <a href="mailto:${COMPANY.email}" style="color: #1a1a2e; text-decoration: none;">${COMPANY.email}</a> •
                <a href="tel:${COMPANY.phone}" style="color: #1a1a2e; text-decoration: none;">${COMPANY.phone}</a>
              </p>
              <p style="margin: 0; color: #999; font-size: 11px;">${COMPANY.license} • Licensed & Insured</p>
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
 * Generate customer confirmation email
 */
function generateCustomerConfirmationEmail(data) {
  const content = `
    <div style="text-align: center; margin-bottom: 25px;">
      <div style="width: 60px; height: 60px; background: linear-gradient(135deg, #4caf50, #2e7d32); border-radius: 50%; margin: 0 auto 15px; line-height: 60px;">
        <span style="font-size: 30px; color: #fff;">✓</span>
      </div>
      <h2 style="margin: 0 0 10px; color: #1a1a2e; font-size: 22px;">Thank You, ${escapeHtml(data.name || 'Valued Customer')}!</h2>
      <p style="margin: 0; color: #666; font-size: 15px;">We've received your inquiry and will be in touch shortly.</p>
    </div>

    <div style="background: #f8f8f8; padding: 20px; border-radius: 8px; margin-bottom: 20px;">
      <h3 style="margin: 0 0 12px; color: #1a1a2e; font-size: 16px;">What happens next?</h3>
      <ul style="margin: 0; padding-left: 20px; color: #666; font-size: 14px; line-height: 1.8;">
        <li>Our team will review your project details</li>
        <li>We'll contact you within 24 hours</li>
        <li>We'll schedule a free consultation at your convenience</li>
      </ul>
    </div>

    <p style="margin: 0; color: #666; font-size: 14px; text-align: center;">
      Questions? Call us at <a href="tel:${COMPANY.phone}" style="color: #1a1a2e; font-weight: 600;">${COMPANY.phone}</a>
    </p>
  `;

  return {
    subject: `Thanks for contacting ${COMPANY.shortName}!`,
    html: wrapEmailTemplate(content, { headerText: 'Request Received' })
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

module.exports = {
  sendNotification,
  sendAdminNotification,
  wrapEmailTemplate,
  generateLeadNotificationEmail,
  generateCustomerConfirmationEmail,
  generateOrderConfirmationEmail,
  COMPANY,
  ADMIN_EMAIL,
  isConfigured: () => !!SMTP_USER
};
