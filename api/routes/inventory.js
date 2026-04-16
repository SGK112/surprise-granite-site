/**
 * Inventory Routes
 *
 * Store-side stock tracking. Aria (and human admins) can CRUD stock
 * records via /api/inventory. The Stripe checkout webhook calls
 * deductForOrder() after a successful order, and the checkout route
 * can optionally call checkAvailability() before creating a session.
 *
 * Requires migration 012_product_inventory.sql.
 */

const express = require('express');
const router = express.Router();
const logger = require('../utils/logger');
const { adminAccess } = require('../middleware/adminAuth');

// ---------- Core helpers (exported for webhook use) ----------

/**
 * Extract a SKU from a cart line item. Items may arrive with an
 * explicit sku, or a slug, or only a product name — try each.
 */
function resolveSku(item) {
  return (item.sku || item.product_sku || item.slug || item.product_slug || item.name || '')
    .toString()
    .trim()
    .toLowerCase();
}

/**
 * Check that every tracked SKU in `items` has enough stock. Items
 * without an inventory row are treated as untracked (infinite stock).
 * Returns { ok, issues: [{sku, available, requested}] }
 */
async function checkAvailability(supabase, items) {
  if (!supabase || !Array.isArray(items) || items.length === 0) {
    return { ok: true, issues: [] };
  }
  const needed = {};
  for (const item of items) {
    const sku = resolveSku(item);
    if (!sku) continue;
    needed[sku] = (needed[sku] || 0) + Number(item.quantity || 1);
  }
  const skus = Object.keys(needed);
  if (skus.length === 0) return { ok: true, issues: [] };

  const { data: rows, error } = await supabase
    .from('product_inventory')
    .select('sku, qty_on_hand, track_inventory, allow_backorder')
    .in('sku', skus);

  if (error) {
    logger.warn('Inventory availability check error:', error.message);
    return { ok: true, issues: [] }; // fail-open; don't block checkout on DB hiccup
  }

  const issues = [];
  for (const row of rows || []) {
    if (!row.track_inventory || row.allow_backorder) continue;
    const requested = needed[row.sku];
    if ((row.qty_on_hand || 0) < requested) {
      issues.push({
        sku: row.sku,
        available: row.qty_on_hand || 0,
        requested
      });
    }
  }
  return { ok: issues.length === 0, issues };
}

/**
 * Deduct stock for a successfully-placed order. Writes an
 * inventory_movements row for each SKU so we have a full audit trail.
 * Never throws — logs and moves on.
 */
async function deductForOrder(supabase, { order, items }) {
  if (!supabase || !Array.isArray(items) || items.length === 0) return;
  for (const item of items) {
    const sku = resolveSku(item);
    const qty = Number(item.quantity || 1);
    if (!sku || qty <= 0) continue;
    try {
      // Prefer atomic RPC (migration 013) — uses FOR UPDATE row lock
      // so concurrent checkouts can't double-deduct.
      const { data: newQty, error: rpcErr } = await supabase.rpc('decrement_inventory', {
        p_sku: sku,
        p_qty: qty,
        p_order_id: order?.id || null,
        p_note: `Order ${order?.order_number || order?.id || ''}`.trim()
      });
      if (!rpcErr && newQty !== -1) continue; // success via RPC

      // Fallback: read-modify-write (races possible, but works before
      // migration 013 is applied).
      if (rpcErr) logger.warn(`Inventory RPC unavailable for ${sku}, falling back:`, rpcErr.message);
      const { data: row } = await supabase
        .from('product_inventory')
        .select('id, qty_on_hand, track_inventory')
        .eq('sku', sku)
        .single();
      if (!row || !row.track_inventory) continue;
      await supabase
        .from('product_inventory')
        .update({
          qty_on_hand: Math.max(0, (row.qty_on_hand || 0) - qty),
          updated_at: new Date().toISOString()
        })
        .eq('id', row.id);
      await supabase.from('inventory_movements').insert({
        sku, delta: -qty, reason: 'order',
        order_id: order?.id || null,
        note: `Deducted on order ${order?.order_number || order?.id || ''}`.trim()
      });
    } catch (err) {
      logger.warn(`Inventory deduction failed for ${sku}:`, err.message);
    }
  }
}

