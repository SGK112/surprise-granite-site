/**
 * Catalog admin API — vendor management + scrape triggering + product edits.
 *
 * Auth: any of these headers grants admin access:
 *   X-Admin-Key             — human admin (set ADMIN_KEY env on Render)
 *   X-Aria-Service-Key      — Aria (server-to-server from VoiceNow)
 *
 * Routes:
 *   GET    /api/admin/catalog/vendors              vendor_config rows + product counts + last scrape
 *   POST   /api/admin/catalog/vendors              create new vendor
 *   PATCH  /api/admin/catalog/vendors/:vendor_id   edit vendor settings (markup, dropship, etc.)
 *   POST   /api/admin/catalog/scrape/:vendor_id    trigger a scrape (background)
 *   GET    /api/admin/catalog/scrape-runs          recent scrape runs from vendor_inventory
 *   GET    /api/admin/catalog/products             admin list (incl. inactive, low-stock, etc.)
 *   PATCH  /api/admin/catalog/products/:id         edit product (markup, sample_eligible, active)
 *   DELETE /api/admin/catalog/products/:id         soft-delete (active=false)
 */
const express = require('express');
const router = express.Router();
const logger = require('../utils/logger');
const { spawn } = require('child_process');
const path = require('path');

function checkAuth(req) {
  const adminKey = process.env.ADMIN_KEY || process.env.ASPN_ADMIN_KEY;
  const ariaKey = process.env.ARIA_SERVICE_KEY;
  const headerAdmin = req.headers['x-admin-key'];
  const headerAria = req.headers['x-aria-service-key'];
  if (adminKey && headerAdmin === adminKey) return { ok: true, role: 'admin' };
  if (ariaKey && headerAria === ariaKey) return { ok: true, role: 'aria' };
  return { ok: false };
}

function s(v, max = 200) {
  if (typeof v !== 'string') return null;
  const t = v.trim().slice(0, max);
  return t || null;
}

router.use((req, res, next) => {
  const auth = checkAuth(req);
  if (!auth.ok) return res.status(401).json({ error: 'Unauthorized' });
  req.adminAuth = auth;
  next();
});

// GET vendors with product counts + last scrape
router.get('/vendors', async (req, res) => {
  try {
    const supabase = req.app.get('supabase');
    if (!supabase) return res.status(503).json({ error: 'Database not available' });
    const { data: vendors, error: vErr } = await supabase
      .from('vendor_config')
      .select('*')
      .order('vendor_name');
    if (vErr) return res.status(500).json({ error: vErr.message });
    // Product count per vendor
    const counts = {};
    for (const v of vendors || []) {
      const { count } = await supabase
        .from('catalog_products')
        .select('*', { count: 'exact', head: true })
        .eq('vendor_id', v.vendor_id)
        .eq('active', true);
      counts[v.vendor_id] = count || 0;
    }
    return res.json({
      success: true,
      vendors: (vendors || []).map(v => ({ ...v, product_count: counts[v.vendor_id] || 0 }))
    });
  } catch (e) {
    return res.status(500).json({ error: 'Internal error' });
  }
});

// POST new vendor
router.post('/vendors', async (req, res) => {
  try {
    const supabase = req.app.get('supabase');
    if (!supabase) return res.status(503).json({ error: 'Database not available' });
    const body = req.body || {};
    const vendor_id = s(body.vendor_id, 50);
    const vendor_name = s(body.vendor_name, 200);
    if (!vendor_id || !vendor_name) return res.status(400).json({ error: 'vendor_id + vendor_name required' });
    const row = {
      vendor_id: vendor_id.toLowerCase().replace(/[^a-z0-9-]/g, '-'),
      vendor_name,
      vendor_url: s(body.vendor_url, 300),
      dropship_method: s(body.dropship_method, 20) || 'manual',
      dropship_email: s(body.dropship_email, 254),
      sample_offered: !!body.sample_offered,
      sample_price: parseFloat(body.sample_price) || 0,
      sample_shipping: parseFloat(body.sample_shipping) || 0,
      default_markup_pct: parseFloat(body.default_markup_pct) || 30,
      scraper_enabled: body.scraper_enabled !== false,
      notes: s(body.notes, 500)
    };
    const { data, error } = await supabase.from('vendor_config').insert(row).select().single();
    if (error) return res.status(500).json({ error: error.message });
    return res.status(201).json({ success: true, vendor: data });
  } catch (e) {
    return res.status(500).json({ error: 'Internal error' });
  }
});

