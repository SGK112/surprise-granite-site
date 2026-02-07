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
      authScript.src = '/js/sg-auth.js?v=20260205a';
      authScript.async = true;
      document.head.appendChild(authScript);
    }
  }

  // Load site search script
  function loadSiteSearch() {
    if (!window.SiteSearch && !document.querySelector('script[src*="site-search.js"]')) {
      const searchScript = document.createElement('script');
      searchScript.src = '/js/site-search.js?v=20260202';
      searchScript.async = true;
      document.head.appendChild(searchScript);
    }
  }

  // Load analytics (GA4)
  function loadAnalytics() {
    if (!window._sgAnalyticsInitialized && !document.querySelector('script[src*="analytics.js"]')) {
      // Load config first if not present
      if (!window.SG_CONFIG && !document.querySelector('script[src*="config.js"]')) {
        const configScript = document.createElement('script');
        configScript.src = '/js/config.js';
        document.head.appendChild(configScript);
      }
      // Load analytics
      const analyticsScript = document.createElement('script');
      analyticsScript.src = '/js/analytics.js?v=20260206';
      analyticsScript.async = true;
      document.head.appendChild(analyticsScript);
    }
  }

  // Load auth dependencies immediately
  loadAuthDependencies();

  // Load site search
  loadSiteSearch();

  // Load analytics
  loadAnalytics();

  // Configuration
  const CONFIG = {
    logo: 'https://cdn.prod.website-files.com/6456ce4476abb25581fbad0c/6456ce4476abb27beffbb16a_Surprise%20Granite%20Transparent%20Dark%20Wide.svg',
    phone: '(602) 833-3189',
    phoneHref: 'tel:+16028333189',
    tagline: 'Marble & Quartz'
  };

  // Menu items - Consolidated minimal nav
  const MENU_ITEMS = [
    { label: 'Materials', href: '/materials/all-countertops', hasMenu: true, menuType: 'materials' },
    { label: 'Marketplace', href: '/marketplace/', hasMenu: true, isMarketplace: true },
    { label: 'Stone Yards', href: '/stone-yards/', isStoneYards: true },
    { label: 'Services', href: '/services/home/kitchen-remodeling-arizona', hasMenu: true },
    { label: 'Contact', href: '/contact-us' },
    { label: 'Book Estimate', href: '/get-a-free-estimate', isBook: true }
  ];

  // Mobile menu - simplified with collapsible categories
  const MOBILE_MENU_CATEGORIES = [
    {
      label: 'Materials',
      icon: '<svg viewBox="0 0 24 24"><path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16H5V5h14v14z"/></svg>',
      items: [
        { label: 'All Countertops', href: '/materials/all-countertops' },
        { label: 'Quartz', href: '/materials/countertops/quartz-countertops' },
        { label: 'Granite', href: '/materials/countertops/granite-countertops' },
        { label: 'Marble', href: '/materials/countertops/marble-countertops' },
        { label: 'Tile & Backsplash', href: '/materials/all-tile' },
        { label: 'LVP Flooring', href: '/materials/flooring' }
      ]
    },
    {
      label: 'Marketplace',
      icon: '<svg viewBox="0 0 24 24"><path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zM9 17H7v-7h2v7zm4 0h-2V7h2v10zm4 0h-2v-4h2v4z"/></svg>',
      isHighlighted: true,
      items: [
        { label: 'Browse Slabs', href: '/marketplace/slabs/' },
        { label: 'Tile', href: '/marketplace/tile/' },
        { label: 'Flooring', href: '/marketplace/flooring/' },
        { label: 'Sinks', href: '/marketplace/sinks/' },
        { label: 'Faucets', href: '/marketplace/faucets/' },
        { label: 'Remnants', href: '/marketplace/remnants/' }
      ]
    },
    {
      label: 'Stone Yards',
      icon: '<svg viewBox="0 0 24 24"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>',
      isStoneYards: true,
      items: [
        { label: 'Find Stone Yards', href: '/stone-yards/' },
        { label: 'Arizona Tile', href: '/stone-yards/arizona-tile/' },
        { label: 'MSI Surfaces', href: '/stone-yards/msi/' }
      ]
    },
    {
      label: 'Services',
      icon: '<svg viewBox="0 0 24 24"><path d="M22.7 19l-9.1-9.1c.9-2.3.4-5-1.5-6.9-2-2-5-2.4-7.4-1.3L9 6 6 9 1.6 4.7C.4 7.1.9 10.1 2.9 12.1c1.9 1.9 4.6 2.4 6.9 1.5l9.1 9.1c.4.4 1 .4 1.4 0l2.3-2.3c.5-.4.5-1.1.1-1.4z"/></svg>',
      items: [
        { label: 'Kitchen Remodeling', href: '/services/home/kitchen-remodeling-arizona' },
        { label: 'Bathroom Remodeling', href: '/services/home/bathroom-remodeling-arizona' },
        { label: 'Countertop Installation', href: '/services/countertop-installation/' },
        { label: 'Repair & Sink Replacement', href: '/services/countertop-polish-repair/' },
        { label: 'Financing Options', href: '/services/home-remodeling-financing-options-in-arizona' },
        { label: 'Project Gallery', href: '/company/project-gallery' },
        { label: 'Contact Us', href: '/contact-us' }
      ]
    }
  ];

  // Quick action items (always visible at top)
  const MOBILE_QUICK_ACTIONS = [
    { label: 'Stone Yards', href: '/stone-yards/', isStoneYards: true },
    { label: 'Book Estimate', href: '/book/', isBook: true }
  ];

  // Legacy flat menu for backwards compatibility
  const MOBILE_MENU_ITEMS = [
    { label: 'Home', href: '/' },
    { label: 'Countertops', href: '/materials/all-countertops' },
    { label: 'Tile', href: '/materials/all-tile' },
    { label: 'Flooring', href: '/materials/flooring' },
    { label: 'Kitchen Remodeling', href: '/services/home/kitchen-remodeling-arizona' },
    { label: 'Bathroom Remodeling', href: '/services/home/bathroom-remodeling-arizona' },
    { label: 'Shop', href: '/shop' },
    { label: 'Gallery', href: '/company/project-gallery' },
    { label: 'Contact', href: '/contact-us' },
    { label: 'My Account', href: '/account' },
    { label: 'Book Free Estimate', href: '/book/', isBook: true }
  ];

  // Product data for mega menus
  const PRODUCTS = {
    materials: [
      { name: 'Quartz Countertops', desc: 'Premium engineered stone', href: '/materials/countertops/quartz-countertops', img: 'https://cdn.prod.website-files.com/6456ce4476abb2d4f9fbad10/6456ce4576abb21a6cfbc44d_Msi-surfaces-surprise-quartz-calacatta-abezzo-quartz-slab.avif' },
      { name: 'Granite Countertops', desc: 'Natural stone beauty', href: '/materials/countertops/granite-countertops', img: 'https://cdn.prod.website-files.com/6456ce4476abb2d4f9fbad10/6456ce4476abb22cfafbb7e4_msi-surfaces-surprise-granite-new-river-close-up.avif' },
      { name: 'Marble Countertops', desc: 'Timeless elegance', href: '/materials/countertops/marble-countertops', img: 'https://uploads-ssl.webflow.com/6456ce4476abb2d4f9fbad10/6456ce4576abb2b48efbbd7f_msi-surfaces-sruprise-granite-absolute-white-marble-close%20up.jpg' },
      { name: 'Tile & Backsplash', desc: 'Porcelain, ceramic, mosaic', href: '/materials/all-tile', img: '/images/tiles/adella-viso-calacatta-ceramic-marble-tile.webp' },
      { name: 'LVP Flooring', desc: 'Waterproof vinyl plank', href: '/materials/flooring', img: 'https://cdn.prod.website-files.com/6456ce4476abb2d4f9fbad10/6456ce4576abb27db9fbccd8_msi-surfaces-surprise-granite-xl-trecento-white-ocean-luxury-vinyl-tile-close-up.avif' },
      { name: 'All Countertops', desc: 'Browse all materials', href: '/materials/all-countertops', img: 'https://uploads-ssl.webflow.com/6456ce4476abb2d4f9fbad10/6456ce4576abb22a2ffbc326_dekton-surprise-granite-arga-quartz-close-up.jpeg' }
    ],
    services: [
      { name: 'Kitchen Remodeling', desc: 'Complete renovations', href: '/services/home/kitchen-remodeling-arizona', img: 'https://cdn.prod.website-files.com/6456ce4476abb2d4f9fbad10/65dfb7f28b5c4c03249bf4db_69647337_157661692014463_2667270912306059733_n-96da2b9c2f6e427a8fc021d5a5382031.jpg' },
      { name: 'Bathroom Remodeling', desc: 'Modern upgrades', href: '/services/home/bathroom-remodeling-arizona', img: 'https://cdn.prod.website-files.com/6456ce4476abb2d4f9fbad10/6531e4b87153315974bccb0a_tub-to-shower-conversions-az_thumb.avif' },
      { name: 'Countertop Install', desc: 'Professional installation', href: '/services/countertop-installation/', img: 'https://cdn.prod.website-files.com/6456ce4476abb2d4f9fbad10/651c69d8e6c77c995d99b4d7_arizona-countertop-installation-service_thumbnail.avif' },
      { name: 'Repair & Sink Replacement', desc: 'Polish, repair, restore', href: '/services/countertop-polish-repair/', img: 'https://cdn.prod.website-files.com/6456ce4476abb2d4f9fbad10/651c6dd1826b3168b6915efc_countertop-polish-and-repair-service_thumb.avif' },
      { name: 'Financing', desc: 'Easy payment options', href: '/services/home-remodeling-financing-options-in-arizona', img: 'https://cdn.prod.website-files.com/6456ce4476abb2d4f9fbad10/652324e7840a341086726be1_sink-installation-service-arizona-2.avif' }
    ],
    marketplace: [
      { name: 'Browse Slabs', desc: 'Granite, quartz, marble', href: '/marketplace/slabs/', img: 'https://cdn.prod.website-files.com/6456ce4476abb2d4f9fbad10/6456ce4576abb21a6cfbc44d_Msi-surfaces-surprise-quartz-calacatta-abezzo-quartz-slab.avif' },
      { name: 'Tile', desc: 'Porcelain, ceramic, mosaic', href: '/marketplace/tile/', img: 'https://cdn.prod.website-files.com/6456ce4476abb2d4f9fbad10/64f6d0f0ecc300110deac147_adella-calacatta-close-up.avif' },
      { name: 'Flooring', desc: 'LVP, hardwood, laminate', href: '/marketplace/flooring/', img: 'https://cdn.prod.website-files.com/6456ce4476abb2d4f9fbad10/6456ce4576abb20d58fbc941_msi-surfaces-surprise-granite-abingdale-luxury-vinyl-planks-close-up.jpeg' },
      { name: 'Sinks', desc: 'Kitchen & bathroom sinks', href: '/marketplace/sinks/', img: 'https://cdn.shopify.com/s/files/1/0555/4244/8263/products/Undermountsink18G50-50-3118.jpg' },
      { name: 'Faucets', desc: 'Kitchen & bath faucets', href: '/marketplace/faucets/', img: 'https://cdn.shopify.com/s/files/1/0555/4244/8263/products/KKF2015BG-1-1.jpg' },
      { name: 'Remnants', desc: 'Discounted pieces', href: '/marketplace/remnants/', img: 'https://cdn.prod.website-files.com/6456ce4476abb2d4f9fbad10/6456ce4476abb22cfafbb7e4_msi-surfaces-surprise-granite-new-river-close-up.avif' }
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
      let linkClass = '';
      if (item.isPro) linkClass = ' class="unified-nav-pro-link"';
      else if (item.isQuiz) linkClass = ' class="unified-nav-quiz-link"';
      else if (item.isBook) linkClass = ' class="unified-nav-book-link"';
      else if (item.isStoneYards) linkClass = ' class="unified-nav-stoneyards-link"';
      else if (item.isMarketplace) linkClass = ' class="unified-nav-marketplace-link"';

      return `
        <li>
          <a href="${item.href}"${linkClass}>${item.label}${arrow}</a>
          ${megaMenu}
        </li>
      `;
    }).join('');
  }

  // Create mobile drawer links - now with collapsible categories
  function createDrawerLinks() {
    // Quick actions at top
    let html = '<div class="unified-nav-drawer-quick">';
    html += `<a href="/" class="unified-nav-drawer-home">
      <svg viewBox="0 0 24 24"><path d="M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z"/></svg>
      <span>Home</span>
    </a>`;
    MOBILE_QUICK_ACTIONS.forEach(item => {
      let extraClass = item.isBook ? ' unified-nav-drawer-book' : '';
      html += `<a href="${item.href}" class="unified-nav-drawer-quick-item${extraClass}">
        <span>${item.label}</span>
      </a>`;
    });
    html += '</div>';

    // Categorized sections
    html += '<div class="unified-nav-drawer-categories">';
    MOBILE_MENU_CATEGORIES.forEach((cat, idx) => {
      const isExpanded = idx === 0 ? ' expanded' : '';
      html += `
        <div class="unified-nav-drawer-category${isExpanded}" data-category="${cat.label.toLowerCase()}">
          <button class="unified-nav-drawer-category-header">
            <span class="unified-nav-drawer-category-icon">${cat.icon}</span>
            <span class="unified-nav-drawer-category-label">${cat.label}</span>
            <svg class="unified-nav-drawer-category-arrow" viewBox="0 0 24 24"><path d="M7 10l5 5 5-5z"/></svg>
          </button>
          <div class="unified-nav-drawer-category-items">
            ${cat.items.map(item => `
              <a href="${item.href}" class="unified-nav-drawer-item">
                <span>${item.label}</span>
                <svg viewBox="0 0 24 24"><path d="M8.59 16.59L13.17 12 8.59 7.41 10 6l6 6-6 6-1.41-1.41z"/></svg>
              </a>
            `).join('')}
          </div>
        </div>
      `;
    });
    html += '</div>';

    return html;
  }

  // Legacy flat drawer links (fallback)
  function createDrawerLinksFlat() {
    return MOBILE_MENU_ITEMS.map(item => {
      let extraClass = '';
      if (item.isPro) extraClass = ' unified-nav-drawer-pro';
      else if (item.isQuiz) extraClass = ' unified-nav-drawer-quiz';
      else if (item.isBook) extraClass = ' unified-nav-drawer-book';
      return `
        <a href="${item.href}" class="unified-nav-drawer-item${extraClass}">
          <span>${item.label}</span>
          <svg viewBox="0 0 24 24"><path d="M8.59 16.59L13.17 12 8.59 7.41 10 6l6 6-6 6-1.41-1.41z"/></svg>
        </a>
      `;
    }).join('');
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
            <input type="text" placeholder="Search products, services, blog..." id="unifiedNavSearch" readonly>
            <button type="button" id="unifiedNavSearchBtn" aria-label="Search">
              <svg viewBox="0 0 24 24"><path d="M15.5 14h-.79l-.28-.27C15.41 12.59 16 11.11 16 9.5 16 5.91 13.09 3 9.5 3S3 5.91 3 9.5 5.91 16 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"/></svg>
            </button>
          </div>

          <div class="unified-nav-actions">
            <a href="/cart/" class="unified-nav-cart-link">
              <svg viewBox="0 0 24 24"><path d="M7 18c-1.1 0-1.99.9-1.99 2S5.9 22 7 22s2-.9 2-2-.9-2-2-2zM1 2v2h2l3.6 7.59-1.35 2.45c-.16.28-.25.61-.25.96 0 1.1.9 2 2 2h12v-2H7.42c-.14 0-.25-.11-.25-.25l.03-.12.9-1.63h7.45c.75 0 1.41-.41 1.75-1.03l3.58-6.49c.08-.14.12-.31.12-.48 0-.55-.45-1-1-1H5.21l-.94-2H1zm16 16c-1.1 0-1.99.9-1.99 2s.89 2 1.99 2 2-.9 2-2-.9-2-2-2z"/></svg>
              Cart
              <span class="unified-nav-cart-badge-desktop" id="unifiedNavCartBadgeDesktop" style="display:none;">0</span>
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
            <input type="text" placeholder="Tap to search..." id="unifiedNavDrawerSearch" readonly>
          </div>
          <div class="unified-nav-drawer-links">
            ${createDrawerLinks()}
          </div>
          <div class="unified-nav-drawer-footer">
            <a href="/get-a-free-estimate" class="unified-nav-drawer-cta">Get Free Estimate</a>
            <div class="unified-nav-drawer-footer-row">
              <a href="/account" class="unified-nav-drawer-account" id="unifiedNavDrawerAccount">
                <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" style="width:18px;height:18px;flex-shrink:0"><path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/></svg>
                <span id="unifiedNavDrawerAccountText">Log In / Sign Up</span>
              </a>
              <a href="${CONFIG.phoneHref}" class="unified-nav-drawer-phone">
                <svg viewBox="0 0 24 24"><path d="M20.01 15.38c-1.23 0-2.42-.2-3.53-.56a.977.977 0 00-1.01.24l-1.57 1.97c-2.83-1.35-5.48-3.9-6.89-6.83l1.95-1.66c.27-.28.35-.67.24-1.02-.37-1.11-.56-2.3-.56-3.53 0-.54-.45-.99-.99-.99H5.03C3.65 3 3 3.24 3 3.99 3 13.28 10.73 21 20.01 21c.71 0 .99-.63.99-1.18v-3.45c0-.54-.45-.99-.99-.99z"/></svg>
                ${CONFIG.phone}
              </a>
            </div>
          </div>
        </div>
      </nav>
    `;
  }

  // Search handler - opens site search modal or falls back to search page
  function handleSearch(query) {
    // Try to use the site search modal first
    if (window.SiteSearch && typeof window.SiteSearch.open === 'function') {
      window.SiteSearch.open();
      // Pre-fill search query if provided
      if (query && query.trim()) {
        setTimeout(() => {
          const searchInput = document.getElementById('siteSearchInput');
          if (searchInput) {
            searchInput.value = query.trim();
            searchInput.dispatchEvent(new Event('input', { bubbles: true }));
          }
        }, 100);
      }
    } else if (query && query.trim()) {
      // Fallback to search page if SiteSearch not available
      window.location.href = '/search?q=' + encodeURIComponent(query.trim());
    }
  }

  // Open site search modal directly
  function openSiteSearch() {
    if (window.SiteSearch && typeof window.SiteSearch.open === 'function') {
      window.SiteSearch.open();
    } else {
      // Fallback - try to load site-search.js dynamically
      if (!document.querySelector('script[src*="site-search.js"]')) {
        const script = document.createElement('script');
        script.src = '/js/site-search.js?v=20260202';
        script.onload = () => {
          setTimeout(() => {
            if (window.SiteSearch && typeof window.SiteSearch.open === 'function') {
              window.SiteSearch.open();
            }
          }, 100);
        };
        document.head.appendChild(script);
      }
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
      '.navbar_menu',
      'nav.navbar_menu',
      'nav[role="navigation"].navbar_menu',
      'nav[role="navigation"].w-nav-menu',
      'header.header',
      '.header:not(.unified-nav *)',
      '.sg-header',
      '.sg-header-banner',
      '.sg-header-main',
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
    // Use capture phase to intercept before other handlers
    document.addEventListener('click', function(e) {
      // Only intercept actual hamburger/menu buttons, not general data-w-id elements
      const hamburger = e.target.closest('.navbar_menu-button, .w-nav-button, .menu-icon, .hamburger-menu, .sg-mobile-trigger, [data-menu-toggle]');
      if (hamburger && !hamburger.closest('.unified-nav') && !hamburger.closest('.filters_filters-wrapper')) {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        // Open unified nav instead
        const toggle = document.getElementById('unifiedNavToggle');
        if (toggle) {
          const drawer = document.getElementById('unifiedNavDrawer');
          const overlay = document.getElementById('unifiedNavOverlay');
          toggle.classList.add('is-open');
          if (drawer) drawer.classList.add('is-open');
          if (overlay) overlay.classList.add('is-visible');
          document.body.style.overflow = 'hidden';
        }
        return false;
      }
    }, true);

    // Also intercept on the navbar_menu-button directly
    setTimeout(() => {
      document.querySelectorAll('.navbar_menu-button, .w-nav-button').forEach(btn => {
        if (!btn.closest('.unified-nav')) {
          btn.onclick = function(e) {
            e.preventDefault();
            e.stopPropagation();
            window.openSgMobileMenu && window.openSgMobileMenu();
            return false;
          };
        }
      });
    }, 100);
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
      // Reset any inline styles from swipe gesture
      drawer.style.transform = '';
      drawer.style.transition = '';
      overlay.style.opacity = '';
      overlay.style.transition = '';
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

    // Close drawer on link click (but not on CTA - that opens SwipeForm)
    document.querySelectorAll('.unified-nav-drawer-item').forEach(el => {
      el.addEventListener('click', closeDrawer);
    });

    // CTA button opens SwipeForm instead of navigating
    const ctaBtn = document.querySelector('.unified-nav-drawer-cta');
    if (ctaBtn) {
      ctaBtn.addEventListener('click', function(e) {
        e.preventDefault();
        closeDrawer();
        // Open SwipeForm after drawer closes
        setTimeout(() => {
          if (window.SwipeForm && window.SwipeForm.open) {
            window.SwipeForm.open();
          } else {
            // Fallback to navigation if SwipeForm not loaded
            window.location.href = '/get-a-free-estimate';
          }
        }, 150);
      });
    }

    // ============ SWIPE TO CLOSE GESTURE ============
    let touchStartX = 0;
    let touchStartY = 0;
    let touchCurrentX = 0;
    let isDragging = false;
    const SWIPE_THRESHOLD = 50; // Minimum pixels to trigger close
    const SWIPE_VELOCITY_THRESHOLD = 0.3; // Minimum velocity to trigger close
    let touchStartTime = 0;

    function handleTouchStart(e) {
      if (!drawer.classList.contains('is-open')) return;

      const touch = e.touches[0];
      touchStartX = touch.clientX;
      touchStartY = touch.clientY;
      touchCurrentX = touch.clientX;
      touchStartTime = Date.now();
      isDragging = false;

      // Disable transition during drag for smooth feel
      drawer.style.transition = 'none';
    }

    function handleTouchMove(e) {
      if (!drawer.classList.contains('is-open')) return;

      const touch = e.touches[0];
      const deltaX = touch.clientX - touchStartX;
      const deltaY = touch.clientY - touchStartY;

      // Only trigger swipe if horizontal movement is greater than vertical
      if (Math.abs(deltaX) > Math.abs(deltaY) && deltaX < 0) {
        isDragging = true;
        touchCurrentX = touch.clientX;

        // Move drawer with touch (only allow dragging left/closed)
        const translateX = Math.min(0, deltaX);
        drawer.style.transform = `translateX(${translateX}px)`;

        // Fade overlay based on drag position
        const drawerWidth = drawer.offsetWidth;
        const progress = Math.abs(translateX) / drawerWidth;
        overlay.style.opacity = 1 - progress;

        // Prevent scrolling while swiping
        e.preventDefault();
      }
    }

    function handleTouchEnd(e) {
      if (!drawer.classList.contains('is-open') || !isDragging) {
        drawer.style.transition = '';
        return;
      }

      const deltaX = touchCurrentX - touchStartX;
      const deltaTime = Date.now() - touchStartTime;
      const velocity = Math.abs(deltaX) / deltaTime;

      // Re-enable transition
      drawer.style.transition = '';
      overlay.style.transition = '';

      // Close if swiped far enough or fast enough
      if (deltaX < -SWIPE_THRESHOLD || (velocity > SWIPE_VELOCITY_THRESHOLD && deltaX < -20)) {
        closeDrawer();
      } else {
        // Snap back to open position
        drawer.style.transform = 'translateX(0)';
        overlay.style.opacity = '1';
      }

      isDragging = false;
    }

    // Add touch listeners to drawer
    drawer?.addEventListener('touchstart', handleTouchStart, { passive: true });
    drawer?.addEventListener('touchmove', handleTouchMove, { passive: false });
    drawer?.addEventListener('touchend', handleTouchEnd, { passive: true });

    // Desktop search - open modal on click/focus
    searchBtn?.addEventListener('click', () => openSiteSearch());
    searchInput?.addEventListener('focus', () => openSiteSearch());
    searchInput?.addEventListener('click', (e) => {
      e.preventDefault();
      openSiteSearch();
    });
    searchInput?.addEventListener('keypress', e => {
      if (e.key === 'Enter') {
        e.preventDefault();
        handleSearch(searchInput.value);
      }
    });

    // Mobile search - open modal on focus/click
    drawerSearch?.addEventListener('focus', () => {
      closeDrawer();
      setTimeout(() => openSiteSearch(), 150);
    });
    drawerSearch?.addEventListener('click', (e) => {
      e.preventDefault();
      closeDrawer();
      setTimeout(() => openSiteSearch(), 150);
    });
    drawerSearch?.addEventListener('keypress', e => {
      if (e.key === 'Enter') {
        e.preventDefault();
        handleSearch(drawerSearch.value);
        closeDrawer();
      }
    });

    // ===== CATEGORIZED MENU TOGGLE =====
    // Set up category accordion behavior
    document.querySelectorAll('.unified-nav-drawer-category-header').forEach(header => {
      header.addEventListener('click', function(e) {
        e.preventDefault();
        const category = this.closest('.unified-nav-drawer-category');
        if (category) {
          // Close other categories (accordion behavior)
          document.querySelectorAll('.unified-nav-drawer-category.expanded').forEach(cat => {
            if (cat !== category) cat.classList.remove('expanded');
          });
          // Toggle this category
          category.classList.toggle('expanded');
        }
      });
    });

    // Close drawer when clicking category items
    document.querySelectorAll('.unified-nav-drawer-category-items .unified-nav-drawer-item').forEach(item => {
      item.addEventListener('click', () => {
        setTimeout(closeDrawer, 100);
      });
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
    const drawerAccountLink = document.getElementById('unifiedNavDrawerAccount');
    const drawerAccountText = document.getElementById('unifiedNavDrawerAccountText');

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

      // Update desktop UI
      if (accountLink) {
        accountLink.classList.add('logged-in');
        accountLink.title = user.email;
      }
      if (accountText) accountText.textContent = displayName;
      if (accountAvatar) {
        accountAvatar.innerHTML = `<span class="avatar-initial">${initial}</span>`;
        accountAvatar.classList.add('has-user');
      }

      // Update mobile drawer UI
      if (drawerAccountLink) drawerAccountLink.classList.add('logged-in');
      if (drawerAccountText) drawerAccountText.textContent = `Hi, ${displayName}`;

    } else {
      // Not logged in - desktop
      if (accountLink) {
        accountLink.classList.remove('logged-in');
        accountLink.removeAttribute('title');
      }
      if (accountText) accountText.textContent = 'Account';
      if (accountAvatar) {
        accountAvatar.innerHTML = `<svg viewBox="0 0 24 24"><path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/></svg>`;
        accountAvatar.classList.remove('has-user');
      }

      // Not logged in - mobile drawer
      if (drawerAccountLink) drawerAccountLink.classList.remove('logged-in');
      if (drawerAccountText) drawerAccountText.textContent = 'Log In / Sign Up';
    }
  }

  // Listen for auth changes
  function initAuthListener() {
    // Check for SgAuth after a short delay (to allow it to initialize)
    const checkAuth = () => {
      if (window.SgAuth) {
        window.SgAuth.onAuthChange((event, data) => {
          updateAuthUI();
        });
        updateAuthUI();
      } else {
        // Retry after 200ms, max ~10 seconds
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

  // Override any custom mobile menu functions that might exist on the page
  function overrideCustomMenus() {
    // Override openSgMobileMenu to open unified nav instead
    window.openSgMobileMenu = function() {
      const toggle = document.getElementById('unifiedNavToggle');
      if (toggle) toggle.click();
    };

    // Override closeSgMobileMenu
    window.closeSgMobileMenu = function() {
      const drawer = document.getElementById('unifiedNavDrawer');
      const toggle = document.getElementById('unifiedNavToggle');
      const overlay = document.getElementById('unifiedNavOverlay');
      if (drawer) drawer.classList.remove('is-open');
      if (toggle) toggle.classList.remove('is-open');
      if (overlay) overlay.classList.remove('is-visible');
      document.body.style.overflow = '';
    };

    // Remove the old sgMobileMenu element completely
    const oldMenu = document.getElementById('sgMobileMenu');
    if (oldMenu) oldMenu.remove();
  }

  // Run on DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      init();
      initAuthListener();
      overrideCustomMenus();
    });
  } else {
    init();
    initAuthListener();
    overrideCustomMenus();
  }

  // Run cleanup once after a delay to catch dynamically loaded navbars
  setTimeout(removeOldNavigation, 500);

  // Override custom menus after a short delay
  setTimeout(overrideCustomMenus, 200);

  // Force close and remove Webflow nav menu completely
  function forceCloseWebflowNav() {
    // Completely remove Webflow nav menu elements from DOM
    const webflowMenuSelectors = [
      'nav.navbar_menu.w-nav-menu',
      'nav[role="navigation"].navbar_menu',
      'nav[role="navigation"].w-nav-menu',
      '.navbar_menu.w-nav-menu',
      '.w-nav-overlay'
    ];

    webflowMenuSelectors.forEach(selector => {
      document.querySelectorAll(selector).forEach(el => {
        // Don't remove if it's part of our unified nav
        if (!el.closest('.unified-nav')) {
          el.remove();
        }
      });
    });

    // Remove w--open class from any remaining elements
    document.querySelectorAll('.w--open').forEach(el => {
      if (!el.closest('.unified-nav')) {
        el.classList.remove('w--open');
        el.style.cssText = 'display:none!important;visibility:hidden!important;height:0!important;width:0!important;position:absolute!important;left:-9999px!important;';
      }
    });

    // Remove body class that Webflow adds
    document.body.classList.remove('w--nav-menu-open');

    // Remove any data attributes Webflow uses
    document.querySelectorAll('[data-nav-menu-open]').forEach(el => {
      el.removeAttribute('data-nav-menu-open');
    });
  }

  // Watch for Webflow trying to open its menu
  const webflowMenuObserver = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
      if (mutation.type === 'attributes' && mutation.attributeName === 'class') {
        const target = mutation.target;
        if (target.classList.contains('w--open') || target.classList.contains('w--nav-menu-open')) {
          // Webflow is trying to open its menu - close it immediately
          forceCloseWebflowNav();
        }
      }
    });
  });

  // Observe body and navbar elements for class changes
  setTimeout(() => {
    webflowMenuObserver.observe(document.body, { attributes: true, attributeFilter: ['class'] });
    document.querySelectorAll('.navbar_menu, .w-nav-menu, .w-nav-overlay').forEach(el => {
      webflowMenuObserver.observe(el, { attributes: true, attributeFilter: ['class'] });
    });
  }, 100);

  // Run force close on initial load only (no need for continuous interval)
  forceCloseWebflowNav();
  setTimeout(forceCloseWebflowNav, 100);
  setTimeout(forceCloseWebflowNav, 500);

  // Debounced cleanup on DOM changes (less aggressive than running on every mutation)
  let cleanupTimeout = null;
  const cleanupObserver = new MutationObserver(() => {
    if (cleanupTimeout) return;
    cleanupTimeout = setTimeout(() => {
      removeOldNavigation();
      forceCloseWebflowNav();
      cleanupTimeout = null;
    }, 100);
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
