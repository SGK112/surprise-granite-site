/**
 * SURPRISE GRANITE - AUTOMATION WORKER
 * Processes automation sequences on interval
 * Run with: node api/workers/automation-worker.js
 * Or integrate into server.js with setInterval
 */

const { createClient } = require('@supabase/supabase-js');

// Configuration
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://ypeypgwsycxcagncgdur.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;

// Processing settings
const BATCH_SIZE = 50;
const PROCESS_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

let supabase = null;
let emailService = null;
let smsService = null;
let notificationService = null;

// Initialize services
function initServices() {
  if (SUPABASE_URL && SUPABASE_SERVICE_KEY) {
    supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
  } else {
    console.error('[AutomationWorker] Supabase not configured');
    process.exit(1);
  }

  try {
    emailService = require('../services/emailService');
  } catch (e) {
    console.warn('[AutomationWorker] Email service not available');
  }

  try {
    smsService = require('../services/smsService');
  } catch (e) {
    console.warn('[AutomationWorker] SMS service not available');
  }

  try {
    notificationService = require('../services/notificationService');
  } catch (e) {
    console.warn('[AutomationWorker] Notification service not available');
  }
}

/**
 * Main processing function
 */
async function processAutomation() {
  const startTime = Date.now();
  console.log('[AutomationWorker] Starting processing cycle...');

  try {
    // Get pending enrollments (where next_action_at <= NOW)
    const { data: pendingEnrollments, error: fetchError } = await supabase
      .from('automation_enrollments')
      .select(`
        *,
        sequence:automation_sequences!sequence_id(id, name, steps, is_active),
        lead:leads!lead_id(id, name, email, phone),
        customer:customers!customer_id(id, name, email, phone)
      `)
      .eq('status', 'active')
      .lte('next_action_at', new Date().toISOString())
      .limit(BATCH_SIZE);

    if (fetchError) {
      console.error('[AutomationWorker] Failed to fetch enrollments:', fetchError);
      return;
    }

    if (!pendingEnrollments || pendingEnrollments.length === 0) {
      console.log('[AutomationWorker] No pending actions');
      return;
    }

    console.log(`[AutomationWorker] Processing ${pendingEnrollments.length} enrollments`);

    let processed = 0;
    let succeeded = 0;
    let failed = 0;

    for (const enrollment of pendingEnrollments) {
      processed++;

      try {
        // Skip if sequence is no longer active
        if (!enrollment.sequence?.is_active) {
          console.log(`[AutomationWorker] Skipping ${enrollment.id} - sequence inactive`);
          await markEnrollmentPaused(enrollment.id, 'Sequence deactivated');
          continue;
        }

        const steps = enrollment.sequence.steps || [];
        const currentStepIndex = enrollment.current_step;

        // Check if we've completed all steps
        if (currentStepIndex >= steps.length) {
          await completeEnrollment(enrollment);
          succeeded++;
          continue;
        }

        const currentStep = steps[currentStepIndex];

        // Execute the step
        const result = await executeStep(enrollment, currentStep);

        if (result.success) {
          succeeded++;
          await advanceEnrollment(enrollment, currentStep, result);
        } else {
          failed++;
          await logStepExecution(enrollment, currentStep, 'failed', result.error);
        }

      } catch (err) {
        console.error(`[AutomationWorker] Error processing enrollment ${enrollment.id}:`, err);
        failed++;
        await logStepExecution(enrollment, { step_number: enrollment.current_step }, 'failed', err.message);
      }
    }

    const duration = Date.now() - startTime;
    console.log(`[AutomationWorker] Completed: ${processed} processed, ${succeeded} succeeded, ${failed} failed (${duration}ms)`);

  } catch (err) {
    console.error('[AutomationWorker] Processing error:', err);
  }
}

/**
 * Execute a single step
 */
