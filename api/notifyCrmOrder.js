/**
 * Tell the CRM about an order.
 *
 * Until now the store only emailed Josh when someone bought something. Lee Ann
 * McMurry paid $42.88 for two Dekton Kedar samples on 2026-07-30, the
 * notification landed in a Gmail inbox, and nobody ordered her samples from
 * Cosentino — because the CRM never heard about the sale and had nothing to
 * raise a purchase order against.
 *
 * Both Stripe handlers call this. They fire for the SAME charge, so the CRM
 * keys on the payment intent and merges the two; sending both is correct and
 * is what fills in the line items the session event does not carry.
 *
 * Never throws and never blocks the response. A CRM that is down must not stop
 * a customer's receipt going out or make Stripe retry a webhook it already
 * handled — the order-email fallback in the CRM picks up anything missed.
 */

const CRM_URL = process.env.CRM_ORDER_WEBHOOK_URL
  || 'https://www.voicenowcrm.com/api/surprise-granite/webhook/new-order';
const CRM_SECRET = process.env.CRM_ORDER_WEBHOOK_SECRET || '';

async function notifyCrmOrder(payload, logger = console) {
  try {
    if (process.env.CRM_ORDER_WEBHOOK_DISABLED === 'true') return { skipped: true };

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    let res;
    try {
      res = await fetch(CRM_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(CRM_SECRET ? { 'x-sg-webhook-secret': CRM_SECRET } : {}),
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timer);
    }

    const body = await res.json().catch(() => ({}));
    if (!res.ok || body.success === false) {
      logger.warn?.(`[CRM] order ${payload.orderId} not accepted (${res.status}): ${body.error || 'unknown'}`);
      return { ok: false, status: res.status, error: body.error };
    }
    logger.info?.(`[CRM] order ${payload.orderId} -> ${body.orderNumber || '?'} (${body.action})${body.purchaseOrders?.length ? ` POs: ${body.purchaseOrders.map((p) => p.poNumber).join(',')}` : ''}`);
    return { ok: true, ...body };
  } catch (err) {
    // AbortError included. The CRM reads the notification email as a fallback.
    logger.warn?.(`[CRM] order notify failed: ${err.message}`);
    return { ok: false, error: err.message };
  }
}

/** Stripe line items -> the shape the CRM expects. Amounts stay in cents. */
function lineItemsForCrm(items = []) {
  return (items || []).map((li) => ({
    name: li.description || li.price?.product?.name || li.name || 'Item',
    quantity: li.quantity || 1,
    unit_amount: li.price?.unit_amount ?? li.amount_subtotal ?? undefined,
    amount_total: li.amount_total ?? undefined,
    brand: li.price?.product?.metadata?.brand || li.price?.product?.metadata?.vendor || undefined,
    sku: li.price?.product?.metadata?.sku || undefined,
  }));
}

module.exports = { notifyCrmOrder, lineItemsForCrm };
