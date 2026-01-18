/**
 * Room Designer Widget
 * Adds a floating CTA to promote the room designer tool across the site
 * Also auto-adds "Design Your Kitchen" button to countertop product pages
 */

(function() {
  'use strict';

  // Don't show on room designer page itself
  if (window.location.pathname.includes('/tools/room-designer')) return;

  // Configuration
  const config = {
    showFloatingWidget: true,
    showOnProductPages: true,
    widgetDelay: 3000, // Show widget after 3 seconds
    scrollThreshold: 300 // Show after scrolling 300px
  };

  // Create floating widget
  function createFloatingWidget() {
    const widget = document.createElement('div');
    widget.id = 'room-designer-widget';
    widget.innerHTML = `
      <style>
        #room-designer-widget {
          position: fixed;
          bottom: 100px;
          right: 20px;
          z-index: 9999;
          font-family: 'Inter', -apple-system, sans-serif;
        }
        #room-designer-widget .rdw-btn {
          display: flex;
          align-items: center;
          gap: 10px;
          background: linear-gradient(135deg, #6366f1 0%, #4f46e5 100%);
          color: white;
          padding: 14px 20px;
          border-radius: 50px;
          text-decoration: none;
          font-weight: 600;
          font-size: 14px;
          box-shadow: 0 4px 20px rgba(99, 102, 241, 0.4);
          transition: all 0.3s ease;
          border: none;
          cursor: pointer;
        }
        #room-designer-widget .rdw-btn:hover {
          transform: translateY(-3px);
          box-shadow: 0 8px 30px rgba(99, 102, 241, 0.5);
        }
        #room-designer-widget .rdw-btn svg {
          flex-shrink: 0;
        }
        #room-designer-widget .rdw-close {
          position: absolute;
          top: -8px;
          right: -8px;
          width: 24px;
          height: 24px;
          background: #1a1a2e;
          color: white;
          border: none;
          border-radius: 50%;
          font-size: 14px;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        #room-designer-widget.hidden {
          display: none;
        }
        @media (max-width: 768px) {
          #room-designer-widget {
            bottom: 80px;
            right: 10px;
          }
          #room-designer-widget .rdw-btn {
            padding: 12px 16px;
            font-size: 13px;
          }
          #room-designer-widget .rdw-text {
            display: none;
          }
        }
      </style>
      <a href="/tools/room-designer/" class="rdw-btn">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <rect x="3" y="3" width="18" height="18" rx="2"/>
          <path d="M3 9h18M9 21V9"/>
        </svg>
        <span class="rdw-text">Design Your Kitchen</span>
      </a>
      <button class="rdw-close" onclick="document.getElementById('room-designer-widget').classList.add('hidden'); localStorage.setItem('rdw-dismissed', Date.now());">×</button>
    `;

    // Check if dismissed recently (within 24 hours)
    const dismissed = localStorage.getItem('rdw-dismissed');
    if (dismissed && Date.now() - parseInt(dismissed) < 24 * 60 * 60 * 1000) {
      return; // Don't show if dismissed within 24 hours
    }

    // Add to page after delay and scroll threshold
    let shown = false;
    function showWidget() {
      if (shown) return;
      if (window.scrollY > config.scrollThreshold) {
        shown = true;
        document.body.appendChild(widget);
      }
    }

    setTimeout(() => {
      window.addEventListener('scroll', showWidget, { passive: true });
      showWidget(); // Check immediately
    }, config.widgetDelay);
  }

  // Add design button to product pages
  function enhanceProductPages() {
    // Only on countertop pages
    if (!window.location.pathname.includes('/countertops/')) return;

    // Get stone slug from URL
    const pathParts = window.location.pathname.split('/').filter(p => p);
    const stoneSlug = pathParts[pathParts.length - 1] || pathParts[pathParts.length - 2];

    if (!stoneSlug) return;

    // Find CTA buttons container
    const ctaContainer = document.querySelector('.cta-buttons');
    if (!ctaContainer) return;

    // Check if design button already exists
    if (ctaContainer.querySelector('.btn-design, [href*="room-designer"]')) return;

    // Create design button
    const designBtn = document.createElement('a');
    designBtn.href = `/tools/room-designer/?material=${stoneSlug}`;
    designBtn.className = 'btn-design';
    designBtn.innerHTML = `
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <rect x="3" y="3" width="18" height="18" rx="2"/>
        <path d="M3 9h18M9 21V9"/>
      </svg>
      Design Your Kitchen
    `;

    // Add styles if not present
    if (!document.querySelector('#design-btn-styles')) {
      const style = document.createElement('style');
      style.id = 'design-btn-styles';
      style.textContent = `
        .btn-design {
          background: linear-gradient(135deg, #6366f1 0%, #4f46e5 100%);
          color: white !important;
          padding: 16px 32px;
          border-radius: 12px;
          text-decoration: none;
          font-weight: 700;
          display: inline-flex;
          align-items: center;
          gap: 8px;
          transition: all 0.2s;
        }
        .btn-design:hover {
          transform: translateY(-2px);
          box-shadow: 0 4px 12px rgba(99, 102, 241, 0.4);
        }
      `;
      document.head.appendChild(style);
    }

    // Insert after first button (Get Free Estimate)
    const firstBtn = ctaContainer.querySelector('a');
    if (firstBtn) {
      firstBtn.insertAdjacentElement('afterend', designBtn);
    } else {
      ctaContainer.appendChild(designBtn);
    }
  }

  // Initialize
  document.addEventListener('DOMContentLoaded', function() {
    if (config.showFloatingWidget) createFloatingWidget();
    if (config.showOnProductPages) enhanceProductPages();
  });

  // For pages that load dynamically
  if (document.readyState === 'complete' || document.readyState === 'interactive') {
    if (config.showOnProductPages) enhanceProductPages();
  }
})();
