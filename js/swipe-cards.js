/**
 * Swipe Cards - Tinder-style product browsing
 * "Swipe Right for Your Perfect Floor!"
 * With Supabase integration for logged-in users
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

  // Wait for DOM
  document.addEventListener('DOMContentLoaded', init);

  let cards = [];
  let currentIndex = 0;
  let favorites = [];
  let swipeHistory = [];
  let startX, startY, currentX, currentY;
  let isDragging = false;

  async function init() {
    const materialsList = document.querySelector('.materials_list');
    if (!materialsList) return;

    // Initialize Supabase
    await initSupabase();

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

    // Load existing favorites
    await loadFavorites();

    // Create swipe UI
    createSwipeUI();
    renderCards();
    showInstructions();
  }

  async function initSupabase() {
    try {
      // Check if Supabase is loaded
      if (window.supabase && window.supabase.createClient) {
        supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

        // Check for existing session
        const { data: { session } } = await supabaseClient.auth.getSession();
        if (session) {
          currentUser = session.user;
          console.log('Swipe Cards: User logged in', currentUser.email);
        }
      }
    } catch (e) {
      console.log('Swipe Cards: Supabase not available, using localStorage');
    }
  }

  async function loadFavorites() {
    // Try to load from Supabase first if logged in
    if (currentUser && supabaseClient) {
      try {
        const { data, error } = await supabaseClient
          .from('user_favorites')
          .select('*')
          .eq('user_id', currentUser.id)
          .eq('product_type', 'flooring')
          .order('created_at', { ascending: false });

        if (!error && data) {
          favorites = data.map(fav => ({
            dbId: fav.id,
            id: fav.id,
            href: fav.product_url,
            image: fav.product_image,
            title: fav.product_title,
            material: fav.product_material,
            color: fav.product_color,
            thickness: fav.product_thickness,
            wearLayer: fav.product_wear_layer,
            shadeVariations: fav.product_shade_variations
          }));
          console.log('Swipe Cards: Loaded', favorites.length, 'favorites from Supabase');
          return;
        }
      } catch (e) {
        console.log('Error loading from Supabase:', e);
      }
    }

    // Fallback to localStorage
    try {
      const stored = localStorage.getItem('sg_flooring_favorites');
      if (stored) {
        favorites = JSON.parse(stored);
        console.log('Swipe Cards: Loaded', favorites.length, 'favorites from localStorage');
      }
    } catch (e) {
      console.log('Error loading from localStorage:', e);
    }
  }

  async function saveFavoriteToSupabase(card) {
    if (!currentUser || !supabaseClient) {
      // Save to localStorage for guests
      saveToLocalStorage();
      return;
    }

    try {
      const { data, error } = await supabaseClient
        .from('user_favorites')
        .insert({
          user_id: currentUser.id,
          product_type: 'flooring',
          product_title: card.title,
          product_url: card.href,
          product_image: card.image,
          product_material: card.material,
          product_color: card.color,
          product_thickness: card.thickness,
          product_wear_layer: card.wearLayer,
          product_shade_variations: card.shadeVariations
        })
        .select()
        .single();

      if (!error && data) {
        // Update local favorite with DB id
        const localFav = favorites.find(f => f.title === card.title && f.href === card.href);
        if (localFav) {
          localFav.dbId = data.id;
        }
        console.log('Swipe Cards: Saved to Supabase');
      }
    } catch (e) {
      console.log('Error saving to Supabase:', e);
      saveToLocalStorage();
    }
  }

  async function removeFavoriteFromSupabase(card) {
    if (!currentUser || !supabaseClient || !card.dbId) {
      saveToLocalStorage();
      return;
    }

    try {
      await supabaseClient
        .from('user_favorites')
        .delete()
        .eq('id', card.dbId);
      console.log('Swipe Cards: Removed from Supabase');
    } catch (e) {
      console.log('Error removing from Supabase:', e);
    }
  }

  function saveToLocalStorage() {
    try {
      localStorage.setItem('sg_flooring_favorites', JSON.stringify(favorites));
    } catch (e) {
      console.log('Error saving to localStorage:', e);
    }
  }

  function createSwipeUI() {
    const container = document.querySelector('.materials_collection-list-wrapper');
    if (!container) return;

    // Add swipe mode class (for hiding chatbots)
    document.body.classList.add('swipe-mode');

    // Auto-scroll to swipe area after a short delay
    setTimeout(() => {
      const swipeContainer = document.querySelector('.swipe-cards-container');
      if (swipeContainer) {
        swipeContainer.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }, 500);

    const loginPrompt = !currentUser ? `
      <div class="swipe-login-prompt" id="login-prompt" style="display: none;">
        <p>Login to save your favorites to your account!</p>
        <a href="/account/" class="swipe-login-btn">Login / Sign Up</a>
      </div>
    ` : '';

    const swipeHTML = `
      <div class="swipe-cards-container">
        <div class="swipe-card-stack"></div>
        <div class="swipe-actions">
          <button class="swipe-btn undo" title="Undo" onclick="window.swipeUndo()">
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
              <path d="M3 10h10a5 5 0 0 1 5 5v2"></path>
              <path d="M3 10l4-4"></path>
              <path d="M3 10l4 4"></path>
            </svg>
          </button>
          <button class="swipe-btn nope" title="Skip" onclick="window.swipeLeft()">
            <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
          <button class="swipe-btn like" title="Save" onclick="window.swipeRight()">
            <svg width="36" height="36" viewBox="0 0 24 24" fill="currentColor">
              <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path>
            </svg>
          </button>
        </div>
        <div class="swipe-counter">
          <strong id="swipe-current">1</strong> of <strong id="swipe-total">${cards.length}</strong> floors
        </div>
        ${loginPrompt}
      </div>
      <div class="favorites-drawer" id="favorites-drawer">
        <div class="favorites-drawer-handle" onclick="window.toggleFavorites()">
          <span class="favorites-drawer-title">
            ${currentUser ? '<svg width="16" height="16" viewBox="0 0 24 24" fill="#22c55e" style="vertical-align: middle; margin-right: 4px;"><circle cx="12" cy="12" r="10"/></svg>' : ''}
            Your Favorites <span class="favorites-count" id="favorites-count">${favorites.length}</span>
          </span>
        </div>
        <div class="favorites-list" id="favorites-list"></div>
        ${favorites.length > 0 ? `
          <div class="favorites-actions">
            <a href="/account/#saved-floors" class="favorites-view-all">View All in Account</a>
          </div>
        ` : ''}
      </div>
    `;

    container.insertAdjacentHTML('afterbegin', swipeHTML);
    updateFavorites();
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

  async function swipeCardOut(cardEl, direction) {
    const cardId = parseInt(cardEl.dataset.id);
    const card = cards.find(c => c.id === cardId);

    // Save to history for undo
    swipeHistory.push({ index: currentIndex, direction, card: card });

    // Add animation class
    cardEl.classList.add(`swipe-out-${direction}`);

    // If liked, add to favorites
    if (direction === 'right' && card) {
      favorites.push(card);
      updateFavorites();

      // Save to Supabase or localStorage
      await saveFavoriteToSupabase(card);

      // Show login prompt for guests (first time)
      if (!currentUser && favorites.length === 1) {
        const prompt = document.getElementById('login-prompt');
        if (prompt) {
          prompt.style.display = 'block';
          setTimeout(() => prompt.style.display = 'none', 5000);
        }
      }

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

    // Also save to localStorage as backup
    saveToLocalStorage();
  }

  function showEmptyState() {
    const stack = document.querySelector('.swipe-card-stack');
    if (!stack) return;

    const accountLink = currentUser
      ? `<a href="/account/#saved-floors" class="swipe-view-saved-btn">View Saved Floors</a>`
      : `<a href="/account/" class="swipe-view-saved-btn">Login to Save Favorites</a>`;

    stack.innerHTML = `
      <div class="swipe-empty">
        <div class="swipe-empty-icon">&#127881;</div>
        <h3>You've seen all ${cards.length} floors!</h3>
        <p>You saved ${favorites.length} to your favorites</p>
        <button class="swipe-reset-btn" onclick="window.swipeReset()">Start Over</button>
        ${favorites.length > 0 ? accountLink : ''}
      </div>
    `;
  }

  function showInstructions() {
    const container = document.querySelector('.swipe-cards-container');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = 'swipe-instructions';
    toast.innerHTML = '&#128072; Swipe left to skip &bull; Swipe right to save &#128073;';
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

  window.swipeUndo = async function() {
    if (swipeHistory.length === 0) return;

    const last = swipeHistory.pop();
    currentIndex = last.index;

    // Remove from favorites if it was liked
    if (last.direction === 'right' && last.card) {
      const removedFav = favorites.pop();
      if (removedFav) {
        await removeFavoriteFromSupabase(removedFav);
      }
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

  window.exitSwipeMode = function() {
    // Remove swipe mode class
    document.body.classList.remove('swipe-mode');

    // Hide swipe container
    const swipeContainer = document.querySelector('.swipe-cards-container');
    const favDrawer = document.getElementById('favorites-drawer');
    if (swipeContainer) swipeContainer.style.display = 'none';
    if (favDrawer) favDrawer.style.display = 'none';

    // Show the regular grid
    const materialsList = document.querySelector('.materials_list');
    if (materialsList) materialsList.classList.remove('swipe-enabled');

    // Scroll to products section
    const productsSection = document.querySelector('.section_filters1, .materials_collection-list-wrapper');
    if (productsSection) {
      productsSection.scrollIntoView({ behavior: 'smooth' });
    }
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
