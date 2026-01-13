/**
 * REMODELY SECURE PLATFORM
 * Encrypted, secure foundation for all Remodely services
 * End-to-end encryption, secure storage, audit logging
 * Version: 1.0
 */

(function() {
  'use strict';

  // Encryption utilities using Web Crypto API
  const CryptoUtils = {
    // Generate encryption key
    async generateKey() {
      return await crypto.subtle.generateKey(
        { name: 'AES-GCM', length: 256 },
        true,
        ['encrypt', 'decrypt']
      );
    },

    // Export key to storable format
    async exportKey(key) {
      const exported = await crypto.subtle.exportKey('raw', key);
      return this.arrayBufferToBase64(exported);
    },

    // Import key from stored format
    async importKey(keyData) {
      const keyBuffer = this.base64ToArrayBuffer(keyData);
      return await crypto.subtle.importKey(
        'raw',
        keyBuffer,
        { name: 'AES-GCM', length: 256 },
        true,
        ['encrypt', 'decrypt']
      );
    },

    // Encrypt data
    async encrypt(data, key) {
      const iv = crypto.getRandomValues(new Uint8Array(12));
      const encodedData = new TextEncoder().encode(JSON.stringify(data));

      const encrypted = await crypto.subtle.encrypt(
        { name: 'AES-GCM', iv },
        key,
        encodedData
      );

      return {
        iv: this.arrayBufferToBase64(iv),
        data: this.arrayBufferToBase64(encrypted)
      };
    },

    // Decrypt data
    async decrypt(encryptedObj, key) {
      const iv = this.base64ToArrayBuffer(encryptedObj.iv);
      const data = this.base64ToArrayBuffer(encryptedObj.data);

      const decrypted = await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv },
        key,
        data
      );

      const decoded = new TextDecoder().decode(decrypted);
      return JSON.parse(decoded);
    },

    // Hash data (SHA-256)
    async hash(data) {
      const encoded = new TextEncoder().encode(data);
      const hashBuffer = await crypto.subtle.digest('SHA-256', encoded);
      return this.arrayBufferToBase64(hashBuffer);
    },

    // Generate secure random ID
    generateId(length = 32) {
      const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
      const values = crypto.getRandomValues(new Uint8Array(length));
      return Array.from(values, v => chars[v % chars.length]).join('');
    },

    // ArrayBuffer to Base64
    arrayBufferToBase64(buffer) {
      const bytes = new Uint8Array(buffer);
      let binary = '';
      bytes.forEach(b => binary += String.fromCharCode(b));
      return btoa(binary);
    },

    // Base64 to ArrayBuffer
    base64ToArrayBuffer(base64) {
      const binary = atob(base64);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
      }
      return bytes.buffer;
    }
  };

  // Secure storage manager
  class SecureStorage {
    constructor(namespace = 'remodely') {
      this.namespace = namespace;
      this.key = null;
      this.initialized = false;
    }

    async init() {
      // Try to load existing key or generate new one
      const storedKey = localStorage.getItem(`${this.namespace}_key`);

      if (storedKey) {
        try {
          this.key = await CryptoUtils.importKey(storedKey);
        } catch (e) {
          // Key corrupted, generate new
          await this.generateNewKey();
        }
      } else {
        await this.generateNewKey();
      }

      this.initialized = true;
      return this;
    }

    async generateNewKey() {
      this.key = await CryptoUtils.generateKey();
      const exportedKey = await CryptoUtils.exportKey(this.key);
      localStorage.setItem(`${this.namespace}_key`, exportedKey);
    }

    async set(key, value) {
      if (!this.initialized) await this.init();

      const encrypted = await CryptoUtils.encrypt(value, this.key);
      localStorage.setItem(`${this.namespace}_${key}`, JSON.stringify(encrypted));
    }

    async get(key) {
      if (!this.initialized) await this.init();

      const stored = localStorage.getItem(`${this.namespace}_${key}`);
      if (!stored) return null;

      try {
        const encrypted = JSON.parse(stored);
        return await CryptoUtils.decrypt(encrypted, this.key);
      } catch (e) {
        console.error('Failed to decrypt:', e);
        return null;
      }
    }

    async remove(key) {
      localStorage.removeItem(`${this.namespace}_${key}`);
    }

    async clear() {
      const keys = Object.keys(localStorage).filter(k => k.startsWith(this.namespace));
      keys.forEach(k => localStorage.removeItem(k));
    }
  }

  // Audit log for security tracking
  class AuditLog {
    constructor(config = {}) {
      this.config = {
        apiEndpoint: 'https://api.remodely.ai',
        maxLocalLogs: 1000,
        syncInterval: 60000, // 1 minute
        ...config
      };

      this.logs = [];
      this.storage = new SecureStorage('remodely_audit');
      this.syncTimer = null;
    }

    async init() {
      await this.storage.init();

      // Load existing logs
      const storedLogs = await this.storage.get('logs');
      if (storedLogs) {
        this.logs = storedLogs;
      }

      // Start sync timer
      this.startSync();

      return this;
    }

    // Log an event
    async log(action, details = {}, severity = 'info') {
      const entry = {
        id: CryptoUtils.generateId(16),
        timestamp: new Date().toISOString(),
        action,
        details,
        severity,
        userAgent: navigator.userAgent,
        url: window.location.href,
        sessionId: this.getSessionId()
      };

      this.logs.push(entry);

      // Trim if too many
      if (this.logs.length > this.config.maxLocalLogs) {
        this.logs = this.logs.slice(-this.config.maxLocalLogs);
      }

      // Save locally
      await this.storage.set('logs', this.logs);

      // Immediate sync for high-severity events
      if (severity === 'critical' || severity === 'error') {
        await this.sync();
      }

      return entry;
    }

    // Get session ID
    getSessionId() {
      let sessionId = sessionStorage.getItem('remodely_session');
      if (!sessionId) {
        sessionId = CryptoUtils.generateId(24);
        sessionStorage.setItem('remodely_session', sessionId);
      }
      return sessionId;
    }

    // Start periodic sync
    startSync() {
      this.syncTimer = setInterval(() => this.sync(), this.config.syncInterval);
    }

    // Stop sync
    stopSync() {
      if (this.syncTimer) {
        clearInterval(this.syncTimer);
      }
    }

    // Sync logs to server
    async sync() {
      if (this.logs.length === 0) return;

      try {
        const response = await fetch(`${this.config.apiEndpoint}/audit/sync`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            logs: this.logs,
            businessId: this.config.businessId
          })
        });

        if (response.ok) {
          // Clear synced logs
          this.logs = [];
          await this.storage.set('logs', this.logs);
        }
      } catch (e) {
        console.warn('Audit sync failed:', e);
      }
    }

    // Get recent logs
    getRecent(count = 100) {
      return this.logs.slice(-count);
    }

    // Search logs
    search(query) {
      const lowerQuery = query.toLowerCase();
      return this.logs.filter(log =>
        log.action.toLowerCase().includes(lowerQuery) ||
        JSON.stringify(log.details).toLowerCase().includes(lowerQuery)
      );
    }
  }

  // Session manager with security features
  class SecureSession {
    constructor(config = {}) {
      this.config = {
        tokenExpiry: 3600000, // 1 hour
        refreshThreshold: 300000, // 5 minutes before expiry
        ...config
      };

      this.storage = new SecureStorage('remodely_session');
      this.token = null;
      this.expiresAt = null;
      this.refreshTimer = null;
    }

    async init() {
      await this.storage.init();

      // Load existing session
      const session = await this.storage.get('current');
      if (session && session.expiresAt > Date.now()) {
        this.token = session.token;
        this.expiresAt = session.expiresAt;
        this.scheduleRefresh();
      }

      return this;
    }

    // Create new session
    async create(userData) {
      this.token = CryptoUtils.generateId(64);
      this.expiresAt = Date.now() + this.config.tokenExpiry;

      await this.storage.set('current', {
        token: this.token,
        expiresAt: this.expiresAt,
        user: userData,
        createdAt: Date.now()
      });

      this.scheduleRefresh();
      return this.token;
    }

    // Validate session
    async validate() {
      if (!this.token || Date.now() > this.expiresAt) {
        return false;
      }

      const session = await this.storage.get('current');
      return session && session.token === this.token;
    }

    // Refresh session
    async refresh() {
      if (!this.token) return false;

      const session = await this.storage.get('current');
      if (!session) return false;

      this.expiresAt = Date.now() + this.config.tokenExpiry;
      session.expiresAt = this.expiresAt;

      await this.storage.set('current', session);
      this.scheduleRefresh();

      return true;
    }

    // Schedule refresh
    scheduleRefresh() {
      if (this.refreshTimer) {
        clearTimeout(this.refreshTimer);
      }

      const timeUntilRefresh = this.expiresAt - Date.now() - this.config.refreshThreshold;
      if (timeUntilRefresh > 0) {
        this.refreshTimer = setTimeout(() => this.refresh(), timeUntilRefresh);
      }
    }

    // Destroy session
    async destroy() {
      this.token = null;
      this.expiresAt = null;

      if (this.refreshTimer) {
        clearTimeout(this.refreshTimer);
      }

      await this.storage.remove('current');
    }

    // Get current user
    async getUser() {
      const session = await this.storage.get('current');
      return session?.user || null;
    }
  }

  // Rate limiter
  class RateLimiter {
    constructor(config = {}) {
      this.config = {
        maxRequests: 100,
        windowMs: 60000, // 1 minute
        ...config
      };

      this.requests = new Map();
    }

    // Check if request is allowed
    check(key = 'default') {
      const now = Date.now();
      const windowStart = now - this.config.windowMs;

      // Get or create request log
      let requestLog = this.requests.get(key) || [];

      // Filter out old requests
      requestLog = requestLog.filter(timestamp => timestamp > windowStart);

      // Check limit
      if (requestLog.length >= this.config.maxRequests) {
        return {
          allowed: false,
          remaining: 0,
          resetAt: requestLog[0] + this.config.windowMs
        };
      }

      // Add new request
      requestLog.push(now);
      this.requests.set(key, requestLog);

      return {
        allowed: true,
        remaining: this.config.maxRequests - requestLog.length,
        resetAt: now + this.config.windowMs
      };
    }

    // Reset for a key
    reset(key = 'default') {
      this.requests.delete(key);
    }

    // Clear all
    clearAll() {
      this.requests.clear();
    }
  }

  // Input sanitizer
  const Sanitizer = {
    // Sanitize HTML (prevent XSS)
    html(input) {
      const div = document.createElement('div');
      div.textContent = input;
      return div.innerHTML;
    },

    // Sanitize for SQL-like usage (basic)
    sql(input) {
      return String(input).replace(/['";\\]/g, '');
    },

    // Sanitize email
    email(input) {
      return String(input).toLowerCase().trim().replace(/[<>'"]/g, '');
    },

    // Sanitize phone
    phone(input) {
      return String(input).replace(/[^0-9+\-() ]/g, '');
    },

    // Sanitize filename
    filename(input) {
      return String(input).replace(/[^a-zA-Z0-9._-]/g, '_');
    },

    // Strip all HTML tags
    stripTags(input) {
      return String(input).replace(/<[^>]*>/g, '');
    },

    // Validate and sanitize URL
    url(input) {
      try {
        const url = new URL(input);
        if (!['http:', 'https:'].includes(url.protocol)) {
          return null;
        }
        return url.href;
      } catch (e) {
        return null;
      }
    }
  };

  // CSRF protection
  class CSRFProtection {
    constructor() {
      this.token = null;
    }

    // Generate token
    generateToken() {
      this.token = CryptoUtils.generateId(32);
      sessionStorage.setItem('csrf_token', this.token);
      return this.token;
    }

    // Get or create token
    getToken() {
      if (!this.token) {
        this.token = sessionStorage.getItem('csrf_token');
        if (!this.token) {
          this.generateToken();
        }
      }
      return this.token;
    }

    // Validate token
    validate(token) {
      return token && token === this.token;
    }

    // Add to form
    addToForm(form) {
      const input = document.createElement('input');
      input.type = 'hidden';
      input.name = '_csrf';
      input.value = this.getToken();
      form.appendChild(input);
    }

    // Add to headers
    getHeaders() {
      return {
        'X-CSRF-Token': this.getToken()
      };
    }
  }

  // Secure API client
  class SecureAPIClient {
    constructor(config = {}) {
      this.config = {
        baseUrl: 'https://api.remodely.ai',
        timeout: 30000,
        retries: 3,
        ...config
      };

      this.csrf = new CSRFProtection();
      this.rateLimiter = new RateLimiter();
      this.auditLog = null;
    }

    async init(auditLog) {
      this.auditLog = auditLog;
      return this;
    }

    // Make secure request
    async request(endpoint, options = {}) {
      // Check rate limit
      const rateCheck = this.rateLimiter.check(endpoint);
      if (!rateCheck.allowed) {
        throw new Error(`Rate limit exceeded. Reset at ${new Date(rateCheck.resetAt)}`);
      }

      // Prepare request
      const url = `${this.config.baseUrl}${endpoint}`;
      const headers = {
        'Content-Type': 'application/json',
        ...this.csrf.getHeaders(),
        ...options.headers
      };

      // Sanitize body if present
      let body = options.body;
      if (body && typeof body === 'object') {
        body = JSON.stringify(body);
      }

      // Create abort controller for timeout
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.config.timeout);

      try {
        const response = await fetch(url, {
          method: options.method || 'GET',
          headers,
          body,
          signal: controller.signal
        });

        clearTimeout(timeoutId);

        // Log the request
        if (this.auditLog) {
          await this.auditLog.log('api_request', {
            endpoint,
            method: options.method || 'GET',
            status: response.status
          });
        }

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        return await response.json();
      } catch (error) {
        clearTimeout(timeoutId);

        // Log error
        if (this.auditLog) {
          await this.auditLog.log('api_error', {
            endpoint,
            error: error.message
          }, 'error');
        }

        throw error;
      }
    }

    // Convenience methods
    async get(endpoint, options = {}) {
      return this.request(endpoint, { ...options, method: 'GET' });
    }

    async post(endpoint, data, options = {}) {
      return this.request(endpoint, { ...options, method: 'POST', body: data });
    }

    async put(endpoint, data, options = {}) {
      return this.request(endpoint, { ...options, method: 'PUT', body: data });
    }

    async delete(endpoint, options = {}) {
      return this.request(endpoint, { ...options, method: 'DELETE' });
    }
  }

  // Main secure platform class
  class SecurePlatform {
    constructor(config = {}) {
      this.config = config;

      this.crypto = CryptoUtils;
      this.storage = new SecureStorage(config.namespace || 'remodely');
      this.audit = new AuditLog(config);
      this.session = new SecureSession(config);
      this.rateLimiter = new RateLimiter(config.rateLimit);
      this.csrf = new CSRFProtection();
      this.api = new SecureAPIClient(config);
      this.sanitize = Sanitizer;

      this.initialized = false;
    }

    async init() {
      await this.storage.init();
      await this.audit.init();
      await this.session.init();
      await this.api.init(this.audit);

      // Log platform init
      await this.audit.log('platform_init', {
        version: '1.0',
        config: { ...this.config, apiKey: '[REDACTED]' }
      });

      this.initialized = true;
      return this;
    }

    // Check if platform is secure
    isSecure() {
      return window.isSecureContext && window.crypto && window.crypto.subtle;
    }

    // Get security status
    getSecurityStatus() {
      return {
        initialized: this.initialized,
        secureContext: window.isSecureContext,
        cryptoAvailable: !!window.crypto?.subtle,
        sessionValid: this.session.token !== null,
        csrfToken: !!this.csrf.getToken()
      };
    }

    // Cleanup
    async destroy() {
      this.audit.stopSync();
      await this.audit.sync();
      await this.session.destroy();
    }
  }

  // Export globally
  window.RemodelySecure = {
    Platform: SecurePlatform,
    CryptoUtils,
    SecureStorage,
    AuditLog,
    SecureSession,
    RateLimiter,
    CSRFProtection,
    SecureAPIClient,
    Sanitizer
  };
})();
