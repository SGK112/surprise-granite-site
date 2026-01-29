/**
 * Mobile Navigation Component
 * iOS-style bottom tab bar with swipe gestures and slide-up drawer
 *
 * @requires Account dashboard with showPage() function
 */

(function() {
  'use strict';

  // Only initialize on mobile
  if (window.innerWidth > 768) return;

  // ============================================
  // CONFIGURATION
  // ============================================
  const CONFIG = {
    swipeThreshold: 50,
    swipeTimeLimit: 300,
    drawerDragThreshold: 100
  };

  // Role-based menu configuration
  const MENU_CONFIG = {
    // Primary tabs shown in bottom bar (max 5)
    primaryTabs: {
      all: ['dashboard', 'messages'],
      homeowner: ['dashboard', 'favorites', 'my-designs', 'messages'],
      customer: ['dashboard', 'favorites', 'my-designs', 'messages'],
      contractor: ['dashboard', 'jobs', 'customers', 'messages'],
      vendor: ['dashboard', 'products', 'orders', 'messages'],
      admin: ['dashboard', 'leads', 'jobs', 'messages']
    },

    // All menu items with metadata
    items: {
      dashboard: { label: 'Home', icon: 'home', roles: ['all'] },
      profile: { label: 'Profile', icon: 'user', roles: ['all'] },
      favorites: { label: 'Favorites', icon: 'heart', roles: ['homeowner', 'customer'] },
      'my-designs': { label: 'My Designs', icon: 'palette', roles: ['all'] },
      listings: { label: 'Listings', icon: 'grid', roles: ['all'] },
      tools: { label: 'Design Tools', icon: 'tools', roles: ['all'] },
      leads: { label: 'Leads', icon: 'users', roles: ['admin'], badge: 'leadsCount' },
      customers: { label: 'Customers', icon: 'users', roles: ['admin', 'contractor'] },
      estimates: { label: 'Estimates', icon: 'file-text', roles: ['admin', 'contractor'], badge: 'estimatesCount' },
      invoices: { label: 'Invoices', icon: 'receipt', roles: ['admin'] },
      jobs: { label: 'Jobs', icon: 'briefcase', roles: ['admin', 'contractor'] },
      collaborators: { label: 'Collaborators', icon: 'hard-hat', roles: ['admin'] },
      calendar: { label: 'Calendar', icon: 'calendar', roles: ['admin', 'contractor'] },
      wallet: { label: 'Wallet', icon: 'wallet', roles: ['contractor', 'vendor'] },
      products: { label: 'Products', icon: 'package', roles: ['vendor'] },
      orders: { label: 'Orders', icon: 'shopping-bag', roles: ['vendor'] },
      messages: { label: 'Messages', icon: 'message', roles: ['all'], badge: 'messagesCount' },
      'admin-users': { label: 'Manage Admins', icon: 'shield', roles: ['admin'] }
    }
  };

  // SVG Icons
  const ICONS = {
    home: '<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"/></svg>',
    heart: '<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z"/></svg>',
    message: '<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"/></svg>',
    menu: '<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M4 6h16M4 12h16M4 18h16"/></svg>',
    user: '<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"/></svg>',
    palette: '<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zm0 0h12a2 2 0 002-2v-4a2 2 0 00-2-2h-2.343M11 7.343l1.657-1.657a2 2 0 012.828 0l2.829 2.829a2 2 0 010 2.828l-8.486 8.485M7 17h.01"/></svg>',
    grid: '<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z"/></svg>',
    tools: '<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"/><path stroke-linecap="round" stroke-linejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/></svg>',
    users: '<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z"/></svg>',
    'file-text': '<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg>',
    receipt: '<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M9 14l6-6m-5.5.5h.01m4.99 5h.01M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16l3.5-2 3.5 2 3.5-2 3.5 2z"/></svg>',
    briefcase: '<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v2m4 6h.01M5 20h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"/></svg>',
    'hard-hat': '<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"/></svg>',
    calendar: '<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"/></svg>',
    wallet: '<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z"/></svg>',
    package: '<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"/></svg>',
    'shopping-bag': '<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z"/></svg>',
    shield: '<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"/></svg>',
    logout: '<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"/></svg>'
  };

  // ============================================
  // MOBILE NAV CLASS
  // ============================================
  class MobileNav {
    constructor() {
      this.currentPage = 'dashboard';
      this.userRole = 'homeowner';
      this.isDrawerOpen = false;
      this.touchStartX = 0;
      this.touchStartY = 0;
      this.touchStartTime = 0;

      this.init();
    }

    init() {
      this.createHTML();
      this.cacheElements();
      this.bindEvents();
      this.updateForRole(window.userRole || 'homeowner');
      this.syncWithCurrentPage();
    }

    createHTML() {
      // Create bottom nav
      const bottomNav = document.createElement('nav');
      bottomNav.className = 'mobile-bottom-nav';
      bottomNav.id = 'mobile-bottom-nav';
      bottomNav.innerHTML = `<div class="mobile-nav-tabs" id="mobile-nav-tabs"></div>`;
      document.body.appendChild(bottomNav);

      // Create drawer overlay
      const overlay = document.createElement('div');
      overlay.className = 'mobile-drawer-overlay';
      overlay.id = 'mobile-drawer-overlay';
      document.body.appendChild(overlay);

      // Create more drawer
      const drawer = document.createElement('div');
      drawer.className = 'mobile-more-drawer';
      drawer.id = 'mobile-more-drawer';
      drawer.innerHTML = `
        <div class="drawer-handle"></div>
        <div class="drawer-header">
          <div class="drawer-user-info">
            <div class="drawer-avatar" id="drawer-avatar">SG</div>
            <div>
              <div class="drawer-user-name" id="drawer-user-name">Welcome</div>
              <div class="drawer-user-role" id="drawer-user-role">Account</div>
            </div>
          </div>
        </div>
        <div class="drawer-menu" id="drawer-menu"></div>
        <div class="drawer-footer">
          <button class="drawer-logout-btn" id="drawer-logout-btn">
            ${ICONS.logout}
            Sign Out
          </button>
        </div>
      `;
      document.body.appendChild(drawer);
    }

    cacheElements() {
      this.bottomNav = document.getElementById('mobile-bottom-nav');
      this.navTabs = document.getElementById('mobile-nav-tabs');
      this.overlay = document.getElementById('mobile-drawer-overlay');
      this.drawer = document.getElementById('mobile-more-drawer');
      this.drawerMenu = document.getElementById('drawer-menu');
      this.drawerAvatar = document.getElementById('drawer-avatar');
      this.drawerName = document.getElementById('drawer-user-name');
      this.drawerRole = document.getElementById('drawer-user-role');
      this.logoutBtn = document.getElementById('drawer-logout-btn');
      this.mainContent = document.querySelector('.main-content');
    }

    bindEvents() {
      // Overlay click
      this.overlay.addEventListener('click', () => this.closeDrawer());

      // Logout button
      this.logoutBtn.addEventListener('click', () => {
        this.closeDrawer();
        if (typeof handleLogout === 'function') {
          handleLogout();
        }
      });

      // Swipe gestures on main content
      if (this.mainContent) {
        this.mainContent.addEventListener('touchstart', this.onTouchStart.bind(this), { passive: true });
        this.mainContent.addEventListener('touchend', this.onTouchEnd.bind(this), { passive: true });
      }

      // Drawer drag to close
      this.drawer.addEventListener('touchstart', this.onDrawerTouchStart.bind(this), { passive: true });
      this.drawer.addEventListener('touchmove', this.onDrawerTouchMove.bind(this), { passive: false });
      this.drawer.addEventListener('touchend', this.onDrawerTouchEnd.bind(this), { passive: true });

      // Listen for hash changes
      window.addEventListener('hashchange', () => this.syncWithCurrentPage());

      // Listen for page changes from sidebar
      document.addEventListener('pageChanged', (e) => {
        if (e.detail && e.detail.page) {
          this.setActivePage(e.detail.page);
        }
      });
    }

    // ============================================
    // NAVIGATION
    // ============================================
    renderTabs() {
      const tabs = this.getTabsForRole(this.userRole);

      this.navTabs.innerHTML = tabs.map(page => {
        const item = MENU_CONFIG.items[page];
        if (!item) return '';

        const isActive = page === this.currentPage;
        const icon = ICONS[item.icon] || ICONS.grid;

        return `
          <a href="#${page}" class="mobile-nav-tab ${isActive ? 'active' : ''}" data-page="${page}">
            ${icon}
            <span>${item.label}</span>
            ${item.badge ? `<span class="mobile-nav-badge" id="mobile-badge-${page}" data-count="0"></span>` : ''}
          </a>
        `;
      }).join('') + `
        <button class="mobile-nav-tab" id="mobile-more-btn">
          ${ICONS.menu}
          <span>More</span>
        </button>
      `;

      // Bind tab click events
      this.navTabs.querySelectorAll('.mobile-nav-tab[data-page]').forEach(tab => {
        tab.addEventListener('click', (e) => {
          e.preventDefault();
          this.navigateToPage(tab.dataset.page);
        });
      });

      // Bind more button
      document.getElementById('mobile-more-btn').addEventListener('click', () => this.toggleDrawer());
    }

    renderDrawerMenu() {
      const allItems = Object.entries(MENU_CONFIG.items);
      const primaryPages = this.getTabsForRole(this.userRole);

      // Filter items for drawer (exclude primary tabs)
      const drawerItems = allItems.filter(([page, item]) => {
        if (primaryPages.includes(page)) return false;
        if (item.roles.includes('all')) return true;
        return item.roles.includes(this.userRole);
      });

      // Group by category
      const categories = {
        account: ['profile'],
        features: ['favorites', 'my-designs', 'listings', 'tools'],
        business: ['leads', 'customers', 'estimates', 'invoices', 'jobs', 'collaborators', 'calendar', 'wallet'],
        store: ['products', 'orders'],
        admin: ['admin-users']
      };

      let html = '';

      Object.entries(categories).forEach(([category, pages]) => {
        const categoryItems = drawerItems.filter(([page]) => pages.includes(page));
        if (categoryItems.length === 0) return;

        const categoryLabels = {
          account: 'Account',
          features: 'Features',
          business: 'Business',
          store: 'Store',
          admin: 'Administration'
        };

        html += `
          <div class="drawer-menu-section">
            <div class="drawer-menu-section-title">${categoryLabels[category]}</div>
            ${categoryItems.map(([page, item]) => `
              <a class="drawer-menu-item ${page === this.currentPage ? 'active' : ''}" data-page="${page}" href="#${page}">
                ${ICONS[item.icon] || ICONS.grid}
                <span>${item.label}</span>
                ${item.badge ? `<span class="menu-badge" id="drawer-badge-${page}">0</span>` : ''}
              </a>
            `).join('')}
          </div>
        `;
      });

      this.drawerMenu.innerHTML = html;

      // Bind click events
      this.drawerMenu.querySelectorAll('.drawer-menu-item').forEach(item => {
        item.addEventListener('click', (e) => {
          e.preventDefault();
          this.navigateToPage(item.dataset.page);
        });
      });
    }

    getTabsForRole(role) {
      const roleTabs = MENU_CONFIG.primaryTabs[role] || MENU_CONFIG.primaryTabs.all;
      // Limit to 4 tabs (5th is "More")
      return roleTabs.slice(0, 4);
    }

    navigateToPage(page) {
      this.closeDrawer();
      this.setActivePage(page);

      // Use existing showPage function if available
      if (typeof showPage === 'function') {
        showPage(page);
      } else {
        window.location.hash = page;
      }

      // Dispatch event for other components
      document.dispatchEvent(new CustomEvent('mobileNavigation', { detail: { page } }));
    }

    setActivePage(page) {
      this.currentPage = page;

      // Update tab active states
      this.navTabs.querySelectorAll('.mobile-nav-tab').forEach(tab => {
        tab.classList.toggle('active', tab.dataset.page === page);
      });

      // Update drawer active states
      this.drawerMenu.querySelectorAll('.drawer-menu-item').forEach(item => {
        item.classList.toggle('active', item.dataset.page === page);
      });
    }

    syncWithCurrentPage() {
      const hash = window.location.hash.replace('#', '') || 'dashboard';
      this.setActivePage(hash);
    }

    // ============================================
    // DRAWER
    // ============================================
    toggleDrawer() {
      if (this.isDrawerOpen) {
        this.closeDrawer();
      } else {
        this.openDrawer();
      }
    }

    openDrawer() {
      this.isDrawerOpen = true;
      this.drawer.classList.add('open');
      this.overlay.classList.add('active');
      document.body.classList.add('drawer-open');
    }

    closeDrawer() {
      this.isDrawerOpen = false;
      this.drawer.classList.remove('open');
      this.overlay.classList.remove('active');
      document.body.classList.remove('drawer-open');
      this.drawer.style.transform = '';
    }

    // Drawer drag handling
    onDrawerTouchStart(e) {
      this.drawerStartY = e.touches[0].clientY;
      this.drawerCurrentY = this.drawerStartY;
    }

    onDrawerTouchMove(e) {
      this.drawerCurrentY = e.touches[0].clientY;
      const deltaY = this.drawerCurrentY - this.drawerStartY;

      // Only allow dragging down
      if (deltaY > 0) {
        this.drawer.style.transform = `translateY(${deltaY}px)`;
        e.preventDefault();
      }
    }

    onDrawerTouchEnd() {
      const deltaY = this.drawerCurrentY - this.drawerStartY;

      if (deltaY > CONFIG.drawerDragThreshold) {
        this.closeDrawer();
      } else {
        this.drawer.style.transform = '';
      }
    }

    // ============================================
    // SWIPE GESTURES
    // ============================================
    onTouchStart(e) {
      this.touchStartX = e.touches[0].clientX;
      this.touchStartY = e.touches[0].clientY;
      this.touchStartTime = Date.now();
    }

    onTouchEnd(e) {
      const touchEndX = e.changedTouches[0].clientX;
      const touchEndY = e.changedTouches[0].clientY;
      const touchEndTime = Date.now();

      const deltaX = touchEndX - this.touchStartX;
      const deltaY = touchEndY - this.touchStartY;
      const deltaTime = touchEndTime - this.touchStartTime;

      // Check if it's a horizontal swipe (not vertical scroll)
      if (Math.abs(deltaX) > Math.abs(deltaY) &&
          Math.abs(deltaX) > CONFIG.swipeThreshold &&
          deltaTime < CONFIG.swipeTimeLimit) {

        if (deltaX > 0) {
          this.navigatePrevious();
        } else {
          this.navigateNext();
        }
      }
    }

    navigatePrevious() {
      const pages = this.getNavigablePages();
      const currentIndex = pages.indexOf(this.currentPage);
      if (currentIndex > 0) {
        this.navigateToPage(pages[currentIndex - 1]);
      }
    }

    navigateNext() {
      const pages = this.getNavigablePages();
      const currentIndex = pages.indexOf(this.currentPage);
      if (currentIndex < pages.length - 1) {
        this.navigateToPage(pages[currentIndex + 1]);
      }
    }

    getNavigablePages() {
      // Get all pages available to this role
      const allItems = Object.entries(MENU_CONFIG.items);
      return allItems
        .filter(([page, item]) => {
          if (item.roles.includes('all')) return true;
          return item.roles.includes(this.userRole);
        })
        .map(([page]) => page);
    }

    // ============================================
    // ROLE & USER UPDATES
    // ============================================
    updateForRole(role) {
      this.userRole = role;
      this.renderTabs();
      this.renderDrawerMenu();
    }

    updateUserInfo(user) {
      if (!user) return;

      const name = user.full_name || user.email?.split('@')[0] || 'User';
      const initials = name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
      const role = user.account_type || 'homeowner';

      this.drawerName.textContent = name;
      this.drawerRole.textContent = role.replace(/-/g, ' ');
      this.drawerAvatar.textContent = initials;

      if (user.avatar_url) {
        this.drawerAvatar.innerHTML = `<img src="${user.avatar_url}" alt="${name}">`;
      }
    }

    updateBadge(type, count) {
      const mobileBadge = document.getElementById(`mobile-badge-${type}`);
      const drawerBadge = document.getElementById(`drawer-badge-${type}`);

      if (mobileBadge) {
        mobileBadge.textContent = count;
        mobileBadge.dataset.count = count;
        mobileBadge.style.display = count > 0 ? 'flex' : 'none';
      }

      if (drawerBadge) {
        drawerBadge.textContent = count;
        drawerBadge.style.display = count > 0 ? 'inline-flex' : 'none';
      }
    }

    // ============================================
    // CLEANUP
    // ============================================
    destroy() {
      this.bottomNav?.remove();
      this.overlay?.remove();
      this.drawer?.remove();
    }
  }

  // ============================================
  // INITIALIZATION
  // ============================================
  function initMobileNav() {
    // Only init on mobile
    if (window.innerWidth > 768) return null;

    // Wait for DOM
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => {
        window.mobileNav = new MobileNav();
      });
    } else {
      window.mobileNav = new MobileNav();
    }

    return window.mobileNav;
  }

  // Handle resize
  let resizeTimeout;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimeout);
    resizeTimeout = setTimeout(() => {
      if (window.innerWidth <= 768 && !window.mobileNav) {
        window.mobileNav = new MobileNav();
      } else if (window.innerWidth > 768 && window.mobileNav) {
        window.mobileNav.destroy();
        window.mobileNav = null;
      }
    }, 250);
  });

  // Initialize
  initMobileNav();

  // Expose for external use
  window.MobileNav = MobileNav;
  window.initMobileNav = initMobileNav;

})();
