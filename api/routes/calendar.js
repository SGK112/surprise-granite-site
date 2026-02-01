/**
 * SURPRISE GRANITE - CALENDAR API
 * Multi-participant calendar events with notifications
 */

const express = require('express');
const router = express.Router();
const Joi = require('joi');
const crypto = require('crypto');
const { createClient } = require('@supabase/supabase-js');
const logger = require('../utils/logger');
const { asyncHandler } = require('../middleware/errorHandler');
const { validateBody } = require('../middleware/validator');
const emailService = require('../services/emailService');
const smsService = require('../services/smsService');
const { escapeHtml, isValidEmail, isValidPhone, sanitizeString } = require('../utils/security');
const { bookingRateLimiter } = require('../middleware/rateLimiter');

// Initialize Supabase
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://ypeypgwsycxcagncgdur.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;

let supabase = null;
if (SUPABASE_URL && SUPABASE_SERVICE_KEY) {
  supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  });
} else {
  console.warn('Calendar: Supabase credentials not configured - routes will be disabled');
}

// ============================================================
// VALIDATION SCHEMAS
// ============================================================

const schemas = {
  createEvent: Joi.object({
    title: Joi.string().max(200).trim().required(),
    description: Joi.string().max(2000).trim().allow('', null),
    event_type: Joi.string().valid(
      'appointment', 'consultation', 'measurement', 'template', 'fabrication',
      'installation', 'plumbing_disconnect', 'plumbing_reconnect', 'sealer_application',
      'walk_through', 'final_inspection', 'delivery', 'site_visit', 'meeting', 'follow_up', 'other'
    ).required(),
    start_time: Joi.date().iso().required(),
    end_time: Joi.date().iso().required(),
    all_day: Joi.boolean().default(false),
    location: Joi.string().max(200).trim().allow('', null),
    location_address: Joi.string().max(500).trim().allow('', null),
    lead_id: Joi.string().uuid().allow(null),
    customer_id: Joi.string().uuid().allow(null),
    job_id: Joi.string().uuid().allow(null),
    project_id: Joi.string().uuid().allow(null),
    reminder_minutes: Joi.array().items(Joi.number().integer()).default([1440, 60]),
    color: Joi.string().max(20).allow(null),
    notes: Joi.string().max(2000).trim().allow('', null),
    participants: Joi.array().items(Joi.object({
      email: Joi.string().email().required(),
      name: Joi.string().max(200).allow('', null),
      phone: Joi.string().max(50).allow('', null),
      role: Joi.string().max(50).allow('', null),
      participant_type: Joi.string().valid('organizer', 'attendee', 'optional', 'resource').default('attendee')
    })).default([])
  }),

  updateEvent: Joi.object({
    title: Joi.string().max(200).trim(),
    description: Joi.string().max(2000).trim().allow('', null),
    event_type: Joi.string().valid(
      'appointment', 'consultation', 'measurement', 'template', 'fabrication',
      'installation', 'plumbing_disconnect', 'plumbing_reconnect', 'sealer_application',
      'walk_through', 'final_inspection', 'delivery', 'site_visit', 'meeting', 'follow_up', 'other'
    ),
    start_time: Joi.date().iso(),
    end_time: Joi.date().iso(),
    all_day: Joi.boolean(),
    location: Joi.string().max(200).trim().allow('', null),
    location_address: Joi.string().max(500).trim().allow('', null),
    status: Joi.string().valid('scheduled', 'confirmed', 'completed', 'cancelled', 'rescheduled', 'no_show'),
    reminder_minutes: Joi.array().items(Joi.number().integer()),
    color: Joi.string().max(20).allow(null),
    notes: Joi.string().max(2000).trim().allow('', null)
  }),

  addParticipant: Joi.object({
    email: Joi.string().email().required(),
    name: Joi.string().max(200).allow('', null),
    phone: Joi.string().max(50).allow('', null),
    role: Joi.string().max(50).allow('', null),
    participant_type: Joi.string().valid('organizer', 'attendee', 'optional', 'resource').default('attendee')
  }),

  updateParticipant: Joi.object({
    response_status: Joi.string().valid('pending', 'accepted', 'declined', 'tentative', 'needs_action'),
    participant_type: Joi.string().valid('organizer', 'attendee', 'optional', 'resource'),
    notes: Joi.string().max(500).allow('', null)
  }),

  publicBooking: Joi.object({
    name: Joi.string().max(200).trim().required(),
    email: Joi.string().email().required(),
    phone: Joi.string().max(50).allow('', null),
    date: Joi.string().pattern(/^\d{4}-\d{2}-\d{2}$/).required()
      .messages({ 'string.pattern.base': 'Date must be in YYYY-MM-DD format' }),
    time: Joi.string().pattern(/^\d{2}:\d{2}$/).required()
      .messages({ 'string.pattern.base': 'Time must be in HH:MM format (24-hour)' }),
    event_type: Joi.string().valid(
      'appointment', 'measurement', 'consultation', 'site_visit'
    ).default('appointment'),
    project_type: Joi.string().max(100).allow('', null),
    address: Joi.string().max(500).allow('', null),
    notes: Joi.string().max(2000).allow('', null),
    duration_minutes: Joi.number().integer().min(15).max(480).default(60)
  })
};

// ============================================================
// MIDDLEWARE: Verify Authenticated User
// ============================================================

const verifyUser = async (req, res, next) => {
  try {
    if (!supabase) {
      return res.status(503).json({ error: 'Database not configured' });
    }

    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Missing authorization token' });
    }

    const token = authHeader.split(' ')[1];
    const { data: { user }, error } = await supabase.auth.getUser(token);

    if (error || !user) {
      return res.status(401).json({ error: 'Invalid token' });
    }

    const { data: profile } = await supabase
      .from('sg_users')
      .select('*')
      .eq('id', user.id)
      .single();

    if (!profile) {
      return res.status(403).json({ error: 'User profile not found' });
    }

    req.user = user;
    req.profile = profile;
    next();
  } catch (err) {
    logger.apiError(err, { context: 'Calendar auth error' });
    res.status(500).json({ error: 'Authentication failed' });
  }
};

// ============================================================
// HELPERS
// ============================================================

async function createNotification(userId, type, title, message, data = {}) {
  try {
    await supabase
      .from('pro_notifications')
      .insert({
        pro_user_id: userId,
        notification_type: type,
        title,
        message,
        data
      });
  } catch (err) {
    logger.apiError(err, { context: 'Failed to create calendar notification' });
  }
}

/**
 * Generate calendar links for Google, Outlook, and iCal download
 */
