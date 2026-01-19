/**
 * SURPRISE GRANITE - REFERRAL TRACKING SYSTEM
 * Detects referral codes in URL and links customers to pros
 *
 * Usage: Include this script on all pages
 * Referral URLs: https://surprisegranite.com/?ref=CODE
 */

(function() {
  'use strict';

  const STORAGE_KEY = 'sg_referral';
  const API_BASE = window.SG_CONFIG?.API_BASE || 'https://surprise-granite-email-api.onrender.com';
  const SUPABASE_URL = window.SG_CONFIG?.SUPABASE_URL || 'https://ypeypgwsycxcagncgdur.supabase.co';
  const SUPABASE_ANON_KEY = window.SG_CONFIG?.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlwZXlwZ3dzeWN4Y2FnbmNnZHVyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njc3NTQ4MjMsImV4cCI6MjA4MzMzMDgyM30.R13pNv2FDtGhfeu7gUcttYNrQAbNYitqR4FIq3O2-ME';

  let supabase = null;

  // Initialize on page load
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  async function init() {
    // Check for referral code in URL
    const urlParams = new URLSearchParams(window.location.search);
    const refCode = urlParams.get('ref') || urlParams.get('referral');

    if (refCode) {
      await handleReferral(refCode);
    }

    // Initialize Supabase listener for when user logs in
    initSupabase();
  }

  /**
   * Handle referral code from URL
   */
  async function handleReferral(code) {
    console.log('[Referral] Detected referral code:', code);

    try {
      // Validate the referral code with the API
      const response = await fetch(`${API_BASE}/api/pro/track-referral/${code}`);
      const data = await response.json();

      if (data.success) {
        // Store referral info
        const referralData = {
          code: data.referral.code,
          proUserId: data.referral.proUserId,
          proName: data.referral.proName,
          timestamp: Date.now(),
          landingPage: window.location.pathname
        };

        localStorage.setItem(STORAGE_KEY, JSON.stringify(referralData));
        sessionStorage.setItem(STORAGE_KEY, JSON.stringify(referralData));

        console.log('[Referral] Stored referral data:', referralData);

        // Show welcome message if pro name is available
        if (data.referral.proName) {
          showReferralWelcome(data.referral.proName);
        }

        // Clean URL (remove ref param)
        cleanUrl();

        // Dispatch event for other scripts
        window.dispatchEvent(new CustomEvent('sg-referral-detected', {
          detail: referralData
        }));
      } else {
        console.warn('[Referral] Invalid code:', code);
      }
    } catch (err) {
      console.error('[Referral] Error tracking referral:', err);
    }
  }

  /**
   * Initialize Supabase and listen for auth changes
   */
  function initSupabase() {
    // Wait for Supabase to be available
    if (typeof window.supabase === 'undefined') {
      const checkInterval = setInterval(() => {
        if (typeof window.supabase !== 'undefined') {
          clearInterval(checkInterval);
          setupAuthListener();
        }
      }, 100);

      // Stop checking after 5 seconds
      setTimeout(() => clearInterval(checkInterval), 5000);
    } else {
      setupAuthListener();
    }
  }

  /**
   * Setup auth state listener to link customer when they sign up/login
   */
  function setupAuthListener() {
    // Use existing client if available
    if (window._sgSupabaseClient) {
      supabase = window._sgSupabaseClient;
    } else if (window.SgAuth?.getClient) {
      supabase = window.SgAuth.getClient();
    } else {
      supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    }

    // Listen for auth state changes
    supabase.auth.onAuthStateChange(async (event, session) => {
      if ((event === 'SIGNED_IN' || event === 'USER_UPDATED') && session?.user) {
        await linkCustomerToPro(session.user);
      }
    });

    // Check if already logged in
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) {
        linkCustomerToPro(session.user);
      }
    });
  }

  /**
   * Link customer to pro when they sign up/login
   */
  async function linkCustomerToPro(user) {
    // Get stored referral data
    const referralStr = localStorage.getItem(STORAGE_KEY) || sessionStorage.getItem(STORAGE_KEY);
    if (!referralStr) return;

    const referral = JSON.parse(referralStr);

    // Check if referral is still valid (within 30 days)
    const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000;
    if (Date.now() - referral.timestamp > thirtyDaysMs) {
      console.log('[Referral] Referral expired');
      localStorage.removeItem(STORAGE_KEY);
      return;
    }

    console.log('[Referral] Linking customer to pro:', referral.code);

    try {
      const response = await fetch(`${API_BASE}/api/pro/link-customer`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          referralCode: referral.code,
          customerUserId: user.id,
          customerEmail: user.email
        })
      });

      const data = await response.json();

      if (data.success) {
        console.log('[Referral] Customer linked successfully');

        // Store linked pro ID for activity tracking
        localStorage.setItem('sg_linked_pro', referral.proUserId);

        // Dispatch event
        window.dispatchEvent(new CustomEvent('sg-customer-linked', {
          detail: {
            proUserId: referral.proUserId,
            proName: referral.proName
          }
        }));
      }
    } catch (err) {
      console.error('[Referral] Error linking customer:', err);
    }
  }

  /**
   * Show welcome message for referred visitors
   */
  function showReferralWelcome(proName) {
    // Only show once per session
    if (sessionStorage.getItem('sg_referral_welcome_shown')) return;
    sessionStorage.setItem('sg_referral_welcome_shown', 'true');

    // Create welcome banner
    const banner = document.createElement('div');
    banner.id = 'referralWelcomeBanner';
    banner.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
      color: #fff;
      padding: 12px 20px;
      text-align: center;
      z-index: 99999;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      font-size: 14px;
      box-shadow: 0 2px 10px rgba(0,0,0,0.3);
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 12px;
    `;

    banner.innerHTML = `
      <span style="color: #d4a855;">Welcome!</span>
      You were referred by <strong>${escapeHtml(proName)}</strong>.
      They'll help you with your project!
      <button onclick="this.parentElement.remove()" style="
        background: rgba(255,255,255,0.1);
        border: none;
        color: #fff;
        padding: 4px 12px;
        border-radius: 4px;
        cursor: pointer;
        margin-left: 12px;
      ">Got it</button>
    `;

    document.body.appendChild(banner);

    // Auto-hide after 8 seconds
    setTimeout(() => {
      if (banner.parentNode) {
        banner.style.transition = 'opacity 0.3s, transform 0.3s';
        banner.style.opacity = '0';
        banner.style.transform = 'translateY(-100%)';
        setTimeout(() => banner.remove(), 300);
      }
    }, 8000);
  }

  /**
   * Clean referral params from URL
   */
  function cleanUrl() {
    const url = new URL(window.location.href);
    url.searchParams.delete('ref');
    url.searchParams.delete('referral');

    // Only update if we changed something
    if (url.href !== window.location.href) {
      window.history.replaceState({}, '', url.href);
    }
  }

  /**
   * Escape HTML to prevent XSS
   */
  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  /**
   * Get current referral data (for other scripts)
   */
  function getReferralData() {
    const str = localStorage.getItem(STORAGE_KEY) || sessionStorage.getItem(STORAGE_KEY);
    return str ? JSON.parse(str) : null;
  }

  /**
   * Get linked pro ID (for activity tracking)
   */
  function getLinkedProId() {
    return localStorage.getItem('sg_linked_pro');
  }

  /**
   * Track customer activity
   */
  async function trackActivity(activityType, activityData = {}) {
    const linkedProId = getLinkedProId();
    if (!linkedProId) return;

    try {
      // Get current user if logged in
      let userId = null;
      let userEmail = null;

      if (supabase) {
        const { data: { session } } = await supabase.auth.getSession();
        if (session?.user) {
          userId = session.user.id;
          userEmail = session.user.email;
        }
      }

      // Send activity to API
      await fetch(`${API_BASE}/api/pro/activity`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          proUserId: linkedProId,
          customerUserId: userId,
          customerEmail: userEmail,
          activityType,
          activityData,
          pageUrl: window.location.href
        })
      });
    } catch (err) {
      console.warn('[Referral] Activity tracking failed:', err);
    }
  }

  // Expose API for other scripts
  window.SgReferral = {
    getReferralData,
    getLinkedProId,
    trackActivity,
    linkCustomerToPro
  };

})();
