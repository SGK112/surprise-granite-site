/**
 * Reminders API Route
 * Endpoints for managing and triggering automated reminders
 */

const express = require('express');
const router = express.Router();
const reminderService = require('../services/reminderService');
const logger = require('../utils/logger');
const { asyncHandler } = require('../middleware/errorHandler');

/**
 * Process all reminders (called by cron job)
 * POST /api/reminders/process
 */
router.post('/process', asyncHandler(async (req, res) => {
  // Verify cron secret or admin auth
  const cronSecret = req.headers['x-cron-secret'];
  const expectedSecret = process.env.CRON_SECRET || 'sg-reminder-cron-2024';

  if (cronSecret !== expectedSecret) {
    // Check for admin auth
    const authHeader = req.headers.authorization;
    if (!authHeader) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
  }

  logger.info('Processing reminders...');

  const results = await reminderService.processAllReminders();

  res.json({
    success: true,
    message: 'Reminders processed',
    results
  });
}));

/**
 * Process only appointment reminders
 * POST /api/reminders/appointments
 */
router.post('/appointments', asyncHandler(async (req, res) => {
  const cronSecret = req.headers['x-cron-secret'];
  const expectedSecret = process.env.CRON_SECRET || 'sg-reminder-cron-2024';

  if (cronSecret !== expectedSecret) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const results = await reminderService.processAppointmentReminders();

  res.json({
    success: true,
    message: 'Appointment reminders processed',
    results
  });
}));

/**
 * Process only lead follow-up reminders
 * POST /api/reminders/leads
 */
router.post('/leads', asyncHandler(async (req, res) => {
  const cronSecret = req.headers['x-cron-secret'];
  const expectedSecret = process.env.CRON_SECRET || 'sg-reminder-cron-2024';

  if (cronSecret !== expectedSecret) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const results = await reminderService.processLeadFollowUps();

  res.json({
    success: true,
    message: 'Lead follow-up reminders processed',
    results
  });
}));

/**
 * Process only payment reminders
 * POST /api/reminders/payments
 */
router.post('/payments', asyncHandler(async (req, res) => {
  const cronSecret = req.headers['x-cron-secret'];
  const expectedSecret = process.env.CRON_SECRET || 'sg-reminder-cron-2024';

  if (cronSecret !== expectedSecret) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const results = await reminderService.processPaymentReminders();

  res.json({
    success: true,
    message: 'Payment reminders processed',
    results
  });
}));

/**
 * Get reminder stats (admin only)
 * GET /api/reminders/stats
 */
router.get('/stats', asyncHandler(async (req, res) => {
  const supabase = req.app.get('supabase');
  if (!supabase) {
    return res.status(500).json({ error: 'Database not configured' });
  }

  // Get counts for last 7 days
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

  const { data: stats, error } = await supabase
    .from('reminder_log')
    .select('reminder_type, entity_type')
    .gte('sent_at', weekAgo);

  if (error) {
    return res.status(500).json({ error: error.message });
  }

  const summary = {
    total: stats?.length || 0,
    byType: {},
    byEntity: {}
  };

  (stats || []).forEach(s => {
    summary.byType[s.reminder_type] = (summary.byType[s.reminder_type] || 0) + 1;
    summary.byEntity[s.entity_type] = (summary.byEntity[s.entity_type] || 0) + 1;
  });

  res.json({
    success: true,
    period: 'last_7_days',
    stats: summary
  });
}));

module.exports = router;
