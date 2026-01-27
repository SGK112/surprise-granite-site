/**
 * Email Routes
 * Handles email sending for estimates, invoices, and notifications
 *
 * This file extracts email-related endpoints from server.js
 * for better maintainability.
 */

const express = require('express');
const router = express.Router();
const nodemailer = require('nodemailer');
const logger = require('../utils/logger');
const { handleApiError, isValidEmail, sanitizeString } = require('../utils/security');
const { asyncHandler } = require('../middleware/errorHandler');
const emailService = require('../services/emailService');

// Email configuration
const SMTP_USER = process.env.SMTP_USER || process.env.EMAIL_USER;
const SMTP_PASS = process.env.SMTP_PASS || process.env.EMAIL_PASS;

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

// Company info
const COMPANY = emailService.COMPANY || {
  name: 'Surprise Granite',
  email: 'info@surprisegranite.com',
  phone: '(602) 833-3189',
  address: '14050 N 83rd Ave Suite 290, Peoria AZ 85381'
};

/**
 * Test email configuration
 * POST /api/email/test
 */
router.post('/test', asyncHandler(async (req, res) => {
  const { to } = req.body;

  if (!to || !isValidEmail(to)) {
    return res.status(400).json({ error: 'Valid email address required' });
  }

  if (!SMTP_USER) {
    return res.status(500).json({ error: 'Email not configured' });
  }

  try {
    await transporter.sendMail({
      from: `"${COMPANY.name}" <${SMTP_USER}>`,
      to,
      subject: 'Test Email from ' + COMPANY.name,
      html: `
        <div style="font-family: Arial, sans-serif; padding: 20px;">
          <h2>Email Test Successful!</h2>
          <p>This confirms that your email configuration is working correctly.</p>
          <p>Sent at: ${new Date().toISOString()}</p>
          <hr>
          <p style="color: #666; font-size: 12px;">${COMPANY.name} | ${COMPANY.phone}</p>
        </div>
      `
    });

    res.json({ success: true, message: 'Test email sent successfully' });
  } catch (err) {
    logger.apiError(err, { context: 'Test email failed' });
    res.status(500).json({ error: 'Failed to send test email: ' + err.message });
  }
}));

/**
 * Send notification email
 * POST /api/email/notify
 */
router.post('/notify', asyncHandler(async (req, res) => {
  const { to, subject, message, type = 'info', rawHtml = false } = req.body;

  if (!to || !isValidEmail(to)) {
    return res.status(400).json({ error: 'Valid email address required' });
  }

  if (!subject || !message) {
    return res.status(400).json({ error: 'Subject and message are required' });
  }

  if (!SMTP_USER) {
    return res.status(500).json({ error: 'Email not configured' });
  }

  let html;

  if (rawHtml) {
    // Send pre-built HTML email as-is (e.g. room design invitations)
    html = message;
  } else {
    const colors = {
      info: '#3b82f6',
      success: '#22c55e',
      warning: '#f59e0b',
      error: '#ef4444'
    };

    html = emailService.wrapEmailTemplate(`
      <h2 style="color: ${colors[type] || colors.info}; margin-bottom: 20px;">${sanitizeString(subject, 200)}</h2>
      <div style="color: #333; line-height: 1.6;">
        ${sanitizeString(message, 2000).replace(/\n/g, '<br>')}
      </div>
    `);
  }

  try {
    await transporter.sendMail({
      from: `"${COMPANY.name}" <${SMTP_USER}>`,
      to,
      subject: sanitizeString(subject, 200),
      html
    });

    res.json({ success: true, message: 'Notification sent' });
  } catch (err) {
    logger.apiError(err, { context: 'Send notification failed' });
    res.status(500).json({ error: 'Failed to send notification' });
  }
}));

/**
 * Send contact form message
 * POST /api/email/contact
 */
