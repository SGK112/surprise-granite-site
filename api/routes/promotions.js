/**
 * Promotions Routes
 *
 * Server-enforced promo codes. Admins (and Aria) can CRUD via the
 * /api/promotions endpoints. Checkout validates via POST /validate
 * before creating a Stripe session.
 *
 * Requires migration 011_promotions.sql.
 */

const express = require('express');
const router = express.Router();
const logger = require('../utils/logger');
const { authenticateJWT } = require('../lib/auth/middleware');
const { requireAdmin } = require('../middleware/adminAuth');

// ---------- Validation logic (shared w/ checkout route) ----------

/**
 * Validate a promo code against a cart. Returns { valid, promotion,
 * discount_amount, reason }. Reason is populated when valid === false.
 * Never throws — returns structured result.
 */
async function validatePromoCode({ supabase, code, subtotal, shippingAmount, customerEmail }) {
  if (!code) return { valid: false, reason: 'No code provided' };
  if (!supabase) return { valid: false, reason: 'Database not configured' };

  const codeUpper = String(code).trim().toUpperCase();
  if (!codeUpper) return { valid: false, reason: 'No code provided' };

  const { data: promo, error } = await supabase
    .from('promotions')
    .select('*')
    .ilike('code', codeUpper)
    .limit(1)
    .single();

  if (error || !promo) {
    return { valid: false, reason: 'Invalid promo code' };
  }
  if (!promo.active) {
    return { valid: false, reason: 'This code is no longer active' };
  }

  const now = new Date();
  if (promo.starts_at && new Date(promo.starts_at) > now) {
    return { valid: false, reason: 'This code is not yet active' };
  }
  if (promo.ends_at && new Date(promo.ends_at) < now) {
    return { valid: false, reason: 'This code has expired' };
  }
  if (promo.max_uses != null && promo.current_uses >= promo.max_uses) {
    return { valid: false, reason: 'This code has reached its usage limit' };
  }
  if (promo.min_order_amount != null && Number(subtotal || 0) < Number(promo.min_order_amount)) {
    return {
      valid: false,
      reason: `Minimum order of $${Number(promo.min_order_amount).toFixed(2)} required`
    };
  }

  // Per-customer limit
  if (promo.per_customer_limit != null && customerEmail) {
    const { count } = await supabase
      .from('promotion_redemptions')
      .select('id', { count: 'exact', head: true })
      .eq('promotion_id', promo.id)
      .eq('customer_email', customerEmail.toLowerCase());
    if ((count || 0) >= promo.per_customer_limit) {
      return { valid: false, reason: 'You have already used this code' };
    }
  }

  // Compute discount
  let discountAmount = 0;
  let freeShipping = false;
  const sub = Number(subtotal || 0);

  if (promo.type === 'percent') {
    discountAmount = Math.max(0, Math.round(sub * (Number(promo.value) / 100) * 100) / 100);
  } else if (promo.type === 'fixed') {
    discountAmount = Math.min(sub, Number(promo.value));
  } else if (promo.type === 'free_shipping') {
    freeShipping = true;
    discountAmount = Number(shippingAmount || 0);
  }

  return {
    valid: true,
    promotion: {
      id: promo.id,
      code: promo.code,
      type: promo.type,
      value: Number(promo.value),
      description: promo.description
    },
    discount_amount: discountAmount,
    free_shipping: freeShipping
  };
}

// ---------- Public validation endpoint ----------

/**
 * POST /api/promotions/validate
 * Body: { code, subtotal, shipping?, customer_email? }
 * Public with rate limiting via global middleware.
 */
router.post('/validate', async (req, res) => {
  try {
    const supabase = req.app.get('supabase');
    const { code, subtotal, shipping, customer_email } = req.body || {};
    const result = await validatePromoCode({
      supabase,
      code,
      subtotal,
      shippingAmount: shipping,
      customerEmail: customer_email
    });
    res.json(result);
  } catch (err) {
    logger.error('Promo validate error:', err.message);
    res.status(500).json({ valid: false, reason: 'Validation error' });
  }
});

// ---------- Admin CRUD (Aria target) ----------

