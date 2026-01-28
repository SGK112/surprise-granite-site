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
const { escapeHtml } = require('../utils/security');

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
      'appointment', 'measurement', 'installation', 'delivery',
      'meeting', 'follow_up', 'consultation', 'site_visit', 'other'
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
      'appointment', 'measurement', 'installation', 'delivery',
      'meeting', 'follow_up', 'consultation', 'site_visit', 'other'
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

module.exports = router;
