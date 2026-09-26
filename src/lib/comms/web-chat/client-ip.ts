import "server-only";

/**
 * Client IP for rate limiting the public chat.
 *
 * The old helper trusted the FIRST X-Forwarded-For entry, which is whatever the
 * client chose to send, so a per-IP limit could be dodged by inventing a new
 * value per request. In production every request reaches us through
 * Cloudflare, which overwrites CF-Connecting-IP with the real peer address and
 * never forwards a client-supplied one, so that header is the trustworthy
 * source. X-Forwarded-For is only a development fallback (no Cloudflare in
 * front of a local server).
 */
export function trustedClientIp(headers: Headers): string {
  const cf = headers.get("cf-connecting-ip")?.trim();
  if (cf) return cf.slice(0, 64);
  if (process.env.NODE_ENV !== "production") {
    const first = headers.get("x-forwarded-for")?.split(",")[0]?.trim();
    if (first) return first.slice(0, 64);
  }
  return "unknown";
}
