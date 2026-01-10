/**
 * Universal Swipe Cards - Works across all product pages
 * Uses JSON data files for full inventory (no Webflow dependency)
 * Uses the unified SGFavorites system from favorites.js
 */

(function() {
  'use strict';

  // Only run on mobile
  if (window.innerWidth > 767) return;

  // Detect product type from URL and set config
  const path = window.location.pathname.toLowerCase();
  let productType = 'general';
  let productLabel = 'Products';
  let jsonPath = null;
  let jsonKey = null;
  let urlPrefix = '/';

  if (path.includes('flooring')) {
    productType = 'flooring';
    productLabel = 'Flooring';
    jsonPath = '/data/flooring.json';
    jsonKey = 'flooring';
    urlPrefix = '/flooring/';
  } else if (path.includes('countertop') || path.includes('granite') || path.includes('marble') || path.includes('quartz') || path.includes('porcelain') || path.includes('quartzite')) {
    productType = 'countertop';
    productLabel = 'Countertops';
    jsonPath = '/data/countertops.json';
    jsonKey = 'countertops';
    urlPrefix = '/countertops/';
  } else if (path.includes('tile')) {
    productType = 'tile';
    productLabel = 'Tiles';
    jsonPath = '/data/tile.json';
    jsonKey = 'tile';
    urlPrefix = '/tile/';
  } else if (path.includes('cabinet')) {
    productType = 'cabinet';
    productLabel = 'Cabinets';
    jsonPath = '/data/cabinets.json';
    jsonKey = 'cabinets';
    urlPrefix = '/cabinets/';
  } else if (path.includes('sink')) {
    productType = 'sink';
    productLabel = 'Sinks';
    jsonPath = '/data/sinks.json';
    jsonKey = 'sinks';
    urlPrefix = '/sinks/';
  } else if (path.includes('shop')) {
    productType = 'shop';
    productLabel = 'Products';
    // Shop loads products dynamically via Shopify API
    jsonPath = null;
  }

  // Wait for DOM
  document.addEventListener('DOMContentLoaded', init);

  // For shop: wait for dynamic products to load
  function waitForShopProducts(callback, maxWait = 10000) {
    const startTime = Date.now();

    function check() {
      const grid = document.querySelector('.shop-product-grid');
      const products = grid ? grid.querySelectorAll('.shop-product-card') : [];

      if (products.length > 0) {
        callback();
      } else if (Date.now() - startTime < maxWait) {
        setTimeout(check, 300);
      } else {
        console.log('Swipe Cards: Shop products not found within timeout');
      }
    }

    check();
  }

  let cards = [];
  let currentIndex = 0;
  let swipeHistory = [];
  let startX, startY, currentX, currentY;
  let isDragging = false;

  // Get ALL favorites combined from unified system
  function getFavorites() {
    if (window.SGFavorites) {
      const allFavs = window.SGFavorites.getAll();
      const combined = [];
      Object.keys(allFavs).forEach(type => {
        const items = allFavs[type] || [];
        items.forEach(item => {
          combined.push({ ...item, productType: type });
        });
      });
      return combined;
    }
    // Fallback to localStorage
    const types = ['countertop', 'flooring', 'tile', 'cabinet', 'sink', 'shop'];
    const combined = [];
    types.forEach(type => {
      try {
        const items = JSON.parse(localStorage.getItem(`sg_favorites_${type}`)) || [];
        items.forEach(item => {
          combined.push({ ...item, productType: type });
        });
      } catch (e) {}
    });
    try {
      const unified = JSON.parse(localStorage.getItem('sg_all_favorites')) || {};
      Object.keys(unified).forEach(type => {
        (unified[type] || []).forEach(item => {
          if (!combined.some(c => c.title === item.title)) {
            combined.push({ ...item, productType: type });
          }
        });
      });
    } catch (e) {}
    return combined;
  }

  function getFavoritesByType() {
    if (window.SGFavorites) {
      return window.SGFavorites.getByType(productType) || [];
    }
    try {
      return JSON.parse(localStorage.getItem(`sg_favorites_${productType}`)) || [];
    } catch (e) {
      return [];
    }
  }

  function isFavorited(product) {
    const favs = getFavorites();
    return favs.some(f => f.title === product.title || f.url === product.href);
  }

  async function init() {
    // For shop pages, wait for dynamic products to load
    if (productType === 'shop') {
      waitForShopProducts(() => {
        const shopGrid = document.querySelector('.shop-product-grid');
        if (shopGrid) {
          parseShopProducts(shopGrid);
        }

        if (cards.length === 0) return;
        console.log('Swipe Cards:', cards.length, productLabel, 'ready');
        showIntroOverlay();
      });
      return;
    }

    // Try to load from JSON first
    if (jsonPath) {
      try {
        const response = await fetch(jsonPath);
        if (response.ok) {
          const data = await response.json();
          const items = data[jsonKey] || data.countertops || data.flooring || data.tile || [];
          parseJSONProducts(items);
          console.log(`Swipe Cards: Loaded ${cards.length} ${productLabel} from JSON`);
        }
      } catch (error) {
        console.warn('Swipe Cards: JSON load failed, falling back to DOM', error);
      }
    }

    // Fallback to DOM scraping if JSON failed or not available
    if (cards.length === 0) {
      const materialsList = document.querySelector('.materials_list');
      const shopGrid = document.querySelector('.shop-product-grid');

      if (materialsList) {
        parseWebflowProducts(materialsList);
      } else if (shopGrid) {
        parseShopProducts(shopGrid);
      }
    }

    if (cards.length === 0) return;

    console.log('Swipe Cards:', cards.length, productLabel, 'ready');
    showIntroOverlay();
  }

  // Parse products from JSON data
  function parseJSONProducts(items) {
    items.forEach((item, index) => {
      // Skip items without images
      if (!item.primaryImage && !item.image) return;

      let specs = {};
      let description = '';

      if (productType === 'flooring') {
        specs = {
          material: item.material || item.type || '',
          color: item.primaryColor || item.color || '',
          thickness: item.thickness || '',
          wearLayer: item.wearLayer || '',
          shadeVariations: item.shadeVariations || ''
        };
        description = generateDescription('flooring', item.name, specs);
      } else if (productType === 'countertop') {
        specs = {
          material: item.type || item.material || '',
          brand: item.brand || '',
          color: item.primaryColor || item.color || '',
          style: item.style || ''
        };
        description = generateDescription('countertop', item.name, specs);
      } else if (productType === 'tile') {
        specs = {
          material: item.material || item.type || '',
          color: item.primaryColor || item.color || '',
          style: item.style || '',
          finish: item.finish || ''
        };
        description = generateDescription('tile', item.name, specs);
      } else {
        specs = {
          material: item.type || item.material || '',
          brand: item.brand || '',
          color: item.primaryColor || item.color || ''
        };
        description = generateDescription(productType, item.name, specs);
      }

      // Check availability from JSON data or by brand
      const itemName = (item.name || '').toLowerCase();
      const itemBrand = (specs.brand || '').toLowerCase();
      const unavailableBrands = ['radianz', 'samsung radianz'];
      const isAvailable = item.available !== false &&
        item.inStock !== false &&
        !unavailableBrands.some(b => itemName.includes(b) || itemBrand.includes(b));

      cards.push({
        id: index,
        href: urlPrefix + (item.slug || item.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')),
        image: item.primaryImage || item.image || '',
        secondaryImage: item.secondaryImage || '',
        title: item.name || 'Product',
        price: item.price || '',
        description: description,
        available: isAvailable,
        ...specs
      });
    });
  }

  // Fallback: Parse products from DOM (for pages without JSON)
  function parseWebflowProducts(container) {
    const items = container.querySelectorAll('.w-dyn-item, .materials_item');

    items.forEach((item, index) => {
      if (!item.querySelector('img')) return;

      const link = item.querySelector('a[href]');
      const images = item.querySelectorAll('img');

      let title = item.querySelector('[fs-cmsfilter-field="Keyword"]') ||
                  item.querySelector('.materials_name') ||
                  item.querySelector('h3') ||
                  item.querySelector('h4');

      let specs = {};

      if (productType === 'flooring') {
        specs = {
          material: getText(item, '[fs-cmsfilter-field="material"]'),
          color: getText(item, '[fs-cmsfilter-field="main-color"]'),
          thickness: getText(item, '[fs-cmsfilter-field="thickness"]'),
          wearLayer: getText(item, '[fs-cmsfilter-field="wear-layer"]'),
          shadeVariations: getText(item, '[fs-cmsfilter-field="shade-variations"]')
        };
      } else if (productType === 'countertop') {
        specs = {
          material: getText(item, '[fs-cmsfilter-field="Material"]'),
          brand: getText(item, '[fs-cmsfilter-field="Brand"]'),
          color: getText(item, '[fs-cmsfilter-field="Main Color"]'),
          style: getText(item, '[fs-cmsfilter-field="Style"]')
        };
      } else if (productType === 'tile') {
        specs = {
          material: getText(item, '[fs-cmsfilter-field="material"]') || getText(item, '[fs-cmsfilter-field="Material"]'),
          color: getText(item, '[fs-cmsfilter-field="Main Color"]') || getText(item, '[fs-cmsfilter-field="color"]'),
          style: getText(item, '[fs-cmsfilter-field="style"]') || getText(item, '[fs-cmsfilter-field="Style"]'),
          finish: getText(item, '[fs-cmsfilter-field="finish"]') || getText(item, '[fs-cmsfilter-field="Finish"]')
        };
      } else {
        specs = {
          material: getText(item, '[fs-cmsfilter-field="Material"]') || getText(item, '[fs-cmsfilter-field="material"]'),
          color: getText(item, '[fs-cmsfilter-field="Main Color"]') || getText(item, '[fs-cmsfilter-field="color"]'),
          brand: getText(item, '[fs-cmsfilter-field="Brand"]') || getText(item, '[fs-cmsfilter-field="brand"]')
        };
      }

      let imageUrl = '';
      if (images.length > 0) {
        const primaryImg = Array.from(images).find(img => img.classList.contains('is-primary'));
        imageUrl = primaryImg ? primaryImg.src : (images[1] || images[0]).src;
      }

      const priceEl = item.querySelector('[fs-cmsfilter-field="price"], .materials_item-pricing, .product-price');
      const priceText = priceEl ? priceEl.textContent.trim() : '';

      const productTitle = title ? title.textContent.trim() : productLabel.slice(0, -1);
      let description = generateDescription(productType, productTitle, specs);

      // Check availability - look for indicators in DOM
      const itemText = item.textContent.toLowerCase();
      const itemClasses = item.className.toLowerCase();
      const isUnavailable =
        itemText.includes('not available') ||
        itemText.includes('unavailable') ||
        itemText.includes('out of stock') ||
        itemText.includes('discontinued') ||
        itemClasses.includes('unavailable') ||
        itemClasses.includes('out-of-stock') ||
        item.querySelector('.unavailable, .out-of-stock, [data-unavailable="true"]') !== null;

      // Check for specific brands known to be unavailable
      const titleLower = productTitle.toLowerCase();
      const brandLower = (specs.brand || '').toLowerCase();
      const unavailableBrands = ['radianz', 'samsung radianz'];
      const isBrandUnavailable = unavailableBrands.some(b =>
        titleLower.includes(b) || brandLower.includes(b)
      );

      cards.push({
        id: index,
        href: link ? link.href : '#',
        image: imageUrl,
        title: productTitle,
        price: priceText,
        description: description,
        available: !isUnavailable && !isBrandUnavailable,
        ...specs
      });
    });
  }

  function parseShopProducts(container) {
    const items = container.querySelectorAll('.shop-product-card');

    items.forEach((item, index) => {
      const link = item.querySelector('a[href]');
      const image = item.querySelector('img');
      const title = item.querySelector('.shop-product-title, h3');
      const priceEl = item.querySelector('.shop-product-price');
      const buyBtn = item.querySelector('.shop-product-btn.buy-now');

      // Extract onclick data from buy button for cart functionality
      let productId = '';
      let priceNum = 0;
      if (buyBtn) {
        const onclick = buyBtn.getAttribute('onclick') || '';
        const match = onclick.match(/buyNow\('([^']+)',\s*'([^']+)',\s*([\d.]+)/);
        if (match) {
          productId = match[1];
          priceNum = parseFloat(match[3]);
        }
      }

      const priceText = priceEl ? priceEl.textContent.trim() : '';
      const titleText = title ? title.textContent.trim() : 'Product';
      const imageUrl = image ? image.src : '';
      const href = link ? link.href : '#';

      // Generate shop description
      let description = '';
      if (titleText.toLowerCase().includes('sample')) {
        description = 'Get a physical sample to see the color and texture in your home before deciding.';
      } else if (titleText.toLowerCase().includes('remnant')) {
        description = 'Discounted leftover piece from a previous project. Perfect for smaller applications.';
      } else if (titleText.toLowerCase().includes('sink')) {
        description = 'Quality sink for your kitchen or bathroom. Professional installation available.';
      } else if (titleText.toLowerCase().includes('edge')) {
        description = 'Decorative edge profile upgrade for your countertop project.';
      } else {
        description = 'Available for purchase online. Free consultation with every order.';
      }

      cards.push({
        id: index,
        productId: productId,
        href: href,
        image: imageUrl,
        title: titleText,
        price: priceText,
        priceNum: priceNum,
        description: description,
        isShop: true
      });
    });
  }

  function getText(container, selector) {
    const el = container.querySelector(selector);
    return el ? el.textContent.trim() : '';
  }

  // Generate smart descriptions based on product type and attributes
  function generateDescription(type, title, specs) {
    const color = (specs.color || specs.primaryColor || '').trim();
    const material = (specs.material || '').trim();
    const brand = (specs.brand || '').trim();
    const style = (specs.style || '').trim();
    const titleLower = title.toLowerCase();

    if (type === 'flooring') {
      const thickness = (specs.thickness || '').trim();
      const wearLayer = (specs.wearLayer || '').trim();
      if (wearLayer && thickness) {
        return `Premium waterproof LVP with ${wearLayer} wear layer and realistic wood texture. Perfect for kitchens, bathrooms, and high-traffic areas.`;
      }
      if (color) {
        return `Luxury vinyl plank flooring in beautiful ${color.toLowerCase()} tones. 100% waterproof, scratch-resistant, and easy to install.`;
      }
      return `Luxury vinyl plank flooring with realistic wood look. Waterproof, durable, and perfect for any room in your home.`;
    }

    if (type === 'countertop') {
      const mat = material.toLowerCase();
      if (mat.includes('quartz')) {
        return `Engineered quartz countertop${brand ? ' by ' + brand : ''}. Non-porous, stain-resistant, and maintenance-free with lifetime durability.`;
      }
      if (mat.includes('granite')) {
        return `Natural granite countertop with unique patterns. Heat-resistant, durable, and adds timeless elegance to any kitchen.`;
      }
      if (mat.includes('marble')) {
        return `Elegant marble surface with classic veining. Perfect for creating a luxurious kitchen or bathroom aesthetic.`;
      }
      if (mat.includes('quartzite')) {
        return `Natural quartzite countertop combining marble beauty with granite durability. Heat and scratch resistant.`;
      }
      if (mat.includes('porcelain') || mat.includes('dekton')) {
        return `Ultra-compact surface that's UV stable, scratch-proof, and heat resistant. Perfect for indoor and outdoor use.`;
      }
      return `Premium countertop surface with professional installation available. Schedule a free in-home estimate today.`;
    }

    if (type === 'tile') {
      const finish = (specs.finish || '').trim();
      if (titleLower.includes('mosaic')) {
        return `Decorative mosaic tile perfect for backsplashes, accent walls, and creative designs. Easy to install and maintain.`;
      }
      if (finish) {
        return `Beautiful tile with ${finish.toLowerCase()} finish. Ideal for floors, walls, showers, and backsplashes.`;
      }
      if (color) {
        return `Stylish ${color.toLowerCase()} tile for floors, walls, and backsplashes. Durable, easy to clean, and timeless design.`;
      }
      return `Quality tile for walls, floors, and backsplashes. Durable, easy to maintain, and available in various sizes.`;
    }

    return `Quality ${type} available at our showroom. Schedule a free consultation to see samples and get expert advice.`;
  }

  function showIntroOverlay() {
    const overlay = document.createElement('div');
    overlay.className = 'swipe-intro-overlay';
    overlay.innerHTML = `
      <div class="swipe-intro-content">
        <div class="swipe-intro-brand">
          <img src="/images/sg-house-icon-gold.svg" alt="Surprise Granite" class="intro-brand-icon">
        </div>
        <h2 class="swipe-intro-title">Explore ${cards.length} ${productLabel}</h2>
        <p class="swipe-intro-subtitle">Choose how you'd like to browse</p>
        <div class="swipe-intro-options">
          <div class="swipe-option-card" onclick="window.startSwipeMode()">
            <div class="option-icon swipe-icon">
              <svg viewBox="0 0 24 24" fill="none" width="32" height="32">
                <path d="M12 2L4 7l8 5 8-5-8-5z" fill="currentColor" opacity="0.3"/>
                <path d="M4 12l8 5 8-5" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
                <path d="M4 17l8 5 8-5" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
              </svg>
            </div>
            <div class="option-content">
              <h3 class="option-title">Swipe Mode</h3>
              <p class="option-desc">Swipe right to save favorites, left to skip. Discover products one at a time.</p>
            </div>
            <div class="option-arrow">
              <svg viewBox="0 0 24 24" width="20" height="20" fill="none">
                <path d="M9 18l6-6-6-6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
            </div>
          </div>
          <div class="swipe-option-card" onclick="window.startScrollMode()">
            <div class="option-icon grid-icon">
              <svg viewBox="0 0 24 24" fill="none" width="32" height="32">
                <rect x="3" y="3" width="7" height="7" rx="1.5" fill="currentColor"/>
                <rect x="14" y="3" width="7" height="7" rx="1.5" fill="currentColor"/>
                <rect x="3" y="14" width="7" height="7" rx="1.5" fill="currentColor"/>
                <rect x="14" y="14" width="7" height="7" rx="1.5" fill="currentColor"/>
              </svg>
            </div>
            <div class="option-content">
              <h3 class="option-title">Browse Grid</h3>
              <p class="option-desc">View all products in a scrollable grid. Filter and compare side by side.</p>
            </div>
            <div class="option-arrow">
              <svg viewBox="0 0 24 24" width="20" height="20" fill="none">
                <path d="M9 18l6-6-6-6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
            </div>
          </div>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);
  }

  window.startSwipeMode = function() {
    const overlay = document.querySelector('.swipe-intro-overlay');
    if (overlay) overlay.remove();

    const materialsList = document.querySelector('.materials_list');
    if (materialsList) {
      materialsList.classList.add('swipe-enabled');
    }

    document.body.classList.add('swipe-mode');
    createSwipeUI();
    showSwipeInstructions();
  };

  window.startScrollMode = function() {
    const overlay = document.querySelector('.swipe-intro-overlay');
    if (overlay) overlay.remove();
  };

  function createSwipeUI() {
    const favs = getFavorites();
    const lastFav = favs.length > 0 ? favs[favs.length - 1] : null;

    const container = document.createElement('div');
    container.className = 'swipe-cards-container';
    container.innerHTML = `
      <div class="swipe-topbar">
        <button class="swipe-scroll-btn" onclick="window.exitSwipeMode()">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <rect x="3" y="3" width="7" height="7" rx="2"/><rect x="14" y="3" width="7" height="7" rx="2"/>
            <rect x="3" y="14" width="7" height="7" rx="2"/><rect x="14" y="14" width="7" height="7" rx="2"/>
          </svg>
          <span>Scroll</span>
        </button>
        <div class="swipe-topbar-brand">
          <div class="brand-logo-row">
            <svg class="brand-house-icon" viewBox="0 0 122 125" fill="#f9cb00" width="24" height="24">
              <path d="M60.534,9.987l51.884,29.956v76.23H8.65V39.943L60.534,9.987m0-9.987L0,34.95v89.874H121.073V34.95L60.534,0Z"/>
              <path d="M122.416,65.093,69.456,34.06,61.3,39.547l52.466,30.539v69.9h8.65Z" transform="translate(-27.288 -15.162)"/>
              <path d="M75.038,151.845h-8.65V96.92L13.15,66.182,21.878,60.7l53.16,31.227Z" transform="translate(-5.854 -27.021)"/>
              <path d="M48.817,127.171,12.53,106.22v9.987l27.642,15.957v39.943h8.645Z" transform="translate(-5.578 -47.284)"/>
            </svg>
            <span class="brand-text-white">Surprise Granite</span>
          </div>
          <span class="brand-tagline">Marble & Quartz</span>
        </div>
        <button class="swipe-favorites-btn" onclick="window.toggleFavoritesDrawer()">
          <div class="fav-thumb-wrap">
            ${lastFav ? `<img src="${lastFav.image}" alt="" class="fav-thumb-img">` : '<div class="fav-thumb-empty"></div>'}
            <svg class="fav-thumb-heart" viewBox="0 0 24 24"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>
          </div>
          ${favs.length > 0 ? `<span class="fav-count">${favs.length}</span>` : ''}
        </button>
      </div>
      <div class="swipe-progress-bar">
        <div class="swipe-progress-fill" id="swipeProgressFill"></div>
        <span class="swipe-progress-text" id="swipeProgressText">1 of ${cards.length}</span>
      </div>
      <div class="swipe-filter-chips" id="swipeFilterChips"></div>
      <div class="swipe-card-stack"></div>
      <div class="swipe-action-buttons">
        <button class="swipe-action-btn undo" onclick="window.undoSwipe()" title="Undo">
          <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#000" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="display:block;width:28px!important;height:28px!important;min-width:28px;min-height:28px;">
            <path d="M3 9l6-6M3 9l6 6M3 9h12a6 6 0 0 1 0 12h-3"/>
          </svg>
        </button>
        <button class="swipe-action-btn nope" onclick="window.swipeNope()" title="Skip">
          <svg xmlns="http://www.w3.org/2000/svg" width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round" style="display:block;width:36px!important;height:36px!important;min-width:36px;min-height:36px;">
            <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </button>
        <button class="swipe-action-btn like" onclick="window.swipeLike()" title="Love">
          <svg xmlns="http://www.w3.org/2000/svg" width="36" height="36" viewBox="0 0 24 24" fill="#fff" style="display:block;width:36px!important;height:36px!important;min-width:36px;min-height:36px;">
            <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
          </svg>
        </button>
      </div>
    `;
    document.body.appendChild(container);

    createFavoritesDrawer();
    createFilterChips();
    preloadImages();
    renderCards();
    updateProgress();
  }

  function preloadImages() {
    const upcoming = cards.slice(currentIndex, currentIndex + 8);
    upcoming.forEach(card => {
      if (card.image) {
        const img = new Image();
        img.src = card.image;
      }
    });
  }

  function updateProgress() {
    const progressFill = document.getElementById('swipeProgressFill');
    const progressText = document.getElementById('swipeProgressText');

    if (progressFill && progressText) {
      const progress = cards.length > 0 ? ((currentIndex + 1) / cards.length) * 100 : 0;
      progressFill.style.width = `${Math.min(progress, 100)}%`;

      const remaining = Math.max(0, cards.length - currentIndex);
      if (remaining === 0) {
        progressText.textContent = 'All done!';
      } else {
        progressText.textContent = `${currentIndex + 1} of ${cards.length}`;
      }
    }
  }

  function createFilterChips() {
    const container = document.getElementById('swipeFilterChips');
    if (!container) return;

    const types = [...new Set(cards.map(c => c.material || c.type).filter(Boolean))];

    if (types.length <= 1) {
      container.style.display = 'none';
      return;
    }

    let chipsHtml = `<button class="swipe-filter-chip active" data-filter="all">All</button>`;
    types.slice(0, 5).forEach(type => {
      chipsHtml += `<button class="swipe-filter-chip" data-filter="${type}">${type}</button>`;
    });

    container.innerHTML = chipsHtml;

    container.querySelectorAll('.swipe-filter-chip').forEach(chip => {
      chip.addEventListener('click', () => {
        container.querySelectorAll('.swipe-filter-chip').forEach(c => c.classList.remove('active'));
        chip.classList.add('active');
        filterCards(chip.dataset.filter);
      });
    });
  }

  let originalCards = [];

  function filterCards(filter) {
    if (originalCards.length === 0) {
      originalCards = [...cards];
    }

    if (filter === 'all') {
      cards = [...originalCards];
    } else {
      cards = originalCards.filter(c => (c.material || c.type) === filter);
    }

    currentIndex = 0;
    swipeHistory = [];
    renderCards();
    updateProgress();
    triggerHaptic('light');
  }

  function triggerHaptic(type = 'light') {
    if ('vibrate' in navigator) {
      switch(type) {
        case 'light': navigator.vibrate(10); break;
        case 'medium': navigator.vibrate(25); break;
        case 'heavy': navigator.vibrate([30, 10, 30]); break;
        case 'success': navigator.vibrate([10, 50, 20]); break;
        case 'error': navigator.vibrate([50, 30, 50]); break;
      }
    }
  }

  function renderCards() {
    const stack = document.querySelector('.swipe-card-stack');
    if (!stack) return;

    stack.innerHTML = '';

    const cardsToShow = cards.slice(currentIndex, currentIndex + 4);

    if (cardsToShow.length === 0) {
      showEmptyState();
      return;
    }

    cardsToShow.forEach((card, i) => {
      const cardEl = document.createElement('div');
      cardEl.className = 'swipe-card';
      cardEl.dataset.index = currentIndex + i;

      let specsHtml = '';
      if (productType === 'flooring') {
        specsHtml = `
          ${card.thickness ? `<div class="swipe-card-spec"><span class="spec-label">Thickness</span><span class="spec-value">${card.thickness}</span></div>` : ''}
          ${card.wearLayer ? `<div class="swipe-card-spec"><span class="spec-label">Wear Layer</span><span class="spec-value">${card.wearLayer}</span></div>` : ''}
          ${card.color ? `<div class="swipe-card-spec"><span class="spec-label">Color</span><span class="spec-value">${card.color}</span></div>` : ''}
          ${card.shadeVariations ? `<div class="swipe-card-spec"><span class="spec-label">Shade</span><span class="spec-value">${card.shadeVariations}</span></div>` : ''}
        `;
      } else if (productType === 'countertop') {
        specsHtml = `
          ${card.brand ? `<div class="swipe-card-spec"><span class="spec-label">Brand</span><span class="spec-value">${card.brand}</span></div>` : ''}
          ${card.color ? `<div class="swipe-card-spec"><span class="spec-label">Color</span><span class="spec-value">${card.color}</span></div>` : ''}
          ${card.style ? `<div class="swipe-card-spec"><span class="spec-label">Style</span><span class="spec-value">${card.style}</span></div>` : ''}
        `;
      } else if (productType === 'tile') {
        specsHtml = `
          ${card.material ? `<div class="swipe-card-spec"><span class="spec-label">Material</span><span class="spec-value">${card.material}</span></div>` : ''}
          ${card.style ? `<div class="swipe-card-spec"><span class="spec-label">Style</span><span class="spec-value">${card.style}</span></div>` : ''}
          ${card.finish ? `<div class="swipe-card-spec"><span class="spec-label">Finish</span><span class="spec-value">${card.finish}</span></div>` : ''}
          ${card.color ? `<div class="swipe-card-spec"><span class="spec-label">Color</span><span class="spec-value">${card.color}</span></div>` : ''}
        `;
      } else if (productType === 'shop') {
        specsHtml = card.price ? `<div class="swipe-card-spec full-width"><span class="spec-label">Price</span><span class="spec-value">${card.price}</span></div>` : '';
      } else {
        specsHtml = `
          ${card.brand ? `<div class="swipe-card-spec"><span class="spec-label">Brand</span><span class="spec-value">${card.brand}</span></div>` : ''}
          ${card.color ? `<div class="swipe-card-spec"><span class="spec-label">Color</span><span class="spec-value">${card.color}</span></div>` : ''}
        `;
      }

      let badgesHtml = '';
      const isUnavailable = card.available === false;
      const isPremiumBrand = card.brand && ['Cambria', 'Caesarstone', 'Silestone', 'Dekton', 'Neolith'].some(b => card.brand.includes(b));
      const isNew = Math.random() < 0.15;

      // Show unavailable badge first (highest priority)
      if (isUnavailable) {
        badgesHtml += '<span class="swipe-card-badge badge-unavailable">Not Available</span>';
      } else {
        // Only show other badges if available
        if (isPremiumBrand) {
          badgesHtml += '<span class="swipe-card-badge badge-premium">Premium</span>';
        }
        if (isNew) {
          badgesHtml += '<span class="swipe-card-badge badge-new">New</span>';
        }
      }

      // Shop cards get price and Buy Now button
      const isShopCard = productType === 'shop' || card.isShop;

      // Build vendor/brand overlay
      const vendorName = card.brand || card.vendor || '';
      const vendorOverlay = vendorName ? `
        <div class="swipe-card-vendor">
          <span class="vendor-label">by</span>
          <span class="vendor-name">${vendorName}</span>
        </div>
      ` : '';

      cardEl.innerHTML = `
        ${badgesHtml ? `<div class="swipe-card-badges">${badgesHtml}</div>` : ''}
        <img class="swipe-card-image" src="${card.image}" alt="${card.title}" loading="lazy">
        ${vendorOverlay}
        <a href="${card.href}" class="swipe-card-view-btn" target="_blank">
          <svg viewBox="0 0 24 24"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
          <span>View</span>
        </a>
        ${isShopCard ? `
          <button class="swipe-card-buy-btn" onclick="event.stopPropagation(); window.swipeBuyNow('${card.productId}', '${(card.title || '').replace(/'/g, "\\'")}', ${card.priceNum || 0}, '${card.image}', '${card.href}')">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/></svg>
            <span>Buy Now</span>
          </button>
        ` : ''}
        <div class="swipe-emoji-indicator like">
          <svg viewBox="0 0 24 24"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>
        </div>
        <div class="swipe-emoji-indicator nope">
          <svg viewBox="0 0 24 24" fill="none"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </div>
        <div class="swipe-card-content">
          <div class="swipe-card-header">
            <h3 class="swipe-card-title">${card.title}</h3>
            ${isShopCard && card.price ? `<span class="swipe-card-price">${card.price}</span>` : ''}
            ${!isShopCard && card.material ? `<span class="swipe-card-material">${card.material}</span>` : ''}
          </div>
          ${card.description ? `<p class="swipe-card-description">${card.description}</p>` : ''}
        </div>
      `;

      if (i === 0) {
        setupCardInteraction(cardEl);
      }

      stack.appendChild(cardEl);
    });
  }

  function setupCardInteraction(cardEl) {
    cardEl.addEventListener('touchstart', handleTouchStart, { passive: true });
    cardEl.addEventListener('touchmove', handleTouchMove, { passive: false });
    cardEl.addEventListener('touchend', handleTouchEnd);

    let lastTap = 0;
    cardEl.addEventListener('touchend', (e) => {
      const now = Date.now();
      if (now - lastTap < 300) {
        showDoubleTapHeart(cardEl);
        window.swipeLike();
      }
      lastTap = now;
    });
  }

  let velocityX = 0;
  let lastMoveTime = 0;
  let lastX = 0;

  function handleTouchStart(e) {
    startX = e.touches[0].clientX;
    startY = e.touches[0].clientY;
    currentX = startX;
    currentY = startY;
    lastX = startX;
    lastMoveTime = Date.now();
    velocityX = 0;
    isDragging = true;
    this.classList.add('dragging');
    this.style.transition = 'none';
  }

  function handleTouchMove(e) {
    if (!isDragging) return;

    const now = Date.now();
    const dt = now - lastMoveTime;

    currentX = e.touches[0].clientX;
    currentY = e.touches[0].clientY;

    if (dt > 0) {
      velocityX = (currentX - lastX) / dt * 16;
    }

    lastX = currentX;
    lastMoveTime = now;

    const deltaX = currentX - startX;

    e.preventDefault();

    // Pure horizontal swipe - no rotation, just slide left/right
    this.style.transform = `translateX(calc(-50% + ${deltaX}px))`;

    const threshold = 40;
    if (deltaX > threshold) {
      this.classList.add('swiping-right');
      this.classList.remove('swiping-left');
    } else if (deltaX < -threshold) {
      this.classList.add('swiping-left');
      this.classList.remove('swiping-right');
    } else {
      this.classList.remove('swiping-left', 'swiping-right');
    }
  }

  function handleTouchEnd() {
    if (!isDragging) return;
    isDragging = false;
    this.classList.remove('dragging');

    const deltaX = currentX - startX;
    const projectedX = deltaX + velocityX * 5;
    const threshold = 80;
    const velocityThreshold = 3;

    if (projectedX > threshold || velocityX > velocityThreshold) {
      // Swipe right - pure horizontal exit
      this.style.transition = 'transform 0.3s cubic-bezier(0.4, 0, 0.2, 1)';
      this.style.transform = `translateX(120vw)`;
      setTimeout(() => handleLike(), 250);
    } else if (projectedX < -threshold || velocityX < -velocityThreshold) {
      // Swipe left - pure horizontal exit
      this.style.transition = 'transform 0.3s cubic-bezier(0.4, 0, 0.2, 1)';
      this.style.transform = `translateX(-120vw)`;
      setTimeout(() => handleNope(), 250);
    } else {
      // Snap back to center
      this.style.transition = 'transform 0.4s cubic-bezier(0.34, 1.56, 0.64, 1)';
      this.style.transform = 'translateX(-50%)';
      this.classList.remove('swiping-left', 'swiping-right');
    }
  }

  function handleLike() {
    const card = cards[currentIndex];
    swipeHistory.push({ index: currentIndex, action: 'like' });

    if (window.SGFavorites) {
      window.SGFavorites.add({
        title: card.title,
        url: card.href,
        image: card.image,
        material: card.material || '',
        color: card.color || '',
        description: card.description || ''
      }, productType);
    } else {
      const favs = getFavorites();
      if (!favs.some(f => f.title === card.title)) {
        favs.push(card);
        localStorage.setItem(`sg_favorites_${productType}`, JSON.stringify(favs));
      }
    }

    currentIndex++;
    triggerHaptic('success');
    preloadImages();
    renderCards();
    updateFavoritesUI();
    updateProgress();
  }

  function handleNope() {
    swipeHistory.push({ index: currentIndex, action: 'nope' });
    currentIndex++;
    triggerHaptic('light');
    preloadImages();
    renderCards();
    updateProgress();
  }

  window.swipeLike = function() {
    const topCard = document.querySelector('.swipe-card');
    if (topCard) {
      topCard.classList.add('swipe-out-right');
      setTimeout(() => handleLike(), 200);
    }
  };

  window.swipeNope = function() {
    const topCard = document.querySelector('.swipe-card');
    if (topCard) {
      topCard.classList.add('swipe-out-left');
      setTimeout(() => handleNope(), 200);
    }
  };

  window.undoSwipe = function() {
    if (swipeHistory.length === 0) return;

    const last = swipeHistory.pop();
    currentIndex = last.index;

    if (last.action === 'like') {
      const card = cards[currentIndex];
      if (window.SGFavorites) {
        window.SGFavorites.remove(card.title, productType);
      } else {
        let favs = getFavorites();
        favs = favs.filter(f => f.title !== card.title);
        localStorage.setItem(`sg_favorites_${productType}`, JSON.stringify(favs));
      }
    }

    renderCards();
    updateFavoritesUI();
  };

  function updateFavoritesUI() {
    const favs = getFavorites();
    const thumbWrap = document.querySelector('.fav-thumb-wrap');
    const favBtn = document.querySelector('.swipe-favorites-btn');

    if (thumbWrap) {
      const lastFav = favs.length > 0 ? favs[favs.length - 1] : null;
      thumbWrap.innerHTML = `
        ${lastFav ? `<img src="${lastFav.image}" alt="" class="fav-thumb-img">` : '<div class="fav-thumb-empty"></div>'}
        <svg class="fav-thumb-heart" viewBox="0 0 24 24"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>
      `;
    }

    if (favBtn) {
      let countEl = favBtn.querySelector('.fav-count');
      if (favs.length > 0) {
        if (!countEl) {
          countEl = document.createElement('span');
          countEl.className = 'fav-count';
          favBtn.appendChild(countEl);
        }
        countEl.textContent = favs.length;
      } else if (countEl) {
        countEl.remove();
      }
    }

    updateFavoritesDrawer();
  }

  function showDoubleTapHeart(cardEl) {
    const heart = document.createElement('div');
    heart.className = 'double-tap-heart';
    heart.innerHTML = '<svg viewBox="0 0 24 24" fill="#ff4757"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>';
    cardEl.appendChild(heart);
    setTimeout(() => heart.remove(), 600);
  }

  function showSwipeInstructions() {
    const toast = document.createElement('div');
    toast.className = 'swipe-instructions';
    toast.innerHTML = `
      <div class="swipe-hint left">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
          <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
        </svg>
        <span>Skip</span>
      </div>
      <div class="swipe-hint right">
        <svg viewBox="0 0 24 24">
          <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
        </svg>
        <span>Save</span>
      </div>
    `;
    document.body.appendChild(toast);
    setTimeout(() => {
      toast.classList.add('fade-out');
      setTimeout(() => toast.remove(), 400);
    }, 2500);
  }

  function showEmptyState() {
    const stack = document.querySelector('.swipe-card-stack');
    if (!stack) return;

    const favs = getFavorites();
    const totalSwiped = currentIndex;
    const likedCount = swipeHistory.filter(h => h.action === 'like').length;

    stack.innerHTML = `
      <div class="swipe-empty">
        <div class="swipe-empty-icon">${favs.length > 0 ? '🎉' : '✨'}</div>
        <h3>${favs.length > 0 ? 'Great choices!' : 'You\'ve seen them all!'}</h3>
        <p class="swipe-empty-subtitle">${favs.length > 0
          ? `You saved ${favs.length} ${productLabel.toLowerCase()} to your favorites`
          : `You browsed ${totalSwiped} ${productLabel.toLowerCase()}`}</p>

        <div class="swipe-empty-stats">
          <div class="swipe-stat">
            <span class="swipe-stat-value">${totalSwiped}</span>
            <span class="swipe-stat-label">Viewed</span>
          </div>
          <div class="swipe-stat">
            <span class="swipe-stat-value">${likedCount}</span>
            <span class="swipe-stat-label">Saved</span>
          </div>
          <div class="swipe-stat">
            <span class="swipe-stat-value">${totalSwiped - likedCount}</span>
            <span class="swipe-stat-label">Skipped</span>
          </div>
        </div>

        <div class="swipe-empty-actions">
          ${favs.length > 0 ? `
            <button class="swipe-empty-btn primary" onclick="window.toggleFavoritesDrawer()">
              <svg viewBox="0 0 24 24" fill="currentColor" width="20" height="20"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>
              View Favorites
            </button>
            <a href="/get-a-free-estimate" class="swipe-empty-btn secondary">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="20" height="20"><path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2"/></svg>
              Get Free Quote
            </a>
          ` : `
            <button class="swipe-empty-btn primary" onclick="window.resetSwipe()">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="20" height="20"><path d="M3 12a9 9 0 109-9 9 9 0 00-9 9"/><path d="M3 3v6h6"/></svg>
              Browse Again
            </button>
            <button class="swipe-empty-btn secondary" onclick="window.exitSwipeMode()">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="20" height="20"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg>
              View Grid
            </button>
          `}
        </div>
      </div>
    `;

    triggerHaptic('success');
  }

  window.shareCard = function(title, url, image) {
    const shareData = {
      title: title + ' - Surprise Granite',
      text: `Check out ${title} at Surprise Granite!`,
      url: url
    };

    if (navigator.share && navigator.canShare && navigator.canShare(shareData)) {
      navigator.share(shareData).catch(() => {});
      triggerHaptic('medium');
    } else {
      navigator.clipboard.writeText(url).then(() => {
        showShareToast('Link copied to clipboard!');
        triggerHaptic('medium');
      }).catch(() => {
        window.open(url, '_blank');
      });
    }
  };

  // Buy Now for shop products
  window.swipeBuyNow = function(id, name, price, image, href) {
    if (window.SgCart && typeof window.SgCart.addToCart === 'function') {
      window.SgCart.addToCart({
        id: id,
        name: name,
        price: parseFloat(price) || 0,
        image: image,
        variant: '',
        quantity: 1,
        category: 'shop',
        href: href
      });

      triggerHaptic('success');
      showBuyNotification(name);

      // Go to cart after short delay
      setTimeout(() => {
        window.location.href = '/cart/';
      }, 1500);
    } else if (typeof buyNow === 'function') {
      // Fallback to page's buyNow function
      buyNow(id, name, price, image, href);
    } else {
      // Last resort: go to product page
      window.location.href = href;
    }
  };

  function showBuyNotification(name) {
    const notification = document.createElement('div');
    notification.className = 'swipe-buy-notification';
    notification.innerHTML = `
      <svg viewBox="0 0 24 24" fill="none" width="24" height="24">
        <circle cx="12" cy="12" r="10" fill="#22c55e"/>
        <path d="M9 12l2 2 4-4" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>
      <span>${name} added to cart!</span>
    `;
    notification.style.cssText = `
      position: fixed;
      bottom: 200px;
      left: 50%;
      transform: translateX(-50%);
      background: linear-gradient(135deg, #1c1c1e 0%, #2d2d30 100%);
      color: #fff;
      padding: 16px 24px;
      border-radius: 16px;
      display: flex;
      align-items: center;
      gap: 12px;
      font-family: -apple-system, BlinkMacSystemFont, sans-serif;
      font-size: 15px;
      font-weight: 600;
      box-shadow: 0 10px 40px rgba(0,0,0,0.4);
      z-index: 1000001;
      animation: slideUpFade 0.3s ease-out;
      max-width: 90%;
      text-align: center;
    `;
    document.body.appendChild(notification);

    setTimeout(() => {
      notification.style.opacity = '0';
      notification.style.transition = 'opacity 0.3s ease';
      setTimeout(() => notification.remove(), 300);
    }, 1200);
  }

  function showShareToast(message) {
    const toast = document.createElement('div');
    toast.className = 'swipe-share-toast';
    toast.innerHTML = `
      <svg viewBox="0 0 24 24" fill="none" width="20" height="20">
        <circle cx="12" cy="12" r="10" fill="#22c55e"/>
        <path d="M9 12l2 2 4-4" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>
      <span>${message}</span>
    `;
    document.body.appendChild(toast);
    setTimeout(() => {
      toast.classList.add('fade-out');
      setTimeout(() => toast.remove(), 300);
    }, 2000);
  }

  window.resetSwipe = function() {
    currentIndex = 0;
    swipeHistory = [];
    if (originalCards.length > 0) {
      cards = [...originalCards];
    }
    renderCards();
    updateProgress();
    triggerHaptic('medium');
  };

  window.exitSwipeMode = function() {
    const container = document.querySelector('.swipe-cards-container');
    const drawer = document.querySelector('.favorites-drawer');
    const materialsList = document.querySelector('.materials_list');

    if (container) container.remove();
    if (drawer) drawer.remove();
    if (materialsList) materialsList.classList.remove('swipe-enabled');
    document.body.classList.remove('swipe-mode');
  };

  function createFavoritesDrawer() {
    const drawer = document.createElement('div');
    drawer.className = 'favorites-drawer';
    drawer.innerHTML = `
      <div class="favorites-drawer-handle">
        <span class="favorites-drawer-title">Favorites <span class="favorites-count">${getFavorites().length}</span></span>
      </div>
      <div class="favorites-content"></div>
      <div class="favorites-actions">
        <button class="favorites-view-all" onclick="window.location.href='/account/#favorites'">View All</button>
      </div>
    `;
    document.body.appendChild(drawer);

    const handle = drawer.querySelector('.favorites-drawer-handle');
    let drawerStartY = 0;
    let drawerCurrentY = 0;
    let isDraggingDrawer = false;

    handle.addEventListener('touchstart', (e) => {
      drawerStartY = e.touches[0].clientY;
      isDraggingDrawer = true;
      drawer.style.transition = 'none';
    }, { passive: true });

    handle.addEventListener('touchmove', (e) => {
      if (!isDraggingDrawer) return;
      drawerCurrentY = e.touches[0].clientY;
      const deltaY = drawerCurrentY - drawerStartY;
      if (deltaY > 0) {
        drawer.style.transform = `translateY(${deltaY}px)`;
      }
    }, { passive: true });

    handle.addEventListener('touchend', () => {
      if (!isDraggingDrawer) return;
      isDraggingDrawer = false;
      drawer.style.transition = 'transform 0.35s cubic-bezier(0.32, 0.72, 0, 1)';
      const deltaY = drawerCurrentY - drawerStartY;
      if (deltaY > 80) {
        drawer.classList.remove('open');
        drawer.style.transform = '';
      } else {
        drawer.style.transform = 'translateY(0)';
      }
    });

    handle.addEventListener('click', () => {
      window.toggleFavoritesDrawer();
    });

    updateFavoritesDrawer();
  }

  function updateFavoritesDrawer() {
    const favs = getFavorites();
    const content = document.querySelector('.favorites-drawer .favorites-content');
    const countEl = document.querySelector('.favorites-drawer .favorites-count');

    if (countEl) countEl.textContent = favs.length;

    if (!content) return;

    if (favs.length === 0) {
      content.innerHTML = '<p class="favorites-empty">Swipe right to save favorites</p>';
    } else {
      content.innerHTML = `
        <div class="favorites-list">
          ${favs.map(f => `
            <div class="favorite-item" data-title="${f.title}">
              <a href="${f.url || f.href}" target="_blank">
                <img src="${f.image}" alt="${f.title}" loading="lazy">
              </a>
              <span>${f.title}</span>
              <button class="favorite-remove" onclick="window.removeFavoriteItem('${f.title.replace(/'/g, "\\'")}')"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>
            </div>
          `).join('')}
        </div>
      `;
    }
  }

  window.removeFavoriteItem = function(title) {
    if (window.SGFavorites) {
      window.SGFavorites.remove(title, productType);
    } else {
      let favs = getFavorites();
      favs = favs.filter(f => f.title !== title);
      localStorage.setItem(`sg_favorites_${productType}`, JSON.stringify(favs));
    }
    updateFavoritesUI();
  };

  window.toggleFavoritesDrawer = function() {
    const drawer = document.querySelector('.favorites-drawer');
    if (drawer) {
      drawer.classList.toggle('open');
      updateFavoritesDrawer();
    }
  };

  window.requestSampleForCard = function(title, imageUrl) {
    const SAMPLE_PRICE = 25.00;
    const sampleName = title + ' - Sample';
    const sampleId = sampleName.toLowerCase().replace(/[^a-z0-9]+/g, '-');

    if (window.SgCart && typeof window.SgCart.addToCart === 'function') {
      window.SgCart.addToCart({
        id: sampleId,
        name: sampleName,
        price: SAMPLE_PRICE,
        image: imageUrl || 'https://cdn.prod.website-files.com/6456ce4476abb2d4f9fbad10/6456ce4576abb21a6cfbc44d_Msi-surfaces-surprise-quartz-calacatta-abezzo-quartz-slab.avif',
        quantity: 1,
        category: 'samples'
      });

      if (window.openCartDrawer) {
        window.openCartDrawer();
      }

      showSampleAddedNotification(sampleName);
    } else {
      window.location.href = '/shop/?collection=countertop-samples';
    }
  };

  function showSampleAddedNotification(name) {
    const existing = document.querySelector('.sample-added-notification');
    if (existing) existing.remove();

    const notification = document.createElement('div');
    notification.className = 'sample-added-notification';
    notification.innerHTML = `
      <svg viewBox="0 0 24 24" fill="none" width="24" height="24">
        <circle cx="12" cy="12" r="10" fill="#22c55e"/>
        <path d="M9 12l2 2 4-4" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>
      <span>${name} added to cart!</span>
    `;

    notification.style.cssText = `
      position: fixed;
      bottom: 180px;
      left: 50%;
      transform: translateX(-50%);
      background: #1c1c1e;
      color: #fff;
      padding: 16px 24px;
      border-radius: 16px;
      display: flex;
      align-items: center;
      gap: 12px;
      font-family: -apple-system, BlinkMacSystemFont, sans-serif;
      font-size: 15px;
      font-weight: 600;
      box-shadow: 0 10px 40px rgba(0,0,0,0.4);
      z-index: 1000000;
      animation: slideUp 0.3s ease-out;
    `;

    document.body.appendChild(notification);

    if (!document.querySelector('#sample-notification-styles')) {
      const style = document.createElement('style');
      style.id = 'sample-notification-styles';
      style.textContent = `
        @keyframes slideUp {
          from { opacity: 0; transform: translateX(-50%) translateY(20px); }
          to { opacity: 1; transform: translateX(-50%) translateY(0); }
        }
      `;
      document.head.appendChild(style);
    }

    setTimeout(() => {
      notification.style.opacity = '0';
      notification.style.transition = 'opacity 0.3s ease';
      setTimeout(() => notification.remove(), 300);
    }, 3000);
  }

})();
