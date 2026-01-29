/**
 * Remodely.ai API Routes Configuration
 *
 * This file defines the API endpoints for the Remodely platform.
 * These endpoints are served through Supabase Edge Functions or serverless functions.
 */

const API_BASE = '/api/v1';

const API_ROUTES = {
    // Authentication
    auth: {
        login: `${API_BASE}/auth/login`,
        register: `${API_BASE}/auth/register`,
        logout: `${API_BASE}/auth/logout`,
        refreshToken: `${API_BASE}/auth/refresh`,
        forgotPassword: `${API_BASE}/auth/forgot-password`,
        resetPassword: `${API_BASE}/auth/reset-password`,
        verifyEmail: `${API_BASE}/auth/verify-email`
    },

    // Users
    users: {
        profile: `${API_BASE}/users/profile`,
        update: `${API_BASE}/users/update`,
        avatar: `${API_BASE}/users/avatar`,
        preferences: `${API_BASE}/users/preferences`,
        subscription: `${API_BASE}/users/subscription`
    },

    // Leads
    leads: {
        list: `${API_BASE}/leads`,
        create: `${API_BASE}/leads`,
        get: (id) => `${API_BASE}/leads/${id}`,
        update: (id) => `${API_BASE}/leads/${id}`,
        accept: (id) => `${API_BASE}/leads/${id}/accept`,
        decline: (id) => `${API_BASE}/leads/${id}/decline`,
        convert: (id) => `${API_BASE}/leads/${id}/convert`
    },

    // Jobs
    jobs: {
        list: `${API_BASE}/jobs`,
        create: `${API_BASE}/jobs`,
        get: (id) => `${API_BASE}/jobs/${id}`,
        update: (id) => `${API_BASE}/jobs/${id}`,
        updateStatus: (id) => `${API_BASE}/jobs/${id}/status`,
        addPhoto: (id) => `${API_BASE}/jobs/${id}/photos`,
        timeline: (id) => `${API_BASE}/jobs/${id}/timeline`
    },

    // Estimates
    estimates: {
        list: `${API_BASE}/estimates`,
        create: `${API_BASE}/estimates`,
        get: (id) => `${API_BASE}/estimates/${id}`,
        update: (id) => `${API_BASE}/estimates/${id}`,
        send: (id) => `${API_BASE}/estimates/${id}/send`,
        convert: (id) => `${API_BASE}/estimates/${id}/convert` // Convert to invoice
    },

    // Invoices
    invoices: {
        list: `${API_BASE}/invoices`,
        create: `${API_BASE}/invoices`,
        get: (id) => `${API_BASE}/invoices/${id}`,
        update: (id) => `${API_BASE}/invoices/${id}`,
        send: (id) => `${API_BASE}/invoices/${id}/send`,
        markPaid: (id) => `${API_BASE}/invoices/${id}/paid`,
        paymentLink: (id) => `${API_BASE}/invoices/${id}/payment-link`
    },

    // Products / Inventory
    products: {
        list: `${API_BASE}/products`,
        search: `${API_BASE}/products/search`,
        get: (id) => `${API_BASE}/products/${id}`,
        create: `${API_BASE}/products`,
        update: (id) => `${API_BASE}/products/${id}`,
        delete: (id) => `${API_BASE}/products/${id}`,
        import: `${API_BASE}/products/import`,
        export: `${API_BASE}/products/export`
    },

    // Marketplace / Inventory Aggregation
    marketplace: {
        search: `${API_BASE}/marketplace/search`,
        filters: `${API_BASE}/marketplace/filters`,
        vendors: `${API_BASE}/marketplace/vendors`,
        featured: `${API_BASE}/marketplace/featured`,
        liveInventory: `${API_BASE}/marketplace/live-inventory`
    },

    // AI Tools
    ai: {
        chat: `${API_BASE}/ai/chat`,
        voice: {
            start: `${API_BASE}/ai/voice/start`,
            send: `${API_BASE}/ai/voice/send`,
            end: `${API_BASE}/ai/voice/end`
        },
        detect: `${API_BASE}/ai/detect`, // Material detection
        estimate: `${API_BASE}/ai/estimate`, // AI-generated estimate
        transform: `${API_BASE}/ai/transform`, // Room visualization
        match: `${API_BASE}/ai/match` // Contractor matching
    },

    // Collaborators
    collaborators: {
        list: `${API_BASE}/collaborators`,
        search: `${API_BASE}/collaborators/search`,
        get: (id) => `${API_BASE}/collaborators/${id}`,
        reviews: (id) => `${API_BASE}/collaborators/${id}/reviews`,
        portfolio: (id) => `${API_BASE}/collaborators/${id}/portfolio`,
        availability: (id) => `${API_BASE}/collaborators/${id}/availability`
    },

    // Vendors / Distributors
    vendors: {
        list: `${API_BASE}/vendors`,
        get: (id) => `${API_BASE}/vendors/${id}`,
        inventory: (id) => `${API_BASE}/vendors/${id}/inventory`,
        webhook: `${API_BASE}/vendors/webhook`, // Receive inventory updates
        rss: `${API_BASE}/vendors/rss` // RSS feed for inventory
    },

    // Messages
    messages: {
        list: `${API_BASE}/messages`,
        send: `${API_BASE}/messages`,
        thread: (id) => `${API_BASE}/messages/thread/${id}`,
        markRead: (id) => `${API_BASE}/messages/${id}/read`
    },

    // Notifications
    notifications: {
        list: `${API_BASE}/notifications`,
        markRead: (id) => `${API_BASE}/notifications/${id}/read`,
        markAllRead: `${API_BASE}/notifications/read-all`,
        preferences: `${API_BASE}/notifications/preferences`
    },

    // Analytics
    analytics: {
        dashboard: `${API_BASE}/analytics/dashboard`,
        leads: `${API_BASE}/analytics/leads`,
        revenue: `${API_BASE}/analytics/revenue`,
        conversions: `${API_BASE}/analytics/conversions`,
        export: `${API_BASE}/analytics/export`
    },

    // Payments (Stripe)
    payments: {
        createIntent: `${API_BASE}/payments/intent`,
        confirm: `${API_BASE}/payments/confirm`,
        history: `${API_BASE}/payments/history`,
        refund: `${API_BASE}/payments/refund`,
        subscription: `${API_BASE}/payments/subscription`
    },

    // White Label / Multi-tenant
    tenant: {
        config: `${API_BASE}/tenant/config`,
        branding: `${API_BASE}/tenant/branding`,
        features: `${API_BASE}/tenant/features`,
        users: `${API_BASE}/tenant/users`
    },

    // Webhooks (incoming)
    webhooks: {
        stripe: `${API_BASE}/webhooks/stripe`,
        inventory: `${API_BASE}/webhooks/inventory`,
        twilio: `${API_BASE}/webhooks/twilio`
    }
};

