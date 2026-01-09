/**
 * SURPRISE GRANITE - UNIFIED NAVIGATION
 * Single navigation system for desktop and mobile
 * Includes authentication integration
 * Version: 2.1
 */

(function() {
  'use strict';

  // Prevent multiple initializations
  if (window.unifiedNavInitialized) return;
  window.unifiedNavInitialized = true;

  // Load authentication dependencies
  function loadAuthDependencies() {
    // Load Supabase if not already loaded
    if (!window.supabase && !document.querySelector('script[src*="supabase"]')) {
      const supabaseScript = document.createElement('script');
      supabaseScript.src = 'https://unpkg.com/@supabase/supabase-js@2';
      supabaseScript.async = true;
      document.head.appendChild(supabaseScript);
    }

    // Load sg-auth.js if not already loaded
    if (!window.SgAuth && !document.querySelector('script[src*="sg-auth"]')) {
      const authScript = document.createElement('script');
      authScript.src = '/js/sg-auth.js?v=20260109f';
      authScript.async = true;
      document.head.appendChild(authScript);
    }
  }

  // Load auth dependencies immediately
  loadAuthDependencies();

  // Configuration
  const CONFIG = {
    logo: 'https://cdn.prod.website-files.com/6456ce4476abb25581fbad0c/6456ce4476abb27beffbb16a_Surprise%20Granite%20Transparent%20Dark%20Wide.svg',
    phone: '(602) 833-3189',
    phoneHref: 'tel:+16028333189',
    tagline: 'Marble & Quartz'
  };

  // Menu items
  const MENU_ITEMS = [
    { label: 'Countertops', href: '/materials/all-countertops', hasMenu: true },
    { label: 'Tile', href: '/materials/all-tile', hasMenu: true },
    { label: 'Flooring', href: '/materials/flooring', hasMenu: true },
    { label: 'Services', href: '/services/home/kitchen-remodeling-arizona', hasMenu: true },
    { label: 'Shop', href: '/shop' },
    { label: 'Tools', href: '/tools' },
    { label: 'Gallery', href: '/company/project-gallery' },
    { label: 'Contact', href: '/contact-us' }
  ];

  // Mobile menu items (expanded with all key pages)
  const MOBILE_MENU_ITEMS = [
    { label: 'Home', href: '/' },
    { label: 'Countertops', href: '/materials/all-countertops' },
    { label: 'Quartz Countertops', href: '/materials/countertops/quartz-countertops' },
    { label: 'Granite Countertops', href: '/materials/countertops/granite-countertops' },
    { label: 'Marble Countertops', href: '/materials/countertops/marble-countertops' },
    { label: 'Porcelain Countertops', href: '/materials/countertops/porcelain-countertops' },
    { label: 'Tile', href: '/materials/all-tile' },
    { label: 'Flooring', href: '/materials/flooring' },
    { label: 'Cabinets', href: '/materials/all-cabinets' },
    { label: 'Kitchen Remodeling', href: '/services/home/kitchen-remodeling-arizona' },
    { label: 'Bathroom Remodeling', href: '/services/home/bathroom-remodeling-arizona' },
    { label: 'Shop', href: '/shop' },
    { label: 'Tools', href: '/tools' },
    { label: 'Gallery', href: '/company/project-gallery' },
    { label: 'About Us', href: '/company/about-us' },
    { label: 'Reviews', href: '/company/reviews' },
    { label: 'FAQ', href: '/company/faq-center' },
    { label: 'Contact', href: '/contact-us' },
    { label: 'Financing', href: '/services/home-remodeling-financing-options-in-arizona' },
    { label: 'My Account', href: '/account' }
  ];

  // Product data for mega menus
  const PRODUCTS = {
    countertops: [
      { name: 'Quartz', desc: 'Premium engineered stone', href: '/materials/countertops/quartz-countertops', img: 'https://cdn.prod.website-files.com/6456ce4476abb2d4f9fbad10/6456ce4576abb21a6cfbc44d_Msi-surfaces-surprise-quartz-calacatta-abezzo-quartz-slab.avif' },
      { name: 'Granite', desc: 'Natural stone beauty', href: '/materials/countertops/granite-countertops', img: 'https://cdn.prod.website-files.com/6456ce4476abb2d4f9fbad10/6456ce4476abb22cfafbb7e4_msi-surfaces-surprise-granite-new-river-close-up.avif' },
      { name: 'Marble', desc: 'Timeless elegance', href: '/materials/countertops/marble-countertops', img: 'https://cdn.prod.website-files.com/6456ce4476abb2d4f9fbad10/6456ce4476abb25831fbb345_Cambria_Surprise_Granite_Oakleigh_Slab.avif' },
      { name: 'Porcelain', desc: 'Ultra-compact surfaces', href: '/materials/countertops/porcelain-countertops', img: 'https://cdn.prod.website-files.com/6456ce4476abb2d4f9fbad10/6456ce4576abb294bffbc2da_dekton-surprise-granite-laurent-quartz-close-up.avif' }
    ],
    tile: [
      { name: 'Porcelain Tile', desc: 'Durable & versatile', href: '/materials/all-tile', img: 'https://cdn.prod.website-files.com/6456ce4476abb2d4f9fbad10/6531e4b87153315974bccb0a_tub-to-shower-conversions-az_thumb.avif' },
      { name: 'Ceramic Tile', desc: 'Classic & affordable', href: '/materials/all-tile', img: 'https://cdn.prod.website-files.com/6456ce4476abb2d4f9fbad10/6456ce4576abb2a6cdfbc46c_Radianz-quartz-surprise-granite-calacatta-victory-close-up.avif' },
      { name: 'Mosaic Tile', desc: 'Decorative accents', href: '/materials/all-tile', img: 'https://cdn.prod.website-files.com/6456ce4476abb2d4f9fbad10/6456ce4576abb2af91fbc4ad_Radianz-quartz-surprise-granite-alluring-close-up.avif' },
      { name: 'Backsplash', desc: 'Kitchen & bath', href: '/materials/all-tile', img: 'https://cdn.prod.website-files.com/6456ce4476abb2d4f9fbad10/6456ce4576abb2d8c0fbc6fb_msi-surfaces-quartz-surprise-granite-calacatta-miraggio-gold-close-up.avif' }
    ],
    flooring: [
      { name: 'Luxury Vinyl', desc: 'Waterproof & stylish', href: '/materials/flooring', img: 'https://cdn.prod.website-files.com/6456ce4476abb2d4f9fbad10/6456ce4576abb27db9fbccd8_msi-surfaces-surprise-granite-xl-trecento-white-ocean-luxury-vinyl-tile-close-up.avif' },
      { name: 'Hardwood Look', desc: 'Natural wood aesthetic', href: '/materials/flooring', img: 'https://cdn.prod.website-files.com/6456ce4476abb2d4f9fbad10/6456ce4576abb26667fbcb95_msi-surfaces-surprise-granite-quarzo-taj-luxury-vinyl-planks-close-up.avif' },
      { name: 'Stone Look', desc: 'Elegant stone patterns', href: '/materials/flooring', img: 'https://cdn.prod.website-files.com/6456ce4476abb2d4f9fbad10/6456ce4576abb201fafbccd6_msi-surfaces-surprise-granite-xl-trecento-mountains-gray-luxury-vinyl-planks-close-up.avif' },
      { name: 'Marble Look', desc: 'Premium vinyl tile', href: '/materials/flooring', img: 'https://cdn.prod.website-files.com/6456ce4476abb2d4f9fbad10/6456ce4576abb2ebb6fbccd4_msi-surfaces-surprise-granite-xl-trecento-carrara-avell-luxury-vinyl-tile-close-up.avif' }
    ],
    services: [
      { name: 'Kitchen Remodeling', desc: 'Complete renovations', href: '/services/home/kitchen-remodeling-arizona', img: 'https://cdn.prod.website-files.com/6456ce4476abb2d4f9fbad10/65dfb7f28b5c4c03249bf4db_69647337_157661692014463_2667270912306059733_n-96da2b9c2f6e427a8fc021d5a5382031.jpg' },
      { name: 'Bathroom Remodeling', desc: 'Modern upgrades', href: '/services/home/bathroom-remodeling-arizona', img: 'https://cdn.prod.website-files.com/6456ce4476abb2d4f9fbad10/6531e4b87153315974bccb0a_tub-to-shower-conversions-az_thumb.avif' },
      { name: 'Countertop Install', desc: 'Professional installation', href: '/services/home/kitchen-remodeling-arizona', img: 'https://cdn.prod.website-files.com/6456ce4476abb2d4f9fbad10/651c69d8e6c77c995d99b4d7_arizona-countertop-installation-service_thumbnail.avif' },
      { name: 'Financing', desc: 'Easy payment options', href: '/services/home-remodeling-financing-options-in-arizona', img: 'https://cdn.prod.website-files.com/6456ce4476abb2d4f9fbad10/652324e7840a341086726be1_sink-installation-service-arizona-2.avif' }
    ]
  };

  // Create mega menu HTML
  function createMegaMenu(category, title, allLink) {
    const items = PRODUCTS[category];
    if (!items) return '';

    const itemsHTML = items.map(item => `
      <a href="${item.href}" class="unified-mega-item">
        <img src="${item.img}" alt="${item.name}" loading="lazy">
        <div class="unified-mega-item-content">
          <h4>${item.name}</h4>
          <p>${item.desc}</p>
        </div>
      </a>
    `).join('');

    return `
      <div class="unified-mega-menu">
        <div class="unified-mega-header">
          <h3>Browse ${title}</h3>
          <a href="${allLink}">View All &rarr;</a>
        </div>
        <div class="unified-mega-grid">
          ${itemsHTML}
        </div>
      </div>
    `;
  }

  // Create navigation links with mega menus
  function createNavLinks() {
    return MENU_ITEMS.map(item => {
      const category = item.label.toLowerCase();
      const megaMenu = item.hasMenu && PRODUCTS[category] ? createMegaMenu(category, item.label, item.href) : '';
      const arrow = item.hasMenu ? '<svg viewBox="0 0 24 24"><path d="M7 10l5 5 5-5z"/></svg>' : '';

      return `
        <li>
          <a href="${item.href}">${item.label}${arrow}</a>
          ${megaMenu}
        </li>
      `;
    }).join('');
  }

  // Create mobile drawer links
  function createDrawerLinks() {
    return MOBILE_MENU_ITEMS.map(item => `
      <a href="${item.href}" class="unified-nav-drawer-item">
        <span>${item.label}</span>
        <svg viewBox="0 0 24 24"><path d="M8.59 16.59L13.17 12 8.59 7.41 10 6l6 6-6 6-1.41-1.41z"/></svg>
      </a>
    `).join('');
  }

  // Create full navigation HTML
  function createNavHTML() {
    return `
      <nav class="unified-nav" id="unifiedNav">
        <!-- Top Bar (Desktop) -->
        <div class="unified-nav-top">
          <div class="unified-nav-top-left">
            <a href="/get-a-free-estimate" class="unified-nav-promo">
              <strong>Free In-Home Estimates</strong> - Book your consultation today!
            </a>
          </div>
          <div class="unified-nav-top-right">
            <a href="${CONFIG.phoneHref}" class="unified-nav-phone">
              <svg viewBox="0 0 24 24"><path d="M20.01 15.38c-1.23 0-2.42-.2-3.53-.56a.977.977 0 00-1.01.24l-1.57 1.97c-2.83-1.35-5.48-3.9-6.89-6.83l1.95-1.66c.27-.28.35-.67.24-1.02-.37-1.11-.56-2.3-.56-3.53 0-.54-.45-.99-.99-.99H5.03C3.65 3 3 3.24 3 3.99 3 13.28 10.73 21 20.01 21c.71 0 .99-.63.99-1.18v-3.45c0-.54-.45-.99-.99-.99z"/></svg>
              ${CONFIG.phone}
            </a>
            <a href="/account" class="unified-nav-account" id="unifiedNavAccount">
              <span class="unified-nav-account-avatar" id="unifiedNavAvatar">
                <svg viewBox="0 0 24 24"><path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/></svg>
              </span>
              <span class="unified-nav-account-text" id="unifiedNavAccountText">Account</span>
            </a>
          </div>
        </div>

        <!-- Main Bar -->
        <div class="unified-nav-main">
          <a href="/" class="unified-nav-logo">
            <img src="${CONFIG.logo}" alt="Surprise Granite">
            <span class="unified-nav-logo-tagline">${CONFIG.tagline}</span>
          </a>

          <div class="unified-nav-search">
            <input type="text" placeholder="Search countertops, tile, flooring..." id="unifiedNavSearch">
            <button type="button" id="unifiedNavSearchBtn" aria-label="Search">
              <svg viewBox="0 0 24 24"><path d="M15.5 14h-.79l-.28-.27C15.41 12.59 16 11.11 16 9.5 16 5.91 13.09 3 9.5 3S3 5.91 3 9.5 5.91 16 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"/></svg>
            </button>
          </div>

          <div class="unified-nav-actions">
            <a href="/shop">
              <svg viewBox="0 0 24 24"><path d="M7 18c-1.1 0-1.99.9-1.99 2S5.9 22 7 22s2-.9 2-2-.9-2-2-2zM1 2v2h2l3.6 7.59-1.35 2.45c-.16.28-.25.61-.25.96 0 1.1.9 2 2 2h12v-2H7.42c-.14 0-.25-.11-.25-.25l.03-.12.9-1.63h7.45c.75 0 1.41-.41 1.75-1.03l3.58-6.49c.08-.14.12-.31.12-.48 0-.55-.45-1-1-1H5.21l-.94-2H1zm16 16c-1.1 0-1.99.9-1.99 2s.89 2 1.99 2 2-.9 2-2-.9-2-2-2z"/></svg>
              Shop
            </a>
            <a href="/get-a-free-estimate" class="unified-nav-estimate">Free Estimate</a>
          </div>

          <a href="/cart" class="unified-nav-mobile-cart" aria-label="Shopping cart">
            <svg viewBox="0 0 24 24"><path d="M7 18c-1.1 0-1.99.9-1.99 2S5.9 22 7 22s2-.9 2-2-.9-2-2-2zM1 2v2h2l3.6 7.59-1.35 2.45c-.16.28-.25.61-.25.96 0 1.1.9 2 2 2h12v-2H7.42c-.14 0-.25-.11-.25-.25l.03-.12.9-1.63h7.45c.75 0 1.41-.41 1.75-1.03l3.58-6.49c.08-.14.12-.31.12-.48 0-.55-.45-1-1-1H5.21l-.94-2H1zm16 16c-1.1 0-1.99.9-1.99 2s.89 2 1.99 2 2-.9 2-2-.9-2-2-2z"/></svg>
            <span class="unified-nav-cart-badge" id="unifiedNavCartBadge" style="display:none;">0</span>
          </a>

          <a href="${CONFIG.phoneHref}" class="unified-nav-mobile-phone" aria-label="Call us">
            <svg viewBox="0 0 24 24"><path d="M20.01 15.38c-1.23 0-2.42-.2-3.53-.56a.977.977 0 00-1.01.24l-1.57 1.97c-2.83-1.35-5.48-3.9-6.89-6.83l1.95-1.66c.27-.28.35-.67.24-1.02-.37-1.11-.56-2.3-.56-3.53 0-.54-.45-.99-.99-.99H5.03C3.65 3 3 3.24 3 3.99 3 13.28 10.73 21 20.01 21c.71 0 .99-.63.99-1.18v-3.45c0-.54-.45-.99-.99-.99z"/></svg>
          </a>

          <button class="unified-nav-toggle" id="unifiedNavToggle" aria-label="Open menu">
            <span></span>
            <span></span>
            <span></span>
          </button>
        </div>

        <!-- Bottom Bar (Desktop Categories) -->
        <div class="unified-nav-bottom">
          <ul class="unified-nav-links">
            ${createNavLinks()}
          </ul>
        </div>

        <!-- Mobile Overlay -->
        <div class="unified-nav-overlay" id="unifiedNavOverlay"></div>

        <!-- Mobile Drawer -->
        <div class="unified-nav-drawer" id="unifiedNavDrawer">
          <div class="unified-nav-drawer-header">
            <span class="unified-nav-drawer-title">Menu</span>
            <button class="unified-nav-drawer-close" id="unifiedNavClose" aria-label="Close menu"></button>
          </div>
          <div class="unified-nav-drawer-search">
            <input type="text" placeholder="Search..." id="unifiedNavDrawerSearch">
          </div>
          <div class="unified-nav-drawer-links">
            ${createDrawerLinks()}
          </div>
          <div class="unified-nav-drawer-footer">
            <a href="/get-a-free-estimate" class="unified-nav-drawer-cta">Get Free Estimate</a>
            <a href="${CONFIG.phoneHref}" class="unified-nav-drawer-phone">
              <svg viewBox="0 0 24 24"><path d="M20.01 15.38c-1.23 0-2.42-.2-3.53-.56a.977.977 0 00-1.01.24l-1.57 1.97c-2.83-1.35-5.48-3.9-6.89-6.83l1.95-1.66c.27-.28.35-.67.24-1.02-.37-1.11-.56-2.3-.56-3.53 0-.54-.45-.99-.99-.99H5.03C3.65 3 3 3.24 3 3.99 3 13.28 10.73 21 20.01 21c.71 0 .99-.63.99-1.18v-3.45c0-.54-.45-.99-.99-.99z"/></svg>
              ${CONFIG.phone}
            </a>
          </div>
        </div>
      </nav>
    `;
  }

  // Search handler
  function handleSearch(query) {
    if (query && query.trim()) {
      window.location.href = '/search?q=' + encodeURIComponent(query.trim());
    }
  }

  // Remove old navigation elements from DOM
  function removeOldNavigation() {
    const selectorsToRemove = [
      'nav.navbar_wrapper',
      '.navbar_wrapper',
      '.navbar_component',
      '.navbar-banner_component',
      '.w-nav',
      '.w-nav-menu',
      '.w-nav-overlay',
      '.w-nav-button',
      '.navbar_menu-button',
      'header.header',
      '.header:not(.unified-nav *)',
      '.sg-header',
      '.sg-mobile-nav',
      '.sg-mobile-menu-overlay',
      '#sgMobileMenu',
      '.mobile-nav',
      '#mobileNav',
      '#sgMobileNav',
      '.mega-nav',
      '.nav-simple',
      '#webflowNav',
      '[data-nav-menu-open]'
    ];

    selectorsToRemove.forEach(selector => {
      try {
        document.querySelectorAll(selector).forEach(el => {
          // Don't remove our unified nav
          if (!el.classList.contains('unified-nav') && !el.closest('.unified-nav')) {
            el.remove();
          }
        });
      } catch (e) {}
    });

    // Also forcefully close any open Webflow nav overlays
    document.querySelectorAll('.w--open, [data-nav-menu-open]').forEach(el => {
      el.classList.remove('w--open');
      el.removeAttribute('data-nav-menu-open');
    });

    console.log('Old navigation elements removed');
  }

  // Intercept Webflow hamburger button clicks and redirect to unified nav
  function interceptWebflowHamburger() {
    document.addEventListener('click', function(e) {
      const hamburger = e.target.closest('.navbar_menu-button, .w-nav-button, .menu-icon, [data-w-id]');
      if (hamburger && !hamburger.closest('.unified-nav')) {
        e.preventDefault();
        e.stopPropagation();
        // Open unified nav instead
        const toggle = document.getElementById('unifiedNavToggle');
        if (toggle) toggle.click();
      }
    }, true);
  }

  // Initialize navigation
  function init() {
    // Remove old navigation first
    removeOldNavigation();

    // Intercept Webflow hamburger clicks
    interceptWebflowHamburger();

    // Add body class for padding
    document.body.classList.add('unified-nav-active');

    // Insert navigation HTML
    document.body.insertAdjacentHTML('afterbegin', createNavHTML());

    // Get elements
    const toggle = document.getElementById('unifiedNavToggle');
    const close = document.getElementById('unifiedNavClose');
    const drawer = document.getElementById('unifiedNavDrawer');
    const overlay = document.getElementById('unifiedNavOverlay');
    const searchInput = document.getElementById('unifiedNavSearch');
    const searchBtn = document.getElementById('unifiedNavSearchBtn');
    const drawerSearch = document.getElementById('unifiedNavDrawerSearch');

    // Open drawer
    function openDrawer() {
      toggle.classList.add('is-open');
      drawer.classList.add('is-open');
      overlay.classList.add('is-visible');
      document.body.style.overflow = 'hidden';
    }

    // Close drawer
    function closeDrawer() {
      toggle.classList.remove('is-open');
      drawer.classList.remove('is-open');
      overlay.classList.remove('is-visible');
      document.body.style.overflow = '';
    }

    // Event listeners
    toggle?.addEventListener('click', openDrawer);
    close?.addEventListener('click', closeDrawer);
    overlay?.addEventListener('click', closeDrawer);

    // Close on escape key
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape' && drawer.classList.contains('is-open')) {
        closeDrawer();
      }
    });

    // Close drawer on link click
    document.querySelectorAll('.unified-nav-drawer-item, .unified-nav-drawer-cta').forEach(el => {
      el.addEventListener('click', closeDrawer);
    });

    // Desktop search
    searchBtn?.addEventListener('click', () => handleSearch(searchInput?.value));
    searchInput?.addEventListener('keypress', e => {
      if (e.key === 'Enter') handleSearch(searchInput.value);
    });

    // Mobile search
    drawerSearch?.addEventListener('keypress', e => {
      if (e.key === 'Enter') {
        handleSearch(drawerSearch.value);
        closeDrawer();
      }
    });

    // Update cart badge
    updateCartBadge();

    // Listen for cart updates
    window.addEventListener('storage', updateCartBadge);
    window.addEventListener('cartUpdated', updateCartBadge);

    console.log('Unified Navigation initialized');
  }

  // Update cart badge count
  function updateCartBadge() {
    const badge = document.getElementById('unifiedNavCartBadge');
    if (!badge) return;

    let count = 0;

    // Try Shopyflow cart
    if (window.ShopyflowCart && window.ShopyflowCart.getCart) {
      try {
        const cart = window.ShopyflowCart.getCart();
        count = cart?.items?.reduce((sum, item) => sum + (item.quantity || 0), 0) || 0;
      } catch (e) {}
    }

    // Fallback to localStorage
    if (count === 0) {
      try {
        const cartData = localStorage.getItem('sf-cart') || localStorage.getItem('cart');
        if (cartData) {
          const cart = JSON.parse(cartData);
          count = cart?.items?.reduce((sum, item) => sum + (item.quantity || 0), 0) || 0;
        }
      } catch (e) {}
    }

    if (count > 0) {
      badge.textContent = count > 99 ? '99+' : count;
      badge.style.display = 'flex';
    } else {
      badge.style.display = 'none';
    }
  }

  // Expose updateCartBadge globally
  window.updateUnifiedNavCartBadge = updateCartBadge;

  // ============ AUTH INTEGRATION ============

  // Update account link based on auth state
  function updateAuthUI() {
    const accountLink = document.getElementById('unifiedNavAccount');
    const accountText = document.getElementById('unifiedNavAccountText');
    const accountAvatar = document.getElementById('unifiedNavAvatar');

    if (!accountLink) return;

    // Check if SgAuth is available and user is logged in
    if (window.SgAuth && window.SgAuth.isLoggedIn()) {
      const user = window.SgAuth.getUser();
      const profile = window.SgAuth.getProfile();

      // Get display name
      const displayName = profile?.full_name?.split(' ')[0] ||
                         profile?.first_name ||
                         user?.user_metadata?.full_name?.split(' ')[0] ||
                         user?.email?.split('@')[0] ||
                         'Account';

      // Get initial for avatar
      const initial = displayName.charAt(0).toUpperCase();

      // Update UI
      accountLink.classList.add('logged-in');
      accountText.textContent = displayName;
      accountAvatar.innerHTML = `<span class="avatar-initial">${initial}</span>`;
      accountAvatar.classList.add('has-user');
      accountLink.title = user.email;

    } else {
      // Not logged in
      accountLink.classList.remove('logged-in');
      accountText.textContent = 'Account';
      accountAvatar.innerHTML = `<svg viewBox="0 0 24 24"><path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/></svg>`;
      accountAvatar.classList.remove('has-user');
      accountLink.removeAttribute('title');
    }
  }

  // Listen for auth changes
  function initAuthListener() {
    // Check for SgAuth after a short delay (to allow it to initialize)
    const checkAuth = () => {
      if (window.SgAuth) {
        window.SgAuth.onAuthChange((event, data) => {
          console.log('Unified Nav: Auth event', event);
          updateAuthUI();
        });
        updateAuthUI();
      } else {
        // Retry
        setTimeout(checkAuth, 200);
      }
    };

    // Start checking after init
    setTimeout(checkAuth, 100);

    // Also listen for custom auth change event
    window.addEventListener('sg-auth-change', updateAuthUI);
  }

  // Expose functions globally
  window.updateUnifiedNavAuthUI = updateAuthUI;

  // Run on DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      init();
      initAuthListener();
    });
  } else {
    init();
    initAuthListener();
  }

  // Run cleanup again after delays to catch dynamically loaded navbars
  setTimeout(removeOldNavigation, 500);
  setTimeout(removeOldNavigation, 1500);
  setTimeout(removeOldNavigation, 3000);

  // Also clean up on any DOM changes
  const cleanupObserver = new MutationObserver(() => {
    removeOldNavigation();
  });

  // Start observing after DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      cleanupObserver.observe(document.body, { childList: true, subtree: false });
    });
  } else {
    cleanupObserver.observe(document.body, { childList: true, subtree: false });
  }
})();
