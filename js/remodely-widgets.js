/**
 * REMODELY WIDGETS LOADER
 * Loads and initializes all Remodely AI widgets for Surprise Granite
 * Version: 1.0
 */

(function() {
  'use strict';

  // Surprise Granite configuration
  const SG_CONFIG = {
    businessName: 'Surprise Granite',
    primaryColor: '#f9cb00',
    secondaryColor: '#1a1a2e',
    phone: '+1 (602) 833-7194',
    email: 'info@surprisegranite.com',
    address: '15084 W Bell Rd, Surprise, AZ 85374',
    theme: 'dark',
    apiEndpoint: 'https://api.remodely.ai',
    supabaseUrl: 'https://ypeypgwsycxcagncgdur.supabase.co',

    // Service areas
    serviceAreas: [
      'Surprise', 'Peoria', 'Sun City', 'Glendale',
      'Phoenix', 'Scottsdale', 'Goodyear', 'Buckeye',
      'Avondale', 'Litchfield Park', 'El Mirage', 'Youngtown'
    ],

    // Services offered
    services: [
      { id: 'countertops', name: 'Countertops', icon: 'counter', description: 'Granite, Quartz, Marble & more' },
      { id: 'tile', name: 'Tile & Backsplash', icon: 'tile', description: 'Kitchen, bathroom & floors' },
      { id: 'cabinets', name: 'Cabinets', icon: 'cabinet', description: 'Kitchen & bathroom cabinets' },
      { id: 'flooring', name: 'Flooring', icon: 'floor', description: 'Hardwood, LVP, Tile' },
      { id: 'full-remodel', name: 'Full Remodel', icon: 'home', description: 'Complete kitchen or bath' }
    ],

    // Estimate ranges per service
    estimateRanges: {
      countertops: { min: 40, max: 150, unit: 'sqft' },
      tile: { min: 8, max: 25, unit: 'sqft' },
      cabinets: { min: 200, max: 800, unit: 'linear ft' },
      flooring: { min: 6, max: 20, unit: 'sqft' },
      'full-remodel': { min: 15000, max: 75000, unit: 'project' }
    },

    // Business hours
    businessHours: 'Monday-Saturday 8am-6pm',
    availableDays: [1, 2, 3, 4, 5, 6], // Mon-Sat
    availableHours: { start: 8, end: 18 }
  };

  // Widget registry
  const widgets = {
    booking: { loaded: false, instance: null },
    voice: { loaded: false, instance: null },
    blueprint: { loaded: false, instance: null }
  };

  // Base path for widgets
  const WIDGET_BASE = '/remodely-platform/widgets';

  /**
   * Load a script dynamically
   */
  function loadScript(src) {
    return new Promise((resolve, reject) => {
      // Check if already loaded
      if (document.querySelector(`script[src="${src}"]`)) {
        resolve();
        return;
      }

      const script = document.createElement('script');
      script.src = src;
      script.async = true;
      script.onload = resolve;
      script.onerror = reject;
      document.head.appendChild(script);
    });
  }

  /**
   * Initialize Booking Widget (script pre-loaded in HTML)
   */
  function initBookingWidget(containerId = null, options = {}) {
    if (widgets.booking.instance) return widgets.booking.instance;

    if (window.RemodelyBooking) {
      const config = {
        ...SG_CONFIG,
        ...options,
        triggerType: 'none',
        logo: '/images/logo.png',
        successMessage: "Thank you! We'll contact you within 24 hours to confirm your appointment.",
        webhookUrl: '/api/leads/booking'
      };

      widgets.booking.instance = new window.RemodelyBooking(config);
      window.remodelyBooking = widgets.booking.instance;
      widgets.booking.instance.init(containerId);
      widgets.booking.loaded = true;
      return widgets.booking.instance;
    }
  }

  /**
   * Initialize Aria Realtime Voice Widget (OpenAI Realtime API)
   * Uses natural AI voices instead of browser speech synthesis
   */
  async function initAriaVoice(containerId = null, options = {}) {
    if (!widgets.voice.loaded) {
      await loadScript(`${WIDGET_BASE}/voice/aria-realtime.js`);
      widgets.voice.loaded = true;
    }

    if (window.AriaRealtime) {
      const config = {
        businessName: SG_CONFIG.businessName,
        assistantName: 'Aria',
        primaryColor: SG_CONFIG.primaryColor,
        secondaryColor: SG_CONFIG.secondaryColor,
        theme: SG_CONFIG.theme,
        position: 'right',
        triggerType: 'floating',

        // OpenAI Realtime voice - natural sounding
        voice: 'coral', // Options: alloy, coral, echo, fable, onyx, nova, shimmer

        // WebSocket relay endpoint (main API server)
        relayEndpoint: 'wss://surprise-granite-email-api.onrender.com/api/aria-realtime',

        // Greeting
        greeting: "Hey! I'm Aria from Surprise Granite. How can I help you today?",

        // Business context for AI
        businessContext: {
          industry: 'countertops',
          services: SG_CONFIG.services.map(s => s.name),
          serviceArea: SG_CONFIG.serviceAreas.join(', '),
          businessHours: SG_CONFIG.businessHours
        },

        // Custom system instructions
        systemInstructions: `You are Aria, a friendly and knowledgeable AI voice assistant for Surprise Granite, a premier countertop and remodeling company in the Phoenix metro area.

PERSONALITY:
- Warm, helpful, and professional but conversational
- Keep responses SHORT - 1-2 sentences max
- Use natural language with contractions (I'm, we're, you'll)
- Be direct and get to the point quickly
- Sound like a real person, not a robot

BUSINESS INFO:
- Company: Surprise Granite
- Location: 15084 W Bell Rd, Surprise, AZ 85374
- Phone: (602) 833-7194
- Hours: Monday-Saturday 8am-6pm
- Service Areas: ${SG_CONFIG.serviceAreas.join(', ')}

SERVICES:
- Countertops: Granite, Quartz, Marble, Quartzite, Porcelain
- Tile & Backsplash installation
- Cabinet installation
- Flooring (Hardwood, LVP, Tile)
- Full kitchen & bathroom remodels

PRICING (general ranges):
- Countertops: $40-150 per square foot depending on material
- Free in-home estimates available

GOALS:
1. Answer questions helpfully and accurately
2. Guide users toward scheduling a FREE estimate
3. Collect contact info when appropriate
4. Transfer to human if they request it

Remember: Keep responses brief and conversational!`,

        ...options
      };

      widgets.voice.instance = new window.AriaRealtime(config);
      widgets.voice.instance.init(containerId);

      // Store globally for access
      window.ariaVoice = widgets.voice.instance;
      window.ariaRealtime = widgets.voice.instance;

      console.log('Aria Realtime Voice Widget initialized for Surprise Granite');
      return widgets.voice.instance;
    }
  }

  /**
   * Initialize Blueprint AI Design Widget
   */
  async function initBlueprintAI(containerId, options = {}) {
    if (!widgets.blueprint.loaded) {
      await loadScript(`${WIDGET_BASE}/design/blueprint-ai.js`);
      widgets.blueprint.loaded = true;
    }

    if (window.BlueprintAI) {
      const config = {
        ...SG_CONFIG,
        categories: [
          { id: 'kitchen', name: 'Kitchen', icon: 'kitchen' },
          { id: 'bathroom', name: 'Bathroom', icon: 'bathroom' },
          { id: 'laundry', name: 'Laundry', icon: 'laundry' },
          { id: 'outdoor', name: 'Outdoor Kitchen', icon: 'outdoor' }
        ],
        materials: {
          countertops: ['Granite', 'Quartz', 'Marble', 'Quartzite', 'Porcelain'],
          cabinets: ['White Shaker', 'Gray Modern', 'Natural Oak', 'Espresso', 'Two-Tone'],
          backsplash: ['Subway Tile', 'Mosaic', 'Natural Stone', 'Glass', 'Herringbone'],
          flooring: ['Hardwood', 'Tile', 'LVP', 'Natural Stone']
        },
        ...options
      };

      widgets.blueprint.instance = new window.BlueprintAI(config);
      widgets.blueprint.instance.init(containerId);

      // Store globally
      window.blueprintAI = widgets.blueprint.instance;

      console.log('Blueprint AI Widget initialized for Surprise Granite');
      return widgets.blueprint.instance;
    }
  }

  /**
   * Show booking modal (for CTA buttons)
   */
  function showBookingModal() {
    if (!widgets.booking.instance) {
      initBookingWidget();
    }
    if (widgets.booking.instance) {
      widgets.booking.instance.open();
    }
  }

  /**
   * Show Aria Voice modal
   */
  function showAriaVoice() {
    if (widgets.voice.instance) {
      widgets.voice.instance.open();
    } else {
      initAriaVoice().then(() => {
        if (widgets.voice.instance) {
          widgets.voice.instance.open();
        }
      });
    }
  }

  /**
   * Auto-initialize based on page
   */
  function autoInitialize() {
    const path = window.location.pathname;

    // Always load booking widget (for CTA buttons across site)
    initBookingWidget();

    // Aria Voice is now triggered through the Remodely Hub
    // Don't auto-show floating button - let hub control it
    // initAriaVoice(); // Disabled - controlled by remodely-hub.js

    // Load Blueprint AI on design/visualizer pages
    const designContainer = document.getElementById('blueprint-ai-container');
    if (designContainer) {
      initBlueprintAI('blueprint-ai-container');
    }

    // Wire up CTA buttons
    wireUpCTAButtons();
  }

  /**
   * Wire up existing CTA buttons to use widgets
   */
  function wireUpCTAButtons() {
    // Find all "Book Now", "Get Quote", "Free Estimate" buttons
    const ctaSelectors = [
      'a[href*="/book"]',
      'a[href*="/contact"]',
      'a[href*="/estimate"]',
      'a[href*="calendly"]',
      '.btn-book-now',
      '.btn-get-quote',
      '.btn-free-estimate',
      '[data-booking-trigger]'
    ];

    ctaSelectors.forEach(selector => {
      document.querySelectorAll(selector).forEach(el => {
        // Skip if already processed
        if (el.dataset.widgetWired) return;

        el.dataset.widgetWired = 'true';

        // Add click handler
        el.addEventListener('click', (e) => {
          // Allow modifier keys for new tab
          if (e.metaKey || e.ctrlKey || e.shiftKey) return;

          e.preventDefault();
          showBookingModal();
        });
      });
    });

    // Wire up voice triggers
    document.querySelectorAll('[data-aria-trigger], .btn-talk-to-aria').forEach(el => {
      if (el.dataset.widgetWired) return;
      el.dataset.widgetWired = 'true';

      el.addEventListener('click', (e) => {
        e.preventDefault();
        showAriaVoice();
      });
    });
  }

  /**
   * Track widget events
   */
  function trackEvent(eventName, data = {}) {
    // Send to analytics
    if (window.gtag) {
      window.gtag('event', eventName, {
        event_category: 'remodely_widget',
        ...data
      });
    }

    // Send to Supabase if available
    if (window._sgSupabaseClient) {
      window._sgSupabaseClient
        .from('analytics_events')
        .insert({
          event_name: eventName,
          event_data: data,
          page_url: window.location.href,
          created_at: new Date().toISOString()
        })
        .then(() => {})
        .catch(() => {});
    }
  }

  // Listen for widget events
  window.addEventListener('bookingEvent', (e) => {
    trackEvent('booking_' + e.detail.event, e.detail.data);
  });

  window.addEventListener('ariaEvent', (e) => {
    trackEvent('aria_' + e.detail.event, e.detail.data);
  });

  // Export API
  window.SGWidgets = {
    config: SG_CONFIG,
    initBookingWidget,
    initAriaVoice,
    initBlueprintAI,
    showBookingModal,
    showAriaVoice,
    widgets
  };

  // Auto-initialize on DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', autoInitialize);
  } else {
    autoInitialize();
  }

  console.log('Remodely Widgets Loader ready for Surprise Granite');
})();
