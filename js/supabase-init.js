/**
 * Supabase Single Client Initialization
 * This script MUST load immediately after the Supabase library
 * and BEFORE any other auth-related scripts.
 */
(function() {
  'use strict';

  // Only create if not already created
  if (window._sgSupabaseClient) {
    return;
  }

  if (typeof window.supabase === 'undefined') {
    console.error('Supabase library not loaded');
    return;
  }

  const SUPABASE_URL = 'https://ypeypgwsycxcagncgdur.supabase.co';
  const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlwZXlwZ3dzeWN4Y2FnbmNnZHVyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njc3NTQ4MjMsImV4cCI6MjA4MzMzMDgyM30.R13pNv2FDtGhfeu7gUcttYNrQAbNYitqR4FIq3O2-ME';

  const { createClient } = window.supabase;

  // Simple storage wrapper to avoid lock issues
  const simpleStorage = {
    getItem: (key) => {
      try { return localStorage.getItem(key); } catch { return null; }
    },
    setItem: (key, value) => {
      try { localStorage.setItem(key, value); } catch {}
    },
    removeItem: (key) => {
      try { localStorage.removeItem(key); } catch {}
    }
  };

  try {
    window._sgSupabaseClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        storage: simpleStorage,
        storageKey: 'sg-auth-token',
        flowType: 'implicit',
        debug: false
      }
    });
  } catch (e) {
    console.warn('Supabase init error, retrying without locks:', e.message);
    // Fallback: Try with minimal options
    try {
      window._sgSupabaseClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    } catch (e2) {
      console.error('Supabase init failed completely:', e2);
    }
  }
})();
