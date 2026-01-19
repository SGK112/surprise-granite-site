/**
 * SURPRISE GRANITE - CENTRALIZED CONFIGURATION
 * All API endpoints, keys, and settings in one place
 * Version: 1.0
 */

(function() {
  'use strict';

  // Environment detection
  const isProduction = window.location.hostname === 'www.surprisegranite.com' ||
                       window.location.hostname === 'surprisegranite.com';

  const isDevelopment = window.location.hostname === 'localhost' ||
                        window.location.hostname === '127.0.0.1';

  // Configuration object
  window.SG_CONFIG = {
    // Environment
    ENV: isProduction ? 'production' : (isDevelopment ? 'development' : 'staging'),
    DEBUG: !isProduction,

    // API Configuration
    API_BASE: 'https://surprise-granite-email-api.onrender.com',

    // Supabase Configuration
    SUPABASE_URL: 'https://ypeypgwsycxcagncgdur.supabase.co',
    SUPABASE_ANON_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlwZXlwZ3dzeWN4Y2FnbmNnZHVyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njc3NTQ4MjMsImV4cCI6MjA4MzMzMDgyM30.R13pNv2FDtGhfeu7gUcttYNrQAbNYitqR4FIq3O2-ME',
    SUPABASE_STORAGE_KEY: 'sg-auth-token',

    // Business Settings
    COMMISSION_RATE: 5, // 5% commission on marketplace sales
    CURRENCY: 'USD',
    DEFAULT_LOCALE: 'en-US',

    // Marketplace Settings
    MARKETPLACE: {
      ITEMS_PER_PAGE: 24,
      MAX_IMAGES_PER_SLAB: 10,
      SUPPORTED_IMAGE_TYPES: ['image/jpeg', 'image/png', 'image/webp'],
      MAX_IMAGE_SIZE_MB: 10,
      MATERIAL_TYPES: [
        'Granite',
        'Quartz',
        'Marble',
        'Quartzite',
        'Soapstone',
        'Porcelain',
        'Sintered Stone',
        'Onyx',
        'Travertine',
        'Limestone',
        'Other'
      ],
      FINISHES: [
        'Polished',
        'Honed',
        'Leathered',
        'Brushed',
        'Flamed',
        'Natural'
      ],
      QUALITY_GRADES: [
        'Premium',
        'Standard',
        'Commercial',
        'First Quality',
        'Second Quality'
      ]
    },

    // Distributor Settings
    DISTRIBUTOR: {
      MAX_LOCATIONS: 10,
      MAX_API_KEYS: 5,
      API_RATE_LIMIT: 1000, // requests per hour
      CSV_BATCH_SIZE: 100,
      INQUIRY_RESPONSE_HOURS: 48
    },

    // Contact Information
    COMPANY: {
      NAME: 'Surprise Granite',
      PHONE: '(623) 466-9004',
      EMAIL: 'info@surprisegranite.com',
      ADDRESS: 'Surprise, Arizona',
      SUPPORT_EMAIL: 'support@surprisegranite.com',
      DISTRIBUTOR_EMAIL: 'distributors@surprisegranite.com'
    },

    // Social Links
    SOCIAL: {
      FACEBOOK: 'https://facebook.com/surprisegranite',
      INSTAGRAM: 'https://instagram.com/surprisegranite',
      YOUTUBE: 'https://youtube.com/@surprisegranite',
      GOOGLE: 'https://g.page/surprisegranite'
    },

    // CDN and Assets
    ASSETS: {
      LOGO_GOLD: 'https://cdn.prod.website-files.com/6456ce4476abb25581fbad0c/6456ce4476abb255e1fbad54_surprise-granite-gold.svg',
      LOGO_WHITE: 'https://cdn.prod.website-files.com/6456ce4476abb25581fbad0c/6456ce4476abb255e1fbad54_surprise-granite-gold.svg',
      FAVICON: 'https://cdn.prod.website-files.com/6456ce4476abb25581fbad0c/6456ce4476abb269c6fbb176_Surprise-Granite-favicon-32x32px.png',
      PLACEHOLDER_SLAB: 'https://via.placeholder.com/400x300?text=No+Image'
    },

    // Routes
    ROUTES: {
      HOME: '/',
      MARKETPLACE: '/marketplace/slabs/',
      MARKETPLACE_DETAIL: '/marketplace/slabs/detail/',
      REMNANTS: '/marketplace/remnants/',
      DISTRIBUTOR_SIGNUP: '/distributor/signup/',
      DISTRIBUTOR_DASHBOARD: '/distributor/dashboard/',
      DISTRIBUTOR_INVENTORY: '/distributor/dashboard/inventory/',
      DISTRIBUTOR_INQUIRIES: '/distributor/dashboard/inquiries/',
      DISTRIBUTOR_ANALYTICS: '/distributor/dashboard/analytics/',
      DISTRIBUTOR_SETTINGS: '/distributor/dashboard/settings/',
      TERMS: '/legal/terms-of-use/',
      PRIVACY: '/legal/privacy-policy/',
      DISTRIBUTOR_AGREEMENT: '/legal/distributor-agreement/'
    },

    // Feature Flags
    FEATURES: {
      ENABLE_FAVORITES: true,
      ENABLE_COMPARE: false, // Coming soon
      ENABLE_CHAT: false,    // Coming soon
      ENABLE_NOTIFICATIONS: true,
      ENABLE_ANALYTICS: true,
      ENABLE_CSV_UPLOAD: true,
      ENABLE_API_ACCESS: true,
      USE_NEW_PRODUCTS_SCHEMA: false // Enable after running migrations
    },

    // Cache Settings
    CACHE: {
      INVENTORY_TTL_MS: 5 * 60 * 1000,  // 5 minutes
      PROFILE_TTL_MS: 10 * 60 * 1000,   // 10 minutes
      ANALYTICS_TTL_MS: 15 * 60 * 1000  // 15 minutes
    }
  };

  // Helper Functions
  window.SG_CONFIG.helpers = {
    /**
     * Format price with currency
     */
    formatPrice: function(amount, perUnit = 'sqft') {
      const formatted = new Intl.NumberFormat(SG_CONFIG.DEFAULT_LOCALE, {
        style: 'currency',
        currency: SG_CONFIG.CURRENCY,
        minimumFractionDigits: 2
      }).format(amount);
      return perUnit ? `${formatted}/${perUnit}` : formatted;
    },

    /**
     * Format date relative to now
     */
    formatRelativeDate: function(dateStr) {
      const date = new Date(dateStr);
      const now = new Date();
      const diffMs = now - date;
      const diffMins = Math.floor(diffMs / 60000);
      const diffHours = Math.floor(diffMs / 3600000);
      const diffDays = Math.floor(diffMs / 86400000);

      if (diffMins < 1) return 'Just now';
      if (diffMins < 60) return `${diffMins} min ago`;
      if (diffHours < 24) return `${diffHours}h ago`;
      if (diffDays < 7) return `${diffDays}d ago`;

      return date.toLocaleDateString(SG_CONFIG.DEFAULT_LOCALE, {
        month: 'short',
        day: 'numeric',
        year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined
      });
    },

    /**
     * Format dimensions
     */
    formatDimensions: function(length, width, thickness, unit = 'in') {
      if (!length || !width) return 'N/A';
      let dims = `${length}" x ${width}"`;
      if (thickness) dims += ` x ${thickness}cm`;
      return dims;
    },

    /**
     * Calculate square footage
     */
    calcSqFt: function(lengthInches, widthInches) {
      return ((lengthInches * widthInches) / 144).toFixed(2);
    },

    /**
     * Generate initials from name
     */
    getInitials: function(name) {
      if (!name) return '?';
      return name.split(' ')
        .map(part => part.charAt(0).toUpperCase())
        .slice(0, 2)
        .join('');
    },

    /**
     * Validate email format
     */
    isValidEmail: function(email) {
      return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
    },

    /**
     * Validate phone format
     */
    isValidPhone: function(phone) {
      const cleaned = phone.replace(/\D/g, '');
      return cleaned.length >= 10;
    },

    /**
     * Get API endpoint URL
     */
    apiUrl: function(path) {
      return `${SG_CONFIG.API_BASE}${path}`;
    },

    /**
     * Log debug messages (only in development)
     */
    debug: function(...args) {
      if (SG_CONFIG.DEBUG) {
        console.log('[SG]', ...args);
      }
    }
  };

  // Initialize Supabase client if available
  if (typeof window.supabase !== 'undefined' && window.supabase.createClient) {
    window.SG_SUPABASE = window.supabase.createClient(
      SG_CONFIG.SUPABASE_URL,
      SG_CONFIG.SUPABASE_ANON_KEY
    );
  }

  // Log initialization
  if (SG_CONFIG.DEBUG) {
    console.log('[SG] Config loaded:', SG_CONFIG.ENV);
  }
})();
