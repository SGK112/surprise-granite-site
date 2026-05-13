/**
 * SMS Service - Twilio Integration for Surprise Granite
 * Handles SMS notifications for appointments, status updates, and reminders
 */

// Load environment variables
require('dotenv').config();

const { createClient } = require('@supabase/supabase-js');

// Twilio Configuration
const TWILIO_ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID;
const TWILIO_AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN;
const TWILIO_PHONE_NUMBER = process.env.TWILIO_PHONE_NUMBER;

// Lazy-init Supabase service-role client. Used only for the opt-out check —
// we don't take a runtime dep on the rest of the app passing supabase in.
let _supabase = null;
function supa() {
  if (_supabase) return _supabase;
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
  if (url && key) _supabase = createClient(url, key);
  return _supabase;
}

// In-memory opt-out cache — 60s TTL. Most inbound STOPs propagate to all
// callers within that window without hammering Supabase every send.
const OPT_OUT_CACHE_TTL_MS = 60_000;
const _optOutCache = new Map(); // phone -> { optedOut: bool, at: ms }

/**
 * Is this phone opted out of SMS? Checks cache, then Supabase. Fails OPEN
 * only when Supabase is not configured (local dev with no creds); fails
 * CLOSED on real query errors so a transient DB issue cannot accidentally
 * resume sending to someone who opted out.
 */
async function isOptedOut(e164Phone) {
  if (!e164Phone) return false;

  const cached = _optOutCache.get(e164Phone);
  if (cached && Date.now() - cached.at < OPT_OUT_CACHE_TTL_MS) {
    return cached.optedOut;
  }

  const sb = supa();
  if (!sb) {
    // No Supabase configured — local dev only. Allow sends but log loud.
    console.warn('[SMS] No Supabase configured — opt-out check SKIPPED. NEVER ship this to prod.');
    return false;
  }

  try {
    const { data, error } = await sb
      .from('sms_opt_outs')
      .select('phone')
      .eq('phone', e164Phone)
      .maybeSingle();

    if (error) {
      // Relation-doesn't-exist (42P01) means the migration hasn't been run.
      // Log loud and fall through to "not opted out" so SMS keeps flowing —
      // shipping the table behind the code is a known temporary state.
      if (error.code === '42P01') {
        console.error('[SMS] sms_opt_outs table missing — run migration 20260513000001');
        return false;
      }
      // Any other error: fail CLOSED. TCPA penalty > one missed reminder.
      console.error('[SMS] Opt-out check failed, BLOCKING send:', error.message);
      return true;
    }

    const optedOut = !!data;
    _optOutCache.set(e164Phone, { optedOut, at: Date.now() });
    return optedOut;
  } catch (err) {
    console.error('[SMS] Opt-out check threw, BLOCKING send:', err.message);
    return true;
  }
}

/** Manually mark a number as opted out. Used by the inbound webhook. */
async function markOptedOut(e164Phone, keyword, source = 'inbound_webhook') {
  if (!e164Phone) return;
  const sb = supa();
  if (!sb) return;
  try {
    await sb.from('sms_opt_outs').upsert({
      phone: e164Phone,
      keyword: keyword || null,
      source,
      opted_out_at: new Date().toISOString()
    }, { onConflict: 'phone' });
    _optOutCache.set(e164Phone, { optedOut: true, at: Date.now() });
  } catch (err) {
    console.error('[SMS] markOptedOut failed:', err.message);
  }
}

/** Re-opt a number in. Used by inbound START / UNSTOP / YES keyword. */
async function markOptedIn(e164Phone) {
  if (!e164Phone) return;
  const sb = supa();
  if (!sb) return;
  try {
    await sb.from('sms_opt_outs').delete().eq('phone', e164Phone);
    _optOutCache.set(e164Phone, { optedOut: false, at: Date.now() });
  } catch (err) {
    console.error('[SMS] markOptedIn failed:', err.message);
  }
}

// Twilio-honored STOP keywords (case-insensitive, exact match on trimmed body).
// Source: https://help.twilio.com/articles/223134027
const OPT_OUT_KEYWORDS = new Set(['STOP', 'STOPALL', 'UNSUBSCRIBE', 'CANCEL', 'END', 'QUIT']);
const OPT_IN_KEYWORDS  = new Set(['START', 'YES', 'UNSTOP']);

function classifyKeyword(body) {
  const k = (body || '').trim().toUpperCase();
  if (OPT_OUT_KEYWORDS.has(k)) return { type: 'optout', keyword: k };
  if (OPT_IN_KEYWORDS.has(k))  return { type: 'optin',  keyword: k };
  return { type: null, keyword: null };
}

// Initialize Twilio client (lazy load)
let twilioClient = null;

function getTwilioClient() {
  if (!twilioClient && TWILIO_ACCOUNT_SID && TWILIO_AUTH_TOKEN) {
    const twilio = require('twilio');
    twilioClient = twilio(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN);
  }
  return twilioClient;
}

