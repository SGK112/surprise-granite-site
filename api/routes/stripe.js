/**
 * Stripe Routes
 * Handles all Stripe-related operations: checkout, subscriptions, payments, connect, wallet
 */

const express = require('express');
const router = express.Router();
const Stripe = require('stripe');
const logger = require('../utils/logger');
const { handleApiError } = require('../utils/security');

// Initialize Stripe
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

// Pro subscription plans configuration
const PRO_PLANS = {
  pro: {
    name: 'Pro',
    monthly_price: 2900,
    yearly_price: 29000,
    features: ['View material pricing', 'Generate quotes & takeoffs', 'Save unlimited designs', 'Priority support']
  },
  fabricator: {
    name: 'Fabricator',
    monthly_price: 7900,
    yearly_price: 79000,
    features: ['All Pro features', 'Wholesale pricing access', 'Customer management', 'Custom branding', 'API access']
  },
  business: {
    name: 'Business',
    monthly_price: 14900,
    yearly_price: 149000,
    features: ['All Fabricator features', 'Multi-user accounts', 'Advanced analytics', 'Dedicated account manager']
  }
};

// Helper to verify admin access
async function verifyAdminAccess(userId, supabase) {
  if (!userId || !supabase) return false;

  try {
    const { data: user } = await supabase
      .from('sg_users')
      .select('account_type, email')
      .eq('id', userId)
      .single();

    const adminEmails = ['joshb@surprisegranite.com', 'josh.b@surprisegranite.com'];
    return user?.account_type === 'admin' || adminEmails.includes(user?.email);
  } catch {
    return false;
  }
}

// ============ QUICK PAY (Public) ============

/**
 * Quick Pay - Create a Stripe Checkout Session for ad-hoc customer payments
 * Used by the public /pay/ page for texted/emailed payment links
 * POST /api/stripe/quick-pay
 */
// Stripe US standard pricing for card-present online: 2.9% + $0.30.
// Exposed as constants so fee math lives in one place.
const STRIPE_FEE_RATE = 0.029;
const STRIPE_FEE_FIXED_CENTS = 30;

// Gross up so the merchant nets `amount_cents` after Stripe takes their cut.
// Returns { total_cents, fee_cents }. Uses ceil so rounding never underpays.
function grossUpForFee(amount_cents) {
  const total = Math.ceil((amount_cents + STRIPE_FEE_FIXED_CENTS) / (1 - STRIPE_FEE_RATE));
  return { total_cents: total, fee_cents: total - amount_cents };
}

