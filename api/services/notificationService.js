/**
 * SURPRISE GRANITE - NOTIFICATION SERVICE
 * Push notifications to business owner via multiple channels
 */

const { createClient } = require('@supabase/supabase-js');
const logger = require('../utils/logger') || console;

// Initialize Supabase
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://ypeypgwsycxcagncgdur.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;

let supabase = null;
if (SUPABASE_URL && SUPABASE_SERVICE_KEY) {
  supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
}

// Email service reference (lazy load to avoid circular deps)
let emailService = null;
let smsService = null;

const getEmailService = () => {
  if (!emailService) {
    try {
      emailService = require('./emailService');
    } catch (e) {
      logger.warn?.('[NotificationService] Email service not available');
    }
  }
  return emailService;
};

const getSmsService = () => {
  if (!smsService) {
    try {
      smsService = require('./smsService');
    } catch (e) {
      logger.warn?.('[NotificationService] SMS service not available');
    }
  }
  return smsService;
};

// Default admin email
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'mike@surprisegranite.com';

// Notification types and their default settings
const NOTIFICATION_TYPES = {
  new_lead: { priority: 'high', channels: ['inapp', 'email', 'sms'], title: 'New Lead' },
  lead_captured_aria: { priority: 'high', channels: ['inapp', 'email', 'sms'], title: 'Lead Captured by Aria' },
  appointment_booked: { priority: 'high', channels: ['inapp', 'email'], title: 'New Appointment' },
  quote_approved: { priority: 'high', channels: ['inapp', 'email', 'sms'], title: 'Quote Approved' },
  payment_received: { priority: 'high', channels: ['inapp', 'email'], title: 'Payment Received' },
  message_received: { priority: 'normal', channels: ['inapp'], title: 'New Message' },
  collaboration_invite: { priority: 'normal', channels: ['inapp', 'email'], title: 'Collaboration Invite' },
  collaboration_accepted: { priority: 'normal', channels: ['inapp'], title: 'Collaboration Accepted' },
  job_status_change: { priority: 'normal', channels: ['inapp'], title: 'Job Status Update' },
  reminder: { priority: 'normal', channels: ['inapp'], title: 'Reminder' },
  system: { priority: 'low', channels: ['inapp'], title: 'System Notification' }
};

/**
 * Create an in-app notification
 */
async function createInAppNotification(userId, type, title, message, data = {}) {
  if (!supabase) {
    logger.warn?.('[NotificationService] Supabase not configured');
    return null;
  }

  try {
    const { data: notification, error } = await supabase
      .from('pro_notifications')
      .insert({
        pro_user_id: userId,
        notification_type: type,
        title,
        message,
        data,
        read: false
      })
      .select()
      .single();

    if (error) throw error;

    logger.info?.('[NotificationService] In-app notification created', {
      notificationId: notification?.id, userId, type
    });

    return notification;
  } catch (err) {
    logger.error?.('[NotificationService] Failed to create in-app notification:', err);
    return null;
  }
}

/**
 * Send email notification
 */
async function sendEmailNotification(email, subject, htmlBody) {
  const emailSvc = getEmailService();
  if (!emailSvc) {
    logger.warn?.('[NotificationService] Email service not available');
    return false;
  }

  try {
    await emailSvc.sendNotification(email, subject, htmlBody);
    logger.info?.('[NotificationService] Email sent', { email, subject });
    return true;
  } catch (err) {
    logger.error?.('[NotificationService] Failed to send email:', err);
    return false;
  }
}

/**
 * Send SMS notification
 */
async function sendSmsNotification(phone, message) {
  const smsSvc = getSmsService();
  if (!smsSvc) {
    logger.warn?.('[NotificationService] SMS service not available');
    return false;
  }

  try {
    await smsSvc.sendSMS(phone, message);
    logger.info?.('[NotificationService] SMS sent', { phone: phone.slice(-4) });
    return true;
  } catch (err) {
    logger.error?.('[NotificationService] Failed to send SMS:', err);
    return false;
  }
}

/**
 * Get user's notification preferences
 */
async function getUserNotificationPreferences(userId) {
  if (!supabase) return null;

  try {
    const { data: profile } = await supabase
      .from('sg_users')
      .select('notification_preferences, email, phone')
      .eq('id', userId)
      .single();

    return profile;
  } catch (err) {
    logger.error?.('[NotificationService] Failed to get user preferences:', err);
    return null;
  }
}

/**
 * Main notification function - sends to appropriate channels based on type and preferences
 */
