/**
 * Room Designer Widget
 * Floating Remodely house logo - rotates 180° on scroll
 */

(function() {
  'use strict';

  // Only exclude the room designer workspace itself
  if (window.location.pathname.includes('/tools/room-designer')) return;

  function createFloatingWidget() {
    const widget = document.createElement('div');
    widget.id = 'room-designer-widget';
    widget.innerHTML = `
      <style>
        #room-designer-widget {
          position: fixed;
          bottom: 100px;
          right: 28px;
          z-index: 9998;
          opacity: 0;
          transition: opacity 0.5s ease;
        }

        #room-designer-widget.visible {
          opacity: 1;
        }

        .rdw-link {
          display: block;
          width: 56px;
          height: 56px;
          position: relative;
          text-decoration: none;
          cursor: pointer;
        }

        .rdw-icon {
          width: 56px;
          height: 56px;
          transition: transform 0.4s ease;
        }

        .rdw-icon svg {
          width: 100%;
          height: 100%;
        }

        @keyframes rdwEntrance {
          0% { transform: rotateY(0deg); }
          50% { transform: rotateY(180deg); }
          100% { transform: rotateY(0deg); }
        }

        .rdw-icon.entrance {
          animation: rdwEntrance 0.8s ease-out;
        }

        .rdw-tooltip {
          position: absolute;
          right: calc(100% + 12px);
          top: 50%;
          transform: translateY(-50%) translateX(10px);
          background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
          color: #fff;
          padding: 8px 14px;
          border-radius: 8px;
          font-family: 'Inter', -apple-system, sans-serif;
          font-size: 12px;
          font-weight: 600;
          white-space: nowrap;
          border: 1px solid rgba(255, 255, 255, 0.1);
          box-shadow: 0 4px 16px rgba(0, 0, 0, 0.3);
          opacity: 0;
          pointer-events: none;
          transition: opacity 0.2s ease, transform 0.2s ease;
        }

        .rdw-tooltip::after {
          content: '';
          position: absolute;
          right: -6px;
          top: 50%;
          transform: translateY(-50%);
          border: 6px solid transparent;
          border-left-color: #16213e;
        }

        .rdw-link:hover .rdw-tooltip {
          opacity: 1;
          transform: translateY(-50%) translateX(0);
        }

        @media (max-width: 768px) {
          #room-designer-widget {
            bottom: 100px;
            right: 32px;
          }
          .rdw-link, .rdw-icon {
            width: 48px;
            height: 48px;
          }
          .rdw-tooltip {
            display: none;
          }
        }
      </style>

      <a href="/tools/room-designer/" class="rdw-link">
        <div class="rdw-icon">
          <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <defs>
              <linearGradient id="rdwGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stop-color="#4285F4"/>
                <stop offset="33%" stop-color="#EA4335"/>
                <stop offset="66%" stop-color="#FBBC05"/>
                <stop offset="100%" stop-color="#34A853"/>
              </linearGradient>
            </defs>
            <path d="M3 21V10l9-7 9 7v11" stroke="url(#rdwGrad)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
            <path d="M21 21h-7" stroke="#34A853" stroke-width="2.5" stroke-linecap="round"/>
          </svg>
        </div>
        <div class="rdw-tooltip">Room Designer Pro</div>
      </a>
    `;

    const dismissed = localStorage.getItem('rdw-dismissed');
    if (dismissed && Date.now() - parseInt(dismissed) < 7 * 24 * 60 * 60 * 1000) return;

    let shown = false;
    let lastScrollY = window.scrollY;
    let rotation = 0;
    let icon = null;
    let isHovered = false;

    function updateRotation() {
      if (icon && !icon.classList.contains('entrance')) {
        icon.style.transform = `rotateY(${isHovered ? 180 : rotation}deg)`;
      }
    }

    function handleScroll() {
      const delta = window.scrollY - lastScrollY;
      lastScrollY = window.scrollY;

      if (Math.abs(delta) > 3) {
        // Rotate 180 in one direction based on scroll
        rotation += delta > 0 ? 10 : -10;
        rotation = Math.max(0, Math.min(180, rotation));
        if (!isHovered) updateRotation();
      }
    }

    function showWidget() {
      if (shown) return;
      shown = true;
      document.body.appendChild(widget);
      icon = widget.querySelector('.rdw-icon');
      const link = widget.querySelector('.rdw-link');

      // Hover handlers
      link.addEventListener('mouseenter', () => {
        isHovered = true;
        updateRotation();
      });
      link.addEventListener('mouseleave', () => {
        isHovered = false;
        updateRotation();
      });

      // Entrance animation
      icon.classList.add('entrance');
      icon.addEventListener('animationend', () => {
        icon.classList.remove('entrance');
        updateRotation();
      }, { once: true });

      requestAnimationFrame(() => widget.classList.add('visible'));
      window.addEventListener('scroll', handleScroll, { passive: true });
    }

    // Show immediately after short delay
    setTimeout(showWidget, 500);
  }

  document.addEventListener('DOMContentLoaded', createFloatingWidget);
})();