/**
 * Restock after a refund or cancellation. Additive counterpart to
 * deductForOrder. Never throws.
 */
async function restockForOrder(supabase, { order, items, reason = 'refund' }) {
  if (!supabase || !Array.isArray(items) || items.length === 0) return;
  for (const item of items) {
    const sku = resolveSku(item);
    const qty = Number(item.quantity || 1);
    if (!sku || qty <= 0) continue;
    try {
      // Prefer atomic RPC (migration 013).
      const { data: newQty, error: rpcErr } = await supabase.rpc('increment_inventory', {
        p_sku: sku,
        p_qty: qty,
        p_reason: reason,
        p_order_id: order?.id || null,
        p_note: `Restocked via ${reason} for order ${order?.order_number || order?.id || ''}`.trim()
      });
      if (!rpcErr && newQty !== -1) continue;

      // Fallback: read-modify-write.
      if (rpcErr) logger.warn(`Inventory RPC unavailable for ${sku}, falling back:`, rpcErr.message);
      const { data: row } = await supabase
        .from('product_inventory')
        .select('id, qty_on_hand, track_inventory')
        .eq('sku', sku)
        .single();
      if (!row || !row.track_inventory) continue;
      await supabase
        .from('product_inventory')
        .update({
          qty_on_hand: (row.qty_on_hand || 0) + qty,
          updated_at: new Date().toISOString()
        })
        .eq('id', row.id);
      await supabase.from('inventory_movements').insert({
        sku, delta: qty, reason,
        order_id: order?.id || null,
        note: `Restocked via ${reason} for order ${order?.order_number || order?.id || ''}`.trim()
      });
    } catch (err) {
      logger.warn(`Inventory restock failed for ${sku}:`, err.message);
    }
  }
}

// ---------- Admin CRUD ----------

router.get('/', adminAccess, async (req, res) => {
  try {
    const supabase = req.app.get('supabase');
    const { low_stock } = req.query;
    let q = supabase.from('product_inventory').select('*').order('sku');
    const { data, error } = await q;
    if (error) return res.status(500).json({ error: error.message });
    let filtered = data || [];
    if (low_stock === 'true') {
      filtered = filtered.filter(r =>
        r.track_inventory &&
        r.low_stock_threshold != null &&
        (r.qty_on_hand || 0) <= r.low_stock_threshold
      );
    }
    res.json({ inventory: filtered });
  } catch (err) {
    logger.error('List inventory error:', err.message);
    res.status(500).json({ error: 'Failed to list inventory' });
  }
});

router.get('/:sku', adminAccess, async (req, res) => {
  try {
    const supabase = req.app.get('supabase');
    const { data, error } = await supabase
      .from('product_inventory')
      .select('*')
      .eq('sku', req.params.sku)
      .single();
    if (error || !data) return res.status(404).json({ error: 'SKU not found' });

    const { data: movements } = await supabase
      .from('inventory_movements')
      .select('*')
      .eq('sku', req.params.sku)
      .order('created_at', { ascending: false })
      .limit(25);

    res.json({ inventory: data, recent_movements: movements || [] });
  } catch (err) {
    logger.error('Get inventory error:', err.message);
    res.status(500).json({ error: 'Failed to get inventory' });
  }
});

