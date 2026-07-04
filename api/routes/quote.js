// Countertop job-quote API — backs the website calculator + Aria quoting.
const express = require('express');
const router = express.Router();
const { quoteCountertop, COUNTERTOP_PRICING } = require('../services/countertopQuote');

// GET /api/quote/countertop/rates — the current pricing config (fab/install/demo/edge/plumbing/waste)
router.get('/countertop/rates', (req, res) => res.json({ success: true, rates: COUNTERTOP_PRICING }));

// POST /api/quote/countertop — compute an itemized countertop job quote.
// body: { sqft, materialPerSqft, edgeLinearFt, edgeType, kitchenSinks, bathroomSinks, demoLevel, demoSqft, rates?, extras? }
router.post('/countertop', (req, res) => {
  try { return res.json({ success: true, quote: quoteCountertop(req.body || {}) }); }
  catch (e) { return res.status(400).json({ success: false, error: e.message }); }
});

module.exports = router;
