/**
 * Surprise Granite - Unified Authentication Service
 * Provides consistent auth state across all pages
 * Syncs with Supabase and updates UI globally
 */

(function() {
  'use strict';

  // Supabase Configuration
  const SUPABASE_URL = 'https://ypeypgwsycxcagncgdur.supabase.co';
  const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlwZXlwZ3dzeWN4Y2FnbmNnZHVyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njc3NTQ4MjMsImV4cCI6MjA4MzMzMDgyM30.R13pNv2FDtGhfeu7gUcttYNrQAbNYitqR4FIq3O2-ME';

  // State
  let supabaseClient = null;
  let currentUser = null;
  let userProfile = null;
  let isInitialized = false;
  let initPromise = null;
  const authListeners = [];

  // Initialize Supabase and auth state
  async function init() {
    if (initPromise) return initPromise;

    initPromise = (async () => {
      try {
        // Wait for Supabase library to load
        await waitForSupabase();

        const { createClient } = window.supabase;
        supabaseClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
          auth: {
            persistSession: true,
            autoRefreshToken: true,
            detectSessionInUrl: true,
            storageKey: 'sb-ypeypgwsycxcagncgdur-auth-token',
            flowType: 'pkce'
          }
        });

        // Get current session
        const { data: { session }, error } = await supabaseClient.auth.getSession();

        if (session && !error) {
          currentUser = session.user;
          await loadUserProfile();
          console.log('SG Auth: User logged in', currentUser.email);
        }

        // Listen for auth changes
        supabaseClient.auth.onAuthStateChange(async (event, session) => {
          console.log('SG Auth: State change', event);

          if (event === 'SIGNED_IN' && session) {
            currentUser = session.user;
            await loadUserProfile();
            notifyListeners('login', { user: currentUser, profile: userProfile });
            updateNavUI();
          } else if (event === 'SIGNED_OUT') {
            currentUser = null;
            userProfile = null;
            notifyListeners('logout', null);
            updateNavUI();
          } else if (event === 'TOKEN_REFRESHED') {
            console.log('SG Auth: Token refreshed');
          }
        });

        isInitialized = true;
        updateNavUI();
        notifyListeners('init', { user: currentUser, profile: userProfile });

      } catch (e) {
        console.error('SG Auth: Init error', e);
        isInitialized = true;
      }
    })();

    return initPromise;
  }

  // Wait for Supabase library
  function waitForSupabase() {
    return new Promise((resolve) => {
      if (window.supabase && window.supabase.createClient) {
        resolve();
        return;
      }

      let attempts = 0;
      const check = setInterval(() => {
        attempts++;
        if (window.supabase && window.supabase.createClient) {
          clearInterval(check);
          resolve();
        } else if (attempts > 50) {
          clearInterval(check);
          console.warn('SG Auth: Supabase library not loaded');
          resolve();
        }
      }, 100);
    });
  }

  // Load user profile from sg_users table
  async function loadUserProfile() {
    if (!currentUser || !supabaseClient) return null;

    try {
      const { data, error } = await supabaseClient
        .from('sg_users')
        .select('*')
        .eq('id', currentUser.id)
        .single();

      if (!error && data) {
        userProfile = data;
      } else {
        // Create profile if doesn't exist
        const { data: newProfile } = await supabaseClient
          .from('sg_users')
          .insert([{
            id: currentUser.id,
            email: currentUser.email,
            full_name: currentUser.user_metadata?.full_name || '',
            account_type: 'homeowner'
          }])
          .select()
          .single();

        userProfile = newProfile;
      }
    } catch (e) {
      console.error('SG Auth: Error loading profile', e);
    }

    return userProfile;
  }

  // Sign in with email/password
  async function signIn(email, password) {
    if (!supabaseClient) await init();

    const { data, error } = await supabaseClient.auth.signInWithPassword({
      email,
      password
    });

    if (error) throw error;

    currentUser = data.user;
    await loadUserProfile();
    updateNavUI();

    return { user: currentUser, profile: userProfile };
  }

  // Sign up new user
  async function signUp(email, password, metadata = {}) {
    if (!supabaseClient) await init();

    const { data, error } = await supabaseClient.auth.signUp({
      email,
      password,
      options: {
        data: metadata
      }
    });

    if (error) throw error;

    // Create profile entry
    if (data.user) {
      await supabaseClient.from('sg_users').insert([{
        id: data.user.id,
        email: email,
        full_name: metadata.full_name || '',
        phone: metadata.phone || '',
        account_type: metadata.account_type || 'homeowner'
      }]);
    }

    return data;
  }

  // Sign out
  async function signOut() {
    if (!supabaseClient) return;

    await supabaseClient.auth.signOut();
    currentUser = null;
    userProfile = null;
    updateNavUI();
  }

  // Get current user
  function getUser() {
    return currentUser;
  }

  // Get user profile
  function getProfile() {
    return userProfile;
  }

  // Check if logged in
  function isLoggedIn() {
    return !!currentUser;
  }

  // Get Supabase client for direct queries
  function getClient() {
    return supabaseClient;
  }

  // Subscribe to auth changes
  function onAuthChange(callback) {
    authListeners.push(callback);

    // If already initialized, call immediately
    if (isInitialized) {
      callback(currentUser ? 'init' : 'init', { user: currentUser, profile: userProfile });
    }

    // Return unsubscribe function
    return () => {
      const idx = authListeners.indexOf(callback);
      if (idx > -1) authListeners.splice(idx, 1);
    };
  }

  // Notify all listeners
  function notifyListeners(event, data) {
    authListeners.forEach(cb => {
      try {
        cb(event, data);
      } catch (e) {
        console.error('SG Auth: Listener error', e);
      }
    });
  }

  // Update navigation UI based on auth state
  function updateNavUI() {
    // Update account link in unified nav
    const accountLinks = document.querySelectorAll('.unified-nav-account, [href="/account"], [href="/account/"]');

    accountLinks.forEach(link => {
      if (currentUser) {
        // Show user initial or name
        const initial = userProfile?.full_name?.charAt(0) || currentUser.email.charAt(0).toUpperCase();
        const displayName = userProfile?.full_name?.split(' ')[0] || 'Account';

        // Update text if it has a text node
        const textNode = link.querySelector('.account-text, span');
        if (textNode) {
          textNode.textContent = displayName;
        }

        link.classList.add('logged-in');
        link.setAttribute('title', currentUser.email);
      } else {
        const textNode = link.querySelector('.account-text, span');
        if (textNode) {
          textNode.textContent = 'Account';
        }
        link.classList.remove('logged-in');
        link.removeAttribute('title');
      }
    });

    // Update favorites badge count
    updateFavoritesBadge();

    // Dispatch custom event for other components
    window.dispatchEvent(new CustomEvent('sg-auth-change', {
      detail: { user: currentUser, profile: userProfile }
    }));
  }

  // Update favorites badge in nav
  async function updateFavoritesBadge() {
    if (!currentUser || !supabaseClient) {
      setFavoritesBadgeCount(getLocalFavoritesCount());
      return;
    }

    try {
      const { count, error } = await supabaseClient
        .from('user_favorites')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', currentUser.id);

      if (!error) {
        setFavoritesBadgeCount(count || 0);
      }
    } catch (e) {
      console.error('SG Auth: Error getting favorites count', e);
    }
  }

  // Set the badge count in UI
  function setFavoritesBadgeCount(count) {
    const badges = document.querySelectorAll('.favorites-badge, .sg-favorites-badge-count, #favoritesBadge');
    badges.forEach(badge => {
      badge.textContent = count;
      badge.style.display = count > 0 ? 'flex' : 'none';
    });

    // Update floating favorites badge if exists
    const floatingBadge = document.querySelector('.sg-favorites-floating-btn .sg-favorites-badge-count');
    if (floatingBadge) {
      floatingBadge.textContent = count;
      floatingBadge.style.display = count > 0 ? 'flex' : 'none';
    }
  }

  // Get local favorites count (fallback)
  function getLocalFavoritesCount() {
    try {
      const stored = localStorage.getItem('sg_favorites');
      if (stored) {
        const favorites = JSON.parse(stored);
        return Object.values(favorites).flat().length;
      }
    } catch (e) {}
    return 0;
  }

  // ============ User Data Methods ============

  // Get user's favorites
  async function getFavorites() {
    if (!currentUser || !supabaseClient) {
      return getLocalFavorites();
    }

    try {
      const { data, error } = await supabaseClient
        .from('user_favorites')
        .select('*')
        .eq('user_id', currentUser.id)
        .order('created_at', { ascending: false });

      if (!error && data) {
        return data;
      }
    } catch (e) {
      console.error('SG Auth: Error getting favorites', e);
    }

    return [];
  }

  // Get local favorites
  function getLocalFavorites() {
    try {
      const stored = localStorage.getItem('sg_favorites');
      if (stored) {
        return JSON.parse(stored);
      }
    } catch (e) {}
    return {};
  }

  // Add favorite
  async function addFavorite(product, productType = 'general') {
    if (!currentUser || !supabaseClient) {
      return addLocalFavorite(product, productType);
    }

    try {
      const { data, error } = await supabaseClient
        .from('user_favorites')
        .insert([{
          user_id: currentUser.id,
          product_title: product.title,
          product_url: product.url,
          product_image: product.image,
          product_material: product.material || '',
          product_color: product.color || '',
          product_type: productType
        }])
        .select()
        .single();

      if (!error) {
        updateFavoritesBadge();
        return data;
      }
    } catch (e) {
      console.error('SG Auth: Error adding favorite', e);
    }

    return null;
  }

  // Remove favorite
  async function removeFavorite(productTitle, productUrl) {
    if (!currentUser || !supabaseClient) {
      return removeLocalFavorite(productTitle, productUrl);
    }

    try {
      const { error } = await supabaseClient
        .from('user_favorites')
        .delete()
        .eq('user_id', currentUser.id)
        .or(`product_title.eq.${productTitle},product_url.eq.${productUrl}`);

      if (!error) {
        updateFavoritesBadge();
        return true;
      }
    } catch (e) {
      console.error('SG Auth: Error removing favorite', e);
    }

    return false;
  }

  // Local storage favorites helpers
  function addLocalFavorite(product, productType) {
    const favorites = getLocalFavorites();
    if (!favorites[productType]) favorites[productType] = [];
    favorites[productType].push(product);
    localStorage.setItem('sg_favorites', JSON.stringify(favorites));
    updateFavoritesBadge();
    return product;
  }

  function removeLocalFavorite(productTitle, productUrl) {
    const favorites = getLocalFavorites();
    Object.keys(favorites).forEach(type => {
      favorites[type] = favorites[type].filter(f =>
        f.title !== productTitle && f.url !== productUrl
      );
    });
    localStorage.setItem('sg_favorites', JSON.stringify(favorites));
    updateFavoritesBadge();
    return true;
  }

  // Get user's listings count
  async function getListingsCount() {
    if (!currentUser || !supabaseClient) return 0;

    try {
      const { count, error } = await supabaseClient
        .from('marketplace_listings')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', currentUser.id);

      return error ? 0 : (count || 0);
    } catch (e) {
      return 0;
    }
  }

  // Get user's quotes count
  async function getQuotesCount() {
    if (!currentUser || !supabaseClient) return 0;

    try {
      const { count, error } = await supabaseClient
        .from('quote_requests')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', currentUser.id);

      return error ? 0 : (count || 0);
    } catch (e) {
      return 0;
    }
  }

  // Get dashboard stats
  async function getDashboardStats() {
    const [favoritesCount, listingsCount, quotesCount] = await Promise.all([
      getFavorites().then(f => Array.isArray(f) ? f.length : Object.values(f).flat().length),
      getListingsCount(),
      getQuotesCount()
    ]);

    return {
      favorites: favoritesCount,
      listings: listingsCount,
      quotes: quotesCount
    };
  }

  // Sync local favorites to database after login
  async function syncLocalFavoritesToDB() {
    if (!currentUser || !supabaseClient) return;

    const localFavorites = getLocalFavorites();
    const allLocal = Object.entries(localFavorites).flatMap(([type, items]) =>
      items.map(item => ({ ...item, productType: type }))
    );

    if (allLocal.length === 0) return;

    console.log('SG Auth: Syncing', allLocal.length, 'local favorites to database');

    for (const item of allLocal) {
      try {
        // Check if already exists
        const { data: existing } = await supabaseClient
          .from('user_favorites')
          .select('id')
          .eq('user_id', currentUser.id)
          .eq('product_url', item.url)
          .single();

        if (!existing) {
          await supabaseClient.from('user_favorites').insert([{
            user_id: currentUser.id,
            product_title: item.title,
            product_url: item.url,
            product_image: item.image,
            product_material: item.material || '',
            product_color: item.color || '',
            product_type: item.productType
          }]);
        }
      } catch (e) {
        // Ignore duplicates
      }
    }

    // Clear local after sync
    localStorage.removeItem('sg_favorites');
    updateFavoritesBadge();
  }

  // Initialize on load
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // Expose global API
  window.SgAuth = {
    init,
    signIn,
    signUp,
    signOut,
    getUser,
    getProfile,
    isLoggedIn,
    getClient,
    onAuthChange,
    updateNavUI,
    getFavorites,
    addFavorite,
    removeFavorite,
    getListingsCount,
    getQuotesCount,
    getDashboardStats,
    updateFavoritesBadge,
    syncLocalFavoritesToDB
  };

})();
