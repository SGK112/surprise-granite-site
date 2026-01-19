/**
 * Remodely Tools Hub
 * Unified floating widget for all Remodely tools
 * - Room Designer Pro
 * - Aria Voice Assistant
 * - Countertop Calculator
 * - Design Tools
 */

(function() {
  'use strict';

  // Don't show on room designer workspace
  if (window.location.pathname.includes('/tools/room-designer')) return;

  const HUB_ID = 'remodely-hub';

  function createRemodelyHub() {
    // Check if already exists
    if (document.getElementById(HUB_ID)) return;

    const hub = document.createElement('div');
    hub.id = HUB_ID;
    hub.innerHTML = `
      <style>
        /* Hide legacy calculator widget - now integrated into hub */
        .sg-widget,
        #sgWidget {
          display: none !important;
        }

        #remodely-hub {
          position: fixed;
          bottom: 24px;
          right: 24px;
          z-index: 99990;
          font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
        }

        /* Main Button - no background, just floating logo */
        .rh-trigger {
          width: 56px;
          height: 56px;
          border-radius: 50%;
          background: transparent;
          border: none;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          box-shadow: none;
          transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
          position: relative;
          padding: 0;
        }

        .rh-trigger:hover {
          transform: scale(1.1);
        }

        .rh-trigger.open {
          transform: scale(0.95);
        }

        /* Logo */
        .rh-logo {
          width: 48px;
          height: 48px;
          transition: transform 0.4s ease;
          filter: drop-shadow(0 2px 8px rgba(0,0,0,0.3));
        }

        .rh-trigger:hover .rh-logo {
          transform: rotateY(180deg);
          filter: drop-shadow(0 4px 12px rgba(0,0,0,0.4));
        }

        .rh-trigger.open .rh-logo {
          transform: rotate(45deg);
        }

        /* Menu Panel - Glassmorphic */
        .rh-menu {
          position: absolute;
          bottom: 70px;
          right: 0;
          width: 280px;
          background: rgba(20, 20, 35, 0.75);
          backdrop-filter: blur(20px) saturate(180%);
          -webkit-backdrop-filter: blur(20px) saturate(180%);
          border-radius: 20px;
          border: 1px solid rgba(255,255,255,0.15);
          box-shadow: 0 20px 60px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.1);
          opacity: 0;
          visibility: hidden;
          transform: translateY(10px) scale(0.95);
          transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
          overflow: hidden;
        }

        .rh-menu.open {
          opacity: 1;
          visibility: visible;
          transform: translateY(0) scale(1);
        }

        /* Menu Header - Glassmorphic */
        .rh-header {
          padding: 16px 20px;
          background: linear-gradient(135deg, rgba(249,203,0,0.08) 0%, rgba(255,255,255,0.02) 100%);
          border-bottom: 1px solid rgba(255,255,255,0.1);
          display: flex;
          align-items: center;
          gap: 12px;
        }

        .rh-header-icon {
          width: 36px;
          height: 36px;
        }

        .rh-header-text {
          flex: 1;
        }

        .rh-header-title {
          font-size: 14px;
          font-weight: 600;
          color: #fff;
          margin: 0;
        }

        .rh-header-subtitle {
          font-size: 11px;
          color: rgba(255,255,255,0.5);
          margin: 2px 0 0;
        }

        /* Menu Items */
        .rh-items {
          padding: 12px;
          display: flex;
          flex-direction: column;
          gap: 4px;
        }

        .rh-item {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 12px 14px;
          border-radius: 12px;
          color: rgba(255,255,255,0.9);
          text-decoration: none;
          font-size: 14px;
          font-weight: 500;
          transition: all 0.15s ease;
          cursor: pointer;
          border: none;
          background: transparent;
          width: 100%;
          text-align: left;
        }

        .rh-item:hover {
          background: rgba(255,255,255,0.1);
          color: #fff;
          box-shadow: inset 0 0 0 1px rgba(255,255,255,0.08);
        }

        .rh-item:active {
          background: rgba(255,255,255,0.15);
          transform: scale(0.98);
        }

        .rh-item-icon {
          width: 36px;
          height: 36px;
          border-radius: 10px;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
        }

        .rh-item-icon svg {
          width: 20px;
          height: 20px;
        }

        .rh-item-icon.designer { background: linear-gradient(135deg, #4285F4 0%, #34A853 100%); }
        .rh-item-icon.aria { background: linear-gradient(135deg, #f9cb00 0%, #e5b800 100%); }
        .rh-item-icon.aria svg { color: #1a1a2e; }
        .rh-item-icon.calc { background: linear-gradient(135deg, #EA4335 0%, #FBBC05 100%); }
        .rh-item-icon.tools { background: linear-gradient(135deg, #9333ea 0%, #ec4899 100%); }

        .rh-item-text {
          flex: 1;
        }

        .rh-item-title {
          font-size: 13px;
          font-weight: 600;
          color: #fff;
        }

        .rh-item-desc {
          font-size: 11px;
          color: rgba(255,255,255,0.5);
          margin-top: 2px;
        }

        .rh-item-badge {
          font-size: 9px;
          font-weight: 700;
          color: #1a1a2e;
          background: #f9cb00;
          padding: 3px 6px;
          border-radius: 4px;
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }

        /* Divider */
        .rh-divider {
          height: 1px;
          background: rgba(255,255,255,0.08);
          margin: 8px 14px;
        }

        /* Footer - Glassmorphic */
        .rh-footer {
          padding: 12px 16px;
          background: rgba(0,0,0,0.15);
          border-top: 1px solid rgba(255,255,255,0.08);
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 6px;
        }

        .rh-footer-text {
          font-size: 10px;
          color: rgba(255,255,255,0.4);
        }

        .rh-footer-brand {
          font-size: 10px;
          font-weight: 600;
          color: rgba(255,255,255,0.5);
        }

        /* Mobile */
        @media (max-width: 768px) {
          #remodely-hub {
            bottom: 16px;
            right: 16px;
          }

          .rh-trigger {
            width: 48px;
            height: 48px;
          }

          .rh-logo {
            width: 40px;
            height: 40px;
          }

          .rh-menu {
            width: calc(100vw - 32px);
            max-width: 320px;
            right: 0;
            bottom: 56px;
          }
        }

        /* Safe area */
        @supports (padding: env(safe-area-inset-bottom)) {
          #remodely-hub {
            bottom: calc(24px + env(safe-area-inset-bottom));
            right: calc(24px + env(safe-area-inset-right));
          }
          @media (max-width: 768px) {
            #remodely-hub {
              bottom: calc(16px + env(safe-area-inset-bottom));
              right: calc(16px + env(safe-area-inset-right));
            }
          }
        }
      </style>

      <!-- Main Trigger Button -->
      <button class="rh-trigger" id="rhTrigger" aria-label="Open Remodely Tools">
        <svg class="rh-logo" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <linearGradient id="rhGrad" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stop-color="#4285F4"/>
              <stop offset="33%" stop-color="#EA4335"/>
              <stop offset="66%" stop-color="#FBBC05"/>
              <stop offset="100%" stop-color="#34A853"/>
            </linearGradient>
          </defs>
          <path d="M3 21V10l9-7 9 7v11" stroke="url(#rhGrad)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
          <path d="M21 21h-7" stroke="#34A853" stroke-width="2.5" stroke-linecap="round"/>
        </svg>
      </button>

      <!-- Menu Panel -->
      <div class="rh-menu" id="rhMenu">
        <div class="rh-header">
          <svg class="rh-header-icon" viewBox="0 0 24 24" fill="none">
            <defs>
              <linearGradient id="rhGrad2" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stop-color="#4285F4"/>
                <stop offset="33%" stop-color="#EA4335"/>
                <stop offset="66%" stop-color="#FBBC05"/>
                <stop offset="100%" stop-color="#34A853"/>
              </linearGradient>
            </defs>
            <path d="M3 21V10l9-7 9 7v11" stroke="url(#rhGrad2)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
            <path d="M21 21h-7" stroke="#34A853" stroke-width="2" stroke-linecap="round"/>
          </svg>
          <div class="rh-header-text">
            <p class="rh-header-title">Remodely Tools</p>
            <p class="rh-header-subtitle">AI-powered design suite</p>
          </div>
        </div>

        <div class="rh-items">
          <a href="/tools/room-designer/" class="rh-item">
            <div class="rh-item-icon designer">
              <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <rect x="3" y="3" width="18" height="18" rx="2"/>
                <path d="M3 9h18M9 21V9"/>
              </svg>
            </div>
            <div class="rh-item-text">
              <div class="rh-item-title">Room Designer Pro</div>
              <div class="rh-item-desc">Design your space in 3D</div>
            </div>
            <span class="rh-item-badge">New</span>
          </a>

          <button class="rh-item" id="rhAriaBtn">
            <div class="rh-item-icon aria">
              <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/>
                <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
                <line x1="12" y1="19" x2="12" y2="23"/>
                <line x1="8" y1="23" x2="16" y2="23"/>
              </svg>
            </div>
            <div class="rh-item-text">
              <div class="rh-item-title">Aria Voice</div>
              <div class="rh-item-desc">AI assistant</div>
            </div>
          </button>

          <a href="/tools/countertop-calculator/" class="rh-item">
            <div class="rh-item-icon calc">
              <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <rect x="4" y="2" width="16" height="20" rx="2"/>
                <line x1="8" y1="6" x2="16" y2="6"/>
                <line x1="8" y1="10" x2="8" y2="10"/>
                <line x1="12" y1="10" x2="12" y2="10"/>
                <line x1="16" y1="10" x2="16" y2="10"/>
                <line x1="8" y1="14" x2="8" y2="14"/>
                <line x1="12" y1="14" x2="12" y2="14"/>
                <line x1="16" y1="14" x2="16" y2="14"/>
                <line x1="8" y1="18" x2="8" y2="18"/>
                <line x1="12" y1="18" x2="16" y2="18"/>
              </svg>
            </div>
            <div class="rh-item-text">
              <div class="rh-item-title">Cost Calculator</div>
              <div class="rh-item-desc">Get instant estimates</div>
            </div>
          </a>

          <div class="rh-divider"></div>

          <a href="/tools/" class="rh-item">
            <div class="rh-item-icon tools">
              <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <circle cx="12" cy="12" r="3"/>
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/>
              </svg>
            </div>
            <div class="rh-item-text">
              <div class="rh-item-title">All Tools</div>
              <div class="rh-item-desc">Explore design suite</div>
            </div>
          </a>
        </div>

        <div class="rh-footer">
          <span class="rh-footer-text">Powered by</span>
          <span class="rh-footer-brand">Remodely.ai</span>
        </div>
      </div>
    `;

    document.body.appendChild(hub);

    // Elements
    const trigger = document.getElementById('rhTrigger');
    const menu = document.getElementById('rhMenu');
    const ariaBtn = document.getElementById('rhAriaBtn');
    let isOpen = false;

    // Toggle menu
    function toggleMenu() {
      isOpen = !isOpen;
      trigger.classList.toggle('open', isOpen);
      menu.classList.toggle('open', isOpen);
    }

    // Close menu
    function closeMenu() {
      isOpen = false;
      trigger.classList.remove('open');
      menu.classList.remove('open');
    }

    // Event listeners
    trigger.addEventListener('click', toggleMenu);

    // Close on outside click
    document.addEventListener('click', (e) => {
      if (isOpen && !hub.contains(e.target)) {
        closeMenu();
      }
    });

    // Close on escape
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && isOpen) {
        closeMenu();
      }
    });

    // Aria button - trigger Aria widget
    ariaBtn.addEventListener('click', () => {
      closeMenu();
      // Try to open Aria using SGWidgets API
      if (window.SGWidgets && typeof window.SGWidgets.showAriaVoice === 'function') {
        window.SGWidgets.showAriaVoice();
      } else if (window.ariaVoice && typeof window.ariaVoice.open === 'function') {
        window.ariaVoice.open();
      } else if (window.ariaRealtime && typeof window.ariaRealtime.open === 'function') {
        window.ariaRealtime.open();
      } else {
        // Fallback - redirect to contact
        window.location.href = '/contact-us/';
      }
    });

    // Close menu when clicking a link
    menu.querySelectorAll('a').forEach(link => {
      link.addEventListener('click', closeMenu);
    });
  }

  // Initialize on DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', createRemodelyHub);
  } else {
    createRemodelyHub();
  }
})();
