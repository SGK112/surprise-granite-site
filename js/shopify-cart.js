/**
 * Shopify Cart Integration for Surprise Granite
 * Uses Shopify Buy Button SDK for cart functionality
 */

(function() {
  'use strict';

  // Configuration
  const CONFIG = {
    domain: 'surprise-granite.myshopify.com',
    storefrontAccessToken: 'f229e837278f32c740a5862496a5e4fa',
    checkoutDomain: 'store.surprisegranite.com'
  };

  // State
  let client = null;
  let checkout = null;
  let cartOpen = false;

  // Initialize when SDK is loaded
  function init() {
    if (typeof ShopifyBuy === 'undefined') {
      console.warn('Shopify Buy SDK not loaded');
      return;
    }

    // Create client
    client = ShopifyBuy.buildClient({
      domain: CONFIG.domain,
      storefrontAccessToken: CONFIG.storefrontAccessToken
    });

    // Load or create checkout
    loadCheckout();

    // Render cart UI
    renderCartUI();

    // Expose global functions
    window.SurpriseCart = {
      addToCart: addToCart,
      openCart: openCart,
      closeCart: closeCart,
      getItemCount: getItemCount
    };

    console.log('Surprise Granite cart initialized');
  }

  // Load existing checkout or create new
  async function loadCheckout() {
    const checkoutId = localStorage.getItem('sg_checkout_id');

    if (checkoutId) {
      try {
        checkout = await client.checkout.fetch(checkoutId);
        if (checkout && !checkout.completedAt) {
          updateCartCount();
          return;
        }
      } catch (e) {
        console.log('Creating new checkout');
      }
    }

    // Create new checkout
    checkout = await client.checkout.create();
    localStorage.setItem('sg_checkout_id', checkout.id);
  }

  // Add product to cart
  async function addToCart(variantId, quantity = 1) {
    if (!checkout) {
      await loadCheckout();
    }

    try {
      // Show loading state
      showNotification('Adding to cart...', 'loading');

      const lineItemsToAdd = [{
        variantId: `gid://shopify/ProductVariant/${variantId}`,
        quantity: quantity
      }];

      checkout = await client.checkout.addLineItems(checkout.id, lineItemsToAdd);
      localStorage.setItem('sg_checkout_id', checkout.id);

      updateCartCount();
      updateCartItems();
      showNotification('Added to cart!', 'success');
      openCart();

      return true;
    } catch (error) {
      console.error('Add to cart error:', error);
      showNotification('Could not add to cart', 'error');
      return false;
    }
  }

  // Update cart item quantity
  async function updateQuantity(lineItemId, quantity) {
    if (quantity < 1) {
      return removeItem(lineItemId);
    }

    try {
      const lineItemsToUpdate = [{
        id: lineItemId,
        quantity: quantity
      }];

      checkout = await client.checkout.updateLineItems(checkout.id, lineItemsToUpdate);
      updateCartCount();
      updateCartItems();
    } catch (error) {
      console.error('Update quantity error:', error);
    }
  }

  // Remove item from cart
  async function removeItem(lineItemId) {
    try {
      checkout = await client.checkout.removeLineItems(checkout.id, [lineItemId]);
      updateCartCount();
      updateCartItems();
    } catch (error) {
      console.error('Remove item error:', error);
    }
  }

  // Get cart item count
  function getItemCount() {
    if (!checkout || !checkout.lineItems) return 0;
    return checkout.lineItems.reduce((total, item) => total + item.quantity, 0);
  }

  // Update cart count badge
  function updateCartCount() {
    const count = getItemCount();
    const badge = document.getElementById('sg-cart-count');
    if (badge) {
      badge.textContent = count;
      badge.style.display = count > 0 ? 'flex' : 'none';
    }
  }

  // Update cart items display
  function updateCartItems() {
    const container = document.getElementById('sg-cart-items');
    if (!container || !checkout) return;

    if (!checkout.lineItems || checkout.lineItems.length === 0) {
      container.innerHTML = '<div class="sg-cart-empty">Your cart is empty</div>';
      document.getElementById('sg-cart-subtotal').textContent = '$0.00';
      return;
    }

    let html = '';
    checkout.lineItems.forEach(item => {
      const image = item.variant.image ? item.variant.image.src : '/images/products/default.svg';
      const price = parseFloat(item.variant.price.amount).toFixed(2);
      const lineTotal = (item.quantity * parseFloat(item.variant.price.amount)).toFixed(2);

      html += `
        <div class="sg-cart-item" data-line-id="${item.id}">
          <img src="${image}" alt="${item.title}" class="sg-cart-item-image"/>
          <div class="sg-cart-item-info">
            <div class="sg-cart-item-title">${item.title}</div>
            <div class="sg-cart-item-variant">${item.variant.title !== 'Default Title' ? item.variant.title : ''}</div>
            <div class="sg-cart-item-price">$${price}</div>
          </div>
          <div class="sg-cart-item-qty">
            <button class="sg-qty-btn" onclick="updateQty('${item.id}', ${item.quantity - 1})">-</button>
            <span>${item.quantity}</span>
            <button class="sg-qty-btn" onclick="updateQty('${item.id}', ${item.quantity + 1})">+</button>
          </div>
          <button class="sg-cart-item-remove" onclick="removeCartItem('${item.id}')">&times;</button>
        </div>
      `;
    });

    container.innerHTML = html;

    // Update subtotal
    const subtotal = parseFloat(checkout.subtotalPrice.amount).toFixed(2);
    document.getElementById('sg-cart-subtotal').textContent = `$${subtotal}`;
  }

  // Global functions for onclick handlers
  window.updateQty = function(lineItemId, quantity) {
    updateQuantity(lineItemId, quantity);
  };

  window.removeCartItem = function(lineItemId) {
    removeItem(lineItemId);
  };

  // Open cart drawer
  function openCart() {
    const drawer = document.getElementById('sg-cart-drawer');
    const overlay = document.getElementById('sg-cart-overlay');
    if (drawer && overlay) {
      drawer.classList.add('open');
      overlay.classList.add('open');
      cartOpen = true;
      updateCartItems();
    }
  }

  // Close cart drawer
  function closeCart() {
    const drawer = document.getElementById('sg-cart-drawer');
    const overlay = document.getElementById('sg-cart-overlay');
    if (drawer && overlay) {
      drawer.classList.remove('open');
      overlay.classList.remove('open');
      cartOpen = false;
    }
  }

  // Proceed to checkout
  function goToCheckout() {
    if (checkout && checkout.webUrl) {
      // Replace myshopify.com with custom domain
      let checkoutUrl = checkout.webUrl;
      if (CONFIG.checkoutDomain) {
        checkoutUrl = checkoutUrl.replace(CONFIG.domain, CONFIG.checkoutDomain);
      }
      window.location.href = checkoutUrl;
    }
  }
  window.goToCheckout = goToCheckout;

  // Show notification
  function showNotification(message, type = 'info') {
    let notification = document.getElementById('sg-notification');
    if (!notification) {
      notification = document.createElement('div');
      notification.id = 'sg-notification';
      document.body.appendChild(notification);
    }

    notification.textContent = message;
    notification.className = `sg-notification sg-notification-${type}`;
    notification.classList.add('show');

    if (type !== 'loading') {
      setTimeout(() => {
        notification.classList.remove('show');
      }, 2000);
    }
  }

  // Render cart UI elements
  function renderCartUI() {
    // Cart icon in header (find the header nav and append)
    const headerNav = document.querySelector('.header-nav');
    if (headerNav && !document.getElementById('sg-cart-icon')) {
      const cartIcon = document.createElement('button');
      cartIcon.id = 'sg-cart-icon';
      cartIcon.className = 'sg-cart-icon';
      cartIcon.innerHTML = `
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="9" cy="21" r="1"></circle>
          <circle cx="20" cy="21" r="1"></circle>
          <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"></path>
        </svg>
        <span id="sg-cart-count" class="sg-cart-count" style="display:none">0</span>
      `;
      cartIcon.onclick = openCart;
      headerNav.appendChild(cartIcon);
    }

    // Cart drawer
    if (!document.getElementById('sg-cart-drawer')) {
      const drawer = document.createElement('div');
      drawer.id = 'sg-cart-drawer';
      drawer.className = 'sg-cart-drawer';
      drawer.innerHTML = `
        <div class="sg-cart-header">
          <h3>Your Cart</h3>
          <button class="sg-cart-close" onclick="SurpriseCart.closeCart()">&times;</button>
        </div>
        <div id="sg-cart-items" class="sg-cart-items">
          <div class="sg-cart-empty">Your cart is empty</div>
        </div>
        <div class="sg-cart-footer">
          <div class="sg-cart-subtotal-row">
            <span>Subtotal</span>
            <span id="sg-cart-subtotal">$0.00</span>
          </div>
          <button class="sg-checkout-btn" onclick="goToCheckout()">Checkout</button>
          <a href="/materials/all-countertops" class="sg-continue-shopping">Continue Shopping</a>
        </div>
      `;
      document.body.appendChild(drawer);

      // Overlay
      const overlay = document.createElement('div');
      overlay.id = 'sg-cart-overlay';
      overlay.className = 'sg-cart-overlay';
      overlay.onclick = closeCart;
      document.body.appendChild(overlay);
    }

    // Add styles
    addCartStyles();
  }

  // Add cart CSS
  function addCartStyles() {
    if (document.getElementById('sg-cart-styles')) return;

    const styles = document.createElement('style');
    styles.id = 'sg-cart-styles';
    styles.textContent = `
      .sg-cart-icon {
        background: none;
        border: none;
        color: #94a3b8;
        cursor: pointer;
        position: relative;
        padding: 8px;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: color 0.2s;
      }
      .sg-cart-icon:hover { color: white; }
      .sg-cart-count {
        position: absolute;
        top: 0;
        right: 0;
        background: #ffc107;
        color: #1a1a2e;
        font-size: 11px;
        font-weight: 700;
        min-width: 18px;
        height: 18px;
        border-radius: 9px;
        display: flex;
        align-items: center;
        justify-content: center;
      }
      .sg-cart-overlay {
        position: fixed;
        inset: 0;
        background: rgba(0,0,0,0.5);
        opacity: 0;
        visibility: hidden;
        transition: all 0.3s;
        z-index: 998;
      }
      .sg-cart-overlay.open { opacity: 1; visibility: visible; }
      .sg-cart-drawer {
        position: fixed;
        top: 0;
        right: -400px;
        width: 400px;
        max-width: 100vw;
        height: 100vh;
        background: white;
        box-shadow: -4px 0 20px rgba(0,0,0,0.15);
        display: flex;
        flex-direction: column;
        transition: right 0.3s ease;
        z-index: 999;
      }
      .sg-cart-drawer.open { right: 0; }
      .sg-cart-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 20px;
        border-bottom: 1px solid #e2e8f0;
      }
      .sg-cart-header h3 { margin: 0; font-size: 1.2rem; color: #1a1a2e; }
      .sg-cart-close {
        background: none;
        border: none;
        font-size: 28px;
        color: #64748b;
        cursor: pointer;
        line-height: 1;
      }
      .sg-cart-items {
        flex: 1;
        overflow-y: auto;
        padding: 15px;
      }
      .sg-cart-empty {
        text-align: center;
        color: #64748b;
        padding: 40px 20px;
      }
      .sg-cart-item {
        display: flex;
        gap: 12px;
        padding: 12px 0;
        border-bottom: 1px solid #e2e8f0;
        align-items: center;
      }
      .sg-cart-item-image {
        width: 60px;
        height: 60px;
        object-fit: cover;
        border-radius: 8px;
        background: #f1f5f9;
      }
      .sg-cart-item-info { flex: 1; }
      .sg-cart-item-title {
        font-weight: 600;
        font-size: 0.9rem;
        color: #1a1a2e;
      }
      .sg-cart-item-variant {
        font-size: 0.8rem;
        color: #64748b;
      }
      .sg-cart-item-price {
        font-weight: 600;
        color: #1a1a2e;
        margin-top: 4px;
      }
      .sg-cart-item-qty {
        display: flex;
        align-items: center;
        gap: 8px;
      }
      .sg-qty-btn {
        width: 28px;
        height: 28px;
        border: 1px solid #e2e8f0;
        background: white;
        border-radius: 4px;
        cursor: pointer;
        font-size: 16px;
        color: #1a1a2e;
      }
      .sg-qty-btn:hover { background: #f1f5f9; }
      .sg-cart-item-remove {
        background: none;
        border: none;
        color: #94a3b8;
        font-size: 20px;
        cursor: pointer;
        padding: 4px;
      }
      .sg-cart-item-remove:hover { color: #ef4444; }
      .sg-cart-footer {
        padding: 20px;
        border-top: 1px solid #e2e8f0;
        background: #f8fafc;
      }
      .sg-cart-subtotal-row {
        display: flex;
        justify-content: space-between;
        font-weight: 600;
        font-size: 1.1rem;
        margin-bottom: 15px;
        color: #1a1a2e;
      }
      .sg-checkout-btn {
        width: 100%;
        padding: 14px;
        background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
        color: white;
        border: none;
        border-radius: 8px;
        font-size: 1rem;
        font-weight: 600;
        cursor: pointer;
        transition: transform 0.2s;
      }
      .sg-checkout-btn:hover { transform: translateY(-2px); }
      .sg-continue-shopping {
        display: block;
        text-align: center;
        margin-top: 12px;
        color: #64748b;
        text-decoration: none;
        font-size: 0.9rem;
      }
      .sg-continue-shopping:hover { color: #1a1a2e; }
      .sg-notification {
        position: fixed;
        bottom: 20px;
        left: 50%;
        transform: translateX(-50%) translateY(100px);
        background: #1a1a2e;
        color: white;
        padding: 12px 24px;
        border-radius: 8px;
        font-size: 0.9rem;
        z-index: 1000;
        transition: transform 0.3s;
      }
      .sg-notification.show { transform: translateX(-50%) translateY(0); }
      .sg-notification-success { background: #10b981; }
      .sg-notification-error { background: #ef4444; }
      .sg-notification-loading { background: #6366f1; }
      @media (max-width: 480px) {
        .sg-cart-drawer { width: 100%; right: -100%; }
      }
    `;
    document.head.appendChild(styles);
  }

  // Wait for SDK to load
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function() {
      // Wait a bit for SDK script to load
      setTimeout(init, 100);
    });
  } else {
    setTimeout(init, 100);
  }
})();
