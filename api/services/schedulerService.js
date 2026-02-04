/**
 * Scheduler Service
 * Manages periodic background tasks like reminders
 */

const reminderService = require('./reminderService');
const logger = require('../utils/logger');

// Configuration with defaults (in milliseconds)
const DEFAULT_CONFIG = {
  // Enable/disable the scheduler
  enabled: process.env.SCHEDULER_ENABLED !== 'false',

  // Reminder processing interval (default: every 30 minutes)
  reminderInterval: parseInt(process.env.REMINDER_INTERVAL_MS) || 30 * 60 * 1000,

  // Run appointment reminders more frequently (default: every 15 minutes)
  appointmentInterval: parseInt(process.env.APPOINTMENT_REMINDER_INTERVAL_MS) || 15 * 60 * 1000,

  // Initial delay before starting (default: 10 seconds)
  startDelay: parseInt(process.env.SCHEDULER_START_DELAY_MS) || 10 * 1000
};

class SchedulerService {
  constructor() {
    this.intervals = [];
    this.running = false;
    this.config = { ...DEFAULT_CONFIG };
    this.stats = {
      startedAt: null,
      lastAppointmentRun: null,
      lastFullRun: null,
      appointmentRunCount: 0,
      fullRunCount: 0,
      errors: []
    };
  }

  /**
   * Start the scheduler
   */
  start() {
    if (!this.config.enabled) {
      logger.info('Scheduler is disabled via SCHEDULER_ENABLED=false');
      return;
    }

    if (this.running) {
      logger.warn('Scheduler already running');
      return;
    }

    logger.info('Starting scheduler service', {
      reminderInterval: `${this.config.reminderInterval / 1000}s`,
      appointmentInterval: `${this.config.appointmentInterval / 1000}s`,
      startDelay: `${this.config.startDelay / 1000}s`
    });

    this.running = true;
    this.stats.startedAt = new Date();

    // Delay initial run to let server fully start
    setTimeout(() => {
      this.scheduleJobs();
    }, this.config.startDelay);
  }

  /**
   * Schedule all recurring jobs
   */
  scheduleJobs() {
    // Run appointment reminders more frequently (check for 1h and 24h reminders)
    const appointmentJob = setInterval(async () => {
      await this.runAppointmentReminders();
    }, this.config.appointmentInterval);
    this.intervals.push(appointmentJob);

    // Run full reminder processing less frequently (leads, payments, etc.)
    const fullJob = setInterval(async () => {
      await this.runFullReminders();
    }, this.config.reminderInterval);
    this.intervals.push(fullJob);

    // Run immediately on start
    this.runAppointmentReminders();

    // Stagger the full reminder run
    setTimeout(() => {
      this.runFullReminders();
    }, 5000);

    logger.info('Scheduler jobs scheduled');
  }

  /**
   * Run appointment reminders only
   */
  async runAppointmentReminders() {
    try {
      logger.debug('Running appointment reminders...');
      const result = await reminderService.processAppointmentReminders();

      this.stats.lastAppointmentRun = new Date();
      this.stats.appointmentRunCount++;

      if (result.email > 0 || result.sms > 0) {
        logger.info('Appointment reminders sent', result);
      }

      return result;
    } catch (err) {
      logger.error('Scheduler: appointment reminder error', { error: err.message });
      this.stats.errors.push({
        type: 'appointment',
        error: err.message,
        timestamp: new Date()
      });
      // Keep only last 10 errors
      if (this.stats.errors.length > 10) {
        this.stats.errors = this.stats.errors.slice(-10);
      }
    }
  }

  /**
   * Run full reminder processing (leads, payments)
   */
  async runFullReminders() {
    try {
      logger.debug('Running full reminder processing...');

      // Process leads and payments (appointments handled separately)
      const leadResult = await reminderService.processLeadFollowUps();
      const paymentResult = await reminderService.processPaymentReminders();

      this.stats.lastFullRun = new Date();
      this.stats.fullRunCount++;

      const result = {
        leads: leadResult,
        payments: paymentResult
      };

      if (leadResult.email > 0 || paymentResult.email > 0) {
        logger.info('Full reminders sent', result);
      }

      return result;
    } catch (err) {
      logger.error('Scheduler: full reminder error', { error: err.message });
      this.stats.errors.push({
        type: 'full',
        error: err.message,
        timestamp: new Date()
      });
      if (this.stats.errors.length > 10) {
        this.stats.errors = this.stats.errors.slice(-10);
      }
    }
  }

  /**
   * Stop the scheduler
   */
  stop() {
    if (!this.running) {
      logger.warn('Scheduler not running');
      return;
    }

    logger.info('Stopping scheduler service');

    this.intervals.forEach(interval => clearInterval(interval));
    this.intervals = [];
    this.running = false;
  }

  /**
   * Get scheduler status
   */
  getStatus() {
    return {
      running: this.running,
      enabled: this.config.enabled,
      config: {
        reminderIntervalMinutes: this.config.reminderInterval / 60000,
        appointmentIntervalMinutes: this.config.appointmentInterval / 60000
      },
      stats: {
        ...this.stats,
        uptime: this.stats.startedAt
          ? Math.floor((Date.now() - this.stats.startedAt.getTime()) / 1000)
          : 0
      }
    };
  }

  /**
   * Update configuration at runtime
   */
  updateConfig(newConfig) {
    const wasRunning = this.running;

    if (wasRunning) {
      this.stop();
    }

    this.config = { ...this.config, ...newConfig };
    logger.info('Scheduler config updated', this.config);

    if (wasRunning && this.config.enabled) {
      this.start();
    }
  }
}

// Export singleton instance
const schedulerService = new SchedulerService();

module.exports = schedulerService;