function generateCalendarLinks(event) {
  const startDate = new Date(event.start_time);
  const endDate = new Date(event.end_time);

  // Format dates for Google Calendar (YYYYMMDDTHHmmssZ)
  const formatDateGoogle = (d) => d.toISOString().replace(/-|:|\.\d{3}/g, '');
  const startStr = formatDateGoogle(startDate);
  const endStr = formatDateGoogle(endDate);

  const title = encodeURIComponent(event.title);
  const details = encodeURIComponent(event.description || '');
  const location = encodeURIComponent(event.location_address || event.location || '');

  // Google Calendar link
  const googleUrl = `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${title}&dates=${startStr}/${endStr}&details=${details}&location=${location}`;

  // Outlook.com link
  const outlookUrl = `https://outlook.live.com/calendar/0/deeplink/compose?subject=${title}&startdt=${startDate.toISOString()}&enddt=${endDate.toISOString()}&body=${details}&location=${location}`;

  // Generate .ics file content for download
  const uid = event.id || crypto.randomUUID();
  const icsContent = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Surprise Granite//Calendar//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:REQUEST',
    'BEGIN:VEVENT',
    `UID:${uid}@surprisegranite.com`,
    `DTSTAMP:${formatDateGoogle(new Date())}`,
    `DTSTART:${startStr}`,
    `DTEND:${endStr}`,
    `SUMMARY:${event.title.replace(/[,;\\]/g, '\\$&')}`,
    event.description ? `DESCRIPTION:${event.description.replace(/\n/g, '\\n').replace(/[,;\\]/g, '\\$&')}` : '',
    event.location || event.location_address ? `LOCATION:${(event.location_address || event.location).replace(/[,;\\]/g, '\\$&')}` : '',
    `ORGANIZER:mailto:info@surprisegranite.com`,
    'END:VEVENT',
    'END:VCALENDAR'
  ].filter(Boolean).join('\r\n');

  // Base64 encode for data URI
  const icsDataUri = `data:text/calendar;charset=utf-8,${encodeURIComponent(icsContent)}`;

  return { googleUrl, outlookUrl, icsDataUri, icsContent };
}

function generateEventEmailHtml(event, participant, isNew = true) {
  const startDate = new Date(event.start_time);
  const endDate = new Date(event.end_time);
  const dateStr = startDate.toLocaleDateString('en-US', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
  });
  const timeStr = `${startDate.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })} - ${endDate.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`;

  const eventTypeLabel = event.event_type.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());

  // Generate calendar links
  const calendarLinks = generateCalendarLinks(event);

  return `
    <div style="text-align: center; margin-bottom: 25px;">
      <h2 style="margin: 0 0 10px; color: #1a1a2e; font-size: 22px;">
        ${isNew ? 'You\'re Invited' : 'Event Updated'}
      </h2>
    </div>

    <div style="background: #f8f8f8; padding: 25px; border-radius: 12px; margin-bottom: 25px;">
      <h3 style="margin: 0 0 15px; color: #1a1a2e; font-size: 20px;">${escapeHtml(event.title)}</h3>

      <table width="100%" cellspacing="0" cellpadding="8">
        <tr>
          <td style="color: #666; font-weight: 600; width: 100px;">Type:</td>
          <td style="color: #1a1a2e;">${escapeHtml(eventTypeLabel)}</td>
        </tr>
        <tr>
          <td style="color: #666; font-weight: 600;">Date:</td>
          <td style="color: #1a1a2e;">${dateStr}</td>
        </tr>
        <tr>
          <td style="color: #666; font-weight: 600;">Time:</td>
          <td style="color: #1a1a2e;">${timeStr}</td>
        </tr>
        ${event.location ? `
        <tr>
          <td style="color: #666; font-weight: 600;">Location:</td>
          <td style="color: #1a1a2e;">${escapeHtml(event.location)}</td>
        </tr>
        ` : ''}
        ${event.location_address ? `
        <tr>
          <td style="color: #666; font-weight: 600;">Address:</td>
          <td style="color: #1a1a2e;">${escapeHtml(event.location_address)}</td>
        </tr>
        ` : ''}
      </table>

      ${event.description ? `
      <div style="margin-top: 15px; padding-top: 15px; border-top: 1px solid #ddd;">
        <p style="margin: 0; color: #444; font-size: 14px; line-height: 1.6;">${escapeHtml(event.description)}</p>
      </div>
      ` : ''}
    </div>

    <!-- Add to Calendar Buttons -->
    <div style="text-align: center; margin-bottom: 25px;">
      <p style="margin: 0 0 12px; color: #666; font-size: 13px; font-weight: 600;">Add to your calendar:</p>
      <table align="center" cellspacing="0" cellpadding="0">
        <tr>
          <td style="padding: 0 6px;">
            <a href="${calendarLinks.googleUrl}" target="_blank" style="display: inline-block; padding: 10px 16px; background: #4285f4; color: white; text-decoration: none; border-radius: 6px; font-size: 13px; font-weight: 500;">
              Google
            </a>
          </td>
          <td style="padding: 0 6px;">
            <a href="${calendarLinks.outlookUrl}" target="_blank" style="display: inline-block; padding: 10px 16px; background: #0078d4; color: white; text-decoration: none; border-radius: 6px; font-size: 13px; font-weight: 500;">
              Outlook
            </a>
          </td>
          <td style="padding: 0 6px;">
            <a href="${calendarLinks.icsDataUri}" download="${event.title.replace(/[^a-z0-9]/gi, '_')}.ics" style="display: inline-block; padding: 10px 16px; background: #333; color: white; text-decoration: none; border-radius: 6px; font-size: 13px; font-weight: 500;">
              iCal / Apple
            </a>
          </td>
        </tr>
      </table>
    </div>

    ${participant ? `
    <p style="margin: 0 0 20px; color: #666; font-size: 14px; text-align: center;">
      You're invited as: <strong>${escapeHtml(participant.role || participant.participant_type)}</strong>
    </p>
    ` : ''}

    <p style="margin: 0; color: #aaa; font-size: 12px; text-align: center;">
      This event notification was sent from Surprise Granite.
    </p>
  `;
}

// ============================================================
// BUSINESS HOURS CONFIGURATION
// ============================================================

const BUSINESS_HOURS = {
  start: 8,   // 8 AM
  end: 18,    // 6 PM
  slotDuration: 60,  // 60 minutes default
  daysOfWeek: [1, 2, 3, 4, 5, 6] // Monday to Saturday (0 = Sunday)
};

/**
 * Check if a date falls on a business day
 */
function isBusinessDay(date) {
  const dayOfWeek = date.getDay();
  return BUSINESS_HOURS.daysOfWeek.includes(dayOfWeek);
}

/**
 * Generate time slots for a given date
 */
