/**
 * Surprise Granite - Mobile Navigation
 * Standalone mobile nav component (max-width: 768px)
 *
 * Dependencies: None (self-contained)
 * Visibility controlled by: mega-nav.css
 */

(function() {
  'use strict';

  // Prevent multiple initializations
  if (window.sgMobileNavInitialized) return;
  window.sgMobileNavInitialized = true;

  // Menu configuration
  const MENU_ITEMS = [
    { label: 'Countertops', href: '/materials/all-countertops' },
    { label: 'Tile', href: '/materials/all-tile' },
    { label: 'Flooring', href: '/materials/flooring' },
    { label: 'Kitchen Remodeling', href: '/services/home/kitchen-remodeling-arizona' },
    { label: 'Bathroom Remodeling', href: '/services/home/bathroom-remodeling-arizona' },
    { label: 'Shop', href: '/shop' },
    { label: 'Tools', href: '/tools' },
    { label: 'Gallery', href: '/company/project-gallery' },
    { label: 'Contact', href: '/contact-us' },
    { label: 'My Account', href: '/account' }
  ];

  const LOGO_URL = 'https://cdn.prod.website-files.com/6456ce4476abb25581fbad0c/6456ce4476abb27beffbb16a_Surprise%20Granite%20Transparent%20Dark%20Wide.svg';
  const PHONE = '(602) 833-3189';
  const PHONE_HREF = 'tel:+16028333189';

  // Build HTML
  function buildHTML() {
    const menuHTML = MENU_ITEMS.map(item => `
      <a href="${item.href}" class="sg-mnav-item">
        <span>${item.label}</span>
        <svg viewBox="0 0 24 24" width="20" height="20"><path fill="#999" d="M8.59 16.59L13.17 12 8.59 7.41 10 6l6 6-6 6-1.41-1.41z"/></svg>
      </a>
    `).join('');

    return `
      <div class="sg-mnav" id="sgMobileNav">
        <div class="sg-mnav-header">
          <button class="sg-mnav-hamburger" id="sgMnavToggle" aria-label="Open menu">
            <span></span><span></span><span></span>
          </button>
          <a href="/" class="sg-mnav-logo">
            <img src="${LOGO_URL}" alt="Surprise Granite">
            <span class="sg-mnav-tagline">Marble & Quartz</span>
          </a>
          <a href="${PHONE_HREF}" class="sg-mnav-phone" aria-label="Call us">
            <svg viewBox="0 0 24 24" width="20" height="20"><path fill="#1a2b3c" d="M20.01 15.38c-1.23 0-2.42-.2-3.53-.56a.977.977 0 00-1.01.24l-1.57 1.97c-2.83-1.35-5.48-3.9-6.89-6.83l1.95-1.66c.27-.28.35-.67.24-1.02-.37-1.11-.56-2.3-.56-3.53 0-.54-.45-.99-.99-.99H5.03C3.65 3 3 3.24 3 3.99 3 13.28 10.73 21 20.01 21c.71 0 .99-.63.99-1.18v-3.45c0-.54-.45-.99-.99-.99z"/></svg>
          </a>
        </div>
        <div class="sg-mnav-overlay" id="sgMnavOverlay"></div>
        <div class="sg-mnav-drawer" id="sgMnavDrawer">
          <div class="sg-mnav-drawer-header">
            <span class="sg-mnav-drawer-title">Menu</span>
            <button class="sg-mnav-close" id="sgMnavClose" aria-label="Close menu">
              <span class="sg-mnav-x"></span>
            </button>
          </div>
          <nav class="sg-mnav-items">${menuHTML}</nav>
          <div class="sg-mnav-drawer-footer">
            <a href="/get-a-free-estimate" class="sg-mnav-cta">Get Free Estimate</a>
            <a href="${PHONE_HREF}" class="sg-mnav-call">
              <svg viewBox="0 0 24 24" width="18" height="18"><path fill="#1a2b3c" d="M20.01 15.38c-1.23 0-2.42-.2-3.53-.56a.977.977 0 00-1.01.24l-1.57 1.97c-2.83-1.35-5.48-3.9-6.89-6.83l1.95-1.66c.27-.28.35-.67.24-1.02-.37-1.11-.56-2.3-.56-3.53 0-.54-.45-.99-.99-.99H5.03C3.65 3 3 3.24 3 3.99 3 13.28 10.73 21 20.01 21c.71 0 .99-.63.99-1.18v-3.45c0-.54-.45-.99-.99-.99z"/></svg>
              ${PHONE}
            </a>
          </div>
        </div>
      </div>
    `;
  }

  // Build CSS
  function buildCSS() {
    return `
/* ===========================================
   MOBILE NAV - Only visible on mobile
   Visibility controlled by mega-nav.css
   =========================================== */

.sg-mnav { display: none; }

@media (max-width: 768px) {
  /* Show mobile nav */
  .sg-mnav {
    display: block;
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    z-index: 99999;
  }

  /* Body padding */
  body { padding-top: 64px !important; }

  /* Header */
  .sg-mnav-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    background: #fff;
    padding: 8px 12px;
    height: 64px;
    box-shadow: 0 2px 8px rgba(0,0,0,0.1);
  }

  /* Hamburger - 44px minimum for Apple HIG touch targets */
  .sg-mnav-hamburger {
    width: 44px;
    height: 44px;
    background: none;
    border: none;
    cursor: pointer;
    display: flex;
    flex-direction: column;
    justify-content: center;
    align-items: center;
    gap: 5px;
    padding: 8px;
    border-radius: 8px;
  }
  .sg-mnav-hamburger span {
    display: block;
    width: 22px;
    height: 2px;
    background: #1a2b3c;
    border-radius: 2px;
    transition: all 0.3s;
  }
  .sg-mnav-hamburger.is-open span:nth-child(1) { transform: rotate(45deg) translate(5px, 5px); }
  .sg-mnav-hamburger.is-open span:nth-child(2) { opacity: 0; }
  .sg-mnav-hamburger.is-open span:nth-child(3) { transform: rotate(-45deg) translate(5px, -5px); }

  /* Logo */
  .sg-mnav-logo {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    text-decoration: none;
    gap: 2px;
  }
  .sg-mnav-logo img { height: 32px; width: auto; }
  .sg-mnav-tagline {
    font-size: 9px;
    color: #cca600;
    letter-spacing: 2px;
    font-weight: 600;
    text-transform: uppercase;
  }

  /* Phone button */
  .sg-mnav-phone {
    width: 40px;
    height: 40px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: #f9cb00;
    border-radius: 50%;
  }

  /* Overlay */
  .sg-mnav-overlay {
    position: fixed;
    inset: 0;
    background: rgba(0,0,0,0.5);
    opacity: 0;
    visibility: hidden;
    transition: all 0.3s;
    z-index: 99998;
  }
  .sg-mnav-overlay.is-visible { opacity: 1; visibility: visible; }

  /* Drawer */
  .sg-mnav-drawer {
    position: fixed;
    top: 0;
    left: 0;
    width: 85%;
    max-width: 320px;
    height: 100%;
    background: #fff;
    transform: translateX(-100%);
    transition: transform 0.3s ease;
    z-index: 99999;
    display: flex;
    flex-direction: column;
    box-shadow: 2px 0 20px rgba(0,0,0,0.2);
  }
  .sg-mnav-drawer.is-open { transform: translateX(0); }

  /* Drawer header */
  .sg-mnav-drawer-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 16px 20px;
    background: #1a2b3c;
  }
  .sg-mnav-drawer-title { font-size: 18px; font-weight: 600; color: #fff; }

  /* Close button */
  .sg-mnav-close {
    width: 36px;
    height: 36px;
    background: rgba(255,255,255,0.15);
    border: none;
    border-radius: 50%;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .sg-mnav-x { position: relative; width: 18px; height: 18px; }
  .sg-mnav-x::before,
  .sg-mnav-x::after {
    content: '';
    position: absolute;
    top: 50%;
    left: 50%;
    width: 18px;
    height: 2px;
    background: #fff;
    border-radius: 1px;
  }
  .sg-mnav-x::before { transform: translate(-50%, -50%) rotate(45deg); }
  .sg-mnav-x::after { transform: translate(-50%, -50%) rotate(-45deg); }

  /* Menu items */
  .sg-mnav-items { flex: 1; overflow-y: auto; padding: 8px 0; }
  .sg-mnav-item {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 14px 20px;
    text-decoration: none;
    color: #1a2b3c;
    font-size: 15px;
    font-weight: 500;
    border-bottom: 1px solid #f0f0f0;
  }
  .sg-mnav-item:active { background: #f8f8f8; }

  /* Footer */
  .sg-mnav-drawer-footer {
    padding: 16px 20px;
    background: #f8f8f8;
    border-top: 1px solid #eee;
  }
  .sg-mnav-cta {
    display: block;
    background: #f9cb00;
    color: #1a2b3c;
    text-align: center;
    padding: 14px 20px;
    border-radius: 8px;
    text-decoration: none;
    font-weight: 600;
    font-size: 15px;
    margin-bottom: 10px;
  }
  .sg-mnav-call {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    color: #1a2b3c;
    text-decoration: none;
    font-weight: 500;
    font-size: 14px;
    padding: 10px;
  }
}

@media (min-width: 769px) {
  .sg-mnav { display: none !important; }
}
`;
  }

  // Initialize
  function init() {
    // Inject CSS
    const style = document.createElement('style');
    style.id = 'sg-mobile-nav-css';
    style.textContent = buildCSS();
    document.head.appendChild(style);

    // Inject HTML
    document.body.insertAdjacentHTML('afterbegin', buildHTML());

    // Elements
    const toggle = document.getElementById('sgMnavToggle');
    const close = document.getElementById('sgMnavClose');
    const drawer = document.getElementById('sgMnavDrawer');
    const overlay = document.getElementById('sgMnavOverlay');

    function openMenu() {
      toggle.classList.add('is-open');
      drawer.classList.add('is-open');
      overlay.classList.add('is-visible');
      document.body.style.overflow = 'hidden';
    }

    function closeMenu() {
      toggle.classList.remove('is-open');
      drawer.classList.remove('is-open');
      overlay.classList.remove('is-visible');
      document.body.style.overflow = '';
    }

    // Event listeners
    toggle?.addEventListener('click', openMenu);
    close?.addEventListener('click', closeMenu);
    overlay?.addEventListener('click', closeMenu);

    document.addEventListener('keydown', e => {
      if (e.key === 'Escape' && drawer.classList.contains('is-open')) closeMenu();
    });

    document.querySelectorAll('.sg-mnav-item, .sg-mnav-cta').forEach(el => {
      el.addEventListener('click', closeMenu);
    });
  }

  // Run
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
