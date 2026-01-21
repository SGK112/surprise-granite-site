/**
 * Stone Selector Component
 * Allows fabricators to tag remnants with actual stone names from the catalog
 * Version: 1.0
 */

(function() {
  'use strict';

  // Cache for catalog data
  let catalogCache = null;
  let catalogPromise = null;

  /**
   * Load catalog data from JSON files
   */
  async function loadCatalog() {
    if (catalogCache) return catalogCache;
    if (catalogPromise) return catalogPromise;

    catalogPromise = (async () => {
      try {
        const [countertopsRes, flooringRes, tileRes] = await Promise.all([
          fetch('/data/countertops.json'),
          fetch('/data/flooring.json'),
          fetch('/data/tile.json')
        ]);

        const countertops = countertopsRes.ok ? (await countertopsRes.json()).countertops || [] : [];
        const flooring = flooringRes.ok ? (await flooringRes.json()).flooring || [] : [];
        const tile = tileRes.ok ? (await tileRes.json()).tile || [] : [];

        // Combine and normalize
        catalogCache = [
          ...countertops.map(s => ({ ...s, category: 'countertops' })),
          ...flooring.map(s => ({ ...s, category: 'flooring' })),
          ...tile.map(s => ({ ...s, category: 'tile' }))
        ];

        return catalogCache;
      } catch (e) {
        console.error('Error loading catalog:', e);
        return [];
      }
    })();

    return catalogPromise;
  }

  /**
   * Format brand name for display
   */
  function formatBrand(brand) {
    if (!brand) return '';
    return brand.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
  }

  /**
   * StoneSelector Class
   * Searchable stone selector for tagging remnants
   */
  class StoneSelector {
    constructor(container, options = {}) {
      this.container = typeof container === 'string'
        ? document.querySelector(container)
        : container;

      if (!this.container) {
        console.error('StoneSelector: Container not found');
        return;
      }

      this.options = {
        maxTags: options.maxTags || 3,
        onChange: options.onChange || (() => {}),
        initialTags: options.initialTags || [],
        placeholder: options.placeholder || 'Search stones (e.g., Calacatta, White Ice...)',
        label: options.label || 'Tag Stone Colors'
      };

      this.selectedStones = [];
      this.catalog = [];
      this.isLoading = true;
      this.searchResults = [];
      this.highlightedIndex = -1;

      this.init();
    }

    async init() {
      this.render();
      this.bindEvents();

      // Load catalog
      this.catalog = await loadCatalog();
      this.isLoading = false;
      this.updateLoadingState();

      // Set initial tags
      if (this.options.initialTags.length > 0) {
        this.options.initialTags.forEach(slug => {
          const stone = this.catalog.find(s => s.slug === slug);
          if (stone && this.selectedStones.length < this.options.maxTags) {
            this.selectedStones.push(stone);
          }
        });
        this.updateSelectedTags();
        this.notifyChange();
      }
    }

    render() {
      this.container.innerHTML = `
        <div class="stone-selector">
          <label class="stone-selector-label">${this.options.label}</label>

          <div class="stone-selector-input-wrapper">
            <svg class="stone-selector-search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="11" cy="11" r="8"/>
              <path d="m21 21-4.35-4.35"/>
            </svg>
            <input type="text"
                   class="stone-selector-input"
                   placeholder="${this.options.placeholder}"
                   autocomplete="off">
            <div class="stone-selector-loading" style="display: none;">
              <div class="stone-selector-spinner"></div>
            </div>
          </div>

          <div class="stone-selector-dropdown"></div>

          <div class="stone-selector-tags"></div>

          <p class="stone-selector-hint">
            Select up to ${this.options.maxTags} stones. First selection is primary.
          </p>
        </div>
      `;

      this.cacheElements();
    }

    cacheElements() {
      this.input = this.container.querySelector('.stone-selector-input');
      this.dropdown = this.container.querySelector('.stone-selector-dropdown');
      this.tagsContainer = this.container.querySelector('.stone-selector-tags');
      this.loadingEl = this.container.querySelector('.stone-selector-loading');
    }

    bindEvents() {
      // Search input
      let debounceTimer;
      this.input.addEventListener('input', () => {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => this.handleSearch(), 150);
      });

      this.input.addEventListener('focus', () => {
        if (this.input.value.length >= 2) {
          this.showDropdown();
        }
      });

      // Keyboard navigation
      this.input.addEventListener('keydown', (e) => {
        if (e.key === 'ArrowDown') {
          e.preventDefault();
          this.highlightNext();
        } else if (e.key === 'ArrowUp') {
          e.preventDefault();
          this.highlightPrev();
        } else if (e.key === 'Enter') {
          e.preventDefault();
          this.selectHighlighted();
        } else if (e.key === 'Escape') {
          this.hideDropdown();
        }
      });

      // Click outside to close
      document.addEventListener('click', (e) => {
        if (!this.container.contains(e.target)) {
          this.hideDropdown();
        }
      });

      // Dropdown item clicks
      this.dropdown.addEventListener('click', (e) => {
        const item = e.target.closest('.stone-selector-item');
        if (item) {
          this.selectStone(item.dataset.slug);
        }
      });

      // Tag removal
      this.tagsContainer.addEventListener('click', (e) => {
        const removeBtn = e.target.closest('.stone-tag-remove');
        if (removeBtn) {
          const tag = removeBtn.closest('.stone-tag');
          if (tag) {
            this.removeStone(tag.dataset.slug);
          }
        }
      });
    }

    handleSearch() {
      const query = this.input.value.trim().toLowerCase();

      if (query.length < 2) {
        this.hideDropdown();
        return;
      }

      // Search catalog
      this.searchResults = this.catalog
        .filter(stone => {
          // Don't show already selected
          if (this.selectedStones.some(s => s.slug === stone.slug)) return false;

          // Match name, brand, type, color
          return stone.name?.toLowerCase().includes(query) ||
                 stone.brand?.toLowerCase().includes(query) ||
                 stone.type?.toLowerCase().includes(query) ||
                 stone.primaryColor?.toLowerCase().includes(query);
        })
        .slice(0, 8); // Limit results

      this.highlightedIndex = -1;
      this.renderDropdown();
      this.showDropdown();
    }

    renderDropdown() {
      if (this.searchResults.length === 0) {
        this.dropdown.innerHTML = `
          <div class="stone-selector-empty">
            No stones found matching "${this.input.value}"
          </div>
        `;
        return;
      }

      this.dropdown.innerHTML = this.searchResults.map((stone, index) => `
        <div class="stone-selector-item${index === this.highlightedIndex ? ' highlighted' : ''}"
             data-slug="${stone.slug}">
          <img class="stone-selector-item-image"
               src="${stone.primaryImage || '/images/placeholder-stone.jpg'}"
               alt="${stone.name}"
               onerror="this.src='/images/placeholder-stone.jpg'">
          <div class="stone-selector-item-info">
            <div class="stone-selector-item-name">${stone.name}</div>
            <div class="stone-selector-item-meta">
              ${stone.type || ''} ${stone.brand ? '• ' + formatBrand(stone.brand) : ''}
              ${stone.primaryColor ? '• ' + stone.primaryColor : ''}
            </div>
          </div>
        </div>
      `).join('');
    }

    showDropdown() {
      this.dropdown.classList.add('show');
    }

    hideDropdown() {
      this.dropdown.classList.remove('show');
      this.highlightedIndex = -1;
    }

    highlightNext() {
      if (this.searchResults.length === 0) return;
      this.highlightedIndex = (this.highlightedIndex + 1) % this.searchResults.length;
      this.renderDropdown();
    }

    highlightPrev() {
      if (this.searchResults.length === 0) return;
      this.highlightedIndex = this.highlightedIndex <= 0
        ? this.searchResults.length - 1
        : this.highlightedIndex - 1;
      this.renderDropdown();
    }

    selectHighlighted() {
      if (this.highlightedIndex >= 0 && this.highlightedIndex < this.searchResults.length) {
        this.selectStone(this.searchResults[this.highlightedIndex].slug);
      }
    }

    selectStone(slug) {
      if (this.selectedStones.length >= this.options.maxTags) {
        // Remove oldest if at limit
        this.selectedStones.shift();
      }

      const stone = this.catalog.find(s => s.slug === slug);
      if (stone && !this.selectedStones.some(s => s.slug === slug)) {
        this.selectedStones.push(stone);
        this.updateSelectedTags();
        this.notifyChange();
      }

      this.input.value = '';
      this.hideDropdown();
    }

    removeStone(slug) {
      this.selectedStones = this.selectedStones.filter(s => s.slug !== slug);
      this.updateSelectedTags();
      this.notifyChange();
    }

    updateSelectedTags() {
      if (this.selectedStones.length === 0) {
        this.tagsContainer.innerHTML = '';
        return;
      }

      this.tagsContainer.innerHTML = this.selectedStones.map((stone, index) => `
        <div class="stone-tag${index === 0 ? ' primary' : ''}" data-slug="${stone.slug}">
          <img class="stone-tag-image"
               src="${stone.primaryImage || '/images/placeholder-stone.jpg'}"
               alt="${stone.name}"
               onerror="this.src='/images/placeholder-stone.jpg'">
          <span class="stone-tag-name">${stone.name}</span>
          ${index === 0 ? '<span class="stone-tag-badge">Primary</span>' : ''}
          <button type="button" class="stone-tag-remove" aria-label="Remove ${stone.name}">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M18 6L6 18M6 6l12 12"/>
            </svg>
          </button>
        </div>
      `).join('');
    }

    updateLoadingState() {
      if (this.loadingEl) {
        this.loadingEl.style.display = this.isLoading ? 'flex' : 'none';
      }
      if (this.input) {
        this.input.disabled = this.isLoading;
        this.input.placeholder = this.isLoading
          ? 'Loading catalog...'
          : this.options.placeholder;
      }
    }

    notifyChange() {
      const data = {
        stones: this.selectedStones.map(s => ({
          slug: s.slug,
          name: s.name,
          brand: s.brand,
          type: s.type,
          primaryColor: s.primaryColor,
          image: s.primaryImage
        })),
        slugs: this.selectedStones.map(s => s.slug),
        primaryStone: this.selectedStones[0] || null
      };
      this.options.onChange(data);
    }

    // Public API
    getSelectedStones() {
      return this.selectedStones.map(s => s.slug);
    }

    getPrimaryStone() {
      return this.selectedStones[0]?.slug || null;
    }

    setStones(slugs) {
      this.selectedStones = [];
      slugs.forEach(slug => {
        const stone = this.catalog.find(s => s.slug === slug);
        if (stone && this.selectedStones.length < this.options.maxTags) {
          this.selectedStones.push(stone);
        }
      });
      this.updateSelectedTags();
    }

    reset() {
      this.selectedStones = [];
      this.input.value = '';
      this.updateSelectedTags();
      this.hideDropdown();
      this.notifyChange();
    }
  }

  /**
   * StoneFilter Class
   * Searchable filter for marketplace browse page
   */
  class StoneFilter {
    constructor(container, options = {}) {
      this.container = typeof container === 'string'
        ? document.querySelector(container)
        : container;

      if (!this.container) {
        console.error('StoneFilter: Container not found');
        return;
      }

      this.options = {
        onChange: options.onChange || (() => {}),
        placeholder: options.placeholder || 'Filter by stone...'
      };

      this.selectedStone = null;
      this.catalog = [];
      this.isLoading = true;
      this.isOpen = false;

      this.init();
    }

    async init() {
      this.render();
      this.bindEvents();

      this.catalog = await loadCatalog();
      this.isLoading = false;
      this.updateLoadingState();
    }

    render() {
      this.container.innerHTML = `
        <div class="stone-filter">
          <button type="button" class="stone-filter-btn">
            <span class="stone-filter-preview"></span>
            <span class="stone-filter-text">All Stones</span>
            <svg class="stone-filter-arrow" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M6 9l6 6 6-6"/>
            </svg>
          </button>
          <div class="stone-filter-dropdown">
            <div class="stone-filter-search">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="11" cy="11" r="8"/>
                <path d="m21 21-4.35-4.35"/>
              </svg>
              <input type="text" placeholder="${this.options.placeholder}">
            </div>
            <div class="stone-filter-results"></div>
            <div class="stone-filter-actions">
              <button type="button" class="stone-filter-clear">Clear</button>
            </div>
          </div>
        </div>
      `;

      this.cacheElements();
    }

    cacheElements() {
      this.btn = this.container.querySelector('.stone-filter-btn');
      this.dropdown = this.container.querySelector('.stone-filter-dropdown');
      this.searchInput = this.container.querySelector('.stone-filter-search input');
      this.results = this.container.querySelector('.stone-filter-results');
      this.clearBtn = this.container.querySelector('.stone-filter-clear');
      this.textEl = this.container.querySelector('.stone-filter-text');
      this.previewEl = this.container.querySelector('.stone-filter-preview');
    }

    bindEvents() {
      // Toggle dropdown
      this.btn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.toggle();
      });

      // Search
      let debounceTimer;
      this.searchInput.addEventListener('input', () => {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => this.handleSearch(), 150);
      });

      // Result clicks
      this.results.addEventListener('click', (e) => {
        const item = e.target.closest('.stone-filter-item');
        if (item) {
          this.selectStone(item.dataset.slug);
        }
      });

      // Clear
      this.clearBtn.addEventListener('click', () => {
        this.clear();
      });

      // Close on outside click
      document.addEventListener('click', (e) => {
        if (this.isOpen && !this.container.contains(e.target)) {
          this.close();
        }
      });

      // Escape to close
      document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && this.isOpen) {
          this.close();
        }
      });
    }

    toggle() {
      this.isOpen ? this.close() : this.open();
    }

    open() {
      this.isOpen = true;
      this.dropdown.classList.add('show');
      this.btn.classList.add('open');
      this.searchInput.focus();
      this.showPopularStones();
    }

    close() {
      this.isOpen = false;
      this.dropdown.classList.remove('show');
      this.btn.classList.remove('open');
    }

    showPopularStones() {
      // Show most viewed stones initially
      const popular = [...this.catalog]
        .sort((a, b) => (b.views || 0) - (a.views || 0))
        .slice(0, 6);

      this.renderResults(popular, 'Popular Stones');
    }

    handleSearch() {
      const query = this.searchInput.value.trim().toLowerCase();

      if (query.length < 2) {
        this.showPopularStones();
        return;
      }

      const matches = this.catalog
        .filter(stone =>
          stone.name?.toLowerCase().includes(query) ||
          stone.brand?.toLowerCase().includes(query) ||
          stone.type?.toLowerCase().includes(query) ||
          stone.primaryColor?.toLowerCase().includes(query)
        )
        .slice(0, 8);

      this.renderResults(matches, matches.length > 0 ? 'Results' : 'No matches');
    }

    renderResults(stones, title) {
      if (stones.length === 0) {
        this.results.innerHTML = `<div class="stone-filter-empty">${title}</div>`;
        return;
      }

      this.results.innerHTML = `
        <div class="stone-filter-title">${title}</div>
        ${stones.map(stone => `
          <div class="stone-filter-item${this.selectedStone?.slug === stone.slug ? ' selected' : ''}"
               data-slug="${stone.slug}">
            <img src="${stone.primaryImage || '/images/placeholder-stone.jpg'}"
                 alt="${stone.name}"
                 onerror="this.src='/images/placeholder-stone.jpg'">
            <div class="stone-filter-item-info">
              <span class="stone-filter-item-name">${stone.name}</span>
              <span class="stone-filter-item-meta">${stone.type || ''}</span>
            </div>
          </div>
        `).join('')}
      `;
    }

    selectStone(slug) {
      this.selectedStone = this.catalog.find(s => s.slug === slug);
      this.updateButton();
      this.close();
      this.options.onChange(this.selectedStone?.slug || null);
    }

    clear() {
      this.selectedStone = null;
      this.searchInput.value = '';
      this.updateButton();
      this.close();
      this.options.onChange(null);
    }

    updateButton() {
      if (this.selectedStone) {
        this.textEl.textContent = this.selectedStone.name;
        this.previewEl.innerHTML = `
          <img src="${this.selectedStone.primaryImage || '/images/placeholder-stone.jpg'}"
               alt="${this.selectedStone.name}"
               onerror="this.src='/images/placeholder-stone.jpg'">
        `;
        this.btn.classList.add('active');
      } else {
        this.textEl.textContent = 'All Stones';
        this.previewEl.innerHTML = '';
        this.btn.classList.remove('active');
      }
    }

    updateLoadingState() {
      if (this.searchInput) {
        this.searchInput.disabled = this.isLoading;
      }
    }

    // Public API
    getSelectedStone() {
      return this.selectedStone?.slug || null;
    }

    setStone(slug) {
      this.selectedStone = this.catalog.find(s => s.slug === slug) || null;
      this.updateButton();
    }

    reset() {
      this.clear();
    }
  }

  // Export to global scope
  window.StoneSelector = StoneSelector;
  window.StoneFilter = StoneFilter;
  window.loadStoneCatalog = loadCatalog;

})();