router.post('/quick-pay', async (req, res) => {
  try {
    const { amount, email, invoice_ref, memo, pass_fee, lead_id, acceptance_id, source_kind, method } = req.body;

    // Validate amount (must be at least $1 = 100 cents)
    if (!amount || amount < 100) {
      return res.status(400).json({ error: 'Amount must be at least $1.00 (100 cents)' });
    }

    if (amount > 99999999) {
      return res.status(400).json({ error: 'Amount exceeds maximum allowed' });
    }

    if (!email) {
      return res.status(400).json({ error: 'Email is required' });
    }

    const baseUrl = process.env.SITE_URL || 'https://www.surprisegranite.com';

    // Build success/cancel URLs
    const successParams = new URLSearchParams();
    successParams.set('amount', amount.toString());
    if (invoice_ref) successParams.set('ref', invoice_ref);

    const cancelParams = new URLSearchParams();
    cancelParams.set('amount', amount.toString());
    if (invoice_ref) cancelParams.set('invoice', invoice_ref);
    if (memo) cancelParams.set('memo', memo);
    if (email) cancelParams.set('email', email);
    if (pass_fee) cancelParams.set('fee', '1');
    if (lead_id) cancelParams.set('lead_id', lead_id);

    // Pass the processing fee to the customer by GROSSING UP the single line
    // amount so Surprise Granite nets `amount` — ONE clean total, the fee
    // disclosed in the line name (no confusing second "Processing fee" line).
    // The fee depends on HOW they pay, and a Stripe session has one fixed total,
    // so the customer picks the method on the /pay page BEFORE checkout:
    //   • card → 2.9% + 30¢ gross-up
    //   • bank (ACH) → 0.8% capped at $5 — far cheaper on big deposits
    // Default ON; send pass_fee:false to charge the base only.
    const CARD_PCT = 0.029, CARD_FIXED_CENTS = 30;
    const ACH_PCT = 0.008, ACH_CAP_CENTS = 500;
    const baseCents = Math.round(Number(amount));
    const passFee = !(pass_fee === false || pass_fee === 0 || pass_fee === '0' || pass_fee === 'false');
    const isBank = method === 'bank' || method === 'ach' || method === 'us_bank_account';

    let fee_cents = 0;
    if (passFee) {
      fee_cents = isBank
        ? Math.min(Math.round(baseCents / (1 - ACH_PCT)) - baseCents, ACH_CAP_CENTS)
        : Math.round((baseCents + CARD_FIXED_CENTS) / (1 - CARD_PCT)) - baseCents;
    }
    const chargeCents = baseCents + fee_cents;
    const paymentMethodTypes = isBank ? ['us_bank_account'] : ['card'];
    const feeLabel = isBank ? 'bank transfer fee' : 'card processing fee';

    const line_items = [{
      price_data: {
        currency: 'usd',
        product_data: { name: (memo || 'Payment to Surprise Granite') + (passFee ? ` (incl. ${feeLabel})` : '') },
        unit_amount: chargeCents,
      },
      quantity: 1,
    }];

    const session = await stripe.checkout.sessions.create({
      payment_method_types: paymentMethodTypes,
      line_items,
      mode: 'payment',
      customer_email: email,
      success_url: `${baseUrl}/pay/success/?${successParams.toString()}`,
      cancel_url: `${baseUrl}/pay/?${cancelParams.toString()}`,
      metadata: {
        // payment_type drives the requires_shipment classifier. Quick-pay
        // covers deposits, balances, paid invoices, proposal deposits — none
        // of which ship a physical product.
        payment_type: ['deposit','balance','final','invoice'].includes(source_kind) ? source_kind : 'quick-pay',
        invoice_ref: invoice_ref || '',
        memo: memo || '',
        source: source_kind || 'quick-pay',
        customer_email: email,
        // lead_id lets the webhook link the completed payment back to the
        // originating lead row — without it there's no way to reconcile.
        lead_id: lead_id || '',
        // acceptance_id ties this checkout to a proposal_acceptances row so
        // the webhook can mark it paid. Set when source_kind === 'proposal_deposit'.
        acceptance_id: acceptance_id || '',
        pass_fee: passFee ? '1' : '0',
        fee_cents: String(fee_cents),
        net_cents: String(baseCents),
        method: isBank ? 'ach' : 'card'
      }
    });

    res.json({ success: true, url: session.url });
  } catch (error) {
    logger.error('Quick-pay checkout error:', error);
    return handleApiError(res, error, 'Quick pay');
  }
});

// ============ CHECKOUT SESSION ============

/**
 * Create a Stripe Checkout Session for cart purchases
 * POST /api/stripe/checkout
 */
