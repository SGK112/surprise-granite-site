/**
 * Reminder Service
 * Handles automated reminders for appointments, leads, and payments
 */

const { createClient } = require('@supabase/supabase-js');
const emailService = require('./emailService');
const smsService = require('./smsService');
const logger = require('../utils/logger');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

let supabase = null;
if (SUPABASE_URL && SUPABASE_SERVICE_KEY) {
  supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false }
  });
}

const reminderService = {

  /**
   * Process all pending reminders
   * Call this from a cron job or scheduled task
   */
  async processAllReminders() {
    if (!supabase) {
      logger.warn('Reminder service: Supabase not configured');
      return { success: false, error: 'Database not configured' };
    }

    const results = {
      appointments: await this.processAppointmentReminders(),
      leads: await this.processLeadFollowUps(),
      payments: await this.processPaymentReminders()
    };

    logger.info('Reminder processing complete', results);
    return results;
  },

  /**
   * Send appointment reminders (24h and 1h before)
   */
  async processAppointmentReminders() {
    const sent = { email: 0, sms: 0, errors: 0 };

    try {
      const now = new Date();
      const in24h = new Date(now.getTime() + 24 * 60 * 60 * 1000);
      const in1h = new Date(now.getTime() + 60 * 60 * 1000);
      const in25h = new Date(now.getTime() + 25 * 60 * 60 * 1000);
      const in2h = new Date(now.getTime() + 2 * 60 * 60 * 1000);

      // Get appointments in the next 24-25 hours (for 24h reminder)
      const { data: upcoming24h } = await supabase
        .from('calendar_events')
        .select(`
          id, title, start_time, end_time, location, event_type,
          metadata, created_by, lead_id, customer_id, project_id
        `)
        .in('status', ['scheduled', 'confirmed'])
        .gte('start_time', in24h.toISOString())
        .lt('start_time', in25h.toISOString());

      // Get appointments in the next 1-2 hours (for 1h reminder)
      const { data: upcoming1h } = await supabase
        .from('calendar_events')
        .select(`
          id, title, start_time, end_time, location, event_type,
          metadata, created_by, lead_id, customer_id, project_id
        `)
        .in('status', ['scheduled', 'confirmed'])
        .gte('start_time', in1h.toISOString())
        .lt('start_time', in2h.toISOString());

      // Process 24h reminders
      for (const event of (upcoming24h || [])) {
        const alreadySent = await this.hasReminderBeenSent(event.id, '24h');
        if (alreadySent) continue;

        const result = await this.sendAppointmentReminder(event, '24h');
        if (result.email) sent.email++;
        if (result.sms) sent.sms++;
        if (result.error) sent.errors++;
      }

      // Process 1h reminders
      for (const event of (upcoming1h || [])) {
        const alreadySent = await this.hasReminderBeenSent(event.id, '1h');
        if (alreadySent) continue;

        const result = await this.sendAppointmentReminder(event, '1h');
        if (result.email) sent.email++;
        if (result.sms) sent.sms++;
        if (result.error) sent.errors++;
      }

    } catch (err) {
      logger.error('Appointment reminder error', { error: err.message });
      sent.errors++;
    }

    return sent;
  },

  /**
   * Send a single appointment reminder
   */
  async sendAppointmentReminder(event, timing) {
    const result = { email: false, sms: false, error: null };

    try {
      // Get contact info from metadata, lead, or customer
      let contactEmail = event.metadata?.contact_email;
      let contactPhone = event.metadata?.contact_phone;
      let contactName = event.metadata?.contact_name || 'Valued Customer';

      // Try to get from linked lead
      if (!contactEmail && event.lead_id) {
        const { data: lead } = await supabase
          .from('leads')
          .select('homeowner_email, homeowner_phone, homeowner_name')
          .eq('id', event.lead_id)
          .single();
        if (lead) {
          contactEmail = contactEmail || lead.homeowner_email;
          contactPhone = contactPhone || lead.homeowner_phone;
          contactName = lead.homeowner_name || contactName;
        }
      }

      // Try to get from linked customer
      if (!contactEmail && event.customer_id) {
        const { data: customer } = await supabase
          .from('customers')
          .select('email, phone, name')
          .eq('id', event.customer_id)
          .single();
        if (customer) {
          contactEmail = contactEmail || customer.email;
          contactPhone = contactPhone || customer.phone;
          contactName = customer.name || contactName;
        }
      }

      // Also get participants
      const { data: participants } = await supabase
        .from('calendar_event_participants')
        .select('email, phone, name')
        .eq('event_id', event.id);

      const startTime = new Date(event.start_time);
      const formattedDate = startTime.toLocaleDateString('en-US', {
        weekday: 'long', month: 'long', day: 'numeric'
      });
      const formattedTime = startTime.toLocaleTimeString('en-US', {
        hour: 'numeric', minute: '2-digit', hour12: true
      });

      const timingText = timing === '24h' ? 'tomorrow' : 'in 1 hour';

      // Send email reminder
      if (contactEmail) {
        const emailHtml = this.generateAppointmentReminderEmail({
          name: contactName,
          title: event.title,
          date: formattedDate,
          time: formattedTime,
          location: event.location,
          timing: timingText
        });

        await emailService.sendNotification(
          contactEmail,
          `Reminder: Your appointment is ${timingText}`,
          emailHtml
        );
        result.email = true;
      }

      // Send SMS reminder
      if (contactPhone) {
        const smsText = `Reminder: Your appointment "${event.title}" is ${timingText} at ${formattedTime}. Location: ${event.location || 'TBD'}. Reply STOP to opt out.`;
        await smsService.sendSMS(contactPhone, smsText);
        result.sms = true;
      }

      // Send to participants too
      for (const p of (participants || [])) {
        if (p.email && p.email !== contactEmail) {
          const emailHtml = this.generateAppointmentReminderEmail({
            name: p.name || 'Team Member',
            title: event.title,
            date: formattedDate,
            time: formattedTime,
            location: event.location,
            timing: timingText
          });
          await emailService.sendNotification(
            p.email,
            `Reminder: Appointment ${timingText} - ${event.title}`,
            emailHtml
          );
        }
      }

      // Log that reminder was sent
      await this.logReminderSent(event.id, timing, 'appointment');

    } catch (err) {
      logger.error('Send appointment reminder error', { eventId: event.id, error: err.message });
      result.error = err.message;
    }

    return result;
  },

  /**
   * Process lead follow-up reminders (leads not contacted in 48h)
   */
  async processLeadFollowUps() {
    const sent = { email: 0, errors: 0 };

    try {
      const cutoff = new Date(Date.now() - 48 * 60 * 60 * 1000);

      // Get leads that are still "new" and created more than 48h ago
      const { data: staleLeads } = await supabase
        .from('leads')
        .select('id, homeowner_name, homeowner_email, homeowner_phone, project_type, created_at, user_id')
        .eq('status', 'new')
        .lt('created_at', cutoff.toISOString())
        .limit(50);

      for (const lead of (staleLeads || [])) {
        const alreadySent = await this.hasReminderBeenSent(lead.id, 'follow-up-48h', 'lead');
        if (alreadySent) continue;

        // Get admin email to notify
        const { data: owner } = await supabase
          .from('sg_users')
          .select('email, full_name')
          .eq('id', lead.user_id)
          .single();

        if (owner?.email) {
          const emailHtml = this.generateLeadFollowUpEmail({
            ownerName: owner.full_name || 'Team',
            leadName: lead.homeowner_name,
            leadEmail: lead.homeowner_email,
            leadPhone: lead.homeowner_phone,
            projectType: lead.project_type,
            daysSince: Math.floor((Date.now() - new Date(lead.created_at).getTime()) / (24 * 60 * 60 * 1000))
          });

          await emailService.sendNotification(
            owner.email,
            `Follow-up needed: ${lead.homeowner_name} waiting ${Math.floor((Date.now() - new Date(lead.created_at).getTime()) / (24 * 60 * 60 * 1000))} days`,
            emailHtml
          );
          sent.email++;
        }

        await this.logReminderSent(lead.id, 'follow-up-48h', 'lead');
      }

    } catch (err) {
      logger.error('Lead follow-up reminder error', { error: err.message });
      sent.errors++;
    }

    return sent;
  },

  /**
   * Process payment reminders for overdue invoices
   */
  async processPaymentReminders() {
    const sent = { email: 0, errors: 0 };

    try {
      const now = new Date();

      // Get overdue invoices (due_date passed, not paid)
      const { data: overdueInvoices } = await supabase
        .from('invoices')
        .select('id, invoice_number, customer_email, customer_name, total_amount, due_date, user_id')
        .eq('status', 'sent')
        .lt('due_date', now.toISOString())
        .limit(50);

      for (const invoice of (overdueInvoices || [])) {
        // Only send reminder once per week
        const alreadySent = await this.hasReminderBeenSent(invoice.id, 'overdue-weekly', 'invoice');
        if (alreadySent) continue;

        if (invoice.customer_email) {
          const daysOverdue = Math.floor((now - new Date(invoice.due_date)) / (24 * 60 * 60 * 1000));

          const emailHtml = this.generatePaymentReminderEmail({
            customerName: invoice.customer_name || 'Valued Customer',
            invoiceNumber: invoice.invoice_number,
            amount: invoice.total_amount,
            daysOverdue
          });

          await emailService.sendNotification(
            invoice.customer_email,
            `Payment Reminder: Invoice #${invoice.invoice_number} is overdue`,
            emailHtml
          );
          sent.email++;
        }

        await this.logReminderSent(invoice.id, 'overdue-weekly', 'invoice');
      }

    } catch (err) {
      logger.error('Payment reminder error', { error: err.message });
      sent.errors++;
    }

    return sent;
  },

  /**
   * Check if a reminder has already been sent
   */
  async hasReminderBeenSent(entityId, reminderType, entityType = 'event') {
    const { data } = await supabase
      .from('reminder_log')
      .select('id')
      .eq('entity_id', entityId)
      .eq('entity_type', entityType)
      .eq('reminder_type', reminderType)
      .gte('sent_at', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()) // Within last 7 days
      .limit(1);

    return data && data.length > 0;
  },

  /**
   * Log that a reminder was sent
   */
  async logReminderSent(entityId, reminderType, entityType = 'event') {
    await supabase
      .from('reminder_log')
      .insert([{
        entity_id: entityId,
        entity_type: entityType,
        reminder_type: reminderType,
        sent_at: new Date().toISOString()
      }]);
  },

  /**
   * Generate appointment reminder email HTML
   */
  generateAppointmentReminderEmail({ name, title, date, time, location, timing }) {
    return `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%); padding: 30px; border-radius: 12px; color: white;">
          <h1 style="margin: 0 0 10px; font-size: 24px; color: #f9cb00;">Appointment Reminder</h1>
          <p style="margin: 0; opacity: 0.9;">Your appointment is ${timing}</p>
        </div>

        <div style="padding: 30px 20px;">
          <p style="font-size: 16px; color: #333;">Hi ${name},</p>

          <p style="font-size: 16px; color: #333;">This is a friendly reminder about your upcoming appointment:</p>

          <div style="background: #f8f9fa; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #f9cb00;">
            <p style="margin: 0 0 10px;"><strong style="color: #1a1a2e;">${title}</strong></p>
            <p style="margin: 0 0 5px; color: #666;"><strong>Date:</strong> ${date}</p>
            <p style="margin: 0 0 5px; color: #666;"><strong>Time:</strong> ${time}</p>
            ${location ? `<p style="margin: 0; color: #666;"><strong>Location:</strong> ${location}</p>` : ''}
          </div>

          <p style="font-size: 14px; color: #666;">If you need to reschedule, please contact us as soon as possible.</p>

          <p style="font-size: 14px; color: #333; margin-top: 30px;">
            Thank you,<br>
            <strong>Surprise Granite</strong><br>
            <span style="color: #666;">(623) 466-8066</span>
          </p>
        </div>
      </div>
    `;
  },

  /**
   * Generate lead follow-up email HTML
   */
  generateLeadFollowUpEmail({ ownerName, leadName, leadEmail, leadPhone, projectType, daysSince }) {
    return `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%); padding: 30px; border-radius: 12px; color: white;">
          <h1 style="margin: 0 0 10px; font-size: 24px;">Lead Needs Follow-Up</h1>
          <p style="margin: 0; opacity: 0.9;">${daysSince} days without contact</p>
        </div>

        <div style="padding: 30px 20px;">
          <p style="font-size: 16px; color: #333;">Hi ${ownerName},</p>

          <p style="font-size: 16px; color: #333;">This lead has been waiting <strong>${daysSince} days</strong> without follow-up:</p>

          <div style="background: #fef3c7; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #f59e0b;">
            <p style="margin: 0 0 10px;"><strong style="color: #1a1a2e;">${leadName}</strong></p>
            <p style="margin: 0 0 5px; color: #666;"><strong>Email:</strong> ${leadEmail}</p>
            ${leadPhone ? `<p style="margin: 0 0 5px; color: #666;"><strong>Phone:</strong> ${leadPhone}</p>` : ''}
            ${projectType ? `<p style="margin: 0; color: #666;"><strong>Project:</strong> ${projectType}</p>` : ''}
          </div>

          <p style="font-size: 14px; color: #666;">Leads contacted within 24 hours are 7x more likely to convert. Consider reaching out today!</p>

          <div style="margin-top: 20px;">
            <a href="https://www.surprisegranite.com/account/#leads" style="display: inline-block; background: #f59e0b; color: white; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: 600;">View Lead</a>
          </div>
        </div>
      </div>
    `;
  },

  /**
   * Generate payment reminder email HTML
   */
  generatePaymentReminderEmail({ customerName, invoiceNumber, amount, daysOverdue }) {
    return `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%); padding: 30px; border-radius: 12px; color: white;">
          <h1 style="margin: 0 0 10px; font-size: 24px; color: #f9cb00;">Payment Reminder</h1>
          <p style="margin: 0; opacity: 0.9;">Invoice #${invoiceNumber}</p>
        </div>

        <div style="padding: 30px 20px;">
          <p style="font-size: 16px; color: #333;">Hi ${customerName},</p>

          <p style="font-size: 16px; color: #333;">We wanted to remind you that payment for the following invoice is now <strong>${daysOverdue} days</strong> past due:</p>

          <div style="background: #fef2f2; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #ef4444;">
            <p style="margin: 0 0 10px;"><strong style="color: #1a1a2e;">Invoice #${invoiceNumber}</strong></p>
            <p style="margin: 0 0 5px; color: #666;"><strong>Amount Due:</strong> $${(amount || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}</p>
            <p style="margin: 0; color: #ef4444;"><strong>Days Overdue:</strong> ${daysOverdue}</p>
          </div>

          <p style="font-size: 14px; color: #666;">Please submit payment at your earliest convenience. If you've already paid, please disregard this reminder.</p>

          <p style="font-size: 14px; color: #666;">If you have questions about this invoice, please contact us.</p>

          <p style="font-size: 14px; color: #333; margin-top: 30px;">
            Thank you,<br>
            <strong>Surprise Granite</strong><br>
            <span style="color: #666;">(623) 466-8066</span>
          </p>
        </div>
      </div>
    `;
  }
};

module.exports = reminderService;