// PATCH vendor settings
router.patch('/vendors/:vendor_id', async (req, res) => {
  try {
    const supabase = req.app.get('supabase');
    if (!supabase) return res.status(503).json({ error: 'Database not available' });
    const vendor_id = s(req.params?.vendor_id, 50);
    const body = req.body || {};
    const allowed = ['vendor_name','vendor_url','vendor_logo_url','dropship_email','dropship_method','default_markup_pct','sample_offered','sample_price','sample_shipping','scraper_enabled','notes'];
    const updates = {};
    for (const k of allowed) {
      if (body[k] !== undefined) updates[k] = body[k];
    }
    if (Object.keys(updates).length === 0) return res.status(400).json({ error: 'No fields to update' });
    const { data, error } = await supabase
      .from('vendor_config')
      .update(updates)
      .eq('vendor_id', vendor_id)
      .select()
      .single();
    if (error) return res.status(500).json({ error: error.message });
    return res.json({ success: true, vendor: data });
  } catch (e) {
    return res.status(500).json({ error: 'Internal error' });
  }
});

// POST trigger scrape
const SCRAPER_RUNNING = {};  // vendor_id → started timestamp
router.post('/scrape/:vendor_id', async (req, res) => {
  try {
    const vendor_id = s(req.params?.vendor_id, 50);
    if (!vendor_id) return res.status(400).json({ error: 'vendor_id required' });
    // Map vendor_id to scraper file
    const scraperMap = {
      'kibi': 'kibi.js',
      'monterrey-tile': 'monterrey-tile.js',
      'ruvati': 'ruvati.js',
      'msi': 'msi.js'
    };
    const scriptName = scraperMap[vendor_id];
    if (!scriptName) {
      return res.status(404).json({ error: `No scraper available for ${vendor_id}`, available: Object.keys(scraperMap) });
    }
    // Prevent concurrent scrapes
    if (SCRAPER_RUNNING[vendor_id]) {
      const elapsed = Math.round((Date.now() - SCRAPER_RUNNING[vendor_id]) / 1000);
      return res.status(409).json({ error: `Scrape already running for ${vendor_id}`, elapsed_sec: elapsed });
    }
    SCRAPER_RUNNING[vendor_id] = Date.now();

    // Spawn detached scraper
    const scriptPath = path.join(__dirname, '../../scripts/scrapers/vendors', scriptName);
    const child = spawn('node', [scriptPath], {
      detached: true,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env }
    });
    let logBuf = '';
    child.stdout.on('data', d => { logBuf += d.toString(); });
    child.stderr.on('data', d => { logBuf += d.toString(); });
    child.on('exit', (code) => {
      delete SCRAPER_RUNNING[vendor_id];
      logger.info(`Scrape ${vendor_id} exited code ${code}`);
    });
    child.on('error', (err) => {
      delete SCRAPER_RUNNING[vendor_id];
      logger.error(`Scrape ${vendor_id} spawn error: ${err.message}`);
    });
    // Don't wait — return immediately with the run handle
    child.unref();

    return res.status(202).json({
      success: true,
      message: `Scrape started for ${vendor_id}. Check /api/admin/catalog/vendors in ~30s for updated count.`,
      vendor_id,
      pid: child.pid
    });
  } catch (e) {
    delete SCRAPER_RUNNING[req.params?.vendor_id];
    return res.status(500).json({ error: 'Internal error', details: e.message });
  }
});

