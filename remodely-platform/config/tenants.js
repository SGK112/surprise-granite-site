/**
 * Remodely.ai Multi-Tenant Configuration
 *
 * This file defines the brand ecosystem and white-label partners.
 * Each tenant can have their own branding while using Remodely's backend.
 */

const TENANTS = {
    // Main Platform
    'remodely.ai': {
        id: 'remodely',
        name: 'Remodely.ai',
        tagline: 'AI-Powered Stone & Tile Marketplace',
        type: 'platform', // platform, whitelabel, partner
        domain: 'remodely.ai',

        branding: {
            logo: '/assets/remodely-logo.svg',
            favicon: '/assets/remodely-favicon.png',
            primaryColor: '#6366f1',
            secondaryColor: '#0ea5e9',
            accentColor: '#f59e0b',
            darkMode: true
        },

        features: {
            ai_voice: true,
            ai_detect: true,
            ai_estimate: true,
            ai_transform: true,
            marketplace: true,
            leads: true,
            whitelabel_badge: false
        },

        contact: {
            phone: '+1 (602) 833-3189',
            email: 'hello@remodely.ai',
            address: 'Phoenix, AZ'
        },

        social: {
            facebook: 'https://facebook.com/remodelyai',
            instagram: 'https://instagram.com/remodelyai',
            linkedin: 'https://linkedin.com/company/remodelyai'
        }
    },

    // White Label Partners
    'surprisegranite.com': {
        id: 'surprise-granite',
        name: 'Surprise Granite',
        tagline: 'Premium Countertops in Phoenix Metro',
        type: 'whitelabel',
        domain: 'surprisegranite.com',
        parentTenant: 'remodely.ai',

        branding: {
            logo: '/images/logo.png',
            favicon: '/favicon.png',
            primaryColor: '#f9cb00', // Gold
            secondaryColor: '#1a1a2e', // Dark navy
            accentColor: '#4dff82', // Success green
            darkMode: true
        },

        features: {
            ai_voice: true,
            ai_detect: true,
            ai_estimate: true,
            ai_transform: true,
            marketplace: true,
            leads: true,
            whitelabel_badge: false // Disabled - using tools hub instead
        },

        contact: {
            phone: '+1 (602) 833-3189',
            email: 'info@surprisegranite.com',
            address: 'Serving the Greater Phoenix Area - We come to you!'
        },

        serviceAreas: [
            'Surprise', 'Peoria', 'Sun City', 'Glendale',
            'Phoenix', 'Scottsdale', 'Goodyear', 'Buckeye'
        ],

        social: {
            facebook: 'https://facebook.com/surprisegranite',
            instagram: 'https://instagram.com/surprisegranite',
            yelp: 'https://yelp.com/biz/surprise-granite'
        }
    },

    'lc4h.com': {
        id: 'lc4h',
        name: 'LC4H',
        tagline: 'Licensed Contractors 4 Hire',
        type: 'whitelabel',
        domain: 'lc4h.com',
        parentTenant: 'remodely.ai',

        branding: {
            logo: '/assets/lc4h-logo.svg',
            favicon: '/assets/lc4h-favicon.png',
            primaryColor: '#10b981', // Green
            secondaryColor: '#1f2937',
            accentColor: '#f59e0b',
            darkMode: true
        },

        features: {
            ai_voice: true,
            ai_detect: true,
            ai_estimate: true,
            ai_transform: true,
            marketplace: true,
            leads: true,
            contractor_network: true,
            whitelabel_badge: true
        },

        contact: {
            phone: '+1 (602) 833-3189',
            email: 'info@lc4h.com',
            address: 'Phoenix, AZ'
        }
    },

    'newcountertops.com': {
        id: 'newcountertops',
        name: 'NewCountertops',
        tagline: 'Find Your Perfect Countertops',
        type: 'whitelabel',
        domain: 'newcountertops.com',
        parentTenant: 'remodely.ai',

        branding: {
            logo: '/assets/newcountertops-logo.svg',
            favicon: '/assets/newcountertops-favicon.png',
            primaryColor: '#ec4899', // Pink
            secondaryColor: '#1f2937',
            accentColor: '#6366f1',
            darkMode: false // Light mode for consumer SEO site
        },

        features: {
            ai_voice: true,
            ai_detect: true,
            ai_estimate: true,
            ai_transform: true,
            marketplace: true,
            leads: false, // Consumer-facing, sends leads to contractors
            seo_focus: true,
            whitelabel_badge: true
        },

        contact: {
            phone: '+1 (602) 833-3189',
            email: 'hello@newcountertops.com'
        }
    },

    'granitly.com': {
        id: 'granitly',
        name: 'Granitly',
        tagline: 'Stone Industry Network',
        type: 'whitelabel',
        domain: 'granitly.com',
        parentTenant: 'remodely.ai',

        branding: {
            logo: '/assets/granitly-logo.svg',
            favicon: '/assets/granitly-favicon.png',
            primaryColor: '#8b5cf6', // Purple
            secondaryColor: '#1f2937',
            accentColor: '#f59e0b',
            darkMode: true
        },

        features: {
            ai_voice: true,
            ai_detect: true,
            ai_estimate: true,
            marketplace: true,
            vendor_network: true,
            inventory_aggregation: true,
            whitelabel_badge: true
        }
    }
};

