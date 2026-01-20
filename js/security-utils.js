/**
 * Security Utilities for Surprise Granite
 * Client-side security helpers to prevent XSS and other attacks
 */

(function(window) {
  'use strict';

  const SecurityUtils = {
    /**
     * Escape HTML special characters to prevent XSS
     * @param {string} str - String to escape
     * @returns {string} - Escaped string safe for innerHTML
     */
    escapeHtml: function(str) {
      if (str === null || str === undefined) return '';
      const div = document.createElement('div');
      div.textContent = String(str);
      return div.innerHTML;
    },

    /**
     * Escape HTML and preserve line breaks
     * @param {string} str - String to escape
     * @returns {string} - Escaped string with <br> tags
     */
    escapeHtmlWithBreaks: function(str) {
      if (str === null || str === undefined) return '';
      return this.escapeHtml(str).replace(/\n/g, '<br>');
    },

    /**
     * Sanitize a string for use in HTML attributes
     * @param {string} str - String to sanitize
     * @returns {string} - Sanitized string safe for attributes
     */
    escapeAttr: function(str) {
      if (str === null || str === undefined) return '';
      return String(str)
        .replace(/&/g, '&amp;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
    },

    /**
     * Sanitize a URL to prevent javascript: and data: URLs
     * @param {string} url - URL to sanitize
     * @returns {string} - Safe URL or empty string
     */
    sanitizeUrl: function(url) {
      if (!url) return '';
      const trimmed = String(url).trim().toLowerCase();
      if (trimmed.startsWith('javascript:') ||
          trimmed.startsWith('data:') ||
          trimmed.startsWith('vbscript:')) {
        return '';
      }
      return url;
    },

    /**
     * Create a safe HTML string using template literals
     * Escapes all interpolated values
     * @param {TemplateStringsArray} strings - Template strings
     * @param {...any} values - Values to interpolate
     * @returns {string} - Safe HTML string
     */
    html: function(strings, ...values) {
      return strings.reduce((result, string, i) => {
        const value = values[i - 1];
        const escaped = this.escapeHtml(value);
        return result + escaped + string;
      });
    },

    /**
     * Safely set innerHTML with escaped values
     * @param {HTMLElement} element - Target element
     * @param {string} template - HTML template
     * @param {Object} data - Data to interpolate (all values will be escaped)
     */
    safeInnerHTML: function(element, template, data = {}) {
      if (!element) return;

      let html = template;
      for (const [key, value] of Object.entries(data)) {
        const escaped = this.escapeHtml(value);
        html = html.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), escaped);
      }
      element.innerHTML = html;
    },

    /**
     * Validate email format
     * @param {string} email - Email to validate
     * @returns {boolean} - True if valid
     */
    isValidEmail: function(email) {
      if (!email) return false;
      const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      return re.test(String(email).toLowerCase());
    },

    /**
     * Validate phone number format
     * @param {string} phone - Phone to validate
     * @returns {boolean} - True if valid
     */
    isValidPhone: function(phone) {
      if (!phone) return false;
      const digits = String(phone).replace(/\D/g, '');
      return digits.length >= 10 && digits.length <= 15;
    },

    /**
     * Sanitize user input string
     * @param {string} str - String to sanitize
     * @param {number} maxLength - Maximum allowed length
     * @returns {string} - Sanitized string
     */
    sanitizeInput: function(str, maxLength = 1000) {
      if (!str) return '';
      return String(str).trim().slice(0, maxLength);
    },

    /**
     * Generate a random token for CSRF or other purposes
     * @param {number} length - Token length
     * @returns {string} - Random token
     */
    generateToken: function(length = 32) {
      const array = new Uint8Array(length);
      crypto.getRandomValues(array);
      return Array.from(array, b => b.toString(16).padStart(2, '0')).join('');
    },

    /**
     * Get or create CSRF token
     * @returns {string} - CSRF token
     */
    getCsrfToken: function() {
      let token = sessionStorage.getItem('csrf_token');
      if (!token) {
        token = this.generateToken();
        sessionStorage.setItem('csrf_token', token);
      }
      return token;
    },

    /**
     * Add CSRF token to fetch options
     * @param {Object} options - Fetch options
     * @returns {Object} - Options with CSRF header
     */
    addCsrfHeader: function(options = {}) {
      const headers = options.headers || {};
      headers['X-CSRF-Token'] = this.getCsrfToken();
      return { ...options, headers };
    }
  };

  // Expose globally
  window.SecurityUtils = SecurityUtils;

  // Shorthand helpers
  window.escapeHtml = SecurityUtils.escapeHtml.bind(SecurityUtils);
  window.escapeAttr = SecurityUtils.escapeAttr.bind(SecurityUtils);

})(window);
