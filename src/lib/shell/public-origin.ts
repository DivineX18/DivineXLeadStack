import "server-only";

/**
 * NEVER BUILD A CUSTOMER-FACING REDIRECT FROM `request.url`.
 *
 * On Render this app is behind a proxy and binds to an internal port, so
 * `request.url` is `https://localhost:10000/...`. Next's `NextResponse
 * .redirect(new URL(path, request.url))` therefore emits an absolute URL
 * pointing at the container's own loopback address. A real customer clicking
 * Operations was sent to
 *
 *   https://localhost:10000/auth/sso/error?reason=network_error
 *
 * and their browser refused the connection. Reproduced deterministically in
 * production on BOTH customer hosts before this fix.
 *
 * The public host is the one the customer actually typed, which arrives in
 * `x-forwarded-host` (or `host`). Using it also keeps them on the surface
 * they came from — this app serves two customer domains, so hardcoding one
 * would bounce half of them across origins mid-handoff.
 */

/** Our own customer-facing hosts. Anything else is refused rather than
 *  trusted, because these headers are attacker-controllable and an open
 *  redirect here would hand over an SSO leg. */
function isOwnHost(host: string): boolean {
  const h = host.toLowerCase().split(":")[0];
  return h === "divinex.io" || h.endsWith(".divinex.io");
}

function configuredOrigin(): string | null {
  const raw = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (!raw) return null;
  try {
    const u = new URL(raw);
    // A local dev value must never become a production redirect target.
    return u.hostname === "localhost" || u.hostname === "127.0.0.1" ? null : u.origin;
  } catch {
    return null;
  }
}

/**
 * The origin to build customer-facing redirects from.
 *
 * Order: the forwarded host when it is one of ours, then the configured app
 * URL, and only then the request's own origin — which is the loopback value
 * this exists to avoid, kept solely so local development still works.
 */
export function publicOriginOf(request: Request): string {
  const h = request.headers;
  const forwarded = (h.get("x-forwarded-host") ?? h.get("host") ?? "").split(",")[0].trim();
  if (forwarded && isOwnHost(forwarded)) {
    const proto = (h.get("x-forwarded-proto") ?? "https").split(",")[0].trim();
    return `${proto === "http" ? "http" : "https"}://${forwarded}`;
  }
  const configured = configuredOrigin();
  if (configured) return configured;
  return new URL(request.url).origin;
}

/** Build an absolute, customer-reachable URL for `path` on this request's
 *  own public origin. */
export function publicUrl(request: Request, path: string): URL {
  return new URL(path, publicOriginOf(request));
}