async function notifyUser(userId, type, data) {
  const typeConfig = NOTIFICATION_TYPES[type] || NOTIFICATION_TYPES.system;
  const title = data.title || typeConfig.title;
  const message = data.message || '';
  const metadata = data.metadata || {};
  const priority = data.priority || typeConfig.priority;

  const results = {
    inApp: false,
    email: false,
    sms: false
  };

  // Get user preferences
  const userPrefs = await getUserNotificationPreferences(userId);
  const preferences = userPrefs?.notification_preferences || {};
  const channels = data.channels || typeConfig.channels;

  // Determine which channels to use based on preferences and type
  const useInApp = channels.includes('inapp') && preferences.inApp !== false;
  const useEmail = channels.includes('email') &&
    preferences.email !== false &&
    (priority === 'high' || preferences.email === true);
  const useSms = channels.includes('sms') &&
    preferences.sms !== false &&
    priority === 'high' &&
    preferences.sms === true;

  // In-app notification (always create unless explicitly disabled)
  if (useInApp) {
    const notification = await createInAppNotification(userId, type, title, message, metadata);
    results.inApp = !!notification;
  }

  // Email notification
  if (useEmail && userPrefs?.email) {
    const emailHtml = generateNotificationEmailHtml(type, title, message, metadata);
    results.email = await sendEmailNotification(
      userPrefs.email,
      `${title} - Surprise Granite`,
      emailHtml
    );
  }

  // SMS notification (only for high priority)
  if (useSms && userPrefs?.phone) {
    const smsText = `${title}: ${message.substring(0, 140)}${message.length > 140 ? '...' : ''} - Surprise Granite`;
    results.sms = await sendSmsNotification(userPrefs.phone, smsText);
  }

  logger.info?.('[NotificationService] User notified', { userId, type, priority, results });

  return results;
}

/**
 * Notify the business owner (admin) - convenience function
 */
async function notifyOwner(type, data) {
  // Get owner user ID from settings or use default admin
  let ownerUserId = null;

  if (supabase) {
    try {
      // Try to get the owner/admin user
      const { data: admin } = await supabase
        .from('sg_users')
        .select('id')
        .eq('email', ADMIN_EMAIL)
        .single();

      ownerUserId = admin?.id;
    } catch (err) {
      logger.warn?.('[NotificationService] Could not find admin user');
    }
  }

  const results = {
    inApp: false,
    email: false,
    sms: false
  };

  // If we have the owner's user ID, use the full notification system
  if (ownerUserId) {
    return notifyUser(ownerUserId, type, {
      ...data,
      channels: ['inapp', 'email', 'sms'] // Always use all channels for owner
    });
  }

  // Fallback: send email directly to admin
  const typeConfig = NOTIFICATION_TYPES[type] || NOTIFICATION_TYPES.system;
  const title = data.title || typeConfig.title;
  const message = data.message || '';
  const metadata = data.metadata || {};

  const emailHtml = generateNotificationEmailHtml(type, title, message, metadata);
  results.email = await sendEmailNotification(
    ADMIN_EMAIL,
    `${title} - Surprise Granite`,
    emailHtml
  );

  return results;
}

/**
 * Notify about a new lead captured by Aria
 */
async function notifyAriaLead(leadData) {
  return notifyOwner('lead_captured_aria', {
    title: `New Lead: ${leadData.name || 'Unknown'}`,
    message: `${leadData.project_type || 'Inquiry'} - Phone: ${leadData.phone || 'N/A'}`,
    metadata: leadData
  });
}

/**
 * Notify about a new appointment booked
 */
async function notifyAppointmentBooked(appointmentData) {
  return notifyOwner('appointment_booked', {
    title: 'New Appointment Booked',
    message: `${appointmentData.customer_name || 'Customer'} - ${new Date(appointmentData.start_time).toLocaleString()}`,
    metadata: appointmentData
  });
}

/**
 * Notify about a quote being approved
 */
async function notifyQuoteApproved(quoteData) {
  return notifyOwner('quote_approved', {
    title: 'Quote Approved!',
    message: `${quoteData.customer_name || 'Customer'} approved quote for $${(quoteData.total || 0).toLocaleString()}`,
    metadata: quoteData
  });
}

/**
 * Generate notification email HTML
 */
