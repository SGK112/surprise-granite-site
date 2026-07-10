/**
 * Public Rate Limiter Unit Tests
 *
 * Guards two bugs that reached production:
 *   1. entries were never deleted, leaking memory until the API was OOM-killed;
 *   2. the first cap attempt only swept EXPIRED entries, so a burst of distinct
 *      IPs inside one window blew straight past it.
 */

const {
  publicRateLimiter,
  publicRateLimitStore,
  sweepPublicRateLimit,
  PUBLIC_RL_MAX_KEYS,
  sweepTimer,
} = require('../../middleware/publicRateLimiter');

// Drive the sliding window off a fake clock; real sleeps would make this slow
// and flaky.
let now;
beforeAll(() => { jest.spyOn(Date, 'now').mockImplementation(() => now); });
afterAll(() => { Date.now.mockRestore(); clearInterval(sweepTimer); });
beforeEach(() => { now = 1_000_000; publicRateLimitStore.clear(); });

/** Run the middleware once; resolves 'ok' if allowed, '429' if limited. */
const request = (mw, ip, path = '/api/leads') => new Promise((resolve) => {
  const req = { headers: {}, ip, path };
  const res = { status: () => ({ json: () => resolve('429') }) };
  mw(req, res, () => resolve('ok'));
});

describe('publicRateLimiter', () => {
  it('allows up to maxRequests then blocks within the window', async () => {
    const mw = publicRateLimiter({ maxRequests: 3, windowMs: 60000 });
    const results = [];
    for (let i = 0; i < 5; i++) results.push(await request(mw, '9.9.9.9'));
    expect(results).toEqual(['ok', 'ok', 'ok', '429', '429']);
  });

  it('lets a client through again once its window has passed', async () => {
    const mw = publicRateLimiter({ maxRequests: 1, windowMs: 60000 });
    expect(await request(mw, '9.9.9.9')).toBe('ok');
    expect(await request(mw, '9.9.9.9')).toBe('429');
    now += 60_001;
    expect(await request(mw, '9.9.9.9')).toBe('ok');
  });

  it('limits each ip:path pair independently', async () => {
    const mw = publicRateLimiter({ maxRequests: 1, windowMs: 60000 });
    expect(await request(mw, '1.1.1.1', '/api/leads')).toBe('ok');
    expect(await request(mw, '1.1.1.1', '/api/email')).toBe('ok');
    expect(await request(mw, '2.2.2.2', '/api/leads')).toBe('ok');
    expect(await request(mw, '1.1.1.1', '/api/leads')).toBe('429');
  });
});

describe('sweepPublicRateLimit', () => {
  it('deletes entries whose window has expired', async () => {
    const mw = publicRateLimiter({ maxRequests: 5, windowMs: 60000 });
    for (let i = 0; i < 500; i++) await request(mw, `10.0.1.${i % 256}-${i}`);
    expect(publicRateLimitStore.size).toBe(500);

    now += 60_001;
    sweepPublicRateLimit();
    expect(publicRateLimitStore.size).toBe(0);
  });

  it('keeps clients that are still inside their window', async () => {
    const mw = publicRateLimiter({ maxRequests: 5, windowMs: 60000 });
    await request(mw, 'old.client');
    now += 60_001;
    await request(mw, 'live.client');

    sweepPublicRateLimit();
    expect([...publicRateLimitStore.keys()]).toEqual(['live.client:/api/leads']);
  });

  it('caps the store when every entry is live, evicting least-recently-active', async () => {
    const mw = publicRateLimiter({ maxRequests: 5, windowMs: 60000 });
    // No clock advance: expiry can free nothing, so only eviction can hold the
    // line. This is the case the first cap attempt failed.
    for (let i = 0; i < PUBLIC_RL_MAX_KEYS + 500; i++) await request(mw, `burst-${i}`);

    expect(publicRateLimitStore.size).toBeLessThanOrEqual(PUBLIC_RL_MAX_KEYS);

    // The newest arrival must survive; the oldest must be the one dropped.
    expect(publicRateLimitStore.has(`burst-${PUBLIC_RL_MAX_KEYS + 499}:/api/leads`)).toBe(true);
    expect(publicRateLimitStore.has('burst-0:/api/leads')).toBe(false);
  });
});
