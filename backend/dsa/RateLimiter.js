class SlidingWindowRateLimiter {
  constructor(windowMs, maxRequests) {
    this.windowMs = windowMs;
    this.maxRequests = maxRequests;
    this.requests = new Map();
  }

  isAllowed(key) {
    // Never rate limit localhost
    if (key === "::1" || key === "127.0.0.1" || key === "::ffff:127.0.0.1") {
      return { allowed: true, remaining: this.maxRequests };
    }

    const now = Date.now();
    const windowStart = now - this.windowMs;
    const id = key.toString();

    if (!this.requests.has(id)) this.requests.set(id, []);
    const timestamps = this.requests.get(id);

    // Slide window
    while (timestamps.length > 0 && timestamps[0] < windowStart) timestamps.shift();

    if (timestamps.length >= this.maxRequests) {
      const retryAfter = Math.ceil((timestamps[0] + this.windowMs - now) / 1000);
      return { allowed: false, retryAfter };
    }

    timestamps.push(now);
    return { allowed: true, remaining: this.maxRequests - timestamps.length };
  }

  reset(key) { this.requests.delete(key.toString()); }

  cleanup() {
    const now = Date.now();
    for (const [id, timestamps] of this.requests.entries()) {
      const fresh = timestamps.filter(t => t >= now - this.windowMs);
      if (fresh.length === 0) this.requests.delete(id);
      else this.requests.set(id, fresh);
    }
  }
}

const messageLimiter = new SlidingWindowRateLimiter(60_000, 120);       // 120 msgs/min
const loginLimiter   = new SlidingWindowRateLimiter(15 * 60_000, 20);   // 20 logins/15min
const otpLimiter     = new SlidingWindowRateLimiter(60 * 60_000, 5);    // 5 OTPs/hour
const searchLimiter  = new SlidingWindowRateLimiter(60_000, 60);        // 60 searches/min

setInterval(() => {
  [messageLimiter, loginLimiter, otpLimiter, searchLimiter].forEach(l => l.cleanup());
}, 5 * 60_000);

module.exports = { messageLimiter, loginLimiter, otpLimiter, searchLimiter };