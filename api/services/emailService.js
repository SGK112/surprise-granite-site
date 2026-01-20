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
  COMPANY,
  ADMIN_EMAIL,
  isConfigured: () => !!SMTP_USER
};
