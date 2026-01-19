/**
 * Security Utility Functions
 * Input validation, sanitization, and error handling
 */

const logger = require('./logger');

/**
 * Escape HTML to prevent XSS in email templates
 */
function escapeHtml(text) {
  if (!text) return '';
  const str = String(text);
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/**
 * Handle API errors without exposing internal details
 */
function handleApiError(res, error, context = 'Operation') {
  logger.apiError(error, { context });

  // Map known error types to user-friendly messages
  if (error.type === 'StripeInvalidRequestError') {
    return res.status(400).json({ error: 'Invalid payment request' });
  }
  if (error.code === 'PGRST301' || error.code === '23505') {
    return res.status(409).json({ error: 'Resource already exists' });
  }
  if (error.code === '23503') {
    return res.status(400).json({ error: 'Referenced resource not found' });
  }
  if (error.code === 'PGRST116') {
    return res.status(404).json({ error: 'Resource not found' });
  }

  // Generic error - don't expose internal details
  return res.status(500).json({ error: 'An unexpected error occurred. Please try again.' });
}

/**
 * Validate email format
 */
function isValidEmail(email) {
  if (!email || typeof email !== 'string') return false;
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email) && email.length <= 254;
}

/**
 * Validate phone format (basic)
 */
function isValidPhone(phone) {
  if (!phone || typeof phone !== 'string') return true; // phone is optional
  const cleaned = phone.replace(/\D/g, '');
  return cleaned.length >= 10 && cleaned.length <= 15;
}

/**
 * Sanitize string input
 */
function sanitizeString(str, maxLength = 1000) {
  if (!str) return '';
  return String(str).trim().slice(0, maxLength);
}

/**
 * Sanitize object for safe logging (removes sensitive fields)
 */
function sanitizeForLogging(obj) {
  if (!obj || typeof obj !== 'object') return obj;

  const sensitiveFields = ['password', 'token', 'secret', 'key', 'apiKey', 'api_key', 'authorization'];
  const sanitized = { ...obj };

  for (const field of sensitiveFields) {
    if (sanitized[field]) {
      sanitized[field] = '[REDACTED]';
    }
  }

  return sanitized;
}

/**
 * Validate UUID format
 */
function isValidUUID(str) {
  if (!str || typeof str !== 'string') return false;
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  return uuidRegex.test(str);
}

/**
 * Sanitize for Stripe query (prevent injection)
 */
function sanitizeForStripeQuery(str) {
  if (!str) return '';
  return String(str).replace(/['"\\]/g, '').slice(0, 100);
}

module.exports = {
  escapeHtml,
  handleApiError,
  isValidEmail,
  isValidPhone,
  sanitizeString,
  sanitizeForLogging,
  isValidUUID,
  sanitizeForStripeQuery
};
