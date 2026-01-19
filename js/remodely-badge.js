/**
 * Remodely.ai "Powered By" Badge - Animated Version
 *
 * Features:
 * - Slides in from bottom right
 * - Shows full "Powered by Remodely.ai" text
 * - After delay, collapses to just the house logo
 * - Expands on hover to show full text
 * - Google-colored house icon
 */

(function() {
  'use strict';

  // Configuration
  const CONFIG = {
    position: 'bottom-right',
    theme: 'dark',
    slideInDelay: 500,      // ms before badge slides in
    collapseDelay: 4000,    // ms before collapsing to icon only
    utmSource: window.location.hostname,
    utmMedium: 'powered-by-badge',
    utmCampaign: 'remodely-tools'
  };

  // House SVG with Google colors
  const HOUSE_SVG = `
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="remodelyHouseGrad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="#4285F4"/>
          <stop offset="33%" stop-color="#EA4335"/>
          <stop offset="66%" stop-color="#FBBC05"/>
          <stop offset="100%" stop-color="#34A853"/>
        </linearGradient>
      </defs>
      <path d="M3 21V10l9-7 9 7v11" stroke="url(#remodelyHouseGrad)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
      <path d="M21 21h-7" stroke="#34A853" stroke-width="2.5" stroke-linecap="round"/>
    </svg>
  `;

  // Styles
  const styles = `
    .remodely-powered-badge {
      position: fixed;
      bottom: 1rem;
      right: 1rem;
      display: flex;
      align-items: center;
      gap: 0.5rem;
      padding: 0.5rem;
      background: rgba(30, 41, 59, 0.95);
      backdrop-filter: blur(12px);
      -webkit-backdrop-filter: blur(12px);
      border: 1px solid rgba(255, 255, 255, 0.1);
      border-radius: 50px;
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      font-size: 0.8rem;
      color: #9ca3af;
      text-decoration: none;
      z-index: 99999;
      opacity: 0;
      transform: translateY(20px) scale(0.9);
      transition: all 0.4s cubic-bezier(0.34, 1.56, 0.64, 1);
      cursor: pointer;
      box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
    }

    .remodely-powered-badge.visible {
      opacity: 1;
      transform: translateY(0) scale(1);
    }

    .remodely-powered-badge:hover {
      background: rgba(30, 41, 59, 1);
      border-color: rgba(99, 102, 241, 0.5);
      transform: translateY(-2px) scale(1.02);
      box-shadow: 0 8px 30px rgba(99, 102, 241, 0.25);
    }

    .remodely-powered-badge.collapsed {
      padding: 0.5rem;
      gap: 0;
    }

    .remodely-powered-badge.collapsed:hover {
      padding: 0.5rem 1rem 0.5rem 0.5rem;
      gap: 0.5rem;
    }

    .remodely-powered-badge__icon {
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
      width: 24px;
      height: 24px;
    }

    .remodely-powered-badge__icon svg {
      width: 20px;
      height: 20px;
      transition: transform 0.3s ease;
    }

    .remodely-powered-badge:hover .remodely-powered-badge__icon svg {
      transform: scale(1.1);
    }

    .remodely-powered-badge__text {
      display: flex;
      align-items: center;
      gap: 0.35rem;
      white-space: nowrap;
      overflow: hidden;
      max-width: 150px;
      transition: max-width 0.4s cubic-bezier(0.34, 1.56, 0.64, 1),
                  opacity 0.3s ease,
                  margin 0.4s ease;
    }

    .remodely-powered-badge.collapsed .remodely-powered-badge__text {
      max-width: 0;
      opacity: 0;
      margin-left: -0.5rem;
    }

    .remodely-powered-badge.collapsed:hover .remodely-powered-badge__text {
      max-width: 150px;
      opacity: 1;
      margin-left: 0;
    }

    .remodely-powered-badge__brand {
      font-weight: 700;
      color: #fff;
    }

    /* Bottom left variant */
    .remodely-powered-badge.bottom-left {
      right: auto;
      left: 1rem;
    }

    /* Light theme */
    .remodely-powered-badge.light {
      background: rgba(255, 255, 255, 0.95);
      border-color: rgba(0, 0, 0, 0.1);
      color: #6b7280;
      box-shadow: 0 4px 20px rgba(0, 0, 0, 0.1);
    }

    .remodely-powered-badge.light:hover {
      background: rgba(255, 255, 255, 1);
      border-color: rgba(99, 102, 241, 0.3);
    }

    .remodely-powered-badge.light .remodely-powered-badge__brand {
      background: linear-gradient(135deg, #4285F4, #34A853);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      background-clip: text;
    }

    /* Mobile adjustments */
    @media (max-width: 480px) {
      .remodely-powered-badge {
        bottom: 0.75rem;
        right: 0.75rem;
        padding: 0.4rem;
        font-size: 0.75rem;
      }

      .remodely-powered-badge__icon {
        width: 20px;
        height: 20px;
      }

      .remodely-powered-badge__icon svg {
        width: 16px;
        height: 16px;
      }
    }

    /* Avoid overlap with other fixed elements */
    .remodely-powered-badge.offset-chat {
      bottom: 5rem;
    }
  `;

  // Check if badge already exists
  if (document.querySelector('.remodely-powered-badge')) {
    return;
  }

  // Create and inject styles
  function injectStyles() {
    if (document.getElementById('remodely-badge-styles')) return;
    const styleSheet = document.createElement('style');
    styleSheet.id = 'remodely-badge-styles';
    styleSheet.textContent = styles;
    document.head.appendChild(styleSheet);
  }

  // Build URL with UTM parameters
  function buildUrl() {
    const params = new URLSearchParams({
      utm_source: CONFIG.utmSource,
      utm_medium: CONFIG.utmMedium,
      utm_campaign: CONFIG.utmCampaign
    });
    return `https://remodely.ai?${params.toString()}`;
  }

  // Create badge element
  function createBadge() {
    const badge = document.createElement('a');
    badge.className = `remodely-powered-badge ${CONFIG.theme} ${CONFIG.position}`;
    badge.href = buildUrl();
    badge.target = '_blank';
    badge.rel = 'noopener noreferrer';
    badge.setAttribute('aria-label', 'Powered by Remodely.ai - AI-powered design tools');
    badge.setAttribute('title', 'Powered by Remodely.ai');

    badge.innerHTML = `
      <div class="remodely-powered-badge__icon">
        ${HOUSE_SVG}
      </div>
      <div class="remodely-powered-badge__text">
        <span>Powered by</span>
        <span class="remodely-powered-badge__brand">Remodely.ai</span>
      </div>
    `;

    return badge;
  }

  // Initialize badge
  function init() {
    // Don't show on remodely.ai itself
    if (window.location.hostname === 'remodely.ai' ||
        window.location.hostname === 'www.remodely.ai') {
      return;
    }

    injectStyles();

    const badge = createBadge();
    document.body.appendChild(badge);

    // Slide in
    setTimeout(() => {
      badge.classList.add('visible');
    }, CONFIG.slideInDelay);

    // Collapse to icon only after delay
    setTimeout(() => {
      badge.classList.add('collapsed');
    }, CONFIG.slideInDelay + CONFIG.collapseDelay);

    // Check for chat widget and offset if needed
    setTimeout(() => {
      const chatWidget = document.querySelector('.aria-widget, .chat-widget, [class*="chat-bubble"]');
      if (chatWidget) {
        badge.classList.add('offset-chat');
      }
    }, 1000);
  }

  // Run when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // Expose API for customization
  window.RemodelyBadge = {
    configure: function(options) {
      Object.assign(CONFIG, options);
    },
    show: function() {
      const badge = document.querySelector('.remodely-powered-badge');
      if (badge) {
        badge.classList.add('visible');
        badge.classList.remove('collapsed');
      }
    },
    collapse: function() {
      const badge = document.querySelector('.remodely-powered-badge');
      if (badge) badge.classList.add('collapsed');
    },
    expand: function() {
      const badge = document.querySelector('.remodely-powered-badge');
      if (badge) badge.classList.remove('collapsed');
    },
    hide: function() {
      const badge = document.querySelector('.remodely-powered-badge');
      if (badge) badge.classList.remove('visible');
    },
    remove: function() {
      const badge = document.querySelector('.remodely-powered-badge');
      if (badge) badge.remove();
    },
    setPosition: function(position) {
      const badge = document.querySelector('.remodely-powered-badge');
      if (badge) {
        badge.classList.remove('bottom-right', 'bottom-left');
        badge.classList.add(position);
      }
    },
    setTheme: function(theme) {
      const badge = document.querySelector('.remodely-powered-badge');
      if (badge) {
        badge.classList.remove('dark', 'light');
        badge.classList.add(theme);
      }
    }
  };
})();
