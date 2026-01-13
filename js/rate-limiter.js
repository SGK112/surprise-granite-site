/**
 * Remodely.ai Rate Limiter
 *
 * Protects AI API usage with configurable limits per user/session.
 * Uses localStorage for client-side tracking + optional server-side validation.
 */

(function() {
    'use strict';

    const STORAGE_KEY = 'remodely_rate_limits';

    // Default limits - can be overridden by plan
    const DEFAULT_LIMITS = {
        free: {
            ai_chat: { perDay: 10, perHour: 5 },
            ai_voice: { perDay: 3, perHour: 2 },
            ai_vision: { perDay: 5, perHour: 3 },
            ai_transform: { perDay: 3, perHour: 2 },
            ai_estimate: { perDay: 10, perHour: 5 }
        },
        pro: {
            ai_chat: { perDay: 100, perHour: 30 },
            ai_voice: { perDay: 50, perHour: 20 },
            ai_vision: { perDay: 50, perHour: 20 },
            ai_transform: { perDay: 30, perHour: 15 },
            ai_estimate: { perDay: 100, perHour: 50 }
        },
        enterprise: {
            ai_chat: { perDay: -1, perHour: -1 }, // -1 = unlimited
            ai_voice: { perDay: -1, perHour: -1 },
            ai_vision: { perDay: -1, perHour: -1 },
            ai_transform: { perDay: -1, perHour: -1 },
            ai_estimate: { perDay: -1, perHour: -1 }
        }
    };

    // Get stored usage data
    function getUsageData() {
        try {
            const data = localStorage.getItem(STORAGE_KEY);
            if (!data) return {};

            const parsed = JSON.parse(data);

            // Clean up old entries (older than 24 hours)
            const now = Date.now();
            const dayAgo = now - (24 * 60 * 60 * 1000);

            for (const [key, usage] of Object.entries(parsed)) {
                if (usage.timestamps) {
                    usage.timestamps = usage.timestamps.filter(ts => ts > dayAgo);
                }
            }

            return parsed;
        } catch (e) {
            console.error('Rate limiter: Error reading storage', e);
            return {};
        }
    }

    // Save usage data
    function saveUsageData(data) {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
        } catch (e) {
            console.error('Rate limiter: Error saving storage', e);
        }
    }

    // Get user's plan (defaults to 'free')
    function getUserPlan() {
        // Check if user is logged in and has a plan
        if (window.currentUserProfile?.subscription_tier) {
            return window.currentUserProfile.subscription_tier;
        }
        // Check session storage
        const plan = sessionStorage.getItem('user_plan');
        return plan || 'free';
    }

    // Get limits for a feature
    function getLimits(feature) {
        const plan = getUserPlan();
        const planLimits = DEFAULT_LIMITS[plan] || DEFAULT_LIMITS.free;
        return planLimits[feature] || { perDay: 5, perHour: 3 };
    }

    // Check if action is allowed
    function checkLimit(feature) {
        const limits = getLimits(feature);

        // Unlimited plan
        if (limits.perDay === -1) {
            return { allowed: true, remaining: -1 };
        }

        const usage = getUsageData();
        const featureUsage = usage[feature] || { timestamps: [] };
        const now = Date.now();
        const hourAgo = now - (60 * 60 * 1000);
        const dayAgo = now - (24 * 60 * 60 * 1000);

        // Count usage in last hour and day
        const usageLastHour = featureUsage.timestamps.filter(ts => ts > hourAgo).length;
        const usageLastDay = featureUsage.timestamps.filter(ts => ts > dayAgo).length;

        // Check limits
        if (limits.perHour > 0 && usageLastHour >= limits.perHour) {
            const resetTime = Math.ceil((featureUsage.timestamps.find(ts => ts > hourAgo) + 3600000 - now) / 60000);
            return {
                allowed: false,
                reason: 'hourly_limit',
                message: `Hourly limit reached. Try again in ${resetTime} minutes.`,
                remaining: 0,
                resetIn: resetTime
            };
        }

        if (limits.perDay > 0 && usageLastDay >= limits.perDay) {
            const resetTime = Math.ceil((featureUsage.timestamps.find(ts => ts > dayAgo) + 86400000 - now) / 3600000);
            return {
                allowed: false,
                reason: 'daily_limit',
                message: `Daily limit reached. Try again in ${resetTime} hours.`,
                remaining: 0,
                resetIn: resetTime
            };
        }

        return {
            allowed: true,
            remaining: {
                hourly: limits.perHour - usageLastHour,
                daily: limits.perDay - usageLastDay
            }
        };
    }

    // Record usage
    function recordUsage(feature) {
        const usage = getUsageData();

        if (!usage[feature]) {
            usage[feature] = { timestamps: [] };
        }

        usage[feature].timestamps.push(Date.now());

        // Keep only last 24 hours of data
        const dayAgo = Date.now() - (24 * 60 * 60 * 1000);
        usage[feature].timestamps = usage[feature].timestamps.filter(ts => ts > dayAgo);

        saveUsageData(usage);
    }

    // Get usage stats for display
    function getUsageStats(feature) {
        const limits = getLimits(feature);
        const usage = getUsageData();
        const featureUsage = usage[feature] || { timestamps: [] };
        const now = Date.now();
        const hourAgo = now - (60 * 60 * 1000);
        const dayAgo = now - (24 * 60 * 60 * 1000);

        const usageLastHour = featureUsage.timestamps.filter(ts => ts > hourAgo).length;
        const usageLastDay = featureUsage.timestamps.filter(ts => ts > dayAgo).length;

        return {
            feature,
            plan: getUserPlan(),
            hourly: {
                used: usageLastHour,
                limit: limits.perHour,
                remaining: limits.perHour === -1 ? -1 : Math.max(0, limits.perHour - usageLastHour)
            },
            daily: {
                used: usageLastDay,
                limit: limits.perDay,
                remaining: limits.perDay === -1 ? -1 : Math.max(0, limits.perDay - usageLastDay)
            }
        };
    }

    // Show rate limit warning modal
    function showLimitWarning(result, feature) {
        const modal = document.createElement('div');
        modal.className = 'rate-limit-modal';
        modal.innerHTML = `
            <div class="rate-limit-content">
                <div class="rate-limit-icon">
                    <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <circle cx="12" cy="12" r="10"/>
                        <line x1="12" y1="8" x2="12" y2="12"/>
                        <line x1="12" y1="16" x2="12.01" y2="16"/>
                    </svg>
                </div>
                <h3>Usage Limit Reached</h3>
                <p>${result.message}</p>
                <p class="rate-limit-upgrade">
                    Upgrade to <strong>Remodely Pro</strong> for higher limits
                </p>
                <div class="rate-limit-actions">
                    <button class="rate-limit-btn secondary" onclick="this.closest('.rate-limit-modal').remove()">
                        OK
                    </button>
                    <a href="/account/?upgrade=true" class="rate-limit-btn primary">
                        Upgrade Plan
                    </a>
                </div>
                <div class="rate-limit-branding">
                    Powered by <strong>Remodely.ai</strong>
                </div>
            </div>
        `;

        document.body.appendChild(modal);

        // Add styles if not already present
        if (!document.getElementById('rate-limit-styles')) {
            const styles = document.createElement('style');
            styles.id = 'rate-limit-styles';
            styles.textContent = `
                .rate-limit-modal {
                    position: fixed;
                    inset: 0;
                    background: rgba(0, 0, 0, 0.7);
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    z-index: 99999;
                    backdrop-filter: blur(4px);
                }
                .rate-limit-content {
                    background: #1e293b;
                    border: 1px solid rgba(255, 255, 255, 0.1);
                    border-radius: 16px;
                    padding: 2rem;
                    max-width: 400px;
                    text-align: center;
                    color: #fff;
                    font-family: 'Inter', system-ui, sans-serif;
                }
                .rate-limit-icon {
                    color: #f59e0b;
                    margin-bottom: 1rem;
                }
                .rate-limit-content h3 {
                    font-size: 1.25rem;
                    margin-bottom: 0.5rem;
                }
                .rate-limit-content p {
                    color: #9ca3af;
                    margin-bottom: 1rem;
                }
                .rate-limit-upgrade {
                    background: rgba(99, 102, 241, 0.1);
                    border: 1px solid rgba(99, 102, 241, 0.3);
                    border-radius: 8px;
                    padding: 0.75rem;
                    color: #a5b4fc !important;
                }
                .rate-limit-actions {
                    display: flex;
                    gap: 0.75rem;
                    margin-top: 1.5rem;
                }
                .rate-limit-btn {
                    flex: 1;
                    padding: 0.75rem 1rem;
                    border-radius: 8px;
                    font-weight: 600;
                    cursor: pointer;
                    text-decoration: none;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    transition: all 0.2s;
                }
                .rate-limit-btn.secondary {
                    background: rgba(255, 255, 255, 0.1);
                    border: 1px solid rgba(255, 255, 255, 0.2);
                    color: #fff;
                }
                .rate-limit-btn.primary {
                    background: linear-gradient(135deg, #6366f1, #4f46e5);
                    border: none;
                    color: #fff;
                }
                .rate-limit-btn:hover {
                    transform: translateY(-1px);
                }
                .rate-limit-branding {
                    margin-top: 1.5rem;
                    padding-top: 1rem;
                    border-top: 1px solid rgba(255, 255, 255, 0.1);
                    font-size: 0.75rem;
                    color: #6b7280;
                }
                .rate-limit-branding strong {
                    background: linear-gradient(135deg, #6366f1, #0ea5e9);
                    -webkit-background-clip: text;
                    -webkit-text-fill-color: transparent;
                    background-clip: text;
                }
            `;
            document.head.appendChild(styles);
        }
    }

    // Main wrapper function for AI calls
    async function withRateLimit(feature, apiCall) {
        const check = checkLimit(feature);

        if (!check.allowed) {
            showLimitWarning(check, feature);
            throw new Error(`Rate limit exceeded: ${check.message}`);
        }

        try {
            const result = await apiCall();
            recordUsage(feature);
            return result;
        } catch (error) {
            // Don't record usage on API errors
            throw error;
        }
    }

    // Reset all limits (for testing)
    function resetLimits() {
        localStorage.removeItem(STORAGE_KEY);
    }

    // Expose API
    window.RemodelyRateLimiter = {
        checkLimit,
        recordUsage,
        getUsageStats,
        withRateLimit,
        showLimitWarning,
        resetLimits,
        getUserPlan,
        DEFAULT_LIMITS
    };

    // Log initialization
    console.log('Remodely Rate Limiter initialized. Plan:', getUserPlan());

})();
