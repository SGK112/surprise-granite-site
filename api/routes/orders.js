/**
 * Order Management Routes
 * Admin endpoints for managing shop orders: status updates, tracking, customer notifications
 */

const express = require('express');
const router = express.Router();
const logger = require('../utils/logger');
const { authenticateJWT } = require('../lib/auth/middleware');
const emailService = require('../services/emailService');

// Admin emails whitelist
const ADMIN_EMAILS = ['joshb@surprisegranite.com', 'josh.b@surprisegranite.com'];

// Verify admin access
async function requireAdmin(req, res, next) {
  try {
    const supabase = req.app.get('supabase');
    if (!req.user?.id || !supabase) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const { data: user } = await supabase
      .from('sg_users')
      .select('account_type, email, role')
      .eq('id', req.user.id)
      .single();

    const isAdmin = ADMIN_EMAILS.includes(user?.email) ||
      ['admin', 'super_admin', 'owner'].includes(user?.role) ||
      ['admin', 'super_admin'].includes(user?.account_type);

    if (!isAdmin) {
      return res.status(403).json({ error: 'Admin access required' });
    }

    req.adminUser = user;
    next();
  } catch (err) {
    logger.error('Admin auth check failed:', err.message);
    return res.status(500).json({ error: 'Auth check failed' });
  }
}

/**
 * GET /api/admin/orders - List all orders (both tables)
 */
router.get('/', authenticateJWT, requireAdmin, async (req, res) => {
  try {
    const supabase = req.app.get('supabase');
    const { source, status, payment_status, search, limit = 100, offset = 0 } = req.query;

    let orders = [];

    // Fetch from orders table (Stripe checkout orders)
    if (!source || source === 'store') {
      let query = supabase
        .from('orders')
        .select('*')
        .order('created_at', { ascending: false })
        .range(parseInt(offset), parseInt(offset) + parseInt(limit) - 1);

      if (status) query = query.eq('status', status);
      if (payment_status) query = query.eq('payment_status', payment_status);
      if (search) {
        query = query.or(`order_number.ilike.%${search}%,customer_name.ilike.%${search}%,customer_email.ilike.%${search}%`);
      }

      const { data, error } = await query;
      if (error) logger.error('Error fetching store orders:', error.message);
      if (data) {
        orders = orders.concat(data.map(o => ({ ...o, _source: 'store' })));
      }
    }

    // Fetch from shopify_orders table
    if (!source || source === 'shopify') {
      let query = supabase
        .from('shopify_orders')
        .select('*')
        .order('shopify_created_at', { ascending: false })
        .range(parseInt(offset), parseInt(offset) + parseInt(limit) - 1);

      if (search) {
        query = query.or(`order_number.ilike.%${search}%,customer_name.ilike.%${search}%,customer_email.ilike.%${search}%`);
      }

      const { data, error } = await query;
      if (error) logger.error('Error fetching shopify orders:', error.message);
      if (data) {
        orders = orders.concat(data.map(o => ({ ...o, _source: 'shopify' })));
      }
    }

    // Sort combined by date
    orders.sort((a, b) => {
      const dateA = new Date(a.created_at || a.shopify_created_at);
      const dateB = new Date(b.created_at || b.shopify_created_at);
      return dateB - dateA;
    });

    // Get counts
    const { count: storeCount } = await supabase.from('orders').select('id', { count: 'exact', head: true });
    const { count: shopifyCount } = await supabase.from('shopify_orders').select('id', { count: 'exact', head: true });

    res.json({
      orders,
      total: (storeCount || 0) + (shopifyCount || 0),
      store_count: storeCount || 0,
      shopify_count: shopifyCount || 0
    });
  } catch (err) {
    logger.error('Error listing orders:', err.message);
    res.status(500).json({ error: 'Failed to load orders' });
  }
});

/**
 * GET /api/admin/orders/:id - Get single order
 */
router.get('/:id', authenticateJWT, requireAdmin, async (req, res) => {
  try {
    const supabase = req.app.get('supabase');
    const { id } = req.params;

    // Try orders table first
    let { data: order } = await supabase
      .from('orders')
      .select('*')
      .eq('id', id)
      .single();

    if (order) {
      // Get order items
      const { data: items } = await supabase
        .from('order_items')
        .select('*')
        .eq('order_id', id);

      // Get order events/timeline
      const { data: events } = await supabase
        .from('order_events')
        .select('*')
        .eq('order_id', id)
        .order('created_at', { ascending: true });

      return res.json({ ...order, order_items: items || [], events: events || [], _source: 'store' });
    }

    // Try shopify_orders
    let { data: shopifyOrder } = await supabase
      .from('shopify_orders')
      .select('*')
      .eq('id', id)
      .single();

    if (shopifyOrder) {
      return res.json({ ...shopifyOrder, _source: 'shopify' });
    }

    res.status(404).json({ error: 'Order not found' });
  } catch (err) {
    logger.error('Error fetching order:', err.message);
    res.status(500).json({ error: 'Failed to load order' });
  }
});