router.post('/contact', asyncHandler(async (req, res) => {
  const { name, email, phone, message, subject } = req.body;

  if (!email || !isValidEmail(email)) {
    return res.status(400).json({ error: 'Valid email required' });
  }

  if (!name || !message) {
    return res.status(400).json({ error: 'Name and message are required' });
  }

  const adminEmail = process.env.ADMIN_EMAIL || 'info@surprisegranite.com';

  const html = `
    <div style="font-family: Arial, sans-serif; padding: 20px; max-width: 600px;">
      <h2 style="color: #1a1a2e;">New Contact Form Submission</h2>
      <table style="width: 100%; border-collapse: collapse; margin: 20px 0;">
        <tr>
          <td style="padding: 8px; border-bottom: 1px solid #eee; font-weight: bold; width: 120px;">Name:</td>
          <td style="padding: 8px; border-bottom: 1px solid #eee;">${sanitizeString(name, 200)}</td>
        </tr>
        <tr>
          <td style="padding: 8px; border-bottom: 1px solid #eee; font-weight: bold;">Email:</td>
          <td style="padding: 8px; border-bottom: 1px solid #eee;"><a href="mailto:${email}">${email}</a></td>
        </tr>
        ${phone ? `
        <tr>
          <td style="padding: 8px; border-bottom: 1px solid #eee; font-weight: bold;">Phone:</td>
          <td style="padding: 8px; border-bottom: 1px solid #eee;"><a href="tel:${phone}">${sanitizeString(phone, 20)}</a></td>
        </tr>
        ` : ''}
        ${subject ? `
        <tr>
          <td style="padding: 8px; border-bottom: 1px solid #eee; font-weight: bold;">Subject:</td>
          <td style="padding: 8px; border-bottom: 1px solid #eee;">${sanitizeString(subject, 200)}</td>
        </tr>
        ` : ''}
      </table>
      <div style="background: #f5f5f5; padding: 15px; border-radius: 6px; margin-top: 15px;">
        <strong>Message:</strong>
        <p style="margin: 10px 0 0; white-space: pre-wrap;">${sanitizeString(message, 2000)}</p>
      </div>
      <p style="color: #666; font-size: 12px; margin-top: 20px;">
        Received at: ${new Date().toLocaleString()}
      </p>
    </div>
  `;

  try {
    // Send to admin
    if (SMTP_USER) {
      await transporter.sendMail({
        from: `"${COMPANY.name} Website" <${SMTP_USER}>`,
        to: adminEmail,
        replyTo: email,
        subject: `Contact Form: ${subject || 'New Message'} from ${sanitizeString(name, 50)}`,
        html
      });
    }

    // Send confirmation to customer
    const confirmHtml = emailService.wrapEmailTemplate(`
      <h2 style="color: #1a1a2e; margin-bottom: 20px;">Thank You for Contacting Us!</h2>
      <p>Hi ${sanitizeString(name, 100)},</p>
      <p>We've received your message and will get back to you as soon as possible, typically within 24-48 hours.</p>
      <p>If you need immediate assistance, please call us at <a href="tel:${COMPANY.phone}">${COMPANY.phone}</a>.</p>
      <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;">
      <p style="color: #666; font-size: 13px;"><strong>Your message:</strong></p>
      <p style="color: #666; font-size: 13px; white-space: pre-wrap;">${sanitizeString(message, 500)}</p>
    `);

    if (SMTP_USER) {
      await transporter.sendMail({
        from: `"${COMPANY.name}" <${SMTP_USER}>`,
        to: email,
        subject: `Thank you for contacting ${COMPANY.name}`,
        html: confirmHtml
      });
    }

    res.json({ success: true, message: 'Message sent successfully' });
  } catch (err) {
    logger.apiError(err, { context: 'Contact form email failed' });
    res.status(500).json({ error: 'Failed to send message' });
  }
}));

/**
 * Send welcome email to new lead with optional portal link
 * POST /api/email/lead-welcome
 */
