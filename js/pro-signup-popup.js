/**
 * Pro Signup Popup
 * Targeted popup for fabricators, contractors, and designers to sign up
 */

(function() {
  'use strict';

  const POPUP_KEY = 'sg_pro_popup_shown';
  const POPUP_DELAY = 8000; // Show after 8 seconds
  const POPUP_COOLDOWN = 7 * 24 * 60 * 60 * 1000; // 7 days

  function shouldShowPopup() {
    const lastShown = localStorage.getItem(POPUP_KEY);
    if (lastShown) {
      const elapsed = Date.now() - parseInt(lastShown, 10);
      if (elapsed < POPUP_COOLDOWN) {
        return false;
      }
    }
    return true;
  }

  function markPopupShown() {
    localStorage.setItem(POPUP_KEY, Date.now().toString());
  }

  function createPopup() {
    const popup = document.createElement('div');
    popup.id = 'proSignupPopup';
    popup.className = 'pro-popup-overlay';
    popup.innerHTML = `
      <div class="pro-popup">
        <button class="pro-popup-close" onclick="window.closeProPopup()">&times;</button>

        <div class="pro-popup-header">
          <div class="pro-popup-badge">For Professionals</div>
          <h2>Grow Your Business with Surprise Granite</h2>
          <p>Join Arizona's leading marketplace for fabricators, installers, and designers.</p>
        </div>

        <div class="pro-popup-benefits">
          <div class="benefit-item">
            <svg viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/></svg>
            <span>List your remnants & materials</span>
          </div>
          <div class="benefit-item">
            <svg viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/></svg>
            <span>Connect with local homeowners</span>
          </div>
          <div class="benefit-item">
            <svg viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/></svg>
            <span>Access exclusive pro pricing</span>
          </div>
          <div class="benefit-item">
            <svg viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/></svg>
            <span>Featured in our Pro Directory</span>
          </div>
        </div>

        <div class="pro-popup-cta">
          <a href="/account?signup=pro" class="pro-popup-btn primary">
            Create Pro Account
            <svg viewBox="0 0 24 24"><path d="M8.59 16.59L13.17 12 8.59 7.41 10 6l6 6-6 6z"/></svg>
          </a>
          <button class="pro-popup-btn secondary" onclick="window.closeProPopup()">
            Maybe Later
          </button>
        </div>

        <p class="pro-popup-footer">Free to join. Upgrade anytime for unlimited listings.</p>
      </div>
    `;

    document.body.appendChild(popup);

    // Add styles
    if (!document.getElementById('pro-popup-styles')) {
      const styles = document.createElement('style');
      styles.id = 'pro-popup-styles';
      styles.textContent = `
        .pro-popup-overlay {
          position: fixed;
          inset: 0;
          background: rgba(0, 0, 0, 0.7);
          backdrop-filter: blur(8px);
          -webkit-backdrop-filter: blur(8px);
          z-index: 100000;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 20px;
          opacity: 0;
          visibility: hidden;
          transition: all 0.3s ease;
        }
        .pro-popup-overlay.show {
          opacity: 1;
          visibility: visible;
        }
        .pro-popup {
          background: #fff;
          border-radius: 20px;
          max-width: 480px;
          width: 100%;
          padding: 40px;
          position: relative;
          transform: scale(0.9) translateY(20px);
          transition: transform 0.3s ease;
          box-shadow: 0 25px 60px rgba(0, 0, 0, 0.3);
        }
        .pro-popup-overlay.show .pro-popup {
          transform: scale(1) translateY(0);
        }
        .pro-popup-close {
          position: absolute;
          top: 15px;
          right: 15px;
          width: 36px;
          height: 36px;
          background: #f5f5f5;
          border: none;
          border-radius: 50%;
          font-size: 24px;
          cursor: pointer;
          color: #666;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: all 0.2s;
        }
        .pro-popup-close:hover {
          background: #1a2b3c;
          color: #fff;
        }
        .pro-popup-header {
          text-align: center;
          margin-bottom: 30px;
        }
        .pro-popup-badge {
          display: inline-block;
          background: linear-gradient(135deg, #f9cb00 0%, #e5b800 100%);
          color: #1a2b3c;
          padding: 6px 16px;
          border-radius: 50px;
          font-size: 12px;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 1px;
          margin-bottom: 16px;
        }
        .pro-popup-header h2 {
          font-size: 26px;
          font-weight: 800;
          color: #1a2b3c;
          margin-bottom: 10px;
          line-height: 1.2;
        }
        .pro-popup-header p {
          font-size: 15px;
          color: #666;
        }
        .pro-popup-benefits {
          background: #f8f9fa;
          border-radius: 12px;
          padding: 20px;
          margin-bottom: 25px;
        }
        .benefit-item {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 10px 0;
          color: #333;
          font-size: 14px;
          font-weight: 500;
        }
        .benefit-item:not(:last-child) {
          border-bottom: 1px solid #e5e5e5;
        }
        .benefit-item svg {
          width: 22px;
          height: 22px;
          fill: #22c55e;
          flex-shrink: 0;
        }
        .pro-popup-cta {
          display: flex;
          flex-direction: column;
          gap: 12px;
        }
        .pro-popup-btn {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          padding: 16px 24px;
          border-radius: 12px;
          font-size: 16px;
          font-weight: 600;
          text-decoration: none;
          cursor: pointer;
          transition: all 0.2s;
          border: none;
        }
        .pro-popup-btn.primary {
          background: linear-gradient(135deg, #f9cb00 0%, #e5b800 100%);
          color: #1a2b3c;
        }
        .pro-popup-btn.primary:hover {
          transform: translateY(-2px);
          box-shadow: 0 6px 20px rgba(249, 203, 0, 0.4);
        }
        .pro-popup-btn.primary svg {
          width: 20px;
          height: 20px;
          fill: currentColor;
        }
        .pro-popup-btn.secondary {
          background: transparent;
          color: #666;
        }
        .pro-popup-btn.secondary:hover {
          background: #f5f5f5;
          color: #333;
        }
        .pro-popup-footer {
          text-align: center;
          font-size: 12px;
          color: #999;
          margin-top: 16px;
        }
        @media (max-width: 500px) {
          .pro-popup {
            padding: 30px 24px;
          }
          .pro-popup-header h2 {
            font-size: 22px;
          }
        }
      `;
      document.head.appendChild(styles);
    }

    // Show with animation
    setTimeout(() => popup.classList.add('show'), 10);
  }

  window.closeProPopup = function() {
    const popup = document.getElementById('proSignupPopup');
    if (popup) {
      popup.classList.remove('show');
      setTimeout(() => popup.remove(), 300);
      markPopupShown();
    }
  };

  function init() {
    // Don't show on account page or if already signed in
    if (window.location.pathname.includes('/account')) return;

    // Check if user is likely a pro (already visited pro pages)
    const visitedProPages = localStorage.getItem('sg_visited_pro');

    if (shouldShowPopup()) {
      setTimeout(() => {
        createPopup();
      }, POPUP_DELAY);
    }
  }

  // Run on DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
