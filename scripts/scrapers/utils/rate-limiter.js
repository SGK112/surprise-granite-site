/**
 * Rate Limiter
 * Controls request timing to avoid overwhelming vendor sites
 */

class RateLimiter {
  constructor(options = {}) {
    this.minDelay = options.minDelay || 1500; // 1.5 seconds default
    this.maxDelay = options.maxDelay || 3000;
    this.lastRequestTime = 0;
    this.requestCount = 0;
    this.errors = 0;
  }

  /**
   * Wait before making next request
   */
  async wait() {
    const now = Date.now();
    const elapsed = now - this.lastRequestTime;
    const delay = this.calculateDelay();

    if (elapsed < delay) {
      await new Promise(resolve => setTimeout(resolve, delay - elapsed));
    }

    this.lastRequestTime = Date.now();
    this.requestCount++;
  }

  /**
   * Calculate delay based on error rate
   */
  calculateDelay() {
    // Increase delay if we're getting errors
    const errorRate = this.requestCount > 0 ? this.errors / this.requestCount : 0;
    const baseDelay = this.minDelay + Math.random() * (this.maxDelay - this.minDelay);

    if (errorRate > 0.3) {
      return baseDelay * 3; // Triple delay if 30%+ errors
    } else if (errorRate > 0.1) {
      return baseDelay * 2; // Double delay if 10%+ errors
    }

    return baseDelay;
  }

  /**
   * Record an error
   */
  recordError() {
    this.errors++;
  }

  /**
   * Reset counters
   */
  reset() {
    this.requestCount = 0;
    this.errors = 0;
    this.lastRequestTime = 0;
  }

  /**
   * Get stats
   */
  getStats() {
    return {
      requestCount: this.requestCount,
      errors: this.errors,
      errorRate: this.requestCount > 0 ? (this.errors / this.requestCount * 100).toFixed(1) + '%' : '0%'
    };
  }
}

module.exports = RateLimiter;
