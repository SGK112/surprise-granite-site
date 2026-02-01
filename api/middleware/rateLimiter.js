/**
 * Rate Limiter Middleware
 * Protects endpoints from abuse
 */

const logger = require('../utils/logger');

// In-memory stores (consider Redis for production clustering)
const rateLimitStore = new Map();
const publicRateLimitStore = new Map();

// Rate limit configurations
const RATE_LIMITS = {
  free: {
    ai_blueprint: { perHour: 3, perDay: 5 },
    ai_chat: { perHour: 5, perDay: 10 },
    ai_vision: { perHour: 3, perDay: 5 }
  },
  pro: {
    ai_blueprint: { perHour: 20, perDay: 50 },
    ai_chat: { perHour: 30, perDay: 100 },
    ai_vision: { perHour: 20, perDay: 50 }
  },
  enterprise: {
    ai_blueprint: { perHour: -1, perDay: -1 }, // unlimited
    ai_chat: { perHour: -1, perDay: -1 },
    ai_vision: { perHour: -1, perDay: -1 }
  }
};

/**
 * Get client identifier for rate limiting
 */
function getClientKey(req) {
  return req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.ip || 'anonymous';
}

/**
 * Check rate limit status
 */
function checkRateLimit(key, feature, plan = 'free') {
  const limits = RATE_LIMITS[plan]?.[feature] || RATE_LIMITS.free[feature] || { perHour: 5, perDay: 10 };

  // Unlimited plan
  if (limits.perHour === -1) return { allowed: true, remaining: -1 };

  const now = Date.now();
  const hourAgo = now - 3600000;
  const dayAgo = now - 86400000;

  const storeKey = `${key}:${feature}`;
  let usage = rateLimitStore.get(storeKey) || { timestamps: [] };

  // Clean old entries
  usage.timestamps = usage.timestamps.filter(ts => ts > dayAgo);

  const usageLastHour = usage.timestamps.filter(ts => ts > hourAgo).length;
  const usageLastDay = usage.timestamps.length;

  if (usageLastHour >= limits.perHour) {
    return { allowed: false, reason: 'hourly_limit', message: 'Hourly limit reached. Please try again later.' };
  }

  if (usageLastDay >= limits.perDay) {
    return { allowed: false, reason: 'daily_limit', message: 'Daily limit reached. Upgrade to Pro for more usage.' };
  }

  return {
    allowed: true,
    remaining: { hourly: limits.perHour - usageLastHour, daily: limits.perDay - usageLastDay }
  };
}

/**
 * Record usage for rate limiting
 */
function recordUsage(key, feature) {
  const storeKey = `${key}:${feature}`;
  let usage = rateLimitStore.get(storeKey) || { timestamps: [] };
  usage.timestamps.push(Date.now());
  rateLimitStore.set(storeKey, usage);
}

/**
 * AI endpoint rate limiter middleware
 */
function aiRateLimiter(feature) {
  return (req, res, next) => {
    const key = getClientKey(req);
    const plan = req.headers['x-user-plan'] || 'free';
    const check = checkRateLimit(key, feature, plan);

    if (!check.allowed) {
      logger.warn('Rate limit exceeded', { key: key.substring(0, 8), feature, reason: check.reason });
      return res.status(429).json({
        error: 'Rate limit exceeded',
        message: check.message,
        reason: check.reason,
        upgrade_url: 'https://remodely.ai/pricing'
      });
    }

    // Record usage after successful response
    res.on('finish', () => {
      if (res.statusCode < 400) {
        recordUsage(key, feature);
      }
    });

    next();
  };
}

/**
 * General public endpoint rate limiter
 */
function publicRateLimiter(options = {}) {
  const { maxRequests = 10, windowMs = 60000, message = 'Too many requests' } = options;

  return (req, res, next) => {
    const ip = getClientKey(req);
    const key = `${ip}:${req.path}`;
    const now = Date.now();

    let record = publicRateLimitStore.get(key) || { timestamps: [] };
    record.timestamps = record.timestamps.filter(ts => ts > now - windowMs);

    if (record.timestamps.length >= maxRequests) {
      logger.warn('Public rate limit exceeded', { ip: ip.substring(0, 8), path: req.path });
      return res.status(429).json({
        error: 'Rate limit exceeded',
        message: message,
        retryAfter: Math.ceil((record.timestamps[0] + windowMs - now) / 1000)
      });
    }

    record.timestamps.push(now);
    publicRateLimitStore.set(key, record);
    next();
  };
}

// Pre-configured rate limiters for common use cases
const leadRateLimiter = publicRateLimiter({
  maxRequests: 5,
  windowMs: 60000,
  message: 'Too many lead submissions. Please wait a minute.'
});

const emailRateLimiter = publicRateLimiter({
  maxRequests: 3,
  windowMs: 60000,
  message: 'Too many email requests. Please wait a minute.'
});

const customerRateLimiter = publicRateLimiter({
  maxRequests: 10,
  windowMs: 60000,
  message: 'Too many requests. Please wait.'
});

const bookingRateLimiter = publicRateLimiter({
  maxRequests: 5,
  windowMs: 300000, // 5 minutes
  message: 'Too many booking requests. Please wait a few minutes before trying again.'
});

// Cleanup old entries every hour
setInterval(() => {
  const dayAgo = Date.now() - 86400000;

  for (const [key, usage] of rateLimitStore.entries()) {
    usage.timestamps = usage.timestamps.filter(ts => ts > dayAgo);
    if (usage.timestamps.length === 0) {
      rateLimitStore.delete(key);
    }
  }

  for (const [key, record] of publicRateLimitStore.entries()) {
    if (record.timestamps.length === 0 || record.timestamps[record.timestamps.length - 1] < dayAgo) {
      publicRateLimitStore.delete(key);
    }
  }
}, 3600000);

module.exports = {
  aiRateLimiter,
  publicRateLimiter,
  leadRateLimiter,
  emailRateLimiter,
  customerRateLimiter,
  bookingRateLimiter,
  getClientKey,
  RATE_LIMITS
};
