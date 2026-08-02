import "server-only";

/**
 * In-memory per-IP rate limit for the public checkout-session-creation
 * route. Each call hits the tenant's real Stripe API, so an unbounded
 * attacker could both rack up API usage and spam Checkout Session
 * creation. Same in-memory-per-instance tradeoff as
 * lib/forms/rate-limit.ts / lib/comms/web-chat/rate-limit.ts.
 */

const PER_IP_HOURLY_LIMIT = 20;
const PER_IP_WINDOW_MS = 60 * 60 * 1000;

interface IpRecord {
  count: number;
  windowStartedAt: number;
}

const ipBuckets = new Map<string, IpRecord>();

export interface CheckoutRateLimitResult {
  ok: boolean;
  retryAfterSec: number;
}

export function checkCheckoutRateLimit(ip: string): CheckoutRateLimitResult {
  const now = Date.now();
  let bucket = ipBuckets.get(ip);
  if (!bucket || now - bucket.windowStartedAt > PER_IP_WINDOW_MS) {
    bucket = { count: 0, windowStartedAt: now };
  }
  if (bucket.count >= PER_IP_HOURLY_LIMIT) {
    const retryAfterSec = Math.max(
      1,
      Math.ceil((bucket.windowStartedAt + PER_IP_WINDOW_MS - now) / 1000),
    );
    return { ok: false, retryAfterSec };
  }
  bucket.count += 1;
  ipBuckets.set(ip, bucket);
  return { ok: true, retryAfterSec: 0 };
}
