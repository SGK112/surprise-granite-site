/**
 * Portal Routes
 * Customer portal token management and access
 */

const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const logger = require('../utils/logger');
const { handleApiError, isValidEmail, sanitizeString } = require('../utils/security');
const { asyncHandler } = require('../middleware/errorHandler');
const emailService = require('../services/emailService');
const { publicRateLimiter } = require('../middleware/rateLimiter');
const { authenticateJWT } = require('../lib/auth/middleware');

// Rate limiter for public portal access
const portalAccessLimiter = publicRateLimiter({
  maxRequests: 30,
  windowMs: 60000,
  message: 'Too many portal requests. Please wait a moment.'
});

// Stricter rate limiter for PIN attempts (prevent brute force)
const pinAttemptLimiter = publicRateLimiter({
  maxRequests: 5,
  windowMs: 300000, // 5 minutes
  message: 'Too many PIN attempts. Please wait 5 minutes before trying again.'
});

// In-memory PIN attempt tracking (for additional protection)
const pinAttempts = new Map();

/**
 * Hash a PIN for secure storage/comparison
 */
function hashPin(pin, salt = null) {
  if (!pin) return null;
  const useSalt = salt || crypto.randomBytes(16).toString('hex');
  const hash = crypto.pbkdf2Sync(pin.toString(), useSalt, 10000, 32, 'sha256').toString('hex');
  return { hash, salt: useSalt };
}

/**
 * Verify a PIN against a stored hash
 */
function verifyPin(pin, storedHash, salt) {
  if (!pin || !storedHash || !salt) return false;
  const { hash } = hashPin(pin, salt);
  return hash === storedHash;
}

/**
 * Check if token is locked due to too many PIN attempts
 */
function isTokenLocked(tokenId) {
  const attempts = pinAttempts.get(tokenId);
  if (!attempts) return false;
  // Lock for 15 minutes after 5 failed attempts
  if (attempts.count >= 5 && Date.now() - attempts.lastAttempt < 15 * 60 * 1000) {
    return true;
  }
  // Reset if lockout period passed
  if (Date.now() - attempts.lastAttempt >= 15 * 60 * 1000) {
    pinAttempts.delete(tokenId);
  }
  return false;
}

/**
 * Record a failed PIN attempt
 */
function recordFailedPinAttempt(tokenId) {
  const attempts = pinAttempts.get(tokenId) || { count: 0, lastAttempt: 0 };
  attempts.count++;
  attempts.lastAttempt = Date.now();
  pinAttempts.set(tokenId, attempts);
  return attempts.count;
}

/**
 * Clear PIN attempts on successful auth
 */
function clearPinAttempts(tokenId) {
  pinAttempts.delete(tokenId);
}

/**
 * Validate portal token and get customer data
 * POST /api/portal/access
 * Public endpoint - used by portal page
 */
