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
 * So: return to the host the request actually arrived on, when that host is
 * one we recognise. Both are the same deployment, so neither is more correct
 * than the other; what matters is not moving someone between them.
 *
 * ALLOWLISTED, never reflected blindly. `Host` is attacker-controllable, and
 * a redirect built from an unchecked one is an open redirect — doubly bad
 * here because this runs at the end of an OAuth flow. Anything unrecognised
 * falls back to NEXT_PUBLIC_APP_URL, which is the old behaviour.
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
  add("localhost");
  add("127.0.0.1");
  return out;
}

/** The origin to build post-OAuth redirects from. */
export function returnOrigin(request: Request): string {
  const fallback = (process.env.NEXT_PUBLIC_APP_URL ?? "").replace(/\/$/, "");
  let origin: URL;
  try {
    origin = new URL(request.url);
  } catch {
    return fallback;
  }
  const host = origin.hostname.toLowerCase();
  if (knownHosts().has(host)) {
    return `${origin.protocol}//${origin.host}`;
  }
  return fallback || `${origin.protocol}//${origin.host}`;
}
