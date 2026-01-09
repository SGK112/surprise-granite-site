/**
 * Countertop Filter System
 * Replaces Finsweet CMS Filter with custom JSON-based filtering
 */

(function() {
  'use strict';

  // Configuration
  const CONFIG = {
    jsonPath: '/data/countertops.json',
    itemsPerPage: 48,
    gridSelector: '.materials_list.w-dyn-items',
    filterFormSelector: '.filters_filters-wrapper',
    resultsCountSelector: '.filters_results-text',
    searchInputSelector: 'input[name="Search-Bar"]'
  };

  // Get category from page URL
  function getPageCategory() {
    const path = window.location.pathname;
    if (path.includes('granite-countertops')) return 'Granite';
    if (path.includes('marble-countertops')) return 'Marble';
    if (path.includes('porcelain-countertops')) return 'Porcelain';
    if (path.includes('quartz-countertops')) return 'Quartz';
    if (path.includes('quartzite-countertops')) return 'Quartzite';
    return null;
  }

  const PAGE_CATEGORY = getPageCategory();

  // State
  let allCountertops = [];
  let filteredCountertops = [];
  let filters = {};
  let currentPage = 1;
  let isLoading = false;

  // Active filters
  let activeFilters = {
    brand: [],
    type: [],
    style: [],
    primaryColor: [],
    accentColor: [],
    search: ''
  };

  // Initialize
  async function init() {
    console.log('Countertop Filter System initializing...');

    try {
      const response = await fetch(CONFIG.jsonPath);
      if (!response.ok) throw new Error('Failed to load JSON');

      const data = await response.json();
      allCountertops = data.countertops;
      filters = data.filters;

      console.log(`Loaded ${allCountertops.length} countertops`);
      console.log('Filters:', filters);

      // Build filter UI
      buildFilterUI();

      // Setup search
      setupSearch();

      // Apply initial filters and render
      applyFilters();

      // Setup infinite scroll
      setupInfiniteScroll();

    } catch (error) {
      console.error('Failed to initialize filter system:', error);
    }
  }

  // Build filter UI by populating existing filter groups
  function buildFilterUI() {
    const filterWrapper = document.querySelector(CONFIG.filterFormSelector);
    if (!filterWrapper) {
      console.error('Filter wrapper not found');
      return;
    }

    console.log('Building filter UI...');

    // Find all filter groups
    const filterGroups = filterWrapper.querySelectorAll('.filters2_filter-group');
    console.log(`Found ${filterGroups.length} filter groups`);

    filterGroups.forEach((group, index) => {
      const headingEl = group.querySelector('.heading-style-h6');
      if (!headingEl) return;

      const headingText = headingEl.textContent.trim().toLowerCase();

      // Find the checkbox container - could be .filters_checkbox-grid or .filters_list
      let checkboxGrid = group.querySelector('.filters_checkbox-grid');
      if (!checkboxGrid) {
        checkboxGrid = group.querySelector('.filters_list');
      }
      if (!checkboxGrid) {
        checkboxGrid = group.querySelector('.filters_filter-options');
      }

      console.log(`Group ${index}: "${headingText}"`);

      if (!checkboxGrid) {
        console.log(`  No checkbox container found`);
        return;
      }

      let filterData = [];
      let filterKey = '';

      if (headingText.includes('brand')) {
        filterData = filters.brands || [];
        filterKey = 'brand';
      } else if (headingText.includes('material')) {
        if (PAGE_CATEGORY) {
          group.style.display = 'none';
          return;
        }
        filterData = filters.types || [];
        filterKey = 'type';
      } else if (headingText.includes('style')) {
        filterData = filters.styles || [];
        filterKey = 'style';
      } else if (headingText.includes('main color')) {
        filterData = filters.colors || [];
        filterKey = 'primaryColor';
      } else if (headingText.includes('accent')) {
        filterData = filters.accents || [];
        filterKey = 'accentColor';
      }

      if (filterData.length && filterKey) {
        console.log(`  Populating ${filterKey} with ${filterData.length} options`);

        // Clear existing checkboxes
        checkboxGrid.innerHTML = '';

        // Create new checkboxes
        filterData.forEach(value => {
          const checkbox = createCheckbox(value, filterKey);
          checkboxGrid.appendChild(checkbox);
        });
      }
    });

    // Setup clear buttons
    setupClearButtons();
  }

  // Create a checkbox element
  function createCheckbox(value, filterKey) {
    const label = document.createElement('label');
    label.className = 'w-checkbox filters_form-checkbox1';

    const displayName = formatDisplayName(value);

    label.innerHTML = `
      <input type="checkbox"
             class="w-checkbox-input filters_form-checkbox1-icon"
             data-filter-key="${filterKey}"
             data-filter-value="${value}">
      <span class="filters_form-checkbox1-label w-form-label">${displayName}</span>
    `;

    // Add change listener
    const input = label.querySelector('input');
    input.addEventListener('change', function() {
      console.log(`Filter changed: ${filterKey} = ${value}, checked = ${this.checked}`);
      handleFilterChange(filterKey, value, this.checked);
    });

    return label;
  }

  // Format display name
  function formatDisplayName(value) {
    if (!value) return '';
    return value
      .split('-')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  }

  // Handle filter change
  function handleFilterChange(filterKey, value, isChecked) {
    if (isChecked) {
      if (!activeFilters[filterKey].includes(value)) {
        activeFilters[filterKey].push(value);
      }
    } else {
      activeFilters[filterKey] = activeFilters[filterKey].filter(v => v !== value);
    }

    // Update checkbox visual
    const checkbox = document.querySelector(`input[data-filter-key="${filterKey}"][data-filter-value="${value}"]`);
    if (checkbox) {
      const label = checkbox.closest('label');
      if (isChecked) {
        label.classList.add('sg-label-checked');
      } else {
        label.classList.remove('sg-label-checked');
      }
    }

    console.log('Active filters:', activeFilters);

    currentPage = 1;
    applyFilters();
  }

  // Setup clear buttons
  function setupClearButtons() {
    // Main clear all button
    const clearAllBtns = document.querySelectorAll('[fs-cmsfilter-element="clear"]');
    clearAllBtns.forEach(btn => {
      btn.addEventListener('click', function(e) {
        e.preventDefault();
        clearAllFilters();
      });
    });
  }

  // Clear all filters
  function clearAllFilters() {
    activeFilters = {
      brand: [],
      type: [],
      style: [],
      primaryColor: [],
      accentColor: [],
      search: ''
    };

    // Uncheck all checkboxes
    document.querySelectorAll('.filters_form-checkbox1 input[type="checkbox"]').forEach(cb => {
      cb.checked = false;
      cb.closest('label')?.classList.remove('sg-label-checked');
    });

    // Clear search
    const searchInput = document.querySelector(CONFIG.searchInputSelector);
    if (searchInput) searchInput.value = '';

    currentPage = 1;
    applyFilters();
  }

  // Apply filters to countertops
  function applyFilters() {
    console.log('Applying filters...');

    filteredCountertops = allCountertops.filter(item => {
      // Page category filter
      if (PAGE_CATEGORY && item.type !== PAGE_CATEGORY) {
        return false;
      }

      // Brand filter
      if (activeFilters.brand.length > 0) {
        if (!activeFilters.brand.includes(item.brand)) {
          return false;
        }
      }

      // Type filter
      if (activeFilters.type.length > 0) {
        if (!activeFilters.type.includes(item.type)) {
          return false;
        }
      }

      // Style filter
      if (activeFilters.style.length > 0) {
        if (!activeFilters.style.includes(item.style)) {
          return false;
        }
      }

      // Primary color filter
      if (activeFilters.primaryColor.length > 0) {
        const itemColors = (item.primaryColor || '').split('/').map(c => c.trim());
        if (!activeFilters.primaryColor.some(c => itemColors.includes(c))) {
          return false;
        }
      }

      // Accent color filter
      if (activeFilters.accentColor.length > 0) {
        const itemAccents = (item.accentColor || '').split('/').map(c => c.trim());
        if (!activeFilters.accentColor.some(c => itemAccents.includes(c))) {
          return false;
        }
      }

      // Search filter
      if (activeFilters.search) {
        const searchLower = activeFilters.search.toLowerCase();
        const nameMatch = (item.name || '').toLowerCase().includes(searchLower);
        const brandMatch = (item.brand || '').toLowerCase().includes(searchLower);
        const typeMatch = (item.type || '').toLowerCase().includes(searchLower);
        if (!nameMatch && !brandMatch && !typeMatch) {
          return false;
        }
      }

      return true;
    });

    console.log(`Filtered to ${filteredCountertops.length} items`);

    // Update results count
    updateResultsCount();

    // Render products
    renderProducts(true);
  }

  // Update results count display
  function updateResultsCount() {
    // Find all result count elements
    const countEls = document.querySelectorAll('[fs-cmsfilter-element="results-count-2"], .filters_results-text');
    const total = PAGE_CATEGORY
      ? allCountertops.filter(c => c.type === PAGE_CATEGORY).length
      : allCountertops.length;

    countEls.forEach(el => {
      if (el.matches('[fs-cmsfilter-element="results-count-2"]')) {
        el.textContent = filteredCountertops.length;
      } else {
        el.textContent = `Showing ${filteredCountertops.length} of ${total}`;
      }
    });

    // Update items count
    const itemsCountEl = document.querySelector('[fs-cmsfilter-element="items-count-2"]');
    if (itemsCountEl) {
      itemsCountEl.textContent = total;
    }
  }

  // Render products to grid
  function renderProducts(reset = false) {
    const grid = document.querySelector(CONFIG.gridSelector);
    if (!grid) {
      console.error('Grid not found:', CONFIG.gridSelector);
      return;
    }

    if (reset) {
      grid.innerHTML = '';
      currentPage = 1;
    }

    const startIndex = (currentPage - 1) * CONFIG.itemsPerPage;
    const endIndex = startIndex + CONFIG.itemsPerPage;
    const itemsToRender = filteredCountertops.slice(startIndex, endIndex);

    console.log(`Rendering ${itemsToRender.length} items (page ${currentPage})`);

    itemsToRender.forEach(item => {
      const card = createProductCard(item);
      grid.appendChild(card);
    });

    isLoading = false;
  }

  // Create product card HTML
  function createProductCard(item) {
    const div = document.createElement('div');
    div.className = 'w-dyn-item';
    div.setAttribute('role', 'listitem');

    const brandDisplay = formatDisplayName(item.brand);
    const productUrl = `/countertops/${item.slug}`;

    div.innerHTML = `
      <div class="product-thumb_item">
        <div class="quick-add_container">
          <a href="${productUrl}" class="materials_item-link w-inline-block">
            <div class="materials_image-wrapper">
              <img src="${item.primaryImage}"
                   loading="lazy"
                   alt="${item.name} countertop sample"
                   class="product1_image is-primary"/>
              ${item.secondaryImage ? `
              <img src="${item.secondaryImage}"
                   loading="lazy"
                   alt="${item.name} installed"
                   class="product1_image"/>
              ` : ''}
            </div>
          </a>
        </div>
        <a href="${productUrl}" class="product1_details w-inline-block">
          <div class="product1_details-header">
            <div class="text-weight-bold">${item.name}</div>
            <div class="product-views_component">
              <div class="icon-embed-xxsmall w-embed">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zM12 17c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z"/>
                </svg>
              </div>
              <div>${item.views.toLocaleString()}</div>
            </div>
          </div>
          <div class="product1_details-body">
            <div class="text-color-grey">${item.type}</div>
            <div class="text-color-grey">${brandDisplay}</div>
          </div>
        </a>
      </div>
    `;

    return div;
  }

  // Setup search functionality
  function setupSearch() {
    const searchInput = document.querySelector(CONFIG.searchInputSelector);
    if (!searchInput) {
      console.log('Search input not found');
      return;
    }

    let debounceTimer;
    searchInput.addEventListener('input', function() {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        activeFilters.search = this.value.trim();
        currentPage = 1;
        applyFilters();
      }, 300);
    });
  }

  // Setup infinite scroll
  function setupInfiniteScroll() {
    const grid = document.querySelector(CONFIG.gridSelector);
    if (!grid) return;

    const observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting && !isLoading) {
          const totalPages = Math.ceil(filteredCountertops.length / CONFIG.itemsPerPage);
          if (currentPage < totalPages) {
            isLoading = true;
            currentPage++;
            renderProducts(false);
          }
        }
      });
    }, { rootMargin: '200px' });

    // Create sentinel element
    const sentinel = document.createElement('div');
    sentinel.className = 'infinite-scroll-sentinel';
    sentinel.style.height = '1px';
    grid.parentNode.insertBefore(sentinel, grid.nextSibling);
    observer.observe(sentinel);
  }

  // ================================================================
  // MOBILE FILTER TOGGLE FUNCTIONALITY
  // ================================================================

  function setupMobileFilterToggle() {
    const filterWrapper = document.querySelector(CONFIG.filterFormSelector);
    const filterLayout = document.querySelector('.filters_layout');

    if (!filterWrapper || !filterLayout) {
      console.log('Filter elements not found for mobile toggle');
      return;
    }

    // Check if toggle already exists
    if (document.querySelector('.mobile-filter-toggle')) {
      return;
    }

    // Create mobile filter toggle button
    const toggleBtn = document.createElement('button');
    toggleBtn.className = 'mobile-filter-toggle';
    toggleBtn.setAttribute('aria-expanded', 'false');
    toggleBtn.setAttribute('aria-controls', 'filter-sidebar');
    toggleBtn.innerHTML = `
      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
        <path stroke-linecap="round" stroke-linejoin="round" d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
      </svg>
      <span class="filter-text">Show Filters</span>
      <span class="filter-count" style="display: none;">0</span>
    `;

    // Insert toggle before filter layout
    filterLayout.parentNode.insertBefore(toggleBtn, filterLayout);

    // Give filter wrapper an ID for accessibility
    filterWrapper.id = 'filter-sidebar';

    // Toggle functionality
    toggleBtn.addEventListener('click', function() {
      const isExpanded = filterWrapper.classList.toggle('mobile-expanded');
      this.setAttribute('aria-expanded', isExpanded);

      const filterText = this.querySelector('.filter-text');
      filterText.textContent = isExpanded ? 'Hide Filters' : 'Show Filters';

      // Scroll to filters when opening
      if (isExpanded) {
        filterWrapper.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    });

    // Update filter count badge
    function updateFilterCount() {
      const activeCount = Object.values(activeFilters).reduce((count, val) => {
        if (Array.isArray(val)) return count + val.length;
        if (typeof val === 'string' && val.trim()) return count + 1;
        return count;
      }, 0);

      const badge = toggleBtn.querySelector('.filter-count');
      if (activeCount > 0) {
        badge.textContent = activeCount;
        badge.style.display = 'inline-block';
        filterWrapper.classList.add('has-active-filters');
      } else {
        badge.style.display = 'none';
        filterWrapper.classList.remove('has-active-filters');
      }
    }

    // Expose updateFilterCount globally for use after filter changes
    window.updateMobileFilterCount = updateFilterCount;

    // Auto-collapse filters after selection on mobile
    document.querySelectorAll('.filters_form-checkbox1 input[type="checkbox"]').forEach(checkbox => {
      checkbox.addEventListener('change', function() {
        setTimeout(updateFilterCount, 100);
      });
    });

    // Initial count update
    setTimeout(updateFilterCount, 500);

    console.log('Mobile filter toggle initialized');
  }

  // Check for mobile viewport
  function isMobileViewport() {
    return window.innerWidth <= 767;
  }

  // Handle resize
  function handleResize() {
    const filterWrapper = document.querySelector(CONFIG.filterFormSelector);
    if (!filterWrapper) return;

    if (!isMobileViewport()) {
      // On desktop, always show filters
      filterWrapper.classList.remove('mobile-expanded');
    }
  }

  // Start when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      init();
      setupMobileFilterToggle();
      window.addEventListener('resize', handleResize);
    });
  } else {
    init();
    setupMobileFilterToggle();
    window.addEventListener('resize', handleResize);
  }
})();
