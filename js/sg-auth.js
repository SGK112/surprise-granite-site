/**
 * Surprise Granite - Unified Authentication Service
 * Provides consistent auth state across all pages
 * Syncs with Supabase and updates UI globally
 *
 * Uses centralized configuration from /js/config.js
 */

(function() {
  'use strict';

  // Use centralized config or fallback to defaults
  const config = window.SG_CONFIG || {};
  const SUPABASE_URL = config.SUPABASE_URL || 'https://ypeypgwsycxcagncgdur.supabase.co';
  const SUPABASE_ANON_KEY = config.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlwZXlwZ3dzeWN4Y2FnbmNnZHVyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njc3NTQ4MjMsImV4cCI6MjA4MzMzMDgyM30.R13pNv2FDtGhfeu7gUcttYNrQAbNYitqR4FIq3O2-ME';

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
        // Wait for global client to be available (created by supabase-init.js)
        let attempts = 0;
        while (!window._sgSupabaseClient && attempts < 50) {
          await new Promise(r => setTimeout(r, 100));
          attempts++;
        }

        if (window._sgSupabaseClient) {
          supabaseClient = window._sgSupabaseClient;
        } else {
          console.warn('SG Auth: Global Supabase client not found, continuing without auth');
          isInitialized = true;
          return;
        }

        // Get current session with error handling for AbortError
        try {
          console.log('SG Auth: Checking for existing session...');
          const { data: { session }, error } = await supabaseClient.auth.getSession();

          console.log('SG Auth: Session check result:', {
            hasSession: !!session,
            error: error?.message,
            userEmail: session?.user?.email,
            provider: session?.user?.app_metadata?.provider
          });

          if (session && !error) {
            currentUser = session.user;
            await loadUserProfile();
            console.log('SG Auth: User logged in', currentUser.email, 'account_type:', userProfile?.account_type);
          } else {
            console.log('SG Auth: No active session found');
          }
        } catch (sessionErr) {
          // AbortError happens when page is refreshing or network issues
          if (sessionErr.name === 'AbortError') {
            console.log('SG Auth: Session check aborted (page refresh or network)');
          } else {
            console.warn('SG Auth: Session check error', sessionErr.message);
          }
          // Continue without session - user can log in manually
        }

        // Listen for auth changes
        try {
          supabaseClient.auth.onAuthStateChange(async (event, session) => {
            console.log('SG Auth: State change', event);

            if (event === 'SIGNED_IN' && session) {
              currentUser = session.user;
              await loadUserProfile();
              notifyListeners('login', { user: currentUser, profile: userProfile });
              updateNavUI();
              // Sync any local favorites to database
              syncLocalFavoritesToDB();
              // Auto-claim pending collaboration invitations
              claimPendingInvitations();
            } else if (event === 'SIGNED_OUT') {
              currentUser = null;
              userProfile = null;
              notifyListeners('logout', null);
              updateNavUI();
            } else if (event === 'TOKEN_REFRESHED') {
              console.log('SG Auth: Token refreshed');
            }
          });
        } catch (listenerErr) {
          console.warn('SG Auth: Could not set up auth listener', listenerErr.message);
        }

        isInitialized = true;
        updateNavUI();
        notifyListeners('init', { user: currentUser, profile: userProfile });

      } catch (e) {
        // Handle AbortError specifically - it's usually benign (page refresh, etc)
        if (e.name === 'AbortError') {
          console.log('SG Auth: Init aborted (page refresh or navigation)');
        } else {
          console.error('SG Auth: Init error', e);
        }
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
        console.log('SG Auth: Profile loaded, account_type:', userProfile.account_type);

        // Load linked Shopify customer data if available
        if (userProfile.shopify_customer_id) {
          await loadShopifyCustomerData(userProfile.shopify_customer_id);
        }
      } else {
        // Create profile if doesn't exist
        // Check user_metadata for account_type (may be set via OAuth or signup)
        const metadataAccountType = currentUser.user_metadata?.account_type;
        const accountType = metadataAccountType || 'homeowner';

        console.log('SG Auth: Creating new profile, account_type:', accountType);

        const { data: newProfile } = await supabaseClient
          .from('sg_users')
          .insert([{
            id: currentUser.id,
            email: currentUser.email,
            full_name: currentUser.user_metadata?.full_name || '',
            account_type: accountType
          }])
          .select()
          .single();

        userProfile = newProfile;

        // Try to link Shopify customer by email (trigger will do this, but also try here)
        await linkShopifyCustomerByEmail(currentUser.email);
      }
    } catch (e) {
      console.error('SG Auth: Error loading profile', e);
    }

    return userProfile;
  }

  // Load linked Shopify customer data
  let shopifyCustomerData = null;

  async function loadShopifyCustomerData(shopifyCustomerId) {
    if (!supabaseClient || !shopifyCustomerId) return null;

    try {
      const { data, error } = await supabaseClient
        .from('shopify_customers')
        .select('*')
        .eq('id', shopifyCustomerId)
        .single();

      if (!error && data) {
        shopifyCustomerData = data;
        console.log('SG Auth: Shopify customer data loaded', {
          totalOrders: data.total_orders,
          totalSpent: data.total_spent
        });
      }
    } catch (e) {
      console.error('SG Auth: Error loading Shopify customer data', e);
    }

    return shopifyCustomerData;
  }

  // Link Shopify customer by email
  async function linkShopifyCustomerByEmail(email) {
    if (!supabaseClient || !currentUser || !email) return false;

    try {
      // Find Shopify customer by email
      const { data: shopifyCustomer } = await supabaseClient
        .from('shopify_customers')
        .select('id')
        .ilike('email', email)
        .single();

      if (shopifyCustomer) {
        // Update sg_users with the link
        await supabaseClient
          .from('sg_users')
          .update({ shopify_customer_id: shopifyCustomer.id })
          .eq('id', currentUser.id);

        userProfile.shopify_customer_id = shopifyCustomer.id;
        await loadShopifyCustomerData(shopifyCustomer.id);
        console.log('SG Auth: Linked Shopify customer to account');
        return true;
      }
    } catch (e) {
      console.log('SG Auth: No Shopify customer found for email');
    }

    return false;
  }

  // Get Shopify customer data
  function getShopifyCustomer() {
    return shopifyCustomerData;
  }

  // Get user's complete order history (from both website orders and Shopify history)
  async function getOrderHistory() {
    if (!currentUser || !supabaseClient) return [];

    try {
      // Get orders from both tables in parallel
      const [websiteOrders, shopifyOrders] = await Promise.all([
        // Website orders (from checkout)
        supabaseClient
          .from('orders')
          .select('*')
          .eq('customer_email', currentUser.email)
          .order('created_at', { ascending: false }),
        // Historical Shopify orders
        supabaseClient
          .from('shopify_orders')
          .select('*')
          .eq('customer_email', currentUser.email)
          .order('shopify_created_at', { ascending: false })
      ]);

      // Normalize website orders to match shopify format
      const normalizedWebsiteOrders = (websiteOrders.data || []).map(o => ({
        ...o,
        order_number: o.order_number,
        total: o.total,
        financial_status: o.payment_status === 'paid' ? 'PAID' : 'PENDING',
        fulfillment_status: o.status === 'shipped' ? 'FULFILLED' : 'UNFULFILLED',
        shopify_created_at: o.created_at,
        line_items: o.items || [],
        source: 'website'
      }));

      // Mark Shopify orders with source
      const normalizedShopifyOrders = (shopifyOrders.data || []).map(o => ({
        ...o,
        source: 'shopify'
      }));

      // Combine and sort by date
      const allOrders = [...normalizedWebsiteOrders, ...normalizedShopifyOrders]
        .sort((a, b) => new Date(b.shopify_created_at) - new Date(a.shopify_created_at));

      return allOrders;
    } catch (e) {
      console.error('SG Auth: Error getting order history', e);
    }

    return [];
  }

  // Get recent orders (limit 5)
  async function getRecentOrders() {
    if (!currentUser || !supabaseClient) return [];

    try {
      const allOrders = await getOrderHistory();
      return allOrders.slice(0, 5);
    } catch (e) {
      console.error('SG Auth: Error getting recent orders', e);
    }

    return [];
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

  // Sign out - comprehensive cleanup
  async function signOut(options = {}) {
    const { redirect = true, redirectUrl = '/' } = options;

    try {
      if (supabaseClient) {
        await supabaseClient.auth.signOut();
      }
    } catch (e) {
      console.warn('SG Auth: Error during signOut', e);
    }

    // Clear all auth state
    currentUser = null;
    userProfile = null;

    // Clear auth-related localStorage items
    try {
      const storageKey = window._sgSupabaseConfig?.storageKey || 'sg-auth-token';
      localStorage.removeItem(storageKey);
      // Also clear any legacy keys
      localStorage.removeItem('sb-ypeypgwsycxcagncgdur-auth-token');
      // Clear session storage
      sessionStorage.removeItem('auth_redirect');
    } catch (e) {
      console.warn('SG Auth: Error clearing storage', e);
    }

    // Update UI across all components
    updateNavUI();

    // Notify all listeners
    notifyListeners('logout', null);

    // Dispatch global event for other scripts to react
    window.dispatchEvent(new CustomEvent('sg-auth-logout', {
      detail: { timestamp: Date.now() }
    }));

    // Redirect if requested
    if (redirect) {
      window.location.href = redirectUrl;
    }
  }

  // Sign in with OAuth provider (Google, etc.)
  async function signInWithOAuth(provider, options = {}) {
    if (!supabaseClient) await init();

    // Default redirect to current page or account page
    const redirectTo = options.redirectTo || window.location.origin + '/account/';

    const { data, error } = await supabaseClient.auth.signInWithOAuth({
      provider: provider,
      options: {
        redirectTo: redirectTo,
        queryParams: options.queryParams || {}
      }
    });

    if (error) throw error;
    return data;
  }

  // Convenience method for Google sign-in
  async function signInWithGoogle(redirectTo) {
    return signInWithOAuth('google', { redirectTo });
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

  // ============ API Request Helpers ============

  /**
   * Get current JWT access token for API calls
   */
  async function getAccessToken() {
    if (!supabaseClient) await init();

    const { data: { session } } = await supabaseClient.auth.getSession();
    return session?.access_token || null;
  }

  /**
   * Make authenticated API request with JWT
   * @param {string} path - API endpoint path (e.g., '/api/marketplace/slabs')
   * @param {Object} options - Fetch options (method, body, headers, etc.)
   */
  async function apiRequest(path, options = {}) {
    const API_BASE = window.SG_CONFIG?.API_BASE || 'https://surprise-granite-email-api.onrender.com';
    const token = await getAccessToken();

    const headers = {
      'Content-Type': 'application/json',
      ...options.headers
    };

    // Add JWT token if available
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    // Add user ID as fallback for legacy endpoints
    if (currentUser?.id && !options.skipLegacyHeaders) {
      headers['X-User-ID'] = currentUser.id;
    }

    const response = await fetch(`${API_BASE}${path}`, {
      ...options,
      headers
    });

    // Handle 401 - try to refresh token
    if (response.status === 401 && supabaseClient) {
      const { data: { session }, error } = await supabaseClient.auth.refreshSession();

      if (session && !error) {
        // Retry with new token
        headers['Authorization'] = `Bearer ${session.access_token}`;
        return fetch(`${API_BASE}${path}`, { ...options, headers });
      }

      // Refresh failed - dispatch event for UI to handle
      window.dispatchEvent(new CustomEvent('sg-auth-required', {
        detail: { path, reason: 'token_expired' }
      }));
    }

    return response;
  }

  /**
   * Make authenticated GET request
   */
  async function apiGet(path) {
    return apiRequest(path, { method: 'GET' });
  }

  /**
   * Make authenticated POST request
   */
  async function apiPost(path, data) {
    return apiRequest(path, {
      method: 'POST',
      body: JSON.stringify(data)
    });
  }

  /**
   * Make authenticated PATCH request
   */
  async function apiPatch(path, data) {
    return apiRequest(path, {
      method: 'PATCH',
      body: JSON.stringify(data)
    });
  }

  /**
   * Make authenticated DELETE request
   */
  async function apiDelete(path) {
    return apiRequest(path, { method: 'DELETE' });
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

    // Get all local favorites from all possible storage keys
    let localFavorites = {};
    try {
      const stored = localStorage.getItem('sg_favorites');
      if (stored) localFavorites = JSON.parse(stored);

      // Also check unified key
      const unified = localStorage.getItem('sg_all_favorites');
      if (unified) {
        const unifiedParsed = JSON.parse(unified);
        Object.keys(unifiedParsed).forEach(type => {
          if (!localFavorites[type]) localFavorites[type] = [];
          localFavorites[type] = [...localFavorites[type], ...unifiedParsed[type]];
        });
      }
    } catch (e) {
      console.warn('SG Auth: Error reading local favorites', e);
      return;
    }

    const allLocal = Object.entries(localFavorites).flatMap(([type, items]) =>
      (items || []).map(item => ({ ...item, productType: type }))
    );

    if (allLocal.length === 0) return;

    console.log('SG Auth: Syncing', allLocal.length, 'local favorites to database');

    try {
      // Get all existing favorites from database in one query
      const { data: existingFavorites, error: fetchError } = await supabaseClient
        .from('user_favorites')
        .select('product_url, product_title')
        .eq('user_id', currentUser.id);

      if (fetchError) {
        console.error('SG Auth: Error fetching existing favorites', fetchError);
        return;
      }

      // Build set of existing URLs and titles for fast lookup
      const existingUrls = new Set((existingFavorites || []).map(f => f.product_url));
      const existingTitles = new Set((existingFavorites || []).map(f => f.product_title));

      // Filter to only new items (not already in database)
      const newItems = allLocal.filter(item =>
        !existingUrls.has(item.url) && !existingTitles.has(item.title)
      );

      if (newItems.length > 0) {
        // Deduplicate new items by URL
        const seen = new Set();
        const uniqueNewItems = newItems.filter(item => {
          const key = item.url || item.title;
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        });

        // Insert all new items in one batch
        const toInsert = uniqueNewItems.map(item => ({
          user_id: currentUser.id,
          product_title: item.title,
          product_url: item.url,
          product_image: item.image,
          product_material: item.material || '',
          product_color: item.color || '',
          product_type: item.productType
        }));

        const { error: insertError } = await supabaseClient
          .from('user_favorites')
          .insert(toInsert);

        if (insertError) {
          console.error('SG Auth: Error syncing favorites', insertError);
        } else {
          console.log('SG Auth: Synced', toInsert.length, 'new favorites to database');
        }
      }
    } catch (e) {
      console.error('SG Auth: Error during favorites sync', e);
    }

    // Clear local favorites after successful sync
    try {
      localStorage.removeItem('sg_favorites');
      localStorage.removeItem('sg_all_favorites');
      localStorage.removeItem('sg_flooring_favorites');
      localStorage.removeItem('sg_countertop_favorites');
    } catch (e) {}

    updateFavoritesBadge();
  }

  // ============ Collaboration Invite Claim ============

  async function claimPendingInvitations() {
    if (!currentUser || !supabaseClient) return { claimedCount: 0 };

    try {
      let tokenAccepted = false;

      // Check for stored invite token (from sign-up flow)
      const storedToken = sessionStorage.getItem('sg_invite_token') || localStorage.getItem('sg_invite_token');
      if (storedToken) {
        sessionStorage.removeItem('sg_invite_token');
        localStorage.removeItem('sg_invite_token');
        try {
          const acceptResp = await apiPost('/api/collaboration/invite/accept', { token: storedToken });
          if (acceptResp.ok) {
            tokenAccepted = true;
            const acceptData = await acceptResp.json();
            if (acceptData.projectId) {
              sessionStorage.setItem('sg_accepted_project_id', acceptData.projectId);
            }
          }
        } catch (e) {
          console.warn('SG Auth: Token accept failed', e);
        }
      }

      // Claim all pending invitations matching user's email
      let claimedCount = 0;
      try {
        const claimResp = await apiPost('/api/collaboration/invite/claim', {});
        if (claimResp.ok) {
          const claimData = await claimResp.json();
          claimedCount = claimData.claimedCount || 0;
        }
      } catch (e) {
        console.warn('SG Auth: Claim invitations failed', e);
      }

      const totalClaimed = claimedCount + (tokenAccepted ? 1 : 0);
      if (totalClaimed > 0) {
        console.log('SG Auth: Claimed', totalClaimed, 'collaboration invitation(s)');
        window.dispatchEvent(new CustomEvent('sg-invitations-claimed', {
          detail: { count: totalClaimed }
        }));
      }

      return { claimedCount: totalClaimed, tokenAccepted };
    } catch (e) {
      // 403 expected for homeowner accounts - silently ignore
      console.log('SG Auth: Could not claim invitations', e.message || e);
      return { claimedCount: 0 };
    }
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
    signInWithOAuth,
    signInWithGoogle,
    getUser,
    getProfile,
    isLoggedIn,
    getClient,
    onAuthChange,
    updateNavUI,
    // API helpers with JWT
    getAccessToken,
    apiRequest,
    apiGet,
    apiPost,
    apiPatch,
    apiDelete,
    // User data
    getFavorites,
    addFavorite,
    removeFavorite,
    getListingsCount,
    getQuotesCount,
    getDashboardStats,
    updateFavoritesBadge,
    syncLocalFavoritesToDB,
    // Collaboration
    claimPendingInvitations,
    // Shopify customer data
    getShopifyCustomer,
    getOrderHistory,
    getRecentOrders,
    linkShopifyCustomerByEmail
  };

})();