function generateNotificationEmailHtml(type, title, message, metadata = {}) {
  const typeColors = {
    new_lead: '#f9cb00',
    lead_captured_aria: '#f9cb00',
    appointment_booked: '#3b82f6',
    quote_approved: '#10b981',
    payment_received: '#10b981',
    message_received: '#8b5cf6',
    collaboration_invite: '#6366f1',
    job_status_change: '#f59e0b',
    reminder: '#f97316',
    system: '#6b7280'
  };

  const color = typeColors[type] || '#6b7280';

  return `
<!DOCTYPE html>
<html>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #f5f5f5;">
  <table width="100%" cellspacing="0" cellpadding="0" style="background: #f5f5f5; padding: 40px 20px;">
    <tr>
      <td align="center">
        <table width="500" cellspacing="0" cellpadding="0" style="background: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 20px rgba(0,0,0,0.1);">
          <tr>
            <td style="background: linear-gradient(135deg, ${color} 0%, ${adjustColor(color, -20)} 100%); padding: 25px; text-align: center;">
              <h1 style="margin: 0; color: #ffffff; font-size: 22px; text-shadow: 0 1px 2px rgba(0,0,0,0.1);">${escapeHtml(title)}</h1>
            </td>
          </tr>
          <tr>
            <td style="padding: 30px;">
              <p style="margin: 0 0 20px; color: #333; font-size: 16px; line-height: 1.6;">
                ${escapeHtml(message)}
              </p>

              ${Object.keys(metadata).length > 0 ? `
              <div style="background: #f8f8f8; border-radius: 8px; padding: 20px; margin-top: 20px;">
                <table width="100%" cellspacing="0" cellpadding="8">
                  ${Object.entries(metadata)
                    .filter(([key]) => !['raw', 'internal'].includes(key))
                    .slice(0, 8)
                    .map(([key, value]) => `
                  <tr>
                    <td style="color: #666; font-weight: 600; width: 120px; vertical-align: top;">
                      ${escapeHtml(formatKey(key))}:
                    </td>
                    <td style="color: #333;">
                      ${escapeHtml(String(value || 'N/A').substring(0, 200))}
                    </td>
                  </tr>
                  `).join('')}
                </table>
              </div>
              ` : ''}

              <div style="margin-top: 30px; text-align: center;">
                <a href="https://surprisegranite.com/account/" style="display: inline-block; background: ${color}; color: #fff; text-decoration: none; padding: 14px 30px; border-radius: 8px; font-weight: 600;">
                  View in Dashboard
                </a>
              </div>
            </td>
          </tr>
          <tr>
            <td style="background: #1a1a2e; padding: 20px; text-align: center;">
              <p style="margin: 0; color: #888; font-size: 12px;">
                Surprise Granite Notification System
              </p>
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
 * Helper: Format metadata key for display
 */
function formatKey(key) {
  return key
    .replace(/_/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/\b\w/g, l => l.toUpperCase());
}

/**
 * Helper: Escape HTML
 */
function escapeHtml(text) {
  if (!text) return '';
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/**
 * Helper: Adjust color brightness
 */
function adjustColor(hex, amount) {
  const num = parseInt(hex.replace('#', ''), 16);
  const r = Math.min(255, Math.max(0, (num >> 16) + amount));
  const g = Math.min(255, Math.max(0, ((num >> 8) & 0x00FF) + amount));
  const b = Math.min(255, Math.max(0, (num & 0x0000FF) + amount));
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
}

/**
 * Bulk notify users (for announcements, etc.)
 */
async function bulkNotify(userIds, type, data) {
  const results = [];
  for (const userId of userIds) {
    const result = await notifyUser(userId, type, data);
    results.push({ userId, ...result });
  }
  return results;
}

/**
 * Mark notification as read
 */
async function markNotificationRead(notificationId, userId) {
  if (!supabase) return false;

  try {
    const { error } = await supabase
      .from('pro_notifications')
      .update({ is_read: true, read_at: new Date().toISOString() })
      .eq('id', notificationId)
      .eq('pro_user_id', userId);

    return !error;
  } catch (err) {
    logger.error?.('[NotificationService] Failed to mark notification read:', err);
    return false;
  }
}

/**
 * Get unread notification count
 */
async function getUnreadCount(userId) {
  if (!supabase) return 0;

  try {
    const { count, error } = await supabase
      .from('pro_notifications')
      .select('id', { count: 'exact', head: true })
      .eq('pro_user_id', userId)
      .eq('is_read', false);

    return error ? 0 : count;
  } catch (err) {
    logger.error?.('[NotificationService] Failed to get unread count:', err);
    return 0;
  }
}

module.exports = {
  // Core functions
  notifyUser,
  notifyOwner,
  createInAppNotification,
  sendEmailNotification,
  sendSmsNotification,

  // Convenience functions
  notifyAriaLead,
  notifyAppointmentBooked,
  notifyQuoteApproved,
  bulkNotify,

  // Utilities
  markNotificationRead,
  getUnreadCount,
  getUserNotificationPreferences,

  // Constants
  NOTIFICATION_TYPES
};