function generateTimeSlots(date, durationMinutes = 60) {
  const slots = [];
  const dateStr = date.toISOString().split('T')[0];

  for (let hour = BUSINESS_HOURS.start; hour < BUSINESS_HOURS.end; hour++) {
    // Generate slots at the start of each hour
    const slotStart = new Date(`${dateStr}T${hour.toString().padStart(2, '0')}:00:00`);
    const slotEnd = new Date(slotStart.getTime() + durationMinutes * 60 * 1000);

    // Only add slot if it ends within business hours
    if (slotEnd.getHours() <= BUSINESS_HOURS.end) {
      slots.push({
        start: slotStart.toISOString(),
        end: slotEnd.toISOString(),
        startTime: `${hour.toString().padStart(2, '0')}:00`,
        endTime: `${slotEnd.getHours().toString().padStart(2, '0')}:${slotEnd.getMinutes().toString().padStart(2, '0')}`
      });
    }
  }

  return slots;
}

/**
 * Get admin/owner user ID for calendar events
 */
async function getCalendarOwnerId(supabaseClient) {
  const { data: adminUser } = await supabaseClient
    .from('sg_users')
    .select('id')
    .eq('email', process.env.ADMIN_EMAIL || 'mike@surprisegranite.com')
    .single();

  return adminUser?.id || '00000000-0000-0000-0000-000000000000';
}

// ============================================================
// PUBLIC AVAILABILITY ENDPOINTS (No Auth Required)
// ============================================================

/**
 * GET /api/calendar/availability/:date
 * Public endpoint - Returns available time slots for a specific date
 */
router.get('/availability/:date', asyncHandler(async (req, res) => {
  if (!supabase) {
    return res.status(503).json({ error: 'Database not configured' });
  }

  const { date } = req.params;
  const { duration_minutes = 60 } = req.query;

  // Validate date format
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return res.status(400).json({
      error: 'Invalid date format',
      message: 'Date must be in YYYY-MM-DD format'
    });
  }

  const requestedDate = new Date(date);
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Validate date is not in the past
  if (requestedDate < today) {
    return res.status(400).json({
      error: 'Invalid date',
      message: 'Cannot check availability for past dates'
    });
  }

  // Check if it's a business day
  if (!isBusinessDay(requestedDate)) {
    return res.json({
      success: true,
      date,
      isBusinessDay: false,
      slots: [],
      message: 'This date is not a business day'
    });
  }

  const duration = parseInt(duration_minutes);
  if (isNaN(duration) || duration < 15 || duration > 480) {
    return res.status(400).json({
      error: 'Invalid duration',
      message: 'Duration must be between 15 and 480 minutes'
    });
  }

  // Get all events for this date
  const startOfDay = new Date(date);
  startOfDay.setHours(0, 0, 0, 0);
  const endOfDay = new Date(date);
  endOfDay.setHours(23, 59, 59, 999);

  const { data: events, error } = await supabase
    .from('calendar_events')
    .select('start_time, end_time')
    .neq('status', 'cancelled')
    .gte('start_time', startOfDay.toISOString())
    .lte('start_time', endOfDay.toISOString())
    .order('start_time');

  if (error) {
    logger.apiError(error, { context: 'Fetch availability events' });
    return res.status(500).json({ error: 'Failed to check availability' });
  }

  // Generate all possible time slots
  const allSlots = generateTimeSlots(requestedDate, duration);

  // Mark slots as available or unavailable
  const now = new Date();
  const slotsWithAvailability = allSlots.map(slot => {
    const slotStart = new Date(slot.start);
    const slotEnd = new Date(slot.end);

    // Check if slot is in the past
    if (slotStart < now) {
      return { ...slot, available: false, reason: 'past' };
    }

    // Check if slot overlaps with any existing event
    const hasConflict = events.some(event => {
      const eventStart = new Date(event.start_time);
      const eventEnd = new Date(event.end_time);
      return (slotStart < eventEnd && slotEnd > eventStart);
    });

    return {
      ...slot,
      available: !hasConflict,
      reason: hasConflict ? 'booked' : null
    };
  });

  const availableCount = slotsWithAvailability.filter(s => s.available).length;

  res.json({
    success: true,
    date,
    isBusinessDay: true,
    totalSlots: allSlots.length,
    availableSlots: availableCount,
    slots: slotsWithAvailability
  });
}));

/**
 * GET /api/calendar/availability
 * Public endpoint - Returns available dates for the next 30 days
 */
router.get('/public/availability', asyncHandler(async (req, res) => {
  if (!supabase) {
    return res.status(503).json({ error: 'Database not configured' });
  }

  const { days = 30, duration_minutes = 60 } = req.query;
  const numDays = Math.min(Math.max(parseInt(days) || 30, 1), 90);
  const duration = parseInt(duration_minutes) || 60;

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const endDate = new Date(today);
  endDate.setDate(endDate.getDate() + numDays);

  // Get all events for the date range
  const { data: events, error } = await supabase
    .from('calendar_events')
    .select('start_time, end_time')
    .neq('status', 'cancelled')
    .gte('start_time', today.toISOString())
    .lte('start_time', endDate.toISOString())
    .order('start_time');

  if (error) {
    logger.apiError(error, { context: 'Fetch 30-day availability' });
    return res.status(500).json({ error: 'Failed to check availability' });
  }

  // Build availability for each day
  const availability = [];
  const currentDate = new Date(today);

  while (currentDate < endDate) {
    const dateStr = currentDate.toISOString().split('T')[0];
    const isOpen = isBusinessDay(currentDate);

    if (!isOpen) {
      availability.push({
        date: dateStr,
        isBusinessDay: false,
        availableSlots: 0,
        totalSlots: 0
      });
    } else {
      // Generate slots and check availability
      const daySlots = generateTimeSlots(currentDate, duration);
      const dayStart = new Date(dateStr);
      dayStart.setHours(0, 0, 0, 0);
      const dayEnd = new Date(dateStr);
      dayEnd.setHours(23, 59, 59, 999);

      // Get events for this specific day
      const dayEvents = events.filter(e => {
        const eventStart = new Date(e.start_time);
        return eventStart >= dayStart && eventStart <= dayEnd;
      });

      // Count available slots
      const now = new Date();
      let availableCount = 0;

      for (const slot of daySlots) {
        const slotStart = new Date(slot.start);
        const slotEnd = new Date(slot.end);

        if (slotStart < now) continue;

        const hasConflict = dayEvents.some(event => {
          const eventStart = new Date(event.start_time);
          const eventEnd = new Date(event.end_time);
          return (slotStart < eventEnd && slotEnd > eventStart);
        });

        if (!hasConflict) availableCount++;
      }

      availability.push({
        date: dateStr,
        isBusinessDay: true,
        availableSlots: availableCount,
        totalSlots: daySlots.length,
        hasAvailability: availableCount > 0
      });
    }

    currentDate.setDate(currentDate.getDate() + 1);
  }

  res.json({
    success: true,
    startDate: today.toISOString().split('T')[0],
    endDate: new Date(endDate.getTime() - 86400000).toISOString().split('T')[0],
    daysChecked: numDays,
    availability,
    datesWithAvailability: availability.filter(d => d.hasAvailability).map(d => d.date)
  });
}));