router.post('/checkout', async (req, res) => {
  try {
    const supabase = req.app.get('supabase');
    const { items, success_url, cancel_url, customer_email, shipping_state, promo_code } = req.body;

    if (!items || items.length === 0) {
      return res.status(400).json({ error: 'No items provided' });
    }

    // Import price validator
    const { validateCartPrices, buildStripeLineItems } = require('../validators/price-validator');

    // SERVER-SIDE PRICE VALIDATION
    const validation = await validateCartPrices(items, supabase, shipping_state);

    if (!validation.valid) {
      logger.warn('Cart validation failed', { errors: validation.errors });
      // #2a: items rejected for having NO server price are either tampering or
      // a real product missing from the catalog. Alert staff so a genuinely
      // missing product can be added and the sale recovered. Best-effort —
      // must never block the 400 response.
      if (validation.unmatchedItems?.length) {
        try {
          const emailService = require('../services/emailService');
          const rows = validation.unmatchedItems.map(u =>
            `<li><strong>${u.name}</strong> — id: ${u.id || '—'}, sku: ${u.sku || '—'}, client price: $${(((u.clientPrice) || 0) / 100).toFixed(2)}</li>`
          ).join('');
          emailService.sendAdminNotification(
            '⚠️ Checkout blocked — unverifiable item price',
            `<p>A checkout was rejected because these items had no matching server price (possible price tampering, or a product missing from the catalog):</p>
             <ul>${rows}</ul>
             <p>Customer email: ${customer_email || 'n/a'}. If a product is genuinely missing, add it to the catalog so it can be purchased.</p>`
          ).catch(err => logger.warn('Unmatched-item admin alert failed', { error: err.message }));
        } catch (e) {
          logger.warn('Unmatched-item admin alert threw', { error: e.message });
        }
      }
      return res.status(400).json({
        error: 'Invalid cart items',
        details: validation.errors
      });
    }

    if (validation.warnings.length > 0) {
      logger.info('Cart validation warnings', { warnings: validation.warnings });
    }

    // INVENTORY AVAILABILITY CHECK — reject if any tracked SKU would
    // oversell. Items without an inventory row are untracked and pass.
    try {
      const { checkAvailability } = require('./inventory');
      const avail = await checkAvailability(supabase, items);
      if (!avail.ok) {
        return res.status(409).json({
          error: 'Insufficient stock',
          issues: avail.issues
        });
      }
    } catch (invErr) {
      logger.warn('Inventory check skipped:', invErr.message);
    }

    // SERVER-SIDE PROMO VALIDATION — never trust the client's discount.
    let promoResult = null;
    if (promo_code) {
      const { validatePromoCode } = require('./promotions');
      // validatePromoCode works in DOLLARS (its `fixed` path treats
      // promo.value as dollars, and the public /validate endpoint is fed
      // client dollars). calculatedTotals are in CENTS — convert, or a
      // `percent` promo returns a cents-scaled discount that the
      // dollars-based ratio math below clamps to 100% off (free cart).
      promoResult = await validatePromoCode({
        supabase,
        code: promo_code,
        subtotal: validation.calculatedTotals.subtotal / 100,
        shippingAmount: validation.calculatedTotals.shipping / 100,
        customerEmail: customer_email
      });
      if (!promoResult.valid) {
        return res.status(400).json({ error: 'Invalid promo code', reason: promoResult.reason });
      }
    }

    const lineItems = buildStripeLineItems(validation);

    // Apply promo as a negative line item after the price validator's
    // build so it can't push the total negative. Stripe's coupon/discount
    // API would be cleaner but requires pre-created coupon objects per
    // session. Negative line items aren't supported by Stripe Checkout, so
    // if we have a discount we subtract it from the product unit amounts
    // proportionally, or drop shipping to zero for free_shipping promos.
    if (promoResult?.valid) {
      if (promoResult.free_shipping) {
        // Remove any shipping line items we added.
        for (let i = lineItems.length - 1; i >= 0; i--) {
          const name = lineItems[i]?.price_data?.product_data?.name || '';
          if (/^Shipping/i.test(name)) lineItems.splice(i, 1);
        }
      } else if (promoResult.discount_amount > 0) {
        // Proportional discount across product line items only (skip tax
        // and shipping lines the validator injected).
        const productLines = lineItems.filter(li => {
          const n = li?.price_data?.product_data?.name || '';
          return !/^Tax\s*\(/i.test(n) && !/^Shipping/i.test(n);
        });
        const productSubtotal = productLines.reduce(
          (sum, li) => sum + (li.price_data.unit_amount / 100) * li.quantity, 0
        );
        if (productSubtotal > 0) {
          const ratio = Math.min(1, promoResult.discount_amount / productSubtotal);
          for (const li of productLines) {
            const unitDollars = li.price_data.unit_amount / 100;
            const discounted = Math.max(0, unitDollars * (1 - ratio));
            li.price_data.unit_amount = Math.round(discounted * 100);
          }

          // Recompute tax on the DISCOUNTED product subtotal. The validator's
          // tax line was built on the pre-discount subtotal, so leaving it
          // overcharges the customer for tax on money they didn't pay.
          const taxIdx = lineItems.findIndex(li => /^Tax\s*\(/i.test(li?.price_data?.product_data?.name || ''));
          if (taxIdx !== -1) {
            const newSubtotalCents = productLines.reduce(
              (sum, li) => sum + li.price_data.unit_amount * li.quantity, 0
            );
            const taxRate = validation.calculatedTotals.taxRate || 0;
            const newTaxCents = Math.round(newSubtotalCents * taxRate);
            if (newTaxCents > 0) {
              lineItems[taxIdx].price_data.unit_amount = newTaxCents;
            } else {
              // 100%-off (or no taxable amount left) — drop the now-$0 tax line
              // so Stripe doesn't reject a zero-amount line item.
              lineItems.splice(taxIdx, 1);
            }
          }
        }
      }
    }

    const sessionConfig = {
      payment_method_types: ['card'],
      line_items: lineItems,
      mode: 'payment',
      success_url: success_url || `${process.env.SITE_URL || 'https://surprisegranite.com'}/checkout/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: cancel_url || `${process.env.SITE_URL || 'https://surprisegranite.com'}/cart/`,
      billing_address_collection: 'required',
      shipping_address_collection: {
        allowed_countries: ['US']
      },
      phone_number_collection: { enabled: true },
      metadata: {
        // payment_type drives the requires_shipment classifier in the webhook.
        // 'product' = real cart, will ship physically.
        payment_type: 'product',
        order_source: 'website_cart',
        validated_total: validation.calculatedTotals.total,
        price_adjustments: validation.warnings.length > 0 ? 'yes' : 'no',
        ...(promoResult?.valid ? {
          promo_id: promoResult.promotion.id,
          promo_code: promoResult.promotion.code,
          promo_discount: String(promoResult.discount_amount)
        } : {})
      }
    };

    if (customer_email) {
      sessionConfig.customer_email = customer_email;
    }

    const session = await stripe.checkout.sessions.create(sessionConfig);

    logger.info('Checkout session created', {
      sessionId: session.id,
      total: validation.calculatedTotals.total,
      itemCount: validation.validatedItems.length
    });

    res.json({
      sessionId: session.id,
      url: session.url,
      totals: {
        subtotal: validation.calculatedTotals.subtotal,
        shipping: validation.calculatedTotals.shipping,
        tax: validation.calculatedTotals.tax,
        total: validation.calculatedTotals.total
      }
    });

  } catch (error) {
    logger.error('Checkout session error:', error);
    return handleApiError(res, error, 'Checkout');
  }
});

// ============ ORDER RETRIEVAL ============

/**
 * Get order details by session ID, payment intent, or order number
 * GET /api/stripe/orders/:identifier
 */
router.get('/orders/:identifier', async (req, res) => {
  try {
    const supabase = req.app.get('supabase');
    const { identifier } = req.params;

    if (!identifier) {
      return res.status(400).json({ error: 'Order identifier required' });
    }

    if (!supabase) {
      return res.status(500).json({ error: 'Database not configured' });
    }

    const { data: order, error } = await supabase
      .from('orders')
      .select('*')
      .or(`stripe_session_id.eq.${identifier},stripe_payment_intent_id.eq.${identifier},order_number.eq.${identifier}`)
      .single();

    if (error || !order) {
      if (identifier.startsWith('cs_')) {
        try {
          const session = await stripe.checkout.sessions.retrieve(identifier, {
            expand: ['line_items']
          });

          return res.json({
            order: {
              order_number: `SG-${session.id.slice(-8).toUpperCase()}`,
              status: 'confirmed',
              customer_email: session.customer_details?.email,
              customer_name: session.customer_details?.name,
              total: session.amount_total / 100,
              payment_status: session.payment_status,
              items: session.line_items?.data?.map(item => ({
                name: item.description,
                quantity: item.quantity,
                total: item.amount_total / 100
              })) || [],
              created_at: new Date(session.created * 1000).toISOString(),
              source: 'stripe'
            }
          });
        } catch (stripeErr) {
          logger.error('Error fetching from Stripe:', stripeErr.message);
        }
      }

      return res.status(404).json({ error: 'Order not found' });
    }

    res.json({
      order: {
        order_number: order.order_number,
        status: order.status,
        customer_email: order.customer_email,
        customer_name: order.customer_name,
        total: order.total,
        subtotal: order.subtotal,
        shipping: order.shipping,
        tax: order.tax,
        items: order.items,
        shipping_address: order.shipping_address,
        created_at: order.created_at,
        source: 'database'
      }
    });

  } catch (error) {
    logger.error('Order retrieval error:', error);
    return handleApiError(res, error, 'Order retrieval');
  }
});

// ============ PRO SUBSCRIPTION ============

/**
 * Get available Pro subscription plans
 * GET /api/stripe/pro-plans
 */
router.get('/pro-plans', (req, res) => {
  const plans = Object.entries(PRO_PLANS).map(([key, plan]) => ({
    id: key,
    name: plan.name,
    monthly_price: plan.monthly_price,
    yearly_price: plan.yearly_price,
    monthly_display: `$${(plan.monthly_price / 100).toFixed(0)}/mo`,
    yearly_display: `$${(plan.yearly_price / 100).toFixed(0)}/yr`,
    features: plan.features
  }));

  res.json({ plans });
});

/**
 * Create a Pro subscription checkout session
 * POST /api/stripe/pro-subscription
 */
router.post('/pro-subscription', async (req, res) => {
  try {
    const { user_id, user_email, plan = 'pro', billing_cycle = 'monthly', success_url, cancel_url } = req.body;

    if (!user_id || !user_email) {
      return res.status(400).json({ error: 'User ID and email are required' });
    }

    const planConfig = PRO_PLANS[plan.toLowerCase()];
    if (!planConfig) {
      return res.status(400).json({ error: 'Invalid plan. Choose: pro, fabricator, or business' });
    }

    const interval = billing_cycle === 'yearly' ? 'year' : 'month';
    const amount = billing_cycle === 'yearly' ? planConfig.yearly_price : planConfig.monthly_price;

    // Find or create the product
    let product;
    const existingProducts = await stripe.products.list({ limit: 100 });
    product = existingProducts.data.find(p => p.metadata?.plan_type === plan.toLowerCase() && p.metadata?.source === 'pro_subscription');

    if (!product) {
      product = await stripe.products.create({
        name: `Surprise Granite ${planConfig.name} Plan`,
        description: planConfig.features.join(' • '),
        metadata: {
          plan_type: plan.toLowerCase(),
          source: 'pro_subscription'
        }
      });
      logger.info('Created new Stripe product for', plan, ':', product.id);
    }

    const price = await stripe.prices.create({
      product: product.id,
      unit_amount: amount,
      currency: 'usd',
      recurring: { interval },
      metadata: {
        plan: plan.toLowerCase(),
        billing_cycle
      }
    });

    // Find or create customer
    let customerId;
    const existingCustomers = await stripe.customers.list({ email: user_email, limit: 1 });

    if (existingCustomers.data.length > 0) {
      customerId = existingCustomers.data[0].id;
      await stripe.customers.update(customerId, {
        metadata: { user_id }
      });
    } else {
      const customer = await stripe.customers.create({
        email: user_email,
        metadata: { user_id, source: 'pro_subscription' }
      });
      customerId = customer.id;
    }

    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      payment_method_types: ['card'],
      line_items: [{ price: price.id, quantity: 1 }],
      mode: 'subscription',
      success_url: success_url || `https://www.surprisegranite.com/tools/room-designer/?subscription=success&plan=${plan}`,
      cancel_url: cancel_url || `https://www.surprisegranite.com/tools/room-designer/?subscription=canceled`,
      metadata: {
        payment_type: 'subscription',
        user_id,
        plan: plan.toLowerCase(),
        billing_cycle,
        source: 'pro_subscription'
      },
      subscription_data: {
        metadata: {
          user_id,
          plan: plan.toLowerCase(),
          account_type: plan.toLowerCase()
        }
      },
      allow_promotion_codes: true
    });

    logger.info('Pro subscription session created:', session.id, 'Plan:', plan, 'User:', user_id);

    res.json({
      success: true,
      sessionId: session.id,
      url: session.url,
      plan,
      amount,
      interval
    });

  } catch (error) {
    logger.error('Pro subscription error:', error);
    return handleApiError(res, error, 'Pro subscription');
  }
});

/**
 * Create a billing portal session for subscription management
 * POST /api/stripe/billing-portal
 */
router.post('/billing-portal', async (req, res) => {
  try {
    const supabase = req.app.get('supabase');
    const { user_id, return_url } = req.body;

    if (!user_id) {
      return res.status(400).json({ error: 'User ID is required' });
    }

    if (!supabase) {
      return res.status(500).json({ error: 'Database not configured' });
    }

    const { data: user, error: userError } = await supabase
      .from('sg_users')
      .select('stripe_customer_id, email')
      .eq('id', user_id)
      .single();

    if (userError || !user) {
      return res.status(404).json({ error: 'User not found' });
    }

    if (!user.stripe_customer_id) {
      return res.status(400).json({ error: 'No active subscription found. Please subscribe first.' });
    }

    const portalSession = await stripe.billingPortal.sessions.create({
      customer: user.stripe_customer_id,
      return_url: return_url || 'https://www.surprisegranite.com/tools/room-designer/'
    });

    res.json({
      success: true,
      url: portalSession.url
    });

  } catch (error) {
    logger.error('Billing portal error:', error);
    return handleApiError(res, error, 'Billing portal');
  }
});

/**
 * Get user's subscription status
 * GET /api/stripe/subscription/:user_id
 */
router.get('/subscription/:user_id', async (req, res) => {
  try {
    const supabase = req.app.get('supabase');
    const { user_id } = req.params;

    if (!supabase) {
      return res.status(500).json({ error: 'Database not configured' });
    }

    const { data: user, error: userError } = await supabase
      .from('sg_users')
      .select('stripe_customer_id, stripe_subscription_id, account_type, subscription_status, subscription_period_end')
      .eq('id', user_id)
      .single();

    if (userError || !user) {
      return res.status(404).json({ error: 'User not found' });
    }

    let stripeSubscription = null;
    if (user.stripe_subscription_id) {
      try {
        stripeSubscription = await stripe.subscriptions.retrieve(user.stripe_subscription_id);
      } catch (e) {
        logger.info('Could not retrieve Stripe subscription:', e.message);
      }
    }

    res.json({
      has_subscription: !!user.stripe_subscription_id,
      account_type: user.account_type || 'free',
      subscription_status: stripeSubscription?.status || user.subscription_status || 'none',
      current_period_end: stripeSubscription?.current_period_end
        ? new Date(stripeSubscription.current_period_end * 1000).toISOString()
        : user.subscription_period_end,
      cancel_at_period_end: stripeSubscription?.cancel_at_period_end || false,
      plan: stripeSubscription?.items?.data?.[0]?.price?.metadata?.plan || user.account_type || 'free'
    });

  } catch (error) {
    logger.error('Get subscription error:', error);
    return handleApiError(res, error, 'Get subscription');
  }
});

// ============ PAYMENT INTENT ============

/**
 * Create a payment intent for Payment Element
 * POST /api/stripe/payment-intent
 */
router.post('/payment-intent', async (req, res) => {
  try {
    const { amount, currency = 'usd', customer_email, metadata = {} } = req.body;

    if (!amount || amount <= 0) {
      return res.status(400).json({ error: 'Valid amount required' });
    }

    const paymentIntent = await stripe.paymentIntents.create({
      amount: Math.round(amount * 100),
      currency,
      receipt_email: customer_email,
      metadata: {
        source: 'website',
        ...metadata
      },
      automatic_payment_methods: {
        enabled: true
      }
    });

    res.json({
      clientSecret: paymentIntent.client_secret,
      paymentIntentId: paymentIntent.id
    });

  } catch (error) {
    logger.error('Payment intent error:', error);
    return handleApiError(res, error, 'Payment intent');
  }
});

// ============ WALLET / BALANCE (Admin Only) ============

/**
 * Get Stripe account balance
 * GET /api/stripe/balance
 */
router.get('/balance', async (req, res) => {
  try {
    const supabase = req.app.get('supabase');

    if (!await verifyAdminAccess(req.user?.id, supabase)) {
      return res.status(403).json({ error: 'Admin access required to view balance' });
    }

    const balance = await stripe.balance.retrieve();

    res.json({
      available: balance.available.map(b => ({
        amount: b.amount / 100,
        currency: b.currency
      })),
      pending: balance.pending.map(b => ({
        amount: b.amount / 100,
        currency: b.currency
      })),
      total_available: balance.available.reduce((sum, b) => sum + b.amount, 0) / 100,
      total_pending: balance.pending.reduce((sum, b) => sum + b.amount, 0) / 100
    });
  } catch (error) {
    logger.error('Balance error:', error);
    return handleApiError(res, error, 'Balance');
  }
});

/**
 * Get recent payouts
 * GET /api/stripe/payouts
 */
router.get('/payouts', async (req, res) => {
  try {
    const supabase = req.app.get('supabase');

    if (!await verifyAdminAccess(req.user?.id, supabase)) {
      return res.status(403).json({ error: 'Admin access required to view payouts' });
    }

    const { limit = 10 } = req.query;
    const payouts = await stripe.payouts.list({ limit: parseInt(limit) });

    res.json({
      payouts: payouts.data.map(p => ({
        id: p.id,
        amount: p.amount / 100,
        currency: p.currency,
        status: p.status,
        arrival_date: new Date(p.arrival_date * 1000).toISOString(),
        created: new Date(p.created * 1000).toISOString(),
        method: p.method,
        description: p.description
      }))
    });
  } catch (error) {
    logger.error('Payouts error:', error);
    return handleApiError(res, error, 'Payouts');
  }
});

/**
 * Get a specific payout with transactions
 * GET /api/stripe/payouts/:payoutId
 */
router.get('/payouts/:payoutId', async (req, res) => {
  try {
    const supabase = req.app.get('supabase');

    if (!await verifyAdminAccess(req.user?.id, supabase)) {
      return res.status(403).json({ error: 'Admin access required to view payout details' });
    }

    const { payoutId } = req.params;
    const payout = await stripe.payouts.retrieve(payoutId);
    const balanceTransactions = await stripe.balanceTransactions.list({
      payout: payoutId,
      limit: 100
    });

    const transactionsWithDetails = await Promise.all(
      balanceTransactions.data.map(async (bt) => {
        let sourceDetails = null;

        if (bt.source && bt.source.startsWith('ch_')) {
          try {
            const charge = await stripe.charges.retrieve(bt.source);
            sourceDetails = {
              type: 'charge',
              id: charge.id,
              amount: charge.amount / 100,
              customer_email: charge.billing_details?.email || charge.receipt_email,
              customer_name: charge.billing_details?.name,
              description: charge.description,
              receipt_url: charge.receipt_url
            };
          } catch (e) {
            logger.info('Could not retrieve charge:', bt.source);
          }
        }

        return {
          id: bt.id,
          amount: bt.amount / 100,
          net: bt.net / 100,
          fee: bt.fee / 100,
          currency: bt.currency,
          type: bt.type,
          description: bt.description,
          created: new Date(bt.created * 1000).toISOString(),
          source: bt.source,
          sourceDetails
        };
      })
    );

    res.json({
      payout: {
        id: payout.id,
        amount: payout.amount / 100,
        currency: payout.currency,
        status: payout.status,
        arrival_date: new Date(payout.arrival_date * 1000).toISOString(),
        created: new Date(payout.created * 1000).toISOString(),
        method: payout.method,
        description: payout.description
      },
      transactions: transactionsWithDetails,
      summary: {
        total_transactions: transactionsWithDetails.length,
        total_gross: transactionsWithDetails.reduce((sum, t) => sum + (t.amount > 0 ? t.amount : 0), 0),
        total_fees: transactionsWithDetails.reduce((sum, t) => sum + t.fee, 0),
        total_net: transactionsWithDetails.reduce((sum, t) => sum + t.net, 0)
      }
    });
  } catch (error) {
    logger.error('Payout detail error:', error);
    return handleApiError(res, error, 'Payout detail');
  }
});

/**
 * Initiate a payout
 * POST /api/stripe/payouts
 */
router.post('/payouts', async (req, res) => {
  try {
    const supabase = req.app.get('supabase');

    if (!await verifyAdminAccess(req.user?.id, supabase)) {
      return res.status(403).json({ error: 'Admin access required to initiate payouts' });
    }

    const { amount, description } = req.body;

    if (!amount || amount <= 0) {
      return res.status(400).json({ error: 'Valid amount required' });
    }

    const payout = await stripe.payouts.create({
      amount: Math.round(amount * 100),
      currency: 'usd',
      description: description || 'Manual payout from dashboard'
    });

    res.json({
      success: true,
      payout: {
        id: payout.id,
        amount: payout.amount / 100,
        status: payout.status,
        arrival_date: new Date(payout.arrival_date * 1000).toISOString()
      }
    });
  } catch (error) {
    logger.error('Payout error:', error);
    return handleApiError(res, error, 'Payout');
  }
});

/**
 * Get recent transactions/charges
 * GET /api/stripe/transactions
 */
router.get('/transactions', async (req, res) => {
  try {
    const supabase = req.app.get('supabase');

    if (!await verifyAdminAccess(req.user?.id, supabase)) {
      return res.status(403).json({ error: 'Admin access required to view transactions' });
    }

    const { limit = 20 } = req.query;
    const charges = await stripe.charges.list({ limit: parseInt(limit) });

    res.json({
      transactions: charges.data.map(c => ({
        id: c.id,
        amount: c.amount / 100,
        currency: c.currency,
        status: c.status,
        description: c.description,
        customer_email: c.billing_details?.email || c.receipt_email,
        created: new Date(c.created * 1000).toISOString(),
        receipt_url: c.receipt_url,
        paid: c.paid,
        refunded: c.refunded
      }))
    });
  } catch (error) {
    logger.error('Transactions error:', error);
    return handleApiError(res, error, 'Transactions');
  }
});

/**
 * Get balance transactions
 * GET /api/stripe/balance-transactions
 */
router.get('/balance-transactions', async (req, res) => {
  try {
    const supabase = req.app.get('supabase');

    if (!await verifyAdminAccess(req.user?.id, supabase)) {
      return res.status(403).json({ error: 'Admin access required to view balance transactions' });
    }

    const { limit = 20 } = req.query;
    const transactions = await stripe.balanceTransactions.list({ limit: parseInt(limit) });

    res.json({
      transactions: transactions.data.map(t => ({
        id: t.id,
        amount: t.amount / 100,
        net: t.net / 100,
        fee: t.fee / 100,
        currency: t.currency,
        type: t.type,
        description: t.description,
        created: new Date(t.created * 1000).toISOString(),
        status: t.status,
        available_on: new Date(t.available_on * 1000).toISOString()
      }))
    });
  } catch (error) {
    logger.error('Balance transactions error:', error);
    return handleApiError(res, error, 'Balance transactions');
  }
});

// ============ STRIPE CONNECT ============

/**
 * Create a Connect Express account for vendors
 * POST /api/stripe/connect/accounts
 */
router.post('/connect/accounts', async (req, res) => {
  try {
    const supabase = req.app.get('supabase');

    if (!await verifyAdminAccess(req.user?.id, supabase)) {
      return res.status(403).json({ error: 'Admin access required to create Connect accounts' });
    }

    const { email, business_name, business_type = 'individual' } = req.body;

    if (!email) {
      return res.status(400).json({ error: 'Email is required' });
    }

    const account = await stripe.accounts.create({
      type: 'express',
      country: 'US',
      email,
      capabilities: {
        card_payments: { requested: true },
        transfers: { requested: true }
      },
      business_type,
      metadata: {
        source: 'surprise_granite_vendor',
        business_name: business_name || ''
      }
    });

    const accountLink = await stripe.accountLinks.create({
      account: account.id,
      refresh_url: 'https://www.surprisegranite.com/account/?connect=refresh',
      return_url: 'https://www.surprisegranite.com/account/?connect=success',
      type: 'account_onboarding'
    });

    res.json({
      success: true,
      account_id: account.id,
      onboarding_url: accountLink.url
    });
  } catch (error) {
    logger.error('Connect account error:', error);
    return handleApiError(res, error, 'Connect account');
  }
});

/**
 * Get Connect account status
 * GET /api/stripe/connect/accounts/:id
 */
router.get('/connect/accounts/:id', async (req, res) => {
  try {
    const supabase = req.app.get('supabase');

    if (!await verifyAdminAccess(req.user?.id, supabase)) {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const account = await stripe.accounts.retrieve(req.params.id);

    res.json({
      id: account.id,
      email: account.email,
      charges_enabled: account.charges_enabled,
      payouts_enabled: account.payouts_enabled,
      details_submitted: account.details_submitted,
      business_type: account.business_type,
      created: new Date(account.created * 1000).toISOString()
    });
  } catch (error) {
    logger.error('Get Connect account error:', error);
    return handleApiError(res, error, 'Get Connect account');
  }
});

/**
 * Create login link for Connect dashboard
 * POST /api/stripe/connect/accounts/:id/login
 */
router.post('/connect/accounts/:id/login', async (req, res) => {
  try {
    const supabase = req.app.get('supabase');

    if (!await verifyAdminAccess(req.user?.id, supabase)) {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const loginLink = await stripe.accounts.createLoginLink(req.params.id);

    res.json({
      success: true,
      url: loginLink.url
    });
  } catch (error) {
    logger.error('Connect login link error:', error);
    return handleApiError(res, error, 'Connect login link');
  }
});

/**
 * Create a transfer to connected account
 * POST /api/stripe/connect/payouts
 */
router.post('/connect/payouts', async (req, res) => {
  try {
    const supabase = req.app.get('supabase');

    if (!await verifyAdminAccess(req.user?.id, supabase)) {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const { amount, destination_account_id, description } = req.body;

    if (!amount || !destination_account_id) {
      return res.status(400).json({ error: 'Amount and destination account ID required' });
    }

    const transfer = await stripe.transfers.create({
      amount: Math.round(amount * 100),
      currency: 'usd',
      destination: destination_account_id,
      description: description || 'Vendor payout'
    });

    res.json({
      success: true,
      transfer_id: transfer.id,
      amount: transfer.amount / 100
    });
  } catch (error) {
    logger.error('Connect payout error:', error);
    return handleApiError(res, error, 'Connect payout');
  }
});

module.exports = router;
