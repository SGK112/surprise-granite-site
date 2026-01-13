/**
 * Remodely.ai "Powered By" Badge
 *
 * Include this script to add a "Powered by Remodely.ai" badge to any white-label site.
 * The badge links back to the main Remodely.ai platform.
 */

(function() {
    'use strict';

    // Configuration
    const CONFIG = {
        position: 'bottom-right', // bottom-right, bottom-left, bottom-center
        theme: 'dark', // dark, light
        delay: 1000, // ms to wait before showing
        animate: true,
        utmSource: window.location.hostname,
        utmMedium: 'powered-by-badge',
        utmCampaign: 'whitelabel'
    };

    // Styles
    const styles = `
        .remodely-badge {
            position: fixed;
            bottom: 1rem;
            right: 1rem;
            display: flex;
            align-items: center;
            gap: 0.5rem;
            padding: 0.5rem 1rem;
            background: rgba(30, 41, 59, 0.95);
            backdrop-filter: blur(10px);
            -webkit-backdrop-filter: blur(10px);
            border: 1px solid rgba(255, 255, 255, 0.1);
            border-radius: 50px;
            font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            font-size: 0.75rem;
            color: #9ca3af;
            text-decoration: none;
            z-index: 9999;
            transition: all 0.3s ease;
            opacity: 0;
            transform: translateY(10px);
        }

        .remodely-badge.visible {
            opacity: 1;
            transform: translateY(0);
        }

        .remodely-badge:hover {
            background: rgba(30, 41, 59, 1);
            border-color: rgba(99, 102, 241, 0.5);
            transform: translateY(-2px);
            box-shadow: 0 4px 20px rgba(99, 102, 241, 0.2);
        }

        .remodely-badge.light {
            background: rgba(255, 255, 255, 0.95);
            border-color: rgba(0, 0, 0, 0.1);
            color: #6b7280;
        }

        .remodely-badge.light:hover {
            background: rgba(255, 255, 255, 1);
            border-color: rgba(99, 102, 241, 0.3);
        }

        .remodely-badge.bottom-left {
            right: auto;
            left: 1rem;
        }

        .remodely-badge.bottom-center {
            right: auto;
            left: 50%;
            transform: translateX(-50%) translateY(10px);
        }

        .remodely-badge.bottom-center.visible {
            transform: translateX(-50%) translateY(0);
        }

        .remodely-badge-logo {
            width: 16px;
            height: 16px;
            background: linear-gradient(135deg, #6366f1, #0ea5e9);
            border-radius: 4px;
            display: flex;
            align-items: center;
            justify-content: center;
        }

        .remodely-badge-logo svg {
            width: 10px;
            height: 10px;
            fill: white;
        }

        .remodely-badge-text {
            display: flex;
            align-items: center;
            gap: 0.25rem;
        }

        .remodely-badge-brand {
            font-weight: 700;
            background: linear-gradient(135deg, #6366f1, #0ea5e9);
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
            background-clip: text;
        }

        @media (max-width: 480px) {
            .remodely-badge {
                bottom: 0.75rem;
                right: 0.75rem;
                padding: 0.375rem 0.75rem;
                font-size: 0.7rem;
            }

            .remodely-badge-logo {
                width: 14px;
                height: 14px;
            }
        }
    `;

    // Create and inject styles
    function injectStyles() {
        const styleSheet = document.createElement('style');
        styleSheet.textContent = styles;
        document.head.appendChild(styleSheet);
    }

    // Build URL with UTM parameters
    function buildUrl() {
        const params = new URLSearchParams({
            utm_source: CONFIG.utmSource,
            utm_medium: CONFIG.utmMedium,
            utm_campaign: CONFIG.utmCampaign
        });
        return `https://remodely.ai?${params.toString()}`;
    }

    // Create badge element
    function createBadge() {
        const badge = document.createElement('a');
        badge.className = `remodely-badge ${CONFIG.theme} ${CONFIG.position}`;
        badge.href = buildUrl();
        badge.target = '_blank';
        badge.rel = 'noopener noreferrer';
        badge.setAttribute('aria-label', 'Powered by Remodely.ai - AI-powered stone & tile marketplace');

        badge.innerHTML = `
            <div class="remodely-badge-logo">
                <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                    <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/>
                </svg>
            </div>
            <div class="remodely-badge-text">
                <span>Powered by</span>
                <span class="remodely-badge-brand">Remodely.ai</span>
            </div>
        `;

        return badge;
    }

    // Initialize badge
    function init() {
        // Don't show on remodely.ai itself
        if (window.location.hostname === 'remodely.ai' ||
            window.location.hostname === 'www.remodely.ai') {
            return;
        }

        injectStyles();

        const badge = createBadge();
        document.body.appendChild(badge);

        // Animate in
        if (CONFIG.animate) {
            setTimeout(() => {
                badge.classList.add('visible');
            }, CONFIG.delay);
        } else {
            badge.classList.add('visible');
        }
    }

    // Run when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    // Expose API for customization
    window.RemodelyBadge = {
        configure: function(options) {
            Object.assign(CONFIG, options);
        },
        show: function() {
            const badge = document.querySelector('.remodely-badge');
            if (badge) badge.classList.add('visible');
        },
        hide: function() {
            const badge = document.querySelector('.remodely-badge');
            if (badge) badge.classList.remove('visible');
        },
        remove: function() {
            const badge = document.querySelector('.remodely-badge');
            if (badge) badge.remove();
        }
    };
})();