/**
 * POST /api/calendar/book
 * Public endpoint - Allows customers to book appointments (rate limited)
 */
router.post('/book',
  bookingRateLimiter,
  validateBody(schemas.publicBooking),
  asyncHandler(async (req, res) => {
    if (!supabase) {
      return res.status(503).json({ error: 'Database not configured' });
    }

    const {
      name,
      email,
      phone,
      date,
      time,
      event_type,
      project_type,
      address,
      notes,
      duration_minutes
    } = req.body;

    // Additional validation
    if (!isValidEmail(email)) {
      return res.status(400).json({ error: 'Invalid email format' });
    }

    if (phone && !isValidPhone(phone)) {
      return res.status(400).json({ error: 'Invalid phone format' });
    }

    // Parse and validate the requested datetime
    const requestedStart = new Date(`${date}T${time}:00`);
    const requestedEnd = new Date(requestedStart.getTime() + duration_minutes * 60 * 1000);
    const now = new Date();

    if (isNaN(requestedStart.getTime())) {
      return res.status(400).json({ error: 'Invalid date or time format' });
    }

    if (requestedStart < now) {
      return res.status(400).json({ error: 'Cannot book appointments in the past' });
    }

    // Check if it's a business day
    if (!isBusinessDay(requestedStart)) {
      return res.status(400).json({
        error: 'This date is not available',
        message: 'Please select a business day (Monday-Saturday)'
      });
    }

    // Check if time is within business hours
    const startHour = requestedStart.getHours();
    const endHour = requestedEnd.getHours() + (requestedEnd.getMinutes() > 0 ? 1 : 0);

    if (startHour < BUSINESS_HOURS.start || endHour > BUSINESS_HOURS.end) {
      return res.status(400).json({
        error: 'Time outside business hours',
        message: `Please select a time between ${BUSINESS_HOURS.start}:00 and ${BUSINESS_HOURS.end}:00`
      });
    }

    // Check for conflicts
    const { data: conflicts, error: conflictError } = await supabase
      .from('calendar_events')
      .select('id, title, start_time, end_time')
      .neq('status', 'cancelled')
      .or(`and(start_time.lt.${requestedEnd.toISOString()},end_time.gt.${requestedStart.toISOString()})`);

    if (conflictError) {
      logger.apiError(conflictError, { context: 'Check booking conflicts' });
      return res.status(500).json({ error: 'Failed to check availability' });
    }

    if (conflicts && conflicts.length > 0) {
      return res.status(409).json({
        error: 'Time slot not available',
        message: 'This time slot is already booked. Please select a different time.'
      });
    }

    // Get owner ID for the calendar event
    const ownerId = await getCalendarOwnerId(supabase);

    // Create the calendar event
    const eventTitle = `${event_type === 'consultation' ? 'Consultation' : 'Appointment'}: ${sanitizeString(name, 100)}`;
    const eventDescription = [
      `Customer: ${name}`,
      `Email: ${email}`,
      phone ? `Phone: ${phone}` : null,
      project_type ? `Project Type: ${project_type}` : null,
      address ? `Address: ${address}` : null,
      notes ? `\nNotes: ${notes}` : null
    ].filter(Boolean).join('\n');

    const { data: event, error: eventError } = await supabase
      .from('calendar_events')
      .insert({
        created_by: ownerId,
        title: eventTitle,
        description: eventDescription,
        event_type: event_type || 'appointment',
        start_time: requestedStart.toISOString(),
        end_time: requestedEnd.toISOString(),
        location: address || null,
        location_address: address || null,
        status: 'scheduled',
        reminder_minutes: [1440, 60], // 24 hours and 1 hour before
        color: '#f59e0b' // Amber for appointments
      })
      .select()
      .single();

    if (eventError) {
      logger.apiError(eventError, { context: 'Create booking event' });
      return res.status(500).json({ error: 'Failed to create appointment' });
    }

    // Add customer as participant
    await supabase
      .from('calendar_event_participants')
      .insert({
        event_id: event.id,
        email: email.toLowerCase(),
        name: sanitizeString(name, 200),
        phone: phone || null,
        participant_type: 'attendee',
        response_status: 'accepted'
      });

    // Generate calendar links for confirmation email
    const calendarLinks = generateCalendarLinks(event);

    // Send confirmation email to customer
    try {
      const startDate = new Date(event.start_time);
      const emailHtml = `
        <div style="text-align: center; margin-bottom: 25px;">
          <h2 style="margin: 0 0 10px; color: #1a1a2e; font-size: 22px;">
            Appointment Confirmed!
          </h2>
          <p style="margin: 0; color: #666;">Your appointment has been successfully scheduled.</p>
        </div>

        <div style="background: #f8f8f8; padding: 25px; border-radius: 12px; margin-bottom: 25px;">
          <table width="100%" cellspacing="0" cellpadding="8">
            <tr>
              <td style="color: #666; font-weight: 600; width: 100px;">Date:</td>
              <td style="color: #1a1a2e;">${startDate.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</td>
            </tr>
            <tr>
              <td style="color: #666; font-weight: 600;">Time:</td>
              <td style="color: #1a1a2e;">${startDate.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}</td>
            </tr>
            ${address ? `
            <tr>
              <td style="color: #666; font-weight: 600;">Location:</td>
              <td style="color: #1a1a2e;">${escapeHtml(address)}</td>
            </tr>
            ` : ''}
          </table>
        </div>

        <!-- Add to Calendar Buttons -->
        <div style="text-align: center; margin-bottom: 25px;">
          <p style="margin: 0 0 12px; color: #666; font-size: 13px; font-weight: 600;">Add to your calendar:</p>
          <table align="center" cellspacing="0" cellpadding="0">
            <tr>
              <td style="padding: 0 6px;">
                <a href="${calendarLinks.googleUrl}" target="_blank" style="display: inline-block; padding: 10px 16px; background: #4285f4; color: white; text-decoration: none; border-radius: 6px; font-size: 13px; font-weight: 500;">
                  Google
                </a>
              </td>
              <td style="padding: 0 6px;">
                <a href="${calendarLinks.outlookUrl}" target="_blank" style="display: inline-block; padding: 10px 16px; background: #0078d4; color: white; text-decoration: none; border-radius: 6px; font-size: 13px; font-weight: 500;">
                  Outlook
                </a>
              </td>
            </tr>
          </table>
        </div>

        <p style="margin: 0; color: #666; font-size: 14px; text-align: center;">
          Questions? Reply to this email or call us.
        </p>
      `;

      await emailService.sendNotification(
        email,
        `Appointment Confirmed - ${startDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} at ${startDate.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`,
        emailService.wrapEmailTemplate(emailHtml, { headerText: 'Appointment Confirmation' })
      );
    } catch (emailErr) {
      logger.apiError(emailErr, { context: 'Booking confirmation email failed' });
      // Don't fail the booking if email fails
    }

    // Send admin notification
    try {
      const adminEmail = {
        subject: `New Appointment Booked: ${name}`,
        html: `
          <h2>New Appointment Booked</h2>
          <p><strong>Customer:</strong> ${escapeHtml(name)}</p>
          <p><strong>Email:</strong> ${escapeHtml(email)}</p>
          ${phone ? `<p><strong>Phone:</strong> ${escapeHtml(phone)}</p>` : ''}
          <p><strong>Date:</strong> ${new Date(event.start_time).toLocaleDateString()}</p>
          <p><strong>Time:</strong> ${new Date(event.start_time).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}</p>
          ${project_type ? `<p><strong>Project Type:</strong> ${escapeHtml(project_type)}</p>` : ''}
          ${address ? `<p><strong>Address:</strong> ${escapeHtml(address)}</p>` : ''}
          ${notes ? `<p><strong>Notes:</strong> ${escapeHtml(notes)}</p>` : ''}
        `
      };
      await emailService.sendAdminNotification(adminEmail.subject, adminEmail.html);
    } catch (adminErr) {
      logger.apiError(adminErr, { context: 'Booking admin notification failed' });
    }

    logger.info('Public booking created', {
      eventId: event.id,
      customerEmail: email,
      date: date,
      time: time
    });

    res.status(201).json({
      success: true,
      message: 'Appointment booked successfully!',
      booking: {
        id: event.id,
        date: date,
        time: time,
        start_time: event.start_time,
        end_time: event.end_time,
        event_type: event.event_type
      },
      calendarLinks: {
        google: calendarLinks.googleUrl,
        outlook: calendarLinks.outlookUrl
      }
    });
  })
);

