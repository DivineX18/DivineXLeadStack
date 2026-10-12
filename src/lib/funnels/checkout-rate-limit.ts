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

  // Bound the map. Every unique IP adds an entry that outlives its own window,
  // and this route is PUBLIC and unauthenticated — a crawler walking funnel
  // pages grows this without limit, in a process that is expected to run for
  // days. The three sibling limiters (lib/forms/rate-limit.ts,
  // lib/public-contact-rate-limit.ts, lib/api/rate-limit.ts) all prune; this
  // one was missed. Same threshold and same expired-only sweep as the others,
  // deliberately copied rather than re-invented.
  if (ipBuckets.size > 5000) {
    for (const [k, v] of ipBuckets) {
      if (now - v.windowStartedAt > PER_IP_WINDOW_MS) ipBuckets.delete(k);
    }
  }

  return { ok: true, retryAfterSec: 0 };
}
