/**
 * Surprise Granite - Analytics Initialization
 * Properly initializes Google Analytics 4 (GA4) and integrates with GTM
 *
 * GA4 Property: G-9HJRRMG310
 * GTM Container: GTM-P3XFDN8
 */

(function() {
  'use strict';

  // Use config if available, otherwise use defaults
  const config = window.SG_CONFIG || {};
  const GA4_ID = config.GOOGLE_ANALYTICS_ID || 'G-9HJRRMG310';
  const DEBUG = config.DEBUG || false;

  // Check if analytics is enabled
  if (config.FEATURES && config.FEATURES.ENABLE_ANALYTICS === false) {
    if (DEBUG) console.log('[Analytics] Disabled by config');
    return;
  }

  // Prevent double initialization
  if (window._sgAnalyticsInitialized) {
    if (DEBUG) console.log('[Analytics] Already initialized');
    return;
  }
  window._sgAnalyticsInitialized = true;

  // Initialize dataLayer for GTM
  window.dataLayer = window.dataLayer || [];

  // Define gtag function
  function gtag() {
    window.dataLayer.push(arguments);
  }
  window.gtag = gtag;

  // Initialize GA4
  gtag('js', new Date());
  gtag('config', GA4_ID, {
    'send_page_view': true,
    'cookie_flags': 'SameSite=None;Secure',
    'anonymize_ip': true,
    // Enhanced measurement is enabled in GA4 by default
    // Custom dimensions can be added here
    'custom_map': {
      'dimension1': 'user_type',
      'dimension2': 'page_category'
    }
  });

  // Load gtag.js script if not already present
  if (!document.querySelector('script[src*="googletagmanager.com/gtag/js"]')) {
    const script = document.createElement('script');
    script.async = true;
    script.src = `https://www.googletagmanager.com/gtag/js?id=${GA4_ID}`;
    document.head.appendChild(script);

    if (DEBUG) console.log('[Analytics] GA4 script loaded:', GA4_ID);
  }

  // Track page category based on URL
  function getPageCategory() {
    const path = window.location.pathname;
    if (path.includes('/marketplace/')) return 'marketplace';
    if (path.includes('/blog/')) return 'blog';
    if (path.includes('/services/')) return 'services';
    if (path.includes('/tools/')) return 'tools';
    if (path.includes('/contact') || path.includes('/estimate')) return 'lead_capture';
    if (path.includes('/account/')) return 'account';
    if (path.includes('/materials/')) return 'materials';
    if (path === '/') return 'homepage';
    return 'other';
  }

  // Set page category
  gtag('set', 'page_category', getPageCategory());

  // Track user type when auth state changes
  window.addEventListener('userLoggedIn', function(e) {
    gtag('set', 'user_properties', {
      'user_type': 'logged_in'
    });
    gtag('event', 'login', {
      'method': 'email'
    });
  });

  window.addEventListener('userLoggedOut', function() {
    gtag('set', 'user_properties', {
      'user_type': 'guest'
    });
  });

  // Custom event tracking helper
  window.sgTrackEvent = function(eventName, params) {
    params = params || {};
    params.page_location = window.location.href;
    params.page_title = document.title;

    gtag('event', eventName, params);

    if (DEBUG) console.log('[Analytics] Event:', eventName, params);
  };

  // Track key conversions
  function setupConversionTracking() {
    // Track estimate form submissions
    document.addEventListener('submit', function(e) {
      const form = e.target;
      if (form.id && (form.id.includes('estimate') || form.id.includes('quote') || form.id.includes('lead'))) {
        sgTrackEvent('generate_lead', {
          'form_name': form.id,
          'form_destination': form.action
        });
      }
    });

    // Track phone clicks
    document.addEventListener('click', function(e) {
      const link = e.target.closest('a[href^="tel:"]');
      if (link) {
        sgTrackEvent('click_phone', {
          'phone_number': link.href.replace('tel:', '')
        });
      }
    });

    // Track CTA button clicks
    document.addEventListener('click', function(e) {
      const btn = e.target.closest('.cta-btn, .quote-submit-btn, .btn-primary, [data-track-cta]');
      if (btn) {
        sgTrackEvent('cta_click', {
          'button_text': btn.textContent.trim().substring(0, 50),
          'button_url': btn.href || window.location.href
        });
      }
    });

    // Track marketplace product views
    if (window.location.pathname.includes('/marketplace/')) {
      sgTrackEvent('view_item_list', {
        'item_list_name': getPageCategory(),
        'item_list_id': window.location.pathname
      });
    }

    // Track outbound links
    document.addEventListener('click', function(e) {
      const link = e.target.closest('a[href^="http"]');
      if (link && !link.href.includes(window.location.hostname)) {
        sgTrackEvent('click_outbound', {
          'link_url': link.href,
          'link_text': link.textContent.trim().substring(0, 50)
        });
      }
    });
  }

  // Initialize when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', setupConversionTracking);
  } else {
    setupConversionTracking();
  }

  // Expose for debugging
  window.SG_Analytics = {
    trackEvent: window.sgTrackEvent,
    getPageCategory: getPageCategory,
    GA4_ID: GA4_ID,
    isInitialized: function() { return window._sgAnalyticsInitialized; }
  };

  if (DEBUG) {
    console.log('[Analytics] Initialized successfully');
    console.log('[Analytics] GA4 ID:', GA4_ID);
    console.log('[Analytics] Page Category:', getPageCategory());
  }

})();
