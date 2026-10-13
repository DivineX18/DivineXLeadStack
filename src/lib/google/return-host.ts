import "server-only";

/**
 * Where to send the operator back to after the Google OAuth round trip.
 *
 * The problem this solves: NEXT_PUBLIC_APP_URL is https://crm.divinex.io, but
 * the people connecting Google are on https://app.divinex.io. Building the
 * return URL from that env var bounced them out of Ascend and into Flow
 * mid-flow — and because the two hosts hold separate sessions, it presented
 * as "it made me log in again" rather than as a redirect.
 *
 * READ THE FORWARDED HOST, NOT request.url. Behind Render's proxy the server
 * is bound to an internal address, so `new URL(request.url).origin` is
 * `http://localhost:10000` — the container's own port, not the hostname the
 * browser used. A first attempt at this redirected real users there, which
 * failed with ERR_CONNECTION_REFUSED *after* a successful OAuth exchange: the
 * connection was saved, and the operator saw a dead page. The public hostname
 * only exists in x-forwarded-host / host.
 *
 * ALLOWLISTED, never reflected blindly. Those headers are attacker-
 * controllable, and a redirect built from an unchecked one is an open
 * redirect — doubly bad at the end of an OAuth flow. Anything unrecognised
 * falls back to NEXT_PUBLIC_APP_URL.
 */

function knownHosts(): Set<string> {
  const out = new Set<string>();
  const add = (h: string | undefined) => {
    const v = h?.trim().toLowerCase();
    if (v) out.add(v);
  };
  try {
    if (process.env.NEXT_PUBLIC_APP_URL) {
      add(new URL(process.env.NEXT_PUBLIC_APP_URL).hostname);
    }
  } catch {
    // A malformed app URL must not take the allowlist down with it.
  }
  // Same env the middleware's custom-domain guard reads, so the two cannot
  // disagree about which hostnames belong to this deployment.
  for (const h of (process.env.SAFE_APP_HOSTNAMES ?? "").split(",")) add(h);

  // Local dev ONLY. In production these resolve to the container itself, which
  // is exactly the dead end this module exists to prevent — a browser sent to
  // localhost reaches its own machine, not the server.
  if (process.env.NODE_ENV !== "production") {
    add("localhost");
    add("127.0.0.1");
  }
  return out;
}

/** The public hostname the browser actually used, per the proxy. */
function forwardedHost(request: Request): string | null {
  // x-forwarded-host wins: `host` is the internal bind address behind a proxy.
  const raw =
    request.headers.get("x-forwarded-host") ?? request.headers.get("host") ?? "";
  // A comma-joined chain means several proxies; the FIRST entry is the
  // client-facing one.
  const first = raw.split(",")[0]?.trim().toLowerCase();
  if (!first) return null;
  // Strip the port for the allowlist comparison; it is re-added below.
  return first;
}

/** The origin to build post-OAuth redirects from. */
export function returnOrigin(request: Request): string {
  const fallback = (process.env.NEXT_PUBLIC_APP_URL ?? "").replace(/\/$/, "");

  const hostWithPort = forwardedHost(request);
  if (!hostWithPort) return fallback;

  const hostname = hostWithPort.split(":")[0];
  if (!knownHosts().has(hostname)) return fallback;

  const proto =
    request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim() ||
    (hostname === "localhost" || hostname === "127.0.0.1" ? "http" : "https");

  return `${proto}://${hostWithPort}`;
}
