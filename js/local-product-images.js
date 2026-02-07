/**
 * Local Product Images
 * Replaces Shopyflow images with local marketplace data
 * Fixes broken images and Shopyflow errors
 */

(function() {
  'use strict';

  const PLACEHOLDER = 'https://cdn.prod.website-files.com/6456ce4476abb2d4f9fbad10/6456ce4576abb21a6cfbc44d_Msi-surfaces-surprise-quartz-calacatta-abezzo-quartz-slab.jpg';

  let slabsData = null;
  let productsData = null;

  // Load local data
  async function loadData() {
    try {
      const [slabsRes, productsRes] = await Promise.all([
        fetch('/data/slabs.json').catch(() => null),
        fetch('/data/marketplace-products.json').catch(() => null)
      ]);

      if (slabsRes?.ok) {
        slabsData = await slabsRes.json();
        console.log('Loaded', slabsData.length, 'slabs from local data');
      }

      if (productsRes?.ok) {
        productsData = await productsRes.json();
        console.log('Loaded marketplace products from local data');
      }
    } catch (e) {
      console.log('Could not load local product data:', e);
    }
  }

  // Find matching product image by name
  function findProductImage(productName) {
    if (!productName) return null;

    const searchName = productName.toLowerCase()
      .replace(/\s+sample$/i, '')
      .replace(/\s+quartz$/i, '')
      .replace(/\s+granite$/i, '')
      .replace(/\s+marble$/i, '')
      .trim();

    // Search in slabs.json
    if (slabsData) {
      for (const slab of slabsData) {
        const slabName = (slab.title || '').toLowerCase()
          .replace(/\s+sample$/i, '')
          .trim();

        if (slabName.includes(searchName) || searchName.includes(slabName)) {
          if (slab.images && slab.images.length > 0) {
            return slab.images[0];
          }
        }
      }
    }

    // Search in marketplace-products.json
    if (productsData?.by_brand) {
      for (const brand in productsData.by_brand) {
        for (const product of productsData.by_brand[brand]) {
          const prodName = (product.name || '').toLowerCase();
          if (prodName.includes(searchName) || searchName.includes(prodName)) {
            if (product.primaryImage) {
              return product.primaryImage;
            }
          }
        }
      }
    }

    return null;
  }

  // Fix all product images on the page
  function fixProductImages() {
    // Fix images in product cards
    document.querySelectorAll('[sf-product], .product-card, .collection-item, .w-dyn-item').forEach(card => {
      const imgs = card.querySelectorAll('img');
      const nameEl = card.querySelector('[fs-cmsfilter-field="Keyword"], .product-name, .product-title, h3, h4');
      const productName = nameEl?.textContent?.trim();

      imgs.forEach(img => {
        // Check if image is broken or empty
        const isBroken = !img.src ||
                         img.src.includes('undefined') ||
                         img.src.includes('null') ||
                         (img.complete && img.naturalHeight === 0);

        if (isBroken || img.src.includes('cdn.shopify.com')) {
          // Try to find local image
          const localImage = findProductImage(productName);
          if (localImage) {
            img.src = localImage;
          } else if (isBroken) {
            img.src = PLACEHOLDER;
          }
        }

        // Add error handler for future errors
        img.onerror = function() {
          this.onerror = null;
          const fallback = findProductImage(productName) || PLACEHOLDER;
          this.src = fallback;
        };
      });
    });

    // Fix any remaining broken images
    document.querySelectorAll('img').forEach(img => {
      if (img.complete && img.naturalHeight === 0 && img.src && !img.src.includes('data:')) {
        img.src = PLACEHOLDER;
      }

      if (!img.onerror) {
        img.onerror = function() {
          this.onerror = null;
          this.src = PLACEHOLDER;
        };
      }
    });
  }

  // Suppress Shopyflow errors
  function suppressShopyflowErrors() {
    const originalError = console.error;
    console.error = function(...args) {
      const msg = args[0]?.toString() || '';
      if (msg.includes('shopyflow') ||
          msg.includes('sf-product') ||
          msg.includes('Storefront Access Token') ||
          msg.includes('cart module')) {
        // Suppress Shopyflow errors
        return;
      }
      originalError.apply(console, args);
    };
  }

  // Remove blog content from product areas
  function removeBlogContent() {
    // Keywords that indicate blog content
    const blogKeywords = [
      'top 10',
      'best cambria',
      'updated for 2024',
      'updated for 2025',
      'blog',
      'article',
      'tips',
      'guide',
      'how to'
    ];

    // Check all product cards and collection items
    document.querySelectorAll('.w-dyn-item, .collection-item, .product-card, [sf-product]').forEach(item => {
      const text = item.textContent?.toLowerCase() || '';
      const isBlogContent = blogKeywords.some(keyword => text.includes(keyword));

      // Check if this looks like a blog item (has blog-like text but no product image)
      const hasProductImage = item.querySelector('img[src*="cdn.prod.website-files"], img[src*="shopify"]');
      const hasNoImage = !item.querySelector('img') ||
                         item.querySelector('img')?.naturalHeight === 0 ||
                         !item.querySelector('img')?.src;

      if (isBlogContent && (hasNoImage || !hasProductImage)) {
        item.style.display = 'none';
        item.remove();
      }
    });

    // Also hide any standalone blog post elements in product grids
    document.querySelectorAll('.banner-blog-post_list-item, [href*="/blog/"]').forEach(el => {
      const parent = el.closest('.collection-list, .products-grid, .w-dyn-items');
      if (parent && !parent.classList.contains('banner-blog-post_list')) {
        el.style.display = 'none';
      }
    });
  }

  // Initialize
  async function init() {
    suppressShopyflowErrors();
    await loadData();

    // Remove blog content and fix images immediately
    removeBlogContent();
    fixProductImages();

    // Fix again after DOM updates (for dynamically loaded content)
    setTimeout(() => { removeBlogContent(); fixProductImages(); }, 1000);
    setTimeout(() => { removeBlogContent(); fixProductImages(); }, 3000);
    setTimeout(() => { removeBlogContent(); fixProductImages(); }, 5000);

    // Watch for new images being added
    const observer = new MutationObserver((mutations) => {
      let hasNewImages = false;
      for (const mutation of mutations) {
        if (mutation.addedNodes.length) {
          for (const node of mutation.addedNodes) {
            if (node.tagName === 'IMG' || node.querySelector?.('img')) {
              hasNewImages = true;
              break;
            }
          }
        }
      }
      if (hasNewImages) {
        setTimeout(fixProductImages, 100);
      }
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true
    });
  }

  // Run on DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
