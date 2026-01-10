/**
 * Checkout with Stripe Checkout Session
 * Surprise Granite
 */

(function() {
  'use strict';

  // Configuration
  const STRIPE_PUBLIC_KEY = 'pk_live_51Smr3E3qDbNyHFmdPLN9iXM3rMQv6hKNtXEP5yVpZVRHBFZ5xk0jKvPy4kQMQ6yHVzXSzVBBZlP8rMGKK9TyZ7qJ00q0Y3nKpN';
  const API_BASE = 'https://surprise-granite-email-api.onrender.com';
  const CART_KEY = 'sg_cart';

  // Stripe instance
  let stripe;

  /**
   * Get cart from localStorage
   */
  function getCart() {
    try {
      const cart = localStorage.getItem(CART_KEY);
      return cart ? JSON.parse(cart) : [];
    } catch (e) {
      return [];
    }
  }

  /**
   * Format price
   */
  function formatPrice(price) {
    return '$' + price.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  }

  /**
   * Get cart totals
   */
  function getCartTotals() {
    const cart = getCart();
    const subtotal = cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
    const itemCount = cart.reduce((sum, item) => sum + item.quantity, 0);

    // Calculate tax (Arizona state tax ~5.6% + avg local ~2.5%)
    const taxRate = 0.081; // 8.1% combined
    const tax = subtotal * taxRate;

    // Shipping logic
    let shipping = 0;
    if (subtotal > 0 && subtotal < 100) {
      shipping = 15;
    } else if (subtotal >= 100 && subtotal < 500) {
      shipping = 25;
    } else if (subtotal >= 500) {
      shipping = 0; // Free shipping over $500
    }

    // Check for promo
    const promoData = localStorage.getItem('sg_promo');
    let discount = 0;
    if (promoData) {
      const promo = JSON.parse(promoData);
      if (promo.type === 'percent') {
        discount = subtotal * promo.discount;
      } else if (promo.type === 'shipping') {
        shipping = 0;
      }
    }

    const total = subtotal + tax + shipping - discount;

    return {
      subtotal,
      itemCount,
      shipping,
      tax,
      discount,
      total: Math.max(0, total)
    };
  }

  /**
   * Render order summary
   */
  function renderOrderSummary() {
    const cart = getCart();
    const totals = getCartTotals();
    const orderItems = document.getElementById('orderItems');

    if (!orderItems) return;

    if (cart.length === 0) {
      // Show empty state
      document.querySelector('.checkout-content').innerHTML = `
        <div class="checkout-empty">
          <svg width="80" height="80" viewBox="0 0 24 24" fill="none" stroke="#ccc" stroke-width="1.5">
            <circle cx="9" cy="21" r="1"/>
            <circle cx="20" cy="21" r="1"/>
            <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/>
          </svg>
          <h2>Your cart is empty</h2>
          <p>Add some items to your cart before checking out.</p>
          <a href="/shop" class="btn-primary">Browse Products</a>
        </div>
      `;
      return false;
    }

    // Render items
    orderItems.innerHTML = cart.map(item => `
      <div class="order-item">
        <div class="order-item-image">
          <img src="${item.image || '/images/placeholder.jpg'}" alt="${item.name}" loading="lazy">
          <span class="order-item-quantity">${item.quantity}</span>
        </div>
        <div class="order-item-details">
          <p class="order-item-name">${item.name}</p>
          ${item.variant ? `<p class="order-item-variant">${item.variant}</p>` : ''}
        </div>
        <div class="order-item-price">${formatPrice(item.price * item.quantity)}</div>
      </div>
    `).join('');

    // Update totals
    document.getElementById('summarySubtotal').textContent = formatPrice(totals.subtotal);
    document.getElementById('summaryShipping').textContent = totals.shipping === 0 ? 'Free' : formatPrice(totals.shipping);
    document.getElementById('summaryTax').textContent = formatPrice(totals.tax);
    document.getElementById('summaryTotal').textContent = formatPrice(totals.total);

    // Show promo if applied
    const promoData = localStorage.getItem('sg_promo');
    if (promoData) {
      const promo = JSON.parse(promoData);
      const promoApplied = document.getElementById('promoApplied');
      const promoText = document.getElementById('promoText');
      if (promoApplied && promoText) {
        promoApplied.style.display = 'flex';
        promoText.textContent = `${promo.code}: ${promo.message}`;
      }
    }

    return true;
  }

  /**
   * Show message in payment area
   */
  function showPaymentMessage(message, isError = false) {
    const paymentElement = document.getElementById('payment-element');
    if (paymentElement) {
      paymentElement.innerHTML = `
        <div style="text-align: center; padding: 40px 20px;">
          ${isError ? `
            <svg width="48" height="48" viewBox="0 0 24 24" fill="#ef4444" style="margin-bottom: 16px;">
              <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/>
            </svg>
            <p style="color: #ef4444; margin: 0 0 12px; font-weight: 600;">${message}</p>
          ` : `
            <svg width="48" height="48" viewBox="0 0 24 24" fill="#22c55e" style="margin-bottom: 16px;">
              <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/>
            </svg>
            <p style="color: #22c55e; margin: 0 0 12px; font-weight: 600;">${message}</p>
          `}
        </div>
      `;
    }
  }

  /**
   * Initialize payment section
   */
  function initializePayment() {
    const cart = getCart();
    const totals = getCartTotals();

    if (cart.length === 0) return;

    // Initialize Stripe
    try {
      stripe = Stripe(STRIPE_PUBLIC_KEY);
    } catch (e) {
      console.error('Stripe failed to load');
      showPaymentMessage('Payment system unavailable. Please try again later.', true);
      return;
    }

    // Show ready message
    const paymentElement = document.getElementById('payment-element');
    if (paymentElement) {
      paymentElement.innerHTML = `
        <div style="text-align: center; padding: 40px 20px; background: linear-gradient(135deg, #f5f5f7 0%, #e8e8ed 100%); border-radius: 12px;">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#22c55e" stroke-width="2" style="margin-bottom: 16px;">
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
          </svg>
          <p style="color: #1d1d1f; margin: 0 0 8px; font-weight: 600; font-size: 16px;">Secure Stripe Checkout</p>
          <p style="color: #86868b; margin: 0; font-size: 14px;">Fill in your details above, then click "Pay Now"<br>to complete your purchase securely.</p>
        </div>
      `;
    }

    // Enable submit button
    document.getElementById('submit-button').disabled = false;
  }

  /**
   * Collect form data
   */
  function getFormData() {
    return {
      email: document.getElementById('email')?.value || '',
      firstName: document.getElementById('firstName')?.value || '',
      lastName: document.getElementById('lastName')?.value || '',
      phone: document.getElementById('phone')?.value || '',
      address: document.getElementById('address')?.value || '',
      address2: document.getElementById('address2')?.value || '',
      city: document.getElementById('city')?.value || '',
      state: document.getElementById('state')?.value || '',
      zip: document.getElementById('zip')?.value || '',
      country: document.getElementById('country')?.value || 'US'
    };
  }

  /**
   * Validate form
   */
  function validateForm() {
    const data = getFormData();
    const required = ['email', 'firstName', 'lastName', 'address', 'city', 'state', 'zip'];

    for (const field of required) {
      if (!data[field]) {
        const input = document.getElementById(field);
        if (input) {
          input.focus();
          input.classList.add('error');
        }
        return false;
      }
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(data.email)) {
      document.getElementById('email')?.focus();
      return false;
    }

    return true;
  }

  /**
   * Handle form submission - redirect to Stripe Checkout
   */
  async function handleSubmit(event) {
    event.preventDefault();

    if (!validateForm()) {
      return;
    }

    const submitButton = document.getElementById('submit-button');
    const buttonText = document.getElementById('button-text');
    const spinner = document.getElementById('spinner');

    // Disable button and show loading
    submitButton.disabled = true;
    buttonText.textContent = 'Processing...';
    spinner.classList.remove('hidden');

    const cart = getCart();
    const totals = getCartTotals();
    const formData = getFormData();

    try {
      // Build line items for Stripe - include products, tax, and shipping
      const lineItems = cart.map(item => ({
        name: item.name,
        price: Math.round(item.price * 100), // Convert to cents
        quantity: item.quantity || 1,
        image: item.image || ''
      }));

      // Add shipping as a line item if applicable
      if (totals.shipping > 0) {
        lineItems.push({
          name: 'Shipping',
          price: Math.round(totals.shipping * 100),
          quantity: 1
        });
      }

      // Add tax as a line item
      if (totals.tax > 0) {
        lineItems.push({
          name: 'Tax (AZ 8.1%)',
          price: Math.round(totals.tax * 100),
          quantity: 1
        });
      }

      // Create checkout session
      const response = await fetch(`${API_BASE}/api/create-checkout-session`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          items: lineItems,
          customer_email: formData.email,
          success_url: `${window.location.origin}/checkout/success?session_id={CHECKOUT_SESSION_ID}`,
          cancel_url: `${window.location.origin}/checkout/`
        })
      });

      const data = await response.json();

      if (data.error) {
        throw new Error(data.error);
      }

      // Clear cart before redirect
      localStorage.removeItem(CART_KEY);
      localStorage.removeItem('sg_promo');

      // Redirect to Stripe Checkout
      if (data.url) {
        window.location.href = data.url;
      } else if (data.sessionId) {
        const result = await stripe.redirectToCheckout({ sessionId: data.sessionId });
        if (result.error) {
          throw new Error(result.error.message);
        }
      }

    } catch (err) {
      console.error('Checkout error:', err);
      document.getElementById('payment-errors').textContent = err.message || 'Checkout failed. Please try again.';

      submitButton.disabled = false;
      buttonText.textContent = 'Pay Now';
      spinner.classList.add('hidden');
    }
  }

  /**
   * Pre-fill form if user is logged in
   */
  async function prefillUserData() {
    const SUPABASE_URL = 'https://ypeypgwsycxcagncgdur.supabase.co';
    const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlwZXlwZ3dzeWN4Y2FnbmNnZHVyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njc3NTQ4MjMsImV4cCI6MjA4MzMzMDgyM30.R13pNv2FDtGhfeu7gUcttYNrQAbNYitqR4FIq3O2-ME';

    try {
      if (!window.supabase) return;

      const { createClient } = window.supabase;
      const supabaseClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
      const { data: { session } } = await supabaseClient.auth.getSession();

      if (session && session.user) {
        // Get profile data
        const { data: profile } = await supabaseClient
          .from('profiles')
          .select('*')
          .eq('id', session.user.id)
          .single();

        if (profile) {
          // Pre-fill form fields
          if (profile.email) document.getElementById('email').value = profile.email;
          if (profile.first_name) document.getElementById('firstName').value = profile.first_name;
          if (profile.last_name) document.getElementById('lastName').value = profile.last_name;
          if (profile.phone) document.getElementById('phone').value = profile.phone;
          if (profile.address) document.getElementById('address').value = profile.address;
          if (profile.city) document.getElementById('city').value = profile.city;
          if (profile.state) document.getElementById('state').value = profile.state;
          if (profile.zip) document.getElementById('zip').value = profile.zip;
        } else if (session.user.email) {
          document.getElementById('email').value = session.user.email;
        }
      }
    } catch (err) {
      console.log('User data prefill skipped');
    }
  }

  /**
   * Initialize checkout page
   */
  async function init() {
    // Render order summary first
    const hasItems = renderOrderSummary();

    if (hasItems) {
      // Pre-fill user data if logged in
      await prefillUserData();

      // Initialize payment section
      initializePayment();

      // Set up form submission
      const form = document.querySelector('.checkout-form-section');
      if (form) {
        form.addEventListener('submit', handleSubmit);

        // Also handle button click
        const submitButton = document.getElementById('submit-button');
        if (submitButton) {
          submitButton.addEventListener('click', handleSubmit);
        }
      }

      // Remove error class on input
      document.querySelectorAll('input, select').forEach(input => {
        input.addEventListener('input', () => {
          input.classList.remove('error');
        });
      });
    }
  }

  // Run on DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
