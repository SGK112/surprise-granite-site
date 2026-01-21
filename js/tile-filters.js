/**
 * Tile Filter System v5
 * Simple, compact filters
 */

(function() {
  'use strict';

  const CONFIG = {
    jsonPath: '/data/tile.json',
    itemsPerPage: 48,
    gridSelector: '.materials_list.w-dyn-items',
    filterFormSelector: '.filters_filters-wrapper'
  };

  const FILTER_DEFINITIONS = [
    { key: 'brand', label: 'Brand', dataKey: 'brands' },
    { key: 'material', label: 'Material', dataKey: 'materials' },
    { key: 'style', label: 'Style', dataKey: 'styles' },
    { key: 'color', label: 'Color', dataKey: 'colors' }
  ];

  let allTiles = [];
  let filteredTiles = [];
  let filters = {};
  let currentPage = 1;

  let activeFilters = {
    material: [],
    color: [],
    style: [],
    brand: [],
    search: ''
  };

  // Check if mobile
  const isMobile = window.innerWidth <= 767;

  async function init() {
    console.log('Tile Filter System v5 initializing...');
    console.log('Is mobile:', isMobile);

    try {
      const response = await fetch(CONFIG.jsonPath);
      if (!response.ok) throw new Error('Failed to load JSON');

      const data = await response.json();
      allTiles = data.tiles || [];
      filters = data.filters || {};

      console.log('Loaded tiles:', allTiles.length);

      if (isMobile) {
        // Mobile: Hide filter sidebar, just load tiles
        hideFilterSidebar();
        applyFilters();
        setupInfiniteScroll();
      } else {
        // Desktop: Show full filter UI
        buildFilterUI();
        applyFilters();
        setupInfiniteScroll();
      }

    } catch (error) {
      console.error('Failed to initialize:', error);
    }
  }

  function hideFilterSidebar() {
    const wrapper = document.querySelector(CONFIG.filterFormSelector);
    if (wrapper) {
      wrapper.style.display = 'none';
    }
    // Also hide the entire filter column if it exists
    const filterLayout = document.querySelector('.filters_layout');
    if (filterLayout) {
      filterLayout.style.cssText = 'display:block !important;';
    }
    const filterSidebar = document.querySelector('[nav-transition="filter-sidebar"]');
    if (filterSidebar) {
      filterSidebar.style.display = 'none';
    }
  }

  function buildFilterUI() {
    const wrapper = document.querySelector(CONFIG.filterFormSelector);
    console.log('Wrapper found:', wrapper);

    if (!wrapper) {
      console.error('Filter wrapper not found');
      return;
    }

    // Clear and rebuild with aggressive reset
    wrapper.innerHTML = '';
    wrapper.style.cssText = 'background:#f8f9fa !important;border-radius:12px !important;padding:12px !important;display:block !important;gap:0 !important;row-gap:0 !important;column-gap:0 !important;grid-gap:0 !important;';

    // Results bar
    const resultsBar = document.createElement('div');
    resultsBar.style.cssText = 'background:#1a1a2e;color:#fff;padding:10px;border-radius:8px;margin-bottom:10px;display:flex;justify-content:space-between;align-items:center;';
    resultsBar.innerHTML = `
      <span style="font-size:13px;">Showing <strong id="tile-count-showing" style="color:#f9cb00;">0</strong> of <strong id="tile-count-total" style="color:#f9cb00;">0</strong></span>
      <button id="clear-all-btn" style="background:rgba(255,255,255,0.2);border:none;color:#fff;padding:5px 10px;border-radius:4px;cursor:pointer;font-size:11px;">Clear All</button>
    `;
    wrapper.appendChild(resultsBar);

    document.getElementById('clear-all-btn').addEventListener('click', clearAllFilters);

    // Search
    const searchDiv = document.createElement('div');
    searchDiv.style.cssText = 'margin-bottom:10px;';
    searchDiv.innerHTML = `<input type="text" id="tile-search" placeholder="Search tiles..." style="width:100%;padding:8px 10px;border:1px solid #ddd;border-radius:6px;font-size:13px;box-sizing:border-box;">`;
    wrapper.appendChild(searchDiv);

    document.getElementById('tile-search').addEventListener('input', function() {
      activeFilters.search = this.value.toLowerCase();
      currentPage = 1;
      applyFilters();
    });

    // Filter groups
    FILTER_DEFINITIONS.forEach((def, index) => {
      const options = filters[def.dataKey] || [];
      console.log(`Filter ${def.key}:`, options.length, 'options');
      if (options.length === 0) return;

      const group = createFilterGroup(def.label, def.key, options, index === 0);
      wrapper.appendChild(group);
    });

    console.log('Filter UI built');
  }

  function createFilterGroup(label, filterKey, options, startExpanded) {
    const group = document.createElement('div');
    group.style.cssText = 'background:#fff;border-radius:8px;margin-bottom:6px;border:1px solid #eee;overflow:hidden;';
    group.dataset.filterKey = filterKey;
    group.dataset.expanded = startExpanded ? 'true' : 'false';

    const header = document.createElement('div');
    header.style.cssText = 'display:flex;justify-content:space-between;align-items:center;padding:10px 12px;cursor:pointer;background:#fff;';
    header.innerHTML = `
      <div style="display:flex;align-items:center;gap:8px;">
        <span style="font-size:10px;color:#666;" class="arrow">${startExpanded ? '▲' : '▼'}</span>
        <span style="font-size:12px;font-weight:700;text-transform:uppercase;color:#1a1a2e;">${label}</span>
        <span class="badge" style="display:none;background:#f9cb00;color:#1a1a2e;font-size:9px;padding:2px 6px;border-radius:10px;font-weight:700;">0</span>
      </div>
      <button class="clear-btn" style="font-size:10px;color:#888;background:none;border:none;cursor:pointer;">Clear</button>
    `;

    const optionsDiv = document.createElement('div');
    optionsDiv.className = 'options-container';
    optionsDiv.style.cssText = startExpanded ? 'display:block;padding:6px 8px;background:#fafafa;border-top:2px solid #f9cb00;max-height:200px;overflow-y:auto;' : 'display:none;';

    options.forEach(value => {
      const row = document.createElement('div');
      row.style.cssText = 'display:flex;align-items:center;padding:6px 8px;border-radius:4px;cursor:pointer;margin:2px 0;';
      row.dataset.key = filterKey;
      row.dataset.value = value;
      row.innerHTML = `
        <div class="checkbox" style="width:14px;height:14px;border:2px solid #ccc;border-radius:3px;margin-right:8px;display:flex;align-items:center;justify-content:center;background:#fff;font-size:10px;"></div>
        <span style="font-size:12px;color:#444;">${formatName(value)}</span>
      `;

      row.addEventListener('click', function() {
        const k = this.dataset.key;
        const v = this.dataset.value;
        const isActive = this.dataset.active === 'true';

        if (isActive) {
          this.dataset.active = 'false';
          this.style.background = '';
          this.querySelector('.checkbox').style.cssText = 'width:14px;height:14px;border:2px solid #ccc;border-radius:3px;margin-right:8px;display:flex;align-items:center;justify-content:center;background:#fff;font-size:10px;';
          this.querySelector('.checkbox').textContent = '';
          activeFilters[k] = activeFilters[k].filter(x => x !== v);
        } else {
          this.dataset.active = 'true';
          this.style.background = 'rgba(249,203,0,0.15)';
          this.querySelector('.checkbox').style.cssText = 'width:14px;height:14px;border:2px solid #d9a800;border-radius:3px;margin-right:8px;display:flex;align-items:center;justify-content:center;background:#f9cb00;font-size:10px;color:#1a1a2e;font-weight:bold;';
          this.querySelector('.checkbox').textContent = '✓';
          if (!activeFilters[k].includes(v)) {
            activeFilters[k].push(v);
          }
        }

        updateBadge(group, k);
        currentPage = 1;
        applyFilters();
      });

      row.addEventListener('mouseenter', function() {
        if (this.dataset.active !== 'true') {
          this.style.background = 'rgba(249,203,0,0.08)';
        }
      });
      row.addEventListener('mouseleave', function() {
        if (this.dataset.active !== 'true') {
          this.style.background = '';
        }
      });

      optionsDiv.appendChild(row);
    });

    // Toggle expand/collapse
    header.addEventListener('click', function(e) {
      if (e.target.classList.contains('clear-btn')) return;
      const expanded = group.dataset.expanded === 'true';
      group.dataset.expanded = expanded ? 'false' : 'true';
      optionsDiv.style.display = expanded ? 'none' : 'block';
      optionsDiv.style.cssText = expanded ? 'display:none;' : 'display:block;padding:6px 8px;background:#fafafa;border-top:2px solid #f9cb00;max-height:200px;overflow-y:auto;';
      header.querySelector('.arrow').textContent = expanded ? '▼' : '▲';
    });

    // Clear button
    header.querySelector('.clear-btn').addEventListener('click', function(e) {
      e.stopPropagation();
      activeFilters[filterKey] = [];
      optionsDiv.querySelectorAll('[data-active="true"]').forEach(row => {
        row.dataset.active = 'false';
        row.style.background = '';
        row.querySelector('.checkbox').style.cssText = 'width:14px;height:14px;border:2px solid #ccc;border-radius:3px;margin-right:8px;display:flex;align-items:center;justify-content:center;background:#fff;font-size:10px;';
        row.querySelector('.checkbox').textContent = '';
      });
      updateBadge(group, filterKey);
      currentPage = 1;
      applyFilters();
    });

    group.appendChild(header);
    group.appendChild(optionsDiv);
    return group;
  }

  function updateBadge(group, filterKey) {
    const badge = group.querySelector('.badge');
    const count = activeFilters[filterKey].length;
    badge.textContent = count;
    badge.style.display = count > 0 ? 'inline-block' : 'none';
  }

  function clearAllFilters() {
    activeFilters = { material: [], color: [], style: [], brand: [], search: '' };
    document.querySelectorAll('[data-active="true"]').forEach(row => {
      row.dataset.active = 'false';
      row.style.background = '';
      row.querySelector('.checkbox').style.cssText = 'width:14px;height:14px;border:2px solid #ccc;border-radius:3px;margin-right:8px;display:flex;align-items:center;justify-content:center;background:#fff;font-size:10px;';
      row.querySelector('.checkbox').textContent = '';
    });
    document.querySelectorAll('.badge').forEach(b => b.style.display = 'none');
    const searchInput = document.getElementById('tile-search');
    if (searchInput) searchInput.value = '';
    currentPage = 1;
    applyFilters();
  }

  function formatName(value) {
    if (!value) return '';
    if (value === 'msi') return 'MSI';
    if (value === 'bravo-tile') return 'Bravo Tile';
    return value.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
  }

  function applyFilters() {
    filteredTiles = allTiles.filter(tile => {
      if (activeFilters.search) {
        const s = activeFilters.search;
        const match = (tile.name || '').toLowerCase().includes(s) ||
                      (tile.material || '').toLowerCase().includes(s) ||
                      (tile.type || '').toLowerCase().includes(s) ||
                      (tile.brand || '').toLowerCase().includes(s);
        if (!match) return false;
      }

      if (activeFilters.material.length > 0 && !activeFilters.material.includes(tile.material)) return false;
      if (activeFilters.color.length > 0 && !activeFilters.color.includes(tile.primaryColor)) return false;
      if (activeFilters.style.length > 0 && !activeFilters.style.includes(tile.type)) return false;
      if (activeFilters.brand.length > 0 && !activeFilters.brand.includes(tile.brand)) return false;

      return true;
    });

    renderTiles();
    updateCount();
  }

  function renderTiles() {
    const grid = document.querySelector(CONFIG.gridSelector);
    if (!grid) {
      console.error('Grid not found');
      return;
    }

    const tilesToShow = filteredTiles.slice(0, currentPage * CONFIG.itemsPerPage);

    grid.innerHTML = tilesToShow.map(tile => {
      const brandLabel = tile.brand === 'bravo-tile' ? 'Bravo Tile' : tile.brand === 'msi' ? 'MSI' : tile.brand;
      return `
        <div role="listitem" class="materials_item w-dyn-item">
          <a href="/tiles/${tile.slug}/" class="materials_item-link w-inline-block">
            <div class="materials_image-wrapper">
              <img alt="${tile.name}" loading="lazy"
                   src="${tile.primaryImage || '/images/placeholder-tile.jpg'}"
                   class="product1_image is-primary"
                   onerror="this.src='/images/placeholder-tile.jpg'"/>
            </div>
            <div class="spacer-xsmall"></div>
            <div class="text-size-small text-weight-semibold">${tile.name}</div>
            <div class="text-size-small text-color-grey">${brandLabel}${tile.material ? ' · ' + tile.material : ''}</div>
          </a>
        </div>
      `;
    }).join('');
  }

  function updateCount() {
    const showing = Math.min(currentPage * CONFIG.itemsPerPage, filteredTiles.length);
    const showingEl = document.getElementById('tile-count-showing');
    const totalEl = document.getElementById('tile-count-total');
    if (showingEl) showingEl.textContent = showing;
    if (totalEl) totalEl.textContent = filteredTiles.length;
  }

  function setupInfiniteScroll() {
    const grid = document.querySelector(CONFIG.gridSelector);
    if (!grid || !grid.parentElement) return;

    const observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          const totalPages = Math.ceil(filteredTiles.length / CONFIG.itemsPerPage);
          if (currentPage < totalPages) {
            currentPage++;
            renderTiles();
            updateCount();
          }
        }
      });
    }, { rootMargin: '200px' });

    const sentinel = document.createElement('div');
    sentinel.style.height = '1px';
    grid.parentElement.appendChild(sentinel);
    observer.observe(sentinel);
  }

  // Initialize
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
