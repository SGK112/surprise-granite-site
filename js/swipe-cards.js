/**
 * Swipe Cards - Tinder-style product browsing
 * "Swipe Right for Your Perfect Floor!"
 */

(function() {
  'use strict';

  // Only run on mobile
  if (window.innerWidth > 767) return;

  // Wait for DOM
  document.addEventListener('DOMContentLoaded', init);

  let cards = [];
  let currentIndex = 0;
  let favorites = [];
  let swipeHistory = [];
  let startX, startY, currentX, currentY;
  let isDragging = false;

  function init() {
    const materialsList = document.querySelector('.materials_list');
    if (!materialsList) return;

    // Get all product items
    const items = materialsList.querySelectorAll('.materials_item, .w-dyn-item');
    if (items.length === 0) return;

    // Build cards data
    items.forEach((item, index) => {
      const link = item.querySelector('a');
      const images = item.querySelectorAll('img');
      const title = item.querySelector('[fs-cmsfilter-field="Keyword"]');
      const material = item.querySelector('[fs-cmsfilter-field="material"]');
      const color = item.querySelector('[fs-cmsfilter-field="main-color"]');
      const thickness = item.querySelector('[fs-cmsfilter-field="thickness"]');
      const wearLayer = item.querySelector('[fs-cmsfilter-field="wear-layer"]');
      const shadeVariations = item.querySelector('[fs-cmsfilter-field="shade-variations"]');

      cards.push({
        id: index,
        href: link ? link.href : '#',
        image: images[1] ? images[1].src : (images[0] ? images[0].src : ''),
        title: title ? title.textContent.trim() : 'Flooring',
        material: material ? material.textContent.trim() : '',
        color: color ? color.textContent.trim() : '',
        thickness: thickness ? thickness.textContent.trim() : '',
        wearLayer: wearLayer ? wearLayer.textContent.trim() : '',
        shadeVariations: shadeVariations ? shadeVariations.textContent.trim() : ''
      });
    });

    if (cards.length === 0) return;

    // Add swipe-enabled class to hide grid
    materialsList.classList.add('swipe-enabled');

    // Create swipe UI
    createSwipeUI();
    renderCards();
    showInstructions();
  }

  function createSwipeUI() {
    const container = document.querySelector('.materials_collection-list-wrapper');
    if (!container) return;

    const swipeHTML = `
      <div class="swipe-cards-container">
        <div class="swipe-card-stack"></div>
        <div class="swipe-actions">
          <button class="swipe-btn undo" title="Undo" onclick="window.swipeUndo()">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M3 10h10a5 5 0 0 1 5 5v2"></path>
              <path d="M3 10l4-4"></path>
              <path d="M3 10l4 4"></path>
            </svg>
          </button>
          <button class="swipe-btn nope" title="Skip" onclick="window.swipeLeft()">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
          <button class="swipe-btn like" title="Save" onclick="window.swipeRight()">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="currentColor">
              <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path>
            </svg>
          </button>
        </div>
        <div class="swipe-counter">
          <strong id="swipe-current">1</strong> of <strong id="swipe-total">${cards.length}</strong> floors
        </div>
      </div>
      <div class="favorites-drawer" id="favorites-drawer">
        <div class="favorites-drawer-handle" onclick="window.toggleFavorites()">
          <span class="favorites-drawer-title">Your Favorites <span class="favorites-count" id="favorites-count">0</span></span>
        </div>
        <div class="favorites-list" id="favorites-list"></div>
      </div>
    `;

    container.insertAdjacentHTML('afterbegin', swipeHTML);
  }

  function renderCards() {
    const stack = document.querySelector('.swipe-card-stack');
    if (!stack) return;

    stack.innerHTML = '';

    // Render next 3 cards
    for (let i = 0; i < 3; i++) {
      const cardIndex = currentIndex + i;
      if (cardIndex >= cards.length) break;

      const card = cards[cardIndex];
      const cardEl = createCardElement(card, i === 0);
      stack.appendChild(cardEl);
    }

    // Update counter
    updateCounter();

    // Check if empty
    if (currentIndex >= cards.length) {
      showEmptyState();
    }
  }

  function createCardElement(card, isActive) {
    const div = document.createElement('div');
    div.className = 'swipe-card';
    div.dataset.id = card.id;

    div.innerHTML = `
      <div class="swipe-indicator like">
        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3">
          <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path>
        </svg>
        <span>LOVE IT</span>
      </div>
      <div class="swipe-indicator nope">
        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3">
          <line x1="18" y1="6" x2="6" y2="18"></line>
          <line x1="6" y1="6" x2="18" y2="18"></line>
        </svg>
        <span>NOPE</span>
      </div>
      <a href="${card.href}" class="swipe-card-view-btn" title="View Details">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path>
          <polyline points="15 3 21 3 21 9"></polyline>
          <line x1="10" y1="14" x2="21" y2="3"></line>
        </svg>
      </a>
      <img class="swipe-card-image" src="${card.image}" alt="${card.title}" loading="lazy">
      <div class="swipe-card-content">
        <div class="swipe-card-header">
          <div class="swipe-card-title">${card.title}</div>
          ${card.material ? `<span class="swipe-card-material">${card.material}</span>` : ''}
        </div>
        <div class="swipe-card-specs">
          ${card.color ? `
            <div class="swipe-card-spec">
              <span class="spec-label">Color</span>
              <span class="spec-value">${card.color}</span>
            </div>
          ` : ''}
          ${card.thickness ? `
            <div class="swipe-card-spec">
              <span class="spec-label">Thickness</span>
              <span class="spec-value">${card.thickness}</span>
            </div>
          ` : ''}
          ${card.wearLayer ? `
            <div class="swipe-card-spec">
              <span class="spec-label">Wear Layer</span>
              <span class="spec-value">${card.wearLayer}</span>
            </div>
          ` : ''}
          ${card.shadeVariations ? `
            <div class="swipe-card-spec">
              <span class="spec-label">Variation</span>
              <span class="spec-value">${card.shadeVariations}</span>
            </div>
          ` : ''}
        </div>
      </div>
    `;

    if (isActive) {
      setupCardInteraction(div, card);
    }

    return div;
  }

  function setupCardInteraction(cardEl, card) {
    // Touch events
    cardEl.addEventListener('touchstart', handleTouchStart, { passive: true });
    cardEl.addEventListener('touchmove', handleTouchMove, { passive: false });
    cardEl.addEventListener('touchend', handleTouchEnd);

    // Mouse events (for testing)
    cardEl.addEventListener('mousedown', handleMouseDown);
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  }

  function handleTouchStart(e) {
    startX = e.touches[0].clientX;
    startY = e.touches[0].clientY;
    isDragging = true;
    this.classList.add('dragging');
  }

  function handleTouchMove(e) {
    if (!isDragging) return;

    currentX = e.touches[0].clientX;
    currentY = e.touches[0].clientY;

    const deltaX = currentX - startX;
    const deltaY = currentY - startY;

    // Only allow horizontal swipe
    if (Math.abs(deltaX) > Math.abs(deltaY)) {
      e.preventDefault();
      updateCardPosition(this, deltaX);
    }
  }

  function handleTouchEnd(e) {
    if (!isDragging) return;
    isDragging = false;
    this.classList.remove('dragging');

    const deltaX = currentX - startX;
    finalizeSwipe(this, deltaX);
  }

  function handleMouseDown(e) {
    startX = e.clientX;
    startY = e.clientY;
    isDragging = true;
    this.classList.add('dragging');
  }

  function handleMouseMove(e) {
    if (!isDragging) return;

    const cardEl = document.querySelector('.swipe-card.dragging');
    if (!cardEl) return;

    currentX = e.clientX;
    const deltaX = currentX - startX;
    updateCardPosition(cardEl, deltaX);
  }

  function handleMouseUp(e) {
    if (!isDragging) return;
    isDragging = false;

    const cardEl = document.querySelector('.swipe-card.dragging');
    if (!cardEl) return;

    cardEl.classList.remove('dragging');
    const deltaX = currentX - startX;
    finalizeSwipe(cardEl, deltaX);
  }

  function updateCardPosition(cardEl, deltaX) {
    const rotation = deltaX * 0.1;
    cardEl.style.transform = `translateX(calc(-50% + ${deltaX}px)) rotate(${rotation}deg)`;

    // Update indicators
    if (deltaX > 50) {
      cardEl.classList.add('swiping-right');
      cardEl.classList.remove('swiping-left');
    } else if (deltaX < -50) {
      cardEl.classList.add('swiping-left');
      cardEl.classList.remove('swiping-right');
    } else {
      cardEl.classList.remove('swiping-left', 'swiping-right');
    }
  }

  function finalizeSwipe(cardEl, deltaX) {
    const threshold = 100;

    if (deltaX > threshold) {
      // Swipe right - Like/Save
      swipeCardOut(cardEl, 'right');
    } else if (deltaX < -threshold) {
      // Swipe left - Skip
      swipeCardOut(cardEl, 'left');
    } else {
      // Return to center
      cardEl.style.transform = 'translateX(-50%)';
      cardEl.classList.remove('swiping-left', 'swiping-right');
    }
  }

  function swipeCardOut(cardEl, direction) {
    const cardId = parseInt(cardEl.dataset.id);
    const card = cards.find(c => c.id === cardId);

    // Save to history for undo
    swipeHistory.push({ index: currentIndex, direction });

    // Add animation class
    cardEl.classList.add(`swipe-out-${direction}`);

    // If liked, add to favorites
    if (direction === 'right' && card) {
      favorites.push(card);
      updateFavorites();

      // Haptic feedback
      if (navigator.vibrate) {
        navigator.vibrate(50);
      }
    }

    // Move to next card after animation
    setTimeout(() => {
      currentIndex++;
      renderCards();
    }, 300);
  }

  function updateCounter() {
    const currentEl = document.getElementById('swipe-current');
    const totalEl = document.getElementById('swipe-total');

    if (currentEl) currentEl.textContent = Math.min(currentIndex + 1, cards.length);
    if (totalEl) totalEl.textContent = cards.length;
  }

  function updateFavorites() {
    const countEl = document.getElementById('favorites-count');
    const listEl = document.getElementById('favorites-list');

    if (countEl) countEl.textContent = favorites.length;

    if (listEl) {
      listEl.innerHTML = favorites.map(fav => `
        <a href="${fav.href}" class="favorite-item">
          <img src="${fav.image}" alt="${fav.title}" loading="lazy">
          <span>${fav.title}</span>
        </a>
      `).join('');
    }
  }

  function showEmptyState() {
    const stack = document.querySelector('.swipe-card-stack');
    if (!stack) return;

    stack.innerHTML = `
      <div class="swipe-empty">
        <div class="swipe-empty-icon">🎉</div>
        <h3>You've seen all ${cards.length} floors!</h3>
        <p>You saved ${favorites.length} to your favorites</p>
        <button class="swipe-reset-btn" onclick="window.swipeReset()">Start Over</button>
      </div>
    `;
  }

  function showInstructions() {
    const container = document.querySelector('.swipe-cards-container');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = 'swipe-instructions';
    toast.textContent = '👈 Swipe left to skip • Swipe right to save 👉';
    container.appendChild(toast);

    setTimeout(() => toast.remove(), 4000);
  }

  // Global functions for buttons
  window.swipeLeft = function() {
    const cardEl = document.querySelector('.swipe-card');
    if (cardEl) swipeCardOut(cardEl, 'left');
  };

  window.swipeRight = function() {
    const cardEl = document.querySelector('.swipe-card');
    if (cardEl) swipeCardOut(cardEl, 'right');
  };

  window.swipeView = function() {
    const cardEl = document.querySelector('.swipe-card');
    if (cardEl) {
      const cardId = parseInt(cardEl.dataset.id);
      const card = cards.find(c => c.id === cardId);
      if (card && card.href) {
        window.location.href = card.href;
      }
    }
  };

  window.swipeUndo = function() {
    if (swipeHistory.length === 0) return;

    const last = swipeHistory.pop();
    currentIndex = last.index;

    // Remove from favorites if it was liked
    if (last.direction === 'right') {
      favorites.pop();
      updateFavorites();
    }

    renderCards();
  };

  window.swipeReset = function() {
    currentIndex = 0;
    swipeHistory = [];
    // Keep favorites
    renderCards();
  };

  window.toggleFavorites = function() {
    const drawer = document.getElementById('favorites-drawer');
    if (drawer) drawer.classList.toggle('open');
  };

  // Reinitialize on resize (for orientation change)
  let resizeTimeout;
  window.addEventListener('resize', function() {
    clearTimeout(resizeTimeout);
    resizeTimeout = setTimeout(function() {
      if (window.innerWidth <= 767) {
        const container = document.querySelector('.swipe-cards-container');
        if (!container) {
          location.reload();
        }
      } else {
        // On desktop, show regular grid
        const materialsList = document.querySelector('.materials_list');
        if (materialsList) materialsList.classList.remove('swipe-enabled');
        const swipeContainer = document.querySelector('.swipe-cards-container');
        if (swipeContainer) swipeContainer.style.display = 'none';
      }
    }, 250);
  });

})();