// Company info for messages
const COMPANY = {
  name: 'Surprise Granite',
  phone: '(602) 833-3189',
  website: 'surprisegranite.com'
};

/**
 * Check if SMS is configured
 */
function isConfigured() {
  return !!(TWILIO_ACCOUNT_SID && TWILIO_AUTH_TOKEN && TWILIO_PHONE_NUMBER);
}

/**
 * Format phone number to E.164 format
 */
function formatPhoneNumber(phone) {
  if (!phone) return null;

  // Remove all non-digit characters
  const digits = phone.replace(/\D/g, '');

  // Handle US numbers
  if (digits.length === 10) {
    return `+1${digits}`;
  } else if (digits.length === 11 && digits.startsWith('1')) {
    return `+${digits}`;
  } else if (digits.startsWith('+')) {
    return phone;
  }

  return null;
}

/**
 * Send SMS message. Honors the sms_opt_outs registry — if the recipient
 * has texted STOP/UNSUBSCRIBE/CANCEL/END/QUIT/STOPALL to any of our
 * numbers, this call returns { success:false, error:'opted_out' } without
 * billing Twilio. TCPA compliance — see [[feedback_sms_opt_out]].
 */
async function sendSMS(to, message) {
  if (!isConfigured()) {
    console.log('[SMS] Twilio not configured, skipping SMS');
    return { success: false, error: 'SMS not configured' };
  }

  const formattedPhone = formatPhoneNumber(to);
  if (!formattedPhone) {
    console.log('[SMS] Invalid phone number:', to);
    return { success: false, error: 'Invalid phone number' };
  }

  if (await isOptedOut(formattedPhone)) {
    console.log('[SMS] Recipient opted out — not sending:', formattedPhone);
    return { success: false, error: 'opted_out' };
  }

  try {
    const client = getTwilioClient();
    const result = await client.messages.create({
      body: message,
      from: TWILIO_PHONE_NUMBER,
      to: formattedPhone
    });

    console.log('[SMS] Sent successfully:', result.sid);
    return { success: true, sid: result.sid };
  } catch (error) {
    console.error('[SMS] Error sending:', error.message);
    return { success: false, error: error.message };
  }
}

// ============================================================
// MESSAGE TEMPLATES
// ============================================================

/**
 * Appointment reminder (sent 24 hours before)
 */
function generateAppointmentReminder(appointment) {
  const date = new Date(appointment.scheduled_date).toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric'
  });
  const time = appointment.scheduled_time || '9:00 AM';

  return `Hi ${appointment.customer_name}! This is a reminder from ${COMPANY.name} about your appointment tomorrow (${date}) at ${time}. Reply CONFIRM to confirm or call us at ${COMPANY.phone} to reschedule.`;
}

/**
 * Appointment confirmation
 */
function generateAppointmentConfirmation(appointment) {
  const date = new Date(appointment.scheduled_date).toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric'
  });
  const time = appointment.scheduled_time || '9:00 AM';

  return `Your appointment with ${COMPANY.name} is confirmed for ${date} at ${time}. We'll see you then! Questions? Call ${COMPANY.phone}`;
}

/**
 * Job scheduled notification
 */
function generateJobScheduledSMS(job) {
  const date = new Date(job.scheduled_date).toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric'
  });

  return `${COMPANY.name}: Your installation is scheduled for ${date}. Our team will arrive between 8-10 AM. We'll send a reminder the day before. Questions? ${COMPANY.phone}`;
}

/**
 * Job status update
 */
function generateJobStatusSMS(job, newStatus) {
  const statusMessages = {
    'material_ordered': `${COMPANY.name}: Great news! Materials for your project have been ordered. We'll notify you when they arrive.`,
    'material_received': `${COMPANY.name}: Your materials have arrived! We'll be scheduling your installation soon.`,
    'scheduled': `${COMPANY.name}: Your installation has been scheduled. Check your email for details or call ${COMPANY.phone}.`,
    'in_progress': `${COMPANY.name}: Our team is working on your project today! We'll update you when complete.`,
    'completed': `${COMPANY.name}: Your installation is complete! Thank you for choosing us. We'd love your feedback - please check your email for a review link.`,
    'on_hold': `${COMPANY.name}: Your project has been placed on hold. Please call us at ${COMPANY.phone} for details.`
  };

  return statusMessages[newStatus] || `${COMPANY.name}: Your project status has been updated to: ${newStatus.replace(/_/g, ' ')}. Questions? Call ${COMPANY.phone}`;
}

/**
 * Estimate sent notification
 */
function generateEstimateSentSMS(estimate) {
  const total = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD'
  }).format(estimate.total || 0);

  return `${COMPANY.name}: Your estimate (${estimate.estimate_number}) for ${total} has been sent to your email. Review and approve online or call ${COMPANY.phone} with questions.`;
}

/**
 * Estimate approved thank you
 */
