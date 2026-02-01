/**
 * State Manager
 * Persistent state management across pages using localStorage + Supabase sync
 */

const StateManager = (function() {
  const STORAGE_KEY = 'sg_app_state';
  const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

  let state = {
    user: null,
    pendingBooking: null,
    confirmedEvents: {},
    viewedNotifications: [],
    preferences: {},
    lastSync: null
  };

  // Load state from localStorage on init
  function init() {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        state = { ...state, ...parsed };
      }
    } catch (e) {
      console.warn('[StateManager] Failed to load state:', e);
    }
    return state;
  }

  // Save state to localStorage
  function persist() {
    try {
      state.lastSync = Date.now();
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (e) {
      console.warn('[StateManager] Failed to persist state:', e);
    }
  }

  // Set user data
  function setUser(user) {
    state.user = user;
    persist();
  }

  function getUser() {
    return state.user;
  }

  // Track pending booking (for multi-step forms)
  function setPendingBooking(booking) {
    state.pendingBooking = {
      ...booking,
      createdAt: Date.now()
    };
    persist();
  }

  function getPendingBooking() {
    // Clear stale pending bookings (older than 1 hour)
    if (state.pendingBooking && Date.now() - state.pendingBooking.createdAt > 3600000) {
      state.pendingBooking = null;
      persist();
    }
    return state.pendingBooking;
  }

  function clearPendingBooking() {
    state.pendingBooking = null;
    persist();
  }

  // Track confirmed events (to avoid re-prompting)
  function markEventConfirmed(eventId, confirmedBy, confirmedAt) {
    state.confirmedEvents[eventId] = {
      confirmedBy: confirmedBy || 'admin',
      confirmedAt: confirmedAt || new Date().toISOString()
    };
    persist();
  }

  function isEventConfirmed(eventId) {
    return !!state.confirmedEvents[eventId];
  }

  function getEventConfirmation(eventId) {
    return state.confirmedEvents[eventId] || null;
  }

  // Track viewed notifications to avoid showing again
  function markNotificationViewed(notificationId) {
    if (!state.viewedNotifications.includes(notificationId)) {
      state.viewedNotifications.push(notificationId);
      // Keep only last 100 notifications
      if (state.viewedNotifications.length > 100) {
        state.viewedNotifications = state.viewedNotifications.slice(-100);
      }
      persist();
    }
  }

  function isNotificationViewed(notificationId) {
    return state.viewedNotifications.includes(notificationId);
  }

  // User preferences
  function setPreference(key, value) {
    state.preferences[key] = value;
    persist();
  }

  function getPreference(key, defaultValue = null) {
    return state.preferences[key] !== undefined ? state.preferences[key] : defaultValue;
  }

  // Sync confirmed events from Supabase
  async function syncConfirmedEvents(supabaseClient) {
    if (!supabaseClient) return;

    try {
      const { data: events, error } = await supabaseClient
        .from('calendar_events')
        .select('id, status, updated_at')
        .eq('status', 'confirmed');

      if (error) throw error;

      // Update local cache
      events?.forEach(event => {
        if (!state.confirmedEvents[event.id]) {
          state.confirmedEvents[event.id] = {
            confirmedBy: 'synced',
            confirmedAt: event.updated_at
          };
        }
      });

      persist();
      console.log('[StateManager] Synced', events?.length || 0, 'confirmed events');

    } catch (e) {
      console.warn('[StateManager] Sync failed:', e);
    }
  }

  // Clear all state (for logout)
  function clear() {
    state = {
      user: null,
      pendingBooking: null,
      confirmedEvents: {},
      viewedNotifications: [],
      preferences: {},
      lastSync: null
    };
    localStorage.removeItem(STORAGE_KEY);
  }

  // Get full state (for debugging)
  function getState() {
    return { ...state };
  }

  // Initialize on load
  init();

  return {
    init,
    setUser,
    getUser,
    setPendingBooking,
    getPendingBooking,
    clearPendingBooking,
    markEventConfirmed,
    isEventConfirmed,
    getEventConfirmation,
    markNotificationViewed,
    isNotificationViewed,
    setPreference,
    getPreference,
    syncConfirmedEvents,
    clear,
    getState
  };
})();

// Export for module systems
if (typeof module !== 'undefined' && module.exports) {
  module.exports = StateManager;
}