// ============================================================
// EVENT CRUD
// ============================================================

/**
 * POST /api/calendar/events
 * Create a new calendar event with participants
 */
router.post('/events',
  verifyUser,
  validateBody(schemas.createEvent),
  asyncHandler(async (req, res) => {
    const eventData = req.body;
    const { participants, ...eventFields } = eventData;

    // Validate time range
    if (new Date(eventFields.end_time) <= new Date(eventFields.start_time)) {
      return res.status(400).json({ error: 'End time must be after start time' });
    }

    // Create event
    const { data: event, error: eventError } = await supabase
      .from('calendar_events')
      .insert({
        ...eventFields,
        created_by: req.user.id
      })
      .select()
      .single();

    if (eventError) throw eventError;

    // Add creator as organizer
    const participantsToAdd = [
      {
        event_id: event.id,
        email: req.profile.email,
        name: req.profile.full_name,
        phone: req.profile.phone,
        user_id: req.user.id,
        participant_type: 'organizer',
        response_status: 'accepted'
      }
    ];

    // Add other participants
    if (participants && participants.length > 0) {
      for (const p of participants) {
        if (p.email.toLowerCase() === req.profile.email?.toLowerCase()) continue; // Skip self

        // Check if participant has an account
        const { data: existingUser } = await supabase
          .from('sg_users')
          .select('id, full_name')
          .eq('email', p.email.toLowerCase())
          .single();

        participantsToAdd.push({
          event_id: event.id,
          email: p.email.toLowerCase(),
          name: p.name || existingUser?.full_name,
          phone: p.phone,
          role: p.role,
          user_id: existingUser?.id || null,
          participant_type: p.participant_type || 'attendee',
          response_status: 'pending'
        });
      }
    }

    // Insert participants
    const { data: createdParticipants, error: pError } = await supabase
      .from('calendar_event_participants')
      .insert(participantsToAdd)
      .select();

    if (pError) {
      logger.apiError(pError, { context: 'Failed to create participants' });
    }

    logger.info('Calendar event created', {
      eventId: event.id, participantCount: participantsToAdd.length
    });

    res.json({ success: true, event, participants: createdParticipants || [] });
  })
);

/**
 * GET /api/calendar/events
 * List events with filtering
 */
router.get('/events', verifyUser, asyncHandler(async (req, res) => {
  const {
    start_date,
    end_date,
    event_type,
    status,
    lead_id,
    customer_id,
    job_id,
    project_id,
    limit = 100,
    offset = 0
  } = req.query;

  let query = supabase
    .from('calendar_events')
    .select(`
      *,
      participants:calendar_event_participants(*)
    `)
    .eq('created_by', req.user.id)
    .order('start_time', { ascending: true })
    .range(offset, parseInt(offset) + parseInt(limit) - 1);

  if (start_date) {
    query = query.gte('start_time', start_date);
  }
  if (end_date) {
    query = query.lte('start_time', end_date);
  }
  if (event_type) {
    query = query.eq('event_type', event_type);
  }
  if (status) {
    query = query.eq('status', status);
  } else {
    query = query.neq('status', 'cancelled');
  }
  if (lead_id) {
    query = query.eq('lead_id', lead_id);
  }
  if (customer_id) {
    query = query.eq('customer_id', customer_id);
  }
  if (job_id) {
    query = query.eq('job_id', job_id);
  }
  if (project_id) {
    query = query.eq('project_id', project_id);
  }

  const { data: events, error } = await query;

  if (error) throw error;

  res.json({ success: true, events: events || [] });
}));

/**
 * GET /api/calendar/events/upcoming
 * Get upcoming events for quick view
 */
router.get('/events/upcoming', verifyUser, asyncHandler(async (req, res) => {
  const { days = 7 } = req.query;

  const now = new Date();
  const endDate = new Date(now.getTime() + parseInt(days) * 24 * 60 * 60 * 1000);

  const { data: events, error } = await supabase
    .from('calendar_events')
    .select(`
      id, title, event_type, start_time, end_time, location, status, color,
      participants:calendar_event_participants(id, name, email, response_status)
    `)
    .eq('created_by', req.user.id)
    .gte('start_time', now.toISOString())
    .lte('start_time', endDate.toISOString())
    .neq('status', 'cancelled')
    .order('start_time', { ascending: true })
    .limit(20);

  if (error) throw error;

  res.json({ success: true, events: events || [] });
}));

/**
 * GET /api/calendar/events/:id
 * Get event details
 */
router.get('/events/:id', verifyUser, asyncHandler(async (req, res) => {
  const { id } = req.params;

  const { data: event, error } = await supabase
    .from('calendar_events')
    .select(`
      *,
      participants:calendar_event_participants(*),
      lead:leads(id, full_name, email, phone),
      customer:customers(id, name, email, phone),
      job:jobs(id, job_number, project_type, status),
      project:projects(id, name, status)
    `)
    .eq('id', id)
    .single();

  if (error || !event) {
    return res.status(404).json({ error: 'Event not found' });
  }

  // Check access
  const isCreator = event.created_by === req.user.id;
  const isParticipant = event.participants?.some(
    p => p.user_id === req.user.id || p.email.toLowerCase() === req.profile.email?.toLowerCase()
  );

  if (!isCreator && !isParticipant && req.profile.role !== 'super_admin') {
    return res.status(403).json({ error: 'Not authorized to view this event' });
  }

  res.json({ success: true, event });
}));