function generateEstimateApprovedSMS(estimate) {
  return `${COMPANY.name}: Thank you for approving your estimate! We'll be in touch soon to schedule your project. Questions? ${COMPANY.phone}`;
}

/**
 * Invoice sent notification
 */
function generateInvoiceSentSMS(invoice) {
  const total = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD'
  }).format(invoice.total || 0);
  const dueDate = new Date(invoice.due_date).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric'
  });

  return `${COMPANY.name}: Invoice ${invoice.invoice_number} for ${total} is ready. Due: ${dueDate}. Pay online via the link in your email or call ${COMPANY.phone}.`;
}

/**
 * Payment received confirmation
 */
function generatePaymentReceivedSMS(payment) {
  const amount = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD'
  }).format(payment.amount || 0);

  return `${COMPANY.name}: Payment of ${amount} received. Thank you! A receipt has been sent to your email.`;
}

/**
 * Lead follow-up
 */
function generateLeadFollowUpSMS(lead) {
  return `Hi ${lead.first_name || 'there'}! This is ${COMPANY.name} following up on your inquiry. We'd love to help with your project. Reply or call ${COMPANY.phone} to discuss. - ${COMPANY.name} Team`;
}

/**
 * Measurement appointment scheduled
 */
function generateMeasurementScheduledSMS(appointment) {
  const date = new Date(appointment.scheduled_date).toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric'
  });
  const time = appointment.scheduled_time || '9:00 AM';

  return `${COMPANY.name}: Your free measurement appointment is scheduled for ${date} at ${time}. Our estimator will call when they're on the way. See you then!`;
}

/**
 * Contractor assignment notification (to contractor)
 */
function generateContractorAssignmentSMS(job, contractor) {
  const date = job.scheduled_date ? new Date(job.scheduled_date).toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric'
  }) : 'TBD';

  return `New job assigned: ${job.title || 'Installation'} at ${job.address || 'See details'}. Date: ${date}. Check your email for full details. - ${COMPANY.name}`;
}

// ============================================================
// SEND FUNCTIONS (Convenience wrappers)
// ============================================================

async function sendAppointmentReminder(appointment, phone) {
  const message = generateAppointmentReminder(appointment);
  return sendSMS(phone, message);
}

async function sendAppointmentConfirmation(appointment, phone) {
  const message = generateAppointmentConfirmation(appointment);
  return sendSMS(phone, message);
}

async function sendJobScheduledNotification(job, phone) {
  const message = generateJobScheduledSMS(job);
  return sendSMS(phone, message);
}

async function sendJobStatusUpdate(job, newStatus, phone) {
  const message = generateJobStatusSMS(job, newStatus);
  return sendSMS(phone, message);
}

async function sendEstimateNotification(estimate, phone) {
  const message = generateEstimateSentSMS(estimate);
  return sendSMS(phone, message);
}

async function sendEstimateApprovedNotification(estimate, phone) {
  const message = generateEstimateApprovedSMS(estimate);
  return sendSMS(phone, message);
}

async function sendInvoiceNotification(invoice, phone) {
  const message = generateInvoiceSentSMS(invoice);
  return sendSMS(phone, message);
}

async function sendPaymentConfirmation(payment, phone) {
  const message = generatePaymentReceivedSMS(payment);
  return sendSMS(phone, message);
}

async function sendLeadFollowUp(lead, phone) {
  const message = generateLeadFollowUpSMS(lead);
  return sendSMS(phone, message);
}

async function sendMeasurementScheduled(appointment, phone) {
  const message = generateMeasurementScheduledSMS(appointment);
  return sendSMS(phone, message);
}

async function sendContractorAssignment(job, contractor, phone) {
  const message = generateContractorAssignmentSMS(job, contractor);
  return sendSMS(phone, message);
}

// ============================================================
// EXPORTS
// ============================================================

module.exports = {
  // Core
  sendSMS,
  isConfigured,
  formatPhoneNumber,

  // TCPA opt-out registry
  isOptedOut,
  markOptedOut,
  markOptedIn,
  classifyKeyword,
  OPT_OUT_KEYWORDS,
  OPT_IN_KEYWORDS,

  // Message generators
  generateAppointmentReminder,
  generateAppointmentConfirmation,
  generateJobScheduledSMS,
  generateJobStatusSMS,
  generateEstimateSentSMS,
  generateEstimateApprovedSMS,
  generateInvoiceSentSMS,
  generatePaymentReceivedSMS,
  generateLeadFollowUpSMS,
  generateMeasurementScheduledSMS,
  generateContractorAssignmentSMS,

  // Convenience send functions
  sendAppointmentReminder,
  sendAppointmentConfirmation,
  sendJobScheduledNotification,
  sendJobStatusUpdate,
  sendEstimateNotification,
  sendEstimateApprovedNotification,
  sendInvoiceNotification,
  sendPaymentConfirmation,
  sendLeadFollowUp,
  sendMeasurementScheduled,
  sendContractorAssignment,

  // Company info
  COMPANY
};
