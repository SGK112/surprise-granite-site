/**
 * Redis-Based Rate Limiter
 *
 * Scalable rate limiting using Redis instead of in-memory Maps.
 *
 * To enable Redis rate limiting:
 * 1. npm install ioredis rate-limiter-flexible
 * 2. Add REDIS_URL to .env
 * 3. Replace in-memory rate limiters with these
 *
 * Benefits over in-memory:
 * - Persists across server restarts
 * - Works across multiple server instances (horizontal scaling)
 * - Better memory management
 * - Distributed rate limiting
 */

const logger = require('./logger');

// Check if Redis packages are available
let Redis = null;
let RateLimiterRedis = null;
let RateLimiterMemory = null;

try {
  Redis = require('ioredis');
  const rateLimiterFlexible = require('rate-limiter-flexible');
  RateLimiterRedis = rateLimiterFlexible.RateLimiterRedis;
  RateLimiterMemory = rateLimiterFlexible.RateLimiterMemory;
} catch (e) {
  // Packages not installed
}

const REDIS_URL = process.env.REDIS_URL;
let redisClient = null;

/**
 * Initialize Redis connection
 */
function initRedis() {
  if (!Redis) {
    logger.warn('Redis not installed. Run: npm install ioredis rate-limiter-flexible');
    return null;
  }

  if (!REDIS_URL) {
    logger.info('REDIS_URL not configured. Using in-memory rate limiting.');
    return null;
  }

  try {
    redisClient = new Redis(REDIS_URL, {
      enableReadyCheck: true,
      maxRetriesPerRequest: 3,
      retryDelayOnFailover: 100,
      lazyConnect: true
    });

    redisClient.on('connect', () => {
      logger.info('Redis connected for rate limiting');
    });

    redisClient.on('error', (err) => {
      logger.error('Redis error', { error: err.message });
    });

    return redisClient;
  } catch (err) {
    logger.error('Failed to initialize Redis', { error: err.message });
    return null;
  }
}

/**
 * Create a rate limiter (Redis if available, otherwise memory)
 *
 * @param {Object} options Rate limiter options
 * @param {string} options.keyPrefix Prefix for rate limit keys
 * @param {number} options.points Number of requests allowed
 * @param {number} options.duration Duration in seconds
 * @param {number} options.blockDuration Block duration in seconds (optional)
 */
function createRateLimiter(options) {
  const {
    keyPrefix = 'rl',
    points = 10,
    duration = 60,
    blockDuration = 0
  } = options;

  // Try Redis first
  if (redisClient || (Redis && REDIS_URL)) {
    if (!redisClient) {
      initRedis();
    }

    if (redisClient) {
      try {
        return new RateLimiterRedis({
          storeClient: redisClient,
          keyPrefix,
          points,
          duration,
          blockDuration,
          inmemoryBlockOnConsumed: points + 1, // Block in memory if Redis fails
          inmemoryBlockDuration: duration
        });
      } catch (err) {
        logger.warn('Failed to create Redis rate limiter, falling back to memory', { error: err.message });
      }
    }
  }

  // Fallback to memory
  if (RateLimiterMemory) {
    logger.debug('Using in-memory rate limiter', { keyPrefix });
    return new RateLimiterMemory({
      keyPrefix,
      points,
      duration,
      blockDuration
    });
  }

  // No rate limiter available - return a passthrough
  logger.warn('No rate limiter available', { keyPrefix });
  return {
    consume: async () => ({ remainingPoints: Infinity }),
    get: async () => null,
    delete: async () => true
  };
}

/**
 * Rate limiter middleware factory
 *
 * @param {Object} options Rate limiter options
 * @returns {Function} Express middleware
 */
function rateLimiterMiddleware(options) {
  const limiter = createRateLimiter(options);
  const { keyPrefix = 'rl', message = 'Too many requests' } = options;

  return async (req, res, next) => {
    // Generate key from IP or user ID
    const key = req.user?.id || req.ip || 'anonymous';

    try {
      const result = await limiter.consume(key);

      // Add rate limit headers
      res.set({
        'X-RateLimit-Limit': options.points,
        'X-RateLimit-Remaining': result.remainingPoints,
        'X-RateLimit-Reset': new Date(Date.now() + result.msBeforeNext).toISOString()
      });

      next();
    } catch (rateLimiterRes) {
      // Rate limited
      const retryAfter = Math.ceil(rateLimiterRes.msBeforeNext / 1000);

      res.set({
        'Retry-After': retryAfter,
        'X-RateLimit-Limit': options.points,
        'X-RateLimit-Remaining': 0,
        'X-RateLimit-Reset': new Date(Date.now() + rateLimiterRes.msBeforeNext).toISOString()
      });

      logger.warn('Rate limit exceeded', {
        keyPrefix,
        key,
        ip: req.ip,
        path: req.path
      });

      res.status(429).json({
        error: message,
        retryAfter
      });
    }
  };
}

/**
 * Pre-configured rate limiters for common use cases
 */
const limiters = {
  // General API rate limit
  api: () => rateLimiterMiddleware({
    keyPrefix: 'rl:api',
    points: 100,
    duration: 60, // 100 requests per minute
    message: 'API rate limit exceeded. Please slow down.'
  }),

  // Strict limit for authentication endpoints
  auth: () => rateLimiterMiddleware({
    keyPrefix: 'rl:auth',
    points: 5,
    duration: 60 * 15, // 5 attempts per 15 minutes
    blockDuration: 60 * 15, // Block for 15 minutes after exceeded
    message: 'Too many login attempts. Please try again later.'
  }),

  // AI endpoints (expensive operations)
  ai: () => rateLimiterMiddleware({
    keyPrefix: 'rl:ai',
    points: 10,
    duration: 60 * 60, // 10 per hour
    message: 'AI usage limit reached. Please try again later.'
  }),

  // Email sending
  email: () => rateLimiterMiddleware({
    keyPrefix: 'rl:email',
    points: 20,
    duration: 60 * 60, // 20 per hour
    message: 'Email rate limit exceeded.'
  }),

  // Lead submission (public forms)
  lead: () => rateLimiterMiddleware({
    keyPrefix: 'rl:lead',
    points: 5,
    duration: 60 * 60, // 5 per hour per IP
    message: 'Too many submissions. Please try again later.'
  }),

  // Webhook endpoints (allow more)
  webhook: () => rateLimiterMiddleware({
    keyPrefix: 'rl:webhook',
    points: 1000,
    duration: 60, // 1000 per minute
    message: 'Webhook rate limit exceeded.'
  })
};

/**
 * Cleanup Redis connection
 */
async function cleanup() {
  if (redisClient) {
    await redisClient.quit();
    logger.info('Redis connection closed');
  }
}

module.exports = {
  initRedis,
  createRateLimiter,
  rateLimiterMiddleware,
  limiters,
  cleanup,
  isRedisEnabled: () => !!redisClient
};
