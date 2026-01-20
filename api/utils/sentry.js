/**
 * Sentry Error Tracking Setup
 *
 * To enable Sentry:
 * 1. npm install @sentry/node
 * 2. Add SENTRY_DSN to .env
 * 3. Import and call initSentry(app) in server.js after app creation
 */

const logger = require('./logger');

// Check if Sentry is available
let Sentry = null;
try {
  Sentry = require('@sentry/node');
} catch (e) {
  // Sentry not installed
}

const SENTRY_DSN = process.env.SENTRY_DSN;
const isProduction = process.env.NODE_ENV === 'production';

/**
 * Initialize Sentry error tracking
 * @param {Express.Application} app - Express app instance
 */
function initSentry(app) {
  if (!Sentry) {
    logger.warn('Sentry not installed. Run: npm install @sentry/node');
    return { isEnabled: false };
  }

  if (!SENTRY_DSN) {
    logger.info('Sentry DSN not configured. Skipping error tracking.');
    return { isEnabled: false };
  }

  Sentry.init({
    dsn: SENTRY_DSN,
    environment: process.env.NODE_ENV || 'development',
    release: process.env.npm_package_version,

    // Performance monitoring
    tracesSampleRate: isProduction ? 0.1 : 1.0,

    // Filter out sensitive data
    beforeSend(event) {
      // Remove sensitive headers
      if (event.request?.headers) {
        delete event.request.headers.authorization;
        delete event.request.headers.cookie;
      }

      // Remove sensitive body fields
      if (event.request?.data) {
        const data = typeof event.request.data === 'string'
          ? JSON.parse(event.request.data)
          : event.request.data;

        if (data.password) data.password = '[REDACTED]';
        if (data.token) data.token = '[REDACTED]';
        if (data.api_key) data.api_key = '[REDACTED]';

        event.request.data = JSON.stringify(data);
      }

      return event;
    },

    // Ignore common non-errors
    ignoreErrors: [
      'ECONNRESET',
      'ECONNREFUSED',
      'ETIMEDOUT',
      'Request aborted',
      'Network request failed'
    ]
  });

  // Add request handler (must be first middleware)
  app.use(Sentry.Handlers.requestHandler());

  // Add tracing handler
  app.use(Sentry.Handlers.tracingHandler());

  logger.info('Sentry error tracking initialized');

  return {
    isEnabled: true,
    Sentry,
    // Error handler (must be after all routes)
    errorHandler: Sentry.Handlers.errorHandler({
      shouldHandleError(error) {
        // Only report 5xx errors to Sentry
        return !error.status || error.status >= 500;
      }
    })
  };
}

/**
 * Capture exception manually
 */
function captureException(error, context = {}) {
  if (Sentry && SENTRY_DSN) {
    Sentry.captureException(error, {
      extra: context
    });
  }
  logger.apiError(error, context);
}

/**
 * Capture message
 */
function captureMessage(message, level = 'info', context = {}) {
  if (Sentry && SENTRY_DSN) {
    Sentry.captureMessage(message, {
      level,
      extra: context
    });
  }
  logger[level]?.(message, context) || logger.info(message, context);
}

/**
 * Set user context for tracking
 */
function setUser(user) {
  if (Sentry && SENTRY_DSN) {
    Sentry.setUser({
      id: user.id,
      email: user.email,
      // Don't include sensitive info
    });
  }
}

/**
 * Clear user context
 */
function clearUser() {
  if (Sentry && SENTRY_DSN) {
    Sentry.setUser(null);
  }
}

module.exports = {
  initSentry,
  captureException,
  captureMessage,
  setUser,
  clearUser,
  isEnabled: () => !!(Sentry && SENTRY_DSN)
};