/**
 * API Client for making requests
 */
class RemodelyAPI {
    constructor(options = {}) {
        this.baseUrl = options.baseUrl || '';
        this.token = options.token || null;
        this.tenantId = options.tenantId || null;
    }

    setToken(token) {
        this.token = token;
    }

    setTenant(tenantId) {
        this.tenantId = tenantId;
    }

    async request(endpoint, options = {}) {
        const headers = {
            'Content-Type': 'application/json',
            ...options.headers
        };

        if (this.token) {
            headers['Authorization'] = `Bearer ${this.token}`;
        }

        if (this.tenantId) {
            headers['X-Tenant-ID'] = this.tenantId;
        }

        const response = await fetch(this.baseUrl + endpoint, {
            ...options,
            headers
        });

        if (!response.ok) {
            const error = await response.json().catch(() => ({ message: 'Request failed' }));
            throw new Error(error.message || `HTTP ${response.status}`);
        }

        return response.json();
    }

    // Convenience methods
    get(endpoint) {
        return this.request(endpoint, { method: 'GET' });
    }

    post(endpoint, data) {
        return this.request(endpoint, {
            method: 'POST',
            body: JSON.stringify(data)
        });
    }

    put(endpoint, data) {
        return this.request(endpoint, {
            method: 'PUT',
            body: JSON.stringify(data)
        });
    }

    patch(endpoint, data) {
        return this.request(endpoint, {
            method: 'PATCH',
            body: JSON.stringify(data)
        });
    }

    delete(endpoint) {
        return this.request(endpoint, { method: 'DELETE' });
    }

    // File upload
    async upload(endpoint, file, additionalData = {}) {
        const formData = new FormData();
        formData.append('file', file);

        Object.entries(additionalData).forEach(([key, value]) => {
            formData.append(key, value);
        });

        const headers = {};
        if (this.token) {
            headers['Authorization'] = `Bearer ${this.token}`;
        }
        if (this.tenantId) {
            headers['X-Tenant-ID'] = this.tenantId;
        }

        const response = await fetch(this.baseUrl + endpoint, {
            method: 'POST',
            headers,
            body: formData
        });

        if (!response.ok) {
            const error = await response.json().catch(() => ({ message: 'Upload failed' }));
            throw new Error(error.message || `HTTP ${response.status}`);
        }

        return response.json();
    }
}

// Export
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { API_ROUTES, RemodelyAPI };
}

if (typeof window !== 'undefined') {
    window.REMODELY_API = {
        ROUTES: API_ROUTES,
        Client: RemodelyAPI
    };
}
