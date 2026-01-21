/**
 * Inject Bravo Tile products from tile.json into the tile grid
 * This supplements the Webflow CMS items with Bravo Tile products
 */
(function() {
  'use strict';

  // Only run on all-tile page
  if (!window.location.pathname.includes('/materials/all-tile')) return;

  console.log('Bravo Tile Inject: Initializing...');

  async function loadBravoTileProducts() {
    try {
      const response = await fetch('/data/tile.json');
      if (!response.ok) throw new Error('Failed to load tile.json');

      const data = await response.json();
      const bravoProducts = data.tile.filter(tile => tile.brand === 'bravo-tile' && tile.primaryImage);

      console.log(`Bravo Tile Inject: Found ${bravoProducts.length} products with images`);

      return bravoProducts;
    } catch (error) {
      console.error('Bravo Tile Inject: Error loading products', error);
      return [];
    }
  }

  function createProductCard(product) {
    const card = document.createElement('div');
    card.className = 'materials_item w-dyn-item';
    card.setAttribute('role', 'listitem');

    // Match the exact structure of existing Webflow CMS items
    card.innerHTML = `
      <a href="/vendors/bravo-tile/#${product.slug}" class="materials_item-link w-inline-block">
        <div class="materials_image-wrapper">
          <img alt="${product.name}"
               loading="lazy"
               src="${product.primaryImage}"
               class="product1_image is-primary"
               onerror="this.src='/images/placeholder-tile.jpg'"/>
        </div>
        <div class="spacer-xsmall"></div>
        <div fs-cmsfilter-field="Keyword" class="text-size-small">${product.name}</div>
        <div class="hidden">
          <div fs-cmsfilter-field="style" class="text-size-small">${product.subcategory || product.type || 'Tile'}</div>
          <div fs-cmsfilter-field="material" class="text-size-small">${product.category || 'Tile'}</div>
          <div fs-cmsfilter-field="color" class="text-size-small">${product.primaryColor || ''}</div>
          <div fs-cmsfilter-field="brand" class="text-size-small">Bravo Tile</div>
        </div>
      </a>
    `;

    return card;
  }

  function injectProducts(products) {
    // Find the main product grid
    const grid = document.querySelector('.materials_list.w-dyn-items') ||
                 document.querySelector('.w-dyn-list .w-dyn-items') ||
                 document.querySelector('[role="list"].materials_list');

    if (!grid) {
      console.error('Bravo Tile Inject: Could not find product grid');
      return;
    }

    // Get the first existing item to insert before
    const firstItem = grid.querySelector('.materials_item');

    // Add products to grid - insert at beginning so they're visible immediately
    products.forEach(product => {
      const card = createProductCard(product);
      if (firstItem) {
        grid.insertBefore(card, firstItem);
      } else {
        grid.appendChild(card);
      }
    });

    console.log(`Bravo Tile Inject: Added ${products.length} products to grid`);
  }

  // Wait for page to load then inject
  function init() {
    // Wait for Finsweet to finish loading if present
    setTimeout(async () => {
      const products = await loadBravoTileProducts();
      if (products.length > 0) {
        injectProducts(products);

        // Update count if exists
        const countEl = document.querySelector('.fs-cmsfilter_count, .materials-count');
        if (countEl) {
          const currentCount = parseInt(countEl.textContent) || 0;
          countEl.textContent = currentCount + products.length;
        }
      }
    }, 1500); // Wait for Finsweet CMS to load
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
