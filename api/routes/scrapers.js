/**
 * Scraper Routes
 * API endpoints for vendor scraper management
 */

const express = require('express');
const router = express.Router();
const logger = require('../utils/logger');
const { asyncHandler } = require('../middleware/errorHandler');
const { spawn } = require('child_process');
const path = require('path');

/**
 * Check if user has scraper admin permission
 */
async function checkScraperPermission(req) {
  const supabase = req.app.get('supabase');
  const userId = req.user?.id;

  if (!userId || !supabase) return false;

  const { data: user } = await supabase
    .from('sg_users')
    .select('account_type, email')
    .eq('id', userId)
    .single();

  if (!user) return false;

  const adminTypes = ['admin', 'super_admin', 'enterprise'];
  const adminEmails = ['joshb@surprisegranite.com', 'josh.b@surprisegranite.com'];

  return adminTypes.includes(user.account_type) || adminEmails.includes(user.email?.toLowerCase());
}

/**
 * Get configured vendors
 * GET /api/scrapers/vendors
 */
router.get('/vendors', asyncHandler(async (req, res) => {
  const supabase = req.app.get('supabase');

  const { data: configs, error } = await supabase
    .from('vendor_scraper_configs')
    .select('*')
    .order('vendor_name');

  if (error) throw error;

  // Add last run info
  for (const config of configs) {
    const { data: lastRun } = await supabase
      .from('vendor_scraper_runs')
      .select('*')
      .eq('vendor_id', config.vendor_id)
      .order('started_at', { ascending: false })
      .limit(1)
      .single();

    config.last_run = lastRun || null;
  }

  res.json(configs);
}));

/**
 * Get vendor scraper config
 * GET /api/scrapers/vendors/:vendorId
 */
router.get('/vendors/:vendorId', asyncHandler(async (req, res) => {
  const supabase = req.app.get('supabase');
  const { vendorId } = req.params;

  const { data: config, error } = await supabase
    .from('vendor_scraper_configs')
    .select('*')
    .eq('vendor_id', vendorId)
    .single();

  if (error) throw error;
  if (!config) {
    return res.status(404).json({ error: 'Vendor not found' });
  }

  // Get recent runs
  const { data: runs } = await supabase
    .from('vendor_scraper_runs')
    .select('*')
    .eq('vendor_id', vendorId)
    .order('started_at', { ascending: false })
    .limit(10);

  config.recent_runs = runs || [];

  res.json(config);
}));

/**
 * Trigger a scraper run
 * POST /api/scrapers/run/:vendorId
 */
router.post('/run/:vendorId', asyncHandler(async (req, res) => {
  if (!await checkScraperPermission(req)) {
    return res.status(403).json({ error: 'Permission denied' });
  }

  const supabase = req.app.get('supabase');
  const { vendorId } = req.params;
  const userId = req.user?.id;

  // Check if vendor exists
  const { data: config } = await supabase
    .from('vendor_scraper_configs')
    .select('*')
    .eq('vendor_id', vendorId)
    .single();

  if (!config) {
    return res.status(404).json({ error: 'Vendor not found' });
  }

  // Check if scraper is already running
  const { data: running } = await supabase
    .from('vendor_scraper_runs')
    .select('id')
    .eq('vendor_id', vendorId)
    .eq('status', 'running')
    .single();

  if (running) {
    return res.status(409).json({ error: 'Scraper already running for this vendor' });
  }

  // Create run record
  const { data: run, error: runError } = await supabase
    .from('vendor_scraper_runs')
    .insert({
      vendor_id: vendorId,
      status: 'running',
      started_at: new Date().toISOString(),
      triggered_by: userId
    })
    .select()
    .single();

  if (runError) throw runError;

  // Start scraper in background
  const scraperPath = path.join(__dirname, '../../scripts/scrapers/index.js');
  const scraperProcess = spawn('node', [scraperPath, `--vendor=${vendorId}`], {
    cwd: path.join(__dirname, '../..'),
    detached: true,
    stdio: 'ignore',
    env: {
      ...process.env,
      SCRAPER_RUN_ID: run.id
    }
  });

  scraperProcess.unref();

  logger.info(`Started scraper for ${vendorId}, run ID: ${run.id}`);

  res.json({
    message: 'Scraper started',
    run_id: run.id,
    vendor_id: vendorId
  });
}));

