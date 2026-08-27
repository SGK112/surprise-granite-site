/**
 * Order Management Routes
 * Admin endpoints for managing shop orders: status updates, tracking, customer notifications
 */

const express = require('express');
const router = express.Router();
const logger = require('../utils/logger');
const { adminAccess } = require('../middleware/adminAuth');
const emailService = require('../services/emailService');

/**
 * GET /api/admin/orders - List all orders (both tables)
 */
router.get('/', adminAccess, async (req, res) => {
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
router.get('/:id', adminAccess, async (req, res) => {
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
router.patch('/:id/status', adminAccess, async (req, res) => {
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
router.put('/:id/tracking', adminAccess, async (req, res) => {
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
 * Which vendors does this order involve, and how many lines each?
 *
 * Source of truth is orders.items[].vendor_id, written by the price validator
 * at checkout. Older orders (pre 2026-08-27) have no vendor on their items and
 * come back as a single 'unassigned' bucket rather than silently vanishing.
 */
function vendorsOnOrder(order) {
  const items = Array.isArray(order.items) ? order.items : [];
  const byVendor = new Map();
  for (const it of items) {
    const vid = it.vendor_id || 'unassigned';
    if (!byVendor.has(vid)) byVendor.set(vid, []);
    byVendor.get(vid).push(it);
  }
  return byVendor;
}

/**
 * Roll the per-vendor legs up into the one order-level status the customer and
 * the orders list still read. The order is only as far along as its slowest
 * vendor: two shipped legs and one still pending is NOT a shipped order.
 */
function rollUpStatus(fulfillments, currentStatus) {
  const live = fulfillments.filter(f => f.status !== 'cancelled');
  if (!live.length) return currentStatus;
  const rank = { pending: 0, ordered: 1, shipped: 2, delivered: 3 };
  const lowest = live.reduce((min, f) => Math.min(min, rank[f.status] ?? 0), 99);
  return ['confirmed', 'processing', 'shipped', 'delivered'][lowest] || currentStatus;
}

/**
 * GET /api/admin/orders/:id/fulfillments — the per-vendor legs of one order.
 *
 * Seeds a row per vendor on first read so staff never have to create them by
 * hand, and returns each leg WITH its own line items so the UI (and the vendor
 * PO) can show one vendor exactly its own goods and nothing else.
 */
router.get('/:id/fulfillments', adminAccess, async (req, res) => {
  try {
    const supabase = req.app.get('supabase');
    const { id } = req.params;

    const { data: order, error } = await supabase.from('orders').select('*').eq('id', id).single();
    if (error || !order) return res.status(404).json({ error: 'Order not found' });

    const byVendor = vendorsOnOrder(order);

    const { data: existing } = await supabase
      .from('order_fulfillments').select('*').eq('order_id', id);
    const have = new Set((existing || []).map(f => f.vendor_id));

    const missing = [...byVendor.keys()].filter(v => !have.has(v));
    if (missing.length) {
      const { error: insErr } = await supabase.from('order_fulfillments')
        .insert(missing.map(vendor_id => ({ order_id: id, vendor_id })));
      // A concurrent seed from a second tab hits the unique constraint; that is
      // the constraint doing its job, so re-read rather than fail the request.
      if (insErr && insErr.code !== '23505') {
        logger.error('Could not seed fulfillments:', insErr.message);
      }
    }

    const { data: rows } = await supabase
      .from('order_fulfillments').select('*').eq('order_id', id).order('vendor_id');

    // Vendor names + where their PO goes, so the UI needn't look it up again.
    const vids = [...new Set((rows || []).map(r => r.vendor_id))].filter(v => v !== 'unassigned');
    let vendorInfo = {};
    if (vids.length) {
      const { data: vc } = await supabase
        .from('vendor_config').select('vendor_id, vendor_name, dropship_email').in('vendor_id', vids);
      (vc || []).forEach(v => { vendorInfo[v.vendor_id] = v; });
    }

    res.json({
      order_id: id,
      order_number: order.order_number,
      fulfillments: (rows || []).map(f => ({
        ...f,
        vendor_name: vendorInfo[f.vendor_id]?.vendor_name || f.vendor_id,
        vendor_email: vendorInfo[f.vendor_id]?.dropship_email || null,
        items: byVendor.get(f.vendor_id) || []
      }))
    });
  } catch (err) {
    logger.error('Error listing fulfillments:', err.message);
    res.status(500).json({ error: 'Failed to load fulfillments' });
  }
});

/**
 * PATCH /api/admin/orders/:id/fulfillments/:vendorId — update ONE vendor's leg.
 *
 * notify_customer emails only the lines that vendor is shipping, so a customer
 * whose order is split across two vendors gets a truthful "2 of your 3 items
 * have shipped" rather than one that implies the whole order is on its way.
 */
router.patch('/:id/fulfillments/:vendorId', adminAccess, async (req, res) => {
  try {
    const supabase = req.app.get('supabase');
    const { id, vendorId } = req.params;
    const {
      status, po_number, vendor_order_ref,
      tracking_number, tracking_carrier, notes, notify_customer = false
    } = req.body || {};

    const ALLOWED = ['pending', 'ordered', 'shipped', 'delivered', 'cancelled'];
    if (status && !ALLOWED.includes(status)) {
      return res.status(400).json({ error: `status must be one of: ${ALLOWED.join(', ')}` });
    }

    const { data: order } = await supabase.from('orders').select('*').eq('id', id).single();
    if (!order) return res.status(404).json({ error: 'Order not found' });

    const updates = { updated_at: new Date().toISOString() };
    if (status !== undefined) updates.status = status;
    if (po_number !== undefined) updates.po_number = po_number;
    if (vendor_order_ref !== undefined) updates.vendor_order_ref = vendor_order_ref;
    if (tracking_number !== undefined) updates.tracking_number = tracking_number;
    if (tracking_carrier !== undefined) updates.tracking_carrier = tracking_carrier;
    if (notes !== undefined) updates.notes = notes;

    // Stamp the moment a leg reaches a milestone, once.
    const now = new Date().toISOString();
    if (status === 'ordered') updates.ordered_at = updates.ordered_at || now;
    if (status === 'shipped') updates.shipped_at = now;
    if (status === 'delivered') updates.delivered_at = now;

    const { data: leg, error: updErr } = await supabase
      .from('order_fulfillments')
      .update(updates)
      .eq('order_id', id).eq('vendor_id', vendorId)
      .select().single();

    if (updErr || !leg) {
      return res.status(404).json({ error: 'No fulfillment for that vendor on this order' });
    }

    const { data: allLegs } = await supabase
      .from('order_fulfillments').select('*').eq('order_id', id);

    // Keep the order-level status honest, and keep the legacy single tracking
    // columns populated when there is exactly one vendor, so nothing that still
    // reads orders.tracking_number regresses.
    const rolled = rollUpStatus(allLegs || [], order.status);
    const orderUpdates = { status: rolled, updated_at: now };
    const live = (allLegs || []).filter(f => f.status !== 'cancelled');
    if (live.length === 1) {
      orderUpdates.tracking_number = live[0].tracking_number || null;
      orderUpdates.tracking_carrier = live[0].tracking_carrier || null;
    }
    if (rolled === 'shipped' && !order.shipped_at) orderUpdates.shipped_at = now;
    await supabase.from('orders').update(orderUpdates).eq('id', id);

    const vendorItems = (vendorsOnOrder(order).get(vendorId) || []);
    await logOrderEvent(
      supabase, id, 'fulfillment',
      `${vendorId}: ${status || 'updated'}` +
        (tracking_number ? ` — ${tracking_carrier || ''} ${tracking_number}`.trim() : '') +
        (vendor_order_ref ? ` (their ref ${vendor_order_ref})` : ''),
      req.adminUser?.email
    );

    // Tell the customer where their goods are.
    //
    // Tracking is NOT required. Vendors routinely ship a sample chip in an
    // envelope with no number at all — the old rule silently sent nothing in
    // exactly that case, which is the case samples are always in. 'ordered'
    // notifies too, so "we've placed it with our supplier" is sayable.
    let emailSent = false;
    const NOTIFIABLE = ['ordered', 'shipped', 'delivered'];
    if (notify_customer && order.customer_email && NOTIFIABLE.includes(status)) {
      try {
        const listed = vendorItems.map(i => `<li>${i.quantity || 1} × ${i.name}</li>`).join('');
        const total = (Array.isArray(order.items) ? order.items : []).length;
        const partial = vendorItems.length < total;
        const ref = order.order_number || id;
        const some = partial ? `${vendorItems.length} of the ${total} items on your order` : 'Your order';
        const copy = {
          ordered: {
            subject: `We're processing your order — ${ref}`,
            heading: partial ? 'Part of your order is being processed' : 'Your order is being processed',
            body: `${some} <strong>${ref}</strong> ${partial ? 'have' : 'has'} been placed with our supplier and ${partial ? 'are' : 'is'} being prepared for shipment.`
          },
          shipped: {
            subject: `${partial ? 'Part of your order has' : 'Your order has'} shipped — ${ref}`,
            heading: partial ? 'Part of your order is on its way' : 'Your order is on its way',
            body: `${some} <strong>${ref}</strong> ${partial ? 'have' : 'has'} shipped.`
                  + (partial ? " The rest ships separately and you'll hear from us as it goes out." : '')
          },
          delivered: {
            subject: `${partial ? 'Part of your order was' : 'Your order was'} delivered — ${ref}`,
            heading: 'Delivered',
            body: `${some} <strong>${ref}</strong> should now have arrived.`
          }
        }[status];

        // Say plainly that there is no number, rather than dropping the line and
        // leaving the customer wondering whether we forgot it.
        const trackingBlock = tracking_number
          ? `<p><strong>${tracking_carrier || 'Carrier'}:</strong> ${tracking_number}</p>`
          : (status === 'shipped'
              ? `<p style="color:#555;">Our supplier shipped this without a tracking number — common for samples and small parcels. It usually arrives within a few business days.</p>`
              : '');

        await emailService.sendNotification(
          order.customer_email,
          copy.subject,
          emailService.wrapEmailTemplate(`
            <h2 style="color:#1a1a2e;">${copy.heading}</h2>
            <p>Hi ${order.customer_name || 'there'},</p>
            <p>${copy.body}</p>
            <ul>${listed}</ul>
            ${trackingBlock}
            <p>Questions? Reply to this email or call (602) 833-3189.</p>
            <p>— Surprise Granite</p>
          `)
        );
        emailSent = true;
        await logOrderEvent(supabase, id, 'email_sent', `${status} notice for ${vendorId}`, req.adminUser?.email);
      } catch (e) {
        logger.warn('Per-vendor customer notice failed:', e.message);
      }
    }

    res.json({ fulfillment: leg, order_status: rolled, email_sent: emailSent });
  } catch (err) {
    logger.error('Error updating fulfillment:', err.message);
    res.status(500).json({ error: 'Failed to update fulfillment' });
  }
});

/**
 * POST /api/admin/orders/:id/fulfillments/:vendorId/send-po
 *
 * Build the PO for ONE vendor's lines and email it to the address on file, so
 * the goods start moving without anyone retyping it.
 *
 * ⚠️ Deliberately NOT automatic on payment. A PO is money leaving the business
 * and a promise to a supplier, and it cannot be unsent. On 2026-08-27 a
 * Whitehaus sink sold for $105.30 against a $1,550 MSRP because of a bad
 * scraped price; auto-sending would have put a PO in Alfi's inbox before anyone
 * noticed. One human click is the whole safeguard. If a vendor is ever trusted
 * enough to skip it, gate that per vendor in vendor_config — never globally.
 */
router.post('/:id/fulfillments/:vendorId/send-po', adminAccess, async (req, res) => {
  try {
    const supabase = req.app.get('supabase');
    const { id, vendorId } = req.params;
    const { note, resend = false, cc } = req.body || {};

    const { data: order } = await supabase.from('orders').select('*').eq('id', id).single();
    if (!order) return res.status(404).json({ error: 'Order not found' });

    // Never buy stock against money we have given back or never took.
    if (['refunded', 'cancelled'].includes(order.status)) {
      return res.status(400).json({ error: `Order is ${order.status} — not sending a PO` });
    }
    if (order.payment_status && !['paid', 'partially_refunded'].includes(order.payment_status)) {
      return res.status(400).json({ error: `Order is not paid (${order.payment_status}) — not sending a PO` });
    }

    const items = vendorsOnOrder(order).get(vendorId) || [];
    if (!items.length) {
      return res.status(400).json({ error: 'No items for that vendor on this order' });
    }

    const { data: vendor } = await supabase
      .from('vendor_config').select('vendor_id, vendor_name, dropship_email')
      .eq('vendor_id', vendorId).maybeSingle();

    if (!vendor?.dropship_email) {
      return res.status(400).json({
        error: `No order email on file for "${vendorId}". Add vendor_config.dropship_email first.`
      });
    }

    const { data: leg } = await supabase
      .from('order_fulfillments').select('*')
      .eq('order_id', id).eq('vendor_id', vendorId).maybeSingle();

    // Sending twice makes a vendor ship twice. Make the second send deliberate.
    if (leg?.po_number && !resend) {
      return res.status(409).json({
        error: `PO ${leg.po_number} was already sent to ${vendor.dropship_email}. Pass resend:true to send it again.`,
        po_number: leg.po_number
      });
    }

    const poNumber = leg?.po_number
      || 'PO-' + String(order.order_number || id).replace(/[^A-Za-z0-9-]/g, '').toUpperCase()
         + '-' + vendorId.toUpperCase().replace(/[^A-Z0-9]/g, '');

    const { subject, html } = emailService.generateVendorPOEmail(order, {
      vendorName: vendor.vendor_name || vendorId,
      items, poNumber, note
    });

    const result = await emailService.sendNotification(vendor.dropship_email, subject, html);
    if (!result.success) {
      return res.status(502).json({ error: 'Could not send the PO: ' + (result.reason || 'mail failed') });
    }

    const now = new Date().toISOString();
    await supabase.from('order_fulfillments').update({
      po_number: poNumber,
      status: leg?.status === 'pending' || !leg?.status ? 'ordered' : leg.status,
      ordered_at: leg?.ordered_at || now,
      updated_at: now
    }).eq('order_id', id).eq('vendor_id', vendorId);

    const { data: allLegs } = await supabase
      .from('order_fulfillments').select('*').eq('order_id', id);
    await supabase.from('orders')
      .update({ status: rollUpStatus(allLegs || [], order.status), updated_at: now })
      .eq('id', id);

    await logOrderEvent(
      supabase, id, 'po_sent',
      `${poNumber} emailed to ${vendor.vendor_name || vendorId} <${vendor.dropship_email}> — ${items.length} line(s)`,
      req.adminUser?.email
    );

    res.json({ sent: true, po_number: poNumber, to: vendor.dropship_email, items: items.length });
  } catch (err) {
    logger.error('Error sending vendor PO:', err.message);
    res.status(500).json({ error: 'Failed to send PO' });
  }
});

/**
 * POST /api/admin/orders/:id/message - Send a message to customer
 */
router.post('/:id/message', adminAccess, async (req, res) => {
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
router.put('/:id/notes', adminAccess, async (req, res) => {
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
router.post('/:id/close', adminAccess, async (req, res) => {
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
 * PATCH /api/admin/orders/:id/requires-shipment — flip the shipment flag.
 * Used by the "Dismiss" button on the queue to remove an order that doesn't
 * actually need to ship (e.g. mislabeled invoice payment), or by the
 * "Restore" action to put one back into the queue if the classifier was wrong.
 * Body: { requires_shipment: boolean }
 */
router.patch('/:id/requires-shipment', adminAccess, async (req, res) => {
  try {
    const supabase = req.app.get('supabase');
    const { id } = req.params;
    const next = req.body?.requires_shipment;
    if (typeof next !== 'boolean') {
      return res.status(400).json({ error: 'requires_shipment must be a boolean' });
    }
    const updates = { requires_shipment: next, updated_at: new Date().toISOString() };
    // Dismissing also marks the order completed so it falls out of any
    // status-based queue. Restoring puts status back to confirmed only if
    // it was 'paid' (the state set by the webhook for non-shippable).
    if (next === false) updates.status = 'completed';
    const { data, error } = await supabase
      .from('orders')
      .update(updates)
      .eq('id', id)
      .select()
      .single();
    if (error) return res.status(500).json({ error: 'Failed to update order' });
    await logOrderEvent(
      supabase, id, 'requires_shipment_change',
      next ? 'Restored to shipment queue' : 'Dismissed from shipment queue',
      req.adminUser?.email
    );
    res.json({ order: data });
  } catch (err) {
    logger.error('Error toggling requires_shipment:', err.message);
    res.status(500).json({ error: 'Failed to update order' });
  }
});

/**
 * POST /api/admin/orders/:id/refund — Issue a Stripe refund against an order
 * Body: { amount?: number (dollars, omit for full), reason?: string, notify_customer?: boolean }
 */
router.post('/:id/refund', adminAccess, async (req, res) => {
  try {
    const supabase = req.app.get('supabase');
    const stripeService = require('../services/stripeService');
    const stripe = stripeService.getStripeInstance();
    const { id } = req.params;
    const { amount, reason, notify_customer } = req.body || {};

    if (!stripe) {
      return res.status(500).json({ error: 'Stripe not configured' });
    }

    const { data: order, error: fetchErr } = await supabase
      .from('orders')
      .select('*')
      .eq('id', id)
      .single();
    if (fetchErr || !order) {
      return res.status(404).json({ error: 'Order not found' });
    }
    if (!order.stripe_payment_intent_id) {
      return res.status(400).json({ error: 'Order has no Stripe payment to refund' });
    }
    if (order.status === 'refunded') {
      return res.status(400).json({ error: 'Order is already fully refunded' });
    }

    // Convert dollars → cents; omit for full refund.
    const refundParams = { payment_intent: order.stripe_payment_intent_id };
    if (amount != null) {
      const cents = Math.round(Number(amount) * 100);
      if (!Number.isFinite(cents) || cents <= 0) {
        return res.status(400).json({ error: 'Invalid refund amount' });
      }
      refundParams.amount = cents;
    }
    // Stripe accepts: duplicate, fraudulent, requested_by_customer
    if (reason && ['duplicate', 'fraudulent', 'requested_by_customer'].includes(reason)) {
      refundParams.reason = reason;
    }

    let refund;
    try {
      refund = await stripe.refunds.create(refundParams);
    } catch (stripeErr) {
      logger.error('Stripe refund failed:', stripeErr.message);
      return res.status(502).json({ error: 'Stripe refund failed: ' + stripeErr.message });
    }

    const refundedAmount = (refund.amount || 0) / 100;
    const totalPaid = Number(order.total || 0);
    const isFullRefund = refundedAmount >= totalPaid - 0.005;

    const existingRefunds = Array.isArray(order.metadata?.refunds) ? order.metadata.refunds : [];
    const nextStatus = isFullRefund ? 'refunded' : (order.status || 'confirmed');
    const nextPaymentStatus = isFullRefund ? 'refunded' : 'partially_refunded';

    const { error: updErr } = await supabase
      .from('orders')
      .update({
        status: nextStatus,
        payment_status: nextPaymentStatus,
        metadata: {
          ...(order.metadata || {}),
          refunds: [
            ...existingRefunds,
            {
              refund_id: refund.id,
              amount: refundedAmount,
              reason: reason || null,
              created_at: new Date().toISOString(),
              by: req.adminUser?.email || null
            }
          ]
        },
        updated_at: new Date().toISOString()
      })
      .eq('id', id);

    if (updErr) {
      logger.error('Order refund recorded in Stripe but DB update failed:', updErr.message);
    }

    await logOrderEvent(
      supabase,
      id,
      'refund',
      `Refunded $${refundedAmount.toFixed(2)}${reason ? ' (' + reason + ')' : ''}`,
      req.adminUser?.email
    );

    // On full refund, restock the items so inventory reflects reality.
    if (isFullRefund) {
      try {
        const { restockForOrder } = require('./inventory');
        const items = Array.isArray(order.items) ? order.items : [];
        await restockForOrder(supabase, { order, items, reason: 'refund' });
      } catch (restockErr) {
        logger.warn('Refund restock failed:', restockErr.message);
      }
    }

    // Optional customer notification
    let emailSent = false;
    if (notify_customer && order.customer_email) {
      try {
        await emailService.sendNotification(
          order.customer_email,
          `Refund Issued — ${order.order_number || id}`,
          emailService.wrapEmailTemplate(`
            <h2 style="color:#1a1a2e;">Refund Issued</h2>
            <p>Hi ${order.customer_name || 'there'},</p>
            <p>We've issued a refund of <strong>$${refundedAmount.toFixed(2)}</strong>
            for order <strong>${order.order_number || id}</strong>. It should appear on
            your original payment method within 5–10 business days.</p>
            ${reason ? `<p>Reason: ${reason}</p>` : ''}
            <p>Questions? Reply to this email or call (602) 833-3189.</p>
            <p>— Surprise Granite</p>
          `)
        );
        emailSent = true;
      } catch (emailErr) {
        logger.warn('Refund email failed:', emailErr.message);
      }
    }

    res.json({
      success: true,
      refund_id: refund.id,
      amount: refundedAmount,
      full_refund: isFullRefund,
      email_sent: emailSent
    });
  } catch (err) {
    logger.error('Error issuing refund:', err.message);
    res.status(500).json({ error: 'Failed to issue refund' });
  }
});

/**
 * POST /api/admin/orders/bulk-close - Close multiple orders at once
 */
router.post('/bulk-close', adminAccess, async (req, res) => {
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
router.post('/test-email', adminAccess, async (req, res) => {
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
router.post('/bootstrap', adminAccess, async (req, res) => {
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
