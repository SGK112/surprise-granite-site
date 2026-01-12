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

    // Add heart to individual product detail pages
    addHeartToProductDetailPage();

    // Add floating favorites badge
    addFavoritesBadge();

    // Re-run when DOM changes (for dynamically loaded content)
    observeDOMChanges();
  }

  // Add heart button to individual product detail pages (countertops, tile, flooring)
  function addHeartToProductDetailPage() {
    const path = window.location.pathname.toLowerCase();

    // Check if this is a product detail page
    const isDetailPage = (
      (path.includes('/countertops/') && path.split('/').filter(Boolean).length >= 2) ||
      (path.includes('/tile/') && path.split('/').filter(Boolean).length >= 2) ||
      (path.includes('/flooring/') && path.split('/').filter(Boolean).length >= 2)
    );

    if (!isDetailPage) return;

    // Find the main image container
    const imageContainer = document.querySelector('.main-image-container') ||
                          document.querySelector('.product-image') ||
                          document.querySelector('.gallery') ||
                          document.querySelector('.product-grid > div:first-child');

    if (!imageContainer) return;

    // Skip if already has heart button
    if (imageContainer.querySelector('.sg-favorite-btn')) return;

    // Extract product data from the page
    const product = extractProductDataFromDetailPage();
    if (!product.title) return;

    const productType = detectProductType();

    // Check if already favorited
    const typeList = favorites[productType] || [];
    const isFavorited = typeList.some(f =>
      f.title === product.title || f.url === product.url
    );

    // Create heart button
    const heartBtn = document.createElement('button');
    heartBtn.className = 'sg-favorite-btn sg-detail-page-heart' + (isFavorited ? ' is-favorited' : '');
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
    imageContainer.style.position = 'relative';
    imageContainer.appendChild(heartBtn);

    console.log('Favorites: Added heart to product detail page');
  }

  // Extract product data from detail page (h1, meta tags, images)
  function extractProductDataFromDetailPage() {
    const title = document.querySelector('h1')?.textContent?.trim() ||
                  document.querySelector('meta[property="og:title"]')?.content ||
                  document.title.split('|')[0].trim();

    const url = window.location.href;

    const image = document.querySelector('.main-image')?.src ||
                  document.querySelector('.product-image img')?.src ||
                  document.querySelector('meta[property="og:image"]')?.content ||
                  '';

    const material = document.querySelector('[data-material]')?.textContent?.trim() ||
                     document.querySelector('.material-badge')?.textContent?.trim() ||
                     '';

    const color = document.querySelector('[data-color]')?.textContent?.trim() || '';

    return { title, url, image, material, color };
  }

  async function initSupabase() {
    // Wait for SgAuth if it's being loaded
    await waitForSgAuth();

    // Use SgAuth if available (preferred - unified auth state)
    if (window.SgAuth) {
      try {
        await window.SgAuth.init();
        if (window.SgAuth.isLoggedIn()) {
          currentUser = window.SgAuth.getUser();
          supabaseClient = window.SgAuth.getClient();
          console.log('Favorites: Using SgAuth, user:', currentUser.email);

          // Listen for auth changes
          window.SgAuth.onAuthChange((event, data) => {
            if (event === 'login') {
              currentUser = data.user;
              loadAllFavorites();
              updateAllHeartButtons();
              updateFavoritesBadge();
            } else if (event === 'logout') {
              currentUser = null;
              loadAllFavorites();
              updateAllHeartButtons();
              updateFavoritesBadge();
            }
          });
          return;
        }
      } catch (e) {
        console.log('Favorites: SgAuth init error', e);
      }
    }

    // Fallback to direct Supabase initialization
    try {
      if (window.supabase && window.supabase.createClient) {
        supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
        const { data: { session } } = await supabaseClient.auth.getSession();
        if (session) {
          currentUser = session.user;
          console.log('Favorites: User logged in (direct)', currentUser.email);
        }
      }
    } catch (e) {
      console.log('Favorites: Supabase not available');
    }
  }

  // Wait for SgAuth to be available
  function waitForSgAuth() {
    return new Promise((resolve) => {
      if (window.SgAuth) {
        resolve();
        return;
      }

      let attempts = 0;
      const check = setInterval(() => {
        attempts++;
        if (window.SgAuth) {
          clearInterval(check);
          resolve();
        } else if (attempts > 20) {
          clearInterval(check);
          resolve(); // Continue without SgAuth
        }
      }, 100);
    });
  }

  // Helper to deduplicate favorites by title or url
  function deduplicateFavorites(list) {
    const seen = new Set();
    return list.filter(item => {
      const key = item.title || item.url || '';
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
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
          // Reset favorites before loading from database
          Object.keys(favorites).forEach(key => {
            favorites[key] = [];
          });

          // Group by product type and deduplicate
          const seenTitles = new Set();
          data.forEach(fav => {
            const type = fav.product_type || 'general';
            const key = fav.product_title || fav.product_url || '';

            // Skip duplicates
            if (seenTitles.has(key)) {
              console.log('Favorites: Skipping duplicate:', key);
              return;
            }
            seenTitles.add(key);

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
          console.log('Favorites: Loaded', seenTitles.size, 'unique items from Supabase');

          // Sync localStorage with deduplicated data
          saveToLocalStorage();
          return;
        }
      } catch (e) {
        console.log('Favorites: Error loading from Supabase', e);
      }
    }

    // Fallback to localStorage (when not logged in)
    try {
      // Reset first
      Object.keys(favorites).forEach(key => {
        favorites[key] = [];
      });

      const stored = localStorage.getItem('sg_all_favorites');
      if (stored) {
        const parsed = JSON.parse(stored);
        // Deduplicate each category
        Object.keys(parsed).forEach(type => {
          if (Array.isArray(parsed[type])) {
            favorites[type] = deduplicateFavorites(parsed[type]);
          }
        });
      }

      // Also check legacy storage keys and deduplicate
      const legacyFlooring = localStorage.getItem('sg_flooring_favorites');
      const legacyCountertop = localStorage.getItem('sg_countertop_favorites');

      if (legacyFlooring) {
        const parsed = JSON.parse(legacyFlooring);
        favorites.flooring = deduplicateFavorites(parsed);
      }
      if (legacyCountertop) {
        const parsed = JSON.parse(legacyCountertop);
        favorites.countertop = deduplicateFavorites(parsed);
      }

      // Save deduplicated data back
      saveToLocalStorage();
      console.log('Favorites: Loaded from localStorage (deduplicated)');
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
                          card.querySelector('.shop-product-image-wrapper') ||
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

  // Generate share text
  function generateShareText() {
    const total = getTotalFavoritesCount();
    if (total === 0) return null;

    let text = `Check out my favorites from Surprise Granite:\n\n`;
    let itemCount = 0;

    Object.keys(favorites).forEach(type => {
      const items = favorites[type] || [];
      if (items.length > 0) {
        const typeLabel = type.charAt(0).toUpperCase() + type.slice(1);
        text += `${typeLabel}:\n`;
        items.slice(0, 5).forEach(item => {
          text += `• ${item.title}\n`;
          itemCount++;
        });
        if (items.length > 5) {
          text += `  ...and ${items.length - 5} more\n`;
        }
        text += '\n';
      }
    });

    return { text, count: total };
  }

  // Share favorites using Web Share API or clipboard
  async function shareFavorites() {
    const shareData = generateShareText();
    if (!shareData) {
      showToast('No favorites to share');
      return;
    }

    const shareUrl = window.location.origin + '/account/#favorites';
    const shareText = shareData.text + `\nView more at: ${shareUrl}`;

    // Try Web Share API first (mobile)
    if (navigator.share) {
      try {
        await navigator.share({
          title: `My Favorites (${shareData.count} items) - Surprise Granite`,
          text: shareData.text,
          url: shareUrl
        });
        return true;
      } catch (e) {
        if (e.name !== 'AbortError') {
          // Fall through to clipboard
        } else {
          return false;
        }
      }
    }

    // Fall back to clipboard
    try {
      await navigator.clipboard.writeText(shareText);
      showToast('Favorites copied to clipboard!');
      return true;
    } catch (e) {
      // Last resort: show modal with text
      showShareModal(shareText);
      return true;
    }
  }

  function showToast(message) {
    const existing = document.querySelector('.sg-toast');
    if (existing) existing.remove();

    const toast = document.createElement('div');
    toast.className = 'sg-toast';
    toast.textContent = message;
    toast.style.cssText = `
      position: fixed;
      bottom: 100px;
      left: 50%;
      transform: translateX(-50%);
      background: rgba(26, 26, 46, 0.95);
      color: #fff;
      padding: 12px 24px;
      border-radius: 12px;
      font-size: 14px;
      font-weight: 500;
      z-index: 100000;
      backdrop-filter: blur(12px);
      -webkit-backdrop-filter: blur(12px);
      animation: toastIn 0.3s ease;
    `;

    document.body.appendChild(toast);
    setTimeout(() => {
      toast.style.animation = 'toastOut 0.3s ease forwards';
      setTimeout(() => toast.remove(), 300);
    }, 2500);
  }

  function showShareModal(text) {
    const modal = document.createElement('div');
    modal.className = 'sg-share-modal';
    modal.innerHTML = `
      <div class="sg-share-modal-content">
        <div class="sg-share-modal-header">
          <h3>Share Your Favorites</h3>
          <button class="sg-share-modal-close" onclick="this.closest('.sg-share-modal').remove()">&times;</button>
        </div>
        <textarea readonly onclick="this.select()">${text}</textarea>
        <button class="sg-share-copy-btn" onclick="
          this.previousElementSibling.select();
          document.execCommand('copy');
          this.textContent = 'Copied!';
          setTimeout(() => this.textContent = 'Copy to Clipboard', 2000);
        ">Copy to Clipboard</button>
      </div>
    `;

    modal.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: rgba(0, 0, 0, 0.8);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 100000;
      padding: 20px;
    `;

    document.body.appendChild(modal);
  }

  // Request quote for all favorites
  async function requestQuote() {
    const total = getTotalFavoritesCount();
    if (total === 0) {
      showToast('No favorites to quote');
      return;
    }

    // Build items list
    const items = [];
    Object.keys(favorites).forEach(type => {
      (favorites[type] || []).forEach(item => {
        items.push({
          type: type,
          title: item.title,
          material: item.material || '',
          color: item.color || '',
          url: item.url || ''
        });
      });
    });

    // If logged in, pre-fill user info
    let userInfo = { name: '', email: '', phone: '' };
    if (currentUser) {
      userInfo.email = currentUser.email;
      // Try to get profile info
      try {
        const { data } = await supabaseClient
          .from('sg_users')
          .select('first_name, last_name, phone')
          .eq('id', currentUser.id)
          .single();
        if (data) {
          userInfo.name = `${data.first_name || ''} ${data.last_name || ''}`.trim();
          userInfo.phone = data.phone || '';
        }
      } catch (e) {}
    }

    // Show quote modal
    showQuoteModal(items, userInfo);
  }

  function showQuoteModal(items, userInfo) {
    const modal = document.createElement('div');
    modal.className = 'sg-quote-modal';
    modal.innerHTML = `
      <div class="sg-quote-modal-content">
        <div class="sg-quote-modal-header">
          <h3>Request a Quote</h3>
          <button class="sg-quote-modal-close" onclick="this.closest('.sg-quote-modal').remove()">&times;</button>
        </div>
        <p class="sg-quote-summary">${items.length} item${items.length !== 1 ? 's' : ''} selected</p>
        <form id="sg-quote-form">
          <input type="text" name="name" placeholder="Your Name" value="${userInfo.name}" required>
          <input type="email" name="email" placeholder="Email Address" value="${userInfo.email}" required>
          <input type="tel" name="phone" placeholder="Phone Number" value="${userInfo.phone}">
          <textarea name="notes" placeholder="Additional notes or project details..."></textarea>
          <button type="submit" class="sg-quote-submit">Submit Quote Request</button>
        </form>
      </div>
    `;

    modal.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: rgba(0, 0, 0, 0.8);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 100000;
      padding: 20px;
      overflow-y: auto;
    `;

    document.body.appendChild(modal);

    // Handle form submission
    modal.querySelector('#sg-quote-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const form = e.target;
      const submitBtn = form.querySelector('.sg-quote-submit');
      submitBtn.disabled = true;
      submitBtn.textContent = 'Sending...';

      try {
        const response = await fetch('https://surprise-granite-email-api.onrender.com/api/send-estimate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: form.name.value,
            email: form.email.value,
            phone: form.phone.value,
            notes: form.notes.value,
            favorites: items,
            source: 'favorites-quote'
          })
        });

        if (response.ok) {
          modal.innerHTML = `
            <div class="sg-quote-modal-content" style="text-align: center; padding: 40px;">
              <div style="font-size: 48px; margin-bottom: 16px;">✓</div>
              <h3>Quote Request Sent!</h3>
              <p style="color: rgba(255,255,255,0.7); margin: 16px 0;">We'll get back to you within 24 hours.</p>
              <button onclick="this.closest('.sg-quote-modal').remove()" style="background: #f9cb00; color: #1a1a2e; border: none; padding: 12px 28px; border-radius: 12px; font-weight: 600; cursor: pointer;">Done</button>
            </div>
          `;
        } else {
          throw new Error('Failed to send');
        }
      } catch (e) {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Submit Quote Request';
        showToast('Failed to send. Please try again.');
      }
    });
  }

  // Add CSS for modals and toasts
  const styles = document.createElement('style');
  styles.textContent = `
    @keyframes toastIn {
      from { opacity: 0; transform: translateX(-50%) translateY(20px); }
      to { opacity: 1; transform: translateX(-50%) translateY(0); }
    }
    @keyframes toastOut {
      to { opacity: 0; transform: translateX(-50%) translateY(20px); }
    }
    .sg-share-modal-content,
    .sg-quote-modal-content {
      background: linear-gradient(180deg, #1a1a2e 0%, #0d0d15 100%);
      border-radius: 20px;
      padding: 24px;
      max-width: 400px;
      width: 100%;
      color: #fff;
    }
    .sg-share-modal-header,
    .sg-quote-modal-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 16px;
    }
    .sg-share-modal-header h3,
    .sg-quote-modal-header h3 {
      margin: 0;
      font-size: 20px;
    }
    .sg-share-modal-close,
    .sg-quote-modal-close {
      background: none;
      border: none;
      color: #fff;
      font-size: 28px;
      cursor: pointer;
      opacity: 0.7;
    }
    .sg-share-modal-content textarea {
      width: 100%;
      height: 200px;
      background: rgba(255,255,255,0.05);
      border: 1px solid rgba(255,255,255,0.1);
      border-radius: 12px;
      padding: 12px;
      color: #fff;
      font-size: 13px;
      resize: none;
      margin-bottom: 16px;
    }
    .sg-share-copy-btn {
      width: 100%;
      background: #f9cb00;
      color: #1a1a2e;
      border: none;
      padding: 14px;
      border-radius: 12px;
      font-weight: 600;
      cursor: pointer;
    }
    .sg-quote-summary {
      color: rgba(255,255,255,0.7);
      margin-bottom: 20px;
    }
    #sg-quote-form input,
    #sg-quote-form textarea {
      width: 100%;
      background: rgba(255,255,255,0.05);
      border: 1px solid rgba(255,255,255,0.1);
      border-radius: 12px;
      padding: 14px;
      color: #fff;
      font-size: 15px;
      margin-bottom: 12px;
      outline: none;
    }
    #sg-quote-form input:focus,
    #sg-quote-form textarea:focus {
      border-color: rgba(249, 203, 0, 0.5);
    }
    #sg-quote-form textarea {
      height: 100px;
      resize: none;
    }
    .sg-quote-submit {
      width: 100%;
      background: #f9cb00;
      color: #1a1a2e;
      border: none;
      padding: 16px;
      border-radius: 12px;
      font-weight: 600;
      font-size: 16px;
      cursor: pointer;
    }
    .sg-quote-submit:disabled {
      opacity: 0.6;
      cursor: not-allowed;
    }
  `;
  document.head.appendChild(styles);

  // Clear ALL favorites from everywhere - nuclear option
  async function clearAllFavorites() {
    console.log('Favorites: Clearing ALL favorites from all sources');

    // 1. Clear from Supabase if logged in
    if (currentUser && supabaseClient) {
      try {
        const { error } = await supabaseClient
          .from('user_favorites')
          .delete()
          .eq('user_id', currentUser.id);

        if (error) {
          console.error('Favorites: Error clearing from Supabase', error);
        } else {
          console.log('Favorites: Cleared from Supabase');
        }
      } catch (e) {
        console.error('Favorites: Exception clearing from Supabase', e);
      }
    }

    // 2. Clear ALL localStorage keys related to favorites
    const keysToRemove = [
      'sg_all_favorites',
      'sg_flooring_favorites',
      'sg_countertop_favorites',
      'sg_tile_favorites',
      'sg_cabinet_favorites',
      'sg_sink_favorites',
      'sg_shop_favorites',
      'sg_general_favorites',
      // Legacy/alternate keys that might exist
      'favorites',
      'userFavorites',
      'sg_favorites'
    ];

    keysToRemove.forEach(key => {
      try {
        localStorage.removeItem(key);
      } catch (e) {}
    });

    // Also clear any keys that start with 'sg_' and contain 'favorite'
    try {
      Object.keys(localStorage).forEach(key => {
        if (key.toLowerCase().includes('favorite')) {
          localStorage.removeItem(key);
          console.log('Favorites: Removed localStorage key:', key);
        }
      });
    } catch (e) {}

    // 3. Reset in-memory favorites object
    Object.keys(favorites).forEach(key => {
      favorites[key] = [];
    });

    // 4. Update all heart buttons on page to unfavorited state
    document.querySelectorAll('.sg-favorite-btn.is-favorited').forEach(btn => {
      btn.classList.remove('is-favorited');
      btn.setAttribute('aria-label', 'Add to favorites');
    });

    // 5. Update the badge
    updateFavoritesBadge();

    console.log('Favorites: All favorites cleared successfully');
    showToast('All favorites cleared');

    return true;
  }

  // Update all heart buttons to reflect current favorites state
  function updateAllHeartButtons() {
    document.querySelectorAll('.sg-favorite-btn').forEach(btn => {
      try {
        const productData = btn.dataset.product ? JSON.parse(btn.dataset.product) : null;
        const productType = btn.dataset.productType || 'general';

        if (productData) {
          const typeList = favorites[productType] || [];
          const isFavorited = typeList.some(f =>
            f.title === productData.title || f.url === productData.url
          );

          if (isFavorited) {
            btn.classList.add('is-favorited');
            btn.setAttribute('aria-label', 'Remove from favorites');
          } else {
            btn.classList.remove('is-favorited');
            btn.setAttribute('aria-label', 'Add to favorites');
          }
        }
      } catch (e) {}
    });
  }

  // Expose functions globally for other scripts
  window.SGFavorites = {
    add: async (product, type) => {
      if (!favorites[type]) favorites[type] = [];
      // Check for duplicates before adding
      const exists = favorites[type].some(f => f.title === product.title || f.url === product.url);
      if (exists) {
        console.log('Favorites: Item already exists, skipping');
        return;
      }
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
        updateAllHeartButtons();
      }
    },
    clearAll: clearAllFavorites,
    getAll: () => favorites,
    getByType: (type) => favorites[type] || [],
    getCount: getTotalFavoritesCount,
    refresh: () => {
      addHeartButtonsToProducts();
      updateAllHeartButtons();
    },
    updateButtons: updateAllHeartButtons,
    share: shareFavorites,
    requestQuote: requestQuote
  };

})();