/**
 * PUT /api/calendar/events/:id
 * Update event
 */
router.put('/events/:id',
  verifyUser,
  validateBody(schemas.updateEvent),
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const updates = req.body;

    // Verify ownership
    const { data: existing } = await supabase
      .from('calendar_events')
      .select('id, created_by, title, start_time')
      .eq('id', id)
      .single();

    if (!existing) {
      return res.status(404).json({ error: 'Event not found' });
    }

    if (existing.created_by !== req.user.id && req.profile.role !== 'super_admin') {
      return res.status(403).json({ error: 'Not authorized to update this event' });
    }

    // Validate time range if both provided
    if (updates.start_time && updates.end_time) {
      if (new Date(updates.end_time) <= new Date(updates.start_time)) {
        return res.status(400).json({ error: 'End time must be after start time' });
      }
    }

    const { data: event, error } = await supabase
      .from('calendar_events')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;

    // If rescheduled, notify participants
    if (updates.start_time && updates.start_time !== existing.start_time) {
      const { data: participants } = await supabase
        .from('calendar_event_participants')
        .select('email, name, user_id')
        .eq('event_id', id)
        .neq('user_id', req.user.id);

      for (const p of (participants || [])) {
        if (p.user_id) {
          await createNotification(
            p.user_id,
            'event_rescheduled',
            'Event Rescheduled',
            `"${event.title}" has been rescheduled to ${new Date(event.start_time).toLocaleString()}`,
            { eventId: id }
          );
        }
      }
    }

    logger.info('Calendar event updated', { eventId: id, updates: Object.keys(updates) });

    res.json({ success: true, event });
  })
);

/**
 * DELETE /api/calendar/events/:id
 * Cancel/delete event
 */
router.delete('/events/:id', verifyUser, asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { permanent = false } = req.query;

  const { data: existing } = await supabase
    .from('calendar_events')
    .select('id, created_by, title')
    .eq('id', id)
    .single();

  if (!existing) {
    return res.status(404).json({ error: 'Event not found' });
  }

  if (existing.created_by !== req.user.id && req.profile.role !== 'super_admin') {
    return res.status(403).json({ error: 'Not authorized to delete this event' });
  }

  if (permanent === 'true') {
    // Hard delete
    const { error } = await supabase
      .from('calendar_events')
      .delete()
      .eq('id', id);

    if (error) throw error;
  } else {
    // Soft delete (cancel)
    const { error } = await supabase
      .from('calendar_events')
      .update({ status: 'cancelled' })
      .eq('id', id);

    if (error) throw error;

    // Notify participants
    const { data: participants } = await supabase
      .from('calendar_event_participants')
      .select('email, name, user_id')
      .eq('event_id', id)
      .neq('user_id', req.user.id);

    for (const p of (participants || [])) {
      if (p.user_id) {
        await createNotification(
          p.user_id,
          'event_cancelled',
          'Event Cancelled',
          `"${existing.title}" has been cancelled`,
          { eventId: id }
        );
      }
    }
  }

  logger.info('Calendar event deleted', { eventId: id, permanent });

  res.json({ success: true });
}));

// ============================================================
// PARTICIPANTS
// ============================================================

/**
 * POST /api/calendar/events/:id/participants
 * Add participant to event
 */
router.post('/events/:id/participants',
  verifyUser,
  validateBody(schemas.addParticipant),
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const participant = req.body;

    // Verify event ownership
    const { data: event } = await supabase
      .from('calendar_events')
      .select('id, created_by, title, start_time, end_time, location, location_address, description, event_type')
      .eq('id', id)
      .single();

    if (!event) {
      return res.status(404).json({ error: 'Event not found' });
    }

    if (event.created_by !== req.user.id && req.profile.role !== 'super_admin') {
      return res.status(403).json({ error: 'Not authorized to add participants' });
    }

    // Check for existing participant
    const { data: existing } = await supabase
      .from('calendar_event_participants')
      .select('id')
      .eq('event_id', id)
      .eq('email', participant.email.toLowerCase())
      .single();

    if (existing) {
      return res.status(400).json({ error: 'Participant already exists for this event' });
    }

    // Check if user has an account
    const { data: existingUser } = await supabase
      .from('sg_users')
      .select('id, full_name')
      .eq('email', participant.email.toLowerCase())
      .single();

    const { data: newParticipant, error } = await supabase
      .from('calendar_event_participants')
      .insert({
        event_id: id,
        email: participant.email.toLowerCase(),
        name: participant.name || existingUser?.full_name,
        phone: participant.phone,
        role: participant.role,
        user_id: existingUser?.id || null,
        participant_type: participant.participant_type || 'attendee',
        response_status: 'pending'
      })
      .select()
      .single();

    if (error) throw error;

    // Notify if they have an account
    if (existingUser) {
      await createNotification(
        existingUser.id,
        'event_invitation',
        'Event Invitation',
        `You've been invited to "${event.title}"`,
        { eventId: id }
      );
    }

    logger.info('Participant added to event', { eventId: id, participantEmail: participant.email });

    res.json({ success: true, participant: newParticipant });
  })
);

/**
 * PUT /api/calendar/events/:eventId/participants/:participantId
 * Update participant (response status, etc.)
 */
router.put('/events/:eventId/participants/:participantId',
  verifyUser,
  validateBody(schemas.updateParticipant),
  asyncHandler(async (req, res) => {
    const { eventId, participantId } = req.params;
    const updates = req.body;

    // Get participant
    const { data: participant } = await supabase
      .from('calendar_event_participants')
      .select('*, event:calendar_events(id, created_by)')
      .eq('id', participantId)
      .eq('event_id', eventId)
      .single();

    if (!participant) {
      return res.status(404).json({ error: 'Participant not found' });
    }

    // Check authorization - either event creator or the participant themselves
    const isCreator = participant.event?.created_by === req.user.id;
    const isSelf = participant.user_id === req.user.id ||
                   participant.email.toLowerCase() === req.profile.email?.toLowerCase();

    if (!isCreator && !isSelf && req.profile.role !== 'super_admin') {
      return res.status(403).json({ error: 'Not authorized to update this participant' });
    }

    // Participants can only update their response status
    if (!isCreator && isSelf) {
      if (updates.participant_type) {
        delete updates.participant_type;
      }
    }

    if (updates.response_status) {
      updates.responded_at = new Date().toISOString();
    }

    const { data: updated, error } = await supabase
      .from('calendar_event_participants')
      .update(updates)
      .eq('id', participantId)
      .select()
      .single();

    if (error) throw error;

    // Notify event creator of response
    if (updates.response_status && isSelf && !isCreator) {
      await createNotification(
        participant.event.created_by,
        'event_response',
        'Event Response',
        `${req.profile.full_name || req.profile.email} ${updates.response_status} the event invitation`,
        { eventId, participantId, response: updates.response_status }
      );
    }

    logger.info('Participant updated', { eventId, participantId, updates });

    res.json({ success: true, participant: updated });
  })
);

