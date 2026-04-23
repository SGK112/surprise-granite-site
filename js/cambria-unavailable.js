/**
 * Cambria - Not Available + Site-Wide Warning
 * - Injects a red site-wide banner: "DO NOT ORDER CAMBRIA — Contact us for alternatives"
 * - Adds "Not Available" badges to all Cambria product cards
 * - Hides pricing and disables order/quote buttons on Cambria products
 * - Works on all screens: mobile, tablet, desktop
 *
 * To remove: delete the <script src="/js/cambria-unavailable.js"></script> tag from pages.
 */

(function() {
  'use strict';

  const BRAND = 'cambria';
  const BANNER_ID = 'sg-cambria-warning-banner';
  const BANNER_TEXT = 'DO NOT ORDER CAMBRIA — Contact us for alternatives';

  function addStyles() {
    if (document.getElementById('cambria-unavailable-styles')) return;

    const style = document.createElement('style');
    style.id = 'cambria-unavailable-styles';
    style.textContent = `
      /* Site-wide warning banner — fixed at top, above all nav */
      #${BANNER_ID} {
        position: fixed !important;
        top: 0 !important;
        left: 0 !important;
        right: 0 !important;
        width: 100% !important;
        background: linear-gradient(90deg, #dc2626 0%, #b91c1c 100%) !important;
        color: #fff !important;
        text-align: center !important;
        padding: 10px 16px !important;
        font-size: 14px !important;
        font-weight: 700 !important;
        letter-spacing: 0.3px !important;
        text-transform: uppercase !important;
        z-index: 2147483647 !important; /* max — above any nav */
        box-shadow: 0 2px 10px rgba(220, 38, 38, 0.4) !important;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif !important;
        line-height: 1.4 !important;
        box-sizing: border-box !important;
      }
      #${BANNER_ID} a {
        color: #fff !important;
        text-decoration: underline !important;
        margin-left: 8px !important;
        white-space: nowrap !important;
      }
      /* Reserve space so banner doesn't cover the nav */
      html.sg-cambria-banner-active {
        scroll-padding-top: 44px !important;
      }
      html.sg-cambria-banner-active body {
        padding-top: 44px !important;
      }
      @media (max-width: 640px) {
        #${BANNER_ID} {
          font-size: 11px !important;
          padding: 8px 10px !important;
          letter-spacing: 0.2px !important;
        }
        html.sg-cambria-banner-active body {
          padding-top: 38px !important;
        }
      }

      /* Not Available badge */
      .sg-cambria-not-available-badge {
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

      .sg-cambria-unavailable {
        position: relative !important;
      }
      .sg-cambria-unavailable::after {
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

      .product-card .product-images,
      .materials_image-wrapper,
      .product-thumb_item .materials_image-wrapper,
      [class*="product"] [class*="image"],
      .w-dyn-item [class*="image-wrapper"] {
        position: relative !important;
      }

      @media (max-width: 480px) {
        .sg-cambria-not-available-badge {
          top: 8px !important;
          left: 8px !important;
          padding: 4px 8px !important;
          font-size: 9px !important;
        }
      }
      @media (min-width: 481px) and (max-width: 768px) {
        .sg-cambria-not-available-badge {
          top: 10px !important;
          left: 10px !important;
          padding: 5px 10px !important;
          font-size: 10px !important;
        }
      }

      .vendor-product-card .sg-cambria-not-available-badge,
      .swipe-card .sg-cambria-not-available-badge,
      .swipe-cards-container .sg-cambria-not-available-badge {
        top: 15px !important;
        left: 15px !important;
      }

      /* Hide prices inside a Cambria card */
      [data-cambria-card="true"] [class*="price"],
      [data-cambria-card="true"] [class*="Price"],
      [data-cambria-card="true"] .sg-price-preview,
      [data-cambria-card="true"] .product-price-display,
      [data-cambria-card="true"] .product-price-amount,
      [data-cambria-card="true"] .price,
      [data-cambria-card="true"] .price-range,
      [data-cambria-card="true"] .sg-card-price,
      [data-cambria-card="true"] [data-price] {
        display: none !important;
        visibility: hidden !important;
      }

      /* Disable order buttons inside a Cambria card */
      [data-cambria-card="true"] [class*="add-to-cart"],
      [data-cambria-card="true"] [class*="add-to-quote"],
      [data-cambria-card="true"] [class*="buy-now"],
      [data-cambria-card="true"] button[onclick*="addToCart"],
      [data-cambria-card="true"] button[onclick*="addToQuote"] {
        display: none !important;
      }
    `;
    document.head.appendChild(style);
  }

  function addBanner() {
    if (document.getElementById(BANNER_ID)) return;
    const banner = document.createElement('div');
    banner.id = BANNER_ID;
    banner.setAttribute('role', 'alert');
    banner.innerHTML = `⚠️ ${BANNER_TEXT} <a href="/contact-us">Contact Us</a>`;
    document.body.appendChild(banner);
    document.documentElement.classList.add('sg-cambria-banner-active');
  }

  function isCambriaProduct(element) {
    const text = (element.textContent || element.innerText || '').toLowerCase();
    if (text.includes(BRAND)) return true;

    const dataAttrs = ['data-brand', 'data-vendor', 'data-name', 'data-title'];
    for (const attr of dataAttrs) {
      const value = element.getAttribute(attr);
      if (value && value.toLowerCase().includes(BRAND)) return true;
    }

    const link = element.querySelector(`a[href*="${BRAND}"]`) ||
                 (element.tagName === 'A' && element.href && element.href.toLowerCase().includes(BRAND));
    if (link) return true;

    return false;
  }

  function addBadge(element) {
    if (element.querySelector('.sg-cambria-not-available-badge')) return;
    if (element.dataset.cambriaBadged === 'true') return;

    element.dataset.cambriaBadged = 'true';
    element.dataset.cambriaCard = 'true';

    const imageContainer = element.querySelector('.product-images, .materials_image-wrapper, [class*="image-wrapper"], [class*="product-image"]');

    if (imageContainer) {
      const badge = document.createElement('div');
      badge.className = 'sg-cambria-not-available-badge';
      badge.textContent = 'Not Available';
      imageContainer.appendChild(badge);
      imageContainer.classList.add('sg-cambria-unavailable');
    } else {
      element.style.position = 'relative';
      const badge = document.createElement('div');
      badge.className = 'sg-cambria-not-available-badge';
      badge.textContent = 'Not Available';
      element.appendChild(badge);
    }
  }

  function isVendorDetailPage() {
    const path = (window.location.pathname || '').toLowerCase();
    if (path.includes('/vendors/cambria') || path.includes('/stone-yards/cambria')) return true;

    const headers = document.querySelectorAll('h1, h2, .vendor-info h1, #brand-name');
    for (const header of headers) {
      const t = (header.textContent || '').toLowerCase();
      if (t.includes(BRAND)) return true;
    }
    return false;
  }

  function processProducts() {
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
      document.querySelectorAll(selector).forEach(product => {
        if (isCambriaProduct(product)) addBadge(product);
      });
    });

    // Vendor/detail page: badge every product card in grid
    if (isVendorDetailPage()) {
      const allProducts = document.querySelectorAll(
        '.product-card, .products-grid > a, .products-grid > div, .materials_item-link, .w-dyn-item'
      );
      allProducts.forEach(product => addBadge(product));

      // Mark whole page body so price-hiding CSS applies to dynamic price blocks
      document.body.setAttribute('data-cambria-card', 'true');
    }
  }

  function observeNewProducts() {
    const observer = new MutationObserver((mutations) => {
      let shouldProcess = false;
      mutations.forEach(mutation => {
        if (mutation.addedNodes.length > 0) shouldProcess = true;
      });
      if (shouldProcess) setTimeout(processProducts, 100);
    });

    const contentAreas = document.querySelectorAll('main, .main, .products-grid, .materials_list, [class*="product-list"]');
    contentAreas.forEach(area => observer.observe(area, { childList: true, subtree: true }));
    observer.observe(document.body, { childList: true, subtree: false });
  }

  function init() {
    addStyles();
    addBanner();
    processProducts();
    observeNewProducts();

    setTimeout(processProducts, 500);
    setTimeout(processProducts, 1000);
    setTimeout(processProducts, 2000);
    setTimeout(processProducts, 3000);

    let scrollTimeout;
    window.addEventListener('scroll', () => {
      clearTimeout(scrollTimeout);
      scrollTimeout = setTimeout(processProducts, 200);
    }, { passive: true });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  window.addEventListener('load', () => {
    setTimeout(processProducts, 500);
  });

})();
