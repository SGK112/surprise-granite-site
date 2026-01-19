/**
 * Health Check Routes
 * Monitoring endpoints for the API
 */

const express = require('express');
const router = express.Router();
const logger = require('../utils/logger');

// Track server start time
const startTime = Date.now();

/**
 * Basic health check
 * GET /api/health
 */
router.get('/', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: Math.floor((Date.now() - startTime) / 1000),
    version: process.env.npm_package_version || '1.0.0'
  });
});

/**
 * Detailed health check with dependency status
 * GET /api/health/detailed
 */
router.get('/detailed', async (req, res) => {
  const health = {
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: Math.floor((Date.now() - startTime) / 1000),
    version: process.env.npm_package_version || '1.0.0',
    checks: {}
  };

  // Check Supabase connection
  try {
    const supabase = req.app.get('supabase');
    if (supabase) {
      const start = Date.now();
      const { error } = await supabase.from('profiles').select('id').limit(1);
      health.checks.database = {
        status: error ? 'unhealthy' : 'healthy',
        latencyMs: Date.now() - start,
        error: error?.message
      };
    } else {
      health.checks.database = { status: 'not_configured' };
    }
  } catch (err) {
    health.checks.database = { status: 'unhealthy', error: err.message };
  }

  // Check Stripe connection
  try {
    const stripe = req.app.get('stripe');
    if (stripe) {
      const start = Date.now();
      await stripe.balance.retrieve();
      health.checks.stripe = {
        status: 'healthy',
        latencyMs: Date.now() - start
      };
    } else {
      health.checks.stripe = { status: 'not_configured' };
    }
  } catch (err) {
    health.checks.stripe = { status: 'unhealthy', error: err.message };
  }

  // Check SMTP configuration
  health.checks.smtp = {
    status: process.env.SMTP_USER ? 'configured' : 'not_configured'
  };

  // Overall status
  const unhealthyChecks = Object.values(health.checks).filter(c => c.status === 'unhealthy');
  if (unhealthyChecks.length > 0) {
    health.status = 'degraded';
  }

  const statusCode = health.status === 'healthy' ? 200 : 503;
  res.status(statusCode).json(health);
});

/**
 * Readiness check (for Kubernetes/container orchestration)
 * GET /api/health/ready
 */
router.get('/ready', async (req, res) => {
  try {
    const supabase = req.app.get('supabase');
    if (supabase) {
      const { error } = await supabase.from('profiles').select('id').limit(1);
      if (error) throw error;
    }
    res.json({ ready: true });
  } catch (err) {
    logger.warn('Readiness check failed', { error: err.message });
    res.status(503).json({ ready: false, error: err.message });
  }
});

/**
 * Liveness check (basic ping)
 * GET /api/health/live
 */
router.get('/live', (req, res) => {
  res.json({ alive: true });
});

module.exports = router;