router.post('/access', portalAccessLimiter, asyncHandler(async (req, res) => {
  const supabase = req.app.get('supabase');
  if (!supabase) {
    return res.status(500).json({ error: 'Database not configured' });
  }

  const { token, pin } = req.body;

  if (!token) {
    return res.status(400).json({ error: 'Token is required' });
  }

  // Get token record
  const { data: tokenRecord, error: tokenError } = await supabase
    .from('portal_tokens')
    .select('*')
    .eq('token', token)
    .eq('is_active', true)
    .single();

  if (tokenError || !tokenRecord) {
    logger.warn('Invalid portal token attempt', { token: token.substring(0, 8) + '...' });
    return res.status(404).json({ error: 'Invalid or expired portal link' });
  }

  // Check expiration
  if (tokenRecord.expires_at && new Date(tokenRecord.expires_at) < new Date()) {
    return res.status(410).json({ error: 'This portal link has expired' });
  }

  // Check if token is locked due to too many failed PIN attempts
  if (isTokenLocked(tokenRecord.id)) {
    logger.warn('Portal access blocked - too many PIN attempts', { tokenId: tokenRecord.id });
    return res.status(429).json({
      error: 'Too many failed PIN attempts. Please wait 15 minutes.',
      locked: true
    });
  }

  // Check PIN if required
  if (tokenRecord.pin_code) {
    // Support both legacy plain text and new hashed PINs
    const pinValid = tokenRecord.pin_salt
      ? verifyPin(pin, tokenRecord.pin_code, tokenRecord.pin_salt)
      : tokenRecord.pin_code === pin;

    if (!pinValid) {
      const attemptCount = recordFailedPinAttempt(tokenRecord.id);
      const remainingAttempts = Math.max(0, 5 - attemptCount);
      logger.warn('Invalid PIN attempt', { tokenId: tokenRecord.id, attemptCount });
      return res.status(401).json({
        error: remainingAttempts > 0
          ? `Invalid PIN. ${remainingAttempts} attempts remaining.`
          : 'Invalid PIN. Account locked for 15 minutes.',
        requires_pin: true,
        attempts_remaining: remainingAttempts
      });
    }
    // Clear attempts on successful PIN entry
    clearPinAttempts(tokenRecord.id);
  }

  // Update access tracking
  await supabase
    .from('portal_tokens')
    .update({
      last_accessed_at: new Date().toISOString(),
      access_count: (tokenRecord.access_count || 0) + 1
    })
    .eq('id', tokenRecord.id);

  // Get related data based on token type
  let customerData = null;
  let leadData = null;

  if (tokenRecord.customer_id) {
    const { data: customer } = await supabase
      .from('customers')
      .select('*')
      .eq('id', tokenRecord.customer_id)
      .single();
    customerData = customer;
  }

  if (tokenRecord.lead_id) {
    const { data: lead } = await supabase
      .from('leads')
      .select('*')
      .eq('id', tokenRecord.lead_id)
      .single();
    leadData = lead;
  }

  // Log portal access
  try {
    await supabase
      .from('portal_activity')
      .insert({
        portal_token_id: tokenRecord.id,
        activity_type: 'portal_viewed',
        ip_address: req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.ip,
        user_agent: req.headers['user-agent']
      });
  } catch (e) {
    // Don't fail if activity logging fails
    logger.warn('Failed to log portal activity', { error: e.message });
  }

  res.json({
    success: true,
    data: {
      token_id: tokenRecord.id,
      permissions: tokenRecord.permissions,
      customer: customerData,
      lead: leadData,
      owner_id: tokenRecord.owner_id
    }
  });
}));

/**
 * Get estimates for portal customer
 * POST /api/portal/estimates
 */
router.post('/estimates', portalAccessLimiter, asyncHandler(async (req, res) => {
  const supabase = req.app.get('supabase');
  if (!supabase) {
    return res.status(500).json({ error: 'Database not configured' });
  }

  const { token_id, customer_id, lead_id } = req.body;

  if (!token_id) {
    return res.status(400).json({ error: 'Token ID required' });
  }

  // Verify token is valid
  const { data: tokenRecord } = await supabase
    .from('portal_tokens')
    .select('permissions')
    .eq('id', token_id)
    .eq('is_active', true)
    .single();

  if (!tokenRecord) {
    return res.status(401).json({ error: 'Invalid session' });
  }

  if (!tokenRecord.permissions?.view_estimates) {
    return res.status(403).json({ error: 'No permission to view estimates' });
  }

  // Get estimates for the customer
  let query = supabase.from('estimates').select('*');

  if (customer_id) {
    query = query.eq('customer_id', customer_id);
  } else if (lead_id) {
    query = query.eq('lead_id', lead_id);
  } else {
    return res.status(400).json({ error: 'Customer or lead ID required' });
  }

  const { data: estimates, error } = await query.order('created_at', { ascending: false });

  if (error) {
    return handleApiError(res, error, 'Get portal estimates');
  }

  res.json({ success: true, data: estimates || [] });
}));

/**
 * Get invoices for portal customer
 * POST /api/portal/invoices
 */