/**
 * DELETE /api/calendar/events/:eventId/participants/:participantId
 * Remove participant from event
 */
router.delete('/events/:eventId/participants/:participantId',
  verifyUser,
  asyncHandler(async (req, res) => {
    const { eventId, participantId } = req.params;

    // Verify event ownership
    const { data: event } = await supabase
      .from('calendar_events')
      .select('id, created_by')
      .eq('id', eventId)
      .single();

    if (!event) {
      return res.status(404).json({ error: 'Event not found' });
    }

    if (event.created_by !== req.user.id && req.profile.role !== 'super_admin') {
      return res.status(403).json({ error: 'Not authorized to remove participants' });
    }

    const { error } = await supabase
      .from('calendar_event_participants')
      .delete()
      .eq('id', participantId)
      .eq('event_id', eventId);

    if (error) throw error;

    logger.info('Participant removed from event', { eventId, participantId });

    res.json({ success: true });
  })
);

// ============================================================
// NOTIFICATIONS
// ============================================================

/**
 * POST /api/calendar/events/:id/notify
 * Send notifications to all participants
 */
router.post('/events/:id/notify', verifyUser, asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { channels = ['email'], message } = req.body;

  // Verify ownership
  const { data: event } = await supabase
    .from('calendar_events')
    .select(`
      *,
      participants:calendar_event_participants(*)
    `)
    .eq('id', id)
    .single();

  if (!event) {
    return res.status(404).json({ error: 'Event not found' });
  }

  if (event.created_by !== req.user.id && req.profile.role !== 'super_admin') {
    return res.status(403).json({ error: 'Not authorized to send notifications' });
  }

  const results = {
    email: { sent: 0, failed: 0 },
    sms: { sent: 0, failed: 0 },
    inApp: { sent: 0, failed: 0 }
  };

  for (const participant of (event.participants || [])) {
    // Skip the organizer
    if (participant.user_id === req.user.id) continue;

    // Email notification
    if (channels.includes('email') && participant.email) {
      try {
        const emailHtml = generateEventEmailHtml(event, participant, false);
        await emailService.sendNotification(
          participant.email,
          `Event: ${event.title} - Surprise Granite`,
          emailService.wrapEmailTemplate(emailHtml, { headerText: 'Event Notification' })
        );
        results.email.sent++;

        // Update notified_at
        await supabase
          .from('calendar_event_participants')
          .update({ notified_at: new Date().toISOString() })
          .eq('id', participant.id);

      } catch (err) {
        logger.apiError(err, { context: 'Event email notification failed', participantId: participant.id });
        results.email.failed++;
      }
    }

    // SMS notification
    if (channels.includes('sms') && participant.phone && smsService) {
      try {
        const startDate = new Date(event.start_time);
        const smsText = `Reminder: "${event.title}" on ${startDate.toLocaleDateString()} at ${startDate.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}${event.location ? ` at ${event.location}` : ''}. - Surprise Granite`;

        await smsService.sendSMS(participant.phone, smsText);
        results.sms.sent++;
      } catch (err) {
        logger.apiError(err, { context: 'Event SMS notification failed', participantId: participant.id });
        results.sms.failed++;
      }
    }

    // In-app notification
    if (participant.user_id) {
      try {
        await createNotification(
          participant.user_id,
          'event_reminder',
          'Event Reminder',
          `Reminder: "${event.title}" on ${new Date(event.start_time).toLocaleString()}`,
          { eventId: id }
        );
        results.inApp.sent++;
      } catch (err) {
        results.inApp.failed++;
      }
    }
  }

  logger.info('Event notifications sent', { eventId: id, results });

  res.json({ success: true, results });
}));

// ============================================================
// AVAILABILITY
// ============================================================

/**
 * GET /api/calendar/availability
 * Check availability for a given date/duration
 */
router.get('/availability', verifyUser, asyncHandler(async (req, res) => {
  const { date, duration_minutes = 60 } = req.query;

  if (!date) {
    return res.status(400).json({ error: 'Date is required (YYYY-MM-DD)' });
  }

  // Get events for the date
  const startOfDay = new Date(date);
  startOfDay.setHours(0, 0, 0, 0);
  const endOfDay = new Date(date);
  endOfDay.setHours(23, 59, 59, 999);

  const { data: events, error } = await supabase
    .from('calendar_events')
    .select('start_time, end_time')
    .eq('created_by', req.user.id)
    .neq('status', 'cancelled')
    .gte('start_time', startOfDay.toISOString())
    .lte('start_time', endOfDay.toISOString())
    .order('start_time');

  if (error) throw error;

  // Generate available slots (business hours: 8am-6pm)
  const slots = [];
  const duration = parseInt(duration_minutes);

  for (let hour = 8; hour < 18; hour++) {
    const slotStart = new Date(date);
    slotStart.setHours(hour, 0, 0, 0);
    const slotEnd = new Date(slotStart.getTime() + duration * 60 * 1000);

    // Check if slot overlaps with any event
    const isAvailable = !events.some(e => {
      const eventStart = new Date(e.start_time);
      const eventEnd = new Date(e.end_time);
      return (slotStart < eventEnd && slotEnd > eventStart);
    });

    slots.push({
      start: slotStart.toISOString(),
      end: slotEnd.toISOString(),
      available: isAvailable
    });
  }

  res.json({ success: true, date, slots });
}));

/**
 * GET /api/calendar/busy-times
 * Get busy times for date range (for calendar display)
 */
router.get('/busy-times', verifyUser, asyncHandler(async (req, res) => {
  const { start_date, end_date } = req.query;

  if (!start_date || !end_date) {
    return res.status(400).json({ error: 'start_date and end_date are required' });
  }

  const { data: events, error } = await supabase
    .from('calendar_events')
    .select('id, start_time, end_time, title, event_type, color')
    .eq('created_by', req.user.id)
    .neq('status', 'cancelled')
    .gte('start_time', start_date)
    .lte('start_time', end_date)
    .order('start_time');

  if (error) throw error;

  res.json({ success: true, events: events || [] });
}));

// ============================================================
// PROJECT-SPECIFIC CALENDAR INTEGRATION
// ============================================================

/**
 * POST /api/calendar/project/:projectId/schedule
 * Create a calendar event for a project with auto-population
 */