async function executeStep(enrollment, step) {
  const actionType = step.action_type;
  const templateId = step.template_id;

  // Get recipient info
  const recipient = {
    email: enrollment.contact_email || enrollment.lead?.email || enrollment.customer?.email,
    phone: enrollment.contact_phone || enrollment.lead?.phone || enrollment.customer?.phone,
    name: enrollment.contact_name || enrollment.lead?.name || enrollment.customer?.name
  };

  if (!recipient.email && !recipient.phone) {
    return { success: false, error: 'No contact information available' };
  }

  // Get template if specified
  let template = null;
  if (templateId) {
    const { data } = await supabase
      .from('automation_templates')
      .select('*')
      .eq('id', templateId)
      .single();
    template = data;
  }

  // Apply template override if provided
  if (step.template_override) {
    template = { ...template, ...step.template_override };
  }

  // Get business context for variable replacement
  const context = await getBusinessContext();
  const variables = {
    first_name: recipient.name?.split(' ')[0] || 'there',
    name: recipient.name || 'Valued Customer',
    email: recipient.email || '',
    phone: recipient.phone || '',
    business_name: context.businessName || 'Surprise Granite',
    website_url: context.websiteUrl || 'https://surprisegranite.com',
    ...step.variables
  };

  switch (actionType) {
    case 'email':
      return await executeEmailStep(recipient, template, variables);

    case 'sms':
      return await executeSmsStep(recipient, template, variables);

    case 'notification':
      return await executeNotificationStep(enrollment, template, variables);

    case 'task':
      return await executeTaskStep(enrollment, step, variables);

    case 'webhook':
      return await executeWebhookStep(enrollment, step, variables);

    default:
      return { success: false, error: `Unknown action type: ${actionType}` };
  }
}

/**
 * Execute email step
 */
