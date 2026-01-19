/**
 * Error Handler Middleware
 * Centralized error handling for the API
 */

const logger = require('../utils/logger');

/**
 * Custom API Error class
 */
class ApiError extends Error {
  constructor(statusCode, message, code = null) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.isOperational = true;
    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * Not Found handler (404)
 */
function notFoundHandler(req, res, next) {
  const error = new ApiError(404, `Route ${req.method} ${req.path} not found`, 'ROUTE_NOT_FOUND');
  next(error);
}

/**
 * Global error handler
 */
function errorHandler(err, req, res, next) {
  // Default values
  let statusCode = err.statusCode || 500;
  let message = err.message || 'Internal server error';
  let code = err.code || 'INTERNAL_ERROR';

  // Log the error
  logger.apiError(err, {
    method: req.method,
    path: req.path,
    statusCode
  });

  // Handle specific error types
  if (err.name === 'ValidationError') {
    statusCode = 400;
    code = 'VALIDATION_ERROR';
  } else if (err.name === 'UnauthorizedError' || err.name === 'JsonWebTokenError') {
    statusCode = 401;
    message = 'Invalid or expired token';
    code = 'AUTH_ERROR';
  } else if (err.type === 'StripeInvalidRequestError') {
    statusCode = 400;
    message = 'Invalid payment request';
    code = 'STRIPE_ERROR';
  } else if (err.code === 'PGRST301' || err.code === '23505') {
    statusCode = 409;
    message = 'Resource already exists';
    code = 'DUPLICATE_ERROR';
  } else if (err.code === '23503') {
    statusCode = 400;
    message = 'Referenced resource not found';
    code = 'REFERENCE_ERROR';
  } else if (err.code === 'PGRST116') {
    statusCode = 404;
    message = 'Resource not found';
    code = 'NOT_FOUND';
  }

  // Don't expose internal errors in production
  const isProduction = process.env.NODE_ENV === 'production';
  if (isProduction && statusCode === 500) {
    message = 'An unexpected error occurred. Please try again.';
  }

  // Send response
  res.status(statusCode).json({
    success: false,
    error: {
      message,
      code,
      ...(isProduction ? {} : { stack: err.stack })
    },
    timestamp: new Date().toISOString()
  });
}

/**
 * Async handler wrapper to catch errors in async routes
 */
function asyncHandler(fn) {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

module.exports = {
  ApiError,
  notFoundHandler,
  errorHandler,
  asyncHandler
};
