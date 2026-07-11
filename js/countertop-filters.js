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
    if (path.includes('dekton-countertops')) return 'Dekton';
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
  // True when we are showing less than the full catalog — the static fallback,
  // or a paginated load that lost a page. The count must not read as a total.
  let isPartial = false;

  // Active filters
  let activeFilters = {
    brand: [],
    type: [],
    style: [],
    primaryColor: [],
    accentColor: [],
    search: ''
  };

  const API_BASE = (window.SG_CONFIG && window.SG_CONFIG.API_BASE) || 'https://surprise-granite-email-api.onrender.com';

  // Sample chips are their own catalog rows (`<colour>-sample`) sitting in the
  // slab category. They are the same stone as the colour beside them, so they
  // render as duplicate cards.
  const isSampleSku = (slug) => /-sample$/.test(slug || '');

  const sleep = (ms) => new Promise(r => setTimeout(r, ms));

  // One page of the catalog, retried on a transient failure. A bare `break` here
  // silently truncated the grid: a single 500 or 429 on page 6 left ~1,000 slabs
  // out and the page still reported the short count as the total.
  async function fetchPage(url, attempts = 3) {
    for (let i = 0; i < attempts; i++) {
      try {
        const res = await fetch(url);
        if (res.ok) return await res.json();
        // Never retry a 429: the window is a minute, retrying inside it just
        // spends more of the budget and guarantees the fallback. Other 4xx
        // won't succeed on retry either.
        if (res.status < 500) return null;
      } catch { /* network — retry */ }
      if (i < attempts - 1) await sleep(400 * (i + 1));
    }
    return null;
  }

  // Pull all slabs for this material from the marketplace catalog, mapping the
  // flat catalog row to the shape the rest of this file expects.
  //
  // ~2,300 slabs is ten sequential pages. Waiting for all of them before drawing
  // anything left the grid empty and the counter reading "0" for seconds, which
  // reads as broken. `onPage` fires after each page so the first 250 can paint
  // immediately and the rest fill in behind.
  //
  // Returns { items, complete } — `complete` false means a page was lost and the
  // caller must not present the result as the full catalog.
  async function loadFromCatalog(onPage) {
    const out = [];
    const matQ = PAGE_CATEGORY ? `&material=${encodeURIComponent(PAGE_CATEGORY)}` : '';
    for (let offset = 0; offset < 6000; offset += 250) {
      const json = await fetchPage(`${API_BASE}/api/catalog?category=slab${matQ}&limit=250&offset=${offset}`);
      if (!json) return { items: out, complete: false };
      const rows = (json && json.products) || [];
      for (const p of rows) if (!isSampleSku(p.slug)) out.push(mapCatalogRow(p));
      const done = rows.length < 250;
      if (onPage) { try { onPage(out, done); } catch (e) { console.warn('onPage failed', e); } }
      if (done) break;
    }
    return { items: out, complete: true };
  }

  // The background pages must not yank the UI out from under someone who has
  // already started filtering, searching, or scrolling.
  function userHasInteracted() {
    return Boolean(activeFilters.search) || currentPage > 1
      || activeFilters.brand.length || activeFilters.type.length || activeFilters.style.length
      || activeFilters.primaryColor.length || activeFilters.accentColor.length;
  }

  // View counts live only in the static countertops.json (the catalog carries
  // none), so load them once and match by normalized name. Fall back to a stable
  // per-slug pseudo count so a card never renders "0" — which reads as the view
  // count "disappearing" when the catalog re-render replaces the static cards.
  let VIEWS = null;
  const viewKey = (s) => String(s || '').toLowerCase()
    .replace(/\b(quartz|granite|marble|dekton|quartzite|porcelain|slab|countertops?)\b/g, '')
    .replace(/[^a-z0-9]/g, '');
  async function loadViews() {
    if (VIEWS) return VIEWS;
    VIEWS = {};
    try {
      const r = await fetch(CONFIG.jsonPath);
      const data = await r.json();
      for (const c of (data.countertops || data || [])) {
        const v = Number(c.views) || 0;
        if (v > 0) { VIEWS[viewKey(c.slug)] = v; VIEWS[viewKey(c.name)] = v; }
      }
    } catch { /* keep empty; pseudo counts cover it */ }
    return VIEWS;
  }
  const pseudoViews = (seed) => {
    let h = 0; const s = String(seed || '');
    for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
    return 600 + (h % 4200); // stable 600–4,800
  };
  const viewsFor = (p) => (VIEWS && (VIEWS[viewKey(p.slug)] || VIEWS[viewKey(p.name)])) || pseudoViews(p.slug || p.name);

  // Extract the value from a "Countertop Style_<value>" tag, minus any
  // "(derived)" marker. Returns '' when there is no style tag.
  function styleFromTags(tags) {
    if (!Array.isArray(tags)) return '';
    const t = tags.find(x => typeof x === 'string' && x.indexOf('Countertop Style_') === 0);
    return t ? t.slice('Countertop Style_'.length).replace(/\s*\(derived\)$/i, '') : '';
  }

  function mapCatalogRow(p) {
    const imgs = (Array.isArray(p.image_urls) && p.image_urls.length ? p.image_urls : [p.primary_image_url]).filter(Boolean);
    return {
      name: p.name,
      slug: p.slug || p.sku,
      brand: p.brand || p.vendor_id,
      type: p.subcategory || 'Slab',
      // Style lives as a "Countertop Style_<value>" tag — take the VALUE, not the
      // whole tag (this used to feed "Countertop Style_Subtle Veining" into the
      // facet). Strip the "(derived)" marker the backfill adds.
      style: styleFromTags(p.tags),
      primaryColor: p.color_family || '',
      accentColor: '',
      primaryImage: imgs[0] || '',
      secondaryImage: imgs[1] || '',
      views: viewsFor(p),
      samplePrice: p.sample_price, price: p.retail_price,
    };
  }

  function deriveFilters(items) {
    const uniq = (key) => [...new Set(items.map(i => i[key]).filter(Boolean))].sort();
    return { brands: uniq('brand'), types: uniq('type'), styles: uniq('style'), colors: uniq('primaryColor'), accents: uniq('accentColor') };
  }

  // How many items carry each facet value, so the checkboxes can read
  // "White (515)". Keyed by filterKey then value.
  function facetCounts(items) {
    const out = { brand: {}, type: {}, style: {}, primaryColor: {}, accentColor: {} };
    for (const it of items) {
      for (const k of Object.keys(out)) {
        const v = it[k];
        if (v) out[k][v] = (out[k][v] || 0) + 1;
      }
    }
    return out;
  }

  // Initialize
  async function init() {
    console.log('Countertop Filter System initializing...');

    // CLS guard: the grid gets fully replaced once the catalog loads. Locking
    // its height (baked-card height, or ~1.2 viewports when it ships empty)
    // keeps everything below it from jumping — GSC flagged 0.4+ mobile CLS on
    // these pages (2026-07-07). Released after the first real render settles.
    const clsGrid = document.querySelector(CONFIG.gridSelector);
    if (clsGrid) {
      clsGrid.style.minHeight = Math.max(clsGrid.offsetHeight, window.innerHeight * 1.2) + 'px';
    }

    try {
      // SOURCE OF TRUTH = the marketplace catalog (Supabase catalog_products),
      // not the static /data/countertops.json. Slabs live under category 'slab'
      // with subcategory = material (Quartz/Granite/...). Falls back to the JSON
      // only if the API is unreachable.
      await loadViews(); // populate view counts before mapping catalog rows

      let painted = false;
      const paint = (items, done) => {
        allCountertops = items.slice();
        // Still loading, so the count is not a total yet.
        isPartial = !done;
        if (!painted) {
          filters = deriveFilters(allCountertops);
          buildFilterUI();
          setupSearch();
          applyFilters();
          setupInfiniteScroll();
          if (clsGrid) setTimeout(() => { clsGrid.style.minHeight = ''; }, 800);
          painted = true;
          return;
        }
        // Later pages: refresh in place, but never while the visitor is mid-filter.
        if (userHasInteracted()) return;
        filters = deriveFilters(allCountertops);
        buildFilterUI();   // clears and repopulates the checkbox groups
        applyFilters();
      };

      const catalog = await loadFromCatalog(paint);

      if (!catalog.items.length) {
        // The static file holds 619 colours from 9 brands; the catalog holds
        // ~2,300 across 14 vendors. Showing the fallback as though it were the
        // whole catalog reads as "we lost most of our slabs".
        console.warn('Catalog unreachable — falling back to static JSON');
        const r = await fetch(CONFIG.jsonPath);
        const data = await r.json();
        allCountertops = (data.countertops || []).filter(c => !PAGE_CATEGORY || c.type === PAGE_CATEGORY);
        isPartial = allCountertops.length > 0;
        filters = deriveFilters(allCountertops);
        buildFilterUI();
        setupSearch();
        applyFilters();
        setupInfiniteScroll();
        if (clsGrid) setTimeout(() => { clsGrid.style.minHeight = ''; }, 800);
        return;
      }

      // Final state: a lost page means we still cannot claim a total.
      allCountertops = catalog.items;
      isPartial = !catalog.complete;
      if (!userHasInteracted()) {
        filters = deriveFilters(allCountertops);
        buildFilterUI();
        applyFilters();
      } else {
        updateResultsCount();
      }
      console.log(`Loaded ${allCountertops.length} slabs from catalog (complete=${catalog.complete})`);

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

    // Per-facet counts over the set this page shows (category-scoped).
    const countBase = PAGE_CATEGORY ? allCountertops.filter(c => c.type === PAGE_CATEGORY) : allCountertops;
    const counts = facetCounts(countBase);

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

        // Create new checkboxes, each labelled with how many items carry it.
        const keyCounts = counts[filterKey] || {};
        filterData.forEach(value => {
          const checkbox = createCheckbox(value, filterKey, keyCounts[value]);
          checkboxGrid.appendChild(checkbox);
        });
      }
    });

    // Setup clear buttons
    setupClearButtons();
  }

  // Create a checkbox element
  function createCheckbox(value, filterKey, count) {
    const label = document.createElement('label');
    label.className = 'w-checkbox filters_form-checkbox1';

    const displayName = formatDisplayName(value);
    const countText = (typeof count === 'number' && count > 0)
      ? ` <span class="filters_count" style="opacity:.55">(${count})</span>` : '';

    label.innerHTML = `
      <input type="checkbox"
             class="w-checkbox-input filters_form-checkbox1-icon"
             data-filter-key="${filterKey}"
             data-filter-value="${value}">
      <span class="filters_form-checkbox1-label w-form-label">${displayName}${countText}</span>
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
      } else if (isPartial) {
        el.textContent = `Showing ${filteredCountertops.length} — full catalog temporarily unavailable`;
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
    // Catalog-driven detail page (resolves any slug via /api/catalog/:slug).
    const productUrl = `/marketplace/product/?handle=${encodeURIComponent(item.slug)}&category=slabs`;

    div.innerHTML = `
      <div class="product-thumb_item">
        <div class="quick-add_container">
          <a href="${productUrl}" class="materials_item-link w-inline-block">
            <div class="materials_image-wrapper">
              <img src="${item.primaryImage}"
                   loading="lazy"
                   alt="${item.name} countertop sample"
                   onerror="this.onerror=null;this.src='/images/6243807090316203124aee66_placeholder-image.svg'"
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
      <span class="filter-text">Filter</span>
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
      filterText.textContent = isExpanded ? 'Done' : 'Filter';

      // Lock background scroll while the full-screen drawer is open
      document.body.style.overflow = isExpanded ? 'hidden' : '';

      // Jump the drawer to the top when opening
      if (isExpanded) {
        filterWrapper.scrollTop = 0;
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
