/**
 * Radianz Quartz - Not Available Badge
 * Adds "Not Available" badge to all Radianz Quartz products
 * Works on all screens: mobile, tablet, desktop
 */

(function() {
  'use strict';

  // Add styles for the badge
  function addStyles() {
    if (document.getElementById('radianz-unavailable-styles')) return;

    const style = document.createElement('style');
    style.id = 'radianz-unavailable-styles';
    style.textContent = `
      /* Not Available Badge - Base */
      .sg-not-available-badge {
        position: absolute !important;
        top: 12px !important;
        left: 12px !important;
        background: linear-gradient(135deg, #dc2626 0%, #b91c1c 100%) !important;
        color: white !important;
        padding: 6px 12px !important;
        border-radius: 6px !important;
        font-size: 11px !important;
        font-weight: 700 !important;
        text-transform: uppercase !important;
        letter-spacing: 0.5px !important;
        z-index: 50 !important;
        box-shadow: 0 2px 8px rgba(220, 38, 38, 0.4) !important;
        pointer-events: none !important;
        white-space: nowrap !important;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif !important;
      }

      /* Larger badge variant */
      .sg-not-available-badge.large {
        padding: 8px 16px !important;
        font-size: 13px !important;
        border-radius: 8px !important;
      }

      /* Overlay effect on unavailable products */
      .sg-radianz-unavailable {
        position: relative !important;
      }

      .sg-radianz-unavailable::after {
        content: '' !important;
        position: absolute !important;
        top: 0 !important;
        left: 0 !important;
        right: 0 !important;
        bottom: 0 !important;
        background: rgba(0, 0, 0, 0.15) !important;
        pointer-events: none !important;
        z-index: 10 !important;
        border-radius: inherit !important;
      }

      /* Ensure image containers have relative positioning */
      .product-card .product-images,
      .materials_image-wrapper,
      .product-thumb_item .materials_image-wrapper,
      [class*="product"] [class*="image"],
      .w-dyn-item [class*="image-wrapper"] {
        position: relative !important;
      }

      /* Mobile adjustments */
      @media (max-width: 480px) {
        .sg-not-available-badge {
          top: 8px !important;
          left: 8px !important;
          padding: 4px 8px !important;
          font-size: 9px !important;
        }
      }

      /* Tablet adjustments */
      @media (min-width: 481px) and (max-width: 768px) {
        .sg-not-available-badge {
          top: 10px !important;
          left: 10px !important;
          padding: 5px 10px !important;
          font-size: 10px !important;
        }
      }

      /* Vendor page specific badge */
      .vendor-product-card .sg-not-available-badge {
        top: 15px !important;
        left: 15px !important;
      }

      /* Swipe card badge positioning */
      .swipe-card .sg-not-available-badge,
      .swipe-cards-container .sg-not-available-badge {
        top: 15px !important;
        left: 15px !important;
        font-size: 12px !important;
      }
    `;
    document.head.appendChild(style);
  }

  // Check if an element contains Radianz product
  function isRadianzProduct(element) {
    const text = element.textContent || element.innerText || '';
    const lowerText = text.toLowerCase();

    // Check for Radianz brand
    if (lowerText.includes('radianz')) {
      return true;
    }

    // Check data attributes
    const dataAttrs = ['data-brand', 'data-vendor', 'data-name', 'data-title'];
    for (const attr of dataAttrs) {
      const value = element.getAttribute(attr);
      if (value && value.toLowerCase().includes('radianz')) {
        return true;
      }
    }

    // Check href for radianz
    const link = element.querySelector('a[href*="radianz"]') ||
                 (element.tagName === 'A' && element.href && element.href.toLowerCase().includes('radianz'));
    if (link) {
      return true;
    }

    return false;
  }

  // Add badge to a product element
  function addBadge(element) {
    // Don't add if already has badge
    if (element.querySelector('.sg-not-available-badge')) return;
    if (element.dataset.radianzBadged === 'true') return;

    element.dataset.radianzBadged = 'true';

    // Find the image container to add the badge
    const imageContainer = element.querySelector('.product-images, .materials_image-wrapper, [class*="image-wrapper"], [class*="product-image"]');

    if (imageContainer) {
      // Add badge to image container
      const badge = document.createElement('div');
      badge.className = 'sg-not-available-badge';
      badge.textContent = 'Not Available';
      imageContainer.appendChild(badge);

      // Add overlay class
      imageContainer.classList.add('sg-radianz-unavailable');
    } else {
      // Fallback: add badge to the element itself
      element.style.position = 'relative';
      const badge = document.createElement('div');
      badge.className = 'sg-not-available-badge';
      badge.textContent = 'Not Available';
      element.appendChild(badge);
    }
  }

  // Process all product cards on the page
  function processProducts() {
    // Various selectors for product cards across the site
    const productSelectors = [
      '.product-card',
      '.product-thumb_item',
      '.materials_item-link',
      '.w-dyn-item',
      '[class*="product-card"]',
      '[class*="stone-card"]',
      '.swipe-card',
      '.shop-product',
      '.collection-item'
    ];

    productSelectors.forEach(selector => {
      const products = document.querySelectorAll(selector);
      products.forEach(product => {
        if (isRadianzProduct(product)) {
          addBadge(product);
        }
      });
    });

    // Also check for Radianz in headings and nearby cards on vendor pages
    const vendorHeaders = document.querySelectorAll('h1, h2, .vendor-info h1');
    vendorHeaders.forEach(header => {
      if (header.textContent.toLowerCase().includes('radianz')) {
        // This is the Radianz vendor page - badge all products
        const allProducts = document.querySelectorAll('.product-card, .products-grid > a, .products-grid > div');
        allProducts.forEach(product => addBadge(product));
      }
    });
  }

  // Handle dynamically loaded content
  function observeNewProducts() {
    const observer = new MutationObserver((mutations) => {
      let shouldProcess = false;
      mutations.forEach(mutation => {
        if (mutation.addedNodes.length > 0) {
          shouldProcess = true;
        }
      });
      if (shouldProcess) {
        setTimeout(processProducts, 100);
      }
    });

    // Observe the main content areas
    const contentAreas = document.querySelectorAll('main, .main, .products-grid, .materials_list, [class*="product-list"]');
    contentAreas.forEach(area => {
      observer.observe(area, { childList: true, subtree: true });
    });

    // Also observe body for dynamic page changes
    observer.observe(document.body, { childList: true, subtree: false });
  }

  // Initialize
  function init() {
    addStyles();
    processProducts();
    observeNewProducts();

    // Re-process on various events
    setTimeout(processProducts, 500);
    setTimeout(processProducts, 1000);
    setTimeout(processProducts, 2000);
    setTimeout(processProducts, 3000);

    // Re-process on scroll (for infinite scroll pages)
    let scrollTimeout;
    window.addEventListener('scroll', () => {
      clearTimeout(scrollTimeout);
      scrollTimeout = setTimeout(processProducts, 200);
    }, { passive: true });
  }

  // Run on DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // Also run on window load
  window.addEventListener('load', () => {
    setTimeout(processProducts, 500);
  });

})();