async function executeEmailStep(recipient, template, variables) {
  if (!emailService) {
    return { success: false, error: 'Email service not available' };
  }

  if (!recipient.email) {
    return { success: false, error: 'No email address' };
  }

  const subject = replaceVariables(template?.email_subject || 'Message from Surprise Granite', variables);
  const body = replaceVariables(template?.email_body || 'Hello {first_name},', variables);

  try {
    await emailService.sendNotification(recipient.email, subject, body);
    return { success: true, channel: 'email', recipient: recipient.email };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

/**
 * Execute SMS step
 */
async function executeSmsStep(recipient, template, variables) {
  if (!smsService) {
    return { success: false, error: 'SMS service not available' };
  }

  if (!recipient.phone) {
    return { success: false, error: 'No phone number' };
  }

  const message = replaceVariables(template?.sms_body || 'Hello from Surprise Granite!', variables);

  try {
    await smsService.sendSMS(recipient.phone, message);
    return { success: true, channel: 'sms', recipient: recipient.phone };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

/**
 * Execute in-app notification step
 */
async function executeNotificationStep(enrollment, template, variables) {
  if (!notificationService) {
    return { success: false, error: 'Notification service not available' };
  }

  // Get user ID for notification
  let userId = null;
  if (enrollment.customer_id) {
    const { data } = await supabase
      .from('customers')
      .select('user_id')
      .eq('id', enrollment.customer_id)
      .single();
    userId = data?.user_id;
  }

  if (!userId) {
    return { success: false, error: 'No user ID for notification' };
  }

  const title = replaceVariables(template?.notification_title || 'Notification', variables);
  const body = replaceVariables(template?.notification_body || '', variables);

  try {
    await notificationService.createInAppNotification(userId, template?.notification_type || 'automation', title, body);
    return { success: true, channel: 'notification', userId };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

/**
 * Execute task creation step
 */
async function executeTaskStep(enrollment, step, variables) {
  // Create a task/reminder for the business owner
  try {
    const { data } = await supabase
      .from('automation_sequences')
      .select('user_id')
      .eq('id', enrollment.sequence_id)
      .single();

    if (data?.user_id) {
      await supabase
        .from('pro_notifications')
        .insert({
          pro_user_id: data.user_id,
          notification_type: 'automation_task',
          title: replaceVariables(step.task_title || 'Follow-up Task', variables),
          message: replaceVariables(step.task_description || 'Follow up with {name}', variables),
          data: {
            enrollment_id: enrollment.id,
            lead_id: enrollment.lead_id,
            customer_id: enrollment.customer_id
          }
        });

      return { success: true, channel: 'task' };
    }

    return { success: false, error: 'No owner user ID' };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

/**
 * Execute webhook step
 */
async function executeWebhookStep(enrollment, step, variables) {
  if (!step.webhook_url) {
    return { success: false, error: 'No webhook URL configured' };
  }

  try {
    const payload = {
      enrollment_id: enrollment.id,
      lead_id: enrollment.lead_id,
      customer_id: enrollment.customer_id,
      contact_email: enrollment.contact_email,
      contact_phone: enrollment.contact_phone,
      contact_name: enrollment.contact_name,
      step_number: step.step_number,
      timestamp: new Date().toISOString(),
      ...step.webhook_data
    };

    const response = await fetch(step.webhook_url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(step.webhook_headers || {})
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      return { success: false, error: `Webhook returned ${response.status}` };
    }

    return { success: true, channel: 'webhook', status: response.status };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

/**
 * Advance enrollment to next step
 */
async function advanceEnrollment(enrollment, executedStep, result) {
  const steps = enrollment.sequence.steps || [];
  const nextStepIndex = enrollment.current_step + 1;

  // Log successful execution
  await logStepExecution(enrollment, executedStep, 'success', null, result);

  // Check if there are more steps
  if (nextStepIndex >= steps.length) {
    await completeEnrollment(enrollment);
    return;
  }

  // Calculate next action time
  const nextStep = steps[nextStepIndex];
  const delayHours = nextStep.delay_hours || 0;
  const nextActionAt = new Date(Date.now() + delayHours * 60 * 60 * 1000);

  // Update step history
  const stepHistory = enrollment.step_history || [];
  stepHistory.push({
    step_number: executedStep.step_number,
    executed_at: new Date().toISOString(),
    action_type: executedStep.action_type,
    result: 'success',
    details: result
  });

  await supabase
    .from('automation_enrollments')
    .update({
      current_step: nextStepIndex,
      next_action_at: nextActionAt.toISOString(),
      last_action_at: new Date().toISOString(),
      step_history: stepHistory
    })
    .eq('id', enrollment.id);
}

/**
 * Complete an enrollment
 */
async function completeEnrollment(enrollment) {
  await supabase
    .from('automation_enrollments')
    .update({
      status: 'completed',
      completed_at: new Date().toISOString(),
      next_action_at: null
    })
    .eq('id', enrollment.id);

  // Update sequence stats
  await supabase.rpc('increment_sequence_completed', { sequence_id: enrollment.sequence_id });

  console.log(`[AutomationWorker] Enrollment ${enrollment.id} completed`);
}

/**
 * Mark enrollment as paused
 */
async function markEnrollmentPaused(enrollmentId, reason) {
  await supabase
    .from('automation_enrollments')
    .update({
      status: 'paused',
      paused_at: new Date().toISOString(),
      metadata: { pause_reason: reason }
    })
    .eq('id', enrollmentId);
}

/**
 * Log step execution
 */
async function logStepExecution(enrollment, step, status, errorMessage = null, details = {}) {
  try {
    await supabase
      .from('automation_logs')
      .insert({
        enrollment_id: enrollment.id,
        sequence_id: enrollment.sequence_id,
        step_number: step.step_number,
        action_type: step.action_type,
        status,
        error_message: errorMessage,
        recipient_email: enrollment.contact_email,
        recipient_phone: enrollment.contact_phone,
        template_id: step.template_id,
        metadata: details
      });
  } catch (err) {
    console.error('[AutomationWorker] Failed to log step execution:', err);
  }
}

/**
 * Replace template variables
 */
function replaceVariables(text, variables) {
  if (!text) return text;
  return text.replace(/\{(\w+)\}/g, (match, key) => {
    return variables[key] !== undefined ? variables[key] : match;
  });
}

/**
 * Get business context for variable replacement
 */
async function getBusinessContext() {
  // TODO: Load from settings table
  return {
    businessName: 'Surprise Granite',
    websiteUrl: 'https://surprisegranite.com',
    phone: '(602) 833-3189'
  };
}

/**
 * Process appointment reminders (special handling)
 */
async function processAppointmentReminders() {
  console.log('[AutomationWorker] Processing appointment reminders...');

  try {
    // Get appointments in the next 24 hours that haven't been reminded
    const { data: upcomingEvents } = await supabase
      .from('calendar_events')
      .select(`
        *,
        participants:calendar_event_participants(*)
      `)
      .eq('status', 'scheduled')
      .gte('start_time', new Date().toISOString())
      .lte('start_time', new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString());

    if (!upcomingEvents || upcomingEvents.length === 0) {
      console.log('[AutomationWorker] No upcoming appointments to remind');
      return;
    }

    for (const event of upcomingEvents) {
      const remindersSent = event.reminders_sent || {};
      const reminderMinutes = event.reminder_minutes || [1440, 60];

      for (const minutes of reminderMinutes) {
        const reminderTime = new Date(event.start_time).getTime() - minutes * 60 * 1000;
        const reminderKey = `${minutes}min`;

        // Skip if already sent or not time yet
        if (remindersSent[reminderKey] || Date.now() < reminderTime) {
          continue;
        }

        // Send reminders to participants
        for (const participant of (event.participants || [])) {
          if (participant.email && emailService) {
            try {
              const subject = `Reminder: ${event.title} - ${formatEventTime(event.start_time)}`;
              const body = generateReminderEmail(event, participant);
              await emailService.sendNotification(participant.email, subject, body);
            } catch (err) {
              console.error('[AutomationWorker] Failed to send reminder email:', err);
            }
          }

          if (participant.phone && smsService && minutes <= 60) {
            try {
              const message = `Reminder: ${event.title} at ${formatEventTime(event.start_time)}${event.location ? ` - ${event.location}` : ''}`;
              await smsService.sendSMS(participant.phone, message);
            } catch (err) {
              console.error('[AutomationWorker] Failed to send reminder SMS:', err);
            }
          }
        }

        // Mark reminder as sent
        remindersSent[reminderKey] = new Date().toISOString();
        await supabase
          .from('calendar_events')
          .update({ reminders_sent: remindersSent })
          .eq('id', event.id);
      }
    }

  } catch (err) {
    console.error('[AutomationWorker] Error processing appointment reminders:', err);
  }
}

/**
 * Format event time for display
 */
function formatEventTime(isoTime) {
  const date = new Date(isoTime);
  return date.toLocaleString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  });
}

/**
 * Generate reminder email HTML
 */
function generateReminderEmail(event, participant) {
  return `
    <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
      <h2 style="color: #1a1a2e;">Appointment Reminder</h2>
      <p>This is a reminder about your upcoming appointment:</p>
      <div style="background: #f8f8f8; padding: 20px; border-radius: 8px; margin: 20px 0;">
        <h3 style="margin: 0 0 10px;">${event.title}</h3>
        <p style="margin: 5px 0;"><strong>When:</strong> ${formatEventTime(event.start_time)}</p>
        ${event.location ? `<p style="margin: 5px 0;"><strong>Where:</strong> ${event.location}</p>` : ''}
        ${event.location_address ? `<p style="margin: 5px 0;"><strong>Address:</strong> ${event.location_address}</p>` : ''}
      </div>
      <p>We look forward to seeing you!</p>
      <p style="color: #888; font-size: 12px;">- Surprise Granite</p>
    </div>
  `;
}

/**
 * Main worker loop
 */
async function runWorker() {
  console.log('[AutomationWorker] Starting automation worker...');
  initServices();

  // Initial run
  await processAutomation();
  await processAppointmentReminders();

  // Schedule recurring runs
  setInterval(async () => {
    await processAutomation();
    await processAppointmentReminders();
  }, PROCESS_INTERVAL_MS);

  console.log(`[AutomationWorker] Running every ${PROCESS_INTERVAL_MS / 1000} seconds`);
}

// Export for integration into server.js
module.exports = {
  processAutomation,
  processAppointmentReminders,
  runWorker,
  PROCESS_INTERVAL_MS
};

// Run standalone if executed directly
if (require.main === module) {
  runWorker().catch(console.error);
}
