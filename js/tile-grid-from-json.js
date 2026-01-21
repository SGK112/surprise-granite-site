/**
 * Tile Grid from JSON
 * Replaces Webflow CMS with tiles loaded from tile.json
 * Includes filtering functionality
 */
(function() {
  'use strict';

  // Only run on all-tile page
  if (!window.location.pathname.includes('/materials/all-tile')) return;

  console.log('Tile Grid: Initializing...');

  let allTiles = [];
  let filteredTiles = [];
  let activeFilters = {
    material: [],
    color: [],
    style: [],
    search: ''
  };

  // Load tiles from JSON
  async function loadTiles() {
    try {
      const response = await fetch('/data/tile.json');
      if (!response.ok) throw new Error('Failed to load tile.json');
      const data = await response.json();
      allTiles = data.tile || [];
      console.log(`Tile Grid: Loaded ${allTiles.length} tiles`);
      return allTiles;
    } catch (error) {
      console.error('Tile Grid: Error loading tiles', error);
      return [];
    }
  }

  // Create a tile card HTML
  function createTileCard(tile) {
    const brandLabel = tile.brand === 'bravo-tile' ? 'Bravo Tile' :
                       tile.brand === 'msi' ? 'MSI' : tile.brand;

    const href = `/tiles/${tile.slug}/`;

    return `
      <div role="listitem" class="materials_item w-dyn-item"
           data-material="${tile.material || ''}"
           data-color="${tile.primaryColor || ''}"
           data-style="${tile.type || ''}"
           data-brand="${tile.brand || ''}"
           data-name="${tile.name || ''}">
        <a href="${href}" class="materials_item-link w-inline-block">
          <div class="materials_image-wrapper">
            <img alt="${tile.name}"
                 loading="lazy"
                 src="${tile.primaryImage || '/images/placeholder-tile.jpg'}"
                 class="product1_image is-primary"
                 onerror="this.src='/images/placeholder-tile.jpg'"/>
          </div>
          <div class="spacer-xsmall"></div>
          <div class="text-size-small">${tile.name}</div>
          <div class="tile-meta" style="font-size: 12px; color: #666; margin-top: 4px;">
            ${brandLabel}${tile.material ? ' • ' + tile.material : ''}
          </div>
        </a>
      </div>
    `;
  }

  // Render tiles to the grid
  function renderTiles(tiles) {
    const grid = document.querySelector('.materials_list.w-dyn-items') ||
                 document.querySelector('[role="list"].materials_list');

    if (!grid) {
      console.error('Tile Grid: Could not find grid element');
      return;
    }

    // Clear existing content
    grid.innerHTML = '';

    // Add tiles
    tiles.forEach(tile => {
      grid.insertAdjacentHTML('beforeend', createTileCard(tile));
    });

    // Update count display
    updateCount(tiles.length, allTiles.length);

    console.log(`Tile Grid: Rendered ${tiles.length} tiles`);
  }

  // Update the results count
  function updateCount(showing, total) {
    const countEl = document.querySelector('[fs-cmsfilter-element="results-count-2"]');
    const totalEl = document.querySelector('[fs-cmsfilter-element="items-count-2"]');

    if (countEl) countEl.textContent = showing;
    if (totalEl) totalEl.textContent = total;
  }

  // Apply filters
  function applyFilters() {
    filteredTiles = allTiles.filter(tile => {
      // Search filter
      if (activeFilters.search) {
        const searchLower = activeFilters.search.toLowerCase();
        const nameMatch = (tile.name || '').toLowerCase().includes(searchLower);
        const materialMatch = (tile.material || '').toLowerCase().includes(searchLower);
        const typeMatch = (tile.type || '').toLowerCase().includes(searchLower);
        if (!nameMatch && !materialMatch && !typeMatch) return false;
      }

      // Material filter
      if (activeFilters.material.length > 0) {
        if (!activeFilters.material.includes(tile.material)) return false;
      }

      // Color filter
      if (activeFilters.color.length > 0) {
        if (!activeFilters.color.includes(tile.primaryColor)) return false;
      }

      // Style filter
      if (activeFilters.style.length > 0) {
        if (!activeFilters.style.includes(tile.type)) return false;
      }

      return true;
    });

    renderTiles(filteredTiles);
  }

  // Setup filter event listeners
  function setupFilters() {
    // Search input
    const searchInput = document.querySelector('#Search-Bar, input[fs-cmsfilter-field*="Keyword"]');
    if (searchInput) {
      searchInput.addEventListener('input', (e) => {
        activeFilters.search = e.target.value;
        applyFilters();
      });
    }

    // Material checkboxes
    document.querySelectorAll('[fs-cmsfilter-field="material"]').forEach(el => {
      const checkbox = el.closest('label')?.querySelector('input[type="checkbox"]');
      if (checkbox) {
        checkbox.addEventListener('change', () => {
          const value = el.textContent.trim();
          if (checkbox.checked) {
            if (!activeFilters.material.includes(value)) {
              activeFilters.material.push(value);
            }
          } else {
            activeFilters.material = activeFilters.material.filter(v => v !== value);
          }
          applyFilters();
        });
      }
    });

    // Color checkboxes
    document.querySelectorAll('[fs-cmsfilter-field="color"]').forEach(el => {
      const checkbox = el.closest('label')?.querySelector('input[type="checkbox"]');
      if (checkbox) {
        checkbox.addEventListener('change', () => {
          const value = el.textContent.trim();
          if (checkbox.checked) {
            if (!activeFilters.color.includes(value)) {
              activeFilters.color.push(value);
            }
          } else {
            activeFilters.color = activeFilters.color.filter(v => v !== value);
          }
          applyFilters();
        });
      }
    });

    // Style checkboxes
    document.querySelectorAll('[fs-cmsfilter-field="style"]').forEach(el => {
      const checkbox = el.closest('label')?.querySelector('input[type="checkbox"]');
      if (checkbox) {
        checkbox.addEventListener('change', () => {
          const value = el.textContent.trim();
          if (checkbox.checked) {
            if (!activeFilters.style.includes(value)) {
              activeFilters.style.push(value);
            }
          } else {
            activeFilters.style = activeFilters.style.filter(v => v !== value);
          }
          applyFilters();
        });
      }
    });

    // Clear all button
    const clearAllBtn = document.querySelector('[fs-cmsfilter-element="clear-2"]');
    if (clearAllBtn) {
      clearAllBtn.addEventListener('click', (e) => {
        e.preventDefault();
        activeFilters = { material: [], color: [], style: [], search: '' };

        // Uncheck all checkboxes
        document.querySelectorAll('.filters_form-checkbox1 input[type="checkbox"]').forEach(cb => {
          cb.checked = false;
        });

        // Clear search
        if (searchInput) searchInput.value = '';

        applyFilters();
      });
    }

    // Individual clear buttons
    document.querySelectorAll('[fs-cmsfilter-element="clear"]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        const clearFor = btn.getAttribute('fs-cmsfilter-clear');

        if (clearFor?.includes('Keyword')) {
          activeFilters.search = '';
          if (searchInput) searchInput.value = '';
        }
        if (clearFor?.includes('material')) {
          activeFilters.material = [];
        }
        if (clearFor?.includes('color')) {
          activeFilters.color = [];
        }
        if (clearFor?.includes('style')) {
          activeFilters.style = [];
        }

        // Uncheck relevant checkboxes
        const group = btn.closest('.filters2_filter-group');
        if (group) {
          group.querySelectorAll('input[type="checkbox"]').forEach(cb => {
            cb.checked = false;
          });
        }

        applyFilters();
      });
    });

    console.log('Tile Grid: Filters initialized');
  }

  // Initialize
  async function init() {
    // Wait a moment for Webflow to initialize
    await new Promise(resolve => setTimeout(resolve, 500));

    const tiles = await loadTiles();
    if (tiles.length > 0) {
      filteredTiles = tiles;
      renderTiles(tiles);
      setupFilters();
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
