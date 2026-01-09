/**
 * Surprise Granite - Site-Wide Search
 * Search across all content: products, blog, tools, services, and more
 */

(function() {
  'use strict';

  let searchIndex = [];
  let isSearchOpen = false;
  let selectedIndex = -1;
  let currentResults = [];

  // Category configuration
  const CATEGORIES = {
    countertops: { label: 'Countertops', icon: 'counter', color: '#6366f1' },
    tile: { label: 'Tile', icon: 'tile', color: '#8b5cf6' },
    flooring: { label: 'Flooring', icon: 'floor', color: '#d946ef' },
    blog: { label: 'Blog', icon: 'article', color: '#f43f5e' },
    tool: { label: 'Tools', icon: 'tool', color: '#f97316' },
    service: { label: 'Services', icon: 'service', color: '#eab308' },
    vendor: { label: 'Vendors', icon: 'vendor', color: '#22c55e' },
    company: { label: 'Company', icon: 'company', color: '#14b8a6' },
    category: { label: 'Categories', icon: 'category', color: '#06b6d4' },
    page: { label: 'Pages', icon: 'page', color: '#64748b' },
    products: { label: 'Products', icon: 'product', color: '#f9cb00' },
    financing: { label: 'Financing', icon: 'finance', color: '#10b981' },
    legal: { label: 'Legal', icon: 'legal', color: '#94a3b8' }
  };

  // Initialize on DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  async function init() {
    await loadSearchIndex();
    createSearchUI();
    setupEventListeners();
  }

  async function loadSearchIndex() {
    try {
      const response = await fetch('/data/site-search.json');
      const data = await response.json();
      searchIndex = data.items || [];
} catch (e) {
searchIndex = [];
    }
  }

  function createSearchUI() {
    // Inject styles
    const style = document.createElement('style');
    style.id = 'site-search-styles';
    style.textContent = `
      /* Search Trigger Button */
      .site-search-trigger {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 8px 14px;
        background: rgba(255, 255, 255, 0.1);
        border: 1px solid rgba(255, 255, 255, 0.2);
        border-radius: 8px;
        color: rgba(255, 255, 255, 0.8);
        font-size: 14px;
        cursor: pointer;
        transition: all 0.2s;
      }
      .site-search-trigger:hover {
        background: rgba(255, 255, 255, 0.15);
        border-color: rgba(255, 255, 255, 0.3);
        color: #fff;
      }
      .site-search-trigger svg {
        width: 16px;
        height: 16px;
      }
      .site-search-trigger .shortcut {
        font-size: 10px;
        background: rgba(255, 255, 255, 0.15);
        padding: 2px 6px;
        border-radius: 4px;
        font-weight: 600;
      }

      /* Floating Search Button (Mobile) */
      .site-search-fab {
        position: fixed;
        bottom: 100px;
        right: 20px;
        width: 56px;
        height: 56px;
        background: linear-gradient(135deg, #f9cb00 0%, #e6b800 100%);
        border: none;
        border-radius: 50%;
        box-shadow: 0 4px 20px rgba(249, 203, 0, 0.4);
        cursor: pointer;
        z-index: 9998;
        display: none;
        align-items: center;
        justify-content: center;
        transition: all 0.3s;
      }
      .site-search-fab:hover {
        transform: scale(1.1);
        box-shadow: 0 6px 25px rgba(249, 203, 0, 0.5);
      }
      .site-search-fab svg {
        width: 24px;
        height: 24px;
        color: #1a1a2e;
      }
      @media (max-width: 768px) {
        .site-search-fab { display: none !important; }
        .site-search-trigger .shortcut { display: none; }
      }

      /* Search Overlay */
      .site-search-overlay {
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: rgba(0, 0, 0, 0.6);
        backdrop-filter: blur(8px);
        z-index: 100000;
        display: none;
        align-items: flex-start;
        justify-content: center;
        padding: 8vh 20px 20px;
        overflow-y: auto;
      }
      .site-search-overlay.open {
        display: flex;
      }

      /* Search Modal */
      .site-search-modal {
        width: 100%;
        max-width: 680px;
        background: #fff;
        border-radius: 16px;
        box-shadow: 0 25px 60px rgba(0, 0, 0, 0.3);
        overflow: hidden;
        animation: searchSlideIn 0.2s ease-out;
      }
      @keyframes searchSlideIn {
        from { opacity: 0; transform: translateY(-20px) scale(0.98); }
        to { opacity: 1; transform: translateY(0) scale(1); }
      }

      /* Search Header */
      .site-search-header {
        display: flex;
        align-items: center;
        padding: 16px 20px;
        border-bottom: 1px solid #e5e7eb;
        gap: 12px;
      }
      .site-search-icon {
        color: #9ca3af;
        flex-shrink: 0;
      }
      .site-search-icon svg {
        width: 20px;
        height: 20px;
      }
      .site-search-input {
        flex: 1;
        border: none;
        outline: none;
        font-size: 18px;
        color: #1f2937;
        background: transparent;
      }
      .site-search-input::placeholder {
        color: #9ca3af;
      }
      .site-search-close {
        background: #f3f4f6;
        border: none;
        padding: 6px 12px;
        border-radius: 6px;
        font-size: 12px;
        color: #6b7280;
        cursor: pointer;
        font-weight: 600;
      }
      .site-search-close:hover {
        background: #e5e7eb;
      }

      /* Category Filters */
      .site-search-filters {
        display: flex;
        gap: 8px;
        padding: 12px 20px;
        border-bottom: 1px solid #e5e7eb;
        overflow-x: auto;
        -webkit-overflow-scrolling: touch;
      }
      .site-search-filters::-webkit-scrollbar { display: none; }
      .site-search-filter {
        padding: 6px 14px;
        background: #f3f4f6;
        border: none;
        border-radius: 20px;
        font-size: 13px;
        color: #4b5563;
        cursor: pointer;
        white-space: nowrap;
        transition: all 0.2s;
      }
      .site-search-filter:hover {
        background: #e5e7eb;
      }
      .site-search-filter.active {
        background: #1a1a2e;
        color: #fff;
      }

      /* Results */
      .site-search-results {
        max-height: 60vh;
        overflow-y: auto;
      }
      .site-search-results::-webkit-scrollbar { width: 6px; }
      .site-search-results::-webkit-scrollbar-thumb {
        background: #d1d5db;
        border-radius: 3px;
      }

      .site-search-empty {
        padding: 60px 20px;
        text-align: center;
        color: #6b7280;
      }
      .site-search-empty svg {
        width: 48px;
        height: 48px;
        color: #d1d5db;
        margin-bottom: 16px;
      }
      .site-search-empty h3 {
        font-size: 16px;
        font-weight: 600;
        color: #374151;
        margin: 0 0 8px;
      }
      .site-search-empty p {
        font-size: 14px;
        margin: 0;
      }

      /* Result Item */
      .site-search-item {
        display: flex;
        gap: 14px;
        padding: 14px 20px;
        text-decoration: none;
        color: inherit;
        transition: background 0.15s;
        border-bottom: 1px solid #f3f4f6;
      }
      .site-search-item:hover,
      .site-search-item.selected {
        background: #f9fafb;
      }
      .site-search-item-image {
        width: 56px;
        height: 56px;
        border-radius: 10px;
        overflow: hidden;
        flex-shrink: 0;
        background: #f3f4f6;
      }
      .site-search-item-image img {
        width: 100%;
        height: 100%;
        object-fit: cover;
      }
      .site-search-item-image.no-image {
        display: flex;
        align-items: center;
        justify-content: center;
      }
      .site-search-item-image.no-image svg {
        width: 24px;
        height: 24px;
        color: #9ca3af;
      }
      .site-search-item-content {
        flex: 1;
        min-width: 0;
      }
      .site-search-item-title {
        font-size: 15px;
        font-weight: 600;
        color: #1f2937;
        margin: 0 0 4px;
        display: flex;
        align-items: center;
        gap: 8px;
      }
      .site-search-item-title mark {
        background: #fef3c7;
        color: inherit;
        border-radius: 2px;
        padding: 0 2px;
      }
      .site-search-item-badge {
        font-size: 10px;
        padding: 2px 8px;
        border-radius: 10px;
        font-weight: 600;
        text-transform: uppercase;
        letter-spacing: 0.5px;
      }
      .site-search-item-desc {
        font-size: 13px;
        color: #6b7280;
        margin: 0;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .site-search-item-meta {
        font-size: 12px;
        color: #9ca3af;
        margin: 4px 0 0;
      }

      /* Footer */
      .site-search-footer {
        padding: 12px 20px;
        border-top: 1px solid #e5e7eb;
        display: flex;
        justify-content: space-between;
        align-items: center;
        font-size: 12px;
        color: #9ca3af;
        background: #f9fafb;
      }
      .site-search-footer kbd {
        background: #e5e7eb;
        padding: 2px 6px;
        border-radius: 4px;
        font-family: inherit;
        margin: 0 2px;
      }

      @media (max-width: 640px) {
        .site-search-overlay { padding: 0; }
        .site-search-modal {
          max-width: 100%;
          border-radius: 0;
          min-height: 100vh;
        }
        .site-search-results { max-height: calc(100vh - 200px); }
        .site-search-footer { display: none; }
      }
    `;
    document.head.appendChild(style);

    // Create overlay
    const overlay = document.createElement('div');
    overlay.className = 'site-search-overlay';
    overlay.id = 'siteSearchOverlay';
    overlay.innerHTML = `
      <div class="site-search-modal" onclick="event.stopPropagation()">
        <div class="site-search-header">
          <div class="site-search-icon">
            <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/>
            </svg>
          </div>
          <input type="text" class="site-search-input" id="siteSearchInput" placeholder="Search countertops, blog, tools..." autocomplete="off">
          <button class="site-search-close" onclick="SiteSearch.close()">ESC</button>
        </div>
        <div class="site-search-filters" id="siteSearchFilters">
          <button class="site-search-filter active" data-filter="all">All</button>
          <button class="site-search-filter" data-filter="countertops">Countertops</button>
          <button class="site-search-filter" data-filter="tile">Tile</button>
          <button class="site-search-filter" data-filter="flooring">Flooring</button>
          <button class="site-search-filter" data-filter="blog">Blog</button>
          <button class="site-search-filter" data-filter="tool">Tools</button>
          <button class="site-search-filter" data-filter="service">Services</button>
        </div>
        <div class="site-search-results" id="siteSearchResults">
          <div class="site-search-empty">
            <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/>
            </svg>
            <h3>Search our site</h3>
            <p>Find countertops, blog posts, tools, and more</p>
          </div>
        </div>
        <div class="site-search-footer">
          <span><kbd>↑</kbd><kbd>↓</kbd> to navigate</span>
          <span><kbd>↵</kbd> to select</span>
          <span><kbd>esc</kbd> to close</span>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);

    // Create FAB for mobile
    const fab = document.createElement('button');
    fab.className = 'site-search-fab';
    fab.id = 'siteSearchFab';
    fab.innerHTML = `
      <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/>
      </svg>
    `;
    fab.onclick = openSearch;
    document.body.appendChild(fab);

    // Add search trigger to header if possible
    addSearchToHeader();
  }

  function addSearchToHeader() {
    // Try to find header nav
    const headerNav = document.querySelector('.sg-nav, .header-nav, .navbar_link-list');
    if (headerNav) {
      const trigger = document.createElement('button');
      trigger.className = 'site-search-trigger';
      trigger.innerHTML = `
        <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/>
        </svg>
        <span>Search</span>
        <span class="shortcut">⌘K</span>
      `;
      trigger.onclick = openSearch;
      headerNav.appendChild(trigger);
    }
  }

  function setupEventListeners() {
    const overlay = document.getElementById('siteSearchOverlay');
    const input = document.getElementById('siteSearchInput');
    const filters = document.getElementById('siteSearchFilters');

    // Close on overlay click
    overlay.onclick = (e) => {
      if (e.target === overlay) closeSearch();
    };

    // Search input
    let debounceTimer;
    input.oninput = () => {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => performSearch(input.value), 150);
    };

    // Filter buttons
    filters.onclick = (e) => {
      if (e.target.classList.contains('site-search-filter')) {
        filters.querySelectorAll('.site-search-filter').forEach(f => f.classList.remove('active'));
        e.target.classList.add('active');
        performSearch(input.value);
      }
    };

    // Keyboard shortcuts
    document.addEventListener('keydown', (e) => {
      // Open with Cmd/Ctrl + K
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        openSearch();
      }
      // Also open with /
      if (e.key === '/' && !isSearchOpen && !['INPUT', 'TEXTAREA'].includes(document.activeElement.tagName)) {
        e.preventDefault();
        openSearch();
      }
      // Close with Escape
      if (e.key === 'Escape' && isSearchOpen) {
        closeSearch();
      }
      // Navigate results
      if (isSearchOpen && currentResults.length > 0) {
        if (e.key === 'ArrowDown') {
          e.preventDefault();
          selectedIndex = Math.min(selectedIndex + 1, currentResults.length - 1);
          updateSelection();
        }
        if (e.key === 'ArrowUp') {
          e.preventDefault();
          selectedIndex = Math.max(selectedIndex - 1, 0);
          updateSelection();
        }
        if (e.key === 'Enter' && selectedIndex >= 0) {
          e.preventDefault();
          const items = document.querySelectorAll('.site-search-item');
          if (items[selectedIndex]) {
            window.location.href = items[selectedIndex].href;
          }
        }
      }
    });
  }

  function openSearch() {
    isSearchOpen = true;
    document.getElementById('siteSearchOverlay').classList.add('open');
    document.getElementById('siteSearchInput').focus();
    document.body.style.overflow = 'hidden';
  }

  function closeSearch() {
    isSearchOpen = false;
    document.getElementById('siteSearchOverlay').classList.remove('open');
    document.body.style.overflow = '';
    selectedIndex = -1;
  }

  function performSearch(query) {
    const resultsContainer = document.getElementById('siteSearchResults');
    const activeFilter = document.querySelector('.site-search-filter.active').dataset.filter;

    query = query.trim().toLowerCase();

    if (!query) {
      resultsContainer.innerHTML = `
        <div class="site-search-empty">
          <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/>
          </svg>
          <h3>Search our site</h3>
          <p>Find countertops, blog posts, tools, and more</p>
        </div>
      `;
      currentResults = [];
      return;
    }

    // Search and filter
    let results = searchIndex.filter(item => {
      // Filter by category
      if (activeFilter !== 'all' && item.type !== activeFilter) {
        return false;
      }

      // Search in title, description, brand, color, material
      const searchText = [
        item.title,
        item.description,
        item.brand,
        item.color,
        item.material
      ].filter(Boolean).join(' ').toLowerCase();

      return searchText.includes(query);
    });

    // Sort by relevance (title matches first)
    results.sort((a, b) => {
      const aTitle = (a.title || '').toLowerCase();
      const bTitle = (b.title || '').toLowerCase();
      const aStarts = aTitle.startsWith(query);
      const bStarts = bTitle.startsWith(query);
      if (aStarts && !bStarts) return -1;
      if (!aStarts && bStarts) return 1;
      return 0;
    });

    // Limit results
    results = results.slice(0, 50);
    currentResults = results;
    selectedIndex = -1;

    if (results.length === 0) {
      resultsContainer.innerHTML = `
        <div class="site-search-empty">
          <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
          </svg>
          <h3>No results found</h3>
          <p>Try different keywords or browse categories</p>
        </div>
      `;
      return;
    }

    // Render results
    resultsContainer.innerHTML = results.map((item, index) => {
      const cat = CATEGORIES[item.type] || CATEGORIES.page;
      const highlighted = highlightMatch(item.title, query);
      const hasImage = item.image && item.image.length > 10;

      return `
        <a href="${item.url}" class="site-search-item" data-index="${index}">
          <div class="site-search-item-image ${hasImage ? '' : 'no-image'}">
            ${hasImage
              ? `<img src="${item.image}" alt="" loading="lazy">`
              : `<svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"/></svg>`
            }
          </div>
          <div class="site-search-item-content">
            <div class="site-search-item-title">
              ${highlighted}
              <span class="site-search-item-badge" style="background: ${cat.color}15; color: ${cat.color}">${cat.label}</span>
            </div>
            ${item.description ? `<p class="site-search-item-desc">${item.description}</p>` : ''}
            ${item.material || item.color ? `<p class="site-search-item-meta">${[item.material, item.color].filter(Boolean).join(' • ')}</p>` : ''}
          </div>
        </a>
      `;
    }).join('');
  }

  function highlightMatch(text, query) {
    if (!query) return text;
    const regex = new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
    return text.replace(regex, '<mark>$1</mark>');
  }

  function updateSelection() {
    const items = document.querySelectorAll('.site-search-item');
    items.forEach((item, i) => {
      item.classList.toggle('selected', i === selectedIndex);
    });
    if (selectedIndex >= 0 && items[selectedIndex]) {
      items[selectedIndex].scrollIntoView({ block: 'nearest' });
    }
  }

  // Expose global API
  window.SiteSearch = {
    open: openSearch,
    close: closeSearch,
    isOpen: () => isSearchOpen
  };

})();