/**
 * Get scraper run history
 * GET /api/scrapers/runs
 */
router.get('/runs', asyncHandler(async (req, res) => {
  const supabase = req.app.get('supabase');
  const { vendor_id, status, limit = 50, offset = 0 } = req.query;

  let query = supabase
    .from('vendor_scraper_runs')
    .select('*', { count: 'exact' })
    .order('started_at', { ascending: false });

  if (vendor_id) query = query.eq('vendor_id', vendor_id);
  if (status) query = query.eq('status', status);

  query = query.range(offset, offset + parseInt(limit) - 1);

  const { data, count, error } = await query;

  if (error) throw error;

  res.json({ data, count });
}));

/**
 * Get specific run details
 * GET /api/scrapers/runs/:runId
 */
router.get('/runs/:runId', asyncHandler(async (req, res) => {
  const supabase = req.app.get('supabase');
  const { runId } = req.params;

  const { data: run, error } = await supabase
    .from('vendor_scraper_runs')
    .select('*')
    .eq('id', runId)
    .single();

  if (error) throw error;
  if (!run) {
    return res.status(404).json({ error: 'Run not found' });
  }

  res.json(run);
}));

/**
 * Get discontinuation flags
 * GET /api/scrapers/discontinuations
 */
router.get('/discontinuations', asyncHandler(async (req, res) => {
  const supabase = req.app.get('supabase');
  const { vendor_id, status = 'pending', limit = 100, offset = 0 } = req.query;

  let query = supabase
    .from('product_discontinuations')
    .select('*', { count: 'exact' })
    .order('detected_at', { ascending: false });

  if (vendor_id) query = query.eq('vendor_id', vendor_id);
  if (status) query = query.eq('status', status);

  query = query.range(offset, offset + parseInt(limit) - 1);

  const { data, count, error } = await query;

  if (error) throw error;

  res.json({ data, count });
}));

/**
 * Confirm or dismiss a discontinuation
 * POST /api/scrapers/discontinuations/:id/resolve
 */
router.post('/discontinuations/:id/resolve', asyncHandler(async (req, res) => {
  if (!await checkScraperPermission(req)) {
    return res.status(403).json({ error: 'Permission denied' });
  }

  const supabase = req.app.get('supabase');
  const { id } = req.params;
  const { action, notes } = req.body;
  const userId = req.user?.id;

  if (!['confirm', 'dismiss', 'recheck'].includes(action)) {
    return res.status(400).json({ error: 'Invalid action. Must be confirm, dismiss, or recheck' });
  }

  const status = action === 'confirm' ? 'confirmed' :
                 action === 'dismiss' ? 'dismissed' : 'pending';

  const { data, error } = await supabase
    .from('product_discontinuations')
    .update({
      status,
      resolution_notes: notes,
      resolved_at: action !== 'recheck' ? new Date().toISOString() : null,
      resolved_by: action !== 'recheck' ? userId : null
    })
    .eq('id', id)
    .select()
    .single();

  if (error) throw error;

  // If confirmed, update the product
  if (action === 'confirm' && data.product_id) {
    await supabase
      .from('distributor_products')
      .update({
        is_discontinued: true,
        discontinued_at: new Date().toISOString()
      })
      .eq('id', data.product_id);
  }

  res.json(data);
}));

/**
 * Update vendor scraper config
 * PUT /api/scrapers/vendors/:vendorId
 */
router.put('/vendors/:vendorId', asyncHandler(async (req, res) => {
  if (!await checkScraperPermission(req)) {
    return res.status(403).json({ error: 'Permission denied' });
  }

  const supabase = req.app.get('supabase');
  const { vendorId } = req.params;
  const { enabled, scrape_interval_hours, config } = req.body;

  const updateData = {};
  if (enabled !== undefined) updateData.enabled = enabled;
  if (scrape_interval_hours) updateData.scrape_interval_hours = scrape_interval_hours;
  if (config) updateData.config = config;

  const { data, error } = await supabase
    .from('vendor_scraper_configs')
    .update(updateData)
    .eq('vendor_id', vendorId)
    .select()
    .single();

  if (error) throw error;

  res.json(data);
}));

module.exports = router;
