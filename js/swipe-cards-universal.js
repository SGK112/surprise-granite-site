/**
 * Universal Swipe Cards - Works across all product pages
 * Uses the unified SGFavorites system from favorites.js
 */

(function() {
  'use strict';

  // Only run on mobile
  if (window.innerWidth > 767) return;

  // Detect product type from URL
  const path = window.location.pathname.toLowerCase();
  let productType = 'general';
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
  let swipeHistory = [];
  let startX, startY, currentX, currentY;
  let isDragging = false;

  // Get ALL favorites combined from unified system
  function getFavorites() {
    if (window.SGFavorites) {
      // Get ALL favorites from ALL product types for unified display
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
    // Fallback to localStorage - try to get from all types
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
    // Also check unified storage
    try {
      const unified = JSON.parse(localStorage.getItem('sg_all_favorites')) || {};
      Object.keys(unified).forEach(type => {
        (unified[type] || []).forEach(item => {
          // Only add if not already present
          if (!combined.some(c => c.title === item.title)) {
            combined.push({ ...item, productType: type });
          }
        });
      });
    } catch (e) {}
    return combined;
  }

  // Get favorites for current product type only (for checking if item is favorited)
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

  function init() {
    const materialsList = document.querySelector('.materials_list');
    const shopGrid = document.querySelector('.shop-product-grid');

    if (!materialsList && !shopGrid) return;

    if (materialsList) {
      parseWebflowProducts(materialsList);
    } else if (shopGrid) {
      parseShopProducts(shopGrid);
    }

    if (cards.length === 0) return;

    console.log('Swipe Cards:', cards.length, productLabel, 'found');
    showIntroOverlay();
  }

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
          material: getText(item, '[fs-cmsfilter-field="Material"]') || getText(item, '[fs-cmsfilter-field="material"]'),
          color: getText(item, '[fs-cmsfilter-field="Main Color"]') || getText(item, '[fs-cmsfilter-field="color"]'),
          size: getText(item, '[fs-cmsfilter-field="Size"]') || getText(item, '[fs-cmsfilter-field="size"]'),
          finish: getText(item, '[fs-cmsfilter-field="Finish"]') || getText(item, '[fs-cmsfilter-field="finish"]')
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

  function showIntroOverlay() {
    const overlay = document.createElement('div');
    overlay.className = 'swipe-intro-overlay';
    overlay.innerHTML = `
      <div class="swipe-intro-content">
        <div class="swipe-intro-brand">
          <img src="/images/sg-house-icon-gold.svg" alt="Surprise Granite" class="intro-brand-icon">
        </div>
        <p class="swipe-intro-subtitle">${cards.length} ${productLabel}</p>
        <div class="swipe-intro-options">
          <button class="swipe-intro-btn swipe-mode-btn" onclick="window.startSwipeMode()">
            <svg viewBox="0 0 24 24" fill="none" width="20" height="20" style="margin-right: 8px;">
              <path d="M19 14l-7 7-7-7" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
              <path d="M5 10l7-7 7 7" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
            </svg>
            <span class="intro-btn-text">Swipe Mode</span>
          </button>
          <button class="swipe-intro-btn scroll-mode-btn" onclick="window.startScrollMode()">
            <svg viewBox="0 0 24 24" fill="none" width="18" height="18" style="margin-right: 8px;">
              <rect x="3" y="3" width="7" height="7" rx="2" stroke="currentColor" stroke-width="2"/>
              <rect x="14" y="3" width="7" height="7" rx="2" stroke="currentColor" stroke-width="2"/>
              <rect x="3" y="14" width="7" height="7" rx="2" stroke="currentColor" stroke-width="2"/>
              <rect x="14" y="14" width="7" height="7" rx="2" stroke="currentColor" stroke-width="2"/>
            </svg>
            <span class="intro-btn-text">Browse Grid</span>
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
          <img src="/images/sg-house-icon-gold.svg" alt="SG" class="brand-icon">
          <span class="brand-text">Surprise Granite</span>
        </div>
        <button class="swipe-favorites-btn" onclick="window.toggleFavoritesDrawer()">
          <div class="fav-thumb-wrap">
            ${lastFav ? `<img src="${lastFav.image}" alt="" class="fav-thumb-img">` : '<div class="fav-thumb-empty"></div>'}
            <svg class="fav-thumb-heart" viewBox="0 0 24 24"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>
          </div>
          ${favs.length > 0 ? `<span class="fav-count">${favs.length}</span>` : ''}
        </button>
      </div>
      <div class="swipe-card-stack"></div>
      <div class="swipe-action-buttons">
        <button class="swipe-action-btn undo" onclick="window.undoSwipe()" title="Undo">
          <svg viewBox="0 0 24 24" fill="none" class="action-icon-lg">
            <path d="M3 9l6-6M3 9l6 6M3 9h12a6 6 0 0 1 0 12h-3" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
        </button>
        <button class="swipe-action-btn nope" onclick="window.swipeNope()" title="Skip">
          <svg viewBox="0 0 24 24" fill="none" class="action-icon-lg">
            <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="4" stroke-linecap="round"/>
          </svg>
        </button>
        <button class="swipe-action-btn like" onclick="window.swipeLike()" title="Love">
          <svg viewBox="0 0 24 24" class="action-icon-lg">
            <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" fill="currentColor"/>
          </svg>
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
    const deltaY = currentY - startY;

    e.preventDefault();

    const rotation = deltaX * 0.08;
    const scale = 1 - Math.min(Math.abs(deltaX) * 0.0005, 0.05);

    this.style.transform = `translateX(calc(-50% + ${deltaX}px)) translateY(-50%) rotate(${rotation}deg) scale(${scale})`;

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
      this.style.transition = 'transform 0.3s cubic-bezier(0.4, 0, 0.2, 1)';
      this.style.transform = `translateX(120vw) rotate(20deg)`;
      setTimeout(() => handleLike(), 250);
    } else if (projectedX < -threshold || velocityX < -velocityThreshold) {
      this.style.transition = 'transform 0.3s cubic-bezier(0.4, 0, 0.2, 1)';
      this.style.transform = `translateX(-120vw) rotate(-20deg)`;
      setTimeout(() => handleNope(), 250);
    } else {
      this.style.transition = 'transform 0.4s cubic-bezier(0.34, 1.56, 0.64, 1)';
      this.style.transform = 'translate(-50%, -50%)';
      this.classList.remove('swiping-left', 'swiping-right');
    }
  }

  function handleLike() {
    const card = cards[currentIndex];
    swipeHistory.push({ index: currentIndex, action: 'like' });

    // Use unified favorites system
    if (window.SGFavorites) {
      window.SGFavorites.add({
        title: card.title,
        url: card.href,
        image: card.image,
        material: card.material || '',
        color: card.color || ''
      }, productType);
    } else {
      // Fallback to localStorage
      const favs = getFavorites();
      if (!favs.some(f => f.title === card.title)) {
        favs.push(card);
        localStorage.setItem(`sg_favorites_${productType}`, JSON.stringify(favs));
      }
    }

    currentIndex++;
    renderCards();
    updateFavoritesUI();
  }

  function handleNope() {
    swipeHistory.push({ index: currentIndex, action: 'nope' });
    currentIndex++;
    renderCards();
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

    // Update count badge
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

    // Update drawer if open
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
    stack.innerHTML = `
      <div class="swipe-empty">
        <div class="swipe-empty-icon">${favs.length > 0 ? '🎉' : '📦'}</div>
        <h3>${favs.length > 0 ? 'All done!' : 'No more items'}</h3>
        <p>${favs.length > 0 ? `You saved ${favs.length} ${productLabel.toLowerCase()}` : 'Check back later for new arrivals'}</p>
        ${favs.length > 0 ? `<button class="swipe-view-saved-btn" onclick="window.toggleFavoritesDrawer()">View Saved</button>` : ''}
        <button class="swipe-reset-btn" onclick="window.resetSwipe()">Start Over</button>
      </div>
    `;
  }

  window.resetSwipe = function() {
    currentIndex = 0;
    swipeHistory = [];
    renderCards();
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

    // Also allow tap on handle to toggle
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
              <button class="favorite-remove" onclick="window.removeFavoriteItem('${f.title.replace(/'/g, "\\'")}')">×</button>
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

})();
