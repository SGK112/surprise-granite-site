/**
 * Supabase Single Client Initialization
 * This script MUST load immediately after the Supabase library
 * and BEFORE any other auth-related scripts.
 *
 * It creates ONE global client that all other scripts will use.
 */
(function() {
  'use strict';

  // Only create if not already created
  if (window._sgSupabaseClient) {
    console.log('Supabase client already exists');
    return;
  }

  // Check if Supabase library is loaded
  if (typeof window.supabase === 'undefined') {
    console.error('Supabase library not loaded before supabase-init.js');
    return;
  }

  const SUPABASE_URL = 'https://ypeypgwsycxcagncgdur.supabase.co';
  const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlwZXlwZ3dzeWN4Y2FnbmNnZHVyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njc3NTQ4MjMsImV4cCI6MjA4MzMzMDgyM30.R13pNv2FDtGhfeu7gUcttYNrQAbNYitqR4FIq3O2-ME';

  try {
    const { createClient } = window.supabase;

    window._sgSupabaseClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        storageKey: 'sb-ypeypgwsycxcagncgdur-auth-token',
        flowType: 'implicit'
      }
    });

    console.log('Supabase client initialized');
  } catch (e) {
    console.error('Failed to initialize Supabase client:', e);
  }
})();
