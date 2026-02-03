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
 * Send professional email to lead/customer
 * POST /api/email/send
 */
router.post('/send', asyncHandler(async (req, res) => {
  const { to, subject, body, lead_id, customer_id } = req.body;

  if (!to || !isValidEmail(to)) {
    return res.status(400).json({ error: 'Valid email address required' });
  }

  if (!subject || !body) {
    return res.status(400).json({ error: 'Subject and message body are required' });
  }

  if (!SMTP_USER) {
    return res.status(500).json({ error: 'Email not configured' });
  }

  // Build professional HTML email
  const html = emailService.wrapEmailTemplate(`
    <div style="color: #333; line-height: 1.7; font-size: 15px;">
      ${sanitizeString(body, 5000).replace(/\n/g, '<br>')}
    </div>
    <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #e5e5e5;">
      <p style="margin: 0; color: #666; font-size: 14px;">
        <strong style="color: #333;">Surprise Granite</strong><br>
        Premium Countertops & Stone<br>
        <a href="tel:+16028333189" style="color: #f9cb00;">(602) 833-3189</a><br>
        <a href="https://www.surprisegranite.com" style="color: #f9cb00;">www.surprisegranite.com</a>
      </p>
    </div>
  `);

  try {
    await transporter.sendMail({
      from: `"Surprise Granite" <${SMTP_USER}>`,
      to,
      subject: sanitizeString(subject, 200),
      html,
      replyTo: process.env.ADMIN_EMAIL || 'joshb@surprisegranite.com'
    });

    logger.info('Email sent to lead/customer', { to, subject, lead_id, customer_id });
    res.json({ success: true, message: 'Email sent successfully' });
  } catch (err) {
    logger.apiError(err, { context: 'Send email to lead/customer failed' });
    res.status(500).json({ error: 'Failed to send email' });
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

/**
 * Generate and send daily digest email
 * POST /api/email/daily-digest
 */
router.post('/daily-digest', asyncHandler(async (req, res) => {
  const { user_id, email, name } = req.body;

  if (!email || !isValidEmail(email)) {
    return res.status(400).json({ error: 'Valid email address required' });
  }

  if (!user_id) {
    return res.status(400).json({ error: 'User ID required' });
  }

  if (!SMTP_USER) {
    return res.status(500).json({ error: 'Email not configured' });
  }

  // Import Supabase client
  const { createClient } = require('@supabase/supabase-js');
  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const dayAfterTomorrow = new Date(today);
    dayAfterTomorrow.setDate(dayAfterTomorrow.getDate() + 2);

    // Fetch digest data in parallel
    const [leadsResult, eventsResult, tasksResult, projectsResult] = await Promise.all([
      // New leads from last 24 hours
      supabase
        .from('leads')
        .select('id, first_name, last_name, email, phone, source, status, created_at')
        .eq('user_id', user_id)
        .gte('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
        .order('created_at', { ascending: false })
        .limit(10),

      // Today's and tomorrow's appointments
      supabase
        .from('calendar_events')
        .select('id, title, event_type, start_time, end_time, status, customer_name')
        .eq('user_id', user_id)
        .gte('start_time', today.toISOString())
        .lt('start_time', dayAfterTomorrow.toISOString())
        .order('start_time', { ascending: true })
        .limit(15),

      // Pending/overdue tasks
      supabase
        .from('project_tasks')
        .select('id, title, status, due_date, project_id')
        .eq('status', 'pending')
        .not('due_date', 'is', null)
        .lte('due_date', tomorrow.toISOString().split('T')[0])
        .limit(10),

      // Recently updated projects
      supabase
        .from('projects')
        .select('id, name, status, customer_name, progress, updated_at')
        .eq('user_id', user_id)
        .gte('updated_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
        .order('updated_at', { ascending: false })
        .limit(10)
    ]);

    const leads = leadsResult.data || [];
    const events = eventsResult.data || [];
    const tasks = tasksResult.data || [];
    const projects = projectsResult.data || [];

    // Split events into today and tomorrow
    const todayEvents = events.filter(e => new Date(e.start_time) < tomorrow);
    const tomorrowEvents = events.filter(e => new Date(e.start_time) >= tomorrow);

    // Generate email content
    const todayFormatted = today.toLocaleDateString('en-US', {
      weekday: 'long', month: 'long', day: 'numeric', year: 'numeric'
    });

    const greeting = name ? `Good morning, ${sanitizeString(name.split(' ')[0], 50)}!` : 'Good morning!';

    let digestContent = `
      <p style="margin: 0 0 20px; color: #444; font-size: 16px;">${greeting}</p>
      <p style="margin: 0 0 25px; color: #666; font-size: 14px;">Here's your daily digest for <strong>${todayFormatted}</strong></p>
    `;

    // Today's Schedule Section
    if (todayEvents.length > 0) {
      digestContent += `
        <div style="background: #f8fafc; border-radius: 10px; padding: 20px; margin-bottom: 20px; border-left: 4px solid #3b82f6;">
          <h3 style="margin: 0 0 15px; color: #1e293b; font-size: 16px; display: flex; align-items: center; gap: 8px;">
            <span style="background: #3b82f6; color: #fff; width: 24px; height: 24px; border-radius: 50%; display: inline-flex; align-items: center; justify-content: center; font-size: 12px;">${todayEvents.length}</span>
            Today's Appointments
          </h3>
          ${todayEvents.map(e => {
            const time = new Date(e.start_time).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
            const statusColor = e.status === 'confirmed' ? '#22c55e' : e.status === 'pending' ? '#f59e0b' : '#6b7280';
            return `
              <div style="display: flex; align-items: center; padding: 10px 0; border-bottom: 1px solid #e2e8f0;">
                <div style="width: 60px; font-weight: 600; color: #3b82f6; font-size: 13px;">${time}</div>
                <div style="flex: 1;">
                  <div style="font-weight: 600; color: #1e293b; font-size: 14px;">${sanitizeString(e.title || e.event_type || 'Appointment', 50)}</div>
                  ${e.customer_name ? `<div style="font-size: 12px; color: #64748b;">${sanitizeString(e.customer_name, 50)}</div>` : ''}
                </div>
                <span style="font-size: 11px; padding: 3px 8px; border-radius: 4px; background: ${statusColor}20; color: ${statusColor};">${e.status || 'pending'}</span>
              </div>
            `;
          }).join('')}
        </div>
      `;
    } else {
      digestContent += `
        <div style="background: #f8fafc; border-radius: 10px; padding: 20px; margin-bottom: 20px; text-align: center;">
          <p style="margin: 0; color: #64748b; font-size: 14px;">No appointments scheduled for today</p>
        </div>
      `;
    }

    // Tomorrow's Preview
    if (tomorrowEvents.length > 0) {
      digestContent += `
        <div style="background: #fefce8; border-radius: 10px; padding: 15px 20px; margin-bottom: 20px; border-left: 4px solid #f59e0b;">
          <h4 style="margin: 0 0 10px; color: #92400e; font-size: 14px;">Tomorrow's Preview (${tomorrowEvents.length})</h4>
          <p style="margin: 0; color: #78716c; font-size: 13px;">
            ${tomorrowEvents.map(e => {
              const time = new Date(e.start_time).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
              return `${time}: ${sanitizeString(e.title || e.event_type || 'Appointment', 30)}`;
            }).join(' • ')}
          </p>
        </div>
      `;
    }

    // New Leads Section
    if (leads.length > 0) {
      digestContent += `
        <div style="background: #f0fdf4; border-radius: 10px; padding: 20px; margin-bottom: 20px; border-left: 4px solid #22c55e;">
          <h3 style="margin: 0 0 15px; color: #166534; font-size: 16px;">
            <span style="background: #22c55e; color: #fff; width: 24px; height: 24px; border-radius: 50%; display: inline-flex; align-items: center; justify-content: center; font-size: 12px; margin-right: 8px;">${leads.length}</span>
            New Leads
          </h3>
          ${leads.map(l => `
            <div style="display: flex; align-items: center; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #dcfce7;">
              <div>
                <div style="font-weight: 600; color: #166534; font-size: 14px;">${sanitizeString((l.first_name || '') + ' ' + (l.last_name || ''), 50)}</div>
                <div style="font-size: 12px; color: #4ade80;">${sanitizeString(l.source || 'Direct', 30)}</div>
              </div>
              <span style="font-size: 11px; padding: 3px 8px; border-radius: 4px; background: #22c55e20; color: #166534;">${l.status || 'new'}</span>
            </div>
          `).join('')}
        </div>
      `;
    }

    // Pending Tasks Section
    if (tasks.length > 0) {
      const overdueTasks = tasks.filter(t => t.due_date && new Date(t.due_date) < today);
      const dueTodayTasks = tasks.filter(t => t.due_date && new Date(t.due_date) >= today);

      if (overdueTasks.length > 0) {
        digestContent += `
          <div style="background: #fef2f2; border-radius: 10px; padding: 20px; margin-bottom: 20px; border-left: 4px solid #ef4444;">
            <h3 style="margin: 0 0 15px; color: #991b1b; font-size: 16px;">
              <span style="background: #ef4444; color: #fff; width: 24px; height: 24px; border-radius: 50%; display: inline-flex; align-items: center; justify-content: center; font-size: 12px; margin-right: 8px;">!</span>
              Overdue Tasks (${overdueTasks.length})
            </h3>
            ${overdueTasks.map(t => `
              <div style="padding: 8px 0; border-bottom: 1px solid #fecaca;">
                <div style="font-weight: 500; color: #991b1b; font-size: 14px;">${sanitizeString(t.title, 50)}</div>
                <div style="font-size: 12px; color: #f87171;">Due: ${new Date(t.due_date).toLocaleDateString()}</div>
              </div>
            `).join('')}
          </div>
        `;
      }

      if (dueTodayTasks.length > 0) {
        digestContent += `
          <div style="background: #fefce8; border-radius: 10px; padding: 20px; margin-bottom: 20px; border-left: 4px solid #eab308;">
            <h3 style="margin: 0 0 15px; color: #854d0e; font-size: 16px;">Tasks Due Today (${dueTodayTasks.length})</h3>
            ${dueTodayTasks.map(t => `
              <div style="padding: 8px 0; border-bottom: 1px solid #fef08a;">
                <div style="font-weight: 500; color: #854d0e; font-size: 14px;">${sanitizeString(t.title, 50)}</div>
              </div>
            `).join('')}
          </div>
        `;
      }
    }

    // Project Updates Section
    if (projects.length > 0) {
      digestContent += `
        <div style="background: #f8fafc; border-radius: 10px; padding: 20px; margin-bottom: 20px; border-left: 4px solid #8b5cf6;">
          <h3 style="margin: 0 0 15px; color: #5b21b6; font-size: 16px;">Recent Project Updates</h3>
          ${projects.map(p => {
            const progress = p.progress || 0;
            const statusColors = {
              lead: '#f59e0b', approved: '#3b82f6', scheduled: '#8b5cf6',
              in_progress: '#06b6d4', completed: '#22c55e', on_hold: '#6b7280'
            };
            const color = statusColors[p.status] || '#6b7280';
            return `
              <div style="padding: 10px 0; border-bottom: 1px solid #e2e8f0;">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
                  <div style="font-weight: 600; color: #1e293b; font-size: 14px;">${sanitizeString(p.name, 40)}</div>
                  <span style="font-size: 11px; padding: 3px 8px; border-radius: 4px; background: ${color}20; color: ${color};">${p.status}</span>
                </div>
                <div style="background: #e2e8f0; height: 6px; border-radius: 3px; overflow: hidden;">
                  <div style="width: ${progress}%; height: 100%; background: ${progress >= 100 ? '#22c55e' : '#8b5cf6'}; border-radius: 3px;"></div>
                </div>
                <div style="font-size: 11px; color: #64748b; margin-top: 4px;">${sanitizeString(p.customer_name || '', 30)} • ${progress}% complete</div>
              </div>
            `;
          }).join('')}
        </div>
      `;
    }

    // CTA Button
    const dashboardUrl = process.env.DASHBOARD_URL || 'https://www.surprisegranite.com/account/';
    digestContent += `
      <div style="text-align: center; margin-top: 30px;">
        <a href="${dashboardUrl}" style="display: inline-block; background: linear-gradient(135deg, #1a1a2e 0%, #2d2d44 100%); color: #f9cb00; padding: 14px 32px; border-radius: 8px; text-decoration: none; font-weight: 600; font-size: 14px;">
          Open Dashboard
        </a>
      </div>
    `;

    // Wrap in email template
    const html = emailService.wrapEmailTemplate(digestContent, {
      headerText: 'Daily Digest',
      headerColor: '#1a1a2e',
      accentColor: '#f9cb00'
    });

    // Send the email
    await transporter.sendMail({
      from: `"${COMPANY.name}" <${SMTP_USER}>`,
      to: email,
      subject: `Your Daily Digest - ${todayFormatted}`,
      html
    });

    logger.info('Daily digest sent', { userId: user_id.substring(0, 8) + '...', leadsCount: leads.length, eventsCount: events.length });

    res.json({
      success: true,
      message: 'Daily digest sent',
      stats: {
        leads: leads.length,
        todayEvents: todayEvents.length,
        tomorrowEvents: tomorrowEvents.length,
        tasks: tasks.length,
        projects: projects.length
      }
    });

  } catch (err) {
    logger.apiError(err, { context: 'Daily digest failed' });
    res.status(500).json({ error: 'Failed to send daily digest: ' + err.message });
  }
}));

/**
 * Subscribe/unsubscribe from daily digest
 * POST /api/email/digest-preferences
 */
router.post('/digest-preferences', asyncHandler(async (req, res) => {
  const { user_id, enabled, send_time } = req.body;

  if (!user_id) {
    return res.status(400).json({ error: 'User ID required' });
  }

  // Import Supabase client
  const { createClient } = require('@supabase/supabase-js');
  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  try {
    // Check if preferences exist
    const { data: existing } = await supabase
      .from('user_preferences')
      .select('*')
      .eq('user_id', user_id)
      .single();

    const preferences = {
      daily_digest_enabled: enabled !== undefined ? enabled : true,
      daily_digest_time: send_time || '07:00'
    };

    if (existing) {
      await supabase
        .from('user_preferences')
        .update(preferences)
        .eq('user_id', user_id);
    } else {
      await supabase
        .from('user_preferences')
        .insert({ user_id, ...preferences });
    }

    res.json({ success: true, preferences });

  } catch (err) {
    logger.apiError(err, { context: 'Digest preferences update failed' });
    res.status(500).json({ error: 'Failed to update preferences' });
  }
}));

/**
 * Send workflow invite emails
 * POST /api/email/workflow-invite
 * Sends calendar invite emails to participants for scheduled project events
 */
router.post('/workflow-invite', asyncHandler(async (req, res) => {
  const { to, subject, customerName, projectAddress, events, role } = req.body;

  if (!to || !isValidEmail(to)) {
    return res.status(400).json({ error: 'Valid email address required' });
  }

  if (!events || !Array.isArray(events) || events.length === 0) {
    return res.status(400).json({ error: 'Events array required' });
  }

  try {
    const isCustomer = role === 'customer';
    const greeting = isCustomer
      ? `Great news! Your project has been scheduled.`
      : `You've been assigned to a project.`;

    // Build events HTML
    const eventsHtml = events.map(evt => `
      <div style="background: #f8fafc; border-radius: 10px; padding: 16px; margin-bottom: 12px; border-left: 4px solid #6366f1;">
        <div style="display: flex; align-items: center; gap: 12px;">
          <div style="font-size: 28px;">${evt.icon || '📅'}</div>
          <div style="flex: 1;">
            <div style="font-weight: 600; font-size: 16px; color: #1e293b; margin-bottom: 4px;">${sanitizeString(evt.type)}</div>
            <div style="font-size: 14px; color: #64748b;">
              <span style="margin-right: 16px;">📅 ${sanitizeString(evt.date)}</span>
              <span>🕐 ${sanitizeString(evt.time)}</span>
            </div>
            ${evt.location ? `<div style="font-size: 13px; color: #94a3b8; margin-top: 4px;">📍 ${sanitizeString(evt.location)}</div>` : ''}
          </div>
        </div>
      </div>
    `).join('');

    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
      </head>
      <body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f1f5f9;">
        <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
          <!-- Header -->
          <div style="background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%); border-radius: 16px 16px 0 0; padding: 32px; text-align: center;">
            <div style="font-size: 48px; margin-bottom: 16px;">📅</div>
            <h1 style="margin: 0; color: #ffffff; font-size: 24px; font-weight: 600;">Project Schedule Confirmed</h1>
            <p style="margin: 8px 0 0; color: rgba(255,255,255,0.9); font-size: 14px;">${greeting}</p>
          </div>

          <!-- Content -->
          <div style="background: #ffffff; padding: 32px; border-radius: 0 0 16px 16px; box-shadow: 0 4px 6px rgba(0,0,0,0.05);">
            <p style="margin: 0 0 8px; color: #1e293b; font-size: 15px;">Hi ${sanitizeString(customerName || 'there')},</p>
            <p style="margin: 0 0 24px; color: #64748b; font-size: 14px; line-height: 1.6;">
              ${isCustomer
                ? 'Here are your upcoming appointments. Please make sure someone is available at the scheduled times.'
                : 'You have been scheduled for the following appointments. Please confirm your availability.'}
            </p>

            ${projectAddress ? `
              <div style="background: #f8fafc; border-radius: 8px; padding: 12px 16px; margin-bottom: 20px;">
                <div style="font-size: 12px; color: #94a3b8; margin-bottom: 4px;">PROJECT ADDRESS</div>
                <div style="font-size: 14px; color: #1e293b; font-weight: 500;">📍 ${sanitizeString(projectAddress)}</div>
              </div>
            ` : ''}

            <h3 style="margin: 0 0 16px; color: #1e293b; font-size: 16px; font-weight: 600;">Scheduled Events</h3>
            ${eventsHtml}

            <div style="margin-top: 28px; padding-top: 20px; border-top: 1px solid #e2e8f0;">
              <p style="margin: 0; color: #64748b; font-size: 13px; line-height: 1.6;">
                ${isCustomer
                  ? 'If you need to reschedule, please contact us as soon as possible.'
                  : 'Please contact the office if you have any scheduling conflicts.'}
              </p>
            </div>

            <!-- CTA Button -->
            <div style="text-align: center; margin-top: 24px;">
              <a href="${isCustomer ? 'tel:' + (COMPANY.phone || '') : 'mailto:' + (COMPANY.email || '')}" style="display: inline-block; background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%); color: #ffffff; text-decoration: none; padding: 14px 32px; border-radius: 8px; font-weight: 600; font-size: 14px;">
                ${isCustomer ? 'Call Us' : 'Contact Office'}
              </a>
            </div>
          </div>

          <!-- Footer -->
          <div style="text-align: center; padding: 24px; color: #94a3b8; font-size: 12px;">
            <p style="margin: 0 0 8px;">${COMPANY.name || 'Surprise Granite'}</p>
            <p style="margin: 0 0 8px;">${COMPANY.phone || '(602) 833-3189'} | ${COMPANY.email || 'info@surprisegranite.com'}</p>
            <p style="margin: 0; font-size: 10px; color: #64748b;">Powered by Remodely.ai</p>
          </div>
        </div>
      </body>
      </html>
    `;

    await transporter.sendMail({
      from: `"${COMPANY.name}" <${SMTP_USER}>`,
      to,
      subject: subject || `📅 Project Schedule - ${events.length} Event${events.length > 1 ? 's' : ''} Confirmed`,
      html
    });

    logger.emailSent('workflow-invite', true, { to: to.substring(0, 3) + '***', eventCount: events.length });
    res.json({ success: true, message: 'Workflow invite sent' });

  } catch (err) {
    logger.apiError(err, { context: 'Workflow invite email failed' });
    res.status(500).json({ error: 'Failed to send invite: ' + err.message });
  }
}));

module.exports = router;
