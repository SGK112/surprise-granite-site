/**
 * Shop Cart Integration
 * Cleverly connects shop products to the new Stripe cart system
 * Adds floating "Quick Add" buttons and cart drawer functionality
 */

(function() {
  'use strict';

  // Product data mapping - extend as needed
  const PRODUCT_CATALOG = {
    // Countertop Samples
    'countertop-sample-quartz': { price: 25.00, name: 'Quartz Sample Box', category: 'samples' },
    'countertop-sample-granite': { price: 25.00, name: 'Granite Sample Box', category: 'samples' },
    'countertop-sample-marble': { price: 25.00, name: 'Marble Sample Box', category: 'samples' },
    // Add more products as needed
  };

  // Inject cart integration styles
  function injectStyles() {
    if (document.getElementById('shop-cart-styles')) return;

    const styles = document.createElement('style');
    styles.id = 'shop-cart-styles';
    styles.textContent = `
      /* Quick Add Button - Floating on product cards */
      .quick-add-btn {
        position: absolute;
        bottom: 12px;
        right: 12px;
        width: 44px;
        height: 44px;
        background: linear-gradient(135deg, #f9cb00 0%, #e5b800 100%);
        border: none;
        border-radius: 50%;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        box-shadow: 0 4px 15px rgba(249, 203, 0, 0.4);
        transition: all 0.3s ease;
        opacity: 0;
        transform: scale(0.8) translateY(10px);
        z-index: 10;
      }

      /* Always visible - not just on hover */
      .quick-add-btn {
        opacity: 1 !important;
        transform: scale(1) translateY(0) !important;
      }

      .product-card:hover .quick-add-btn,
      .shop-product:hover .quick-add-btn,
      [sf-data-product]:hover .quick-add-btn {
        transform: scale(1.1) translateY(0) !important;
      }

      .quick-add-btn:hover {
        transform: scale(1.1);
        box-shadow: 0 6px 20px rgba(249, 203, 0, 0.5);
      }

      .quick-add-btn:active {
        transform: scale(0.95);
      }

      .quick-add-btn svg {
        width: 22px;
        height: 22px;
        fill: #1a2b3c;
      }

      .quick-add-btn.added {
        background: #22c55e;
      }

      .quick-add-btn.added svg {
        fill: #fff;
      }

      /* Cart Drawer */
      .cart-drawer-overlay {
        position: fixed;
        inset: 0;
        background: rgba(0, 0, 0, 0.5);
        z-index: 99998;
        opacity: 0;
        visibility: hidden;
        transition: all 0.3s ease;
      }

      .cart-drawer-overlay.open {
        opacity: 1;
        visibility: visible;
      }

      .cart-drawer {
        position: fixed;
        top: 0;
        right: 0;
        width: 400px;
        max-width: 90vw;
        height: 100vh;
        background: #fff;
        z-index: 99999;
        transform: translateX(100%);
        transition: transform 0.3s ease;
        display: flex;
        flex-direction: column;
        box-shadow: -10px 0 40px rgba(0, 0, 0, 0.2);
      }

      .cart-drawer.open {
        transform: translateX(0);
      }

      .cart-drawer-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 20px;
        border-bottom: 1px solid #e5e5e5;
        background: #1a2b3c;
        color: #fff;
      }

      .cart-drawer-header h3 {
        margin: 0;
        font-size: 18px;
        font-weight: 600;
        display: flex;
        align-items: center;
        gap: 10px;
      }

      .cart-drawer-header h3 svg {
        fill: #f9cb00;
      }

      .cart-drawer-close {
        background: none;
        border: none;
        color: #fff;
        font-size: 28px;
        cursor: pointer;
        padding: 0;
        line-height: 1;
        opacity: 0.8;
        transition: opacity 0.2s;
      }

      .cart-drawer-close:hover {
        opacity: 1;
      }

      .cart-drawer-items {
        flex: 1;
        overflow-y: auto;
        padding: 20px;
      }

      .cart-drawer-empty {
        text-align: center;
        padding: 40px 20px;
        color: #666;
      }

      .cart-drawer-empty svg {
        width: 60px;
        height: 60px;
        fill: #e5e5e5;
        margin-bottom: 15px;
      }

      .cart-drawer-item {
        display: flex;
        gap: 15px;
        padding: 15px 0;
        border-bottom: 1px solid #f0f0f0;
      }

      .cart-drawer-item-img {
        width: 70px;
        height: 70px;
        border-radius: 8px;
        object-fit: cover;
        background: #f5f5f5;
      }

      .cart-drawer-item-info {
        flex: 1;
      }

      .cart-drawer-item-name {
        font-weight: 600;
        font-size: 14px;
        color: #1a2b3c;
        margin-bottom: 4px;
      }

      .cart-drawer-item-price {
        color: #f9cb00;
        font-weight: 600;
        font-size: 15px;
      }

      .cart-drawer-item-qty {
        display: flex;
        align-items: center;
        gap: 10px;
        margin-top: 8px;
      }

      .cart-drawer-item-qty button {
        width: 28px;
        height: 28px;
        border: 1px solid #e5e5e5;
        background: #fff;
        border-radius: 6px;
        cursor: pointer;
        font-size: 16px;
        transition: all 0.2s;
      }

      .cart-drawer-item-qty button:hover {
        background: #f5f5f5;
      }

      .cart-drawer-item-qty span {
        font-weight: 500;
        min-width: 24px;
        text-align: center;
      }

      .cart-drawer-item-remove {
        background: none;
        border: none;
        color: #999;
        cursor: pointer;
        padding: 4px;
        transition: color 0.2s;
      }

      .cart-drawer-item-remove:hover {
        color: #ef4444;
      }

      .cart-drawer-footer {
        padding: 20px;
        border-top: 1px solid #e5e5e5;
        background: #f8f9fa;
      }

      .cart-drawer-total {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 15px;
        font-size: 18px;
        font-weight: 700;
        color: #1a2b3c;
      }

      .cart-drawer-checkout {
        width: 100%;
        padding: 16px;
        background: linear-gradient(135deg, #f9cb00 0%, #e5b800 100%);
        color: #1a2b3c;
        border: none;
        border-radius: 10px;
        font-size: 16px;
        font-weight: 600;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 10px;
        transition: all 0.2s;
      }

      .cart-drawer-checkout:hover {
        transform: translateY(-2px);
        box-shadow: 0 6px 20px rgba(249, 203, 0, 0.4);
      }

      .cart-drawer-view {
        display: block;
        width: 100%;
        text-align: center;
        margin-top: 12px;
        color: #666;
        text-decoration: none;
        font-size: 14px;
      }

      .cart-drawer-view:hover {
        color: #1a2b3c;
      }

      /* Floating Cart Button */
      .floating-cart-btn {
        position: fixed;
        bottom: 80px;
        right: 20px;
        width: 60px;
        height: 60px;
        background: #1a2b3c;
        border: none;
        border-radius: 50%;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        box-shadow: 0 6px 25px rgba(0, 0, 0, 0.3);
        z-index: 9997;
        transition: all 0.3s ease;
      }

      .floating-cart-btn:hover {
        transform: scale(1.1);
        box-shadow: 0 8px 30px rgba(0, 0, 0, 0.4);
      }

      .floating-cart-btn svg {
        width: 26px;
        height: 26px;
        fill: #f9cb00;
      }

      .floating-cart-btn .cart-count {
        position: absolute;
        top: -5px;
        right: -5px;
        width: 24px;
        height: 24px;
        background: #ef4444;
        color: #fff;
        font-size: 12px;
        font-weight: 700;
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
      }

      .floating-cart-btn .cart-count:empty {
        display: none;
      }

      /* Product card relative positioning */
      .product-card,
      .shop-product,
      [sf-data-product] {
        position: relative;
      }

      /* Price badge enhancement */
      .instant-price-badge {
        position: absolute;
        top: 12px;
        left: 12px;
        background: #1a2b3c;
        color: #f9cb00;
        padding: 6px 12px;
        border-radius: 20px;
        font-size: 14px;
        font-weight: 700;
        z-index: 5;
      }
    `;
    document.head.appendChild(styles);
  }

  // Create cart drawer
  function createCartDrawer() {
    if (document.getElementById('cartDrawer')) return;

    const drawerHTML = `
      <div class="cart-drawer-overlay" id="cartDrawerOverlay" onclick="window.closeCartDrawer()"></div>
      <div class="cart-drawer" id="cartDrawer">
        <div class="cart-drawer-header">
          <h3>
            <svg width="24" height="24" viewBox="0 0 24 24"><path d="M7 18c-1.1 0-1.99.9-1.99 2S5.9 22 7 22s2-.9 2-2-.9-2-2-2zM1 2v2h2l3.6 7.59-1.35 2.45c-.16.28-.25.61-.25.96 0 1.1.9 2 2 2h12v-2H7.42c-.14 0-.25-.11-.25-.25l.03-.12.9-1.63h7.45c.75 0 1.41-.41 1.75-1.03l3.58-6.49c.08-.14.12-.31.12-.48 0-.55-.45-1-1-1H5.21l-.94-2H1zm16 16c-1.1 0-1.99.9-1.99 2s.89 2 1.99 2 2-.9 2-2-.9-2-2-2z"/></svg>
            Your Cart
          </h3>
          <button class="cart-drawer-close" onclick="window.closeCartDrawer()">&times;</button>
        </div>
        <div class="cart-drawer-items" id="cartDrawerItems">
          <!-- Items rendered here -->
        </div>
        <div class="cart-drawer-footer" id="cartDrawerFooter">
          <div class="cart-drawer-total">
            <span>Total</span>
            <span id="cartDrawerTotal">$0.00</span>
          </div>
          <button class="cart-drawer-checkout" onclick="window.location.href='/cart/'">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/></svg>
            Checkout Now
          </button>
          <a href="/cart/" class="cart-drawer-view">View Full Cart</a>
        </div>
      </div>
    `;

    document.body.insertAdjacentHTML('beforeend', drawerHTML);

    // Also add floating cart button
    const floatingBtn = document.createElement('button');
    floatingBtn.className = 'floating-cart-btn';
    floatingBtn.onclick = () => window.openCartDrawer();
    floatingBtn.innerHTML = `
      <svg viewBox="0 0 24 24"><path d="M7 18c-1.1 0-1.99.9-1.99 2S5.9 22 7 22s2-.9 2-2-.9-2-2-2zM1 2v2h2l3.6 7.59-1.35 2.45c-.16.28-.25.61-.25.96 0 1.1.9 2 2 2h12v-2H7.42c-.14 0-.25-.11-.25-.25l.03-.12.9-1.63h7.45c.75 0 1.41-.41 1.75-1.03l3.58-6.49c.08-.14.12-.31.12-.48 0-.55-.45-1-1-1H5.21l-.94-2H1zm16 16c-1.1 0-1.99.9-1.99 2s.89 2 1.99 2 2-.9 2-2-.9-2-2-2z"/></svg>
      <span class="cart-count" id="floatingCartCount"></span>
    `;
    document.body.appendChild(floatingBtn);
  }

  // Open cart drawer
  window.openCartDrawer = function() {
    document.getElementById('cartDrawerOverlay').classList.add('open');
    document.getElementById('cartDrawer').classList.add('open');
    document.body.style.overflow = 'hidden';
    renderCartDrawer();
  };

  // Close cart drawer
  window.closeCartDrawer = function() {
    document.getElementById('cartDrawerOverlay').classList.remove('open');
    document.getElementById('cartDrawer').classList.remove('open');
    document.body.style.overflow = '';
  };

  // Render cart drawer items
  function renderCartDrawer() {
    const cart = window.SgCart ? window.SgCart.getCart() : [];
    const itemsContainer = document.getElementById('cartDrawerItems');
    const totalEl = document.getElementById('cartDrawerTotal');
    const footerEl = document.getElementById('cartDrawerFooter');

    if (cart.length === 0) {
      itemsContainer.innerHTML = `
        <div class="cart-drawer-empty">
          <svg viewBox="0 0 24 24"><path d="M7 18c-1.1 0-1.99.9-1.99 2S5.9 22 7 22s2-.9 2-2-.9-2-2-2zM1 2v2h2l3.6 7.59-1.35 2.45c-.16.28-.25.61-.25.96 0 1.1.9 2 2 2h12v-2H7.42c-.14 0-.25-.11-.25-.25l.03-.12.9-1.63h7.45c.75 0 1.41-.41 1.75-1.03l3.58-6.49c.08-.14.12-.31.12-.48 0-.55-.45-1-1-1H5.21l-.94-2H1zm16 16c-1.1 0-1.99.9-1.99 2s.89 2 1.99 2 2-.9 2-2-.9-2-2-2z"/></svg>
          <p>Your cart is empty</p>
          <a href="/shop/" style="color: #f9cb00; font-weight: 600;">Start Shopping</a>
        </div>
      `;
      footerEl.style.display = 'none';
      return;
    }

    footerEl.style.display = 'block';

    itemsContainer.innerHTML = cart.map(item => `
      <div class="cart-drawer-item">
        <img src="${item.image || '/images/placeholder.jpg'}" alt="${item.name}" class="cart-drawer-item-img">
        <div class="cart-drawer-item-info">
          <div class="cart-drawer-item-name">${item.name}</div>
          <div class="cart-drawer-item-price">$${item.price.toFixed(2)}</div>
          <div class="cart-drawer-item-qty">
            <button onclick="updateDrawerQty('${item.id}', '${item.variant || ''}', ${item.quantity - 1})">-</button>
            <span>${item.quantity}</span>
            <button onclick="updateDrawerQty('${item.id}', '${item.variant || ''}', ${item.quantity + 1})">+</button>
          </div>
        </div>
        <button class="cart-drawer-item-remove" onclick="removeDrawerItem('${item.id}', '${item.variant || ''}')">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>
        </button>
      </div>
    `).join('');

    const total = cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
    totalEl.textContent = '$' + total.toFixed(2);
  }

  // Update quantity from drawer
  window.updateDrawerQty = function(id, variant, qty) {
    if (window.SgCart) {
      window.SgCart.updateQuantity(id, variant, qty);
      renderCartDrawer();
      updateFloatingCount();
    }
  };

  // Remove item from drawer
  window.removeDrawerItem = function(id, variant) {
    if (window.SgCart) {
      window.SgCart.removeFromCart(id, variant);
      renderCartDrawer();
      updateFloatingCount();
    }
  };

  // Update floating cart count
  function updateFloatingCount() {
    const countEl = document.getElementById('floatingCartCount');
    if (countEl && window.SgCart) {
      const totals = window.SgCart.getCartTotals();
      countEl.textContent = totals.itemCount > 0 ? totals.itemCount : '';
    }
  }

  // Add quick-add buttons to product cards
  function addQuickAddButtons() {
    // Find all product containers
    const selectors = [
      '[sf-data-product]',
      '.product-card',
      '.shop-product',
      '.collection-item'
    ];

    selectors.forEach(selector => {
      document.querySelectorAll(selector).forEach(product => {
        if (product.querySelector('.quick-add-btn')) return; // Already added

        // Try to extract product info
        const nameEl = product.querySelector('.product-name, .shop-product-name, h3, h4');
        const priceEl = product.querySelector('.product-price, .shop-product-price, [class*="price"]');
        const imgEl = product.querySelector('img');
        const linkEl = product.querySelector('a[href*="/product"], a[href*="/shop"]');

        if (!nameEl) return;

        const name = nameEl.textContent.trim();
        const priceText = priceEl ? priceEl.textContent.trim() : '';
        const price = parseFloat(priceText.replace(/[^0-9.]/g, '')) || 0;
        const image = imgEl ? imgEl.src : '';
        const href = linkEl ? linkEl.href : '';
        const id = product.getAttribute('sf-data-product') ||
                   name.toLowerCase().replace(/[^a-z0-9]+/g, '-');

        // Create quick add button
        const btn = document.createElement('button');
        btn.className = 'quick-add-btn';
        btn.innerHTML = '<svg viewBox="0 0 24 24"><path d="M11 9h2V6h3V4h-3V1h-2v3H8v2h3v3zm-4 9c-1.1 0-1.99.9-1.99 2S5.9 22 7 22s2-.9 2-2-.9-2-2-2zm10 0c-1.1 0-1.99.9-1.99 2s.89 2 1.99 2 2-.9 2-2-.9-2-2-2zm-9.83-3.25l.03-.12.9-1.63h7.45c.75 0 1.41-.41 1.75-1.03l3.58-6.49c.08-.14.12-.31.12-.48 0-.55-.45-1-1-1H5.21l-.94-2H1v2h2l3.6 7.59-1.35 2.45c-.16.28-.25.61-.25.96 0 1.1.9 2 2 2h12v-2H7.42c-.14 0-.25-.11-.25-.25z"/></svg>';
        btn.title = 'Quick Add to Cart';

        btn.onclick = function(e) {
          e.preventDefault();
          e.stopPropagation();

          if (price <= 0) {
            window.SgCart.showNotification('Please select options first', 'error');
            if (href) window.location.href = href;
            return;
          }

          // Add to cart
          window.SgCart.addToCart({
            id: id,
            name: name,
            price: price,
            image: image,
            href: href,
            quantity: 1
          });

          // Animate button
          btn.classList.add('added');
          btn.innerHTML = '<svg viewBox="0 0 24 24"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>';

          setTimeout(() => {
            btn.classList.remove('added');
            btn.innerHTML = '<svg viewBox="0 0 24 24"><path d="M11 9h2V6h3V4h-3V1h-2v3H8v2h3v3zm-4 9c-1.1 0-1.99.9-1.99 2S5.9 22 7 22s2-.9 2-2-.9-2-2-2zm10 0c-1.1 0-1.99.9-1.99 2s.89 2 1.99 2 2-.9 2-2-.9-2-2-2zm-9.83-3.25l.03-.12.9-1.63h7.45c.75 0 1.41-.41 1.75-1.03l3.58-6.49c.08-.14.12-.31.12-.48 0-.55-.45-1-1-1H5.21l-.94-2H1v2h2l3.6 7.59-1.35 2.45c-.16.28-.25.61-.25.96 0 1.1.9 2 2 2h12v-2H7.42c-.14 0-.25-.11-.25-.25z"/></svg>';
          }, 1500);

          // Open drawer briefly
          window.openCartDrawer();
          updateFloatingCount();
        };

        product.appendChild(btn);
      });
    });
  }

  // Intercept Shopify links and redirect to internal cart
  function interceptShopifyLinks() {
    document.addEventListener('click', function(e) {
      const link = e.target.closest('a');
      if (!link) return;

      const href = link.href || '';

      // Intercept Shopify checkout and cart links
      if (href.includes('shopify.com') ||
          href.includes('/cart') && href.includes('shopify') ||
          href.includes('checkout.shopify') ||
          link.classList.contains('sf-add-to-cart') ||
          link.hasAttribute('sf-add-to-cart')) {

        e.preventDefault();
        e.stopPropagation();

        // Try to extract product info from the link's parent card
        const card = link.closest('[sf-data-product], .product-card, .shop-product');
        if (card) {
          const nameEl = card.querySelector('.product-name, .shop-product-name, h3, h4');
          const priceEl = card.querySelector('.product-price, .shop-product-price, [class*="price"]');
          const imgEl = card.querySelector('img');

          if (nameEl) {
            const name = nameEl.textContent.trim();
            const priceText = priceEl ? priceEl.textContent.trim() : '';
            const price = parseFloat(priceText.replace(/[^0-9.]/g, '')) || 0;
            const image = imgEl ? imgEl.src : '';

            window.SgCart.addToCart({
              id: name.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
              name: name,
              price: price,
              image: image,
              quantity: 1
            });

            window.openCartDrawer();
            updateFloatingCount();
            return;
          }
        }

        // Fallback: open cart drawer
        window.openCartDrawer();
      }
    }, true);
  }

  // Add full "Add to Cart" button bars to product cards
  function addCartButtonBars() {
    const products = document.querySelectorAll('[sf-data-product], .product-card, .shop-product, .collection-item');

    products.forEach(product => {
      if (product.querySelector('.sg-add-to-cart-bar')) return;

      const nameEl = product.querySelector('.product-name, .shop-product-name, h3, h4, [class*="name"]');
      const priceEl = product.querySelector('.product-price, .shop-product-price, [class*="price"]');
      const imgEl = product.querySelector('img');

      if (!nameEl) return;

      const name = nameEl.textContent.trim();
      const priceText = priceEl ? priceEl.textContent.trim() : '';
      const price = parseFloat(priceText.replace(/[^0-9.]/g, '')) || 0;
      const image = imgEl ? imgEl.src : '';
      const id = name.toLowerCase().replace(/[^a-z0-9]+/g, '-');

      // Create button bar
      const bar = document.createElement('div');
      bar.className = 'sg-add-to-cart-bar';
      bar.innerHTML = `
        <button class="sg-add-btn" data-id="${id}" data-name="${name}" data-price="${price}" data-image="${image}">
          <svg viewBox="0 0 24 24"><path d="M11 9h2V6h3V4h-3V1h-2v3H8v2h3v3zm-4 9c-1.1 0-1.99.9-1.99 2S5.9 22 7 22s2-.9 2-2-.9-2-2-2zm10 0c-1.1 0-1.99.9-1.99 2s.89 2 1.99 2 2-.9 2-2-.9-2-2-2zm-9.83-3.25l.03-.12.9-1.63h7.45c.75 0 1.41-.41 1.75-1.03l3.58-6.49c.08-.14.12-.31.12-.48 0-.55-.45-1-1-1H5.21l-.94-2H1v2h2l3.6 7.59-1.35 2.45c-.16.28-.25.61-.25.96 0 1.1.9 2 2 2h12v-2H7.42c-.14 0-.25-.11-.25-.25z"/></svg>
          Add to Cart
        </button>
        <button class="sg-buy-btn" data-id="${id}" data-name="${name}" data-price="${price}" data-image="${image}">
          Buy Now
        </button>
      `;

      // Insert after price or at end of content area
      const contentArea = product.querySelector('.product-content, .shop-product-content, [class*="content"]') || product;
      contentArea.appendChild(bar);

      // Bind click handlers
      bar.querySelector('.sg-add-btn').addEventListener('click', function(e) {
        e.preventDefault();
        e.stopPropagation();

        if (price <= 0) {
          window.SgCart.showNotification('Price not available - contact us for quote', 'error');
          return;
        }

        window.SgCart.addToCart({
          id: this.dataset.id,
          name: this.dataset.name,
          price: parseFloat(this.dataset.price),
          image: this.dataset.image,
          quantity: 1
        });

        this.innerHTML = '<svg viewBox="0 0 24 24"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg> Added!';
        this.style.background = '#22c55e';
        setTimeout(() => {
          this.innerHTML = '<svg viewBox="0 0 24 24"><path d="M11 9h2V6h3V4h-3V1h-2v3H8v2h3v3zm-4 9c-1.1 0-1.99.9-1.99 2S5.9 22 7 22s2-.9 2-2-.9-2-2-2zm10 0c-1.1 0-1.99.9-1.99 2s.89 2 1.99 2 2-.9 2-2-.9-2-2-2zm-9.83-3.25l.03-.12.9-1.63h7.45c.75 0 1.41-.41 1.75-1.03l3.58-6.49c.08-.14.12-.31.12-.48 0-.55-.45-1-1-1H5.21l-.94-2H1v2h2l3.6 7.59-1.35 2.45c-.16.28-.25.61-.25.96 0 1.1.9 2 2 2h12v-2H7.42c-.14 0-.25-.11-.25-.25z"/></svg> Add to Cart';
          this.style.background = '';
        }, 2000);

        window.openCartDrawer();
        updateFloatingCount();
      });

      bar.querySelector('.sg-buy-btn').addEventListener('click', function(e) {
        e.preventDefault();
        e.stopPropagation();

        if (price <= 0) {
          window.SgCart.showNotification('Price not available - contact us for quote', 'error');
          return;
        }

        // Clear cart and add this item
        window.SgCart.clearCart();
        window.SgCart.addToCart({
          id: this.dataset.id,
          name: this.dataset.name,
          price: parseFloat(this.dataset.price),
          image: this.dataset.image,
          quantity: 1
        });

        // Go directly to cart
        window.location.href = '/cart/';
      });
    });
  }

  // Add cart button bar styles
  function addButtonBarStyles() {
    const style = document.createElement('style');
    style.id = 'sg-cart-bar-styles';
    style.textContent = `
      .sg-add-to-cart-bar {
        display: flex;
        gap: 10px;
        margin-top: 15px;
        padding-top: 15px;
        border-top: 1px solid #e5e5e5;
      }

      .sg-add-btn, .sg-buy-btn {
        flex: 1;
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 8px;
        padding: 12px 16px;
        border-radius: 10px;
        font-size: 14px;
        font-weight: 600;
        cursor: pointer;
        transition: all 0.3s ease;
        border: none;
      }

      .sg-add-btn {
        background: linear-gradient(135deg, #f9cb00 0%, #e5b800 100%);
        color: #1a2b3c;
      }

      .sg-add-btn:hover {
        transform: translateY(-2px);
        box-shadow: 0 6px 20px rgba(249, 203, 0, 0.4);
      }

      .sg-add-btn svg {
        width: 18px;
        height: 18px;
        fill: currentColor;
      }

      .sg-buy-btn {
        background: #1a2b3c;
        color: #fff;
      }

      .sg-buy-btn:hover {
        background: #2d4a5e;
        transform: translateY(-2px);
        box-shadow: 0 6px 20px rgba(26, 43, 60, 0.3);
      }

      /* Hide original Shopyflow buttons */
      .sf-add-to-cart,
      [sf-add-to-cart],
      .shopyflow-add,
      .add-to-cart-btn:not(.sg-add-btn) {
        display: none !important;
      }
    `;
    document.head.appendChild(style);
  }

  // Initialize
  function init() {
    // Wait for cart.js to load
    if (!window.SgCart) {
      setTimeout(init, 100);
      return;
    }

    injectStyles();
    addButtonBarStyles();
    createCartDrawer();
    addQuickAddButtons();
    addCartButtonBars();
    interceptShopifyLinks();
    updateFloatingCount();

    // Re-run when new products are loaded (for infinite scroll, etc.)
    const observer = new MutationObserver(() => {
      addQuickAddButtons();
      addCartButtonBars();
    });

    const productsContainer = document.querySelector('.shop-products, .collection-list, [data-products]');
    if (productsContainer) {
      observer.observe(productsContainer, { childList: true, subtree: true });
    }
  }

  // Run on DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
