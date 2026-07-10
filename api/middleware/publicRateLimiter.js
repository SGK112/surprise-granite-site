/**
 * Sliding-window rate limiter for unauthenticated endpoints.
 *
 * The store is keyed `ip:path` and used to grow forever: nothing ever deleted an
 * entry, so every distinct visitor left a permanent one. On a long-lived process
 * that is a slow leak, and it contributed to this API's repeated out-of-memory
 * restarts. Windows here are at most a minute, so anything older is dead weight.
 *
 * Lives in its own module so the eviction behaviour can be tested without
 * starting the server.
 */

const publicRateLimitStore = new Map();

// Swept every 5 minutes rather than hourly (as the API-key rateLimitStore is)
// because these windows are 60x shorter: an hour of accumulation is already 60
// windows of garbage.
const PUBLIC_RL_SWEEP_MS = 300000;
const PUBLIC_RL_MAX_WINDOW_MS = 60000;
// A burst of distinct IPs between sweeps is still unbounded, so cap the store.
// 50k entries is far above real traffic; reaching it means a scan or an attack.
const PUBLIC_RL_MAX_KEYS = 50000;

/**
 * `headroom` is the number of slots the caller is about to fill. Evicting down to
 * exactly the cap and then inserting would sit one over it forever.
 */
function sweepPublicRateLimit(headroom = 0) {
  const cutoff = Date.now() - PUBLIC_RL_MAX_WINDOW_MS;
  for (const [key, record] of publicRateLimitStore.entries()) {
    if (!record.timestamps.some(ts => ts > cutoff)) publicRateLimitStore.delete(key);
  }

  // Expiry alone cannot bound this. If 50k distinct IPs arrive inside one 60s
  // window — a port scan, a botnet — every entry is live and the sweep frees
  // nothing. Something has to give, and it should be memory rather than the
  // process. Drop the least-recently-active entries: those clients get a fresh
  // limit, which is a far smaller harm than an OOM restart that lifts the limit
  // for everyone. Real visitors are the most recently active, so they survive.
  const target = PUBLIC_RL_MAX_KEYS - headroom;
  if (publicRateLimitStore.size <= target) return;
  const byRecency = [...publicRateLimitStore.entries()]
    .map(([key, record]) => [key, Math.max(...record.timestamps)])
    .sort((a, b) => a[1] - b[1]);
  const excess = publicRateLimitStore.size - target;
  for (let i = 0; i < excess; i++) publicRateLimitStore.delete(byRecency[i][0]);
}

// unref so the timer never holds a test runner or a shutdown open.
const sweepTimer = setInterval(sweepPublicRateLimit, PUBLIC_RL_SWEEP_MS);
sweepTimer.unref?.();

function publicRateLimiter(options = {}) {
  const { maxRequests = 10, windowMs = 60000, message = 'Too many requests' } = options;

  return (req, res, next) => {
    const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.ip || 'unknown';
    const key = `${ip}:${req.path}`;
    const now = Date.now();

    let record = publicRateLimitStore.get(key) || { timestamps: [] };
    record.timestamps = record.timestamps.filter(ts => ts > now - windowMs);

    if (record.timestamps.length >= maxRequests) {
      return res.status(429).json({
        error: 'Rate limit exceeded',
        message: message,
        retryAfter: Math.ceil((record.timestamps[0] + windowMs - now) / 1000)
      });
    }

    record.timestamps.push(now);
    if (!publicRateLimitStore.has(key) && publicRateLimitStore.size >= PUBLIC_RL_MAX_KEYS) sweepPublicRateLimit(1);
    publicRateLimitStore.set(key, record);
    next();
  };
}

module.exports = {
  publicRateLimiter,
  publicRateLimitStore,
  sweepPublicRateLimit,
  PUBLIC_RL_MAX_KEYS,
  PUBLIC_RL_MAX_WINDOW_MS,
  sweepTimer,
};
