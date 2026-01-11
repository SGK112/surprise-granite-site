/**
 * Enhanced Swipe Shop - Unified Experience
 * Persistent favorites bar across all categories
 * Works on countertops, tile, flooring, and shop pages
 */

(function() {
  'use strict';

  // Configuration
  const CONFIG = {
    categories: [
      { id: 'all', label: 'All', icon: '🏠', jsonPath: null },
      { id: 'countertop', label: 'Countertops', icon: '🪨', jsonPath: '/data/countertops.json', jsonKey: 'countertops' },
      { id: 'tile', label: 'Tile', icon: '🔲', jsonPath: '/data/tile.json', jsonKey: 'tile' },
      { id: 'flooring', label: 'Flooring', icon: '🏠', jsonPath: '/data/flooring.json', jsonKey: 'flooring' }
    ],
    maxVisibleThumbs: 8,
    cardSwipeThreshold: 80,
    velocityThreshold: 0.5
  };

  // State
  let state = {
    allProducts: [],
    filteredProducts: [],
    currentIndex: 0,
    activeCategory: 'all',
    swipeHistory: [],
    favorites: [],
    isLoading: true,
    isPanelOpen: false
  };

  // Touch tracking
  let touch = {
    startX: 0,
    startY: 0,
    currentX: 0,
    currentY: 0,
    isDragging: false,
    velocityX: 0,
    lastX: 0,
    lastTime: 0
  };

  // DOM references
  let dom = {};

  // Initialize
  function init() {
    // Only run on mobile or universal mode
    const isUniversal = document.body.dataset.swipeShop === 'enabled';
    if (!isUniversal && window.innerWidth > 767) return;

    loadFavorites();
    createUI();
    loadProducts();
  }

  // Load favorites from all sources
  function loadFavorites() {
    const allFavs = [];

    // Try SGFavorites system first
    if (window.SGFavorites) {
      const favsByType = window.SGFavorites.getAll();
      Object.keys(favsByType).forEach(type => {
        (favsByType[type] || []).forEach(item => {
          allFavs.push({ ...item, category: type });
        });
      });
    } else {
      // Fallback to localStorage
      const types = ['countertop', 'flooring', 'tile', 'cabinet', 'sink', 'shop'];
      types.forEach(type => {
        try {
          const items = JSON.parse(localStorage.getItem(`sg_favorites_${type}`)) || [];
          items.forEach(item => allFavs.push({ ...item, category: type }));
        } catch (e) {}
      });

      // Also check unified key
      try {
        const unified = JSON.parse(localStorage.getItem('sg_all_favorites')) || {};
        Object.keys(unified).forEach(type => {
          (unified[type] || []).forEach(item => {
            if (!allFavs.some(f => f.title === item.title)) {
              allFavs.push({ ...item, category: type });
            }
          });
        });
      } catch (e) {}
    }

    state.favorites = allFavs;
  }

  // Save favorite
  function saveFavorite(product) {
    const fav = {
      title: product.title,
      url: product.href,
      image: product.image,
      material: product.material,
      color: product.color,
      category: product.category || 'countertop'
    };

    // Add to state
    state.favorites.push(fav);

    // Save via SGFavorites if available
    if (window.SGFavorites) {
      window.SGFavorites.add(fav.category, fav);
    } else {
      // Save to localStorage
      try {
        const key = `sg_favorites_${fav.category}`;
        const existing = JSON.parse(localStorage.getItem(key)) || [];
        existing.push(fav);
        localStorage.setItem(key, JSON.stringify(existing));
      } catch (e) {}
    }

    // Update UI
    updateFavoritesBar();
    triggerHaptic('success');
  }

  // Remove favorite
  function removeFavorite(index) {
    const fav = state.favorites[index];
    if (!fav) return;

    state.favorites.splice(index, 1);

    // Remove via SGFavorites if available
    if (window.SGFavorites) {
      window.SGFavorites.remove(fav.category, fav.title);
    } else {
      try {
        const key = `sg_favorites_${fav.category}`;
        const existing = JSON.parse(localStorage.getItem(key)) || [];
        const updated = existing.filter(f => f.title !== fav.title);
        localStorage.setItem(key, JSON.stringify(updated));
      } catch (e) {}
    }

    updateFavoritesBar();
    triggerHaptic('light');
  }

  // Create UI
  function createUI() {
    const container = document.createElement('div');
    container.className = 'swipe-shop-container';
    container.id = 'swipeShopContainer';
    container.innerHTML = `
      <!-- Favorites Thumbnail Bar -->
      <div class="swipe-favorites-bar" id="favoritesBar">
        <div class="favorites-bar-inner">
          <div class="favorites-bar-logo">
            <svg viewBox="0 0 122 125" fill="#f9cb00">
              <path d="M60.534,9.987l51.884,29.956v76.23H8.65V39.943L60.534,9.987m0-9.987L0,34.95v89.874H121.073V34.95L60.534,0Z"/>
              <path d="M122.416,65.093,69.456,34.06,61.3,39.547l52.466,30.539v69.9h8.65Z" transform="translate(-27.288 -15.162)"/>
            </svg>
          </div>
          <div class="favorites-thumbs-container" id="favThumbsContainer">
            <!-- Thumbnails will be rendered here -->
          </div>
          <div class="favorites-total-badge" id="favTotalBadge" onclick="SwipeShop.openFavoritesPanel()">
            0
          </div>
        </div>
      </div>

      <!-- Category Header -->
      <div class="swipe-category-header" id="categoryHeader">
        <div class="category-scroll" id="categoryScroll">
          <!-- Category pills will be rendered here -->
        </div>
      </div>

      <!-- Loading -->
      <div class="swipe-loading-enhanced" id="swipeLoading">
        <div class="loading-spinner"></div>
        <div class="loading-text">Loading products...</div>
      </div>

      <!-- Cards Stack -->
      <div class="swipe-cards-stack" id="cardsStack"></div>

      <!-- Action Buttons -->
      <div class="swipe-actions-enhanced" id="actionButtons">
        <button class="action-btn undo" onclick="SwipeShop.undo()" title="Undo">
          <svg viewBox="0 0 24 24" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <path d="M3 9l6-6M3 9l6 6M3 9h12a6 6 0 0 1 0 12h-3"/>
          </svg>
        </button>
        <button class="action-btn nope" onclick="SwipeShop.skip()" title="Skip">
          <svg viewBox="0 0 24 24" stroke-linecap="round">
            <line x1="18" y1="6" x2="6" y2="18"/>
            <line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </button>
        <button class="action-btn like" onclick="SwipeShop.like()" title="Love">
          <svg viewBox="0 0 24 24">
            <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
          </svg>
        </button>
      </div>

      <!-- Progress Stats -->
      <div class="swipe-progress-enhanced" id="progressStats">
        <span class="stat">
          <span class="stat-value" id="viewedCount">0</span> viewed
        </span>
        <span class="stat">
          <span class="stat-value" id="savedCount">0</span> saved
        </span>
        <span class="stat">
          <span class="stat-value" id="remainingCount">0</span> left
        </span>
      </div>

      <!-- Favorites Panel -->
      <div class="favorites-panel-enhanced" id="favoritesPanel">
        <div class="favorites-panel-header">
          <span class="favorites-panel-title">Your Favorites</span>
          <button class="favorites-panel-close" onclick="SwipeShop.closeFavoritesPanel()">×</button>
        </div>
        <div class="favorites-grid" id="favoritesGrid"></div>
      </div>
    `;

    document.body.appendChild(container);

    // Cache DOM references
    dom = {
      container,
      favoritesBar: document.getElementById('favoritesBar'),
      favThumbsContainer: document.getElementById('favThumbsContainer'),
      favTotalBadge: document.getElementById('favTotalBadge'),
      categoryScroll: document.getElementById('categoryScroll'),
      loading: document.getElementById('swipeLoading'),
      cardsStack: document.getElementById('cardsStack'),
      actionButtons: document.getElementById('actionButtons'),
      progressStats: document.getElementById('progressStats'),
      viewedCount: document.getElementById('viewedCount'),
      savedCount: document.getElementById('savedCount'),
      remainingCount: document.getElementById('remainingCount'),
      favoritesPanel: document.getElementById('favoritesPanel'),
      favoritesGrid: document.getElementById('favoritesGrid')
    };

    // Render categories
    renderCategories();
    updateFavoritesBar();
  }

  // Render category pills
  function renderCategories() {
    dom.categoryScroll.innerHTML = CONFIG.categories.map(cat => `
      <button class="category-pill-enhanced ${cat.id === 'all' ? 'active' : ''}"
              data-category="${cat.id}"
              onclick="SwipeShop.filterCategory('${cat.id}')">
        <span class="cat-icon">${cat.icon}</span>
        <span class="cat-label">${cat.label}</span>
        <span class="cat-count" id="count-${cat.id}">0</span>
      </button>
    `).join('');
  }

  // Update favorites bar with thumbnails
  function updateFavoritesBar() {
    const thumbs = state.favorites.slice(-CONFIG.maxVisibleThumbs).reverse();

    if (thumbs.length === 0) {
      dom.favThumbsContainer.innerHTML = `
        <div class="favorites-empty-hint">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
          </svg>
          Swipe right to save favorites
        </div>
      `;
    } else {
      dom.favThumbsContainer.innerHTML = thumbs.map((fav, i) => `
        <div class="fav-thumb ${i === 0 ? 'new' : ''}" onclick="SwipeShop.viewFavorite(${state.favorites.length - thumbs.length + (thumbs.length - 1 - i)})">
          <img src="${fav.image}" alt="${fav.title}" loading="lazy">
          <span class="fav-thumb-category">${getCategoryIcon(fav.category)}</span>
        </div>
      `).join('');
    }

    dom.favTotalBadge.textContent = state.favorites.length;
    dom.savedCount.textContent = state.favorites.length;
  }

  // Get category icon
  function getCategoryIcon(category) {
    const cat = CONFIG.categories.find(c => c.id === category);
    return cat ? cat.icon : '📦';
  }

  // Load all products
  async function loadProducts() {
    state.isLoading = true;
    state.allProducts = [];

    for (const cat of CONFIG.categories) {
      if (!cat.jsonPath) continue;

      try {
        const response = await fetch(cat.jsonPath);
        if (response.ok) {
          const data = await response.json();
          const items = data[cat.jsonKey] || [];

          items.forEach(item => {
            if (!item.primaryImage && !item.image) return;

            state.allProducts.push({
              title: item.name || item.title || 'Unknown',
              image: item.primaryImage || item.image,
              href: item.url || item.href || '#',
              brand: item.brand || item.vendor || '',
              material: item.material || item.type || '',
              color: item.primaryColor || item.color || '',
              description: item.description || generateDescription(cat.id, item),
              category: cat.id,
              categoryLabel: cat.label,
              available: item.available !== false
            });
          });
        }
      } catch (e) {
        console.warn(`Failed to load ${cat.jsonPath}:`, e);
      }
    }

    // Shuffle products
    state.allProducts = shuffleArray(state.allProducts);

    // Update category counts
    updateCategoryCounts();

    // Initial filter
    filterProducts('all');

    // Hide loading
    state.isLoading = false;
    dom.loading.style.display = 'none';

    console.log('SwipeShop: Loaded', state.allProducts.length, 'products');
  }

  // Generate description
  function generateDescription(category, item) {
    const parts = [];
    if (item.brand) parts.push(item.brand);
    if (item.material || item.type) parts.push(item.material || item.type);
    if (item.style) parts.push(item.style);
    if (item.finish) parts.push(item.finish);
    if (item.color || item.primaryColor) parts.push(item.color || item.primaryColor);
    return parts.join(' • ') || `Beautiful ${category} option for your home.`;
  }

  // Shuffle array
  function shuffleArray(array) {
    const shuffled = [...array];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
  }

  // Update category counts
  function updateCategoryCounts() {
    CONFIG.categories.forEach(cat => {
      const countEl = document.getElementById(`count-${cat.id}`);
      if (countEl) {
        if (cat.id === 'all') {
          countEl.textContent = state.allProducts.length;
        } else {
          countEl.textContent = state.allProducts.filter(p => p.category === cat.id).length;
        }
      }
    });
  }

  // Filter products by category
  function filterProducts(category) {
    state.activeCategory = category;
    state.currentIndex = 0;
    state.swipeHistory = [];

    if (category === 'all') {
      state.filteredProducts = [...state.allProducts];
    } else {
      state.filteredProducts = state.allProducts.filter(p => p.category === category);
    }

    // Update active pill
    document.querySelectorAll('.category-pill-enhanced').forEach(pill => {
      pill.classList.toggle('active', pill.dataset.category === category);
    });

    renderCards();
    updateProgress();
    triggerHaptic('light');
  }

  // Render cards
  function renderCards() {
    dom.cardsStack.innerHTML = '';

    const cardsToShow = state.filteredProducts.slice(state.currentIndex, state.currentIndex + 4);

    if (cardsToShow.length === 0) {
      showEmptyState();
      return;
    }

    cardsToShow.forEach((product, i) => {
      const card = createCardElement(product, i);
      dom.cardsStack.appendChild(card);

      if (i === 0) {
        setupCardInteraction(card);
      }
    });

    preloadImages();
  }

  // Create card element
  function createCardElement(product, stackIndex) {
    const card = document.createElement('div');
    card.className = 'swipe-card-enhanced';
    card.dataset.index = state.currentIndex + stackIndex;
    card.style.zIndex = 10 - stackIndex;

    if (stackIndex > 0) {
      card.style.transform = `translateX(-50%) scale(${1 - stackIndex * 0.05}) translateY(${stackIndex * 10}px)`;
      card.style.opacity = 1 - stackIndex * 0.2;
    }

    card.innerHTML = `
      <div class="card-category-badge">${getCategoryIcon(product.category)} ${product.categoryLabel}</div>
      <a href="${product.href}" class="card-view-btn" target="_blank" onclick="event.stopPropagation()">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
          <polyline points="15 3 21 3 21 9"/>
          <line x1="10" y1="14" x2="21" y2="3"/>
        </svg>
        View
      </a>
      <div class="card-image-wrap">
        <img class="card-image" src="${product.image}" alt="${product.title}" loading="lazy">
        <div class="card-vendor-overlay">
          <div class="vendor-info">
            ${product.brand ? `<span class="vendor-label">by</span><span class="vendor-name">${product.brand}</span>` : ''}
          </div>
          ${product.material ? `<span class="card-material-badge">${product.material}</span>` : ''}
        </div>
      </div>
      <div class="card-content">
        <h3 class="card-title">${product.title}</h3>
        ${product.color ? `<div class="card-color">${product.color}</div>` : ''}
        <p class="card-description">${product.description}</p>
      </div>
      <div class="swipe-indicator like">💚</div>
      <div class="swipe-indicator nope">❌</div>
    `;

    return card;
  }

  // Setup card touch interaction
  function setupCardInteraction(card) {
    card.addEventListener('touchstart', handleTouchStart, { passive: true });
    card.addEventListener('touchmove', handleTouchMove, { passive: false });
    card.addEventListener('touchend', handleTouchEnd);

    // Double tap to like
    let lastTap = 0;
    card.addEventListener('touchend', (e) => {
      const now = Date.now();
      if (now - lastTap < 300) {
        showHeartAnimation(card);
        like();
      }
      lastTap = now;
    });
  }

  // Touch handlers
  function handleTouchStart(e) {
    touch.startX = e.touches[0].clientX;
    touch.startY = e.touches[0].clientY;
    touch.currentX = touch.startX;
    touch.currentY = touch.startY;
    touch.lastX = touch.startX;
    touch.lastTime = Date.now();
    touch.velocityX = 0;
    touch.isDragging = true;

    this.classList.add('dragging');
    this.style.transition = 'none';
  }

  function handleTouchMove(e) {
    if (!touch.isDragging) return;

    touch.currentX = e.touches[0].clientX;
    touch.currentY = e.touches[0].clientY;

    const deltaX = touch.currentX - touch.startX;
    const deltaY = touch.currentY - touch.startY;

    // Check if horizontal swipe
    if (Math.abs(deltaX) > Math.abs(deltaY)) {
      e.preventDefault();

      // Calculate velocity
      const now = Date.now();
      const dt = now - touch.lastTime;
      if (dt > 0) {
        touch.velocityX = (touch.currentX - touch.lastX) / dt;
      }
      touch.lastX = touch.currentX;
      touch.lastTime = now;

      // Apply transform
      const rotation = deltaX * 0.05;
      this.style.transform = `translateX(calc(-50% + ${deltaX}px)) rotate(${rotation}deg)`;

      // Show indicators
      const likeIndicator = this.querySelector('.swipe-indicator.like');
      const nopeIndicator = this.querySelector('.swipe-indicator.nope');

      if (deltaX > 50) {
        likeIndicator.style.opacity = Math.min((deltaX - 50) / 50, 1);
        nopeIndicator.style.opacity = 0;
      } else if (deltaX < -50) {
        nopeIndicator.style.opacity = Math.min((-deltaX - 50) / 50, 1);
        likeIndicator.style.opacity = 0;
      } else {
        likeIndicator.style.opacity = 0;
        nopeIndicator.style.opacity = 0;
      }
    }
  }

  function handleTouchEnd(e) {
    if (!touch.isDragging) return;
    touch.isDragging = false;

    this.classList.remove('dragging');

    const deltaX = touch.currentX - touch.startX;
    const shouldSwipe = Math.abs(deltaX) > CONFIG.cardSwipeThreshold ||
                        Math.abs(touch.velocityX) > CONFIG.velocityThreshold;

    if (shouldSwipe) {
      if (deltaX > 0) {
        like();
      } else {
        skip();
      }
    } else {
      // Reset card position
      this.style.transition = 'transform 0.3s ease';
      this.style.transform = 'translateX(-50%)';

      const likeIndicator = this.querySelector('.swipe-indicator.like');
      const nopeIndicator = this.querySelector('.swipe-indicator.nope');
      if (likeIndicator) likeIndicator.style.opacity = 0;
      if (nopeIndicator) nopeIndicator.style.opacity = 0;
    }
  }

  // Like action
  function like() {
    const currentProduct = state.filteredProducts[state.currentIndex];
    if (!currentProduct) return;

    const card = dom.cardsStack.querySelector('.swipe-card-enhanced');
    if (card) {
      card.classList.add('swiping-right');
    }

    // Save to favorites
    saveFavorite(currentProduct);

    // Record history
    state.swipeHistory.push({
      index: state.currentIndex,
      action: 'like',
      product: currentProduct
    });

    // Move to next
    setTimeout(() => {
      state.currentIndex++;
      renderCards();
      updateProgress();
    }, 300);
  }

  // Skip action
  function skip() {
    const currentProduct = state.filteredProducts[state.currentIndex];
    if (!currentProduct) return;

    const card = dom.cardsStack.querySelector('.swipe-card-enhanced');
    if (card) {
      card.classList.add('swiping-left');
    }

    // Record history
    state.swipeHistory.push({
      index: state.currentIndex,
      action: 'skip',
      product: currentProduct
    });

    triggerHaptic('light');

    // Move to next
    setTimeout(() => {
      state.currentIndex++;
      renderCards();
      updateProgress();
    }, 300);
  }

  // Undo action
  function undo() {
    if (state.swipeHistory.length === 0) return;

    const last = state.swipeHistory.pop();

    // If was liked, remove from favorites
    if (last.action === 'like') {
      const favIndex = state.favorites.findIndex(f => f.title === last.product.title);
      if (favIndex > -1) {
        removeFavorite(favIndex);
      }
    }

    state.currentIndex = last.index;
    renderCards();
    updateProgress();
    triggerHaptic('medium');
  }

  // Update progress
  function updateProgress() {
    dom.viewedCount.textContent = state.currentIndex;
    dom.savedCount.textContent = state.favorites.length;
    dom.remainingCount.textContent = Math.max(0, state.filteredProducts.length - state.currentIndex);
  }

  // Show empty state
  function showEmptyState() {
    dom.cardsStack.innerHTML = `
      <div class="swipe-empty-enhanced">
        <div class="empty-icon">🎉</div>
        <h2>You've seen them all!</h2>
        <p>You've viewed all ${state.activeCategory === 'all' ? '' : state.activeCategory + ' '}products</p>
        <button class="view-favorites-btn" onclick="SwipeShop.openFavoritesPanel()">
          <svg viewBox="0 0 24 24" fill="currentColor" width="18" height="18">
            <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
          </svg>
          View ${state.favorites.length} Favorites
        </button>
      </div>
    `;
    dom.actionButtons.style.display = 'none';
  }

  // Preload images
  function preloadImages() {
    const upcoming = state.filteredProducts.slice(state.currentIndex, state.currentIndex + 8);
    upcoming.forEach(product => {
      if (product.image) {
        const img = new Image();
        img.src = product.image;
      }
    });
  }

  // Show heart animation
  function showHeartAnimation(card) {
    const heart = document.createElement('div');
    heart.className = 'double-tap-heart';
    heart.innerHTML = '❤️';
    card.appendChild(heart);
    setTimeout(() => heart.remove(), 800);
  }

  // Trigger haptic feedback
  function triggerHaptic(type) {
    if ('vibrate' in navigator) {
      switch(type) {
        case 'light': navigator.vibrate(10); break;
        case 'medium': navigator.vibrate(25); break;
        case 'success': navigator.vibrate([10, 50, 20]); break;
      }
    }
  }

  // Open favorites panel
  function openFavoritesPanel() {
    state.isPanelOpen = true;
    dom.favoritesPanel.classList.add('open');
    document.body.style.overflow = 'hidden';
    renderFavoritesGrid();
  }

  // Close favorites panel
  function closeFavoritesPanel() {
    state.isPanelOpen = false;
    dom.favoritesPanel.classList.remove('open');
    document.body.style.overflow = '';
  }

  // Render favorites grid
  function renderFavoritesGrid() {
    if (state.favorites.length === 0) {
      dom.favoritesGrid.innerHTML = `
        <div class="favorites-empty" style="grid-column: span 2; text-align: center; padding: 40px;">
          <p style="color: rgba(255,255,255,0.5);">No favorites yet. Swipe right on products you love!</p>
        </div>
      `;
      return;
    }

    dom.favoritesGrid.innerHTML = state.favorites.map((fav, i) => `
      <div class="favorites-item">
        <img src="${fav.image}" alt="${fav.title}" loading="lazy">
        <button class="favorites-item-remove" onclick="SwipeShop.removeFavorite(${i}); event.stopPropagation();">×</button>
        <div class="favorites-item-info">
          <h4 class="favorites-item-title">${fav.title}</h4>
          <span class="favorites-item-category">${fav.category}</span>
        </div>
      </div>
    `).join('');
  }

  // View favorite item
  function viewFavorite(index) {
    const fav = state.favorites[index];
    if (fav && fav.url) {
      window.open(fav.url, '_blank');
    }
  }

  // Public API
  window.SwipeShop = {
    init,
    like,
    skip,
    undo,
    filterCategory: filterProducts,
    openFavoritesPanel,
    closeFavoritesPanel,
    removeFavorite,
    viewFavorite
  };

  // Auto-init
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
