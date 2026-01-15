/**
 * Surprise Granite - Enterprise SSO Authentication
 * Handles SSO (Google Workspace, Microsoft Azure AD), JWT tokens,
 * role-based access, and enterprise distributor authentication.
 */

(function() {
  'use strict';

  const API_BASE = window.SG_CONFIG?.API_BASE || 'https://surprise-granite-email-api.onrender.com';

  // Cache for SSO domain checks
  const ssoCache = new Map();
  const SSO_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

  // Current distributor context
  let currentDistributorId = null;
  let currentRole = null;
  let currentPermissions = null;

  /**
   * Get Supabase client (from supabase-init.js)
   */
  function getSupabase() {
    return window._sgSupabaseClient || window.SG_SUPABASE;
  }

  /**
   * Get current JWT access token
   */
  async function getAccessToken() {
    const supabase = getSupabase();
    if (!supabase) return null;

    const { data: { session } } = await supabase.auth.getSession();
    return session?.access_token || null;
  }

  /**
   * Make authenticated API request with JWT
   */
  async function apiRequest(path, options = {}) {
    const token = await getAccessToken();

    const headers = {
      'Content-Type': 'application/json',
      ...options.headers
    };

    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    // Add distributor context if available
    if (currentDistributorId && !options.skipDistributorContext) {
      headers['X-Distributor-ID'] = currentDistributorId;
    }

    const response = await fetch(`${API_BASE}${path}`, {
      ...options,
      headers
    });

    // Handle common auth errors
    if (response.status === 401) {
      // Token expired or invalid - try to refresh
      const supabase = getSupabase();
      if (supabase) {
        const { data: { session }, error } = await supabase.auth.refreshSession();
        if (session && !error) {
          // Retry with new token
          headers['Authorization'] = `Bearer ${session.access_token}`;
          return fetch(`${API_BASE}${path}`, { ...options, headers });
        }
      }

      // Refresh failed - redirect to login
      const event = new CustomEvent('sg-auth-required', {
        detail: { path, reason: 'token_expired' }
      });
      window.dispatchEvent(event);
    }

    return response;
  }

  /**
   * Check if email domain requires SSO
   * @param {string} email - User's email address
   * @returns {Promise<Object>} SSO configuration or null
   */
  async function checkSSODomain(email) {
    if (!email || !email.includes('@')) return null;

    const domain = email.split('@')[1].toLowerCase();

    // Check cache first
    const cacheKey = domain;
    const cached = ssoCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < SSO_CACHE_TTL) {
      return cached.data;
    }

    try {
      const response = await fetch(`${API_BASE}/api/auth/check-sso-domain`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email })
      });

      if (!response.ok) {
        return null;
      }

      const data = await response.json();

      // Cache the result
      ssoCache.set(cacheKey, {
        data: data.sso_required ? data : null,
        timestamp: Date.now()
      });

      return data.sso_required ? data : null;
    } catch (error) {
      console.error('SSO domain check error:', error);
      return null;
    }
  }

  /**
   * Sign in with Google (Workspace)
   * @param {Object} options - Sign in options
   * @param {string} options.hd - Hosted domain restriction (e.g., 'msistone.com')
   * @param {string} options.redirectTo - Where to redirect after auth
   */
  async function signInWithGoogle(options = {}) {
    const supabase = getSupabase();
    if (!supabase) {
      throw new Error('Supabase client not initialized');
    }

    const redirectTo = options.redirectTo ||
      sessionStorage.getItem('auth_redirect') ||
      window.location.origin + '/distributor/dashboard/';

    const authOptions = {
      provider: 'google',
      options: {
        redirectTo,
        scopes: 'openid email profile'
      }
    };

    // Restrict to specific domain for Google Workspace
    if (options.hd) {
      authOptions.options.queryParams = {
        hd: options.hd,
        prompt: 'select_account'
      };
    }

    const { data, error } = await supabase.auth.signInWithOAuth(authOptions);

    if (error) {
      throw error;
    }

    return data;
  }

  /**
   * Sign in with Microsoft Azure AD
   * @param {Object} options - Sign in options
   * @param {string} options.tenant - Azure AD tenant ID (optional)
   * @param {string} options.redirectTo - Where to redirect after auth
   */
  async function signInWithAzure(options = {}) {
    const supabase = getSupabase();
    if (!supabase) {
      throw new Error('Supabase client not initialized');
    }

    const redirectTo = options.redirectTo ||
      sessionStorage.getItem('auth_redirect') ||
      window.location.origin + '/distributor/dashboard/';

    const authOptions = {
      provider: 'azure',
      options: {
        redirectTo,
        scopes: 'openid email profile'
      }
    };

    // Use specific tenant if provided
    if (options.tenant) {
      authOptions.options.queryParams = {
        tenant: options.tenant
      };
    }

    const { data, error } = await supabase.auth.signInWithOAuth(authOptions);

    if (error) {
      throw error;
    }

    return data;
  }

  /**
   * Handle SSO callback after OAuth redirect
   * Auto-provisions user if needed
   */
  async function handleSSOCallback() {
    const supabase = getSupabase();
    if (!supabase) return null;

    try {
      // Get session from URL hash (implicit flow)
      const { data: { session }, error } = await supabase.auth.getSession();

      if (error || !session) {
        return null;
      }

      // Check if user needs to be provisioned for their distributor
      const userEmail = session.user.email;
      const ssoConfig = await checkSSODomain(userEmail);

      if (ssoConfig && ssoConfig.auto_provision) {
        // Auto-provision user for the distributor
        try {
          await apiRequest('/api/auth/provision-sso-user', {
            method: 'POST',
            body: JSON.stringify({
              distributor_id: ssoConfig.distributor_id
            })
          });
        } catch (e) {
          console.warn('Auto-provision failed (user may already exist):', e);
        }
      }

      // Load user's distributor access
      await loadUserDistributors();

      return session;
    } catch (error) {
      console.error('SSO callback error:', error);
      return null;
    }
  }

  /**
   * Load user's distributor access and roles
   */
  async function loadUserDistributors() {
    try {
      const response = await apiRequest('/api/auth/my-distributors');

      if (!response.ok) {
        return [];
      }

      const data = await response.json();
      const distributors = data.distributors || [];

      // If only one distributor, set as current context
      if (distributors.length === 1) {
        currentDistributorId = distributors[0].distributor_id;
        currentRole = distributors[0].role;
        currentPermissions = distributors[0].permissions;
      }

      return distributors;
    } catch (error) {
      console.error('Error loading distributors:', error);
      return [];
    }
  }

  /**
   * Get user's role for a specific distributor
   * @param {string} distributorId - Distributor UUID
   */
  async function getUserRole(distributorId) {
    try {
      const response = await apiRequest(`/api/auth/role/${distributorId}`);

      if (!response.ok) {
        return null;
      }

      const data = await response.json();

      // Update current context
      currentDistributorId = distributorId;
      currentRole = data.role;
      currentPermissions = data.permissions;

      return data;
    } catch (error) {
      console.error('Error getting user role:', error);
      return null;
    }
  }

  /**
   * Set current distributor context
   * @param {string} distributorId - Distributor UUID
   */
  async function setDistributorContext(distributorId) {
    const role = await getUserRole(distributorId);
    if (!role) {
      throw new Error('No access to this distributor');
    }

    // Store in session for page refreshes
    sessionStorage.setItem('sg_distributor_context', distributorId);

    // Dispatch event for UI updates
    window.dispatchEvent(new CustomEvent('sg-distributor-changed', {
      detail: {
        distributorId,
        role: currentRole,
        permissions: currentPermissions
      }
    }));

    return role;
  }

  /**
   * Check if current user has a specific permission
   * @param {string} resource - Resource name (e.g., 'inventory', 'team')
   * @param {string} action - Action name (e.g., 'read', 'write', 'delete')
   */
  function hasPermission(resource, action) {
    if (!currentPermissions) return false;
    return currentPermissions[resource]?.[action] === true;
  }

  /**
   * Check if current user has one of the specified roles
   * @param {...string} roles - Role names to check
   */
  function hasRole(...roles) {
    return roles.includes(currentRole);
  }

  /**
   * Get current role
   */
  function getCurrentRole() {
    return currentRole;
  }

  /**
   * Get current distributor ID
   */
  function getCurrentDistributorId() {
    return currentDistributorId;
  }

  /**
   * Get current permissions
   */
  function getCurrentPermissions() {
    return currentPermissions;
  }

  /**
   * Get active sessions for current user
   */
  async function getActiveSessions() {
    try {
      const response = await apiRequest('/api/auth/sessions');
      if (!response.ok) return [];

      const data = await response.json();
      return data.sessions || [];
    } catch (error) {
      console.error('Error getting sessions:', error);
      return [];
    }
  }

  /**
   * Revoke a specific session
   * @param {string} sessionId - Session UUID to revoke
   */
  async function revokeSession(sessionId) {
    try {
      const response = await apiRequest(`/api/auth/sessions/${sessionId}`, {
        method: 'DELETE'
      });
      return response.ok;
    } catch (error) {
      console.error('Error revoking session:', error);
      return false;
    }
  }

  /**
   * Revoke all other sessions (sign out everywhere else)
   */
  async function revokeOtherSessions() {
    try {
      const response = await apiRequest('/api/auth/sessions/revoke-others', {
        method: 'POST'
      });
      return response.ok;
    } catch (error) {
      console.error('Error revoking other sessions:', error);
      return false;
    }
  }

  /**
   * Invite team member
   * @param {string} email - Email to invite
   * @param {string} role - Role to assign
   */
  async function inviteTeamMember(email, role = 'viewer') {
    if (!currentDistributorId) {
      throw new Error('No distributor context set');
    }

    const response = await apiRequest(`/api/distributor/${currentDistributorId}/team/invite`, {
      method: 'POST',
      body: JSON.stringify({ email, role })
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to invite team member');
    }

    return response.json();
  }

  /**
   * Get team members
   */
  async function getTeamMembers() {
    if (!currentDistributorId) {
      return [];
    }

    try {
      const response = await apiRequest(`/api/distributor/${currentDistributorId}/team`);
      if (!response.ok) return [];

      const data = await response.json();
      return data.members || [];
    } catch (error) {
      console.error('Error getting team members:', error);
      return [];
    }
  }

  /**
   * Update team member role
   * @param {string} memberId - Team member's user ID
   * @param {string} newRole - New role to assign
   */
  async function updateTeamMemberRole(memberId, newRole) {
    if (!currentDistributorId) {
      throw new Error('No distributor context set');
    }

    const response = await apiRequest(
      `/api/distributor/${currentDistributorId}/team/${memberId}`,
      {
        method: 'PATCH',
        body: JSON.stringify({ role: newRole })
      }
    );

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to update role');
    }

    return response.json();
  }

  /**
   * Remove team member
   * @param {string} memberId - Team member's user ID
   */
  async function removeTeamMember(memberId) {
    if (!currentDistributorId) {
      throw new Error('No distributor context set');
    }

    const response = await apiRequest(
      `/api/distributor/${currentDistributorId}/team/${memberId}`,
      { method: 'DELETE' }
    );

    return response.ok;
  }

  /**
   * Get audit logs (admin only)
   * @param {Object} options - Query options
   */
  async function getAuditLogs(options = {}) {
    if (!currentDistributorId) {
      return [];
    }

    const params = new URLSearchParams();
    if (options.limit) params.set('limit', options.limit);
    if (options.offset) params.set('offset', options.offset);
    if (options.event_type) params.set('event_type', options.event_type);

    try {
      const response = await apiRequest(
        `/api/distributor/${currentDistributorId}/audit-logs?${params}`
      );

      if (!response.ok) return [];

      const data = await response.json();
      return data.logs || [];
    } catch (error) {
      console.error('Error getting audit logs:', error);
      return [];
    }
  }

  /**
   * Initialize on page load - restore context from session
   */
  async function init() {
    const supabase = getSupabase();
    if (!supabase) {
      // Wait for supabase to be ready
      let attempts = 0;
      while (!getSupabase() && attempts < 30) {
        await new Promise(r => setTimeout(r, 100));
        attempts++;
      }
    }

    // Check for OAuth callback
    if (window.location.hash.includes('access_token')) {
      await handleSSOCallback();
    }

    // Restore distributor context from session
    const savedContext = sessionStorage.getItem('sg_distributor_context');
    if (savedContext) {
      try {
        await getUserRole(savedContext);
      } catch (e) {
        sessionStorage.removeItem('sg_distributor_context');
      }
    }
  }

  // Auto-initialize
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // Expose global API
  window.SgSSOAuth = {
    // Core auth
    getAccessToken,
    apiRequest,

    // SSO
    checkSSODomain,
    signInWithGoogle,
    signInWithAzure,
    handleSSOCallback,

    // Distributor context
    loadUserDistributors,
    getUserRole,
    setDistributorContext,
    getCurrentDistributorId,
    getCurrentRole,
    getCurrentPermissions,

    // Permissions
    hasPermission,
    hasRole,

    // Sessions
    getActiveSessions,
    revokeSession,
    revokeOtherSessions,

    // Team management
    inviteTeamMember,
    getTeamMembers,
    updateTeamMemberRole,
    removeTeamMember,

    // Audit
    getAuditLogs,

    // Init
    init
  };

})();
