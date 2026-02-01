/**
 * Remodely Tools Hub
 * Unified floating widget for all Remodely tools
 * - Room Designer Pro
 * - Aria Voice Assistant
 * - Countertop Calculator
 * - Design Tools
 */

(function() {
  'use strict';

  // Don't show on room designer workspace
  if (window.location.pathname.includes('/tools/room-designer')) return;

  const HUB_ID = 'remodely-hub';
  const WIDGET_BASE = '/remodely-platform/widgets';
  const WIDGET_VERSION = '20260121a'; // v8 premium chat

  // Aria configuration (OpenAI TTS via VoiceNow CRM)
  const ARIA_CONFIG = {
    // API Configuration - VoiceNow CRM backend for OpenAI TTS
    apiEndpoint: 'https://voiceflow-crm.onrender.com',

    businessName: 'Remodely',
    assistantName: 'Aria',
    primaryColor: '#f9cb00',
    secondaryColor: '#1a1a2e',
    theme: 'dark',
    position: 'right',
    triggerType: 'none', // We control opening via hub

    // Greeting
    greeting: "Hey! I'm Aria, your AI remodeling assistant. How can I help you today?",

    // Phone number for transfers
    phone: '(602) 833-3189',

    // Business context
    businessContext: {
      industry: 'countertops',
      services: ['Countertops', 'Tile & Backsplash', 'Cabinets', 'Flooring', 'Full Remodel'],
      serviceArea: 'Surprise, Peoria, Sun City, Glendale, Phoenix, Scottsdale, Goodyear, Buckeye, Avondale, Litchfield Park, El Mirage, Youngtown',
      businessHours: 'Monday-Saturday 8am-6pm'
    },

    // FAQ responses
    faqs: [
      { question: 'hours', answer: "We're available Monday through Saturday, 8am to 6pm for appointments. Give us a call at (602) 833-3189 to schedule!" },
      { question: 'location', answer: "We serve the entire Phoenix metro area including Surprise, Scottsdale, Peoria, Goodyear, and more. We come to you for free onsite consultations! To view slabs in person, visit one of our stone supplier partners - check out our vendors list at surprisegranite.com/stone-yards/" },
      { question: 'estimate', answer: "Absolutely! Our estimates are always free. I can help you schedule an in-home consultation where we'll measure your space and discuss materials. What day works best for you?" },
      { question: 'cost', answer: "Countertop pricing depends on the material. Quartz runs $45-85 per square foot, granite $40-75, marble $60-150, and quartzite $70-120. That includes professional installation. Want me to give you a rough estimate for your project?" },
      { question: 'price', answer: "Great question! Our countertops range from $40-150 per square foot installed. Quartz is our most popular at $45-85/sq ft. A typical kitchen runs $2,500-5,000. Would you like a free estimate?" },
      { question: 'how long', answer: "Most countertop projects take 1-2 weeks from template to installation. We'll measure your space, fabricate the counters, and install them - usually all within 7-10 business days." },
      { question: 'warranty', answer: "We stand behind our work! All installations come with our craftsmanship warranty, and most materials have manufacturer warranties - Silestone offers 25 years, MSI quartz has lifetime coverage." },
      { question: 'financing', answer: "Yes, we offer financing options! We work with several lenders to help make your dream kitchen affordable. Ask about our 12-month same-as-cash option." },
      { question: 'showroom', answer: "We don't have a showroom - we come to you! For free onsite consultations, just schedule an appointment. To see slabs in person, visit one of our stone distribution partners. Check out our vendors list at surprisegranite.com/stone-yards/ to find a location near you." }
    ],

    // Comprehensive knowledge base
    knowledge: {
      // Material types
      materials: {
        'quartz': "Quartz is our most popular choice - it's engineered stone that's non-porous, scratch-resistant, and never needs sealing. We carry MSI, Silestone, Cambria, and more. Prices range from $45-85 per square foot installed. Popular styles include Calacatta, marble-look, and solid colors.",
        'granite': "Granite is a natural stone that's heat-resistant and timeless. Each slab is unique! We source premium granite starting at $40 per square foot installed. It does need sealing once a year, but many people love the natural variations.",
        'marble': "Marble is the ultimate luxury surface - perfect for elegant kitchens and bathrooms. It's softer than granite so it needs more care, but nothing beats that classic look. Prices start around $60 per square foot.",
        'quartzite': "Quartzite is natural stone that's actually harder than granite! It has the beauty of marble with superior durability. It's great for busy kitchens. Prices range from $70-120 per square foot.",
        'porcelain': "Porcelain slabs are a newer option - ultra-thin, lightweight, and virtually indestructible. They resist UV, heat, and scratches. Great for indoor/outdoor kitchens. Starting around $50 per square foot.",
        'dekton': "Dekton by Cosentino is an ultra-compact surface made with extreme heat and pressure. It's virtually indestructible - resistant to scratches, stains, UV, and heat up to 600°F. Perfect for outdoor kitchens and heavy-use areas.",
        'silestone': "Silestone is premium quartz by Cosentino with built-in antimicrobial protection. They offer unique colors and the marble-look Calacatta series is stunning. Comes with a 25-year warranty.",
        'cambria': "Cambria is American-made quartz - all their slabs are produced in Minnesota. Known for durability and innovative designs like their Brittanicca collection that mimics natural marble beautifully."
      },

      // Vendors
      vendors: {
        'msi': "MSI Surfaces is one of our main suppliers. They offer great value on quartz, granite, and porcelain. Their Q Premium Natural Quartz line is very popular - lots of calacatta and marble-look options.",
        'daltile': "Daltile is our go-to for tile and backsplash. They make everything from subway tile to large-format porcelain. Great quality, huge selection, and they're a trusted American brand.",
        'cosentino': "Cosentino makes Silestone quartz and Dekton ultra-compact surfaces. Premium products from Spain with excellent warranties and innovative technology like N-Boost for stain resistance.",
        'bravo tile': "Bravo Tile offers beautiful mosaic and specialty tiles. Perfect for unique backsplashes and accent walls. Great for adding personality to your kitchen or bathroom."
      },

      // Topics (keywords separated by |)
      topics: {
        'calacatta|calcatta|white marble': "Calacatta-look is our most requested style! We have it in quartz from MSI (Calacatta Arno, Calacatta Gold), Silestone (Calacatta Gold), and Cambria (Brittanicca). You get the marble look without the maintenance. Would you like to see samples?",
        'backsplash|back splash|tile': "We install beautiful backsplashes! Popular options include subway tile, marble mosaics, and large-format porcelain that matches your countertops. A backsplash can totally transform your kitchen. Prices start around $15-25 per square foot installed.",
        'kitchen remodel|full kitchen|renovation': "We do full kitchen remodels! Countertops, cabinets, backsplash, flooring - the whole package. We'll help you design your dream kitchen and coordinate everything. Want to schedule a design consultation?",
        'bathroom|vanity|bath': "We love bathroom projects! From vanity tops to shower surrounds, we've got you covered. Quartz and marble are popular for bathrooms. A new vanity top can start as low as $500 installed.",
        'outdoor|bbq|grill': "Outdoor kitchens are huge in Arizona! Dekton and granite are perfect for outdoor use - they handle the heat and sun. We can build your dream outdoor entertaining space.",
        'cabinet|cabinets': "We offer cabinet installation too! We work with quality cabinet lines and can do full replacements or refacing. White shaker and modern gray are trending right now.",
        'flooring|floor|lvp|hardwood': "We install flooring as well - tile, LVP, and hardwood. LVP is super popular right now because it's waterproof and looks like real wood. Prices start around $6-12 per square foot installed.",
        'waterfall|island': "Waterfall edges are stunning! That's where the countertop material flows down the sides of your island. It's a modern, high-end look. Usually adds $500-1500 depending on the size.",
        'edge|edges|profile': "We offer lots of edge profiles! Standard eased edge is included, and we also do beveled, bullnose, ogee, and mitered edges. We can show you samples during your onsite consultation.",
        'seam|seams': "We minimize seams as much as possible and place them strategically. Our fabricators are experts at making seams nearly invisible. Most kitchens have 1-2 seams depending on the layout.",
        'undermount|sink|faucet': "Undermount sinks are the most popular - they create a seamless look and are easy to clean. We do all the sink cutouts and can recommend great plumbers for the install.",
        'maintenance|care|clean': "Quartz is the easiest to maintain - just wipe with soap and water. Granite needs annual sealing. Marble requires more care but we'll teach you everything you need to know.",
        'design|style|trend|color': "Current trends include white and gray tones, bold veining, waterfall islands, and mixed materials. Navy cabinets with white quartz is super popular right now. Want design ideas? Try our Room Designer tool!",
        'measure|template|templating': "After you choose your material, we'll send a templater to your home to create exact measurements using laser technology. It takes about 30-60 minutes and ensures a perfect fit.",
        'install|installation': "Installation usually takes just 1 day for most kitchens! Our crews are fast and clean. We'll remove your old counters, install the new ones, and clean up. You can use your kitchen that same evening.",
        'timeline|how long|turnaround': "From selection to installation, most projects take 7-10 business days. Template happens within a few days of your order, then fabrication takes about a week, and installation is scheduled right after."
      }
    }
  };

  // Aria instance
  let ariaInstance = null;
  let ariaLoading = false;

  // Load a script dynamically with cache busting
  function loadScript(src) {
    return new Promise((resolve, reject) => {
      // Add version for cache busting
      const versionedSrc = src + '?' + WIDGET_VERSION;

      // Remove any old versions of this script
      const oldScript = document.querySelector(`script[src^="${src}"]`);
      if (oldScript) oldScript.remove();

      const script = document.createElement('script');
      script.src = versionedSrc;
      script.async = true;
      script.onload = resolve;
      script.onerror = reject;
      document.head.appendChild(script);
    });
  }

  // Initialize and open Aria
  async function openAria() {
    // If already loaded, just open
    if (ariaInstance && ariaInstance.widget) {
      ariaInstance.open();
      return;
    }

    // Prevent double loading
    if (ariaLoading) return;
    ariaLoading = true;

    try {
      // Clear any old widget from DOM
      const oldWidget = document.getElementById('aria-widget-container');
      if (oldWidget) oldWidget.remove();

      // Clear old class reference to force fresh load
      delete window.AriaOpenAI;
      ariaInstance = null;

      // Load the Aria OpenAI script (OpenAI TTS via VoiceNow CRM backend)
      await loadScript(`${WIDGET_BASE}/voice/aria-openai.js`);

      if (window.AriaOpenAI) {
        ariaInstance = new window.AriaOpenAI(ARIA_CONFIG);
        ariaInstance.init();

        // Store globally for other scripts
        window.ariaOpenAI = ariaInstance;
        window.ariaVoice = ariaInstance;

        console.log('Aria ' + WIDGET_VERSION + ' loaded via Remodely Hub');

        // Open it
        ariaInstance.open();
      } else {
        console.error('AriaOpenAI class not found after loading script');
        window.location.href = '/contact-us/';
      }
    } catch (err) {
      console.error('Failed to load Aria:', err);
      window.location.href = '/contact-us/';
    } finally {
      ariaLoading = false;
    }
  }

  function createRemodelyHub() {
    // Check if already exists
    if (document.getElementById(HUB_ID)) return;

    const hub = document.createElement('div');
    hub.id = HUB_ID;
    hub.innerHTML = `
      <style>
        /* Hide legacy widgets - now integrated into hub */
        .sg-widget,
        #sgWidget,
        .aria-el-btn,
        .aria-voice-btn,
        .aria-realtime-btn,
        .aria-floating-btn,
        .rb-floating-btn,
        .floating-cart-btn,
        .mobile-fab,
        .calendly-badge-widget,
        [class*="booking-fab"],
        [class*="calendar-fab"] {
          display: none !important;
        }

        #remodely-hub {
          position: fixed;
          bottom: 24px;
          right: 24px;
          z-index: 99990;
          font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
        }

        /* Main Button - no background, just floating logo */
        .rh-trigger {
          width: 56px;
          height: 56px;
          border-radius: 50%;
          background: transparent;
          border: none;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          box-shadow: none;
          transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
          position: relative;
          padding: 0;
        }

        .rh-trigger:hover {
          transform: scale(1.1);
        }

        .rh-trigger.open {
          transform: scale(0.95);
        }

        /* Logo */
        .rh-logo {
          width: 48px;
          height: 48px;
          transition: transform 0.4s ease;
          filter: drop-shadow(0 2px 8px rgba(0,0,0,0.3));
        }

        .rh-trigger:hover .rh-logo {
          transform: rotateY(180deg);
          filter: drop-shadow(0 4px 12px rgba(0,0,0,0.4));
        }

        .rh-trigger.open .rh-logo {
          transform: rotate(45deg);
        }

        /* Menu Panel - Glassmorphic */
        .rh-menu {
          position: absolute;
          bottom: 70px;
          right: 0;
          width: 280px;
          background: rgba(20, 20, 35, 0.75);
          backdrop-filter: blur(20px) saturate(180%);
          -webkit-backdrop-filter: blur(20px) saturate(180%);
          border-radius: 20px;
          border: 1px solid rgba(255,255,255,0.15);
          box-shadow: 0 20px 60px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.1);
          opacity: 0;
          visibility: hidden;
          transform: translateY(10px) scale(0.95);
          transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
          overflow: hidden;
        }

        .rh-menu.open {
          opacity: 1;
          visibility: visible;
          transform: translateY(0) scale(1);
        }

        /* Menu Header - Glassmorphic */
        .rh-header {
          padding: 16px 20px;
          background: linear-gradient(135deg, rgba(249,203,0,0.08) 0%, rgba(255,255,255,0.02) 100%);
          border-bottom: 1px solid rgba(255,255,255,0.1);
          display: flex;
          align-items: center;
          gap: 12px;
        }

        .rh-header-icon {
          width: 36px;
          height: 36px;
        }

        .rh-header-text {
          flex: 1;
        }

        .rh-header-title {
          font-size: 14px;
          font-weight: 600;
          color: #fff;
          margin: 0;
        }

        .rh-header-subtitle {
          font-size: 11px;
          color: rgba(255,255,255,0.5);
          margin: 2px 0 0;
        }

        /* Menu Items */
        .rh-items {
          padding: 12px;
          display: flex;
          flex-direction: column;
          gap: 4px;
        }

        .rh-item {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 12px 14px;
          border-radius: 12px;
          color: rgba(255,255,255,0.9);
          text-decoration: none;
          font-size: 14px;
          font-weight: 500;
          transition: all 0.15s ease;
          cursor: pointer;
          border: none;
          background: transparent;
          width: 100%;
          text-align: left;
        }

        .rh-item:hover {
          background: rgba(255,255,255,0.1);
          color: #fff;
          box-shadow: inset 0 0 0 1px rgba(255,255,255,0.08);
        }

        .rh-item:active {
          background: rgba(255,255,255,0.15);
          transform: scale(0.98);
        }

        .rh-item-icon {
          width: 36px;
          height: 36px;
          border-radius: 10px;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
        }

        .rh-item-icon svg {
          width: 20px;
          height: 20px;
        }

        .rh-item-icon.designer { background: linear-gradient(135deg, #4285F4 0%, #34A853 100%); }
        .rh-item-icon.aria { background: linear-gradient(135deg, #f9cb00 0%, #e5b800 100%); }
        .rh-item-icon.aria svg { color: #1a1a2e; }
        .rh-item-icon.calc { background: linear-gradient(135deg, #EA4335 0%, #FBBC05 100%); }
        .rh-item-icon.tools { background: linear-gradient(135deg, #9333ea 0%, #ec4899 100%); }
        .rh-item-icon.account { background: linear-gradient(135deg, #34A853 0%, #4285F4 100%); }
        .rh-item-icon.login { background: linear-gradient(135deg, #6366f1 0%, #4f46e5 100%); }

        /* Auth required badge */
        .rh-item-lock {
          width: 14px;
          height: 14px;
          color: rgba(255,255,255,0.4);
          flex-shrink: 0;
        }

        .rh-item.auth-required:not(.authenticated) {
          opacity: 0.7;
        }

        .rh-item.auth-required:not(.authenticated):hover {
          opacity: 1;
        }

        /* User avatar */
        .rh-user-avatar {
          width: 28px;
          height: 28px;
          border-radius: 50%;
          background: linear-gradient(135deg, #34A853 0%, #4285F4 100%);
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 12px;
          font-weight: 600;
          color: #fff;
          flex-shrink: 0;
        }

        /* User initials in icon */
        .rh-user-initials {
          font-size: 11px;
          font-weight: 700;
          color: #fff;
          text-transform: uppercase;
        }

        .rh-item-text {
          flex: 1;
        }

        .rh-item-title {
          font-size: 13px;
          font-weight: 600;
          color: #fff;
        }

        .rh-item-desc {
          font-size: 11px;
          color: rgba(255,255,255,0.5);
          margin-top: 2px;
        }

        .rh-item-badge {
          font-size: 9px;
          font-weight: 700;
          color: #1a1a2e;
          background: #f9cb00;
          padding: 3px 6px;
          border-radius: 4px;
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }

        /* Divider */
        .rh-divider {
          height: 1px;
          background: rgba(255,255,255,0.08);
          margin: 8px 14px;
        }

        /* Footer - Glassmorphic */
        .rh-footer {
          padding: 12px 16px;
          background: rgba(0,0,0,0.15);
          border-top: 1px solid rgba(255,255,255,0.08);
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 6px;
        }

        .rh-footer-text {
          font-size: 10px;
          color: rgba(255,255,255,0.4);
        }

        .rh-footer-brand {
          font-size: 10px;
          font-weight: 600;
          color: rgba(255,255,255,0.5);
        }

        /* Mobile - positioned higher to avoid floating CTA */
        @media (max-width: 768px) {
          #remodely-hub {
            bottom: 90px;
            right: 16px;
          }

          .rh-trigger {
            width: 48px;
            height: 48px;
          }

          .rh-logo {
            width: 40px;
            height: 40px;
          }

          .rh-menu {
            width: calc(100vw - 32px);
            max-width: 320px;
            right: 0;
            bottom: 56px;
          }
        }

        /* Safe area */
        @supports (padding: env(safe-area-inset-bottom)) {
          #remodely-hub {
            bottom: calc(24px + env(safe-area-inset-bottom));
            right: calc(24px + env(safe-area-inset-right));
          }
          @media (max-width: 768px) {
            #remodely-hub {
              bottom: calc(90px + env(safe-area-inset-bottom));
              right: calc(16px + env(safe-area-inset-right));
            }
          }
        }
      </style>

      <!-- Main Trigger Button -->
      <button class="rh-trigger" id="rhTrigger" aria-label="Open Remodely Tools">
        <svg class="rh-logo" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <linearGradient id="rhGrad" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stop-color="#4285F4"/>
              <stop offset="33%" stop-color="#EA4335"/>
              <stop offset="66%" stop-color="#FBBC05"/>
              <stop offset="100%" stop-color="#34A853"/>
            </linearGradient>
          </defs>
          <path d="M3 21V10l9-7 9 7v11" stroke="url(#rhGrad)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
          <path d="M21 21h-7" stroke="#34A853" stroke-width="2.5" stroke-linecap="round"/>
        </svg>
      </button>

      <!-- Menu Panel -->
      <div class="rh-menu" id="rhMenu">
        <div class="rh-header">
          <svg class="rh-header-icon" viewBox="0 0 24 24" fill="none">
            <defs>
              <linearGradient id="rhGrad2" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stop-color="#4285F4"/>
                <stop offset="33%" stop-color="#EA4335"/>
                <stop offset="66%" stop-color="#FBBC05"/>
                <stop offset="100%" stop-color="#34A853"/>
              </linearGradient>
            </defs>
            <path d="M3 21V10l9-7 9 7v11" stroke="url(#rhGrad2)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
            <path d="M21 21h-7" stroke="#34A853" stroke-width="2" stroke-linecap="round"/>
          </svg>
          <div class="rh-header-text">
            <p class="rh-header-title">Remodely Tools</p>
            <p class="rh-header-subtitle">AI-powered design suite</p>
          </div>
        </div>

        <div class="rh-items">
          <!-- Auth-gated: Room Designer -->
          <a href="javascript:void(0)" class="rh-item auth-required" id="rhDesignerLink" data-tool-url="/tools/room-designer/">
            <div class="rh-item-icon designer">
              <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <rect x="3" y="3" width="18" height="18" rx="2"/>
                <path d="M3 9h18M9 21V9"/>
              </svg>
            </div>
            <div class="rh-item-text">
              <div class="rh-item-title">Room Designer Pro</div>
              <div class="rh-item-desc">Design your space in 3D</div>
            </div>
            <svg class="rh-item-lock" id="rhDesignerLock" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2">
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
              <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
            </svg>
          </a>

          <!-- Auth-gated: Aria Voice -->
          <button class="rh-item auth-required" id="rhAriaBtn">
            <div class="rh-item-icon aria">
              <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/>
                <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
                <line x1="12" y1="19" x2="12" y2="23"/>
                <line x1="8" y1="23" x2="16" y2="23"/>
              </svg>
            </div>
            <div class="rh-item-text">
              <div class="rh-item-title">Aria Voice</div>
              <div class="rh-item-desc">AI assistant</div>
            </div>
            <svg class="rh-item-lock" id="rhAriaLock" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2">
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
              <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
            </svg>
          </button>

          <!-- Public: Cost Calculator (no auth required) -->
          <a href="/tools/countertop-calculator/" class="rh-item">
            <div class="rh-item-icon calc">
              <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <rect x="4" y="2" width="16" height="20" rx="2"/>
                <line x1="8" y1="6" x2="16" y2="6"/>
                <line x1="8" y1="10" x2="8" y2="10"/>
                <line x1="12" y1="10" x2="12" y2="10"/>
                <line x1="16" y1="10" x2="16" y2="10"/>
                <line x1="8" y1="14" x2="8" y2="14"/>
                <line x1="12" y1="14" x2="12" y2="14"/>
                <line x1="16" y1="14" x2="16" y2="14"/>
                <line x1="8" y1="18" x2="8" y2="18"/>
                <line x1="12" y1="18" x2="16" y2="18"/>
              </svg>
            </div>
            <div class="rh-item-text">
              <div class="rh-item-title">Cost Calculator</div>
              <div class="rh-item-desc">Free instant estimates</div>
            </div>
          </a>

          <div class="rh-divider"></div>

          <a href="/tools/" class="rh-item">
            <div class="rh-item-icon tools">
              <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <circle cx="12" cy="12" r="3"/>
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/>
              </svg>
            </div>
            <div class="rh-item-text">
              <div class="rh-item-title">All Tools</div>
              <div class="rh-item-desc">Explore design suite</div>
            </div>
          </a>

          <div class="rh-divider"></div>

          <!-- Login / Account Section -->
          <a href="/account/" class="rh-item" id="rhAccountLink">
            <div class="rh-item-icon login" id="rhAccountIcon">
              <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/>
                <polyline points="10 17 15 12 10 7"/>
                <line x1="15" y1="12" x2="3" y2="12"/>
              </svg>
            </div>
            <div class="rh-item-text">
              <div class="rh-item-title" id="rhAccountTitle">Sign In</div>
              <div class="rh-item-desc" id="rhAccountDesc">Access your projects</div>
            </div>
          </a>
        </div>

        <div class="rh-footer">
          <span class="rh-footer-text">Powered by</span>
          <span class="rh-footer-brand">Remodely.ai</span>
        </div>
      </div>
    `;

    document.body.appendChild(hub);

    // Elements
    const trigger = document.getElementById('rhTrigger');
    const menu = document.getElementById('rhMenu');
    const ariaBtn = document.getElementById('rhAriaBtn');
    let isOpen = false;

    // Toggle menu
    function toggleMenu() {
      isOpen = !isOpen;
      trigger.classList.toggle('open', isOpen);
      menu.classList.toggle('open', isOpen);
    }

    // Close menu
    function closeMenu() {
      isOpen = false;
      trigger.classList.remove('open');
      menu.classList.remove('open');
    }

    // Event listeners
    trigger.addEventListener('click', toggleMenu);

    // Close on outside click
    document.addEventListener('click', (e) => {
      if (isOpen && !hub.contains(e.target)) {
        closeMenu();
      }
    });

    // Close on escape
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && isOpen) {
        closeMenu();
      }
    });

    // Auth state management
    const designerLink = document.getElementById('rhDesignerLink');
    const designerLock = document.getElementById('rhDesignerLock');
    const ariaLock = document.getElementById('rhAriaLock');
    const accountLink = document.getElementById('rhAccountLink');
    const accountIcon = document.getElementById('rhAccountIcon');
    const accountTitle = document.getElementById('rhAccountTitle');
    const accountDesc = document.getElementById('rhAccountDesc');

    function updateAuthState() {
      const isLoggedIn = window.SgAuth?.isLoggedIn?.() || false;
      const profile = window.SgAuth?.getProfile?.() || {};
      const userName = profile.full_name || profile.email?.split('@')[0] || 'User';
      const initials = userName.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);

      // Update auth-required items
      document.querySelectorAll('.rh-item.auth-required').forEach(item => {
        if (isLoggedIn) {
          item.classList.add('authenticated');
        } else {
          item.classList.remove('authenticated');
        }
      });

      // Hide/show lock icons
      if (designerLock) designerLock.style.display = isLoggedIn ? 'none' : 'block';
      if (ariaLock) ariaLock.style.display = isLoggedIn ? 'none' : 'block';

      // Update account section
      if (isLoggedIn) {
        accountIcon.className = 'rh-item-icon account';
        accountIcon.innerHTML = `<span class="rh-user-initials">${initials}</span>`;
        accountTitle.textContent = 'My Account';
        accountDesc.textContent = 'Dashboard & projects';
      } else {
        accountIcon.className = 'rh-item-icon login';
        accountIcon.innerHTML = `<svg fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/>
          <polyline points="10 17 15 12 10 7"/>
          <line x1="15" y1="12" x2="3" y2="12"/>
        </svg>`;
        accountTitle.textContent = 'Sign In';
        accountDesc.textContent = 'Access your projects';
      }
    }

    // Handle auth-gated tool clicks
    designerLink?.addEventListener('click', (e) => {
      e.preventDefault();
      const isLoggedIn = window.SgAuth?.isLoggedIn?.() || false;
      const toolUrl = designerLink.getAttribute('data-tool-url');

      if (isLoggedIn) {
        window.location.href = toolUrl;
      } else {
        window.location.href = '/sign-up/?redirect=' + encodeURIComponent(toolUrl);
      }
    });

    // Handle Aria button (auth-gated)
    ariaBtn?.addEventListener('click', () => {
      const isLoggedIn = window.SgAuth?.isLoggedIn?.() || false;

      if (!isLoggedIn) {
        window.location.href = '/sign-up/?redirect=' + encodeURIComponent('/account/');
        return;
      }

      closeMenu();
      openAria();
    });

    // Initialize auth state
    updateAuthState();

    // Listen for auth changes
    if (window.SgAuth?.onAuthChange) {
      window.SgAuth.onAuthChange(updateAuthState);
    }

    // Also check after a delay (for slow auth init)
    setTimeout(updateAuthState, 1000);
    setTimeout(updateAuthState, 3000);

    // Aria button - trigger Aria widget (loads directly, no dependency on remodely-widgets.js)
    ariaBtn.addEventListener('click', () => {
      closeMenu();
      openAria();
    });

    // Close menu when clicking a link
    menu.querySelectorAll('a').forEach(link => {
      link.addEventListener('click', closeMenu);
    });
  }

  // Initialize on DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', createRemodelyHub);
  } else {
    createRemodelyHub();
  }

  // Expose openAria globally for other scripts
  window.RemodelyHub = {
    openAria: openAria
  };

  // Compatibility layer for SGWidgets.showAriaVoice
  if (!window.SGWidgets) {
    window.SGWidgets = {};
  }
  if (!window.SGWidgets.showAriaVoice) {
    window.SGWidgets.showAriaVoice = openAria;
  }
})();