router.get('/', authenticateJWT, requireAdmin, async (req, res) => {
  try {
    const supabase = req.app.get('supabase');
    const { active } = req.query;
    let query = supabase.from('promotions').select('*').order('created_at', { ascending: false });
    if (active === 'true') query = query.eq('active', true);
    if (active === 'false') query = query.eq('active', false);
    const { data, error } = await query;
    if (error) return res.status(500).json({ error: error.message });
    res.json({ promotions: data });
  } catch (err) {
    logger.error('List promotions error:', err.message);
    res.status(500).json({ error: 'Failed to list promotions' });
  }
});

router.get('/:id', authenticateJWT, requireAdmin, async (req, res) => {
  try {
    const supabase = req.app.get('supabase');
    const { data, error } = await supabase
      .from('promotions')
      .select('*')
      .eq('id', req.params.id)
      .single();
    if (error || !data) return res.status(404).json({ error: 'Promotion not found' });

    // Attach redemption count
    const { count } = await supabase
      .from('promotion_redemptions')
      .select('id', { count: 'exact', head: true })
      .eq('promotion_id', data.id);

    res.json({ promotion: data, redemption_count: count || 0 });
  } catch (err) {
    logger.error('Get promotion error:', err.message);
    res.status(500).json({ error: 'Failed to get promotion' });
  }
});

router.post('/', authenticateJWT, requireAdmin, async (req, res) => {
  try {
    const supabase = req.app.get('supabase');
    const {
      code, type, value = 0, description, active = true,
      starts_at, ends_at, max_uses, per_customer_limit,
      min_order_amount, metadata
    } = req.body || {};

    if (!code || !type) {
      return res.status(400).json({ error: 'code and type are required' });
    }
    if (!['percent', 'fixed', 'free_shipping'].includes(type)) {
      return res.status(400).json({ error: 'type must be percent, fixed, or free_shipping' });
    }
    if (type === 'percent' && (Number(value) < 0 || Number(value) > 100)) {
      return res.status(400).json({ error: 'percent value must be 0-100' });
    }
    if (type === 'fixed' && Number(value) < 0) {
      return res.status(400).json({ error: 'fixed value must be >= 0' });
    }

    const { data, error } = await supabase
      .from('promotions')
      .insert({
        code: String(code).trim().toUpperCase(),
        type,
        value: Number(value) || 0,
        description: description || null,
        active,
        starts_at: starts_at || null,
        ends_at: ends_at || null,
        max_uses: max_uses ?? null,
        per_customer_limit: per_customer_limit ?? null,
        min_order_amount: min_order_amount ?? null,
        metadata: metadata || {},
        created_by: req.user?.id || null
      })
      .select()
      .single();

    if (error) {
      if (error.code === '23505') {
        return res.status(409).json({ error: 'That code already exists' });
      }
      return res.status(500).json({ error: error.message });
    }
    res.status(201).json({ promotion: data });
  } catch (err) {
    logger.error('Create promotion error:', err.message);
    res.status(500).json({ error: 'Failed to create promotion' });
  }
});

router.put('/:id', authenticateJWT, requireAdmin, async (req, res) => {
  try {
    const supabase = req.app.get('supabase');
    const allowed = [
      'code', 'type', 'value', 'description', 'active',
      'starts_at', 'ends_at', 'max_uses', 'per_customer_limit',
      'min_order_amount', 'metadata'
    ];
    const updates = { updated_at: new Date().toISOString() };
    for (const k of allowed) {
      if (k in req.body) updates[k] = req.body[k];
    }
    if (updates.code) updates.code = String(updates.code).trim().toUpperCase();

    const { data, error } = await supabase
      .from('promotions')
      .update(updates)
      .eq('id', req.params.id)
      .select()
      .single();
    if (error) return res.status(500).json({ error: error.message });
    if (!data) return res.status(404).json({ error: 'Promotion not found' });
    res.json({ promotion: data });
  } catch (err) {
    logger.error('Update promotion error:', err.message);
    res.status(500).json({ error: 'Failed to update promotion' });
  }
});

router.delete('/:id', authenticateJWT, requireAdmin, async (req, res) => {
  try {
    const supabase = req.app.get('supabase');
    const { error } = await supabase.from('promotions').delete().eq('id', req.params.id);
    if (error) return res.status(500).json({ error: error.message });
    res.json({ deleted: true });
  } catch (err) {
    logger.error('Delete promotion error:', err.message);
    res.status(500).json({ error: 'Failed to delete promotion' });
  }
});

module.exports = router;
module.exports.validatePromoCode = validatePromoCode;
