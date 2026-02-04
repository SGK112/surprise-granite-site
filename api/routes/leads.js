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
      const { data: lead, error } = await supabase
        .from('leads')
        .insert([leadData])
        .select()
        .single();

      if (error) {
        logger.apiError(error, { context: 'Lead insert' });
      } else {
        savedLead = lead;

        // Auto-generate portal token for the lead
        try {
          const { data: token, error: tokenError } = await supabase
            .from('portal_tokens')
            .insert([{
              lead_id: lead.id,
              owner_id: lead.assigned_to || lead.user_id || '00000000-0000-0000-0000-000000000000', // System user if no owner
              email: homeowner_email,
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

module.exports = router;
