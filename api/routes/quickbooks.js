/**
 * QuickBooks Online Integration Routes
 */

const express = require('express');
const router = express.Router();
const qbo = require('../services/quickbooksService');
const authMiddleware = require('../lib/auth/middleware');
const { authenticateJWT } = authMiddleware;

/**
 * GET /api/quickbooks/status
 * Check if QuickBooks is connected
 */
router.get('/status', authenticateJWT, async (req, res) => {
  try {
    const connected = await qbo.isConnected(req.user.id);
    res.json({ connected });
  } catch (error) {
    console.error('QuickBooks status check error:', error);
    res.status(500).json({ error: 'Failed to check QuickBooks status' });
  }
});

/**
 * GET /api/quickbooks/connect
 * Start OAuth flow - redirects to QuickBooks login
 */
router.get('/connect', authenticateJWT, (req, res) => {
  try {
    const authUrl = qbo.getAuthUrl(req.user.id);
    res.json({ authUrl });
  } catch (error) {
    console.error('QuickBooks connect error:', error);
    res.status(500).json({ error: 'Failed to generate QuickBooks authorization URL' });
  }
});

/**
 * GET /api/quickbooks/callback
 * OAuth callback - exchanges code for tokens
 */
router.get('/callback', async (req, res) => {
  try {
    const { code, realmId, state: userId } = req.query;

    if (!code || !realmId || !userId) {
      return res.status(400).send('Missing required parameters');
    }

    await qbo.exchangeCodeForTokens(code, realmId, userId);

    // Redirect to settings page with success message
    res.redirect('/account/#settings?qb=connected');
  } catch (error) {
    console.error('QuickBooks callback error:', error);
    res.redirect('/account/#settings?qb=error');
  }
});

/**
 * POST /api/quickbooks/disconnect
 * Disconnect QuickBooks
 */
router.post('/disconnect', authenticateJWT, async (req, res) => {
  try {
    await qbo.disconnect(req.user.id);
    res.json({ success: true, message: 'QuickBooks disconnected' });
  } catch (error) {
    console.error('QuickBooks disconnect error:', error);
    res.status(500).json({ error: 'Failed to disconnect QuickBooks' });
  }
});

/**
 * POST /api/quickbooks/sync/customer/:id
 * Sync a single customer to QuickBooks
 */
router.post('/sync/customer/:id', authenticateJWT, async (req, res) => {
  try {
    const result = await qbo.syncCustomer(req.user.id, req.params.id);
    res.json(result);
  } catch (error) {
    console.error('Customer sync error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/quickbooks/sync/invoice/:id
 * Sync a single invoice to QuickBooks
 */
router.post('/sync/invoice/:id', authenticateJWT, async (req, res) => {
  try {
    const result = await qbo.syncInvoice(req.user.id, req.params.id);
    res.json(result);
  } catch (error) {
    console.error('Invoice sync error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/quickbooks/sync/estimate/:id
 * Sync a single estimate to QuickBooks
 */
router.post('/sync/estimate/:id', authenticateJWT, async (req, res) => {
  try {
    const result = await qbo.syncEstimate(req.user.id, req.params.id);
    res.json(result);
  } catch (error) {
    console.error('Estimate sync error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/quickbooks/sync/invoices
 * Sync all pending invoices
 */
router.post('/sync/invoices', authenticateJWT, async (req, res) => {
  try {
    const results = await qbo.syncPendingInvoices(req.user.id);
    res.json({
      success: true,
      message: `Synced ${results.synced} invoices, ${results.errors} errors`,
      ...results
    });
  } catch (error) {
    console.error('Bulk invoice sync error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/quickbooks/sync/estimates
 * Sync all pending estimates
 */
router.post('/sync/estimates', authenticateJWT, async (req, res) => {
  try {
    const results = await qbo.syncPendingEstimates(req.user.id);
    res.json({
      success: true,
      message: `Synced ${results.synced} estimates, ${results.errors} errors`,
      ...results
    });
  } catch (error) {
    console.error('Bulk estimate sync error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/quickbooks/sync/all
 * Sync all pending items (customers, invoices, estimates)
 */
router.post('/sync/all', authenticateJWT, async (req, res) => {
  try {
    const invoiceResults = await qbo.syncPendingInvoices(req.user.id);
    const estimateResults = await qbo.syncPendingEstimates(req.user.id);

    res.json({
      success: true,
      invoices: invoiceResults,
      estimates: estimateResults
    });
  } catch (error) {
    console.error('Full sync error:', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
