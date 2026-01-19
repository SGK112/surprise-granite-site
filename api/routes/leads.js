/**
 * Lead Routes
 * Handles lead capture, management, and assignment
 */

const express = require('express');
const router = express.Router();
const logger = require('../utils/logger');
const { handleApiError, isValidEmail, isValidPhone, sanitizeString } = require('../utils/security');
const { leadRateLimiter } = require('../middleware/rateLimiter');
const { asyncHandler } = require('../middleware/errorHandler');
const emailService = require('../services/emailService');

/**
 * Submit a new lead
 * POST /api/leads
 */
router.post('/', leadRateLimiter, asyncHandler(async (req, res) => {
  const supabase = req.app.get('supabase');

  const {
    homeowner_name,
    homeowner_email,
    homeowner_phone,
    project_type,
    project_budget,
    project_timeline,
    project_zip,
    project_details,
    source = 'website',
    appointment_date,
    appointment_time,
    project_address,
    message
  } = req.body;

  // Input validation
  if (!homeowner_name || !homeowner_email || !project_zip) {
    return res.status(400).json({
      error: 'Name, email, and ZIP code are required'
    });
  }

  if (!isValidEmail(homeowner_email)) {
    return res.status(400).json({ error: 'Invalid email format' });
  }

  if (homeowner_phone && !isValidPhone(homeowner_phone)) {
    return res.status(400).json({ error: 'Invalid phone format' });
  }

  // Calculate lead price based on project type
  let lead_price = 15;
  if (project_type === 'kitchen_countertops' || project_type === 'full_remodel') {
    lead_price = 25;
  } else if (project_type === 'bathroom_countertops') {
    lead_price = 20;
  }

  const isAppointment = !!(appointment_date && appointment_time);

  // Build lead data
  const leadData = {
    homeowner_name: sanitizeString(homeowner_name, 200),
    homeowner_email: homeowner_email.toLowerCase().trim(),
    homeowner_phone: homeowner_phone || null,
    project_type: sanitizeString(project_type, 100),
    project_budget: sanitizeString(project_budget, 50),
    project_timeline: sanitizeString(project_timeline, 100),
    project_zip: sanitizeString(project_zip, 20),
    project_details: sanitizeString(project_details, 2000),
    project_address: sanitizeString(project_address, 500),
    source: sanitizeString(source, 50),
    lead_price,
    status: 'new',
    expires_at: new Date(Date.now() + 72 * 60 * 60 * 1000).toISOString(),
    ...(isAppointment && {
      appointment_date,
      appointment_time,
      appointment_status: 'scheduled'
    })
  };

  logger.info('New lead received', { source, project_type, isAppointment });

  // Store in database if available
  if (supabase) {
    try {
      const { data: lead, error } = await supabase
        .from('leads')
        .insert([leadData])
        .select()
        .single();

      if (error) {
        logger.apiError(error, { context: 'Lead insert' });
      }
    } catch (dbErr) {
      logger.apiError(dbErr, { context: 'Lead database error' });
    }
  }

  // Send admin notification
  try {
    const adminEmail = emailService.generateLeadNotificationEmail({
      name: homeowner_name,
      email: homeowner_email,
      phone: homeowner_phone,
      project_type,
      source,
      message: project_details || message
    });
    await emailService.sendAdminNotification(adminEmail.subject, adminEmail.html);
  } catch (emailErr) {
    logger.apiError(emailErr, { context: 'Admin notification failed' });
  }

  // Send customer confirmation
  if (homeowner_email) {
    try {
      const customerEmail = emailService.generateCustomerConfirmationEmail({
        name: homeowner_name
      });
      await emailService.sendNotification(homeowner_email, customerEmail.subject, customerEmail.html);
    } catch (emailErr) {
      logger.apiError(emailErr, { context: 'Customer email failed' });
    }
  }

  res.json({
    success: true,
    message: isAppointment
      ? 'Appointment booked successfully! Check your email for confirmation.'
      : 'Lead submitted successfully! Check your email for confirmation.',
    lead_id: `lead_${Date.now()}`
  });
}));

/**
 * Get leads with filters
 * GET /api/leads
 */
router.get('/', asyncHandler(async (req, res) => {
  const supabase = req.app.get('supabase');
  if (!supabase) {
    return res.status(500).json({ error: 'Database not configured' });
  }

  const { status, limit = 50, offset = 0 } = req.query;

  let query = supabase
    .from('leads')
    .select('*', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (status) {
    query = query.eq('status', status);
  }

  const { data: leads, error, count } = await query;

  if (error) {
    return handleApiError(res, error, 'Get leads');
  }

  res.json({
    success: true,
    data: leads,
    pagination: {
      total: count,
      limit: parseInt(limit),
      offset: parseInt(offset)
    }
  });
}));

/**
 * Get single lead by ID
 * GET /api/leads/:id
 */
router.get('/:id', asyncHandler(async (req, res) => {
  const supabase = req.app.get('supabase');
  if (!supabase) {
    return res.status(500).json({ error: 'Database not configured' });
  }

  const { id } = req.params;

  const { data: lead, error } = await supabase
    .from('leads')
    .select('*')
    .eq('id', id)
    .single();

  if (error) {
    return handleApiError(res, error, 'Get lead');
  }

  res.json({ success: true, data: lead });
}));

/**
 * Update lead status
 * PATCH /api/leads/:id/status
 */
router.patch('/:id/status', asyncHandler(async (req, res) => {
  const supabase = req.app.get('supabase');
  if (!supabase) {
    return res.status(500).json({ error: 'Database not configured' });
  }

  const { id } = req.params;
  const { status } = req.body;

  const validStatuses = ['new', 'contacted', 'qualified', 'converted', 'lost'];
  if (!validStatuses.includes(status)) {
    return res.status(400).json({
      error: `Invalid status. Must be one of: ${validStatuses.join(', ')}`
    });
  }

  const { data: lead, error } = await supabase
    .from('leads')
    .update({ status, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single();

  if (error) {
    return handleApiError(res, error, 'Update lead status');
  }

  logger.info('Lead status updated', { leadId: id, status });

  res.json({ success: true, data: lead });
}));

module.exports = router;
