import "server-only";

/**
 * In-memory per-IP rate limit for the public marketing contact form
 * (/api/public/contact) — a fresh, dedicated counter from
 * lib/forms/rate-limit.ts's (which is scoped to /api/forms/[id]/submit)
 * so the two public-endpoint abuse budgets can't interfere with each
 * other. Same in-memory-per-instance tradeoff: best-effort, not a hard
 * global cap.
 */

const PER_IP_HOURLY_LIMIT = 10;
const PER_IP_WINDOW_MS = 60 * 60 * 1000;

interface IpRecord {
  count: number;
  windowStartedAt: number;
}

const ipBuckets = new Map<string, IpRecord>();

export function checkContactFormRateLimit(ip: string): { ok: boolean; retryAfterSec: number } {
  const now = Date.now();

  let bucket = ipBuckets.get(ip);
  if (!bucket || now - bucket.windowStartedAt > PER_IP_WINDOW_MS) {
    bucket = { count: 0, windowStartedAt: now };
  }

  if (bucket.count >= PER_IP_HOURLY_LIMIT) {
    const retryAfterSec = Math.max(1, Math.ceil((bucket.windowStartedAt + PER_IP_WINDOW_MS - now) / 1000));
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