router.post('/project/:projectId/schedule',
  verifyUser,
  validateBody(schemas.createEvent),
  asyncHandler(async (req, res) => {
    const { projectId } = req.params;
    const eventData = req.body;

    // Fetch project for auto-population
    const { data: project, error: projectError } = await supabase
      .from('projects')
      .select('*')
      .eq('id', projectId)
      .single();

    if (projectError || !project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    // Verify ownership
    if (project.user_id !== req.user.id && req.profile.role !== 'super_admin') {
      return res.status(403).json({ error: 'Not authorized' });
    }

    // Auto-populate from project
    const { participants = [], ...eventFields } = eventData;

    // Set project_id and auto-fill location if not provided
    eventFields.project_id = projectId;
    eventFields.customer_id = project.customer_id;
    if (!eventFields.location && (project.job_address || project.address)) {
      eventFields.location = project.job_address || project.address;
      eventFields.location_address = [
        project.job_address || project.address,
        project.job_city || project.city,
        project.job_state || project.state,
        project.job_zip || project.zip
      ].filter(Boolean).join(', ');
    }

    // Create event
    const { data: event, error: eventError } = await supabase
      .from('calendar_events')
      .insert({
        ...eventFields,
        created_by: req.user.id
      })
      .select()
      .single();

    if (eventError) throw eventError;

    // Add creator as organizer
    const participantsToAdd = [
      {
        event_id: event.id,
        email: req.profile.email,
        name: req.profile.full_name,
        phone: req.profile.phone,
        user_id: req.user.id,
        participant_type: 'organizer',
        response_status: 'accepted'
      }
    ];

    // Auto-add customer as participant
    if (project.customer_email) {
      participantsToAdd.push({
        event_id: event.id,
        email: project.customer_email.toLowerCase(),
        name: project.customer_name,
        phone: project.customer_phone,
        participant_type: 'attendee',
        response_status: 'pending'
      });
    }

    // Add any additional participants
    for (const p of participants) {
      // Skip if already added (customer or organizer)
      const alreadyAdded = participantsToAdd.some(
        existing => existing.email.toLowerCase() === p.email.toLowerCase()
      );
      if (alreadyAdded) continue;

      participantsToAdd.push({
        event_id: event.id,
        email: p.email.toLowerCase(),
        name: p.name,
        phone: p.phone,
        role: p.role,
        participant_type: p.participant_type || 'attendee',
        response_status: 'pending'
      });
    }

    // Insert participants
    const { data: createdParticipants } = await supabase
      .from('calendar_event_participants')
      .insert(participantsToAdd)
      .select();

    // Update project with scheduled date based on event type
    const projectUpdate = {};
    if (eventData.event_type === 'measurement' || eventData.event_type === 'site_visit') {
      projectUpdate.field_measure_date = eventData.start_time;
    } else if (eventData.event_type === 'installation') {
      projectUpdate.install_date = eventData.start_time;
      projectUpdate.status = 'scheduled';
    }

    if (Object.keys(projectUpdate).length > 0) {
      await supabase
        .from('projects')
        .update(projectUpdate)
        .eq('id', projectId);
    }

    // Log activity
    await supabase
      .from('project_activity')
      .insert({
        project_id: projectId,
        user_id: req.user.id,
        action: 'event_scheduled',
        description: `${eventData.event_type} scheduled for ${new Date(eventData.start_time).toLocaleDateString()}`
      });

    logger.info('Calendar event created for project', {
      projectId, eventId: event.id, eventType: eventData.event_type
    });

    res.status(201).json({
      success: true,
      event,
      participants: createdParticipants || []
    });
  })
);

/**
 * GET /api/calendar/project/:projectId/events
 * Get all calendar events for a project
 */
router.get('/project/:projectId/events', verifyUser, asyncHandler(async (req, res) => {
  const { projectId } = req.params;
  const { include_cancelled = false } = req.query;

  // Verify access
  const { data: project } = await supabase
    .from('projects')
    .select('user_id')
    .eq('id', projectId)
    .single();

  if (!project) {
    return res.status(404).json({ error: 'Project not found' });
  }

  // Check ownership or collaborator access
  if (project.user_id !== req.user.id && req.profile.role !== 'super_admin') {
    const { data: collab } = await supabase
      .from('project_collaborators')
      .select('id')
      .eq('project_id', projectId)
      .eq('user_id', req.user.id)
      .eq('invitation_status', 'accepted')
      .single();

    if (!collab) {
      return res.status(403).json({ error: 'Access denied' });
    }
  }

  let query = supabase
    .from('calendar_events')
    .select(`
      *,
      participants:calendar_event_participants(*)
    `)
    .eq('project_id', projectId)
    .order('start_time', { ascending: true });

  if (include_cancelled !== 'true') {
    query = query.neq('status', 'cancelled');
  }

  const { data: events, error } = await query;

  if (error) throw error;

  res.json({ success: true, events: events || [] });
}));

/**
 * Helper: Auto-create event when project status changes
 * This can be called from a webhook or trigger
 */
async function autoCreateProjectEvent(supabaseClient, projectId, eventType, userId) {
  try {
    const { data: project } = await supabaseClient
      .from('projects')
      .select('*')
      .eq('id', projectId)
      .single();

    if (!project) return null;

    // Determine event details based on type
    let title, startTime, duration;
    switch (eventType) {
      case 'measurement':
        title = `Field Measure - ${project.customer_name}`;
        startTime = project.field_measure_date || new Date(Date.now() + 3 * 24 * 60 * 60 * 1000);
        duration = 60; // 1 hour
        break;
      case 'installation':
        title = `Installation - ${project.customer_name}`;
        startTime = project.install_date || new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
        duration = 240; // 4 hours
        break;
      default:
        title = `${eventType} - ${project.customer_name}`;
        startTime = new Date();
        duration = 60;
    }

    const startDate = new Date(startTime);
    const endDate = new Date(startDate.getTime() + duration * 60 * 1000);

    const { data: event } = await supabaseClient
      .from('calendar_events')
      .insert({
        created_by: userId,
        project_id: projectId,
        customer_id: project.customer_id,
        title,
        event_type: eventType,
        start_time: startDate.toISOString(),
        end_time: endDate.toISOString(),
        location: project.job_address || project.address,
        location_address: [
          project.job_address || project.address,
          project.city, project.state, project.zip
        ].filter(Boolean).join(', '),
        status: 'scheduled'
      })
      .select()
      .single();

    // Add participants
    if (event && project.customer_email) {
      await supabaseClient
        .from('calendar_event_participants')
        .insert({
          event_id: event.id,
          email: project.customer_email,
          name: project.customer_name,
          phone: project.customer_phone,
          participant_type: 'attendee',
          response_status: 'pending'
        });
    }

    return event;
  } catch (err) {
    logger.apiError(err, { context: 'Auto-create project event failed' });
    return null;
  }
}

// Export helper for use in other modules
router.autoCreateProjectEvent = autoCreateProjectEvent;

module.exports = router;