/**
 * Get tenant configuration by domain
 */
function getTenantByDomain(domain) {
    // Handle localhost and development
    if (domain.includes('localhost') || domain.includes('127.0.0.1')) {
        return TENANTS['surprisegranite.com']; // Default to Surprise Granite for local dev
    }

    // Match exact domain or subdomain
    for (const [key, tenant] of Object.entries(TENANTS)) {
        if (domain === key || domain.endsWith('.' + key)) {
            return tenant;
        }
    }

    // Default to main platform
    return TENANTS['remodely.ai'];
}

/**
 * Get tenant configuration by ID
 */
function getTenantById(id) {
    return Object.values(TENANTS).find(t => t.id === id);
}

/**
 * Apply tenant branding to CSS variables
 */
function applyTenantBranding(tenant) {
    const root = document.documentElement;

    if (tenant.branding) {
        root.style.setProperty('--primary', tenant.branding.primaryColor);
        root.style.setProperty('--secondary', tenant.branding.secondaryColor);
        root.style.setProperty('--accent', tenant.branding.accentColor);

        // Handle dark/light mode
        if (!tenant.branding.darkMode) {
            document.body.classList.add('light-mode');
        }
    }

    // Update page title
    document.title = `${tenant.name} - ${tenant.tagline}`;

    // Update meta
    const metaDesc = document.querySelector('meta[name="description"]');
    if (metaDesc) {
        metaDesc.content = tenant.tagline;
    }

    return tenant;
}

/**
 * Show "Powered by Remodely" badge for white-label partners
 */
function showPoweredByBadge(tenant) {
    if (tenant.features?.whitelabel_badge) {
        const badge = document.getElementById('powered-by-badge') || createPoweredByBadge();
        badge.style.display = 'flex';
    }
}

function createPoweredByBadge() {
    const badge = document.createElement('a');
    badge.id = 'powered-by-badge';
    badge.href = 'https://remodely.ai';
    badge.target = '_blank';
    badge.innerHTML = `
        <span>Powered by</span>
        <strong style="background: linear-gradient(135deg, #6366f1, #0ea5e9); -webkit-background-clip: text; -webkit-text-fill-color: transparent;">Remodely.ai</strong>
    `;
    badge.style.cssText = `
        position: fixed;
        bottom: 1rem;
        right: 1rem;
        display: flex;
        align-items: center;
        gap: 0.5rem;
        padding: 0.5rem 1rem;
        background: rgba(30, 41, 59, 0.95);
        backdrop-filter: blur(10px);
        border: 1px solid rgba(255, 255, 255, 0.1);
        border-radius: 50px;
        font-size: 0.75rem;
        color: #9ca3af;
        text-decoration: none;
        z-index: 9999;
        transition: all 0.3s;
    `;
    document.body.appendChild(badge);
    return badge;
}

/**
 * Initialize tenant on page load
 */
function initializeTenant() {
    const domain = window.location.hostname;
    const tenant = getTenantByDomain(domain);

    applyTenantBranding(tenant);
    showPoweredByBadge(tenant);

    // Store in window for access by other scripts
    window.CURRENT_TENANT = tenant;

    return tenant;
}

// Export for use in other files
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { TENANTS, getTenantByDomain, getTenantById, applyTenantBranding, initializeTenant };
}

// Auto-initialize if in browser
if (typeof window !== 'undefined') {
    window.REMODELY_TENANTS = {
        TENANTS,
        getTenantByDomain,
        getTenantById,
        applyTenantBranding,
        initializeTenant
    };
}
