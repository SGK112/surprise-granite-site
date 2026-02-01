/**
 * SURPRISE GRANITE - PRICING CONFIGURATION
 * Wholesale costs, tier markups, and subscription discounts
 *
 * CONFIDENTIAL - Do not expose wholesale costs to frontend
 * This file should only be used server-side or in authenticated contexts
 */

(function() {
  'use strict';

  const SG_PRICING_CONFIG = {

    // ===========================================
    // USER TIERS & MARKUP PERCENTAGES
    // ===========================================
    tiers: {
      // Public/Guest - highest markup
      guest: {
        name: 'Guest',
        markup: 1.55,  // 55% markup
        description: 'Sign in for better pricing'
      },

      // Homeowner - standard retail
      homeowner: {
        name: 'Homeowner',
        markup: 1.50,  // 50% markup
        description: 'Retail pricing'
      },

      // Pro Subscriber - $29/mo
      pro: {
        name: 'Pro Member',
        markup: 1.35,  // 35% markup
        description: 'Pro subscriber pricing',
        monthlyFee: 29
      },

      // Designer - verified designers
      designer: {
        name: 'Designer',
        markup: 1.30,  // 30% markup
        description: 'Trade pricing for designers',
        requiresVerification: true
      },

      // Contractor - verified contractors
      contractor: {
        name: 'Contractor',
        markup: 1.25,  // 25% markup
        description: 'Contractor pricing',
        requiresVerification: true
      },

      // Fabricator - lowest markup, highest volume
      fabricator: {
        name: 'Fabricator',
        markup: 1.15,  // 15% markup
        description: 'Wholesale pricing for fabricators',
        requiresVerification: true,
        monthlyFee: 79
      }
    },

    // ===========================================
    // SUBSCRIPTION PLANS
    // ===========================================
    subscriptions: {
      free: {
        tier: 'homeowner',
        features: ['Browse products', 'Request quotes', 'Basic calculator']
      },
      pro: {
        tier: 'pro',
        price: 29,
        annual: 290,
        savings: '17%',
        features: [
          '35% off retail pricing',
          'Priority support',
          'Extended warranties',
          'Pro tools access',
          'Volume discounts'
        ]
      },
      fabricator: {
        tier: 'fabricator',
        price: 79,
        annual: 790,
        savings: '17%',
        features: [
          'Wholesale pricing (15% markup)',
          'Net 30 terms available',
          'Direct vendor ordering',
          'API access',
          'Dedicated account manager'
        ]
      },
      business: {
        tier: 'fabricator',
        price: 149,
        annual: 1490,
        savings: '17%',
        features: [
          'Everything in Fabricator',
          'Multi-user accounts',
          'Custom integrations',
          'White-label options',
          'Priority fulfillment'
        ]
      }
    },

    // ===========================================
    // BRAVO TILE - WHOLESALE COSTS (per sq ft)
    // From January 2026 Price List
    // ===========================================
    bravo: {
      // Porcelain - Wood Look
      porcelain_wood: {
        'listone-noce': 2.99,
        'listone-iroko': 2.99,
        'amalfi-gris': 4.25,
        'rango-americano': 4.25,
        'avana-brown': 4.25,
        'bianca-sabbia': 4.25,
        'montana-marrone': 4.25,
        'sequoia-white': 4.25,
        'sequoia-nut': 4.25,
        'sequoia-brown': 4.25,
        '_default': 3.99
      },

      // Porcelain - Stone/Concrete Look (24x48)
      porcelain_large: {
        'antique-white-polished': 5.49,
        'antique-white-matte': 4.99,
        'attitude-white': 5.99,
        'attitude-grey': 5.99,
        'azuma-white': 5.25,
        'azuma-taupe': 5.25,
        'azuma-ivory': 5.25,
        'bruges': 4.99,
        'breccia-venezia': 2.89,
        'bellagio': 4.99,
        'calacatta-extra-polished': 5.25,
        'calacatta-extra-matte': 4.99,
        'calacatta-green': 5.25,
        'lakestone': 4.75,
        'marmo-marfil': 4.75,
        'marmo-white': 4.75,
        'medici': 4.99,
        'newbury': 4.99,
        'statuario-qua': 3.99,
        'super-calacatta': 4.99,
        '_default': 4.99
      },

      // Porcelain - 12x24
      porcelain_medium: {
        'living': 3.99,
        'lakestone-12x24': 3.25,
        'marmo-12x24': 2.99,
        'mood-ivory': 2.49,
        'pietra': 3.49,
        'pure': 3.99,
        'star': 2.99,
        'tessuto': 2.49,
        '_default': 3.49
      },

      // Travertine Collections
      travertine: {
        'autumn-leaves-tumbled': 4.99,
        'autumn-leaves-filled': 5.25,
        'autumn-leaves-versailles': 5.69,
        'noce-tumbled': 4.49,
        'noce-filled': 4.49,
        'noce-versailles': 4.99,
        'crema-classico-tumbled': 4.65,
        'crema-classico-filled': 4.65,
        'crema-classico-versailles': 4.99,
        'ivory-platinum': 4.99,
        'silver': 5.49,
        'gold': 5.25,
        'walnut': 4.99,
        '_default': 4.99
      },

      // Travertine Pavers (3cm)
      travertine_paver: {
        'autumn-leaves-paver': 7.25,
        'noce-paver': 6.75,
        'crema-classico-paver': 6.49,
        'silver-paver': 7.99,
        'walnut-paver': 6.99,
        '_default': 6.99
      },

      // Pool Coping (3cm)
      pool_coping_3cm: {
        '_default': 10.49
      },

      // Pool Coping (5cm)
      pool_coping_5cm: {
        '_default': 13.49
      },

      // Marble
      marble: {
        'white-carrara': 8.49,
        'crema-marfil-select': 9.10,
        'crema-marfil-classic': 8.54,
        'botticino-beige': 7.10,
        'cappuccino': 6.39,
        'thassos': 17.99,
        'calacatta-gold': 17.99,
        'emperador-light': 7.99,
        'emperador-dark': 9.99,
        'statuary': 23.50,
        'diana-royal': 7.99,
        'nero-marquina': 7.74,
        '_default': 8.99
      },

      // Marble Mosaics (per piece)
      mosaic_marble: {
        'white-carrara-mosaic': 9.75,
        'calacatta-gold-mosaic': 16.00,
        'crema-marfil-mosaic': 9.95,
        'thassos-mosaic': 15.99,
        'emperador-mosaic': 10.25,
        '_default': 9.99
      },

      // Travertine Mosaics (per piece)
      mosaic_travertine: {
        '_default': 7.00
      },

      // Glass Mosaics (per piece)
      mosaic_glass: {
        '_default': 12.49
      },

      // Ledger Panels
      ledger: {
        'alaska-grey': 6.49,
        'arctic-white': 6.49,
        'autumn-leaves': 6.49,
        'crema-classico': 6.00,
        'noce': 6.00,
        'silver': 5.99,
        'golden-honey': 6.50,
        'sierra-blue': 7.25,
        '_default': 6.49
      }
    },

    // ===========================================
    // MSI QUARTZ - WHOLESALE COSTS (per sq ft)
    // From Oct 2025 AZPH Price List - Bundle pricing
    // ===========================================
    msi_quartz: {
      group0: { cost_2cm: 9.82, cost_3cm: 12.85, colors: [
        'aruca-white', 'bayshore-sand', 'bianco-pepper', 'frost-white',
        'iced-white', 'iced-gray', 'macabo-gray', 'sparkling-white'
      ]},
      group1: { cost_2cm: 9.99, cost_3cm: 14.42, colors: [
        'arctic-white', 'carrara-delphi', 'carrara-miksa', 'carrara-trigato',
        'manhattan-gray', 'peppercorn-white', 'snow-white'
      ]},
      group2: { cost_2cm: 12.96, cost_3cm: 16.49, colors: [
        'calacatta-alto', 'calacatta-belaros', 'calacatta-duolina', 'calacatta-rusta',
        'carrara-breve', 'carrara-marmi', 'carrara-mist', 'carrara-morro',
        'fossil-gray', 'marfitaj', 'meridian-gray', 'midnight-majesty',
        'mystic-gray', 'new-calacatta-laza', 'sparkling-black', 'stellar-white'
      ]},
      group3: { cost_2cm: 15.28, cost_3cm: 19.43, colors: [
        'alabaster-white', 'calacatta-bali', 'calacatta-classique', 'calacatta-elysio',
        'calacatta-idillio', 'calacatta-lavasa', 'calacatta-laza', 'calacatta-nuvina',
        'calacatta-sierra', 'calacatta-rivessa', 'calacatta-ultra', 'calacatta-vicenza',
        'calacatta-verona', 'calico-white', 'carrara-lumos', 'cashmere-taj',
        'concerto', 'fairy-white', 'gray-lagoon', 'montclair-white', 'statuary-classique'
      ]},
      group4: { cost_2cm: 18.35, cost_3cm: 22.75, colors: [
        'babylon-gray', 'blanca-arabescato', 'blanca-statuarietto', 'calacatta-adonia',
        'calacatta-botanica', 'calacatta-fioressa', 'calacatta-karmelo', 'calacatta-leon',
        'calacatta-prado', 'calacatta-premata', 'calacatta-safyra', 'perla-white',
        'premium-plus-white', 'soapstone-metropolis', 'soapstone-mist'
      ]},
      group5: { cost_2cm: 21.24, cost_3cm: 26.90, colors: [
        'aurataj', 'calacatta-aidana', 'calacatta-azulean', 'calacatta-delios',
        'calacatta-jadira', 'calacatta-laza-night', 'calacatta-leon-gold',
        'calacatta-monaco', 'chakra-beige', 'galant-gray', 'eroluna',
        'marquina-midnight', 'midnight-corvo', 'portico-cream', 'rolling-fog', 'smoked-pearl'
      ]},
      group6: { cost_2cm: 23.06, cost_3cm: 29.22, colors: [
        'calacatta-abezzo', 'calacatta-arno', 'calacatta-clara', 'calacatta-izaro',
        'calacatta-laza-grigio', 'calacatta-laza-oro', 'calacatta-luccia',
        'calacatta-lumanyx', 'calacatta-miraggio', 'calacatta-trevi', 'calacatta-valentin',
        'calacatta-vernello'
      ]},
      group7: { cost_2cm: 25.57, cost_3cm: 32.29, colors: [
        'calacatta-azai', 'calacatta-cinela', 'calacatta-goa', 'calacatta-miraggio-cove',
        'calacatta-miraggio-cielo', 'calacatta-miraggio-duo', 'calacatta-miraggio-gold',
        'calacatta-miraggio-lusso', 'calacatta-miraggio-seaglass', 'calacatta-miraggio-sienna',
        'calacatta-ocellio', 'calacatta-solessio', 'calacatta-versailles'
      ]},
      group8: { cost_2cm: 28.21, cost_3cm: 35.69, colors: [
        'azurmatt', 'calacatta-viraldi', 'lumataj'
      ]}
    },

    // ===========================================
    // MSI TILE - Estimated wholesale costs
    // ===========================================
    msi_tile: {
      porcelain: { _default: 4.99 },
      ceramic: { _default: 3.99 },
      marble: { _default: 7.99 },
      travertine: { _default: 5.99 },
      mosaic: { _default: 8.99 },
      encaustic: { _default: 9.99 },
      subway: { _default: 4.49 },
      _default: 5.99
    },

    // ===========================================
    // MSI FLOORING - WHOLESALE COSTS (per sq ft)
    // From AZPH Price List - Luxury Vinyl Plank
    // ===========================================
    msi_flooring: {
      // Andover Collection - 7x48, 20mil wear layer
      andover: {
        cost_per_sf: 2.29,
        cost_per_box: 50.38,  // 22 sf/box
        sf_per_box: 22,
        colors: [
          'abingdale', 'bayhill-blonde', 'blythe', 'dakworth', 'hatfield',
          'highcliffe-greige', 'kingsdown-gray', 'whitby-white'
        ]
      },

      // Ashton Collection - 7x48, 20mil wear layer
      ashton: {
        cost_per_sf: 2.29,
        cost_per_box: 50.38,
        sf_per_box: 22,
        colors: [
          'bergen-hills', 'colston-park', 'daybell', 'griese', 'hadley',
          'milledge', 'roscoe', 'sandbridge', 'silas'
        ]
      },

      // Wilmont Collection - 7x48, 20mil wear layer, SPC
      wilmont: {
        cost_per_sf: 2.49,
        cost_per_box: 54.78,
        sf_per_box: 22,
        colors: [
          'braly', 'burnaby', 'charcoal-oak', 'dusk-cherry', 'fawn-oak',
          'reclaimed-oak', 'sandino', 'smokey-maple', 'whitfield-gray'
        ]
      },

      // Cyrus Collection - 7x48, 12mil wear layer, SPC
      cyrus: {
        cost_per_sf: 1.99,
        cost_per_box: 46.57,
        sf_per_box: 23.4,
        colors: [
          'akadia', 'bembridge', 'billingham', 'bracken-hill', 'brianka',
          'draven', 'dunite-oak', 'exotika', 'fauna', 'finely', 'ludlow',
          'mezcla', 'ryder', 'sienna-oak', 'twilight-oak', 'wolfeboro'
        ]
      },

      // Prescott Collection - 7x48, 20mil wear layer, SPC
      prescott: {
        cost_per_sf: 2.69,
        cost_per_box: 62.95,
        sf_per_box: 23.4,
        colors: [
          'brookline', 'cloudcroft', 'draper', 'dunmore', 'fauna', 'jenta',
          'katella-ash', 'ludlow', 'ryder', 'sandino', 'whitewater', 'wolfeboro'
        ]
      },

      // Everlife Rigid Core - Premium SPC
      everlife: {
        cost_per_sf: 2.89,
        cost_per_box: 67.63,
        sf_per_box: 23.4,
        colors: [
          'andover-bayhill', 'ashton-bergen', 'cyrus-akadia', 'prescott-fauna',
          'wilmont-burnaby', 'xl-cyrus', 'xl-prescott'
        ]
      },

      // XL Collections - 9x60 planks
      xl_cyrus: {
        cost_per_sf: 2.59,
        cost_per_box: 60.61,
        sf_per_box: 23.4,
        colors: [
          'xl-akadia', 'xl-bembridge', 'xl-cyrus', 'xl-dunite', 'xl-exotika',
          'xl-finely', 'xl-mezcla', 'xl-ryder', 'xl-twilight'
        ]
      },

      xl_prescott: {
        cost_per_sf: 2.99,
        cost_per_box: 69.97,
        sf_per_box: 23.4,
        colors: [
          'xl-brookline', 'xl-draper', 'xl-fauna', 'xl-jenta', 'xl-katella',
          'xl-ludlow', 'xl-whitewater', 'xl-wolfeboro'
        ]
      },

      // Katavia Collection - Budget-friendly
      katavia: {
        cost_per_sf: 1.69,
        cost_per_box: 37.18,
        sf_per_box: 22,
        colors: [
          'bleached-elm', 'burnished-acacia', 'charred-oak', 'coastal-mix',
          'heartwood', 'hickory-mist', 'licorice', 'reclaimed-teak',
          'saddle', 'woodland'
        ]
      },

      // Lowcountry Collection - Wide plank 9x48
      lowcountry: {
        cost_per_sf: 2.79,
        cost_per_box: 65.23,
        sf_per_box: 23.4,
        colors: [
          'bluff', 'burlap', 'driftwood', 'heron', 'oyster', 'tide'
        ]
      },

      // Default for unknown collections
      _default: {
        cost_per_sf: 2.29,
        cost_per_box: 50.38,
        sf_per_box: 22
      }
    },

    // ===========================================
    // HELPER METHODS
    // ===========================================

    /**
     * Get wholesale cost for a Bravo tile
     */
    getBravoCost: function(handle, category) {
      const cats = this.bravo;

      // Try to find in specific category
      if (category && cats[category]) {
        if (cats[category][handle]) return cats[category][handle];
        if (cats[category]['_default']) return cats[category]['_default'];
      }

      // Search all categories
      for (const cat in cats) {
        if (cats[cat][handle]) return cats[cat][handle];
      }

      // Default porcelain price
      return 4.99;
    },

    /**
     * Get wholesale cost for MSI quartz
     */
    getMSIQuartzCost: function(colorHandle, thickness) {
      const handle = colorHandle.toLowerCase().replace(/\s+/g, '-');
      const costKey = thickness === '3cm' ? 'cost_3cm' : 'cost_2cm';

      for (const group in this.msi_quartz) {
        const g = this.msi_quartz[group];
        if (g.colors && g.colors.some(c => handle.includes(c))) {
          return g[costKey];
        }
      }

      // Default to group 2
      return this.msi_quartz.group2[costKey];
    },

    /**
     * Get wholesale cost for MSI flooring
     * @param {string} productName - Product name or handle
     * @param {string} priceType - 'sf' for per sq ft, 'box' for per box
     * @returns {object} { cost, collection, sf_per_box }
     */
    getMSIFlooringCost: function(productName, priceType = 'sf') {
      const handle = productName.toLowerCase().replace(/\s+/g, '-');
      const collections = this.msi_flooring;

      // Try to match collection by name
      for (const collectionName in collections) {
        if (collectionName === '_default') continue;

        const collection = collections[collectionName];

        // Check if product name contains collection name
        if (handle.includes(collectionName.replace(/_/g, '-'))) {
          return {
            cost: priceType === 'box' ? collection.cost_per_box : collection.cost_per_sf,
            cost_per_sf: collection.cost_per_sf,
            cost_per_box: collection.cost_per_box,
            collection: collectionName,
            sf_per_box: collection.sf_per_box
          };
        }

        // Check if product matches any color in collection
        if (collection.colors && collection.colors.some(color => handle.includes(color))) {
          return {
            cost: priceType === 'box' ? collection.cost_per_box : collection.cost_per_sf,
            cost_per_sf: collection.cost_per_sf,
            cost_per_box: collection.cost_per_box,
            collection: collectionName,
            sf_per_box: collection.sf_per_box
          };
        }
      }

      // Default pricing
      const defaultColl = collections._default;
      return {
        cost: priceType === 'box' ? defaultColl.cost_per_box : defaultColl.cost_per_sf,
        cost_per_sf: defaultColl.cost_per_sf,
        cost_per_box: defaultColl.cost_per_box,
        collection: 'unknown',
        sf_per_box: defaultColl.sf_per_box
      };
    },

    /**
     * Calculate flooring project cost
     * @param {string} productName - Flooring product name
     * @param {number} sqFt - Square footage needed
     * @param {string} userTier - User pricing tier
     * @param {number} wastePercent - Waste factor (default 10%)
     * @returns {object} { wholesale, retail, boxes_needed, actual_sqft }
     */
    calculateFlooringCost: function(productName, sqFt, userTier = 'guest', wastePercent = 10) {
      const floorInfo = this.getMSIFlooringCost(productName, 'sf');
      const markup = this.getMarkup(userTier);

      // Add waste factor
      const adjustedSqFt = sqFt * (1 + wastePercent / 100);

      // Calculate boxes needed (round up)
      const boxesNeeded = Math.ceil(adjustedSqFt / floorInfo.sf_per_box);
      const actualSqFt = boxesNeeded * floorInfo.sf_per_box;

      // Calculate costs
      const wholesaleTotal = actualSqFt * floorInfo.cost_per_sf;
      const retailTotal = wholesaleTotal * markup;

      return {
        collection: floorInfo.collection,
        cost_per_sf: {
          wholesale: floorInfo.cost_per_sf,
          retail: Math.round(floorInfo.cost_per_sf * markup * 100) / 100
        },
        cost_per_box: {
          wholesale: floorInfo.cost_per_box,
          retail: Math.round(floorInfo.cost_per_box * markup * 100) / 100
        },
        boxes_needed: boxesNeeded,
        sf_per_box: floorInfo.sf_per_box,
        actual_sqft: actualSqFt,
        requested_sqft: sqFt,
        waste_percent: wastePercent,
        total: {
          wholesale: Math.round(wholesaleTotal * 100) / 100,
          retail: Math.round(retailTotal * 100) / 100
        },
        savings: {
          amount: Math.round((retailTotal - wholesaleTotal) * 100) / 100,
          percent: Math.round((1 - 1/markup) * 100)
        }
      };
    },

    /**
     * Get markup multiplier for user tier
     */
    getMarkup: function(userTier) {
      const tier = this.tiers[userTier] || this.tiers.guest;
      return tier.markup;
    },

    /**
     * Calculate retail price from wholesale
     */
    calculatePrice: function(wholesaleCost, userTier) {
      const markup = this.getMarkup(userTier);
      return Math.round(wholesaleCost * markup * 100) / 100;
    },

    /**
     * Get savings percentage compared to guest pricing
     */
    getSavings: function(userTier) {
      const guestMarkup = this.tiers.guest.markup;
      const userMarkup = this.getMarkup(userTier);
      const savings = ((guestMarkup - userMarkup) / guestMarkup) * 100;
      return Math.round(savings);
    },

    /**
     * Get tier from user role and subscription
     */
    getTierFromUser: function(user) {
      if (!user) return 'guest';

      const role = user.role || 'user';
      const subscription = user.pro_subscription_tier;

      // Check subscription first
      if (subscription === 'fabricator' || subscription === 'business') {
        return 'fabricator';
      }
      if (subscription === 'pro') {
        return 'pro';
      }

      // Then check role
      if (role === 'fabricator') return 'fabricator';
      if (role === 'contractor') return 'contractor';
      if (role === 'designer') return 'designer';

      // Default to homeowner for logged in users
      return 'homeowner';
    }
  };

  // Expose globally
  window.SG_PRICING_CONFIG = SG_PRICING_CONFIG;

  // Also expose for Node.js if needed
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = SG_PRICING_CONFIG;
  }

})();