router.post('/invoices', portalAccessLimiter, asyncHandler(async (req, res) => {
  const supabase = req.app.get('supabase');
  if (!supabase) {
    return res.status(500).json({ error: 'Database not configured' });
  }

  const { token_id, customer_id } = req.body;

  if (!token_id || !customer_id) {
    return res.status(400).json({ error: 'Token ID and customer ID required' });
  }

  // Verify token
  const { data: tokenRecord } = await supabase
    .from('portal_tokens')
    .select('permissions')
    .eq('id', token_id)
    .eq('is_active', true)
    .single();

  if (!tokenRecord?.permissions?.view_invoices) {
    return res.status(403).json({ error: 'No permission to view invoices' });
  }

  const { data: invoices, error } = await supabase
    .from('invoices')
    .select('*')
    .eq('customer_id', customer_id)
    .order('created_at', { ascending: false });

  if (error) {
    return handleApiError(res, error, 'Get portal invoices');
  }

  res.json({ success: true, data: invoices || [] });
}));

/**
 * Get appointments for portal customer
 * POST /api/portal/appointments
 */
router.post('/appointments', portalAccessLimiter, asyncHandler(async (req, res) => {
  const supabase = req.app.get('supabase');
  if (!supabase) {
    return res.status(500).json({ error: 'Database not configured' });
  }

  const { token_id, customer_id, lead_id } = req.body;

  if (!token_id) {
    return res.status(400).json({ error: 'Token ID required' });
  }

  // Verify token
  const { data: tokenRecord } = await supabase
    .from('portal_tokens')
    .select('permissions')
    .eq('id', token_id)
    .eq('is_active', true)
    .single();

  if (!tokenRecord?.permissions?.view_appointments) {
    return res.status(403).json({ error: 'No permission to view appointments' });
  }

  // Get appointments - check both leads and customers tables
  let appointments = [];

  if (lead_id) {
    // Check if lead has appointment data
    const { data: lead } = await supabase
      .from('leads')
      .select('appointment_date, appointment_time, appointment_status, project_address')
      .eq('id', lead_id)
      .single();

    if (lead?.appointment_date) {
      appointments.push({
        id: lead_id,
        date: lead.appointment_date,
        time: lead.appointment_time,
        status: lead.appointment_status || 'scheduled',
        type: 'Consultation',
        address: lead.project_address
      });
    }
  }

  if (customer_id) {
    // Get jobs/appointments for customer
    const { data: jobs } = await supabase
      .from('jobs')
      .select('id, install_date, status, project_description')
      .eq('customer_id', customer_id)
      .order('install_date', { ascending: true });

    if (jobs) {
      jobs.forEach(job => {
        if (job.install_date) {
          appointments.push({
            id: job.id,
            date: job.install_date,
            status: job.status,
            type: 'Installation',
            description: job.project_description
          });
        }
      });
    }
  }

  res.json({ success: true, data: appointments });
}));

/**
 * Upload photo from portal
 * POST /api/portal/photos
 */
router.post('/photos', portalAccessLimiter, asyncHandler(async (req, res) => {
  const supabase = req.app.get('supabase');
  if (!supabase) {
    return res.status(500).json({ error: 'Database not configured' });
  }

  const { token_id, lead_id, customer_id, photo_url, caption } = req.body;

  if (!token_id) {
    return res.status(400).json({ error: 'Token ID required' });
  }

  // Verify token
  const { data: tokenRecord } = await supabase
    .from('portal_tokens')
    .select('permissions, owner_id')
    .eq('id', token_id)
    .eq('is_active', true)
    .single();

  if (!tokenRecord?.permissions?.upload_photos) {
    return res.status(403).json({ error: 'No permission to upload photos' });
  }

  if (!photo_url) {
    return res.status(400).json({ error: 'Photo URL required' });
  }

  // Store photo reference (assuming photos are uploaded to Supabase storage first)
  const photoData = {
    url: photo_url,
    caption: sanitizeString(caption, 500),
    uploaded_via: 'portal',
    uploaded_at: new Date().toISOString()
  };

  // Add to lead or customer record
  if (lead_id) {
    const { data: lead } = await supabase
      .from('leads')
      .select('photos')
      .eq('id', lead_id)
      .single();

    const photos = lead?.photos || [];
    photos.push(photoData);

    await supabase
      .from('leads')
      .update({ photos })
      .eq('id', lead_id);
  }

  // Log activity
  await supabase
    .from('portal_activity')
    .insert({
      portal_token_id: token_id,
      activity_type: 'photo_uploaded',
      details: { photo_url, caption }
    });

  // Notify business owner
  try {
    await emailService.sendAdminNotification(
      'New Photo Uploaded via Portal',
      `<p>A customer has uploaded a new photo via their portal.</p><img src="${photo_url}" style="max-width: 400px;" />`
    );
  } catch (e) {
    logger.warn('Failed to send photo upload notification', { error: e.message });
  }

  res.json({ success: true, message: 'Photo uploaded successfully' });
}));