router.post('/lead-welcome', asyncHandler(async (req, res) => {
  const {
    email,
    first_name,
    last_name,
    full_name,
    project_type,
    notes,
    has_appointment,
    appointment_date,
    appointment_time,
    appointment_type,
    portal_url,
    source
  } = req.body;

  if (!email || !isValidEmail(email)) {
    return res.status(400).json({ error: 'Valid email address required' });
  }

  const name = full_name || `${first_name || ''} ${last_name || ''}`.trim() || 'Valued Customer';

  try {
    let emailContent;

    // If has appointment and portal URL, use combined template
    if (has_appointment && portal_url) {
      emailContent = emailService.generateAppointmentWithPortalEmail({
        name,
        appointment_date,
        appointment_time,
        portal_url,
        address: null
      });
    }
    // If has portal URL but no appointment
    else if (portal_url) {
      emailContent = emailService.generatePortalWelcomeEmail({
        name,
        portal_url
      });
    }
    // If has appointment but no portal
    else if (has_appointment) {
      const apptDate = appointment_date ? new Date(appointment_date) : null;
      const formattedDate = apptDate ? apptDate.toLocaleDateString('en-US', {
        weekday: 'long', month: 'long', day: 'numeric', year: 'numeric'
      }) : 'TBD';

      const html = emailService.wrapEmailTemplate(`
        <div style="text-align: center; margin-bottom: 25px;">
          <div style="width: 70px; height: 70px; background: linear-gradient(135deg, #4caf50 0%, #2e7d32 100%); border-radius: 50%; margin: 0 auto 20px; line-height: 70px;">
            <span style="font-size: 35px; color: #fff;">✓</span>
          </div>
          <h2 style="margin: 0 0 10px; color: #1a1a2e; font-size: 24px;">Appointment Confirmed!</h2>
        </div>

        <p style="margin: 0 0 20px; color: #444; font-size: 15px;">
          Hi ${sanitizeString(name, 100)},
        </p>
        <p style="margin: 0 0 25px; color: #444; font-size: 15px;">
          Thank you for scheduling with ${COMPANY.name}! We're looking forward to helping you with your ${sanitizeString(project_type || 'project', 100)}.
        </p>

        <div style="background: #e8f5e9; padding: 25px; border-radius: 8px; text-align: center; margin-bottom: 25px; border: 1px solid #4caf50;">
          <p style="margin: 0 0 5px; color: #2e7d32; font-size: 14px; font-weight: 600; text-transform: uppercase; letter-spacing: 1px;">${sanitizeString(appointment_type || 'Your Appointment', 50)}</p>
          <p style="margin: 0 0 5px; color: #1a1a2e; font-size: 22px; font-weight: 700;">${formattedDate}</p>
          ${appointment_time ? `<p style="margin: 0; color: #1a1a2e; font-size: 18px;">${sanitizeString(appointment_time, 20)}</p>` : ''}
        </div>

        <p style="margin: 0; color: #666; font-size: 14px; text-align: center;">
          Need to reschedule? Call us at <a href="tel:${COMPANY.phone}" style="color: #1a1a2e; font-weight: 600;">${COMPANY.phone}</a>
        </p>
      `, { headerColor: '#4caf50', headerText: '' });

      emailContent = {
        subject: `Appointment Confirmed - ${COMPANY.name}`,
        html
      };
    }
    // Standard welcome email
    else {
      emailContent = emailService.generateCustomerConfirmationEmail({ name });
    }

    // Send the email
    const result = await emailService.sendNotification(email, emailContent.subject, emailContent.html);

    if (!result.success) {
      logger.warn('Lead welcome email failed', { email: email.substring(0, 3) + '***', reason: result.reason });
      return res.status(500).json({ error: 'Failed to send email', reason: result.reason });
    }

    logger.info('Lead welcome email sent', { email: email.substring(0, 3) + '***', hasAppointment: has_appointment });

    res.json({ success: true, message: 'Welcome email sent successfully' });
  } catch (err) {
    logger.apiError(err, { context: 'Lead welcome email failed' });
    res.status(500).json({ error: 'Failed to send welcome email' });
  }
}));

module.exports = router;
