/**
 * Surprise Granite - Global Auth State Manager v2.0
 * Handles authentication state across all page types:
 * - Webflow navbar (index.html, blog pages)
 * - Product pages (countertops, flooring, tile)
 * - Tool pages (calculators, visualizers)
 * - Account portal (sidebar)
 *
 * Uses centralized configuration from /js/config.js
 */

(function() {
  'use strict';

  // Suppress AbortError from Supabase globally (known localhost issue, non-critical)
  window.addEventListener('unhandledrejection', (event) => {
    if (event.reason?.name === 'AbortError' || String(event.reason).includes('AbortError')) {
      event.preventDefault();
      console.debug('Supabase AbortError suppressed');
    }
  });

  // Use centralized config or fallback to defaults
  const config = window.SG_CONFIG || {};
  const SUPABASE_URL = config.SUPABASE_URL || 'https://ypeypgwsycxcagncgdur.supabase.co';
  const SUPABASE_ANON_KEY = config.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlwZXlwZ3dzeWN4Y2FnbmNnZHVyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njc3NTQ4MjMsImV4cCI6MjA4MzMzMDgyM30.R13pNv2FDtGhfeu7gUcttYNrQAbNYitqR4FIq3O2-ME';

  let supabaseClient = null;
  let currentUser = null;

  // Styles - minimal and subtle
  const STYLES = {
    // Logged in badge (small green square with initial)
    badge: `
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 24px;
      height: 24px;
      background: #22c55e;
      border-radius: 4px;
      font-size: 11px;
      font-weight: 600;
      color: white;
      text-decoration: none;
    `,
    // Logout button - subtle text link
    logoutLight: `
      color: #666;
      font-size: 13px;
      font-weight: 500;
      cursor: pointer;
      background: none;
      border: none;
      padding: 0;
      margin-left: 8px;
    `,
    // Logout button - dark backgrounds (subtle)
    logoutDark: `
      color: rgba(255,255,255,0.7);
      font-size: 13px;
      font-weight: 500;
      cursor: pointer;
      background: none;
      border: none;
      padding: 0;
      margin-left: 8px;
    `,
    // Login link - matches nav links (light bg)
    loginLight: `
      color: #1a1a2e;
      text-decoration: none;
      font-size: 14px;
      font-weight: 500;
    `,
    // Login link - matches nav links (dark bg)
    loginDark: `
      color: rgba(255,255,255,0.75);
      text-decoration: none;
      font-size: 14px;
      font-weight: 500;
    `,
    // Container for auth elements
    container: `
      display: inline-flex;
      align-items: center;
      gap: 6px;
    `
  };

  // User icon SVG
  const USER_ICON = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"/></svg>`;

  // Initialize on DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  async function init() {
    try {
      // Use SgAuth's shared client if available (preferred - avoids multiple clients)
      if (window.SgAuth) {
        await window.SgAuth.init();
        supabaseClient = window.SgAuth.getClient();
        currentUser = window.SgAuth.getUser();

        // Only update UI once after auth state is known
        updateAllAuthDisplays(currentUser);

        // Listen for auth changes via SgAuth
        window.SgAuth.onAuthChange((event, data) => {
          if (data?.user) {
            currentUser = data.user;
            updateAllAuthDisplays(currentUser);
          } else {
            currentUser = null;
            updateAllAuthDisplays(null);
          }
        });
        return;
      }

      // Wait for global client (created by supabase-init.js)
      let attempts = 0;
      while (!window._sgSupabaseClient && attempts < 50) {
        await new Promise(r => setTimeout(r, 100));
        attempts++;
      }

      if (window._sgSupabaseClient) {
        supabaseClient = window._sgSupabaseClient;
      } else {
        console.error('Auth state: Global Supabase client not found');
        return;
      }

      if (supabaseClient) {
        const { data: { session } } = await supabaseClient.auth.getSession();

        if (session?.user) {
          currentUser = session.user;
          updateAllAuthDisplays(currentUser);
        }

        supabaseClient.auth.onAuthStateChange((event, session) => {
          if (session?.user) {
            currentUser = session.user;
            updateAllAuthDisplays(currentUser);
          } else {
            currentUser = null;
            updateAllAuthDisplays(null);
          }
        });
      }
    } catch (e) {
      // Suppress AbortError - it's a known non-critical Supabase issue on localhost
      if (e.name === 'AbortError' || String(e).includes('AbortError')) {
        console.debug('Auth: AbortError suppressed (non-critical)');
      } else {
        console.error('Auth state error:', e);
      }
    }
  }

  function loadSupabaseScript() {
    return new Promise((resolve) => {
      if (typeof window.supabase !== 'undefined') {
        resolve();
        return;
      }
      const script = document.createElement('script');
      script.src = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2';
      script.onload = () => setTimeout(resolve, 100);
      script.onerror = resolve;
      document.head.appendChild(script);
    });
  }

  // Use centralized SecurityUtils if available
  const escapeHtml = (window.SecurityUtils && window.SecurityUtils.escapeHtml)
    ? window.SecurityUtils.escapeHtml.bind(window.SecurityUtils)
    : function(str) {
        if (str === null || str === undefined) return '';
        const div = document.createElement('div');
        div.textContent = String(str);
        return div.innerHTML;
      };

  function getUserDisplayInfo(user) {
    if (!user) return { displayName: 'Guest', initial: 'G' };

    const rawName = user.user_metadata?.first_name ||
                    user.user_metadata?.full_name?.split(' ')[0] ||
                    user.email?.split('@')[0] ||
                    'Account';
    // Escape to prevent XSS
    const displayName = escapeHtml(rawName);
    const initial = escapeHtml(rawName.charAt(0).toUpperCase());

    return { displayName, initial };
  }

  function updateAllAuthDisplays(user) {
    const { displayName, initial } = getUserDisplayInfo(user);

    // Update all possible auth locations
    updateWebflowBanner(user, displayName, initial);
    updateModernHeader(user, displayName, initial);
    updateToolHeader(user, displayName, initial);
    updateMobileNav(user, displayName, initial);
  }

  // ============================================
  // WEBFLOW BANNER (index.html, blog pages)
  // Target: #auth-buttons in .navbar-banner_content-right
  // ============================================
  function updateWebflowBanner(user, displayName, initial) {
    const container = document.getElementById('auth-buttons');
    if (!container) return;

    // Clear existing content
    container.innerHTML = '';

    if (user) {
      container.innerHTML = `
        <div style="${STYLES.container}">
          <a href="/account/" style="${STYLES.badge}" title="My Account">${initial}</a>
          <button onclick="window.SurpriseGraniteAuth.logout()" style="${STYLES.logoutDark}">Log Out</button>
        </div>
      `;
    } else {
      container.innerHTML = `
        <div style="${STYLES.container}">
          <a href="/log-in/" style="color: white; text-decoration: none; font-size: 13px; font-weight: 500; margin-right: 12px;">Log In</a>
          <a href="/sign-up/" style="${STYLES.loginDark}">Sign Up</a>
        </div>
      `;
    }
  }

  // ============================================
  // MODERN HEADER (product pages: countertops, flooring, tile)
  // Target: .header-nav (insert before .btn-estimate)
  // ============================================
  function updateModernHeader(user, displayName, initial) {
    const headerNav = document.querySelector('.header-nav');
    if (!headerNav) return;

    // Skip if this is a tool page (handled separately)
    if (document.querySelector('.header-content .logo-text')) return;

    // Remove existing auth container
    const existing = headerNav.querySelector('.auth-container');
    if (existing) existing.remove();

    // Find the estimate button to insert before
    const estimateBtn = headerNav.querySelector('.btn-estimate');

    // Create auth container
    const authContainer = document.createElement('div');
    authContainer.className = 'auth-container';
    authContainer.style.cssText = STYLES.container;

    if (user) {
      authContainer.innerHTML = `
        <a href="/account/" style="${STYLES.badge}" title="My Account">${initial}</a>
        <button onclick="window.SurpriseGraniteAuth.logout()" style="${STYLES.logoutLight}">Log Out</button>
      `;
    } else {
      authContainer.innerHTML = `
        <a href="/log-in/" style="${STYLES.loginLight}">Log In</a>
      `;
    }

    if (estimateBtn) {
      headerNav.insertBefore(authContainer, estimateBtn);
    } else {
      headerNav.appendChild(authContainer);
    }
  }

  // ============================================
  // TOOL HEADER (calculators, visualizers)
  // Target: .header-nav in .header-content (dark background)
  // ============================================
  function updateToolHeader(user, displayName, initial) {
    // Check if this is a tool page (has .logo-text)
    const logoText = document.querySelector('.header-content .logo-text');
    if (!logoText) return;

    const headerNav = document.querySelector('.header-nav');
    if (!headerNav) return;

    // Remove existing auth container
    const existing = headerNav.querySelector('.auth-container');
    if (existing) existing.remove();

    // Find the estimate button
    const estimateBtn = headerNav.querySelector('.btn-estimate');

    // Create auth container
    const authContainer = document.createElement('div');
    authContainer.className = 'auth-container';
    authContainer.style.cssText = STYLES.container;

    if (user) {
      authContainer.innerHTML = `
        <a href="/account/" style="${STYLES.badge}" title="My Account">${initial}</a>
        <button onclick="window.SurpriseGraniteAuth.logout()" style="${STYLES.logoutDark}">Log Out</button>
      `;
    } else {
      authContainer.innerHTML = `
        <a href="/log-in/" style="${STYLES.loginDark}">Log In</a>
      `;
    }

    if (estimateBtn) {
      headerNav.insertBefore(authContainer, estimateBtn);
    } else {
      headerNav.appendChild(authContainer);
    }
  }

  // ============================================
  // MOBILE NAVIGATION
  // Target: .mobile-nav, .sg-mobile-nav, .w-nav-overlay
  // ============================================
  function updateMobileNav(user, displayName, initial) {
    const mobileNavs = document.querySelectorAll('.mobile-nav, .sg-mobile-nav');

    mobileNavs.forEach(mobileNav => {
      // Remove existing auth section
      const existing = mobileNav.querySelector('.mobile-auth-section');
      if (existing) existing.remove();

      // Create auth section
      const authSection = document.createElement('div');
      authSection.className = 'mobile-auth-section';
      authSection.style.cssText = 'padding: 16px; border-top: 1px solid rgba(255,255,255,0.1);';

      if (user) {
        authSection.innerHTML = `
          <a href="/account/" style="display: flex; align-items: center; gap: 12px; padding: 12px; background: rgba(34,197,94,0.15); border-radius: 12px; text-decoration: none; margin-bottom: 12px;">
            <span style="width: 40px; height: 40px; background: #22c55e; border-radius: 8px; display: flex; align-items: center; justify-content: center; font-size: 18px; font-weight: 700; color: white;">${initial}</span>
            <span style="flex: 1;">
              <span style="display: block; color: white; font-weight: 600; font-size: 15px;">${displayName}</span>
              <span style="display: block; color: #22c55e; font-size: 12px; font-weight: 500;">Logged In</span>
            </span>
          </a>
          <button onclick="window.SurpriseGraniteAuth.logout()" style="width: 100%; padding: 12px; background: rgba(255,255,255,0.1); border: 1px solid rgba(255,255,255,0.2); border-radius: 8px; color: white; font-size: 14px; font-weight: 500; cursor: pointer;">
            Log Out
          </button>
        `;
      } else {
        authSection.innerHTML = `
          <div style="display: flex; gap: 12px;">
            <a href="/log-in/" style="flex: 1; padding: 12px; background: rgba(255,255,255,0.1); color: white; text-align: center; border-radius: 8px; text-decoration: none; font-weight: 600; font-size: 14px;">Log In</a>
            <a href="/sign-up/" style="flex: 1; padding: 12px; background: #22c55e; color: white; text-align: center; border-radius: 8px; text-decoration: none; font-weight: 600; font-size: 14px;">Sign Up</a>
          </div>
        `;
      }

      // Insert at beginning of mobile nav
      if (mobileNav.firstChild) {
        mobileNav.insertBefore(authSection, mobileNav.firstChild);
      } else {
        mobileNav.appendChild(authSection);
      }
    });
  }

  // ============================================
  // LOGOUT FUNCTION
  // ============================================
  async function logout() {
    // Use SgAuth's comprehensive logout if available
    if (window.SgAuth && typeof window.SgAuth.signOut === 'function') {
      await window.SgAuth.signOut({ redirect: true, redirectUrl: '/' });
      return;
    }

    // Fallback logout
    if (supabaseClient) {
      await supabaseClient.auth.signOut();
    }

    // Clear state
    currentUser = null;

    // Clear localStorage
    try {
      const storageKey = window._sgSupabaseConfig?.storageKey || 'sg-auth-token';
      localStorage.removeItem(storageKey);
      localStorage.removeItem('sb-ypeypgwsycxcagncgdur-auth-token');
    } catch (e) {}

    // Update UI before redirect
    updateAllAuthDisplays(null);

    // Redirect to home
    window.location.href = '/';
  }

  // Listen for global logout events from other components
  window.addEventListener('sg-auth-logout', () => {
    currentUser = null;
    updateAllAuthDisplays(null);
  });

  // Expose global API
  window.SurpriseGraniteAuth = {
    getSupabase: () => supabaseClient,
    getUser: () => currentUser,
    refresh: init,
    logout: logout,
    isLoggedIn: () => !!currentUser
  };

})();