/**
 * Send message from portal
 * POST /api/portal/messages
 */
router.post('/messages', portalAccessLimiter, asyncHandler(async (req, res) => {
  const supabase = req.app.get('supabase');
  if (!supabase) {
    return res.status(500).json({ error: 'Database not configured' });
  }

  const { token_id, message, lead_id, customer_id } = req.body;

  if (!token_id || !message) {
    return res.status(400).json({ error: 'Token ID and message required' });
  }

  // Verify token
  const { data: tokenRecord } = await supabase
    .from('portal_tokens')
    .select('permissions, owner_id, email')
    .eq('id', token_id)
    .eq('is_active', true)
    .single();

  if (!tokenRecord?.permissions?.send_messages) {
    return res.status(403).json({ error: 'No permission to send messages' });
  }

  // Get customer/lead name
  let senderName = 'Portal User';
  let senderEmail = tokenRecord.email;

  if (lead_id) {
    const { data: lead } = await supabase
      .from('leads')
      .select('homeowner_name, homeowner_email')
      .eq('id', lead_id)
      .single();
    if (lead) {
      senderName = lead.homeowner_name;
      senderEmail = lead.homeowner_email;
    }
  } else if (customer_id) {
    const { data: customer } = await supabase
      .from('customers')
      .select('name, email')
      .eq('id', customer_id)
      .single();
    if (customer) {
      senderName = customer.name;
      senderEmail = customer.email;
    }
  }

  // Store message
  const { data: savedMessage, error } = await supabase
    .from('customer_messages')
    .insert({
      lead_id,
      customer_id,
      sender_type: 'customer',
      message: sanitizeString(message, 5000),
      channel: 'portal',
      owner_id: tokenRecord.owner_id
    })
    .select()
    .single();

  if (error) {
    return handleApiError(res, error, 'Save portal message');
  }

  // Log activity
  await supabase
    .from('portal_activity')
    .insert({
      portal_token_id: token_id,
      activity_type: 'message_sent',
      details: { message_preview: message.substring(0, 100) }
    });

  // Notify business owner
  try {
    const emailContent = `
      <h3>New Message from ${senderName}</h3>
      <p style="background: #f5f5f5; padding: 15px; border-radius: 8px;">${sanitizeString(message, 2000)}</p>
      <p><strong>From:</strong> ${senderName} (${senderEmail || 'No email'})</p>
      <p><a href="https://www.surprisegranite.com/account#messages">View in Dashboard</a></p>
    `;
    await emailService.sendAdminNotification(
      `Portal Message from ${senderName}`,
      emailContent
    );
  } catch (e) {
    logger.warn('Failed to send message notification', { error: e.message });
  }

  res.json({ success: true, data: savedMessage });
}));

/**
 * Approve estimate from portal
 * POST /api/portal/estimates/:id/approve
 */
