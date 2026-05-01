/**
 * Drop-ship Sample Orders — customer orders a sample, vendor ships direct.
 *
 * Routes:
 *   POST /api/dropship/order            — place sample order (public, rate-limited)
 *   GET  /api/dropship/orders           — admin list (X-Admin-Key)
 *   POST /api/dropship/orders/:id/status — admin update status (X-Admin-Key)
 *
 * Flow on POST /order:
 *   1. Validate product is sample_eligible
 *   2. Insert into drop_ship_orders with status='pending'
 *   3. Email Joshua/admin with order details
 *   4. (Future) Stripe payment intent if sample_price > 0
 *   5. (Future) Auto-notify vendor by configured method
 */
const express = require('express');
const router = express.Router();
const logger = require('../utils/logger');
let leadRateLimiter = null;
try { leadRateLimiter = require('../middleware/rateLimiter').leadRateLimiter; }
catch (e) { logger.warn('dropship: rate limiter unavailable'); }

function s(v, max = 200) {
  if (typeof v !== 'string') return null;
  const t = v.trim().slice(0, max);
  return t || null;
}
function isValidEmail(e) {
  return typeof e === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e) && e.length <= 254;
}
function generateOrderNumber() {
  const d = new Date();
  const ymd = `${d.getUTCFullYear()}-${String(d.getUTCMonth()+1).padStart(2,'0')}-${String(d.getUTCDate()).padStart(2,'0')}`;
  const rand = Math.floor(Math.random() * 9000 + 1000);
  return `DS-${ymd}-${rand}`;
}

const orderHandlers = [];
if (leadRateLimiter) orderHandlers.push(leadRateLimiter);
orderHandlers.push(async (req, res) => {
  try {
    const supabase = req.app.get('supabase');
    if (!supabase) return res.status(503).json({ error: 'Database not available' });
    const body = req.body || {};

    // Required: customer email + product_id
    const customer_email = s(body.customer_email, 254);
    const product_id = s(body.product_id, 50);
    if (!customer_email || !isValidEmail(customer_email)) return res.status(400).json({ error: 'Valid customer_email required' });
    if (!product_id) return res.status(400).json({ error: 'product_id required' });

    // Validate product is sample-eligible
    const { data: product, error: pErr } = await supabase
      .from('catalog_products')
      .select('id, vendor_id, sku, name, sample_eligible, sample_price, sample_sku')
      .eq('id', product_id)
      .maybeSingle();
    if (pErr || !product) return res.status(404).json({ error: 'Product not found' });
    if (!product.sample_eligible) return res.status(400).json({ error: 'Sample not available for this product' });

    // Get vendor for shipping/email config
    const { data: vendor } = await supabase
      .from('vendor_config')
      .select('vendor_id, vendor_name, dropship_email, dropship_method, sample_shipping')
      .eq('vendor_id', product.vendor_id)
      .maybeSingle();

    const quantity = Math.min(Math.max(parseInt(body.quantity) || 1, 1), 10);
    const unit_price = parseFloat(product.sample_price) || 0;
    const shipping = parseFloat(vendor?.sample_shipping) || 0;
    const total = unit_price * quantity + shipping;

    // Build order row
    const order = {
      order_number: generateOrderNumber(),
      customer_email,
      customer_name: s(body.customer_name, 100),
      customer_phone: s(body.customer_phone, 30),
      ship_to_name: s(body.ship_to_name, 100) || s(body.customer_name, 100),
      ship_to_street: s(body.ship_to_street, 200),
      ship_to_city: s(body.ship_to_city, 100),
      ship_to_state: s(body.ship_to_state, 30),
      ship_to_zip: s(body.ship_to_zip, 20),
      ship_to_country: s(body.ship_to_country, 30) || 'US',
      product_id: product.id,
      vendor_id: product.vendor_id,
      product_sku: product.sample_sku || product.sku,
      product_name: product.name,
      quantity,
      unit_price,
      shipping,
      total,
      status: 'pending',
      notes: s(body.notes, 500)
    };

    // Validate shipping address if order has any cost
    if (total > 0) {
      if (!order.ship_to_street || !order.ship_to_city || !order.ship_to_state || !order.ship_to_zip) {
        return res.status(400).json({ error: 'Shipping address required (street, city, state, zip)' });
      }
    }

    const { data: row, error } = await supabase
      .from('drop_ship_orders')
      .insert(order)
      .select('id, order_number, status, total')
      .single();
    if (error) {
      logger.error('Dropship order insert failed', { error: error.message });
      return res.status(500).json({ error: 'Order creation failed', details: error.message });
    }

    // Notify admin (non-blocking)
    try {
      const emailService = require('../services/emailService');
      const adminEmail = process.env.ADMIN_EMAIL || 'joshb@surprisegranite.com';
      await emailService.send({
        to: adminEmail,
        subject: `[Drop-ship] New sample order ${row.order_number} — ${product.name}`,
        html: `<h2>New drop-ship sample order</h2>
          <p><strong>${row.order_number}</strong> · ${vendor?.vendor_name || product.vendor_id}</p>
          <p><strong>Product:</strong> ${product.name} (SKU ${order.product_sku}) × ${quantity}</p>
          <p><strong>Customer:</strong> ${customer_email}${order.customer_name ? ' (' + order.customer_name + ')' : ''}${order.customer_phone ? ' · ' + order.customer_phone : ''}</p>
          <p><strong>Ship to:</strong><br/>
            ${order.ship_to_name || ''}<br/>
            ${order.ship_to_street || ''}<br/>
            ${order.ship_to_city || ''}, ${order.ship_to_state || ''} ${order.ship_to_zip || ''}
          </p>
          <p><strong>Total:</strong> $${total.toFixed(2)} (sample $${unit_price.toFixed(2)} × ${quantity} + shipping $${shipping.toFixed(2)})</p>
          <p><strong>Vendor handoff method:</strong> ${vendor?.dropship_method || 'manual'}${vendor?.dropship_email ? ' · ' + vendor.dropship_email : ''}</p>`
      });
    } catch (e) {
      logger.warn('Dropship admin notify failed (non-blocking)', { error: e.message, order_id: row.id });
    }

    return res.status(201).json({
      success: true,
      order: { id: row.id, order_number: row.order_number, status: row.status, total: row.total },
      message: 'Sample ordered. We\'ll forward to the vendor and email you tracking once shipped.'
    });
  } catch (e) {
    logger.error('Dropship order error', { error: e.message, stack: e.stack });
    return res.status(500).json({ error: 'Internal error' });
  }
});

