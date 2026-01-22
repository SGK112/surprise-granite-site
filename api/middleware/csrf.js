/**
 * CSRF Protection Middleware
 * Protects against Cross-Site Request Forgery attacks
 */

const crypto = require('crypto');
const logger = require('../utils/logger');

// Store for CSRF tokens (in production, use Redis)
const tokenStore = new Map();

// Token expiration (1 hour)
const TOKEN_EXPIRY = 60 * 60 * 1000;

// Cleanup interval (5 minutes)
const CLEANUP_INTERVAL = 5 * 60 * 1000;

// Methods that require CSRF protection
const PROTECTED_METHODS = ['POST', 'PUT', 'PATCH', 'DELETE'];

// Paths to skip CSRF (webhooks, public APIs, etc.)
const SKIP_PATHS = [
  '/api/stripe-webhook',
  '/api/leads',           // Public lead submission
  '/api/contact',         // Public contact form
  '/api/aria-lead',       // Voice assistant leads
  '/api/remnant-inquiry', // Public inquiries
  '/health',              // Health checks
  '/api/health'
];

/**
 * Generate a secure random token
 */
function generateToken() {
  return crypto.randomBytes(32).toString('hex');
}

/**
 * Store token with expiration
 */
function storeToken(sessionId, token) {
  tokenStore.set(sessionId, {
    token,
    expires: Date.now() + TOKEN_EXPIRY
  });
}

/**
 * Validate token
 */
function validateToken(sessionId, token) {
  const stored = tokenStore.get(sessionId);
  if (!stored) return false;
  if (Date.now() > stored.expires) {
    tokenStore.delete(sessionId);
    return false;
  }
  return stored.token === token;
}

/**
 * Get or create session ID from request
 */
function getSessionId(req) {
  // Try to get from cookie or header
  return req.cookies?.csrf_session ||
         req.headers['x-csrf-session'] ||
         req.ip + '-' + (req.headers['user-agent'] || '').slice(0, 50);
}

/**
 * Cleanup expired tokens
 */
function cleanupExpiredTokens() {
  const now = Date.now();
  let cleaned = 0;
  for (const [sessionId, data] of tokenStore.entries()) {
    if (now > data.expires) {
      tokenStore.delete(sessionId);
      cleaned++;
    }
  }
  if (cleaned > 0) {
    logger.info(`[CSRF] Cleaned ${cleaned} expired tokens`);
  }
}

// Run cleanup periodically
setInterval(cleanupExpiredTokens, CLEANUP_INTERVAL);

/**
 * CSRF Protection Middleware
 *
 * For GET requests: Generates and returns a CSRF token
 * For POST/PUT/PATCH/DELETE: Validates the CSRF token
 *
 * Client must:
 * 1. Call any GET endpoint to receive X-CSRF-Token header
 * 2. Include that token in X-CSRF-Token header on subsequent requests
 */
function csrfProtection(options = {}) {
  const {
    skipPaths = SKIP_PATHS,
    headerName = 'X-CSRF-Token',
    cookieName = 'csrf_session'
  } = options;

  return (req, res, next) => {
    const path = req.path;

    // Skip CSRF for whitelisted paths
    if (skipPaths.some(p => path.startsWith(p) || path === p)) {
      return next();
    }

    const sessionId = getSessionId(req);

    // For safe methods (GET, HEAD, OPTIONS), generate/refresh token
    if (!PROTECTED_METHODS.includes(req.method)) {
      let token;
      const stored = tokenStore.get(sessionId);

      if (stored && Date.now() < stored.expires) {
        // Reuse existing token
        token = stored.token;
      } else {
        // Generate new token
        token = generateToken();
        storeToken(sessionId, token);
      }

      // Set token in response header
      res.setHeader(headerName, token);

      // Set session cookie if not exists
      if (!req.cookies?.[cookieName]) {
        res.cookie(cookieName, sessionId, {
          httpOnly: true,
          secure: process.env.NODE_ENV === 'production',
          sameSite: 'strict',
          maxAge: TOKEN_EXPIRY
        });
      }

      return next();
    }

    // For state-changing methods, validate token
    const clientToken = req.headers[headerName.toLowerCase()] ||
                        req.headers['x-csrf-token'] ||
                        req.body?._csrf;

    if (!clientToken) {
      logger.warn('[CSRF] Missing token', { path, method: req.method, ip: req.ip });
      return res.status(403).json({
        success: false,
        error: {
          message: 'CSRF token missing',
          code: 'CSRF_MISSING'
        }
      });
    }

    if (!validateToken(sessionId, clientToken)) {
      logger.warn('[CSRF] Invalid token', { path, method: req.method, ip: req.ip });
      return res.status(403).json({
        success: false,
        error: {
          message: 'CSRF token invalid or expired',
          code: 'CSRF_INVALID'
        }
      });
    }

    // Token is valid - generate new token for next request (token rotation)
    const newToken = generateToken();
    storeToken(sessionId, newToken);
    res.setHeader(headerName, newToken);

    next();
  };
}

/**
 * Simple CSRF for APIs that use Bearer tokens
 * Checks Origin/Referer header instead of tokens
 * (Less strict, but works for SPAs with auth)
 */
function csrfOriginCheck(allowedOrigins = []) {
  const defaultOrigins = [
    'https://surprisegranite.com',
    'https://www.surprisegranite.com',
    'http://localhost:3000',
    'http://localhost:3001',
    'http://localhost:3333',
    'http://localhost:8080',
    'http://localhost:5500',
    'http://127.0.0.1:3000',
    'http://127.0.0.1:3333',
    'http://127.0.0.1:5500'
  ];

  const origins = new Set([...defaultOrigins, ...allowedOrigins]);

  return (req, res, next) => {
    // Skip for safe methods
    if (!PROTECTED_METHODS.includes(req.method)) {
      return next();
    }

    // Skip for whitelisted paths
    if (SKIP_PATHS.some(p => req.path.startsWith(p))) {
      return next();
    }

    // Check Origin header first
    const origin = req.headers.origin;
    if (origin && origins.has(origin)) {
      return next();
    }

    // Fall back to Referer
    const referer = req.headers.referer;
    if (referer) {
      try {
        const refererUrl = new URL(referer);
        if (origins.has(refererUrl.origin)) {
          return next();
        }
      } catch (e) {
        // Invalid URL
      }
    }

    // Allow requests with valid Authorization header (API clients)
    if (req.headers.authorization?.startsWith('Bearer ')) {
      return next();
    }

    logger.warn('[CSRF] Origin check failed', {
      path: req.path,
      origin,
      referer,
      ip: req.ip
    });

    return res.status(403).json({
      success: false,
      error: {
        message: 'Request origin not allowed',
        code: 'CSRF_ORIGIN'
      }
    });
  };
}

/**
 * Get current CSRF token for a session
 */
function getTokenForSession(sessionId) {
  const stored = tokenStore.get(sessionId);
  if (stored && Date.now() < stored.expires) {
    return stored.token;
  }
  const token = generateToken();
  storeToken(sessionId, token);
  return token;
}

module.exports = {
  csrfProtection,
  csrfOriginCheck,
  generateToken,
  getTokenForSession,
  SKIP_PATHS
};