router.post('/estimates/:id/approve', portalAccessLimiter, asyncHandler(async (req, res) => {
  const supabase = req.app.get('supabase');
  if (!supabase) {
    return res.status(500).json({ error: 'Database not configured' });
  }

  const { id } = req.params;
  const { token_id, signature_data } = req.body;

  if (!token_id) {
    return res.status(400).json({ error: 'Token ID required' });
  }

  // Verify token
  const { data: tokenRecord } = await supabase
    .from('portal_tokens')
    .select('permissions, owner_id')
    .eq('id', token_id)
    .eq('is_active', true)
    .single();

  if (!tokenRecord?.permissions?.approve_estimates) {
    return res.status(403).json({ error: 'No permission to approve estimates' });
  }

  // Update estimate status
  const { data: estimate, error } = await supabase
    .from('estimates')
    .update({
      status: 'approved',
      approved_at: new Date().toISOString(),
      signature_data,
      approved_via: 'portal'
    })
    .eq('id', id)
    .select()
    .single();

  if (error) {
    return handleApiError(res, error, 'Approve estimate');
  }

  // Log activity
  await supabase
    .from('portal_activity')
    .insert({
      portal_token_id: token_id,
      activity_type: 'estimate_approved',
      related_type: 'estimate',
      related_id: id
    });

  // Notify business owner
  try {
    const approvalEmail = emailService.generateEstimateApprovedEmail(estimate);
    await emailService.sendAdminNotification(approvalEmail.subject, approvalEmail.html);
  } catch (e) {
    logger.warn('Failed to send estimate approval notification', { error: e.message });
  }

  logger.info('Estimate approved via portal', { estimateId: id });

  res.json({ success: true, data: estimate });
}));

/**
 * Log portal activity
 * POST /api/portal/activity
 */
router.post('/activity', portalAccessLimiter, asyncHandler(async (req, res) => {
  const supabase = req.app.get('supabase');
  if (!supabase) {
    return res.status(500).json({ error: 'Database not configured' });
  }

  const { token_id, activity_type, related_type, related_id, details } = req.body;

  if (!token_id || !activity_type) {
    return res.status(400).json({ error: 'Token ID and activity type required' });
  }

  const { error } = await supabase
    .from('portal_activity')
    .insert({
      portal_token_id: token_id,
      activity_type,
      related_type,
      related_id,
      details: details || {},
      ip_address: req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.ip,
      user_agent: req.headers['user-agent']
    });

  if (error) {
    return handleApiError(res, error, 'Log portal activity');
  }

  res.json({ success: true });
}));

// ============================================================
// PORTAL TOKEN MANAGEMENT (Authenticated endpoints)
// ============================================================

/**
 * Create portal token for a lead/customer
 * POST /api/portal/tokens
 * Requires JWT authentication
 */
router.post('/tokens', authenticateJWT, asyncHandler(async (req, res) => {
  const supabase = req.app.get('supabase');
  if (!supabase) {
    return res.status(500).json({ error: 'Database not configured' });
  }

  // User is authenticated via JWT middleware
  const userId = req.user?.id;
  if (!userId) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  const { lead_id, customer_id, email, phone, pin_code, expires_days, permissions } = req.body;

  if (!lead_id && !customer_id) {
    return res.status(400).json({ error: 'Lead ID or customer ID required' });
  }

  // Hash the PIN if provided for secure storage
  let pinHash = null;
  let pinSalt = null;
  if (pin_code) {
    const hashed = hashPin(pin_code);
    pinHash = hashed.hash;
    pinSalt = hashed.salt;
  }

  // Build token data
  const tokenData = {
    lead_id: lead_id || null,
    customer_id: customer_id || null,
    owner_id: userId,
    email,
    phone,
    pin_code: pinHash,
    pin_salt: pinSalt,
    expires_at: expires_days ? new Date(Date.now() + expires_days * 24 * 60 * 60 * 1000).toISOString() : null,
    permissions: permissions || {
      view_project: true,
      view_estimates: true,
      approve_estimates: true,
      view_invoices: true,
      pay_invoices: true,
      upload_photos: true,
      send_messages: true,
      view_appointments: true
    }
  };

  const { data: token, error } = await supabase
    .from('portal_tokens')
    .insert([tokenData])
    .select()
    .single();

  if (error) {
    return handleApiError(res, error, 'Create portal token');
  }

  // Generate portal URL
  const portalUrl = `https://www.surprisegranite.com/portal/?token=${token.token}`;

  logger.info('Portal token created', { tokenId: token.id, leadId: lead_id, customerId: customer_id });

  res.json({
    success: true,
    data: {
      ...token,
      portal_url: portalUrl
    }
  });
}));

