/**
 * Winston Logger Configuration
 * Structured logging for the Surprise Granite API
 */

const winston = require('winston');
const path = require('path');

const isProduction = process.env.NODE_ENV === 'production';

// Custom format for development (readable)
const devFormat = winston.format.combine(
  winston.format.timestamp({ format: 'HH:mm:ss' }),
  winston.format.colorize(),
  winston.format.printf(({ timestamp, level, message, ...meta }) => {
    const metaStr = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : '';
    return `${timestamp} ${level}: ${message}${metaStr}`;
  })
);

// Custom format for production (JSON for log aggregation)
const prodFormat = winston.format.combine(
  winston.format.timestamp(),
  winston.format.errors({ stack: true }),
  winston.format.json()
);

// Create logger instance
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || (isProduction ? 'info' : 'debug'),
  format: isProduction ? prodFormat : devFormat,
  defaultMeta: { service: 'surprise-granite-api' },
  transports: [
    // Console transport (always)
    new winston.transports.Console(),

    // File transports (production only)
    ...(isProduction ? [
      new winston.transports.File({
        filename: path.join(__dirname, '../logs/error.log'),
        level: 'error',
        maxsize: 5242880, // 5MB
        maxFiles: 5
      }),
      new winston.transports.File({
        filename: path.join(__dirname, '../logs/combined.log'),
        maxsize: 5242880,
        maxFiles: 5
      })
    ] : [])
  ]
});

// Helper methods for common logging patterns
logger.request = (req, message = 'Incoming request') => {
  logger.info(message, {
    method: req.method,
    path: req.path,
    ip: req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.ip,
    userAgent: req.headers['user-agent']?.substring(0, 100)
  });
};

logger.apiError = (error, context = {}) => {
  logger.error('API Error', {
    message: error.message,
    code: error.code,
    stack: isProduction ? undefined : error.stack,
    ...context
  });
};

logger.dbQuery = (operation, table, duration) => {
  logger.debug('Database query', { operation, table, durationMs: duration });
};

logger.emailSent = (type, success = true) => {
  logger.info('Email sent', { type, success });
};

logger.paymentEvent = (event, data = {}) => {
  logger.info('Payment event', { event, ...data });
};

module.exports = logger;
