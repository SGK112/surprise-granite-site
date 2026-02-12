/**
 * Surprise Granite - Site-Wide Search
 * Hooks into navbar search bar AND provides Cmd+K modal
 * Searches against /data/site-search.json index
 */

(function() {
  'use strict';

  let searchIndex = [];
  let isModalOpen = false;
  let selectedIndex = -1;
  let currentResults = [];

  // Category configuration
  const CATEGORIES = {
    product: { label: 'Product', color: '#f9cb00' },
    countertops: { label: 'Countertops', color: '#6366f1' },
    tile: { label: 'Tile', color: '#8b5cf6' },
    flooring: { label: 'Flooring', color: '#d946ef' },
    blog: { label: 'Blog', color: '#f43f5e' },
    tool: { label: 'Tools', color: '#f97316' },
    service: { label: 'Services', color: '#eab308' },
    vendor: { label: 'Vendors', color: '#22c55e' },
    company: { label: 'Company', color: '#14b8a6' },
    category: { label: 'Categories', color: '#06b6d4' },
    page: { label: 'Pages', color: '#64748b' },
    financing: { label: 'Financing', color: '#10b981' },
    legal: { label: 'Legal', color: '#94a3b8' }
  };

  // Initialize on DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  async function init() {
    await loadSearchIndex();
    createModalUI();
    hookNavbarSearch();
    setupKeyboardShortcuts();
  }

  async function loadSearchIndex() {
    try {
      const response = await fetch('/data/site-search.json');
      if (!response.ok) {
        searchIndex = [];
        return;
      }
      const data = await response.json();
      searchIndex = Array.isArray(data) ? data : (data.items || []);
    } catch (e) {
      searchIndex = [];
    }
  }

  // ─── Navbar Search Integration ────────────────────────────────
  function hookNavbarSearch() {
    const navInput = document.getElementById('site-search-input');
    if (!navInput) return;

    const resultsDiv = document.getElementById('site-search-results');
    if (!resultsDiv) return;

    // Store original results HTML for restore
    const originalResultsHTML = resultsDiv.innerHTML;

    let debounceTimer;
    navInput.addEventListener('input', () => {
      clearTimeout(debounceTimer);
      const query = navInput.value.trim().toLowerCase();

      if (!query) {
        // Restore original Webflow content
        resultsDiv.innerHTML = originalResultsHTML;
        return;
      }

      debounceTimer = setTimeout(() => {
        renderNavbarResults(resultsDiv, query);
      }, 150);
    });

    // Also disable Finsweet filtering on this input so it doesn't conflict
    navInput.removeAttribute('fs-cmsfilter-field');
  }

  function renderNavbarResults(container, query) {
    let results = searchIndex.filter(item => {
      const searchText = [
        item.title,
        item.description,
        item.vendor,
        item.brand,
        item.color,
        item.material
      ].filter(Boolean).join(' ').toLowerCase();
      return searchText.includes(query);
    });

    // Sort: title-starts-with first
    results.sort((a, b) => {
      const aTitle = (a.title || '').toLowerCase();
      const bTitle = (b.title || '').toLowerCase();
      const aStarts = aTitle.startsWith(query);
      const bStarts = bTitle.startsWith(query);
      if (aStarts && !bStarts) return -1;
      if (!aStarts && bStarts) return 1;
      return 0;
    });

    results = results.slice(0, 30);

    if (results.length === 0) {
      container.innerHTML = `
        <div style="padding: 40px 20px; text-align: center; color: #6b7280;">
          <p style="font-weight: 600; margin: 0 0 4px;">No results found</p>
          <p style="font-size: 13px; margin: 0;">Try different keywords</p>
        </div>`;
      return;
    }

    container.innerHTML = `
      <div class="nav-search_category-header">
        <div class="text-size-regular text-weight-bold">Search Results (${results.length}${results.length >= 30 ? '+' : ''})</div>
      </div>
      <div class="nav-search_category-list" style="max-height: 60vh; overflow-y: auto;">
        ${results.map(item => {
          const cat = CATEGORIES[item.type] || CATEGORIES.page;
          const highlighted = highlightMatch(item.title || '', query);
          const hasImage = item.image && item.image.length > 10;
          return `
            <a href="${item.url}" class="nav-search_search-result" style="display: flex; gap: 12px; padding: 10px 16px; text-decoration: none; color: inherit; border-bottom: 1px solid #f3f4f6; align-items: center; transition: background 0.15s;"
               onmouseover="this.style.background='#f9fafb'" onmouseout="this.style.background='transparent'">
              ${hasImage
                ? `<img src="${item.image}" alt="" loading="lazy" style="width: 48px; height: 48px; border-radius: 8px; object-fit: cover; flex-shrink: 0; background: #f3f4f6;">`
                : `<div style="width: 48px; height: 48px; border-radius: 8px; background: #f3f4f6; flex-shrink: 0; display: flex; align-items: center; justify-content: center;">
                    <svg width="20" height="20" fill="none" stroke="#9ca3af" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"/></svg>
                  </div>`
              }
              <div style="flex: 1; min-width: 0;">
                <div style="font-size: 14px; font-weight: 600; color: #1f2937; display: flex; align-items: center; gap: 8px;">
                  <span>${highlighted}</span>
                  <span style="font-size: 10px; padding: 2px 8px; border-radius: 10px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; background: ${cat.color}15; color: ${cat.color};">${cat.label}</span>
                </div>
                ${item.vendor || item.material ? `<div style="font-size: 12px; color: #9ca3af; margin-top: 2px;">${[item.vendor, item.material].filter(Boolean).join(' &bull; ')}</div>` : ''}
              </div>
            </a>`;
        }).join('')}
      </div>`;
  }

  // ─── Modal Search (Cmd+K) ─────────────────────────────────────
  function createModalUI() {
    const style = document.createElement('style');
    style.id = 'site-search-modal-styles';
    style.textContent = `
      .ss-overlay { position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.6); backdrop-filter: blur(8px); z-index: 100000; display: none; align-items: flex-start; justify-content: center; padding: 8vh 20px 20px; overflow-y: auto; }
      .ss-overlay.open { display: flex; }
      .ss-modal { width: 100%; max-width: 680px; background: #fff; border-radius: 16px; box-shadow: 0 25px 60px rgba(0,0,0,0.3); overflow: hidden; animation: ssSlideIn 0.2s ease-out; }
      @keyframes ssSlideIn { from { opacity: 0; transform: translateY(-20px) scale(0.98); } to { opacity: 1; transform: translateY(0) scale(1); } }
      .ss-header { display: flex; align-items: center; padding: 16px 20px; border-bottom: 1px solid #e5e7eb; gap: 12px; }
      .ss-icon { color: #9ca3af; flex-shrink: 0; }
      .ss-icon svg { width: 20px; height: 20px; }
      .ss-input { flex: 1; border: none; outline: none; font-size: 18px; color: #1f2937; background: transparent; }
      .ss-input::placeholder { color: #9ca3af; }
      .ss-close { background: #f3f4f6; border: none; padding: 6px 12px; border-radius: 6px; font-size: 12px; color: #6b7280; cursor: pointer; font-weight: 600; }
      .ss-close:hover { background: #e5e7eb; }
      .ss-results { max-height: 60vh; overflow-y: auto; }
      .ss-results::-webkit-scrollbar { width: 6px; }
      .ss-results::-webkit-scrollbar-thumb { background: #d1d5db; border-radius: 3px; }
      .ss-empty { padding: 60px 20px; text-align: center; color: #6b7280; }
      .ss-empty svg { width: 48px; height: 48px; color: #d1d5db; margin-bottom: 16px; }
      .ss-empty h3 { font-size: 16px; font-weight: 600; color: #374151; margin: 0 0 8px; }
      .ss-empty p { font-size: 14px; margin: 0; }
      .ss-item { display: flex; gap: 14px; padding: 14px 20px; text-decoration: none; color: inherit; transition: background 0.15s; border-bottom: 1px solid #f3f4f6; }
      .ss-item:hover, .ss-item.selected { background: #f9fafb; }
      .ss-item-img { width: 56px; height: 56px; border-radius: 10px; overflow: hidden; flex-shrink: 0; background: #f3f4f6; }
      .ss-item-img img { width: 100%; height: 100%; object-fit: cover; }
      .ss-item-img.no-img { display: flex; align-items: center; justify-content: center; }
      .ss-item-img.no-img svg { width: 24px; height: 24px; color: #9ca3af; }
      .ss-item-title { font-size: 15px; font-weight: 600; color: #1f2937; margin: 0 0 4px; display: flex; align-items: center; gap: 8px; }
      .ss-item-title mark { background: #fef3c7; color: inherit; border-radius: 2px; padding: 0 2px; }
      .ss-badge { font-size: 10px; padding: 2px 8px; border-radius: 10px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; }
      .ss-desc { font-size: 13px; color: #6b7280; margin: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
      .ss-meta { font-size: 12px; color: #9ca3af; margin: 4px 0 0; }
      .ss-footer { padding: 12px 20px; border-top: 1px solid #e5e7eb; display: flex; justify-content: space-between; align-items: center; font-size: 12px; color: #9ca3af; background: #f9fafb; }
      .ss-footer kbd { background: #e5e7eb; padding: 2px 6px; border-radius: 4px; font-family: inherit; margin: 0 2px; }
      @media (max-width: 640px) { .ss-overlay { padding: 0; } .ss-modal { max-width: 100%; border-radius: 0; min-height: 100vh; } .ss-results { max-height: calc(100vh - 150px); } .ss-footer { display: none; } }
    `;
    document.head.appendChild(style);

    const overlay = document.createElement('div');
    overlay.className = 'ss-overlay';
    overlay.id = 'ssOverlay';
    overlay.innerHTML = `
      <div class="ss-modal" onclick="event.stopPropagation()">
        <div class="ss-header">
          <div class="ss-icon">
            <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/>
            </svg>
          </div>
          <input type="text" class="ss-input" id="ssInput" placeholder="Search countertops, blog, tools..." autocomplete="off">
          <button class="ss-close" onclick="SiteSearch.close()">ESC</button>
        </div>
        <div class="ss-results" id="ssResults">
          <div class="ss-empty">
            <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/>
            </svg>
            <h3>Search our site</h3>
            <p>Find countertops, blog posts, tools, and more</p>
          </div>
        </div>
        <div class="ss-footer">
          <span><kbd>&uarr;</kbd><kbd>&darr;</kbd> to navigate</span>
          <span><kbd>&crarr;</kbd> to select</span>
          <span><kbd>esc</kbd> to close</span>
        </div>
      </div>`;
    document.body.appendChild(overlay);

    // Overlay click to close
    overlay.onclick = (e) => { if (e.target === overlay) closeModal(); };

    // Modal input handler
    const modalInput = document.getElementById('ssInput');
    let debounceTimer;
    modalInput.oninput = () => {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => performModalSearch(modalInput.value), 150);
    };
  }

  function setupKeyboardShortcuts() {
    document.addEventListener('keydown', (e) => {
      // Cmd/Ctrl + K to open modal
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        openModal();
      }
      // Escape to close
      if (e.key === 'Escape' && isModalOpen) {
        closeModal();
      }
      // Arrow navigation in modal
      if (isModalOpen && currentResults.length > 0) {
        if (e.key === 'ArrowDown') {
          e.preventDefault();
          selectedIndex = Math.min(selectedIndex + 1, currentResults.length - 1);
          updateModalSelection();
        }
        if (e.key === 'ArrowUp') {
          e.preventDefault();
          selectedIndex = Math.max(selectedIndex - 1, 0);
          updateModalSelection();
        }
        if (e.key === 'Enter' && selectedIndex >= 0) {
          e.preventDefault();
          const items = document.querySelectorAll('.ss-item');
          if (items[selectedIndex]) window.location.href = items[selectedIndex].href;
        }
      }
    });
  }

  function openModal() {
    isModalOpen = true;
    document.getElementById('ssOverlay').classList.add('open');
    document.getElementById('ssInput').focus();
    document.body.style.overflow = 'hidden';
  }

  function closeModal() {
    isModalOpen = false;
    document.getElementById('ssOverlay').classList.remove('open');
    document.body.style.overflow = '';
    selectedIndex = -1;
  }

  function performModalSearch(query) {
    const container = document.getElementById('ssResults');
    query = query.trim().toLowerCase();

    if (!query) {
      container.innerHTML = `
        <div class="ss-empty">
          <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/>
          </svg>
          <h3>Search our site</h3>
          <p>Find countertops, blog posts, tools, and more</p>
        </div>`;
      currentResults = [];
      return;
    }

    let results = searchIndex.filter(item => {
      const searchText = [
        item.title, item.description, item.vendor, item.brand, item.color, item.material
      ].filter(Boolean).join(' ').toLowerCase();
      return searchText.includes(query);
    });

    results.sort((a, b) => {
      const aStarts = (a.title || '').toLowerCase().startsWith(query);
      const bStarts = (b.title || '').toLowerCase().startsWith(query);
      if (aStarts && !bStarts) return -1;
      if (!aStarts && bStarts) return 1;
      return 0;
    });

    results = results.slice(0, 50);
    currentResults = results;
    selectedIndex = -1;

    if (results.length === 0) {
      container.innerHTML = `
        <div class="ss-empty">
          <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
          </svg>
          <h3>No results found</h3>
          <p>Try different keywords</p>
        </div>`;
      return;
    }

    container.innerHTML = results.map((item, index) => {
      const cat = CATEGORIES[item.type] || CATEGORIES.page;
      const highlighted = highlightMatch(item.title || '', query);
      const hasImage = item.image && item.image.length > 10;
      return `
        <a href="${item.url}" class="ss-item" data-index="${index}">
          <div class="ss-item-img ${hasImage ? '' : 'no-img'}">
            ${hasImage
              ? `<img src="${item.image}" alt="" loading="lazy">`
              : `<svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"/></svg>`}
          </div>
          <div style="flex:1;min-width:0">
            <div class="ss-item-title">
              ${highlighted}
              <span class="ss-badge" style="background:${cat.color}15;color:${cat.color}">${cat.label}</span>
            </div>
            ${item.description ? `<p class="ss-desc">${item.description}</p>` : ''}
            ${item.vendor || item.material ? `<p class="ss-meta">${[item.vendor, item.material].filter(Boolean).join(' \u2022 ')}</p>` : ''}
          </div>
        </a>`;
    }).join('');
  }

  function highlightMatch(text, query) {
    if (!query) return text;
    const regex = new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
    return text.replace(regex, '<mark>$1</mark>');
  }

  function updateModalSelection() {
    const items = document.querySelectorAll('.ss-item');
    items.forEach((item, i) => item.classList.toggle('selected', i === selectedIndex));
    if (selectedIndex >= 0 && items[selectedIndex]) {
      items[selectedIndex].scrollIntoView({ block: 'nearest' });
    }
  }

  // Expose global API
  window.SiteSearch = {
    open: openModal,
    close: closeModal,
    isOpen: () => isModalOpen
  };

})();
