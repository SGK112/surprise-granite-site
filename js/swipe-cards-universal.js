/**
 * Universal Swipe Cards - Works across all product pages
 * Detects product type from URL and adapts accordingly
 */

(function() {
  'use strict';

  // Only run on mobile
  if (window.innerWidth > 767) return;

  // Supabase config
  const SUPABASE_URL = 'https://ypeypgwsycxcagncgdur.supabase.co';
  const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlwZXlwZ3dzeWN4Y2FnbmNnZHVyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njc3NTQ4MjMsImV4cCI6MjA4MzMzMDgyM30.R13pNv2FDtGhfeu7gUcttYNrQAbNYitqR4FIq3O2-ME';

  let supabaseClient = null;
  let currentUser = null;

  // Detect product type from URL
  const path = window.location.pathname.toLowerCase();
  let productType = 'product';
  let productLabel = 'Products';

  if (path.includes('flooring')) {
    productType = 'flooring';
    productLabel = 'Flooring';
  } else if (path.includes('countertop') || path.includes('granite') || path.includes('marble') || path.includes('quartz') || path.includes('porcelain')) {
    productType = 'countertop';
    productLabel = 'Countertops';
  } else if (path.includes('tile')) {
    productType = 'tile';
    productLabel = 'Tiles';
  } else if (path.includes('cabinet')) {
    productType = 'cabinet';
    productLabel = 'Cabinets';
  } else if (path.includes('sink')) {
    productType = 'sink';
    productLabel = 'Sinks';
  } else if (path.includes('shop')) {
    productType = 'shop';
    productLabel = 'Products';
  }

  // Wait for DOM
  document.addEventListener('DOMContentLoaded', init);

  let cards = [];
  let currentIndex = 0;
  let favorites = [];
  let swipeHistory = [];
  let startX, startY, currentX, currentY;
  let isDragging = false;

  async function init() {
    // Find product container
    const materialsList = document.querySelector('.materials_list');
    const shopGrid = document.querySelector('.shop-product-grid');

    if (!materialsList && !shopGrid) return;

    // Initialize Supabase
    await initSupabase();

    // Parse products based on page type
    if (materialsList) {
      parseWebflowProducts(materialsList);
    } else if (shopGrid) {
      parseShopProducts(shopGrid);
    }

    if (cards.length === 0) return;

    console.log('Swipe Cards:', cards.length, productLabel, 'found');

    // Load existing favorites
    await loadFavorites();

    // Show intro overlay
    showIntroOverlay();
  }

  function parseWebflowProducts(container) {
    const items = container.querySelectorAll('.w-dyn-item, .materials_item');

    items.forEach((item, index) => {
      // Skip if no actual product content
      if (!item.querySelector('img')) return;

      const link = item.querySelector('a[href]');
      const images = item.querySelectorAll('img');

      // Get title - try multiple selectors
      let title = item.querySelector('[fs-cmsfilter-field="Keyword"]') ||
                  item.querySelector('.materials_name') ||
                  item.querySelector('h3') ||
                  item.querySelector('h4');

      // Get specs based on product type
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
          material: getText(item, '[fs-cmsfilter-field="Material"]') || getText(item, '[fs-cmsfilter-field="material"]'),
          color: getText(item, '[fs-cmsfilter-field="Main Color"]') || getText(item, '[fs-cmsfilter-field="color"]'),
          size: getText(item, '[fs-cmsfilter-field="Size"]') || getText(item, '[fs-cmsfilter-field="size"]'),
          finish: getText(item, '[fs-cmsfilter-field="Finish"]') || getText(item, '[fs-cmsfilter-field="finish"]')
        };
      } else {
        // Generic specs
        specs = {
          material: getText(item, '[fs-cmsfilter-field="Material"]') || getText(item, '[fs-cmsfilter-field="material"]'),
          color: getText(item, '[fs-cmsfilter-field="Main Color"]') || getText(item, '[fs-cmsfilter-field="color"]'),
          brand: getText(item, '[fs-cmsfilter-field="Brand"]') || getText(item, '[fs-cmsfilter-field="brand"]')
        };
      }

      // Get best image
      let imageUrl = '';
      if (images.length > 0) {
        const primaryImg = Array.from(images).find(img => img.classList.contains('is-primary'));
        imageUrl = primaryImg ? primaryImg.src : (images[1] || images[0]).src;
      }

      cards.push({
        id: index,
        href: link ? link.href : '#',
        image: imageUrl,
        title: title ? title.textContent.trim() : productLabel.slice(0, -1),
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
      const price = item.querySelector('.shop-product-price');

      cards.push({
        id: index,
        href: link ? link.href : '#',
        image: image ? image.src : '',
        title: title ? title.textContent.trim() : 'Product',
        price: price ? price.textContent.trim() : ''
      });
    });
  }

  function getText(container, selector) {
    const el = container.querySelector(selector);
    return el ? el.textContent.trim() : '';
  }

  async function initSupabase() {
    if (typeof window.supabase !== 'undefined') {
      supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
      const { data: { user } } = await supabaseClient.auth.getUser();
      currentUser = user;
    }
  }

  async function loadFavorites() {
    if (currentUser && supabaseClient) {
      try {
        const { data, error } = await supabaseClient
          .from('user_favorites')
          .select('*')
          .eq('user_id', currentUser.id)
          .eq('product_type', productType);

        if (!error && data) {
          favorites = data.map(f => ({
            title: f.product_title,
            href: f.product_url,
            image: f.product_image,
            material: f.product_material,
            color: f.product_color
          }));
        }
      } catch (e) {
        console.log('Using local storage for favorites');
        loadLocalFavorites();
      }
    } else {
      loadLocalFavorites();
    }
  }

  function loadLocalFavorites() {
    const stored = localStorage.getItem(`sg_favorites_${productType}`);
    if (stored) {
      try {
        favorites = JSON.parse(stored);
      } catch (e) {
        favorites = [];
      }
    }
  }

  function saveFavorites() {
    localStorage.setItem(`sg_favorites_${productType}`, JSON.stringify(favorites));
  }

  async function addFavorite(card) {
    // Check if already favorited
    if (favorites.some(f => f.title === card.title)) return;

    favorites.push(card);
    saveFavorites();

    // Save to Supabase if logged in
    if (currentUser && supabaseClient) {
      try {
        await supabaseClient.from('user_favorites').insert({
          user_id: currentUser.id,
          product_type: productType,
          product_title: card.title,
          product_url: card.href,
          product_image: card.image,
          product_material: card.material || '',
          product_color: card.color || ''
        });
      } catch (e) {
        console.log('Saved locally');
      }
    }

    updateFavoritesCount();

    // Sync with unified favorites system
    if (window.SGFavorites) {
      window.SGFavorites.add(card, productType);
    }
  }

  async function removeFavorite(title) {
    favorites = favorites.filter(f => f.title !== title);
    saveFavorites();

    if (currentUser && supabaseClient) {
      try {
        await supabaseClient
          .from('user_favorites')
          .delete()
          .eq('user_id', currentUser.id)
          .eq('product_title', title);
      } catch (e) {
        console.log('Removed locally');
      }
    }

    updateFavoritesCount();

    if (window.SGFavorites) {
      window.SGFavorites.remove(title, productType);
    }
  }

  function showIntroOverlay() {
    const overlay = document.createElement('div');
    overlay.className = 'swipe-intro-overlay';
    overlay.innerHTML = `
      <div class="swipe-intro-content">
        <img src="https://cdn.prod.website-files.com/6456ce4476abb25581fbad0c/6456ce4476abb27beffbb16a_Surprise%20Granite%20Transparent%20Dark%20Wide.svg" alt="Surprise Granite" class="swipe-intro-logo">
        <p class="swipe-intro-subtitle">${cards.length} ${productLabel}</p>
        <div class="swipe-intro-options">
          <button class="swipe-intro-btn swipe-mode-btn" onclick="window.startSwipeMode()">
            <span class="intro-btn-text">Swipe</span>
          </button>
          <button class="swipe-intro-btn scroll-mode-btn" onclick="window.startScrollMode()">
            <span class="intro-btn-text">Browse</span>
          </button>
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
    const container = document.createElement('div');
    container.className = 'swipe-cards-container';
    container.innerHTML = `
      <div class="swipe-topbar">
        <button class="swipe-scroll-btn" onclick="window.exitSwipeMode()">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/>
            <rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>
          </svg>
          <span>Scroll</span>
        </button>
        <span class="swipe-topbar-title">${productLabel}</span>
        <button class="swipe-favorites-btn" onclick="window.toggleFavoritesDrawer()">
          <div class="fav-thumb">${favorites.length > 0 ? `<img src="${favorites[favorites.length - 1].image}" alt="">` : ''}</div>
          <span class="fav-count">${favorites.length}</span>
        </button>
      </div>
      <div class="swipe-card-stack"></div>
      <div class="swipe-action-buttons">
        <button class="swipe-action-btn undo" onclick="window.undoSwipe()">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M3 10h10a5 5 0 0 1 5 5v2"/><polyline points="3 10 8 5"/><polyline points="3 10 8 15"/></svg>
        </button>
        <button class="swipe-action-btn nope" onclick="window.swipeNope()">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
        <button class="swipe-action-btn like" onclick="window.swipeLike()">
          <svg viewBox="0 0 24 24"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>
        </button>
      </div>
    `;
    document.body.appendChild(container);

    createFavoritesDrawer();
    renderCards();
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

      // Build specs HTML
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
          ${card.size ? `<div class="swipe-card-spec"><span class="spec-label">Size</span><span class="spec-value">${card.size}</span></div>` : ''}
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

      cardEl.innerHTML = `
        <img class="swipe-card-image" src="${card.image}" alt="${card.title}" loading="lazy">
        <a href="${card.href}" class="swipe-card-view-btn" target="_blank">
          <svg viewBox="0 0 24 24"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
        </a>
        <div class="swipe-indicator like">
          <svg viewBox="0 0 24 24"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>
        </div>
        <div class="swipe-indicator nope">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </div>
        <div class="swipe-indicator super">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <path d="M12 19V5M5 12l7-7 7 7"/>
          </svg>
        </div>
        <div class="swipe-card-content">
          <div class="swipe-card-header">
            <h3 class="swipe-card-title">${card.title}</h3>
            ${card.material ? `<span class="swipe-card-material">${card.material}</span>` : ''}
          </div>
          <div class="swipe-card-specs">${specsHtml}</div>
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

    // Double-tap to like
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
  let velocityY = 0;
  let lastMoveTime = 0;
  let lastX = 0;
  let lastY = 0;

  function handleTouchStart(e) {
    startX = e.touches[0].clientX;
    startY = e.touches[0].clientY;
    currentX = startX;
    currentY = startY;
    lastX = startX;
    lastY = startY;
    lastMoveTime = Date.now();
    velocityX = 0;
    velocityY = 0;
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

    // Calculate velocity for fluid feel
    if (dt > 0) {
      velocityX = (currentX - lastX) / dt * 16;
      velocityY = (currentY - lastY) / dt * 16;
    }

    lastX = currentX;
    lastY = currentY;
    lastMoveTime = now;

    const deltaX = currentX - startX;
    const deltaY = currentY - startY;

    e.preventDefault();

    // Smooth rotation based on drag distance
    const rotation = deltaX * 0.08;
    const tiltY = deltaY * 0.03;
    const scale = 1 - Math.min(Math.abs(deltaX) * 0.0005, 0.05);

    this.style.transform = `translateX(calc(-50% + ${deltaX}px)) translateY(${deltaY * 0.3}px) rotate(${rotation}deg) scale(${scale})`;

    // Update indicators based on direction (left/right only)
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

    // Use velocity for more natural feel
    const projectedX = deltaX + velocityX * 5;

    const threshold = 80;
    const velocityThreshold = 3;

    // Swipe right = like
    if (projectedX > threshold || velocityX > velocityThreshold) {
      this.style.transition = 'transform 0.3s cubic-bezier(0.4, 0, 0.2, 1)';
      this.style.transform = `translateX(120vw) rotate(20deg)`;
      setTimeout(() => handleLike(), 250);
    }
    // Swipe left = nope
    else if (projectedX < -threshold || velocityX < -velocityThreshold) {
      this.style.transition = 'transform 0.3s cubic-bezier(0.4, 0, 0.2, 1)';
      this.style.transform = `translateX(-120vw) rotate(-20deg)`;
      setTimeout(() => handleNope(), 250);
    }
    // Return to center
    else {
      this.style.transition = 'transform 0.4s cubic-bezier(0.34, 1.56, 0.64, 1)';
      this.style.transform = 'translateX(-50%)';
      this.classList.remove('swiping-left', 'swiping-right');
    }
  }

  function handleSuperLike() {
    const card = cards[currentIndex];
    swipeHistory.push({ index: currentIndex, action: 'superlike' });
    addFavorite(card);
    // Open product link
    window.open(card.href, '_blank');
    currentIndex++;
    renderCards();
    updateCounter();
  }

  function handleLike() {
    const card = cards[currentIndex];
    swipeHistory.push({ index: currentIndex, action: 'like' });
    addFavorite(card);
    currentIndex++;
    renderCards();
    updateCounter();
  }

  function handleNope() {
    swipeHistory.push({ index: currentIndex, action: 'nope' });
    currentIndex++;
    renderCards();
    updateCounter();
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
      removeFavorite(card.title);
    }

    renderCards();
    updateCounter();
  };

  function updateCounter() {
    const current = document.querySelector('.swipe-counter .current');
    const total = document.querySelector('.swipe-counter .total');
    if (current) current.textContent = currentIndex + 1;
    if (total) total.textContent = cards.length;
  }

  function updateFavoritesCount() {
    const countEl = document.querySelector('.fav-count');
    const thumbEl = document.querySelector('.fav-thumb');
    if (countEl) {
      countEl.textContent = favorites.length;
    }
    if (thumbEl) {
      if (favorites.length > 0) {
        thumbEl.innerHTML = `<img src="${favorites[favorites.length - 1].image}" alt="">`;
      } else {
        thumbEl.innerHTML = '';
      }
    }
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

    stack.innerHTML = `
      <div class="swipe-empty">
        <div class="swipe-empty-icon">${favorites.length > 0 ? '🎉' : '📦'}</div>
        <h3>${favorites.length > 0 ? 'All done!' : 'No more items'}</h3>
        <p>${favorites.length > 0 ? `You liked ${favorites.length} ${productLabel.toLowerCase()}` : 'Check back later for new arrivals'}</p>
        ${favorites.length > 0 ? `<button class="swipe-view-saved-btn" onclick="window.toggleFavoritesDrawer()">View Saved</button>` : ''}
        <button class="swipe-reset-btn" onclick="window.resetSwipe()">Start Over</button>
      </div>
    `;
  }

  window.resetSwipe = function() {
    currentIndex = 0;
    swipeHistory = [];
    renderCards();
    updateCounter();
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
        <span class="favorites-drawer-title">Favorites <span class="favorites-count">${favorites.length}</span></span>
      </div>
      <div class="favorites-content"></div>
      <div class="favorites-actions">
        ${currentUser ? `<a href="/account/#favorites" class="favorites-view-all">View All</a>` : `<button class="favorites-view-all" onclick="window.showLocalFavoritesFullscreen()">View All</button>`}
      </div>
    `;
    document.body.appendChild(drawer);

    // Drag to close functionality
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

    updateFavoritesDrawer();
  }

  function updateFavoritesDrawer() {
    const content = document.querySelector('.favorites-drawer .favorites-content');
    const countEl = document.querySelector('.favorites-count');

    if (countEl) countEl.textContent = favorites.length;

    if (!content) return;

    if (favorites.length === 0) {
      content.innerHTML = '<p class="favorites-empty">Swipe right to save favorites</p>';
    } else {
      content.innerHTML = `
        <div class="favorites-list">
          ${favorites.map(f => `
            <a href="${f.href}" class="favorite-item" target="_blank">
              <img src="${f.image}" alt="${f.title}" loading="lazy">
              <span>${f.title}</span>
            </a>
          `).join('')}
        </div>
      `;
    }
  }

  window.toggleFavoritesDrawer = function() {
    const drawer = document.querySelector('.favorites-drawer');
    if (drawer) {
      drawer.classList.toggle('open');
      updateFavoritesDrawer();
    }
  };

  window.showLocalFavoritesFullscreen = function() {
    // Close drawer first
    const drawer = document.querySelector('.favorites-drawer');
    if (drawer) drawer.classList.remove('open');

    // Create fullscreen overlay
    const overlay = document.createElement('div');
    overlay.className = 'local-favorites-overlay';
    overlay.innerHTML = `
      <div class="local-favorites-content">
        <div class="local-favorites-header">
          <h2>My ${productLabel}</h2>
          <button class="local-favorites-close" onclick="this.closest('.local-favorites-overlay').remove()">&times;</button>
        </div>
        <p class="local-favorites-note">
          <a href="/account/">Sign in</a> to save favorites across devices
        </p>
        <div class="local-favorites-grid">
          ${favorites.map(f => `
            <a href="${f.href}" class="local-favorite-card" target="_blank">
              <img src="${f.image}" alt="${f.title}" loading="lazy">
              <div class="local-favorite-info">
                <span class="local-favorite-title">${f.title}</span>
                ${f.material ? `<span class="local-favorite-material">${f.material}</span>` : ''}
              </div>
            </a>
          `).join('')}
        </div>
      </div>
    `;
    document.body.appendChild(overlay);
  };

  // Expose favorites for external access
  window.getSwipeFavorites = function() {
    return favorites;
  };

  window.getSwipeProductType = function() {
    return productType;
  };

})();
