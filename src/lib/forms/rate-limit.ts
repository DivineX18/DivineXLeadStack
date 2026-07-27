import "server-only";

/**
 * In-memory per-IP rate limit for the public form-submission endpoint
 * (`/api/forms/[id]/submit`). Without this, a scripted attacker with a form
 * ID (visible in any embedded snippet) could submit unlimited times,
 * creating unbounded Contacts and firing real Speed-to-Lead SMS/email sends
 * per submission — a real cost-amplification and spam vector, not just a
 * data-quality one.
 *
 * Same tradeoff as lib/comms/web-chat/rate-limit.ts: in-memory is
 * best-effort per serverless instance, not a hard global cap. Swap for
 * Upstash Redis with the same interface if abuse is observed in practice.
 */

const PER_IP_HOURLY_LIMIT = 30;
const PER_IP_WINDOW_MS = 60 * 60 * 1000;

interface IpRecord {
  count: number;
  windowStartedAt: number;
}

const ipBuckets = new Map<string, IpRecord>();

export interface FormRateLimitResult {
  ok: boolean;
  retryAfterSec: number;
}

export function checkFormSubmitRateLimit(ip: string): FormRateLimitResult {
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