/**
 * Send portal invite email
 * POST /api/portal/tokens/:id/send
 * Requires JWT authentication
 */
router.post('/tokens/:id/send', authenticateJWT, asyncHandler(async (req, res) => {
  const supabase = req.app.get('supabase');
  if (!supabase) {
    return res.status(500).json({ error: 'Database not configured' });
  }

  const userId = req.user?.id;
  if (!userId) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  const { id } = req.params;
  const { include_appointment = true } = req.body;

  // Get token with related data
  const { data: token, error: tokenError } = await supabase
    .from('portal_tokens')
    .select('*')
    .eq('id', id)
    .eq('owner_id', userId)
    .single();

  if (tokenError || !token) {
    return res.status(404).json({ error: 'Token not found' });
  }

  // Get customer/lead info
  let recipientName = 'Valued Customer';
  let recipientEmail = token.email;
  let appointmentInfo = null;

  if (token.lead_id) {
    const { data: lead } = await supabase
      .from('leads')
      .select('*')
      .eq('id', token.lead_id)
      .single();
    if (lead) {
      recipientName = lead.homeowner_name;
      recipientEmail = recipientEmail || lead.homeowner_email;
      if (include_appointment && lead.appointment_date) {
        appointmentInfo = {
          date: lead.appointment_date,
          time: lead.appointment_time
        };
      }
    }
  } else if (token.customer_id) {
    const { data: customer } = await supabase
      .from('customers')
      .select('*')
      .eq('id', token.customer_id)
      .single();
    if (customer) {
      recipientName = customer.name;
      recipientEmail = recipientEmail || customer.email;
    }
  }

  if (!recipientEmail) {
    return res.status(400).json({ error: 'No email address available' });
  }

  // Generate and send email
  const portalUrl = `https://www.surprisegranite.com/portal/?token=${token.token}`;
  const welcomeEmail = emailService.generatePortalWelcomeEmail({
    name: recipientName,
    portal_url: portalUrl,
    appointment: appointmentInfo,
    pin_code: token.pin_code
  });

  const result = await emailService.sendNotification(recipientEmail, welcomeEmail.subject, welcomeEmail.html);

  if (!result.success) {
    return res.status(500).json({ error: 'Failed to send email', reason: result.reason });
  }

  logger.info('Portal invite sent', { tokenId: id, email: recipientEmail.substring(0, 3) + '***' });

  res.json({ success: true, message: 'Portal invite sent successfully' });
}));

/**
 * Get tokens for current user
 * GET /api/portal/tokens
 * Requires JWT authentication
 */
router.get('/tokens', authenticateJWT, asyncHandler(async (req, res) => {
  const supabase = req.app.get('supabase');
  if (!supabase) {
    return res.status(500).json({ error: 'Database not configured' });
  }

  const userId = req.user?.id;
  if (!userId) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  const { data: tokens, error } = await supabase
    .from('portal_tokens')
    .select(`
      *,
      leads:lead_id (id, homeowner_name, homeowner_email),
      customers:customer_id (id, name, email)
    `)
    .eq('owner_id', userId)
    .order('created_at', { ascending: false });

  if (error) {
    return handleApiError(res, error, 'Get portal tokens');
  }

  res.json({ success: true, data: tokens });
}));

/**
 * Deactivate a portal token
 * DELETE /api/portal/tokens/:id
 * Requires JWT authentication
 */
router.delete('/tokens/:id', authenticateJWT, asyncHandler(async (req, res) => {
  const supabase = req.app.get('supabase');
  if (!supabase) {
    return res.status(500).json({ error: 'Database not configured' });
  }

  const userId = req.user?.id;
  if (!userId) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  const { id } = req.params;

  const { error } = await supabase
    .from('portal_tokens')
    .update({ is_active: false })
    .eq('id', id)
    .eq('owner_id', userId);

  if (error) {
    return handleApiError(res, error, 'Deactivate portal token');
  }

  logger.info('Portal token deactivated', { tokenId: id });

  res.json({ success: true, message: 'Token deactivated' });
}));

module.exports = router;
