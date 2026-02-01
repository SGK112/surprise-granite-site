/**
 * SURPRISE GRANITE - DYNAMIC PRICING SERVICE
 * Calculates prices based on user role, subscription, and product data
 * Integrates with sg-auth.js for user context
 */

(function() {
  'use strict';

  // Wait for dependencies
  const waitForDeps = setInterval(() => {
    if (window.SG_PRICING_CONFIG) {
      clearInterval(waitForDeps);
      initPricingService();
    }
  }, 50);

  function initPricingService() {
    const CONFIG = window.SG_PRICING_CONFIG;

    const SG_PRICING = {

      // Current user tier (updated on auth change)
      _currentTier: 'guest',
      _currentUser: null,
      _listeners: [],

      /**
       * Initialize pricing service
       */
      init: async function() {
        // Listen for auth state changes
        if (window.SgAuth) {
          // Subscribe to auth changes - sg-auth.js uses onAuthChange
          window.SgAuth.onAuthChange((event, data) => {
            const user = data?.user;
            const profile = data?.profile;

            // Combine user and profile data for tier determination
            if (profile) {
              this._currentUser = {
                ...user,
                role: profile.account_type,
                pro_subscription_tier: profile.pro_subscription_tier
              };
            } else {
              this._currentUser = user;
            }

            this._currentTier = CONFIG.getTierFromUser(this._currentUser);
            console.log('[Pricing] Auth changed, tier:', this._currentTier);
            this._notifyListeners();
          });

          // Get initial user synchronously
          const user = window.SgAuth.getUser();
          const profile = window.SgAuth.getProfile();
          if (profile) {
            this._currentUser = {
              ...user,
              role: profile.account_type,
              pro_subscription_tier: profile.pro_subscription_tier
            };
          } else {
            this._currentUser = user;
          }
          this._currentTier = CONFIG.getTierFromUser(this._currentUser);
        }

        console.log('[Pricing] Initialized with tier:', this._currentTier);
        return this;
      },

      /**
       * Subscribe to pricing/tier changes
       */
      onTierChange: function(callback) {
        this._listeners.push(callback);
        // Immediately call with current tier
        callback(this._currentTier, this._currentUser);
      },

      /**
       * Notify listeners of tier change
       */
      _notifyListeners: function() {
        this._listeners.forEach(cb => cb(this._currentTier, this._currentUser));
      },

      /**
       * Get current user tier
       */
      getCurrentTier: function() {
        return this._currentTier;
      },

      /**
       * Get tier info
       */
      getTierInfo: function(tier) {
        return CONFIG.tiers[tier || this._currentTier];
      },

      /**
       * Calculate price for a product
       * @param {Object} product - Product with wholesaleCost or price
       * @param {String} overrideTier - Optional tier override
       * @returns {Object} Pricing details
       */
      calculatePrice: function(product, overrideTier) {
        const tier = overrideTier || this._currentTier;
        const tierInfo = CONFIG.tiers[tier];

        // Get wholesale cost
        let wholesaleCost = product.wholesaleCost || product.cost;

        // If no wholesale cost, try to determine from product type
        if (!wholesaleCost) {
          wholesaleCost = this._estimateWholesaleCost(product);
        }

        // Calculate prices for different tiers
        const guestPrice = CONFIG.calculatePrice(wholesaleCost, 'guest');
        const userPrice = CONFIG.calculatePrice(wholesaleCost, tier);
        const fabricatorPrice = CONFIG.calculatePrice(wholesaleCost, 'fabricator');

        // Calculate savings
        const savingsAmount = guestPrice - userPrice;
        const savingsPercent = CONFIG.getSavings(tier);

        return {
          wholesaleCost: wholesaleCost,
          retailPrice: guestPrice,
          yourPrice: userPrice,
          bestPrice: fabricatorPrice,
          savings: savingsAmount,
          savingsPercent: savingsPercent,
          tier: tier,
          tierName: tierInfo.name,
          formatted: {
            retail: '$' + guestPrice.toFixed(2),
            yourPrice: '$' + userPrice.toFixed(2),
            savings: '$' + savingsAmount.toFixed(2),
            bestPrice: '$' + fabricatorPrice.toFixed(2)
          }
        };
      },

      /**
       * Estimate wholesale cost from product data
       */
      _estimateWholesaleCost: function(product) {
        const vendor = (product.vendor || '').toLowerCase();
        const title = (product.title || '').toLowerCase();
        const tags = (product.tags || []).join(' ').toLowerCase();
        const type = (product.productType || product.type || '').toLowerCase();

        // Bravo Tile
        if (vendor.includes('bravo')) {
          // Check for specific categories
          if (tags.includes('travertine') || title.includes('travertine')) {
            if (tags.includes('paver') || title.includes('paver')) {
              return CONFIG.bravo.travertine_paver._default;
            }
            if (tags.includes('coping') || title.includes('coping')) {
              return title.includes('5cm') ? 13.49 : 10.49;
            }
            return CONFIG.bravo.travertine._default;
          }
          if (tags.includes('marble') || title.includes('marble') || title.includes('carrara')) {
            return CONFIG.bravo.marble._default;
          }
          if (tags.includes('mosaic') || title.includes('mosaic')) {
            return CONFIG.bravo.mosaic_marble._default;
          }
          if (tags.includes('ledger') || title.includes('ledger')) {
            return CONFIG.bravo.ledger._default;
          }
          // Default to porcelain
          return CONFIG.bravo.porcelain_medium._default;
        }

        // MSI Tile
        if (vendor.includes('msi')) {
          if (tags.includes('marble') || title.includes('marble')) {
            return CONFIG.msi_tile.marble._default;
          }
          if (tags.includes('mosaic') || title.includes('mosaic')) {
            return CONFIG.msi_tile.mosaic._default;
          }
          if (tags.includes('encaustic') || title.includes('encaustic')) {
            return CONFIG.msi_tile.encaustic._default;
          }
          if (tags.includes('subway') || title.includes('subway')) {
            return CONFIG.msi_tile.subway._default;
          }
          return CONFIG.msi_tile._default;
        }

        // Generic fallback
        return 5.99;
      },

      /**
       * Get pricing comparison - INTERNAL USE ONLY
       * Does not expose actual prices for other tiers to prevent price leakage
       * Only returns current tier info and upgrade percentages
       */
      getPricingTiers: function(product) {
        // Only return current tier info - don't expose other tier prices
        const currentPricing = this.calculatePrice(product);
        const currentTierInfo = CONFIG.tiers[this._currentTier];

        return [{
          tier: this._currentTier,
          name: currentTierInfo.name,
          price: currentPricing.yourPrice,
          formatted: currentPricing.formatted.yourPrice,
          savings: currentPricing.savingsPercent + '%',
          isCurrent: true,
          requiresSubscription: this._currentTier === 'pro' || this._currentTier === 'fabricator',
          requiresVerification: currentTierInfo.requiresVerification
        }];
      },

      /**
       * Get potential savings info without revealing actual prices
       */
      getUpgradeSavingsInfo: function() {
        return {
          guest: { nextTier: 'homeowner', potentialSavings: '3%' },
          homeowner: { nextTier: 'pro', potentialSavings: 'up to 35%', monthlyFee: 29 },
          pro: { nextTier: 'contractor', potentialSavings: 'additional 10%', requiresVerification: true },
          designer: { nextTier: 'contractor', potentialSavings: 'additional 5%', requiresVerification: true },
          contractor: { nextTier: 'fabricator', potentialSavings: 'wholesale rates', monthlyFee: 79 },
          fabricator: { nextTier: null, potentialSavings: null }
        }[this._currentTier] || {};
      },

      /**
       * Get upgrade prompt for user
       */
      getUpgradePrompt: function(product) {
        const currentPricing = this.calculatePrice(product);
        const proPricing = this.calculatePrice(product, 'pro');
        const fabPricing = this.calculatePrice(product, 'fabricator');

        const prompts = [];

        if (this._currentTier === 'guest') {
          prompts.push({
            action: 'signin',
            message: 'Sign in to see your price',
            savings: currentPricing.savingsPercent
          });
        }

        if (!['pro', 'fabricator'].includes(this._currentTier)) {
          const proSavings = currentPricing.yourPrice - proPricing.yourPrice;
          if (proSavings > 0) {
            prompts.push({
              action: 'subscribe_pro',
              message: `Save ${proPricing.formatted.yourPrice}/sq ft with Pro`,
              savings: proSavings.toFixed(2),
              monthlyFee: 29
            });
          }
        }

        if (this._currentTier !== 'fabricator') {
          const fabSavings = currentPricing.yourPrice - fabPricing.yourPrice;
          if (fabSavings > 1) {
            prompts.push({
              action: 'subscribe_fabricator',
              message: `Fabricators save ${fabPricing.formatted.yourPrice}/sq ft`,
              savings: fabSavings.toFixed(2),
              monthlyFee: 79
            });
          }
        }

        return prompts;
      },

      /**
       * Format price for display with tier badge
       */
      formatPriceDisplay: function(product, options = {}) {
        const pricing = this.calculatePrice(product);
        const tierInfo = this.getTierInfo();

        let html = '';

        // Show retail price with strikethrough if user has better pricing
        if (pricing.savings > 0 && !options.hideRetail) {
          html += `<span class="price-retail" style="text-decoration: line-through; color: #888; font-size: 0.85em;">$${pricing.retailPrice.toFixed(2)}</span> `;
        }

        // User's price
        html += `<span class="price-current" style="font-weight: 700; color: #1a2b3c;">$${pricing.yourPrice.toFixed(2)}</span>`;

        // Unit
        if (options.unit) {
          html += `<span class="price-unit" style="font-size: 0.8em; color: #888;">/${options.unit}</span>`;
        }

        // Tier badge
        if (pricing.savings > 0 && !options.hideBadge) {
          html += ` <span class="price-badge" style="background: #22c55e; color: white; padding: 2px 8px; border-radius: 12px; font-size: 11px; font-weight: 600;">${tierInfo.name} Price</span>`;
        }

        return html;
      },

      /**
       * Create upgrade prompt UI (replaces full tier comparison)
       * Only shows user's current savings and upgrade options - never reveals other tier prices
       */
      createTierComparisonUI: function(product) {
        const pricing = this.calculatePrice(product);
        const currentTier = this._currentTier;
        const tierInfo = this.getTierInfo();

        let html = '<div class="pricing-upgrade-prompt" style="background: #f8f9fa; border-radius: 12px; padding: 20px; margin: 20px 0;">';

        // Guest - not logged in
        if (currentTier === 'guest') {
          const returnUrl = typeof window !== 'undefined' ? encodeURIComponent(window.location.href) : '';
          html += `
            <div style="text-align: center;">
              <p style="margin: 0 0 12px; font-size: 14px; color: #666;">
                <strong>🔓 Unlock Member Discounts</strong> - Save up to 35% on all materials
              </p>
              <div style="display: flex; gap: 12px; justify-content: center; flex-wrap: wrap;">
                <a href="/log-in/?redirect=${returnUrl}" style="display: inline-block; padding: 12px 24px; background: #f9cb00; color: #1a2b3c; text-decoration: none; border-radius: 8px; font-weight: 600;">
                  Sign In
                </a>
                <a href="/membership/" style="display: inline-block; padding: 12px 24px; background: #1a2b3c; color: #fff; text-decoration: none; border-radius: 8px; font-weight: 600;">
                  View Pricing Tiers
                </a>
              </div>
            </div>
          `;
        }
        // Homeowner - logged in but no subscription
        else if (currentTier === 'homeowner') {
          html += `
            <div style="text-align: center;">
              <p style="margin: 0 0 8px; font-size: 15px; font-weight: 600; color: #1a2b3c;">
                Upgrade to Pro & Save
              </p>
              <p style="margin: 0 0 12px; font-size: 14px; color: #666;">
                Pro members save up to <strong style="color: #22c55e;">35% off</strong> on all materials
              </p>
              <a href="/account/?tab=subscription" style="display: inline-block; padding: 12px 24px; background: #f9cb00; color: #1a2b3c; text-decoration: none; border-radius: 8px; font-weight: 600;">
                Upgrade to Pro - $29/mo
              </a>
              <p style="margin: 12px 0 0; font-size: 12px; color: #888;">
                Contractors & designers get even better rates
              </p>
            </div>
          `;
        }
        // Pro subscriber - show their savings
        else if (currentTier === 'pro') {
          html += `
            <div style="display: flex; align-items: center; gap: 16px; flex-wrap: wrap;">
              <div style="flex: 1; min-width: 200px;">
                <p style="margin: 0; font-size: 14px; color: #22c55e; font-weight: 600;">
                  ✓ Pro Member Pricing Active
                </p>
                <p style="margin: 4px 0 0; font-size: 13px; color: #666;">
                  You're saving <strong>$${pricing.savings.toFixed(2)}/sq ft</strong> on this item
                </p>
              </div>
              <a href="/account/" style="padding: 10px 20px; background: #1a2b3c; color: #fff; text-decoration: none; border-radius: 6px; font-size: 13px; font-weight: 500;">
                View Account
              </a>
            </div>
          `;
        }
        // Designer/Contractor - verified trade
        else if (currentTier === 'designer' || currentTier === 'contractor') {
          html += `
            <div style="display: flex; align-items: center; gap: 16px; flex-wrap: wrap;">
              <div style="flex: 1; min-width: 200px;">
                <p style="margin: 0; font-size: 14px; color: #22c55e; font-weight: 600;">
                  ✓ ${tierInfo.name} Pricing Active
                </p>
                <p style="margin: 4px 0 0; font-size: 13px; color: #666;">
                  Trade discount: <strong>$${pricing.savings.toFixed(2)}/sq ft</strong> savings
                </p>
              </div>
              <a href="/account/" style="padding: 10px 20px; background: #1a2b3c; color: #fff; text-decoration: none; border-radius: 6px; font-size: 13px; font-weight: 500;">
                View Account
              </a>
            </div>
          `;
        }
        // Fabricator - wholesale
        else if (currentTier === 'fabricator') {
          html += `
            <div style="display: flex; align-items: center; gap: 16px; flex-wrap: wrap;">
              <div style="flex: 1; min-width: 200px;">
                <p style="margin: 0; font-size: 14px; color: #1a2b3c; font-weight: 600;">
                  ✓ Wholesale Pricing Active
                </p>
                <p style="margin: 4px 0 0; font-size: 13px; color: #666;">
                  You're getting the best available price
                </p>
              </div>
              <a href="/account/" style="padding: 10px 20px; background: #1a2b3c; color: #f9cb00; text-decoration: none; border-radius: 6px; font-size: 13px; font-weight: 500;">
                View Account
              </a>
            </div>
          `;
        }

        html += '</div>';
        return html;
      }
    };

    // Initialize
    SG_PRICING.init();

    // Expose globally
    window.SG_PRICING = SG_PRICING;
  }

})();
