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
const notificationService = require('../services/notificationService');

/**
 * Arizona timezone offset (MST, no DST)
 */
const ARIZONA_TIMEZONE_OFFSET = '-07:00';

/**
 * Convert 12-hour time format to 24-hour format
 * @param {string} time12h - Time in format "10:00 AM" or "2:30 PM"
 * @returns {string} Time in format "10:00:00" or "14:30:00"
 */
function convertTo24Hour(time12h) {
  if (!time12h) return '09:00:00';

  const [time, modifier] = time12h.split(' ');
  let [hours, minutes] = time.split(':');

  hours = parseInt(hours, 10);
  minutes = minutes || '00';

  if (modifier?.toUpperCase() === 'PM' && hours !== 12) {
    hours += 12;
  } else if (modifier?.toUpperCase() === 'AM' && hours === 12) {
    hours = 0;
  }

  return `${hours.toString().padStart(2, '0')}:${minutes}:00`;
}

/**
 * Upload images for a lead submission
 * POST /api/leads/upload-images
 * Accepts multipart form data with up to 5 images
 * Returns array of public URLs stored in Supabase Storage
 */
const multer = require('multer');
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024, files: 5 }, // 10MB per file, max 5
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) cb(null, true);
    else cb(new Error('Only image files are allowed'));
  }
});

// Map client-declared mimetype → extension. Extension MUST come from the server,
// not from file.originalname (which is user-controlled and can contain traversal or
// double-extensions like "evil.html;jpg" that trick downstream consumers).
const MIME_TO_EXT = {
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'image/heic': 'heic',
  'image/heif': 'heif'
};

