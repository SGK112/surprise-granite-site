/**
 * Shop Page Optimizations
 * Performance and UX enhancements for mobile and desktop
 */

(function() {
  'use strict';

  // Configuration
  const CONFIG = {
    lazyLoadThreshold: '200px',
    debounceDelay: 150,
    animationDuration: 300
  };

  // Utility: Debounce function
  function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
      const later = () => {
        clearTimeout(timeout);
        func(...args);
      };
      clearTimeout(timeout);
      timeout = setTimeout(later, wait);
    };
  }

  // Utility: Check if device is touch-enabled
  function isTouchDevice() {
    return 'ontouchstart' in window || navigator.maxTouchPoints > 0;
  }

  // Utility: Check if reduced motion is preferred
  function prefersReducedMotion() {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  /**
   * Lazy Loading for Product Images
   */
  function initLazyLoading() {
    if ('IntersectionObserver' in window) {
      const imageObserver = new IntersectionObserver(
        (entries, observer) => {
          entries.forEach(entry => {
            if (entry.isIntersecting) {
              const img = entry.target;

              // Handle data-src attribute
              if (img.dataset.src) {
                img.src = img.dataset.src;
                img.removeAttribute('data-src');
              }

              // Handle srcset
              if (img.dataset.srcset) {
                img.srcset = img.dataset.srcset;
                img.removeAttribute('data-srcset');
              }

              // Remove loading class
              img.classList.remove('loading');
              img.parentElement?.classList.remove('loading');

              observer.unobserve(img);
            }
          });
        },
        {
          rootMargin: CONFIG.lazyLoadThreshold,
          threshold: 0.01
        }
      );

      // Observe all product images
      document.querySelectorAll('.product-card_image, .swiper_card-image, .product1_image').forEach(img => {
        if (img.dataset.src || img.dataset.srcset) {
          img.classList.add('loading');
          imageObserver.observe(img);
        }
      });
    }
  }

  /**
   * Swiper Touch Enhancements
   */
  function enhanceSwipers() {
    const swiperContainers = document.querySelectorAll('.swiper_product, .swiper_bis, .swiper_faucets, .swiper_silestone');

    swiperContainers.forEach(container => {
      // Add visibility class when in viewport
      const observer = new IntersectionObserver(
        (entries) => {
          entries.forEach(entry => {
            if (entry.isIntersecting) {
              entry.target.classList.add('is-visible');
            }
          });
        },
        { threshold: 0.1 }
      );

      observer.observe(container);

      // Improve touch scrolling on mobile
      if (isTouchDevice()) {
        const wrapper = container.querySelector('.swiper-wrapper');
        if (wrapper) {
          wrapper.style.scrollSnapType = 'x mandatory';
          wrapper.style.webkitOverflowScrolling = 'touch';
        }
      }
    });
  }

  /**
   * Product Card Hover Preloading
   */
  function initHoverPreload() {
    if (isTouchDevice()) return; // Skip on touch devices

    const productCards = document.querySelectorAll('.product-card_link-wrapper');

    productCards.forEach(card => {
      card.addEventListener('mouseenter', () => {
        const link = card.getAttribute('href');
        if (link && !document.querySelector(`link[href="${link}"]`)) {
          // Prefetch the product page
          const prefetchLink = document.createElement('link');
          prefetchLink.rel = 'prefetch';
          prefetchLink.href = link;
          document.head.appendChild(prefetchLink);
        }
      }, { once: true, passive: true });
    });
  }

  /**
   * Mobile-Specific Touch Feedback
   */
  function initTouchFeedback() {
    if (!isTouchDevice()) return;

    const touchTargets = document.querySelectorAll(
      '.product-card_link-wrapper, .swiper_card-link, .quick-add_container .button, .product-card_cta .button'
    );

    touchTargets.forEach(target => {
      target.addEventListener('touchstart', function() {
        this.style.transform = 'scale(0.98)';
      }, { passive: true });

      target.addEventListener('touchend', function() {
        this.style.transform = '';
      }, { passive: true });

      target.addEventListener('touchcancel', function() {
        this.style.transform = '';
      }, { passive: true });
    });
  }

  /**
   * Scroll Position Memory
   */
  function initScrollMemory() {
    const SCROLL_KEY = 'shop_scroll_position';

    // Restore scroll position
    window.addEventListener('pageshow', () => {
      const savedPosition = sessionStorage.getItem(SCROLL_KEY);
      if (savedPosition) {
        setTimeout(() => {
          window.scrollTo(0, parseInt(savedPosition, 10));
          sessionStorage.removeItem(SCROLL_KEY);
        }, 100);
      }
    });

    // Save scroll position before leaving
    document.querySelectorAll('.product-card_link-wrapper').forEach(card => {
      card.addEventListener('click', () => {
        sessionStorage.setItem(SCROLL_KEY, window.scrollY.toString());
      });
    });
  }

  /**
   * Performance: Reduce animations on low-end devices
   */
  function optimizeForLowEndDevices() {
    // Check for low memory or slow connection
    const isLowEnd =
      (navigator.deviceMemory && navigator.deviceMemory < 4) ||
      (navigator.connection && navigator.connection.effectiveType === 'slow-2g');

    if (isLowEnd || prefersReducedMotion()) {
      document.documentElement.classList.add('reduce-animations');

      // Disable expensive animations
      const style = document.createElement('style');
      style.textContent = `
        .reduce-animations * {
          animation-duration: 0.01ms !important;
          transition-duration: 0.01ms !important;
        }
      `;
      document.head.appendChild(style);
    }
  }

  /**
   * Viewport Height Fix for iOS
   */
  function fixIOSViewportHeight() {
    function setVH() {
      const vh = window.innerHeight * 0.01;
      document.documentElement.style.setProperty('--vh', `${vh}px`);
    }

    setVH();
    window.addEventListener('resize', debounce(setVH, CONFIG.debounceDelay));
    window.addEventListener('orientationchange', () => {
      setTimeout(setVH, 100);
    });
  }

  /**
   * Filter/Sort Sticky Behavior
   */
  function initStickyFilters() {
    const filterBar = document.querySelector('.shop-filters, .filter-wrapper, [fs-cmsfilter-element="filters"]');
    if (!filterBar) return;

    const navbar = document.querySelector('.navbar-fixed_wrapper, nav');
    const navbarHeight = navbar ? navbar.offsetHeight : 0;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) {
          filterBar.classList.add('is-sticky');
          filterBar.style.top = `${navbarHeight}px`;
        } else {
          filterBar.classList.remove('is-sticky');
          filterBar.style.top = '';
        }
      },
      {
        rootMargin: `-${navbarHeight + 1}px 0px 0px 0px`,
        threshold: 0
      }
    );

    // Create sentinel element
    const sentinel = document.createElement('div');
    sentinel.style.height = '1px';
    sentinel.style.width = '100%';
    filterBar.parentNode?.insertBefore(sentinel, filterBar);
    observer.observe(sentinel);
  }

  /**
   * Quick Add to Cart Animation
   */
  function initQuickAddAnimation() {
    document.querySelectorAll('[sf-add-to-cart], .quick-add_container .button').forEach(button => {
      button.addEventListener('click', function(e) {
        const rect = this.getBoundingClientRect();
        const cartIcon = document.querySelector('.sg-cart-icon, [sf-cart-icon]');

        if (!cartIcon || prefersReducedMotion()) return;

        // Create flying product animation
        const flyingEl = document.createElement('div');
        flyingEl.style.cssText = `
          position: fixed;
          left: ${rect.left}px;
          top: ${rect.top}px;
          width: 20px;
          height: 20px;
          background: #FFD700;
          border-radius: 50%;
          z-index: 9999;
          pointer-events: none;
          transition: all 0.6s cubic-bezier(0.25, 0.46, 0.45, 0.94);
        `;
        document.body.appendChild(flyingEl);

        const cartRect = cartIcon.getBoundingClientRect();

        requestAnimationFrame(() => {
          flyingEl.style.left = `${cartRect.left + cartRect.width / 2}px`;
          flyingEl.style.top = `${cartRect.top + cartRect.height / 2}px`;
          flyingEl.style.opacity = '0';
          flyingEl.style.transform = 'scale(0.3)';
        });

        setTimeout(() => flyingEl.remove(), 700);
      });
    });
  }

  /**
   * Keyboard Navigation Enhancement
   */
  function initKeyboardNav() {
    const productGrid = document.querySelector('.w-dyn-items, .product-grid');
    if (!productGrid) return;

    const cards = productGrid.querySelectorAll('.product-card_link-wrapper');
    let currentIndex = -1;

    document.addEventListener('keydown', (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

      const columns = window.innerWidth >= 1440 ? 5 :
                      window.innerWidth >= 1024 ? 4 :
                      window.innerWidth >= 768 ? 3 : 2;

      switch(e.key) {
        case 'ArrowRight':
          currentIndex = Math.min(currentIndex + 1, cards.length - 1);
          cards[currentIndex]?.focus();
          e.preventDefault();
          break;
        case 'ArrowLeft':
          currentIndex = Math.max(currentIndex - 1, 0);
          cards[currentIndex]?.focus();
          e.preventDefault();
          break;
        case 'ArrowDown':
          currentIndex = Math.min(currentIndex + columns, cards.length - 1);
          cards[currentIndex]?.focus();
          e.preventDefault();
          break;
        case 'ArrowUp':
          currentIndex = Math.max(currentIndex - columns, 0);
          cards[currentIndex]?.focus();
          e.preventDefault();
          break;
      }
    });

    // Track focus
    cards.forEach((card, index) => {
      card.addEventListener('focus', () => {
        currentIndex = index;
      });
    });
  }

  /**
   * Initialize all optimizations
   */
  function init() {
    // Wait for DOM to be ready
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', runInit);
    } else {
      runInit();
    }
  }

  function runInit() {
    // Core optimizations
    fixIOSViewportHeight();
    optimizeForLowEndDevices();

    // Feature initializations
    initLazyLoading();
    enhanceSwipers();
    initScrollMemory();

    // Interaction enhancements
    if (isTouchDevice()) {
      initTouchFeedback();
    } else {
      initHoverPreload();
      initKeyboardNav();
    }

    // UI enhancements
    initStickyFilters();
    initQuickAddAnimation();

    // Log initialization
    console.log('[Shop Optimizations] Initialized for', isTouchDevice() ? 'touch' : 'desktop', 'device');
  }

  // Run initialization
  init();

})();
