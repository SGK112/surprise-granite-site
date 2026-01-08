/**
 * Surprise Granite - Unified Favorites System
 * Adds favorite/heart buttons to all product cards across the site
 * Works with: Flooring, Countertops, Tile, Shop products
 */

(function() {
  'use strict';

  // Supabase config
  const SUPABASE_URL = 'https://ypeypgwsycxcagncgdur.supabase.co';
  const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlwZXlwZ3dzeWN4Y2FnbmNnZHVyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njc3NTQ4MjMsImV4cCI6MjA4MzMzMDgyM30.R13pNv2FDtGhfeu7gUcttYNrQAbNYitqR4FIq3O2-ME';

  let supabaseClient = null;
  let currentUser = null;
  let favorites = {
    flooring: [],
    countertop: [],
    tile: [],
    cabinet: [],
    sink: [],
    shop: []
  };

  // Detect page/product type from URL
  function detectProductType() {
    const path = window.location.pathname.toLowerCase();

    if (path.includes('flooring')) return 'flooring';
    if (path.includes('countertop') || path.includes('granite') || path.includes('marble') || path.includes('quartz') || path.includes('porcelain-countertop')) return 'countertop';
    if (path.includes('tile')) return 'tile';
    if (path.includes('cabinet')) return 'cabinet';
    if (path.includes('sink')) return 'sink';
    if (path.includes('shop')) return 'shop';

    return 'general';
  }

  // Initialize
  document.addEventListener('DOMContentLoaded', init);

  async function init() {
    // Initialize Supabase
    await initSupabase();

    // Load all favorites
    await loadAllFavorites();

    // Add heart buttons to product cards
    addHeartButtonsToProducts();

    // Add floating favorites badge
    addFavoritesBadge();

    // Re-run when DOM changes (for dynamically loaded content)
    observeDOMChanges();
  }

  async function initSupabase() {
    try {
      if (window.supabase && window.supabase.createClient) {
        supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
        const { data: { session } } = await supabaseClient.auth.getSession();
        if (session) {
          currentUser = session.user;
          console.log('Favorites: User logged in', currentUser.email);
        }
      }
    } catch (e) {
      console.log('Favorites: Supabase not available');
    }
  }

  async function loadAllFavorites() {
    // Load from Supabase if logged in
    if (currentUser && supabaseClient) {
      try {
        const { data, error } = await supabaseClient
          .from('user_favorites')
          .select('*')
          .eq('user_id', currentUser.id)
          .order('created_at', { ascending: false });

        if (!error && data) {
          // Group by product type
          data.forEach(fav => {
            const type = fav.product_type || 'general';
            if (!favorites[type]) favorites[type] = [];
            favorites[type].push({
              dbId: fav.id,
              title: fav.product_title,
              url: fav.product_url,
              image: fav.product_image,
              material: fav.product_material,
              color: fav.product_color
            });
          });
          console.log('Favorites: Loaded from Supabase');
          return;
        }
      } catch (e) {
        console.log('Favorites: Error loading from Supabase', e);
      }
    }

    // Fallback to localStorage
    try {
      const stored = localStorage.getItem('sg_all_favorites');
      if (stored) {
        const parsed = JSON.parse(stored);
        Object.assign(favorites, parsed);
      }

      // Also check legacy storage keys
      const legacyFlooring = localStorage.getItem('sg_flooring_favorites');
      const legacyCountertop = localStorage.getItem('sg_countertop_favorites');

      if (legacyFlooring) {
        favorites.flooring = JSON.parse(legacyFlooring);
      }
      if (legacyCountertop) {
        favorites.countertop = JSON.parse(legacyCountertop);
      }

      console.log('Favorites: Loaded from localStorage');
    } catch (e) {
      console.log('Favorites: Error loading from localStorage', e);
    }
  }

  function saveToLocalStorage() {
    try {
      localStorage.setItem('sg_all_favorites', JSON.stringify(favorites));

      // Also save to legacy keys for backwards compatibility
      localStorage.setItem('sg_flooring_favorites', JSON.stringify(favorites.flooring || []));
      localStorage.setItem('sg_countertop_favorites', JSON.stringify(favorites.countertop || []));
    } catch (e) {
      console.log('Favorites: Error saving to localStorage', e);
    }
  }

  async function saveFavoriteToSupabase(product, productType) {
    if (!currentUser || !supabaseClient) {
      saveToLocalStorage();
      return null;
    }

    try {
      const { data, error } = await supabaseClient
        .from('user_favorites')
        .insert({
          user_id: currentUser.id,
          product_type: productType,
          product_title: product.title,
          product_url: product.url,
          product_image: product.image,
          product_material: product.material || '',
          product_color: product.color || ''
        })
        .select()
        .single();

      if (!error && data) {
        return data.id;
      }
    } catch (e) {
      console.log('Favorites: Error saving to Supabase', e);
    }

    saveToLocalStorage();
    return null;
  }

  async function removeFavoriteFromSupabase(dbId) {
    if (!currentUser || !supabaseClient || !dbId) {
      saveToLocalStorage();
      return;
    }

    try {
      await supabaseClient
        .from('user_favorites')
        .delete()
        .eq('id', dbId);
    } catch (e) {
      console.log('Favorites: Error removing from Supabase', e);
    }
  }

  // Find all product cards on the page
  function findProductCards() {
    const selectors = [
      // Materials/CMS products (flooring, countertops, tile)
      '.materials_item',
      '.materials_list > .w-dyn-item',
      '.w-dyn-list .w-dyn-item:has(.product-thumb_item)',
      '.w-dyn-item:has(.materials_image-wrapper)',
      // Shop products
      '.shop-product-card',
      '.product-card',
      // Generic product containers
      '[data-product-card]',
      '.product-thumb_item'
    ];

    const cards = new Set();

    selectors.forEach(selector => {
      try {
        document.querySelectorAll(selector).forEach(el => {
          // Make sure it's a real product card with an image
          if (el.querySelector('img') || el.querySelector('.materials_image-wrapper')) {
            cards.add(el);
          }
        });
      } catch (e) {
        // Selector not supported
      }
    });

    return Array.from(cards);
  }

  // Extract product data from a card element
  function extractProductData(card) {
    // Try to find the link
    const link = card.querySelector('a[href*="/"]') || card.querySelector('a');
    const url = link ? link.href : window.location.href;

    // Try to find images
    const images = card.querySelectorAll('img');
    let image = '';
    if (images.length > 0) {
      // Prefer primary image or first image
      const primaryImg = Array.from(images).find(img => img.classList.contains('is-primary'));
      image = primaryImg ? primaryImg.src : images[0].src;
    }

    // Try to find title
    let title = '';
    const titleEl = card.querySelector('[fs-cmsfilter-field="Keyword"]') ||
                    card.querySelector('.product-title') ||
                    card.querySelector('h3') ||
                    card.querySelector('h4') ||
                    card.querySelector('.text-weight-bold');
    if (titleEl) {
      title = titleEl.textContent.trim();
    } else if (link && link.title) {
      title = link.title;
    } else if (images[0] && images[0].alt) {
      title = images[0].alt;
    }

    // Try to find material/type
    const materialEl = card.querySelector('[fs-cmsfilter-field="material"]') ||
                       card.querySelector('[fs-cmsfilter-field="Material"]');
    const material = materialEl ? materialEl.textContent.trim() : '';

    // Try to find color
    const colorEl = card.querySelector('[fs-cmsfilter-field="main-color"]') ||
                    card.querySelector('[fs-cmsfilter-field="Main Color"]');
    const color = colorEl ? colorEl.textContent.trim() : '';

    return { title, url, image, material, color };
  }

  // Add heart buttons to all product cards
  function addHeartButtonsToProducts() {
    const productType = detectProductType();
    const cards = findProductCards();

    cards.forEach(card => {
      // Skip if already has heart button
      if (card.querySelector('.sg-favorite-btn')) return;

      // Find the image wrapper to position the heart
      const imageWrapper = card.querySelector('.materials_image-wrapper') ||
                          card.querySelector('.product-image-wrapper') ||
                          card.querySelector('img')?.parentElement;

      if (!imageWrapper) return;

      // Extract product data
      const product = extractProductData(card);
      if (!product.title && !product.image) return;

      // Check if already favorited
      const typeList = favorites[productType] || [];
      const isFavorited = typeList.some(f =>
        f.title === product.title || f.url === product.url
      );

      // Create heart button
      const heartBtn = document.createElement('button');
      heartBtn.className = 'sg-favorite-btn' + (isFavorited ? ' is-favorited' : '');
      heartBtn.setAttribute('aria-label', isFavorited ? 'Remove from favorites' : 'Add to favorites');
      heartBtn.innerHTML = `
        <svg viewBox="0 0 24 24" class="heart-icon">
          <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
        </svg>
      `;

      // Store product data on button
      heartBtn.dataset.product = JSON.stringify(product);
      heartBtn.dataset.productType = productType;

      // Click handler
      heartBtn.addEventListener('click', async function(e) {
        e.preventDefault();
        e.stopPropagation();

        await toggleFavorite(this, product, productType);
      });

      // Position wrapper
      imageWrapper.style.position = 'relative';
      imageWrapper.appendChild(heartBtn);

      // Add double-tap support for touch devices
      let lastTap = 0;
      imageWrapper.addEventListener('touchend', function(e) {
        const currentTime = new Date().getTime();
        const tapLength = currentTime - lastTap;
        if (tapLength < 300 && tapLength > 0) {
          e.preventDefault();
          toggleFavorite(heartBtn, product, productType);
          showHeartAnimation(imageWrapper);
        }
        lastTap = currentTime;
      });
    });

    console.log(`Favorites: Added hearts to ${cards.length} products`);
  }

  async function toggleFavorite(btnElement, product, productType) {
    if (!favorites[productType]) favorites[productType] = [];

    const typeList = favorites[productType];
    const existingIndex = typeList.findIndex(f =>
      f.title === product.title || f.url === product.url
    );

    if (existingIndex >= 0) {
      // Remove from favorites
      const removed = typeList.splice(existingIndex, 1)[0];
      if (removed && removed.dbId) {
        await removeFavoriteFromSupabase(removed.dbId);
      }
      btnElement.classList.remove('is-favorited');
      btnElement.setAttribute('aria-label', 'Add to favorites');

      // Haptic feedback
      if (navigator.vibrate) navigator.vibrate(30);
    } else {
      // Add to favorites
      const newFav = { ...product };
      const dbId = await saveFavoriteToSupabase(product, productType);
      if (dbId) newFav.dbId = dbId;

      typeList.push(newFav);
      btnElement.classList.add('is-favorited');
      btnElement.setAttribute('aria-label', 'Remove from favorites');

      // Haptic feedback
      if (navigator.vibrate) navigator.vibrate([30, 50, 30]);
    }

    saveToLocalStorage();
    updateFavoritesBadge();
  }

  function showHeartAnimation(container) {
    const heart = document.createElement('div');
    heart.className = 'sg-double-tap-heart';
    heart.innerHTML = `
      <svg viewBox="0 0 24 24">
        <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
      </svg>
    `;
    container.appendChild(heart);
    setTimeout(() => heart.remove(), 800);
  }

  // Floating favorites badge
  function addFavoritesBadge() {
    // Don't add if already exists
    if (document.getElementById('sg-favorites-badge')) return;

    const totalCount = getTotalFavoritesCount();

    const badge = document.createElement('a');
    badge.id = 'sg-favorites-badge';
    badge.href = '/account/#favorites';
    badge.className = 'sg-favorites-badge' + (totalCount > 0 ? ' has-items' : '');
    badge.innerHTML = `
      <svg viewBox="0 0 24 24" class="badge-heart">
        <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
      </svg>
      <span class="badge-count">${totalCount}</span>
    `;

    document.body.appendChild(badge);
  }

  function getTotalFavoritesCount() {
    let total = 0;
    Object.values(favorites).forEach(list => {
      if (Array.isArray(list)) total += list.length;
    });
    return total;
  }

  function updateFavoritesBadge() {
    const badge = document.getElementById('sg-favorites-badge');
    if (!badge) return;

    const count = getTotalFavoritesCount();
    const countEl = badge.querySelector('.badge-count');
    if (countEl) countEl.textContent = count;

    badge.classList.toggle('has-items', count > 0);
  }

  // Watch for dynamically loaded content
  function observeDOMChanges() {
    const observer = new MutationObserver((mutations) => {
      let shouldUpdate = false;

      mutations.forEach(mutation => {
        mutation.addedNodes.forEach(node => {
          if (node.nodeType === 1) {
            // Check if it's a product card or contains product cards
            if (node.classList?.contains('w-dyn-item') ||
                node.classList?.contains('materials_item') ||
                node.classList?.contains('shop-product-card') ||
                node.querySelector?.('.w-dyn-item, .materials_item, .shop-product-card')) {
              shouldUpdate = true;
            }
          }
        });
      });

      if (shouldUpdate) {
        // Debounce updates
        clearTimeout(window._favoritesUpdateTimeout);
        window._favoritesUpdateTimeout = setTimeout(() => {
          addHeartButtonsToProducts();
        }, 200);
      }
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true
    });
  }

  // Expose functions globally for other scripts
  window.SGFavorites = {
    add: async (product, type) => {
      if (!favorites[type]) favorites[type] = [];
      favorites[type].push(product);
      await saveFavoriteToSupabase(product, type);
      saveToLocalStorage();
      updateFavoritesBadge();
    },
    remove: async (productTitle, type) => {
      if (!favorites[type]) return;
      const index = favorites[type].findIndex(f => f.title === productTitle);
      if (index >= 0) {
        const removed = favorites[type].splice(index, 1)[0];
        if (removed?.dbId) await removeFavoriteFromSupabase(removed.dbId);
        saveToLocalStorage();
        updateFavoritesBadge();
      }
    },
    getAll: () => favorites,
    getByType: (type) => favorites[type] || [],
    getCount: getTotalFavoritesCount,
    refresh: addHeartButtonsToProducts
  };

})();