router.post('/', adminAccess, async (req, res) => {
  try {
    const supabase = req.app.get('supabase');
    const {
      sku, name, qty_on_hand = 0, low_stock_threshold = 5,
      track_inventory = true, allow_backorder = false, location, notes, metadata
    } = req.body || {};
    if (!sku) return res.status(400).json({ error: 'sku is required' });

    const { data, error } = await supabase
      .from('product_inventory')
      .insert({
        sku: String(sku).trim().toLowerCase(),
        name: name || null,
        qty_on_hand: Number(qty_on_hand) || 0,
        low_stock_threshold,
        track_inventory,
        allow_backorder,
        location: location || 'warehouse',
        notes: notes || null,
        metadata: metadata || {}
      })
      .select()
      .single();
    if (error) {
      if (error.code === '23505') return res.status(409).json({ error: 'SKU already exists' });
      return res.status(500).json({ error: error.message });
    }

    // Seed a movement for the starting quantity
    if (Number(qty_on_hand) > 0) {
      await supabase.from('inventory_movements').insert({
        sku: data.sku,
        delta: Number(qty_on_hand),
        reason: 'restock',
        actor_id: req.user?.id || null,
        note: 'Initial stock on creation'
      });
    }

    res.status(201).json({ inventory: data });
  } catch (err) {
    logger.error('Create inventory error:', err.message);
    res.status(500).json({ error: 'Failed to create inventory' });
  }
});

router.put('/:sku', adminAccess, async (req, res) => {
  try {
    const supabase = req.app.get('supabase');
    const { data: existing } = await supabase
      .from('product_inventory')
      .select('*')
      .eq('sku', req.params.sku)
      .single();
    if (!existing) return res.status(404).json({ error: 'SKU not found' });

    const allowed = [
      'name', 'low_stock_threshold', 'track_inventory',
      'allow_backorder', 'location', 'notes', 'metadata'
    ];
    const updates = { updated_at: new Date().toISOString() };
    for (const k of allowed) if (k in req.body) updates[k] = req.body[k];

    // qty changes go through adjust endpoint to preserve audit trail
    if ('qty_on_hand' in req.body) {
      return res.status(400).json({
        error: 'Use POST /api/inventory/:sku/adjust to change qty_on_hand (keeps audit trail)'
      });
    }

    const { data, error } = await supabase
      .from('product_inventory')
      .update(updates)
      .eq('id', existing.id)
      .select()
      .single();
    if (error) return res.status(500).json({ error: error.message });
    res.json({ inventory: data });
  } catch (err) {
    logger.error('Update inventory error:', err.message);
    res.status(500).json({ error: 'Failed to update inventory' });
  }
});

/**
 * POST /api/inventory/:sku/adjust
 * Body: { delta: number, reason: string, note?: string }
 * reason: restock | manual_adjust | correction | shrinkage
 */
router.post('/:sku/adjust', adminAccess, async (req, res) => {
  try {
    const supabase = req.app.get('supabase');
    const { delta, reason = 'manual_adjust', note } = req.body || {};
    const d = Number(delta);
    if (!Number.isFinite(d) || d === 0) {
      return res.status(400).json({ error: 'delta must be a non-zero number' });
    }
    const { data: row } = await supabase
      .from('product_inventory')
      .select('*')
      .eq('sku', req.params.sku)
      .single();
    if (!row) return res.status(404).json({ error: 'SKU not found' });

    const next = Math.max(0, (row.qty_on_hand || 0) + d);
    await supabase
      .from('product_inventory')
      .update({ qty_on_hand: next, updated_at: new Date().toISOString() })
      .eq('id', row.id);

    await supabase.from('inventory_movements').insert({
      sku: row.sku,
      delta: d,
      reason,
      actor_id: req.user?.id || null,
      note: note || null
    });

    res.json({ sku: row.sku, qty_on_hand: next, previous: row.qty_on_hand || 0, delta: d });
  } catch (err) {
    logger.error('Adjust inventory error:', err.message);
    res.status(500).json({ error: 'Failed to adjust inventory' });
  }
});

router.delete('/:sku', adminAccess, async (req, res) => {
  try {
    const supabase = req.app.get('supabase');
    const { error } = await supabase
      .from('product_inventory')
      .delete()
      .eq('sku', req.params.sku);
    if (error) return res.status(500).json({ error: error.message });
    res.json({ deleted: true });
  } catch (err) {
    logger.error('Delete inventory error:', err.message);
    res.status(500).json({ error: 'Failed to delete inventory' });
  }
});

module.exports = router;
module.exports.checkAvailability = checkAvailability;
module.exports.deductForOrder = deductForOrder;
module.exports.restockForOrder = restockForOrder;
