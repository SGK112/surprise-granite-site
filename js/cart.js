/**
 * Cart System for Surprise Granite
 * Handles cart management and Stripe checkout
 */

(function() {
  'use strict';

  // Stripe Configuration
  const STRIPE_PUBLIC_KEY = 'pk_live_51Smr3E3qDbNyHFmdPLN9iXM3rMQv6hKNtXEP5yVpZVRHBFZ5xk0jKvPy4kQMQ6yHVzXSzVBBZlP8rMGKK9TyZ7qJ00q0Y3nKpN';
  const API_BASE = 'https://surprise-granite-email-api.onrender.com';

  // Initialize Stripe
  let stripe;
  try {
    stripe = Stripe(STRIPE_PUBLIC_KEY);
  } catch (e) {
    console.warn('Stripe not loaded yet');
  }

  // Cart Storage Key
  const CART_KEY = 'sg_cart';

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
   * Save cart to localStorage
   */
  function saveCart(cart) {
    localStorage.setItem(CART_KEY, JSON.stringify(cart));
    updateCartBadge();
    if (window.location.pathname.includes('/cart')) {
      renderCart();
    }
  }

  /**
   * Add item to cart
   */
  function addToCart(item) {
    const cart = getCart();
    const existingIndex = cart.findIndex(i =>
      i.id === item.id && i.variant === item.variant
    );

    if (existingIndex > -1) {
      cart[existingIndex].quantity += item.quantity || 1;
    } else {
      cart.push({
        id: item.id,
        name: item.name,
        price: item.price,
        image: item.image,
        variant: item.variant || '',
        quantity: item.quantity || 1,
        category: item.category || 'product',
        href: item.href || ''
      });
    }

    saveCart(cart);
    showNotification(`${item.name} added to cart!`);
    return cart;
  }

  /**
   * Remove item from cart
   */
  function removeFromCart(id, variant = '') {
    let cart = getCart();
    cart = cart.filter(i => !(i.id === id && i.variant === variant));
    saveCart(cart);
    return cart;
  }

  /**
   * Update item quantity
   */
  function updateQuantity(id, variant, quantity) {
    const cart = getCart();
    const item = cart.find(i => i.id === id && i.variant === variant);
    if (item) {
      if (quantity <= 0) {
        return removeFromCart(id, variant);
      }
      item.quantity = quantity;
      saveCart(cart);
    }
    return cart;
  }

  /**
   * Clear entire cart
   */
  function clearCart() {
    saveCart([]);
  }

  /**
   * Get cart totals
   */
  function getCartTotals() {
    const cart = getCart();
    const subtotal = cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
    const itemCount = cart.reduce((sum, item) => sum + item.quantity, 0);

    return {
      subtotal,
      itemCount,
      shipping: 0, // Calculated at checkout
      tax: 0, // Calculated at checkout
      total: subtotal
    };
  }

  /**
   * Update cart badge in navigation
   */
  function updateCartBadge() {
    const totals = getCartTotals();
    const badges = document.querySelectorAll('.cart-badge, #cartBadge');

    badges.forEach(badge => {
      if (totals.itemCount > 0) {
        badge.textContent = totals.itemCount;
        badge.style.display = 'flex';
      } else {
        badge.style.display = 'none';
      }
    });

    // Also update any cart count text
    const countTexts = document.querySelectorAll('.cart-count');
    countTexts.forEach(el => {
      el.textContent = totals.itemCount;
    });
  }

  /**
   * Show notification toast
   */
  function showNotification(message, type = 'success') {
    // Remove existing notifications
    const existing = document.querySelector('.cart-notification');
    if (existing) existing.remove();

    const notification = document.createElement('div');
    notification.className = `cart-notification ${type}`;
    notification.innerHTML = `
      <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
        ${type === 'success'
          ? '<path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/>'
          : '<path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/>'}
      </svg>
      <span>${message}</span>
    `;

    document.body.appendChild(notification);

    // Animate in
    setTimeout(() => notification.classList.add('show'), 10);

    // Remove after delay
    setTimeout(() => {
      notification.classList.remove('show');
      setTimeout(() => notification.remove(), 300);
    }, 3000);
  }

  /**
   * Format price
   */
  function formatPrice(price) {
    return '$' + price.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  }

  /**
   * Render cart page
   */
  function renderCart() {
    const cart = getCart();
    const totals = getCartTotals();

    const cartEmpty = document.getElementById('cartEmpty');
    const cartItems = document.getElementById('cartItems');
    const cartSummary = document.getElementById('cartSummary');
    const cartSubtotal = document.getElementById('cartSubtotal');
    const cartTotal = document.getElementById('cartTotal');

    if (!cartItems) return;

    if (cart.length === 0) {
      if (cartEmpty) cartEmpty.style.display = 'block';
      if (cartItems) cartItems.style.display = 'none';
      if (cartSummary) cartSummary.style.display = 'none';
      return;
    }

    if (cartEmpty) cartEmpty.style.display = 'none';
    if (cartItems) cartItems.style.display = 'block';
    if (cartSummary) cartSummary.style.display = 'block';

    // Render items
    cartItems.innerHTML = cart.map(item => `
      <div class="cart-item" data-id="${item.id}" data-variant="${item.variant}">
        <div class="cart-item-image">
          <img src="${item.image || '/images/placeholder.jpg'}" alt="${item.name}" loading="lazy">
        </div>
        <div class="cart-item-details">
          <a href="${item.href || '#'}" class="cart-item-name">${item.name}</a>
          ${item.variant ? `<div class="cart-item-variant">${item.variant}</div>` : ''}
          <div class="cart-item-price">${formatPrice(item.price)} each</div>
        </div>
        <div class="cart-item-actions">
          <div class="cart-item-total">${formatPrice(item.price * item.quantity)}</div>
          <div class="quantity-selector">
            <button type="button" class="quantity-btn" onclick="window.SgCart.updateQuantity('${item.id}', '${item.variant}', ${item.quantity - 1})" ${item.quantity <= 1 ? 'disabled' : ''}>-</button>
            <span class="quantity-value">${item.quantity}</span>
            <button type="button" class="quantity-btn" onclick="window.SgCart.updateQuantity('${item.id}', '${item.variant}', ${item.quantity + 1})">+</button>
          </div>
          <button type="button" class="remove-item" onclick="window.SgCart.removeFromCart('${item.id}', '${item.variant}')">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2"/>
            </svg>
            Remove
          </button>
        </div>
      </div>
    `).join('');

    // Update totals
    if (cartSubtotal) cartSubtotal.textContent = formatPrice(totals.subtotal);
    if (cartTotal) cartTotal.textContent = formatPrice(totals.total);
  }

  /**
   * Proceed to Stripe Checkout
   */
  async function checkout() {
    const cart = getCart();
    if (cart.length === 0) {
      showNotification('Your cart is empty', 'error');
      return;
    }

    const checkoutBtn = document.getElementById('checkoutBtn');
    if (checkoutBtn) {
      checkoutBtn.disabled = true;
      checkoutBtn.classList.add('loading');
      checkoutBtn.innerHTML = '<span>Processing...</span>';
    }

    try {
      // Create Stripe checkout session
      const response = await fetch(`${API_BASE}/api/create-checkout-session`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          items: cart.map(item => ({
            name: item.name,
            price: Math.round(item.price * 100), // Convert to cents
            quantity: item.quantity,
            image: item.image
          })),
          success_url: window.location.origin + '/checkout/success?session_id={CHECKOUT_SESSION_ID}',
          cancel_url: window.location.origin + '/cart/'
        })
      });

      const data = await response.json();

      if (data.sessionId) {
        // Redirect to Stripe Checkout
        const result = await stripe.redirectToCheckout({
          sessionId: data.sessionId
        });

        if (result.error) {
          throw new Error(result.error.message);
        }
      } else if (data.url) {
        // Direct URL redirect
        window.location.href = data.url;
      } else {
        throw new Error(data.error || 'Failed to create checkout session');
      }
    } catch (error) {
      console.error('Checkout error:', error);
      showNotification('Checkout failed. Please try again.', 'error');

      if (checkoutBtn) {
        checkoutBtn.disabled = false;
        checkoutBtn.classList.remove('loading');
        checkoutBtn.innerHTML = `
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <rect x="1" y="4" width="22" height="16" rx="2" ry="2"/>
            <line x1="1" y1="10" x2="23" y2="10"/>
          </svg>
          Proceed to Checkout
        `;
      }
    }
  }

  /**
   * Handle promo code
   */
  function applyPromoCode() {
    const input = document.getElementById('promoCode');
    const message = document.getElementById('promoMessage');
    const code = input ? input.value.trim().toUpperCase() : '';

    if (!code) {
      if (message) {
        message.className = 'promo-message error';
        message.textContent = 'Please enter a promo code';
      }
      return;
    }

    // Example promo codes
    const promoCodes = {
      'WELCOME10': { discount: 0.10, type: 'percent', message: '10% off applied!' },
      'SAVE20': { discount: 0.20, type: 'percent', message: '20% off applied!' },
      'FREESHIP': { discount: 0, type: 'shipping', message: 'Free shipping applied!' }
    };

    const promo = promoCodes[code];
    if (promo) {
      if (message) {
        message.className = 'promo-message success';
        message.textContent = promo.message;
      }
      // Store promo for checkout
      localStorage.setItem('sg_promo', JSON.stringify({ code, ...promo }));
    } else {
      if (message) {
        message.className = 'promo-message error';
        message.textContent = 'Invalid promo code';
      }
    }
  }

  /**
   * Initialize cart page
   */
  function initCartPage() {
    // Render cart if on cart page
    if (window.location.pathname.includes('/cart')) {
      renderCart();

      // Checkout button
      const checkoutBtn = document.getElementById('checkoutBtn');
      if (checkoutBtn) {
        checkoutBtn.addEventListener('click', checkout);
      }

      // Promo code button
      const promoBtn = document.getElementById('applyPromo');
      if (promoBtn) {
        promoBtn.addEventListener('click', applyPromoCode);
      }

      // Enter key for promo
      const promoInput = document.getElementById('promoCode');
      if (promoInput) {
        promoInput.addEventListener('keypress', function(e) {
          if (e.key === 'Enter') {
            applyPromoCode();
          }
        });
      }
    }
  }

  /**
   * Add notification styles
   */
  function addStyles() {
    if (document.getElementById('cart-notification-styles')) return;

    const styles = document.createElement('style');
    styles.id = 'cart-notification-styles';
    styles.textContent = `
      .cart-notification {
        position: fixed;
        bottom: 20px;
        right: 20px;
        background: #1a2b3c;
        color: #fff;
        padding: 16px 24px;
        border-radius: 12px;
        display: flex;
        align-items: center;
        gap: 12px;
        box-shadow: 0 10px 40px rgba(0,0,0,0.3);
        transform: translateY(100px);
        opacity: 0;
        transition: all 0.3s ease;
        z-index: 10000;
        font-size: 15px;
        font-weight: 500;
      }
      .cart-notification.show {
        transform: translateY(0);
        opacity: 1;
      }
      .cart-notification.success svg {
        color: #22c55e;
      }
      .cart-notification.error {
        background: #ef4444;
      }
      .cart-notification.error svg {
        color: #fff;
      }
      .cart-badge {
        position: absolute;
        top: -8px;
        right: -8px;
        background: #ef4444;
        color: #fff;
        font-size: 11px;
        font-weight: 700;
        min-width: 18px;
        height: 18px;
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 0 4px;
      }
      .add-to-cart-btn {
        background: #f9cb00;
        color: #1a2b3c;
        border: none;
        padding: 12px 24px;
        border-radius: 8px;
        font-size: 15px;
        font-weight: 600;
        cursor: pointer;
        display: inline-flex;
        align-items: center;
        gap: 8px;
        transition: all 0.2s;
      }
      .add-to-cart-btn:hover {
        background: #e5b800;
        transform: translateY(-2px);
      }
      .add-to-cart-btn svg {
        width: 20px;
        height: 20px;
        fill: currentColor;
      }
    `;
    document.head.appendChild(styles);
  }

  // Initialize
  function init() {
    addStyles();
    updateCartBadge();
    initCartPage();
  }

  // Run on DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  /**
   * Buy Now - Clear cart, add item, and go to checkout
   */
  async function buyNow(item) {
    // Clear existing cart
    clearCart();

    // Add the item
    addToCart(item);

    // Show quick feedback
    showNotification(`Proceeding to checkout with ${item.name}...`);

    // Small delay for user feedback, then checkout
    setTimeout(() => {
      checkout();
    }, 500);
  }

  /**
   * Quick Add to Cart from any page
   */
  function quickAddToCart(productData) {
    const item = {
      id: productData.id || productData.name.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
      name: productData.name,
      price: parseFloat(productData.price) || 0,
      image: productData.image || '',
      variant: productData.variant || '',
      quantity: productData.quantity || 1,
      category: productData.category || 'product',
      href: productData.href || window.location.href
    };

    if (item.price <= 0) {
      showNotification('Please contact us for pricing on this item', 'error');
      return false;
    }

    addToCart(item);
    return true;
  }

  /**
   * Quick Buy Now from any page
   */
  function quickBuyNow(productData) {
    const item = {
      id: productData.id || productData.name.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
      name: productData.name,
      price: parseFloat(productData.price) || 0,
      image: productData.image || '',
      variant: productData.variant || '',
      quantity: productData.quantity || 1,
      category: productData.category || 'product',
      href: productData.href || window.location.href
    };

    if (item.price <= 0) {
      showNotification('Please contact us for pricing on this item', 'error');
      return false;
    }

    buyNow(item);
    return true;
  }

  // Expose cart API globally
  window.SgCart = {
    addToCart,
    removeFromCart,
    updateQuantity,
    clearCart,
    getCart,
    getCartTotals,
    checkout,
    showNotification,
    buyNow,
    quickAddToCart,
    quickBuyNow
  };

})();