router.post('/order', ...orderHandlers);

// Admin list
router.get('/orders', async (req, res) => {
  try {
    const supabase = req.app.get('supabase');
    if (!supabase) return res.status(503).json({ error: 'Database not available' });
    const adminKey = process.env.ADMIN_KEY || process.env.ASPN_ADMIN_KEY;
    if (!adminKey) return res.status(503).json({ error: 'Admin not configured' });
    if (req.headers['x-admin-key'] !== adminKey) return res.status(401).json({ error: 'Unauthorized' });

    const status = s(req.query?.status, 30);
    let q = supabase.from('drop_ship_orders')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(200);
    if (status) q = q.eq('status', status);
    const { data, error } = await q;
    if (error) return res.status(500).json({ error: error.message });
    return res.json({ success: true, orders: data || [] });
  } catch (e) {
    return res.status(500).json({ error: 'Internal error' });
  }
});

// Admin status update
router.post('/orders/:id/status', async (req, res) => {
  try {
    const supabase = req.app.get('supabase');
    if (!supabase) return res.status(503).json({ error: 'Database not available' });
    const adminKey = process.env.ADMIN_KEY || process.env.ASPN_ADMIN_KEY;
    if (!adminKey) return res.status(503).json({ error: 'Admin not configured' });
    if (req.headers['x-admin-key'] !== adminKey) return res.status(401).json({ error: 'Unauthorized' });

    const id = s(req.params?.id, 50);
    const body = req.body || {};
    const updates = {};
    const allowed = ['status', 'vendor_order_ref', 'tracking_number', 'tracking_carrier', 'notes', 'paid'];
    allowed.forEach(k => { if (body[k] !== undefined) updates[k] = body[k]; });
    if (Object.keys(updates).length === 0) return res.status(400).json({ error: 'No fields to update' });
    if (updates.status === 'shipped' && !updates.shipped_at) updates.shipped_at = new Date().toISOString();
    if (updates.paid === true && !updates.paid_at) updates.paid_at = new Date().toISOString();

    const { data, error } = await supabase
      .from('drop_ship_orders')
      .update(updates)
      .eq('id', id)
      .select('id, order_number, status')
      .single();
    if (error) return res.status(500).json({ error: error.message });
    return res.json({ success: true, order: data });
  } catch (e) {
    return res.status(500).json({ error: 'Internal error' });
  }
});

module.exports = router;