// GET recent scrape runs
router.get('/scrape-runs', async (req, res) => {
  try {
    const supabase = req.app.get('supabase');
    if (!supabase) return res.status(503).json({ error: 'Database not available' });
    const { data, error } = await supabase
      .from('vendor_inventory')
      .select('vendor_id, scrape_run_id, scraped_at')
      .order('scraped_at', { ascending: false })
      .limit(500);
    if (error) return res.status(500).json({ error: error.message });
    // Group by run_id, count rows per run
    const runs = {};
    for (const row of data || []) {
      const k = row.scrape_run_id || `${row.vendor_id}-untagged`;
      if (!runs[k]) runs[k] = { vendor_id: row.vendor_id, scrape_run_id: k, products: 0, scraped_at: row.scraped_at };
      runs[k].products += 1;
    }
    return res.json({
      success: true,
      runs: Object.values(runs).sort((a, b) => (b.scraped_at || '').localeCompare(a.scraped_at || '')).slice(0, 50),
      currently_running: Object.keys(SCRAPER_RUNNING)
    });
  } catch (e) {
    return res.status(500).json({ error: 'Internal error' });
  }
});

// GET products (admin: all, including inactive)
router.get('/products', async (req, res) => {
  try {
    const supabase = req.app.get('supabase');
    if (!supabase) return res.status(503).json({ error: 'Database not available' });
    const limit = Math.min(parseInt(req.query?.limit) || 50, 250);
    const offset = Math.max(parseInt(req.query?.offset) || 0, 0);
    let q = supabase
      .from('catalog_products')
      .select('id, vendor_id, sku, slug, name, brand, category, retail_price, vendor_cost, sample_eligible, sample_price, in_stock, active, last_scraped_at, vendor_url, primary_image_url', { count: 'exact' })
      .order('last_scraped_at', { ascending: false })
      .range(offset, offset + limit - 1);
    const vendor = s(req.query?.vendor, 50);
    const category = s(req.query?.category, 50);
    if (vendor) q = q.eq('vendor_id', vendor);
    if (category) q = q.eq('category', category);
    const { data, error, count } = await q;
    if (error) return res.status(500).json({ error: error.message });
    return res.json({ success: true, products: data || [], total: count, limit, offset });
  } catch (e) {
    return res.status(500).json({ error: 'Internal error' });
  }
});

// PATCH product
router.patch('/products/:id', async (req, res) => {
  try {
    const supabase = req.app.get('supabase');
    if (!supabase) return res.status(503).json({ error: 'Database not available' });
    const id = s(req.params?.id, 50);
    if (!id) return res.status(400).json({ error: 'id required' });
    const body = req.body || {};
    const allowed = ['retail_price','vendor_cost','sample_eligible','sample_price','in_stock','active','short_description','tags','category','subcategory'];
    const updates = {};
    for (const k of allowed) {
      if (body[k] !== undefined) updates[k] = body[k];
    }
    if (Object.keys(updates).length === 0) return res.status(400).json({ error: 'No fields to update' });
    const { data, error } = await supabase
      .from('catalog_products')
      .update(updates)
      .eq('id', id)
      .select()
      .single();
    if (error) return res.status(500).json({ error: error.message });
    return res.json({ success: true, product: data });
  } catch (e) {
    return res.status(500).json({ error: 'Internal error' });
  }
});

// DELETE soft-delete (active=false)
router.delete('/products/:id', async (req, res) => {
  try {
    const supabase = req.app.get('supabase');
    if (!supabase) return res.status(503).json({ error: 'Database not available' });
    const id = s(req.params?.id, 50);
    const { data, error } = await supabase
      .from('catalog_products')
      .update({ active: false })
      .eq('id', id)
      .select()
      .single();
    if (error) return res.status(500).json({ error: error.message });
    return res.json({ success: true, product: data, deactivated: true });
  } catch (e) {
    return res.status(500).json({ error: 'Internal error' });
  }
});

module.exports = router;
