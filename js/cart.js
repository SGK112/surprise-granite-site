/**
 * Cart System for Surprise Granite
 * Handles cart management and Stripe checkout
 */

(function() {
  'use strict';

  // Security: Use centralized SecurityUtils if available
  const escapeHtml = (window.SecurityUtils && window.SecurityUtils.escapeHtml)
    ? window.SecurityUtils.escapeHtml.bind(window.SecurityUtils)
    : function(str) {
        if (str === null || str === undefined) return '';
        const div = document.createElement('div');
        div.textContent = String(str);
        return div.innerHTML;
      };

  const escapeAttr = (window.SecurityUtils && window.SecurityUtils.escapeAttr)
    ? window.SecurityUtils.escapeAttr.bind(window.SecurityUtils)
    : function(str) {
        if (str === null || str === undefined) return '';
        return String(str)
          .replace(/&/g, '&amp;')
          .replace(/"/g, '&quot;')
          .replace(/'/g, '&#39;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;');
      };

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

  // Track current pricing tier for real-time updates
  let currentPricingTier = 'guest';
  let previousTier = 'guest';

  /**
   * Get cart from localStorage with proper error handling
   */
  function getCart() {
    try {
      const cart = localStorage.getItem(CART_KEY);
      if (!cart) return [];
      const parsed = JSON.parse(cart);
      // Validate cart structure
      if (!Array.isArray(parsed)) {
        console.warn('Cart data is invalid, resetting');
        localStorage.removeItem(CART_KEY);
        return [];
      }
      return parsed;
    } catch (e) {
      console.error('Error reading cart:', e.message);
      // Try to recover by clearing corrupted data
      try {
        localStorage.removeItem(CART_KEY);
      } catch (clearErr) {
        // localStorage may be full or unavailable
      }
      return [];
    }
  }

  /**
   * Save cart to localStorage with error handling
   */
  function saveCart(cart) {
    try {
      localStorage.setItem(CART_KEY, JSON.stringify(cart));
    } catch (e) {
      console.error('Error saving cart:', e.message);
      // Show user-friendly error if storage is full
      if (e.name === 'QuotaExceededError' || e.code === 22) {
        showNotification('Storage is full. Please clear some space.', 'error');
      } else {
        showNotification('Could not save cart. Please try again.', 'error');
      }
      return false;
    }
    updateCartBadge();
    if (window.location.pathname.includes('/cart')) {
      renderCart();
    }
    return true;
  }

  /**
   * Add item to cart
   * Now stores wholesale cost for real-time tier pricing updates
   */
  function addToCart(item) {
    const cart = getCart();
    const existingIndex = cart.findIndex(i =>
      i.id === item.id && i.variant === item.variant
    );

    // Calculate price using pricing service if available
    let finalPrice = item.price;
    let wholesaleCost = item.wholesaleCost || item.cost || null;

    // Try to get tier-based pricing
    if (window.SG_PRICING && wholesaleCost) {
      const pricing = window.SG_PRICING.calculatePrice({ wholesaleCost });
      finalPrice = pricing.yourPrice;
    } else if (window.SG_PRICING && item.price && !wholesaleCost) {
      // Estimate wholesale from retail (guest) price: retail = wholesale * 1.55
      wholesaleCost = item.price / 1.55;
      const pricing = window.SG_PRICING.calculatePrice({ wholesaleCost });
      finalPrice = pricing.yourPrice;
    }

    if (existingIndex > -1) {
      cart[existingIndex].quantity += item.quantity || 1;
      // Update price if it changed
      if (wholesaleCost) {
        cart[existingIndex].wholesaleCost = wholesaleCost;
        cart[existingIndex].price = finalPrice;
        cart[existingIndex].pricingTier = currentPricingTier;
      }
    } else {
      cart.push({
        id: item.id,
        name: item.name,
        price: finalPrice,
        wholesaleCost: wholesaleCost,
        originalPrice: item.price, // Store original price for reference
        pricingTier: currentPricingTier,
        image: item.image,
        variant: item.variant || '',
        quantity: item.quantity || 1,
        category: item.category || 'product',
        href: item.href || ''
      });
    }

    saveCart(cart);
    showNotification(`${escapeHtml(item.name)} added to cart!`);
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
   * Recalculate all cart prices based on current tier
   * Called automatically when user signs in, signs out, or subscription changes
   */
  function recalculatePrices(newTier, showNotificationFlag = true) {
    if (!window.SG_PRICING || !window.SG_PRICING_CONFIG) {
      return;
    }

    const cart = getCart();
    if (cart.length === 0) return;

    let updated = 0;
    let totalSavings = 0;

    cart.forEach(item => {
      // Get wholesale cost (stored or estimated from original price)
      let wholesaleCost = item.wholesaleCost;

      if (!wholesaleCost && item.originalPrice) {
        // Estimate from original guest price
        wholesaleCost = item.originalPrice / 1.55;
      } else if (!wholesaleCost && item.price) {
        // Estimate from current price and old tier
        const oldMarkup = window.SG_PRICING_CONFIG.tiers[item.pricingTier || 'guest']?.markup || 1.55;
        wholesaleCost = item.price / oldMarkup;
      }

      if (wholesaleCost) {
        const oldPrice = item.price;
        const pricing = window.SG_PRICING.calculatePrice({ wholesaleCost }, newTier);
        const newPrice = pricing.yourPrice;

        if (Math.abs(oldPrice - newPrice) > 0.01) {
          item.price = newPrice;
          item.wholesaleCost = wholesaleCost;
          item.pricingTier = newTier;
          totalSavings += (oldPrice - newPrice) * item.quantity;
          updated++;
        }
      }
    });

    if (updated > 0) {
      saveCart(cart);

      // Show notification about price update
      if (showNotificationFlag) {
        const tierInfo = window.SG_PRICING_CONFIG.tiers[newTier];
        if (totalSavings > 0) {
          showTierUpdateNotification(newTier, tierInfo.name, totalSavings, 'savings');
        } else if (totalSavings < 0) {
          // Prices went up (e.g., user signed out)
          showTierUpdateNotification(newTier, tierInfo.name, Math.abs(totalSavings), 'increase');
        }
      }
    }

    return { updated, totalSavings };
  }

  /**
   * Show tier update notification with savings/increase info
   */
  function showTierUpdateNotification(tier, tierName, amount, type) {
    // Remove existing tier notifications
    const existing = document.querySelector('.tier-update-notification');
    if (existing) existing.remove();

    const notification = document.createElement('div');
    notification.className = 'tier-update-notification';

    if (type === 'savings') {
      notification.innerHTML = `
        <div class="tier-notification-content">
          <div class="tier-notification-icon">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#22c55e" stroke-width="2">
              <path d="M12 2v20M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"/>
            </svg>
          </div>
          <div class="tier-notification-text">
            <strong>${escapeHtml(tierName)} Pricing Applied!</strong>
            <span>Your cart just saved <strong>$${amount.toFixed(2)}</strong></span>
          </div>
          <button class="tier-notification-close" onclick="this.parentElement.parentElement.remove()">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M18 6L6 18M6 6l12 12"/>
            </svg>
          </button>
        </div>
      `;
    } else {
      notification.innerHTML = `
        <div class="tier-notification-content tier-notification-warning">
          <div class="tier-notification-icon">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" stroke-width="2">
              <circle cx="12" cy="12" r="10"/>
              <path d="M12 8v4M12 16h.01"/>
            </svg>
          </div>
          <div class="tier-notification-text">
            <strong>Prices Updated</strong>
            <span><a href="/log-in/" style="color: #f9cb00;">Sign in</a> to unlock member discounts</span>
          </div>
          <button class="tier-notification-close" onclick="this.parentElement.parentElement.remove()">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M18 6L6 18M6 6l12 12"/>
            </svg>
          </button>
        </div>
      `;
    }

    document.body.appendChild(notification);

    // Animate in
    setTimeout(() => notification.classList.add('show'), 10);

    // Auto-remove after 6 seconds
    setTimeout(() => {
      notification.classList.remove('show');
      setTimeout(() => notification.remove(), 300);
    }, 6000);
  }

  /**
   * Subscribe to pricing tier changes
   */
  function subscribeToPricingChanges() {
    if (window.SG_PRICING) {
      window.SG_PRICING.onTierChange((newTier, user) => {
        // Only recalculate if tier actually changed
        if (newTier !== currentPricingTier) {
          previousTier = currentPricingTier;
          currentPricingTier = newTier;
          recalculatePrices(newTier, true);
        }
      });
      // Initialize current tier
      currentPricingTier = window.SG_PRICING.getCurrentTier();
    } else {
      // Retry after pricing service loads
      setTimeout(subscribeToPricingChanges, 100);
    }
  }

  /**
   * Get cart totals with tier info
   */
  function getCartTotals() {
    const cart = getCart();
    const subtotal = cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
    const itemCount = cart.reduce((sum, item) => sum + item.quantity, 0);

    // Calculate savings vs guest pricing
    let guestTotal = 0;
    cart.forEach(item => {
      if (item.wholesaleCost) {
        const guestPrice = item.wholesaleCost * 1.55; // Guest markup
        guestTotal += guestPrice * item.quantity;
      } else if (item.originalPrice) {
        guestTotal += item.originalPrice * item.quantity;
      } else {
        guestTotal += item.price * item.quantity;
      }
    });

    const totalSavings = guestTotal - subtotal;

    return {
      subtotal,
      itemCount,
      shipping: 0, // Calculated at checkout
      tax: 0, // Calculated at checkout
      total: subtotal,
      guestTotal,
      savings: totalSavings,
      savingsPercent: guestTotal > 0 ? Math.round((totalSavings / guestTotal) * 100) : 0,
      tier: currentPricingTier
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
      <span>${escapeHtml(message)}</span>
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

    // Render items (with XSS protection)
    cartItems.innerHTML = cart.map(item => {
      const safeId = escapeAttr(item.id);
      const safeVariant = escapeAttr(item.variant || '');
      const safeName = escapeHtml(item.name);
      const safeImage = escapeAttr(item.image || '/images/placeholder.jpg');
      const safeHref = escapeAttr(item.href || '#');
      const safePrice = parseFloat(item.price) || 0;
      const safeQty = parseInt(item.quantity) || 1;

      return `
      <div class="cart-item" data-id="${safeId}" data-variant="${safeVariant}">
        <div class="cart-item-image">
          <img src="${safeImage}" alt="${safeName}" loading="lazy">
        </div>
        <div class="cart-item-details">
          <a href="${safeHref}" class="cart-item-name">${safeName}</a>
          ${item.variant ? `<div class="cart-item-variant">${escapeHtml(item.variant)}</div>` : ''}
          <div class="cart-item-price">${formatPrice(safePrice)} each</div>
        </div>
        <div class="cart-item-actions">
          <div class="cart-item-total">${formatPrice(safePrice * safeQty)}</div>
          <div class="quantity-selector">
            <button type="button" class="quantity-btn" onclick="window.SgCart.updateQuantity('${safeId}', '${safeVariant}', ${safeQty - 1})" ${safeQty <= 1 ? 'disabled' : ''}>-</button>
            <span class="quantity-value">${safeQty}</span>
            <button type="button" class="quantity-btn" onclick="window.SgCart.updateQuantity('${safeId}', '${safeVariant}', ${safeQty + 1})">+</button>
          </div>
          <button type="button" class="remove-item" onclick="window.SgCart.removeFromCart('${safeId}', '${safeVariant}')">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2"/>
            </svg>
            Remove
          </button>
        </div>
      </div>
    `}).join('');

    // Update totals
    if (cartSubtotal) cartSubtotal.textContent = formatPrice(totals.subtotal);
    if (cartTotal) cartTotal.textContent = formatPrice(totals.total);

    // Show savings if user has better than guest pricing
    const savingsEl = document.getElementById('cartSavings');
    const tierBadgeEl = document.getElementById('cartTierBadge');

    if (totals.savings > 0.01) {
      if (savingsEl) {
        savingsEl.innerHTML = `
          <div class="cart-savings-row">
            <span class="savings-label">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#22c55e" stroke-width="2">
                <path d="M12 2v20M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"/>
              </svg>
              Your Savings
            </span>
            <span class="savings-amount">-${formatPrice(totals.savings)}</span>
          </div>
        `;
        savingsEl.style.display = 'block';
      }

      if (tierBadgeEl && window.SG_PRICING_CONFIG) {
        const tierInfo = window.SG_PRICING_CONFIG.tiers[totals.tier];
        tierBadgeEl.innerHTML = `
          <span class="tier-badge tier-badge-${totals.tier}">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2Z"/>
            </svg>
            ${escapeHtml(tierInfo?.name || 'Member')} Pricing
          </span>
        `;
        tierBadgeEl.style.display = 'block';
      }
    } else {
      if (savingsEl) savingsEl.style.display = 'none';
      if (tierBadgeEl) tierBadgeEl.style.display = 'none';
    }

    // Show upgrade prompt for guests
    const upgradePromptEl = document.getElementById('cartUpgradePrompt');
    if (upgradePromptEl) {
      if (totals.tier === 'guest' && totals.itemCount > 0) {
        const potentialSavings = totals.guestTotal * 0.35; // Pro savings
        upgradePromptEl.innerHTML = `
          <div class="cart-upgrade-prompt">
            <div class="upgrade-icon">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#f9cb00" stroke-width="2">
                <path d="M12 2v20M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"/>
              </svg>
            </div>
            <div class="upgrade-text">
              <strong>Save up to ${formatPrice(potentialSavings)}</strong>
              <span><a href="/log-in/">Sign in</a> or <a href="/membership/">join Pro</a> for member pricing</span>
            </div>
          </div>
        `;
        upgradePromptEl.style.display = 'block';
      } else {
        upgradePromptEl.style.display = 'none';
      }
    }
  }

  /**
   * Proceed to Checkout Page
   */
  function checkout() {
    const cart = getCart();
    if (cart.length === 0) {
      showNotification('Your cart is empty', 'error');
      return;
    }

    // Redirect to the checkout page with Stripe Payment Element
    window.location.href = '/checkout/';
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

      /* Tier Update Notification */
      .tier-update-notification {
        position: fixed;
        top: 80px;
        right: 20px;
        z-index: 10001;
        transform: translateX(120%);
        opacity: 0;
        transition: all 0.4s cubic-bezier(0.34, 1.56, 0.64, 1);
      }
      .tier-update-notification.show {
        transform: translateX(0);
        opacity: 1;
      }
      .tier-notification-content {
        background: linear-gradient(135deg, #1a2b3c 0%, #2d3e50 100%);
        color: #fff;
        padding: 16px 20px;
        border-radius: 12px;
        display: flex;
        align-items: center;
        gap: 14px;
        box-shadow: 0 10px 40px rgba(0,0,0,0.3), 0 0 0 1px rgba(34,197,94,0.3);
        max-width: 360px;
      }
      .tier-notification-content.tier-notification-warning {
        box-shadow: 0 10px 40px rgba(0,0,0,0.3), 0 0 0 1px rgba(245,158,11,0.3);
      }
      .tier-notification-icon {
        flex-shrink: 0;
        width: 40px;
        height: 40px;
        background: rgba(255,255,255,0.1);
        border-radius: 10px;
        display: flex;
        align-items: center;
        justify-content: center;
      }
      .tier-notification-text {
        flex: 1;
        display: flex;
        flex-direction: column;
        gap: 4px;
      }
      .tier-notification-text strong {
        font-size: 15px;
        font-weight: 600;
        color: #22c55e;
      }
      .tier-notification-warning .tier-notification-text strong {
        color: #f59e0b;
      }
      .tier-notification-text span {
        font-size: 13px;
        color: rgba(255,255,255,0.8);
      }
      .tier-notification-text a {
        color: #f9cb00;
        text-decoration: underline;
      }
      .tier-notification-close {
        background: none;
        border: none;
        color: rgba(255,255,255,0.5);
        cursor: pointer;
        padding: 4px;
        transition: color 0.2s;
      }
      .tier-notification-close:hover {
        color: #fff;
      }

      /* Cart Savings Display */
      .cart-savings-row {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 12px 0;
        border-top: 1px dashed #e5e5e5;
        margin-top: 8px;
      }
      .savings-label {
        display: flex;
        align-items: center;
        gap: 8px;
        color: #22c55e;
        font-weight: 500;
        font-size: 14px;
      }
      .savings-amount {
        color: #22c55e;
        font-weight: 700;
        font-size: 16px;
      }
      .tier-badge {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        padding: 6px 12px;
        background: linear-gradient(135deg, #f9cb00 0%, #b8860b 100%);
        color: #1a2b3c;
        border-radius: 20px;
        font-size: 12px;
        font-weight: 600;
        text-transform: uppercase;
        letter-spacing: 0.5px;
      }
      .tier-badge-fabricator {
        background: linear-gradient(135deg, #1a2b3c 0%, #2d3e50 100%);
        color: #f9cb00;
      }
      .tier-badge-pro {
        background: linear-gradient(135deg, #22c55e 0%, #16a34a 100%);
        color: #fff;
      }

      /* Cart Upgrade Prompt */
      .cart-upgrade-prompt {
        display: flex;
        align-items: center;
        gap: 14px;
        padding: 16px;
        background: linear-gradient(135deg, #fefce8 0%, #fef9c3 100%);
        border: 1px solid #fde047;
        border-radius: 12px;
        margin-top: 16px;
      }
      .upgrade-icon {
        flex-shrink: 0;
        width: 44px;
        height: 44px;
        background: #fff;
        border-radius: 10px;
        display: flex;
        align-items: center;
        justify-content: center;
        box-shadow: 0 2px 8px rgba(0,0,0,0.1);
      }
      .upgrade-text {
        display: flex;
        flex-direction: column;
        gap: 4px;
      }
      .upgrade-text strong {
        font-size: 15px;
        color: #1a2b3c;
      }
      .upgrade-text span {
        font-size: 13px;
        color: #666;
      }
      .upgrade-text a {
        color: #b8860b;
        font-weight: 600;
        text-decoration: underline;
      }

      @media (max-width: 480px) {
        .tier-update-notification {
          top: auto;
          bottom: 20px;
          right: 10px;
          left: 10px;
        }
        .tier-notification-content {
          max-width: 100%;
        }
      }
    `;
    document.head.appendChild(styles);
  }

  // Initialize
  function init() {
    addStyles();
    updateCartBadge();
    initCartPage();
    // Subscribe to pricing tier changes for real-time updates
    subscribeToPricingChanges();
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
    quickBuyNow,
    recalculatePrices,
    getCurrentTier: () => currentPricingTier
  };

})();
