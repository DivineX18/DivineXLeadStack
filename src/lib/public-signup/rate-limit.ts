import "server-only";

/**
 * In-memory per-IP rate limit for the public self-serve checkout endpoint
 * (`POST /api/public/checkout`). Same shape as
 * `lib/comms/web-chat/rate-limit.ts` — a sliding-window Map, self-pruning,
 * best-effort across Vercel instances. Generous cap: real buyers only ever
 * hit this once or twice (retrying after a cancelled checkout); this exists
 * to stop a script from spamming Stripe Checkout Session creation.
 */

const PER_IP_HOURLY_LIMIT = 10;
const PER_IP_WINDOW_MS = 60 * 60 * 1000;

interface IpRecord {
  count: number;
  windowStartedAt: number;
}

const ipBuckets = new Map<string, IpRecord>();

export interface CheckoutRateLimitResult {
  ok: boolean;
  /** Seconds until the IP bucket resets. 0 when ok. */
  retryAfterSec: number;
}

export function checkAndCount(ip: string): CheckoutRateLimitResult {
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
    ipBuckets.set(ip, bucket);
    return { ok: false, retryAfterSec };
  }

  bucket.count += 1;
  ipBuckets.set(ip, bucket);

  if (ipBuckets.size > 5000) {
    for (const [k, v] of ipBuckets) {
      if (now - v.windowStartedAt > PER_IP_WINDOW_MS) ipBuckets.delete(k);
    }
  }

  return { ok: true, retryAfterSec: 0 };
}
