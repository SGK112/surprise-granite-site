/**
 * Surprise Granite - Global Auth State Manager
 * Shows logged-in status across all pages (website + account portal)
 * Persists user session and displays user indicator in headers
 */

(function() {
  'use strict';

  const SUPABASE_URL = 'https://ypeypgwsycxcagncgdur.supabase.co';
  const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlwZXlwZ3dzeWN4Y2FnbmNnZHVyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njc3NTQ4MjMsImV4cCI6MjA4MzMzMDgyM30.R13pNv2FDtGhfeu7gUcttYNrQAbNYitqR4FIq3O2-ME';

  let supabaseClient = null;

  // Initialize on DOM ready
  document.addEventListener('DOMContentLoaded', init);

  async function init() {
    // Wait for Supabase to load
    if (typeof window.supabase === 'undefined') {
      // Try loading Supabase if not present
      await loadSupabaseScript();
    }

    try {
      const { createClient } = window.supabase;
      supabaseClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

      // Check current session
      const { data: { session } } = await supabaseClient.auth.getSession();

      if (session?.user) {
        showLoggedInState(session.user);
      } else {
        showLoggedOutState();
      }

      // Listen for auth changes
      supabaseClient.auth.onAuthStateChange((event, session) => {
        if (session?.user) {
          showLoggedInState(session.user);
        } else {
          showLoggedOutState();
        }
      });
    } catch (e) {
showLoggedOutState();
    }
  }

  function loadSupabaseScript() {
    return new Promise((resolve, reject) => {
      if (typeof window.supabase !== 'undefined') {
        resolve();
        return;
      }
      const script = document.createElement('script');
      script.src = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2';
      script.onload = () => setTimeout(resolve, 100);
      script.onerror = reject;
      document.head.appendChild(script);
    });
  }

  function showLoggedInState(user) {
    // Get user's name or email
    const displayName = user.user_metadata?.first_name ||
                        user.user_metadata?.full_name?.split(' ')[0] ||
                        user.email?.split('@')[0] ||
                        'Account';

    const initial = displayName.charAt(0).toUpperCase();

    // Update all auth indicator locations
    updateWebflowNavbar(user, displayName, initial);
    updateNewHeader(user, displayName, initial);
    updateMobileNav(user, displayName, initial);
  }

  function showLoggedOutState() {
    // Show login/signup links
    updateWebflowNavbar(null);
    updateNewHeader(null);
    updateMobileNav(null);
  }

  // Update Webflow-style navbar (main pages like index.html)
  function updateWebflowNavbar(user, displayName, initial) {
    // Find the existing account links area
    const bannerRight = document.querySelector('.navbar-banner_content-right .button-group');
    if (!bannerRight) return;

    // Remove existing auth indicator if present
    const existing = bannerRight.querySelector('.auth-user-indicator');
    if (existing) existing.remove();

    if (user) {
      // Replace "Create Account" and "Client Portal" with user menu
      const createAcctLink = bannerRight.querySelector('a[href*="sign-up"]');
      const portalLink = bannerRight.querySelector('a[href*="account"]');

      if (createAcctLink) createAcctLink.style.display = 'none';

      if (portalLink) {
        portalLink.innerHTML = `
          <span style="display: inline-flex; align-items: center; gap: 8px;">
            <span style="width: 24px; height: 24px; background: linear-gradient(135deg, #f9cb00, #cca600); border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 12px; font-weight: 700; color: #1a1a2e;">${initial}</span>
            ${displayName}
          </span>
        `;
        portalLink.href = '/account/';
      }
    } else {
      // Show default links
      const createAcctLink = bannerRight.querySelector('a[href*="sign-up"]');
      const portalLink = bannerRight.querySelector('a[href*="account"]');

      if (createAcctLink) createAcctLink.style.display = '';
      if (portalLink) {
        portalLink.textContent = 'Client Portal';
        portalLink.href = '/account/';
      }
    }
  }

  // Update new-style header (product pages, etc.)
  function updateNewHeader(user, displayName, initial) {
    // Look for new header nav
    const headerNav = document.querySelector('.header-nav, .sg-nav');
    if (!headerNav) return;

    // Remove existing indicator
    const existing = headerNav.querySelector('.auth-user-btn');
    if (existing) existing.remove();

    // Find estimate button to insert before
    const estimateBtn = headerNav.querySelector('.btn-estimate, .sg-btn-estimate');

    if (user) {
      const userBtn = document.createElement('a');
      userBtn.href = '/account/';
      userBtn.className = 'auth-user-btn';
      userBtn.style.cssText = `
        display: inline-flex;
        align-items: center;
        gap: 8px;
        padding: 8px 16px;
        background: rgba(249, 203, 0, 0.1);
        border: 1px solid rgba(249, 203, 0, 0.3);
        border-radius: 8px;
        color: #1e3a5f;
        text-decoration: none;
        font-size: 14px;
        font-weight: 600;
        transition: all 0.2s;
      `;
      userBtn.innerHTML = `
        <span style="width: 28px; height: 28px; background: linear-gradient(135deg, #f9cb00, #cca600); border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 13px; font-weight: 700; color: #1a1a2e;">${initial}</span>
        <span>${displayName}</span>
      `;

      if (estimateBtn) {
        headerNav.insertBefore(userBtn, estimateBtn);
      } else {
        headerNav.appendChild(userBtn);
      }
    } else {
      // Add login link
      const loginBtn = document.createElement('a');
      loginBtn.href = '/log-in/';
      loginBtn.className = 'auth-user-btn';
      loginBtn.style.cssText = `
        display: inline-flex;
        align-items: center;
        gap: 6px;
        padding: 8px 16px;
        color: #1e3a5f;
        text-decoration: none;
        font-size: 14px;
        font-weight: 600;
        border-radius: 8px;
        transition: all 0.2s;
      `;
      loginBtn.innerHTML = `
        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
          <path stroke-linecap="round" stroke-linejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"/>
        </svg>
        Sign In
      `;

      if (estimateBtn) {
        headerNav.insertBefore(loginBtn, estimateBtn);
      } else {
        headerNav.appendChild(loginBtn);
      }
    }
  }

  // Update mobile navigation
  function updateMobileNav(user, displayName, initial) {
    const mobileNav = document.querySelector('.sg-mobile-nav, .mobile-nav, .w-nav-overlay');
    if (!mobileNav) return;

    // Look for existing account section
    let accountSection = mobileNav.querySelector('.mobile-account-section');

    if (user) {
      if (!accountSection) {
        accountSection = document.createElement('div');
        accountSection.className = 'mobile-account-section';
        accountSection.style.cssText = 'padding: 16px; border-bottom: 1px solid rgba(30,58,95,0.1);';
        const firstSection = mobileNav.querySelector('.sg-mobile-links, .nav-menu');
        if (firstSection) {
          firstSection.parentNode.insertBefore(accountSection, firstSection);
        }
      }

      accountSection.innerHTML = `
        <a href="/account/" style="display: flex; align-items: center; gap: 12px; padding: 12px; background: rgba(249,203,0,0.1); border-radius: 12px; text-decoration: none;">
          <span style="width: 40px; height: 40px; background: linear-gradient(135deg, #f9cb00, #cca600); border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 18px; font-weight: 700; color: #1a1a2e;">${initial}</span>
          <span style="flex: 1;">
            <span style="display: block; color: #1e3a5f; font-weight: 600; font-size: 15px;">${displayName}</span>
            <span style="display: block; color: #64748b; font-size: 13px;">View your account</span>
          </span>
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="#94a3b8" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="M9 5l7 7-7 7"/>
          </svg>
        </a>
      `;
    } else {
      if (accountSection) {
        accountSection.innerHTML = `
          <div style="display: flex; gap: 12px;">
            <a href="/log-in/" style="flex: 1; padding: 12px; background: #1e3a5f; color: white; text-align: center; border-radius: 8px; text-decoration: none; font-weight: 600; font-size: 14px;">Log In</a>
            <a href="/sign-up/" style="flex: 1; padding: 12px; background: linear-gradient(135deg, #f9cb00, #cca600); color: #1a1a2e; text-align: center; border-radius: 8px; text-decoration: none; font-weight: 600; font-size: 14px;">Sign Up</a>
          </div>
        `;
      }
    }
  }

  // Expose for use by other scripts
  window.SurpriseGraniteAuth = {
    getSupabase: () => supabaseClient,
    refresh: init
  };

})();
