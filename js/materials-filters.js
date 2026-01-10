/**
 * Unified Materials Filter System
 * Works for countertops, tile, and flooring pages
 */

(function() {
  'use strict';

  // Detect page type from URL
  function detectPageType() {
    const path = window.location.pathname;
    if (path.includes('/materials/all-countertops') || path.includes('/countertops/')) return 'countertops';
    if (path.includes('/materials/all-tile') || path.includes('/tile/')) return 'tile';
    if (path.includes('/materials/flooring') || path.includes('/flooring/')) return 'flooring';
    if (path.includes('granite-countertops')) return 'countertops';
    if (path.includes('marble-countertops')) return 'countertops';
    if (path.includes('quartz-countertops')) return 'countertops';
    if (path.includes('porcelain-countertops')) return 'countertops';
    if (path.includes('quartzite-countertops')) return 'countertops';
    return null;
  }

  const PAGE_TYPE = detectPageType();
  if (!PAGE_TYPE) {
    console.log('Materials filter: Not a materials page, skipping initialization');
    return;
  }

  // Configuration per page type
  const CONFIGS = {
    countertops: {
      jsonPath: '/data/countertops.json',
      dataKey: 'countertops',
      productUrlPrefix: '/countertops/',
      itemName: 'countertop'
    },
    tile: {
      jsonPath: '/data/tile.json',
      dataKey: 'tile',
      productUrlPrefix: '/tile/',
      itemName: 'tile'
    },
    flooring: {
      jsonPath: '/data/flooring.json',
      dataKey: 'flooring',
      productUrlPrefix: '/flooring/',
      itemName: 'flooring'
    }
  };

  const CONFIG = {
    ...CONFIGS[PAGE_TYPE],
    itemsPerPage: 48,
    gridSelector: '.materials_list.w-dyn-items',
    filterFormSelector: '.filters_filters-wrapper',
    searchInputSelector: 'input[name="Search-Bar"]'
  };

  console.log(`Materials Filter: Detected page type "${PAGE_TYPE}"`);

  // State
  let allItems = [];
  let filteredItems = [];
  let currentPage = 1;
  let isLoading = false;

  let activeFilters = {
    brand: [],
    type: [],
    style: [],
    primaryColor: [],
    accentColor: [],
    search: ''
  };

  // Get subcategory from URL (e.g., granite-countertops)
  function getSubcategory() {
    const path = window.location.pathname;
    if (path.includes('granite-countertops')) return 'Granite';
    if (path.includes('marble-countertops')) return 'Marble';
    if (path.includes('porcelain-countertops')) return 'Porcelain';
    if (path.includes('quartz-countertops')) return 'Quartz';
    if (path.includes('quartzite-countertops')) return 'Quartzite';
    return null;
  }

  const SUBCATEGORY = getSubcategory();

  // Initialize
  async function init() {
    console.log(`Materials Filter System initializing for ${PAGE_TYPE}...`);

    try {
      const response = await fetch(CONFIG.jsonPath);
      if (!response.ok) throw new Error(`Failed to load ${CONFIG.jsonPath}`);

      const data = await response.json();
      allItems = data[CONFIG.dataKey] || data.countertops || data.tile || data.flooring || [];

      console.log(`Loaded ${allItems.length} ${PAGE_TYPE} items`);

      buildFilterUI();
      setupSearch();
      applyFilters();
      setupInfiniteScroll();

    } catch (error) {
      console.error('Failed to initialize filter system:', error);
    }
  }

  // Build filter UI
  function buildFilterUI() {
    const filterWrapper = document.querySelector(CONFIG.filterFormSelector);
    if (!filterWrapper) {
      console.error('Filter wrapper not found');
      return;
    }

    // Extract unique values from data
    const types = [...new Set(allItems.map(item => item.type).filter(Boolean))].sort();
    const colors = [...new Set(allItems.map(item => item.primaryColor).filter(Boolean))].sort();
    const brands = [...new Set(allItems.map(item => item.brand).filter(Boolean))].sort();
    const styles = [...new Set(allItems.map(item => item.style).filter(Boolean))].sort();
    const accents = [...new Set(allItems.map(item => item.accentColor).filter(Boolean))].sort();

    const filterGroups = filterWrapper.querySelectorAll('.filters2_filter-group');

    filterGroups.forEach(group => {
      const headingEl = group.querySelector('.heading-style-h6');
      if (!headingEl) return;

      const headingText = headingEl.textContent.trim().toLowerCase();
      let checkboxGrid = group.querySelector('.filters_checkbox-grid') ||
                         group.querySelector('.filters_list') ||
                         group.querySelector('.filters_filter-options');

      if (!checkboxGrid) return;

      let filterData = [];
      let filterKey = '';

      if (headingText.includes('brand')) {
        filterData = brands;
        filterKey = 'brand';
      } else if (headingText.includes('material') || headingText.includes('type')) {
        if (SUBCATEGORY) {
          group.style.display = 'none';
          return;
        }
        filterData = types;
        filterKey = 'type';
      } else if (headingText.includes('style')) {
        filterData = styles;
        filterKey = 'style';
      } else if (headingText.includes('main color') || headingText.includes('color')) {
        filterData = colors;
        filterKey = 'primaryColor';
      } else if (headingText.includes('accent')) {
        filterData = accents;
        filterKey = 'accentColor';
      }

      if (filterData.length && filterKey) {
        checkboxGrid.innerHTML = '';
        filterData.forEach(value => {
          const checkbox = createCheckbox(value, filterKey);
          checkboxGrid.appendChild(checkbox);
        });
      }
    });

    setupClearButtons();
  }

  // Create checkbox element
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

    const input = label.querySelector('input');
    input.addEventListener('change', function() {
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
      checkbox.checked = isChecked;
      const label = checkbox.closest('label');
      if (isChecked) {
        label.classList.add('sg-label-checked');
      } else {
        label.classList.remove('sg-label-checked');
      }
    }

    currentPage = 1;
    applyFilters();

    // Update mobile filter count if available
    if (window.updateMobileFilterCount) {
      window.updateMobileFilterCount();
    }
  }

  // Setup clear buttons
  function setupClearButtons() {
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

    document.querySelectorAll('.filters_form-checkbox1 input[type="checkbox"]').forEach(cb => {
      cb.checked = false;
      cb.closest('label')?.classList.remove('sg-label-checked');
    });

    const searchInput = document.querySelector(CONFIG.searchInputSelector);
    if (searchInput) searchInput.value = '';

    currentPage = 1;
    applyFilters();
  }

  // Apply filters
  function applyFilters() {
    filteredItems = allItems.filter(item => {
      // Subcategory filter (e.g., only Granite on granite-countertops page)
      if (SUBCATEGORY && item.type !== SUBCATEGORY) {
        return false;
      }

      // Brand filter
      if (activeFilters.brand.length > 0 && !activeFilters.brand.includes(item.brand)) {
        return false;
      }

      // Type filter
      if (activeFilters.type.length > 0 && !activeFilters.type.includes(item.type)) {
        return false;
      }

      // Style filter
      if (activeFilters.style.length > 0 && !activeFilters.style.includes(item.style)) {
        return false;
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

    updateResultsCount();
    renderProducts(true);
  }

  // Update results count
  function updateResultsCount() {
    const countEls = document.querySelectorAll('[fs-cmsfilter-element="results-count-2"], .filters_results-text');
    const total = SUBCATEGORY
      ? allItems.filter(item => item.type === SUBCATEGORY).length
      : allItems.length;

    countEls.forEach(el => {
      if (el.matches('[fs-cmsfilter-element="results-count-2"]')) {
        el.textContent = filteredItems.length;
      } else {
        el.textContent = `Showing ${filteredItems.length} of ${total}`;
      }
    });
  }

  // Render products
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
    const itemsToRender = filteredItems.slice(startIndex, endIndex);

    itemsToRender.forEach(item => {
      const card = createProductCard(item);
      grid.appendChild(card);
    });

    isLoading = false;
  }

  // Create product card
  function createProductCard(item) {
    const div = document.createElement('div');
    div.className = 'w-dyn-item';
    div.setAttribute('role', 'listitem');

    const brandDisplay = formatDisplayName(item.brand);
    const productUrl = `${CONFIG.productUrlPrefix}${item.slug}`;
    const imageSrc = item.primaryImage || `/images/placeholder-${CONFIG.itemName}.jpg`;
    const views = item.views ? item.views.toLocaleString() : '0';

    div.innerHTML = `
      <div class="product-thumb_item">
        <div class="quick-add_container">
          <a href="${productUrl}" class="materials_item-link w-inline-block">
            <div class="materials_image-wrapper">
              <img src="${imageSrc}"
                   loading="lazy"
                   alt="${item.name} ${CONFIG.itemName}"
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
            ${item.views ? `
            <div class="product-views_component">
              <div class="icon-embed-xxsmall w-embed">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zM12 17c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z"/>
                </svg>
              </div>
              <div>${views}</div>
            </div>
            ` : ''}
          </div>
          <div class="product1_details-body">
            <div class="text-color-grey">${item.type || ''}</div>
            <div class="text-color-grey">${brandDisplay}</div>
          </div>
        </a>
      </div>
    `;

    return div;
  }

  // Setup search
  function setupSearch() {
    const searchInput = document.querySelector(CONFIG.searchInputSelector);
    if (!searchInput) return;

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
          const totalPages = Math.ceil(filteredItems.length / CONFIG.itemsPerPage);
          if (currentPage < totalPages) {
            isLoading = true;
            currentPage++;
            renderProducts(false);
          }
        }
      });
    }, { rootMargin: '200px' });

    const sentinel = document.createElement('div');
    sentinel.className = 'infinite-scroll-sentinel';
    sentinel.style.height = '1px';
    grid.parentNode.insertBefore(sentinel, grid.nextSibling);
    observer.observe(sentinel);
  }

  // Start
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
