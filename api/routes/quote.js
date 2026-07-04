// Countertop job-quote API — backs the website calculator + Aria quoting.
const express = require('express');
const router = express.Router();
const { quoteCountertop, resolveColorCost, COUNTERTOP_PRICING } = require('../services/countertopQuote');

// GET /api/quote/countertop/rates — the current pricing config (fab/install/demo/edge/plumbing/waste/markup)
router.get('/countertop/rates', (req, res) => res.json({ success: true, rates: COUNTERTOP_PRICING }));

// GET /api/quote/countertop/material?color=X — the color's vendor cost/sqft +
// the sell $/sqft after the standard material markup (Aria's cost lookup).
router.get('/countertop/material', async (req, res) => {
  try {
    const hit = await resolveColorCost(req.app.get('supabase'), req.query.color);
    if (!hit) return res.status(404).json({ success: false, error: 'No priced color matched' });
    const markupX = COUNTERTOP_PRICING.materialMarkupX;
    return res.json({ success: true, material: { ...hit, markupX, sellPerSqft: Math.round(hit.costPerSqft * markupX * 100) / 100 } });
  } catch (e) { return res.status(500).json({ success: false, error: e.message }); }
});

// POST /api/quote/countertop — compute an itemized countertop job quote.
// body: { sqft, materialPerSqft?, color?, materialMarkupX?, edgeLinearFt, edgeType,
//         kitchenSinks, bathroomSinks, demoLevel, demoSqft, rates?, extras? }
// Pass `color` instead of materialPerSqft and the engine pulls the color's
// $/sqft cost from the master price list and applies the material markup.
router.post('/countertop', async (req, res) => {
  try {
    const body = { ...(req.body || {}) };
    let material = null;
    if (!(Number(body.materialPerSqft) > 0) && body.color) {
      material = await resolveColorCost(req.app.get('supabase'), body.color);
      if (!material) return res.status(404).json({ success: false, error: `No priced color matched "${body.color}" — pass materialPerSqft or check the color name` });
      const markupX = Number(body.materialMarkupX) > 0 ? Number(body.materialMarkupX) : COUNTERTOP_PRICING.materialMarkupX;
      body.materialPerSqft = Math.round(material.costPerSqft * markupX * 100) / 100;
      material = { ...material, markupX, sellPerSqft: body.materialPerSqft };
    }
    const quote = quoteCountertop(body);
    return res.json({ success: true, quote, material });
  } catch (e) { return res.status(400).json({ success: false, error: e.message }); }
});

module.exports = router;
