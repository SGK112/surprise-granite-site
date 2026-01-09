/**
 * Surprise Granite - User Tracking & Session Management
 * Keeps users signed in across website and portal
 * Tracks behavior, page views, and syncs with Supabase
 */

(function() {
  'use strict';

  const SUPABASE_URL = 'https://ypeypgwsycxcagncgdur.supabase.co';
  const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlwZXlwZ3dzeWN4Y2FnbmNnZHVyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njc3NTQ4MjMsImV4cCI6MjA4MzMzMDgyM30.R13pNv2FDtGhfeu7gUcttYNrQAbNYitqR4FIq3O2-ME';

  let supabase = null;
  let currentUser = null;
  let sessionStartTime = Date.now();
  let pageViewId = null;

  // Initialize on page load
  document.addEventListener('DOMContentLoaded', init);

  async function init() {
    await initSupabase();
    await checkAndRestoreSession();
    trackPageView();
    setupBehaviorTracking();
    setupAuthStateListener();
  }

  async function initSupabase() {
    // Wait for Supabase to be available
    if (typeof window.supabase === 'undefined') {
      await new Promise((resolve) => {
        const check = setInterval(() => {
          if (typeof window.supabase !== 'undefined') {
            clearInterval(check);
            resolve();
          }
        }, 100);
        setTimeout(() => { clearInterval(check); resolve(); }, 3000);
      });
    }

    if (typeof window.supabase !== 'undefined') {
      supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    }
  }

  async function checkAndRestoreSession() {
    if (!supabase) return;

    try {
      const { data: { session }, error } = await supabase.auth.getSession();

      if (session?.user) {
        currentUser = session.user;
// Update last seen
        updateUserActivity();

        // Dispatch event for other scripts
        window.dispatchEvent(new CustomEvent('userLoggedIn', {
          detail: { user: currentUser }
        }));

        // Update UI
        updateUserInterface();
      } else {
        // Check for session in localStorage (cross-tab persistence)
        const storedSession = localStorage.getItem('sg_user_session');
        if (storedSession) {
          try {
            const parsed = JSON.parse(storedSession);
            if (parsed.expires_at > Date.now()) {
              // Session still valid, try to restore
              const { data, error } = await supabase.auth.setSession({
                access_token: parsed.access_token,
                refresh_token: parsed.refresh_token
              });
              if (data?.session) {
                currentUser = data.session.user;
                updateUserInterface();
              }
            }
          } catch (e) {
            localStorage.removeItem('sg_user_session');
          }
        }
      }
    } catch (e) {
}
  }

  function setupAuthStateListener() {
    if (!supabase) return;

    supabase.auth.onAuthStateChange((event, session) => {
if (event === 'SIGNED_IN' && session) {
        currentUser = session.user;

        // Store session for cross-tab persistence
        localStorage.setItem('sg_user_session', JSON.stringify({
          access_token: session.access_token,
          refresh_token: session.refresh_token,
          expires_at: Date.now() + (session.expires_in * 1000)
        }));

        // Sync local favorites to cloud
        syncLocalFavoritesToCloud();

        // Update activity
        updateUserActivity();

        // Notify other scripts
        window.dispatchEvent(new CustomEvent('userLoggedIn', {
          detail: { user: currentUser }
        }));

        updateUserInterface();

      } else if (event === 'SIGNED_OUT') {
        currentUser = null;
        localStorage.removeItem('sg_user_session');

        window.dispatchEvent(new CustomEvent('userLoggedOut'));
        updateUserInterface();

      } else if (event === 'TOKEN_REFRESHED' && session) {
        // Update stored session
        localStorage.setItem('sg_user_session', JSON.stringify({
          access_token: session.access_token,
          refresh_token: session.refresh_token,
          expires_at: Date.now() + (session.expires_in * 1000)
        }));
      }
    });
  }

  async function syncLocalFavoritesToCloud() {
    if (!currentUser || !supabase) return;

    try {
      // Get local favorites
      const localFavorites = localStorage.getItem('sg_all_favorites');
      if (!localFavorites) return;

      const parsed = JSON.parse(localFavorites);
      const allFavorites = [];

      // Flatten all favorites
      Object.entries(parsed).forEach(([type, items]) => {
        if (Array.isArray(items)) {
          items.forEach(item => {
            allFavorites.push({
              user_id: currentUser.id,
              product_type: type,
              product_title: item.title,
              product_url: item.url,
              product_image: item.image,
              product_material: item.material || null,
              product_color: item.color || null
            });
          });
        }
      });

      if (allFavorites.length === 0) return;

      // Check for existing favorites to avoid duplicates
      const { data: existing } = await supabase
        .from('user_favorites')
        .select('product_url')
        .eq('user_id', currentUser.id);

      const existingUrls = new Set((existing || []).map(f => f.product_url));

      // Filter out duplicates
      const newFavorites = allFavorites.filter(f => !existingUrls.has(f.product_url));

      if (newFavorites.length > 0) {
        await supabase.from('user_favorites').insert(newFavorites);
}
    } catch (e) {
}
  }

  async function trackPageView() {
    const pageData = {
      url: window.location.href,
      path: window.location.pathname,
      title: document.title,
      referrer: document.referrer,
      timestamp: new Date().toISOString(),
      user_agent: navigator.userAgent,
      screen_width: window.innerWidth,
      screen_height: window.innerHeight
    };

    // Store in session for analytics
    const views = JSON.parse(sessionStorage.getItem('sg_page_views') || '[]');
    views.push(pageData);
    sessionStorage.setItem('sg_page_views', JSON.stringify(views.slice(-50)));

    // Note: user_activity table not yet created - tracking locally only for now
  }

  function setupBehaviorTracking() {
    // Track scroll depth
    let maxScrollDepth = 0;
    window.addEventListener('scroll', throttle(() => {
      const scrollDepth = Math.round(
        (window.scrollY + window.innerHeight) / document.documentElement.scrollHeight * 100
      );
      maxScrollDepth = Math.max(maxScrollDepth, scrollDepth);
    }, 500));

    // Track time on page before leaving
    window.addEventListener('beforeunload', () => {
      const timeOnPage = Math.round((Date.now() - sessionStartTime) / 1000);

      // Send beacon with engagement data
      if (currentUser && supabase && pageViewId) {
        navigator.sendBeacon('/api/track-engagement', JSON.stringify({
          pageViewId,
          timeOnPage,
          scrollDepth: maxScrollDepth
        }));
      }

      // Store locally for analytics
      const engagement = JSON.parse(localStorage.getItem('sg_engagement') || '{}');
      const path = window.location.pathname;
      engagement[path] = {
        visits: (engagement[path]?.visits || 0) + 1,
        totalTime: (engagement[path]?.totalTime || 0) + timeOnPage,
        avgScrollDepth: Math.round(
          ((engagement[path]?.avgScrollDepth || 0) * (engagement[path]?.visits || 0) + maxScrollDepth) /
          ((engagement[path]?.visits || 0) + 1)
        )
      };
      localStorage.setItem('sg_engagement', JSON.stringify(engagement));
    });

    // Track product views specifically
    if (isProductPage()) {
      trackProductView();
    }

    // Track CTA clicks
    document.addEventListener('click', (e) => {
      const link = e.target.closest('a, button');
      if (!link) return;

      const href = link.href || link.dataset.href;
      const text = link.textContent?.trim();

      // Track estimate/contact CTAs
      if (href?.includes('estimate') || href?.includes('contact') ||
          text?.toLowerCase().includes('estimate') || text?.toLowerCase().includes('quote')) {
        trackEvent('cta_click', {
          type: 'estimate',
          url: href,
          text: text
        });
      }

      // Track account-related clicks
      if (href?.includes('account') || href?.includes('sign-up') || href?.includes('log-in')) {
        trackEvent('cta_click', {
          type: 'account',
          url: href,
          text: text
        });
      }
    });
  }

  function isProductPage() {
    const path = window.location.pathname;
    return path.includes('/countertops/') ||
           path.includes('/tile/') ||
           path.includes('/flooring/') ||
           path.includes('/materials/');
  }

  async function trackProductView() {
    const path = window.location.pathname;
    const productTitle = document.querySelector('h1')?.textContent?.trim();

    // Track recently viewed products
    const recentlyViewed = JSON.parse(localStorage.getItem('sg_recently_viewed') || '[]');

    // Remove if already exists
    const filtered = recentlyViewed.filter(p => p.path !== path);

    // Add to front
    filtered.unshift({
      path,
      title: productTitle,
      image: document.querySelector('meta[property="og:image"]')?.content,
      timestamp: Date.now()
    });

    // Keep last 20
    localStorage.setItem('sg_recently_viewed', JSON.stringify(filtered.slice(0, 20)));

    // Note: user_activity table not yet created - tracking locally only for now
  }

  async function trackEvent(eventType, data) {
    // Store locally
    const events = JSON.parse(sessionStorage.getItem('sg_events') || '[]');
    events.push({
      type: eventType,
      data,
      timestamp: new Date().toISOString()
    });
    sessionStorage.setItem('sg_events', JSON.stringify(events.slice(-100)));

    // Note: user_activity table not yet created - tracking locally only for now
  }

  async function updateUserActivity() {
    if (!currentUser || !supabase) return;

    try {
      // Update last_seen in sg_users table
      await supabase
        .from('sg_users')
        .update({ updated_at: new Date().toISOString() })
        .eq('id', currentUser.id);
    } catch (e) {
      // Silently fail if column doesn't exist
    }
  }

  function updateUserInterface() {
    // Dispatch event for auth-state.js to handle UI updates
    window.dispatchEvent(new CustomEvent('authUIUpdate', {
      detail: { user: currentUser }
    }));

    // Update any user name displays
    document.querySelectorAll('[data-user-name]').forEach(el => {
      if (currentUser) {
        el.textContent = currentUser.user_metadata?.first_name ||
                         currentUser.email?.split('@')[0] ||
                         'User';
      } else {
        el.textContent = 'Guest';
      }
    });

    // Update any user avatar displays
    document.querySelectorAll('[data-user-avatar]').forEach(el => {
      if (currentUser) {
        const initial = (currentUser.user_metadata?.first_name ||
                        currentUser.email || 'U')[0].toUpperCase();
        el.textContent = initial;
        el.style.display = '';
      } else {
        el.style.display = 'none';
      }
    });

    // Show/hide logged-in-only elements
    document.querySelectorAll('[data-logged-in-only]').forEach(el => {
      el.style.display = currentUser ? '' : 'none';
    });

    document.querySelectorAll('[data-logged-out-only]').forEach(el => {
      el.style.display = currentUser ? 'none' : '';
    });
  }

  function detectProductType(path) {
    if (path.includes('countertop') || path.includes('granite') ||
        path.includes('marble') || path.includes('quartz')) return 'countertop';
    if (path.includes('tile')) return 'tile';
    if (path.includes('flooring')) return 'flooring';
    return 'general';
  }

  function throttle(func, wait) {
    let timeout = null;
    let lastArgs = null;

    return function(...args) {
      lastArgs = args;
      if (!timeout) {
        timeout = setTimeout(() => {
          func.apply(this, lastArgs);
          timeout = null;
        }, wait);
      }
    };
  }

  // Expose for other scripts
  window.SurpriseGraniteTracking = {
    getUser: () => currentUser,
    getSupabase: () => supabase,
    trackEvent,
    isLoggedIn: () => !!currentUser
  };

})();