/**
 * PATCH /api/admin/orders/:id/status - Update order status
 */
router.patch('/:id/status', authenticateJWT, requireAdmin, async (req, res) => {
  try {
    const supabase = req.app.get('supabase');
    const { id } = req.params;
    const { status, notify_customer = false, message } = req.body;

    const validStatuses = ['pending', 'confirmed', 'processing', 'shipped', 'delivered', 'completed', 'cancelled', 'refunded'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ error: 'Invalid status', valid: validStatuses });
    }

    const updates = { status, updated_at: new Date().toISOString() };
    if (status === 'shipped') updates.shipped_at = new Date().toISOString();
    if (status === 'delivered') updates.delivered_at = new Date().toISOString();

    const { data: order, error } = await supabase
      .from('orders')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      logger.error('Error updating order status:', error.message);
      return res.status(500).json({ error: 'Failed to update status' });
    }

    // Log event
    await logOrderEvent(supabase, id, 'status_change', `Status changed to ${status}`, req.adminUser?.email);

    // Notify customer
    if (notify_customer && order.customer_email) {
      const emailData = emailService.generateOrderStatusEmail({
        ...order,
        admin_message: message
      });
      const result = await emailService.sendNotification(order.customer_email, emailData.subject, emailData.html);
      await logOrderEvent(supabase, id, 'email_sent', `Status update email sent: ${status}`, req.adminUser?.email);

      return res.json({ order, email_sent: result.success });
    }

    res.json({ order });
  } catch (err) {
    logger.error('Error updating order status:', err.message);
    res.status(500).json({ error: 'Failed to update status' });
  }
});

/**
 * PUT /api/admin/orders/:id/tracking - Add/update tracking info
 */
router.put('/:id/tracking', authenticateJWT, requireAdmin, async (req, res) => {
  try {
    const supabase = req.app.get('supabase');
    const { id } = req.params;
    const { tracking_number, tracking_carrier, notify_customer = true, message } = req.body;

    if (!tracking_number) {
      return res.status(400).json({ error: 'Tracking number is required' });
    }

    const updates = {
      tracking_number,
      tracking_carrier: tracking_carrier || null,
      status: 'shipped',
      shipped_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    const { data: order, error } = await supabase
      .from('orders')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      logger.error('Error updating tracking:', error.message);
      return res.status(500).json({ error: 'Failed to update tracking' });
    }

    await logOrderEvent(supabase, id, 'tracking_added', `Tracking: ${tracking_carrier || 'N/A'} ${tracking_number}`, req.adminUser?.email);

    // Send shipping notification email
    if (notify_customer && order.customer_email) {
      const emailData = emailService.generateShippingNotificationEmail({
        ...order,
        shipping_message: message
      });
      const result = await emailService.sendNotification(order.customer_email, emailData.subject, emailData.html);
      await logOrderEvent(supabase, id, 'email_sent', 'Shipping notification sent', req.adminUser?.email);

      return res.json({ order, email_sent: result.success });
    }

    res.json({ order });
  } catch (err) {
    logger.error('Error updating tracking:', err.message);
    res.status(500).json({ error: 'Failed to update tracking' });
  }
});

/**
 * POST /api/admin/orders/:id/message - Send a message to customer
 */
router.post('/:id/message', authenticateJWT, requireAdmin, async (req, res) => {
  try {
    const supabase = req.app.get('supabase');
    const { id } = req.params;
    const { message } = req.body;

    if (!message || !message.trim()) {
      return res.status(400).json({ error: 'Message is required' });
    }

    // Get order
    const { data: order, error } = await supabase
      .from('orders')
      .select('*')
      .eq('id', id)
      .single();

    if (error || !order) {
      return res.status(404).json({ error: 'Order not found' });
    }

    if (!order.customer_email) {
      return res.status(400).json({ error: 'No customer email on this order' });
    }

    // Send message email
    const emailData = emailService.generateOrderMessageEmail(order, message.trim());
    const result = await emailService.sendNotification(order.customer_email, emailData.subject, emailData.html);

    await logOrderEvent(supabase, id, 'message_sent', message.trim(), req.adminUser?.email);

    res.json({ success: result.success, email_sent: result.success });
  } catch (err) {
    logger.error('Error sending order message:', err.message);
    res.status(500).json({ error: 'Failed to send message' });
  }
});

/**
 * PUT /api/admin/orders/:id/notes - Update internal notes
 */
