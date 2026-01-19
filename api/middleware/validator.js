/**
 * Request Validation Middleware
 * Uses Joi schemas to validate incoming requests
 */

const logger = require('../utils/logger');

/**
 * Create validation middleware for request body
 * @param {Object} schema - Joi schema to validate against
 * @param {Object} options - Validation options
 */
function validateBody(schema, options = {}) {
  return (req, res, next) => {
    const { error, value } = schema.validate(req.body, {
      abortEarly: false,
      stripUnknown: options.stripUnknown !== false,
      ...options
    });

    if (error) {
      const errors = error.details.map(detail => ({
        field: detail.path.join('.'),
        message: detail.message.replace(/"/g, '')
      }));

      logger.debug('Validation failed', { errors, path: req.path });

      return res.status(400).json({
        error: 'Validation failed',
        details: errors
      });
    }

    // Replace body with validated/sanitized value
    req.body = value;
    next();
  };
}

/**
 * Create validation middleware for query parameters
 * @param {Object} schema - Joi schema to validate against
 * @param {Object} options - Validation options
 */
function validateQuery(schema, options = {}) {
  return (req, res, next) => {
    const { error, value } = schema.validate(req.query, {
      abortEarly: false,
      stripUnknown: options.stripUnknown !== false,
      ...options
    });

    if (error) {
      const errors = error.details.map(detail => ({
        field: detail.path.join('.'),
        message: detail.message.replace(/"/g, '')
      }));

      logger.debug('Query validation failed', { errors, path: req.path });

      return res.status(400).json({
        error: 'Invalid query parameters',
        details: errors
      });
    }

    // Replace query with validated/sanitized value
    req.query = value;
    next();
  };
}

/**
 * Create validation middleware for route parameters
 * @param {Object} schema - Joi schema to validate against
 */
function validateParams(schema) {
  return (req, res, next) => {
    const { error, value } = schema.validate(req.params, {
      abortEarly: false
    });

    if (error) {
      const errors = error.details.map(detail => ({
        field: detail.path.join('.'),
        message: detail.message.replace(/"/g, '')
      }));

      logger.debug('Param validation failed', { errors, path: req.path });

      return res.status(400).json({
        error: 'Invalid route parameters',
        details: errors
      });
    }

    req.params = value;
    next();
  };
}

/**
 * Combined validation middleware
 * @param {Object} schemas - Object with body, query, and/or params schemas
 */
function validate(schemas) {
  return (req, res, next) => {
    const allErrors = [];

    // Validate body
    if (schemas.body) {
      const { error, value } = schemas.body.validate(req.body, {
        abortEarly: false,
        stripUnknown: true
      });

      if (error) {
        error.details.forEach(detail => {
          allErrors.push({
            location: 'body',
            field: detail.path.join('.'),
            message: detail.message.replace(/"/g, '')
          });
        });
      } else {
        req.body = value;
      }
    }

    // Validate query
    if (schemas.query) {
      const { error, value } = schemas.query.validate(req.query, {
        abortEarly: false,
        stripUnknown: true
      });

      if (error) {
        error.details.forEach(detail => {
          allErrors.push({
            location: 'query',
            field: detail.path.join('.'),
            message: detail.message.replace(/"/g, '')
          });
        });
      } else {
        req.query = value;
      }
    }

    // Validate params
    if (schemas.params) {
      const { error, value } = schemas.params.validate(req.params, {
        abortEarly: false
      });

      if (error) {
        error.details.forEach(detail => {
          allErrors.push({
            location: 'params',
            field: detail.path.join('.'),
            message: detail.message.replace(/"/g, '')
          });
        });
      } else {
        req.params = value;
      }
    }

    if (allErrors.length > 0) {
      logger.debug('Request validation failed', {
        path: req.path,
        errorCount: allErrors.length
      });

      return res.status(400).json({
        error: 'Validation failed',
        details: allErrors
      });
    }

    next();
  };
}

module.exports = {
  validateBody,
  validateQuery,
  validateParams,
  validate
};
