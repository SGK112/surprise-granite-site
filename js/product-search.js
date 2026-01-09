/**
 * Surprise Granite - Product Search
 * Search across countertops, tile, and flooring
 */

(function() {
  'use strict';

  let searchIndex = null;
  let searchInput = null;
  let searchResults = null;
  let isSearchOpen = false;

  // Initialize
  document.addEventListener('DOMContentLoaded', init);

  async function init() {
    // Load search index
    await loadSearchIndex();

    // Create search UI
    createSearchUI();

    // Setup event listeners
    setupEventListeners();
  }

  async function loadSearchIndex() {
    try {
      const response = await fetch('/data/search-index.json');
      const data = await response.json();
      searchIndex = data.products || [];
} catch (e) {
searchIndex = [];
    }
  }

  function createSearchUI() {
    // Add search CSS
    const style = document.createElement('style');
    style.textContent = `
      .sg-search-trigger {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 8px 16px;
        background: rgba(30, 58, 95, 0.05);
        border: 1px solid rgba(30, 58, 95, 0.1);
        border-radius: 8px;
        color: #64748b;
        font-size: 14px;
        cursor: pointer;
        transition: all 0.2s;
      }
      .sg-search-trigger:hover {
        background: rgba(30, 58, 95, 0.1);
        border-color: rgba(30, 58, 95, 0.2);
        color: #1e3a5f;
      }
      .sg-search-trigger svg {
        width: 18px;
        height: 18px;
      }
      .sg-search-trigger .shortcut {
        font-size: 11px;
        background: rgba(30, 58, 95, 0.1);
        padding: 2px 6px;
        border-radius: 4px;
        font-weight: 600;
      }

      .sg-search-overlay {
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: rgba(0, 0, 0, 0.5);
        backdrop-filter: blur(4px);
        z-index: 10000;
        display: none;
        align-items: flex-start;
        justify-content: center;
        padding: 10vh 20px;
      }
      .sg-search-overlay.open {
        display: flex;
      }

      .sg-search-modal {
        width: 100%;
        max-width: 640px;
        background: #fff;
        border-radius: 16px;
        box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25);
        overflow: hidden;
        max-height: 80vh;
        display: flex;
        flex-direction: column;
      }

      .sg-search-header {
        padding: 16px 20px;
        border-bottom: 1px solid #e2e8f0;
        display: flex;
        align-items: center;
        gap: 12px;
      }
      .sg-search-header svg {
        width: 20px;
        height: 20px;
        color: #64748b;
        flex-shrink: 0;
      }
      .sg-search-header input {
        flex: 1;
        border: none;
        outline: none;
        font-size: 16px;
        color: #1e293b;
        background: transparent;
      }
      .sg-search-header input::placeholder {
        color: #94a3b8;
      }
      .sg-search-close {
        padding: 6px;
        background: none;
        border: none;
        cursor: pointer;
        color: #64748b;
        border-radius: 6px;
        transition: all 0.2s;
      }
      .sg-search-close:hover {
        background: #f1f5f9;
        color: #1e293b;
      }

      .sg-search-filters {
        padding: 12px 20px;
        border-bottom: 1px solid #e2e8f0;
        display: flex;
        gap: 8px;
        flex-wrap: wrap;
      }
      .sg-search-filter {
        padding: 6px 12px;
        background: #f8fafc;
        border: 1px solid #e2e8f0;
        border-radius: 20px;
        font-size: 13px;
        color: #64748b;
        cursor: pointer;
        transition: all 0.2s;
      }
      .sg-search-filter:hover,
      .sg-search-filter.active {
        background: #1e3a5f;
        border-color: #1e3a5f;
        color: #fff;
      }

      .sg-search-results {
        flex: 1;
        overflow-y: auto;
        padding: 8px;
      }
      .sg-search-results::-webkit-scrollbar {
        width: 6px;
      }
      .sg-search-results::-webkit-scrollbar-thumb {
        background: #cbd5e1;
        border-radius: 3px;
      }

      .sg-search-result {
        display: flex;
        align-items: center;
        gap: 16px;
        padding: 12px;
        border-radius: 12px;
        text-decoration: none;
        color: inherit;
        transition: background 0.2s;
      }
      .sg-search-result:hover,
      .sg-search-result.selected {
        background: #f8fafc;
      }
      .sg-search-result-image {
        width: 60px;
        height: 60px;
        border-radius: 8px;
        object-fit: cover;
        background: #f1f5f9;
        flex-shrink: 0;
      }
      .sg-search-result-info {
        flex: 1;
        min-width: 0;
      }
      .sg-search-result-title {
        font-size: 15px;
        font-weight: 600;
        color: #1e293b;
        margin-bottom: 4px;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .sg-search-result-meta {
        display: flex;
        gap: 8px;
        align-items: center;
        font-size: 13px;
        color: #64748b;
      }
      .sg-search-result-badge {
        padding: 2px 8px;
        background: #f1f5f9;
        border-radius: 4px;
        font-size: 11px;
        font-weight: 600;
        text-transform: uppercase;
      }
      .sg-search-result-badge.countertops {
        background: #dbeafe;
        color: #1e40af;
      }
      .sg-search-result-badge.tile {
        background: #dcfce7;
        color: #166534;
      }
      .sg-search-result-badge.flooring {
        background: #fef3c7;
        color: #92400e;
      }

      .sg-search-empty {
        padding: 40px 20px;
        text-align: center;
        color: #64748b;
      }
      .sg-search-empty svg {
        width: 48px;
        height: 48px;
        margin-bottom: 16px;
        color: #cbd5e1;
      }

      .sg-search-footer {
        padding: 12px 20px;
        border-top: 1px solid #e2e8f0;
        display: flex;
        justify-content: space-between;
        align-items: center;
        font-size: 12px;
        color: #64748b;
      }
      .sg-search-footer kbd {
        background: #f1f5f9;
        padding: 2px 6px;
        border-radius: 4px;
        font-family: inherit;
        font-size: 11px;
      }

      @media (max-width: 640px) {
        .sg-search-overlay {
          padding: 0;
          align-items: stretch;
        }
        .sg-search-modal {
          max-width: none;
          border-radius: 0;
          max-height: 100vh;
        }
        .sg-search-trigger .shortcut {
          display: none;
        }
      }
    `;
    document.head.appendChild(style);

    // Create overlay
    const overlay = document.createElement('div');
    overlay.className = 'sg-search-overlay';
    overlay.id = 'sg-search-overlay';
    overlay.innerHTML = `
      <div class="sg-search-modal">
        <div class="sg-search-header">
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/>
          </svg>
          <input type="text" id="sg-search-input" placeholder="Search countertops, tile, flooring..." autocomplete="off">
          <button class="sg-search-close" onclick="window.SurpriseSearch.close()">
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
              <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12"/>
            </svg>
          </button>
        </div>
        <div class="sg-search-filters">
          <button class="sg-search-filter active" data-filter="all">All Products</button>
          <button class="sg-search-filter" data-filter="countertops">Countertops</button>
          <button class="sg-search-filter" data-filter="tile">Tile</button>
          <button class="sg-search-filter" data-filter="flooring">Flooring</button>
        </div>
        <div class="sg-search-results" id="sg-search-results">
          <div class="sg-search-empty">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
              <path stroke-linecap="round" stroke-linejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/>
            </svg>
            <p>Start typing to search 1,100+ products</p>
          </div>
        </div>
        <div class="sg-search-footer">
          <span>Press <kbd>ESC</kbd> to close</span>
          <span><kbd>↑</kbd> <kbd>↓</kbd> to navigate</span>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);

    searchResults = document.getElementById('sg-search-results');
    searchInput = document.getElementById('sg-search-input');

    // Add search trigger to existing navbars
    addSearchTriggers();
  }

  function addSearchTriggers() {
    // Add to Webflow navbar
    const webflowNav = document.querySelector('.navbar_menu-top-left');
    if (webflowNav && !webflowNav.querySelector('.sg-search-trigger')) {
      const trigger = createTriggerButton();
      webflowNav.appendChild(trigger);
    }

    // Add to new header nav
    const newNav = document.querySelector('.header-nav, .sg-nav');
    if (newNav && !newNav.querySelector('.sg-search-trigger')) {
      const trigger = createTriggerButton();
      const firstLink = newNav.querySelector('a');
      if (firstLink) {
        newNav.insertBefore(trigger, firstLink);
      } else {
        newNav.appendChild(trigger);
      }
    }

    // Add floating search button for mobile
    if (window.innerWidth <= 768 && !document.querySelector('.sg-search-fab')) {
      const fab = document.createElement('button');
      fab.className = 'sg-search-fab';
      fab.innerHTML = `
        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
          <path stroke-linecap="round" stroke-linejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/>
        </svg>
      `;
      fab.style.cssText = `
        position: fixed;
        bottom: 80px;
        right: 20px;
        width: 56px;
        height: 56px;
        background: linear-gradient(135deg, #f9cb00, #cca600);
        border: none;
        border-radius: 50%;
        box-shadow: 0 4px 12px rgba(249, 203, 0, 0.4);
        cursor: pointer;
        z-index: 999;
        display: flex;
        align-items: center;
        justify-content: center;
        color: #1a1a2e;
      `;
      fab.onclick = () => window.SurpriseSearch.open();
      document.body.appendChild(fab);
    }
  }

  function createTriggerButton() {
    const trigger = document.createElement('button');
    trigger.className = 'sg-search-trigger';
    trigger.innerHTML = `
      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
        <path stroke-linecap="round" stroke-linejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/>
      </svg>
      <span>Search products...</span>
      <span class="shortcut">⌘K</span>
    `;
    trigger.onclick = () => window.SurpriseSearch.open();
    return trigger;
  }

  function setupEventListeners() {
    // Keyboard shortcut (Cmd/Ctrl + K)
    document.addEventListener('keydown', (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        window.SurpriseSearch.open();
      }
      if (e.key === 'Escape' && isSearchOpen) {
        window.SurpriseSearch.close();
      }
    });

    // Click outside to close
    document.getElementById('sg-search-overlay')?.addEventListener('click', (e) => {
      if (e.target.id === 'sg-search-overlay') {
        window.SurpriseSearch.close();
      }
    });

    // Search input
    searchInput?.addEventListener('input', debounce(handleSearch, 200));

    // Filter buttons
    document.querySelectorAll('.sg-search-filter').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.sg-search-filter').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        handleSearch();
      });
    });

    // Keyboard navigation
    searchInput?.addEventListener('keydown', (e) => {
      const results = searchResults?.querySelectorAll('.sg-search-result');
      const selected = searchResults?.querySelector('.sg-search-result.selected');
      let index = selected ? Array.from(results).indexOf(selected) : -1;

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        index = Math.min(index + 1, results.length - 1);
        updateSelection(results, index);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        index = Math.max(index - 1, 0);
        updateSelection(results, index);
      } else if (e.key === 'Enter' && selected) {
        e.preventDefault();
        window.location.href = selected.href;
      }
    });
  }

  function updateSelection(results, index) {
    results.forEach((r, i) => {
      r.classList.toggle('selected', i === index);
      if (i === index) r.scrollIntoView({ block: 'nearest' });
    });
  }

  function handleSearch() {
    const query = searchInput?.value?.toLowerCase().trim() || '';
    const filter = document.querySelector('.sg-search-filter.active')?.dataset.filter || 'all';

    if (!query) {
      showEmptyState();
      return;
    }

    // Search
    let results = searchIndex.filter(product => {
      // Filter by category
      if (filter !== 'all' && product.category !== filter) return false;

      // Search in name, type, color, brand
      const searchableText = [
        product.name,
        product.type,
        product.primaryColor,
        product.accentColor,
        product.brand,
        product.category
      ].filter(Boolean).join(' ').toLowerCase();

      return searchableText.includes(query);
    });

    // Sort by relevance (exact name match first)
    results.sort((a, b) => {
      const aExact = a.name.toLowerCase().startsWith(query) ? 0 : 1;
      const bExact = b.name.toLowerCase().startsWith(query) ? 0 : 1;
      return aExact - bExact;
    });

    // Limit results
    results = results.slice(0, 20);

    displayResults(results, query);
  }

  function displayResults(results, query) {
    if (results.length === 0) {
      searchResults.innerHTML = `
        <div class="sg-search-empty">
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
            <path stroke-linecap="round" stroke-linejoin="round" d="M9.172 9.172a4 4 0 015.656 0M9 9v.01M15 9v.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
          </svg>
          <p>No results found for "${query}"</p>
        </div>
      `;
      return;
    }

    searchResults.innerHTML = results.map((product, i) => `
      <a href="/${product.category}/${product.slug}/" class="sg-search-result${i === 0 ? ' selected' : ''}">
        <img src="${product.primaryImage || '/images/placeholder.svg'}" alt="${product.name}" class="sg-search-result-image" loading="lazy" onerror="this.src='/images/placeholder.svg'">
        <div class="sg-search-result-info">
          <div class="sg-search-result-title">${highlightMatch(product.name, query)}</div>
          <div class="sg-search-result-meta">
            <span class="sg-search-result-badge ${product.category}">${product.category}</span>
            <span>${product.type || ''}</span>
            ${product.primaryColor ? `<span>• ${product.primaryColor}</span>` : ''}
          </div>
        </div>
      </a>
    `).join('');
  }

  function highlightMatch(text, query) {
    if (!query) return text;
    const regex = new RegExp(`(${escapeRegex(query)})`, 'gi');
    return text.replace(regex, '<strong style="color: #f9cb00;">$1</strong>');
  }

  function escapeRegex(str) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  function showEmptyState() {
    searchResults.innerHTML = `
      <div class="sg-search-empty">
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
          <path stroke-linecap="round" stroke-linejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/>
        </svg>
        <p>Search across ${searchIndex.length.toLocaleString()}+ products</p>
      </div>
    `;
  }

  function debounce(func, wait) {
    let timeout;
    return function(...args) {
      clearTimeout(timeout);
      timeout = setTimeout(() => func.apply(this, args), wait);
    };
  }

  // Public API
  window.SurpriseSearch = {
    open() {
      const overlay = document.getElementById('sg-search-overlay');
      if (overlay) {
        overlay.classList.add('open');
        isSearchOpen = true;
        searchInput?.focus();
        document.body.style.overflow = 'hidden';
      }
    },
    close() {
      const overlay = document.getElementById('sg-search-overlay');
      if (overlay) {
        overlay.classList.remove('open');
        isSearchOpen = false;
        document.body.style.overflow = '';
        if (searchInput) searchInput.value = '';
        showEmptyState();
      }
    },
    isOpen: () => isSearchOpen
  };

})();