router.put('/:id/notes', authenticateJWT, requireAdmin, async (req, res) => {
  try {
    const supabase = req.app.get('supabase');
    const { id } = req.params;
    const { internal_notes } = req.body;

    const { data: order, error } = await supabase
      .from('orders')
      .update({ internal_notes, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();

    if (error) {
      return res.status(500).json({ error: 'Failed to update notes' });
    }

    res.json({ order });
  } catch (err) {
    logger.error('Error updating notes:', err.message);
    res.status(500).json({ error: 'Failed to update notes' });
  }
});

/**
 * POST /api/admin/orders/:id/close - Close/complete an order (works for both tables)
 */
router.post('/:id/close', authenticateJWT, requireAdmin, async (req, res) => {
  try {
    const supabase = req.app.get('supabase');
    const { id } = req.params;
    const { source } = req.body; // 'store' or 'shopify'

    if (source === 'shopify') {
      const { data, error } = await supabase
        .from('shopify_orders')
        .update({ fulfillment_status: 'FULFILLED', financial_status: 'PAID' })
        .eq('id', id)
        .select()
        .single();

      if (error) return res.status(500).json({ error: 'Failed to close shopify order' });
      return res.json({ order: data, closed: true });
    }

    // Store order
    const { data, error } = await supabase
      .from('orders')
      .update({ status: 'completed', updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();

    if (error) return res.status(500).json({ error: 'Failed to close order' });
    await logOrderEvent(supabase, id, 'status_change', 'Order closed/completed', req.adminUser?.email);
    res.json({ order: data, closed: true });
  } catch (err) {
    logger.error('Error closing order:', err.message);
    res.status(500).json({ error: 'Failed to close order' });
  }
});

/**
 * POST /api/admin/orders/bulk-close - Close multiple orders at once
 */
router.post('/bulk-close', authenticateJWT, requireAdmin, async (req, res) => {
  try {
    const supabase = req.app.get('supabase');
    const { source, ids } = req.body; // source: 'shopify' | 'store' | 'all-shopify'

    let closed = 0;

    if (source === 'all-shopify') {
      // Close ALL shopify orders
      const { data, error } = await supabase
        .from('shopify_orders')
        .update({ fulfillment_status: 'FULFILLED', financial_status: 'PAID' })
        .neq('fulfillment_status', 'FULFILLED');

      if (!error) closed = data?.length || 0;
    } else if (source === 'shopify' && Array.isArray(ids)) {
      const { data, error } = await supabase
        .from('shopify_orders')
        .update({ fulfillment_status: 'FULFILLED', financial_status: 'PAID' })
        .in('id', ids);

      if (!error) closed = data?.length || 0;
    } else if (source === 'store' && Array.isArray(ids)) {
      const { data, error } = await supabase
        .from('orders')
        .update({ status: 'completed', updated_at: new Date().toISOString() })
        .in('id', ids);

      if (!error) closed = data?.length || 0;
    }

    res.json({ closed, success: true });
  } catch (err) {
    logger.error('Error bulk closing orders:', err.message);
    res.status(500).json({ error: 'Failed to bulk close' });
  }
});

/**
 * POST /api/admin/orders/test-email - Test email delivery
 */
router.post('/test-email', authenticateJWT, requireAdmin, async (req, res) => {
  try {
    const { to } = req.body;
    const recipient = to || req.adminUser?.email || emailService.ADMIN_EMAIL;

    const html = emailService.wrapEmailTemplate(`
      <div style="text-align: center;">
        <h2 style="color: #1a1a2e;">Email System Test</h2>
        <p style="color: #666;">If you're reading this, email delivery is working.</p>
        <p style="color: #888; font-size: 13px;">Sent at ${new Date().toLocaleString('en-US', { timeZone: 'America/Phoenix' })} (Arizona time)</p>
      </div>
    `, { headerText: 'Email Test' });

    const result = await emailService.sendNotification(recipient, 'Surprise Granite - Email Test', html);

    res.json({
      success: result.success,
      sent_to: recipient,
      configured: emailService.isConfigured(),
      error: result.reason || null
    });
  } catch (err) {
    logger.error('Test email failed:', err.message);
    res.status(500).json({ error: err.message, configured: emailService.isConfigured() });
  }
});

/**
 * POST /api/admin/orders/bootstrap - Create order_events table if missing
 */
router.post('/bootstrap', authenticateJWT, requireAdmin, async (req, res) => {
  try {
    const supabase = req.app.get('supabase');

    // Test if table exists
    const { error: testErr } = await supabase.from('order_events').select('id').limit(1);

    if (testErr && testErr.message.includes('order_events')) {
      // Table doesn't exist — create via raw SQL through a Supabase function
      // Since we can't run raw SQL via REST, we'll create it on the fly
      res.json({
        exists: false,
        message: 'order_events table does not exist. Run the SQL from database/migrations/008_order_events.sql in the Supabase SQL editor.',
        sql_url: 'https://supabase.com/dashboard/project/ypeypgwsycxcagncgdur/sql'
      });
    } else {
      res.json({ exists: true, message: 'order_events table is ready' });
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * Log an order event for timeline tracking
 */
async function logOrderEvent(supabase, orderId, eventType, description, actorEmail) {
  try {
    await supabase.from('order_events').insert({
      order_id: orderId,
      event_type: eventType,
      description,
      actor: actorEmail || 'system',
      created_at: new Date().toISOString()
    });
  } catch (err) {
    // order_events table may not exist yet — log but don't fail
    logger.warn('Could not log order event (table may not exist):', err.message);
  }
}

module.exports = router;