router.post('/upload-images', upload.array('images', 5), asyncHandler(async (req, res) => {
  const supabase = req.app.get('supabase');
  if (!supabase) return res.status(500).json({ error: 'Storage not available' });
  if (!req.files?.length) return res.status(400).json({ error: 'No images uploaded' });

  const urls = [];
  for (const file of req.files) {
    const ext = MIME_TO_EXT[file.mimetype];
    if (!ext) {
      logger.warn('Rejected non-image upload', { mimetype: file.mimetype });
      continue;
    }
    // Allocated filename contains only server-generated characters — no user input.
    const path = `lead-photos/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;

    const { error } = await supabase.storage
      .from('uploads')
      .upload(path, file.buffer, { contentType: file.mimetype, upsert: false });

    if (error) {
      logger.warn('Image upload failed', { path, error: error.message });
      continue;
    }

    const { data: urlData } = supabase.storage.from('uploads').getPublicUrl(path);
    if (urlData?.publicUrl) urls.push(urlData.publicUrl);
  }

  res.json({ success: true, urls, count: urls.length });
}));

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
    message,
    image_urls
  } = req.body;

  // Input validation
  if (!homeowner_name || !homeowner_email) {
    return res.status(400).json({
      error: 'Name and email are required'
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

  // Build lead data - using actual database column names
  const leadData = {
    full_name: sanitizeString(homeowner_name, 200),
    email: homeowner_email.toLowerCase().trim(),
    phone: homeowner_phone || null,
    project_type: sanitizeString(project_type, 100),
    budget: sanitizeString(project_budget, 50),
    timeline: sanitizeString(project_timeline, 100),
    zip_code: sanitizeString(project_zip, 20),
    project_details: sanitizeString(project_details, 2000),
    source: sanitizeString(source, 50),
    status: 'new',
    image_urls: Array.isArray(image_urls) ? image_urls.slice(0, 10) : [],
    raw_data: {
      project_address: sanitizeString(project_address, 500),
      lead_price,
      ...(isAppointment && {
        appointment_date,
        appointment_time,
        appointment_status: 'scheduled'
      })
    }
  };

  logger.info('New lead received', { source, project_type, isAppointment });

  // Store in database if available
  let savedLead = null;
  let portalToken = null;
  let portalUrl = null;

  if (supabase) {
    try {
      // Backend dedup — if a lead with this email was created in the last 10 minutes,
      // MERGE into it instead of inserting a new row. Catches the direct-to-Supabase
      // client path + the fallback path hitting this endpoint, tab-refresh resubmits,
      // and any form that fires both paths in parallel.
      const tenMinAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();
      const { data: recent } = await supabase
        .from('leads')
        .select('*')
        .eq('email', leadData.email)
        .gte('created_at', tenMinAgo)
        .order('created_at', { ascending: false })
        .limit(1);

      if (recent && recent.length > 0) {
        const existing = recent[0];
        // Merge newer non-empty fields into the existing row so nothing is lost.
        const mergedMessage = leadData.project_details && leadData.project_details !== existing.project_details
          ? [existing.project_details, `\n--- (dedup ${new Date().toISOString()})\n`, leadData.project_details].filter(Boolean).join('')
          : existing.project_details;

        const updates = {
          full_name: existing.full_name || leadData.full_name,
          phone: existing.phone || leadData.phone,
          project_type: existing.project_type || leadData.project_type,
          budget: existing.budget || leadData.budget,
          timeline: existing.timeline || leadData.timeline,
          zip_code: existing.zip_code || leadData.zip_code,
          project_details: mergedMessage,
          image_urls: Array.from(new Set([...(existing.image_urls || []), ...(leadData.image_urls || [])])),
          raw_data: {
            ...(existing.raw_data || {}),
            ...(leadData.raw_data || {}),
            _dedup_merged_at: new Date().toISOString()
          },
          updated_at: new Date().toISOString()
        };

        const { data: merged } = await supabase
          .from('leads')
          .update(updates)
          .eq('id', existing.id)
          .select()
          .single();

        logger.info('[Dedup] Merged into existing lead', { leadId: existing.id, email: leadData.email });
        return res.json({
          success: true,
          lead: merged || existing,
          deduped: true,
          message: 'Lead merged with recent submission'
        });
      }

      const { data: lead, error } = await supabase
        .from('leads')
        .insert([leadData])
        .select()
        .single();

      if (error) {
        logger.apiError(error, { context: 'Lead insert' });
      } else {
        savedLead = lead;

        // Push to VoiceNow CRM (fire-and-forget, but time-bounded — Node's fetch has no
        // implicit timeout; without this we leak a promise per lead when the CRM is slow).
        const crmWebhookUrl = process.env.VOICENOW_CRM_URL || 'https://www.voicenowcrm.com';
        const crmCtrl = new AbortController();
        setTimeout(() => crmCtrl.abort(), 10000);
        fetch(`${crmWebhookUrl}/api/surprise-granite/webhook/new-lead`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(lead),
          signal: crmCtrl.signal
        }).then(r => {
          if (r.ok) logger.info('Lead pushed to VoiceNow CRM', { leadId: lead.id });
          else logger.warn('VoiceNow CRM webhook failed', { status: r.status, leadId: lead.id });
        }).catch(err => {
          logger.warn('VoiceNow CRM webhook error', { error: err.message, leadId: lead.id });
        });

        // Auto-generate portal token for the lead
        try {
          const { data: token, error: tokenError } = await supabase
            .from('portal_tokens')
            .insert([{
              lead_id: lead.id,
              owner_id: lead.assigned_to || lead.user_id || '00000000-0000-0000-0000-000000000000', // System user if no owner
              // Normalize email to match how we stored it on the lead — keeps portal lookups consistent.
              email: homeowner_email.toLowerCase().trim(),
              phone: homeowner_phone,
              permissions: {
                view_project: true,
                view_estimates: true,
                approve_estimates: true,
                view_invoices: true,
                pay_invoices: true,
                upload_photos: true,
                send_messages: true,
                view_appointments: true
              }
            }])
            .select()
            .single();

          if (token && !tokenError) {
            portalToken = token;
            portalUrl = `https://www.surprisegranite.com/portal/?token=${token.token}`;
            logger.info('Portal token auto-created for lead', { leadId: lead.id, tokenId: token.id });
          } else if (tokenError) {
            logger.warn('Failed to create portal token for lead', { error: tokenError.message });
          }
        } catch (tokenErr) {
          logger.warn('Portal token creation error', { error: tokenErr.message });
        }

        // Create calendar event if appointment was scheduled
        if (isAppointment && lead) {
          try {
            // Parse appointment date and time to create proper datetime (Arizona timezone - MST, no DST)
            const appointmentDateTime = new Date(`${appointment_date}T${convertTo24Hour(appointment_time)}${ARIZONA_TIMEZONE_OFFSET}`);
            const appointmentEndTime = new Date(appointmentDateTime.getTime() + 60 * 60 * 1000); // 1 hour duration

            // Validate the appointment is not in the past
            if (appointmentDateTime < new Date()) {
              logger.warn('Appointment date is in the past', { leadId: lead.id, appointmentDateTime });
            }

            // Check for scheduling conflicts
            const { data: conflicts } = await supabase
              .from('calendar_events')
              .select('id')
              .neq('status', 'cancelled')
              .lt('start_time', appointmentEndTime.toISOString())
              .gt('end_time', appointmentDateTime.toISOString())
              .limit(1);

            if (conflicts && conflicts.length > 0) {
              logger.warn('Appointment time has conflict, creating anyway with warning', {
                leadId: lead.id,
                appointmentDateTime,
                conflictingEventId: conflicts[0].id
              });
            }

            // Get admin user ID for calendar event owner
            let calendarOwnerId = null;

            // Try configured admin email first
            const adminEmail = process.env.ADMIN_EMAIL || 'joshb@surprisegranite.com';
            const { data: adminUser } = await supabase
              .from('sg_users')
              .select('id')
              .ilike('email', adminEmail)
              .single();

            if (adminUser) {
              calendarOwnerId = adminUser.id;
            } else {
              // Fallback: get any admin/super_admin user
              const { data: anyAdmin } = await supabase
                .from('sg_users')
                .select('id')
                .in('account_type', ['admin', 'super_admin'])
                .limit(1)
                .single();

              if (anyAdmin) {
                calendarOwnerId = anyAdmin.id;
              }
            }

            if (!calendarOwnerId) {
              logger.warn('No admin user found for calendar event, skipping calendar creation');
            } else {
            // Create calendar event linked to the lead
            const { data: calendarEvent, error: calendarError } = await supabase
              .from('calendar_events')
              .insert([{
                created_by: calendarOwnerId,
                title: `Appointment: ${homeowner_name}`,
                description: `Project: ${project_type || 'Not specified'}\nPhone: ${homeowner_phone || 'N/A'}\nEmail: ${homeowner_email}\nAddress: ${project_address || 'N/A'}\n\nDetails: ${project_details || message || 'No details provided'}`,
                event_type: 'appointment',
                start_time: appointmentDateTime.toISOString(),
                end_time: appointmentEndTime.toISOString(),
                location: project_address || null,
                location_address: project_address || null,
                lead_id: lead.id,
                status: 'scheduled',
                reminder_minutes: [1440, 60], // 24 hours and 1 hour before
                color: '#f59e0b' // Amber/gold for appointments
              }])
              .select()
              .single();

            if (calendarError) {
              logger.warn('Failed to create calendar event for appointment', { error: calendarError.message, leadId: lead.id });
            } else {
              logger.info('Calendar event created for appointment', { eventId: calendarEvent.id, leadId: lead.id });

              // Add customer as participant
              await supabase
                .from('calendar_event_participants')
                .insert([{
                  event_id: calendarEvent.id,
                  email: homeowner_email.toLowerCase(),
                  name: homeowner_name,
                  phone: homeowner_phone || null,
                  participant_type: 'attendee',
                  response_status: 'accepted' // Customer booked it, so they've accepted
                }]);
            }
            } // end else calendarOwnerId
          } catch (calendarErr) {
            logger.warn('Calendar event creation error', { error: calendarErr.message });
          }
        }
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
      message: project_details || message,
      // Include appointment details if present
      appointment_date: isAppointment ? appointment_date : null,
      appointment_time: isAppointment ? appointment_time : null,
      project_address: project_address
    });
    await emailService.sendAdminNotification(adminEmail.subject, adminEmail.html);

    // Also send via notification service for in-app + SMS alerts
    if (isAppointment) {
      notificationService.notifyAppointmentBooked({
        customer_name: homeowner_name,
        customer_email: homeowner_email,
        customer_phone: homeowner_phone,
        start_time: `${appointment_date}T${convertTo24Hour(appointment_time)}`,
        project_type: project_type,
        address: project_address,
        lead_id: savedLead?.id
      }).catch(err => logger.warn('Appointment notification failed', { error: err.message }));
    }
  } catch (emailErr) {
    logger.apiError(emailErr, { context: 'Admin notification failed' });
  }

  // Send customer confirmation with portal link
  if (homeowner_email) {
    try {
      let customerEmail;

      // If appointment was scheduled and portal was created, send appointment+portal email
      if (isAppointment && portalUrl) {
        customerEmail = emailService.generateAppointmentWithPortalEmail({
          name: homeowner_name,
          appointment_date,
          appointment_time,
          portal_url: portalUrl,
          address: project_address
        });
      }
      // If portal was created (no appointment), send portal welcome email
      else if (portalUrl) {
        customerEmail = emailService.generatePortalWelcomeEmail({
          name: homeowner_name,
          portal_url: portalUrl
        });
      }
      // Fallback to regular confirmation
      else {
        customerEmail = emailService.generateCustomerConfirmationEmail({
          name: homeowner_name
        });
      }

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
    lead_id: savedLead?.id || `lead_${Date.now()}`,
    portal_url: portalUrl || null
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

/**
 * Record a Quick Pay link against a lead.
 *
 * Quick Pay builds a /pay/ URL client-side and hands it to the customer — no
 * Stripe resource is created until the customer lands on /pay/ and clicks Pay.
 * Before this endpoint, nothing was recorded, so "I sent Robert a pay link"
 * was un-provable: the Leads view didn't know, and the webhook couldn't
 * reconcile a later payment to the lead.
 *
 * POST /api/leads/:id/record-quick-pay  { url, amount, pass_fee }
 */
router.post('/:id/record-quick-pay', asyncHandler(async (req, res) => {
  const supabase = req.app.get('supabase');
  if (!supabase) {
    return res.status(500).json({ error: 'Database not configured' });
  }

  const { id } = req.params;
  const { url, amount, pass_fee } = req.body;

  if (!url || typeof url !== 'string') {
    return res.status(400).json({ error: 'url is required' });
  }
  const amt = parseFloat(amount);
  if (!Number.isFinite(amt) || amt <= 0) {
    return res.status(400).json({ error: 'valid amount is required' });
  }

  // Merge the pass_fee flag into raw_data rather than adding a column —
  // keeps the fix schema-migration-free.
  const { data: cur } = await supabase.from('leads').select('raw_data').eq('id', id).single();
  const raw = (cur && cur.raw_data && typeof cur.raw_data === 'object') ? cur.raw_data : {};
  raw.quick_pay = { pass_fee: !!pass_fee, recorded_at: new Date().toISOString() };

  const { error } = await supabase
    .from('leads')
    .update({
      pay_link_url: url,
      pay_link_amount: Math.round(amt * 100),
      pay_link_created_at: new Date().toISOString(),
      raw_data: raw,
      updated_at: new Date().toISOString()
    })
    .eq('id', id);

  if (error) {
    logger.error('record-quick-pay failed', { leadId: id, error: error.message });
    return res.status(500).json({ error: 'Failed to record pay link' });
  }

  logger.info('Quick Pay link recorded', { leadId: id, amount: amt, pass_fee: !!pass_fee });
  res.json({ success: true });
}));

module.exports = router;
